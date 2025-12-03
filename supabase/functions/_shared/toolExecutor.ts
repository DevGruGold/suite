import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logFunctionUsage } from './functionUsageLogger.ts';

/**
 * Analyze error to provide learning points for executives
 */
function analyzeLearningFromError(toolName: string, error: string, params: any): string {
  // Network errors
  if (error.includes('network') || error.includes('urllib') || error.includes('requests') || error.includes('http')) {
    return `❌ Python sandbox has no network access. For API calls, use invoke_edge_function instead of execute_python. Example: invoke_edge_function({ function_name: "github-integration", payload: {...} })`;
  }
  
  // Import errors
  if (error.includes('ModuleNotFoundError') || error.includes('ImportError')) {
    const match = error.match(/No module named '([^']+)'/);
    const moduleName = match ? match[1] : 'unknown';
    return `❌ Module '${moduleName}' not available in sandbox. Available: math, json, datetime, random, re, collections, itertools. For external APIs, use invoke_edge_function.`;
  }
  
  // Syntax errors
  if (error.includes('SyntaxError')) {
    return `❌ Python syntax error detected. Check code for typos, indentation, or invalid syntax. Validate code structure before calling execute_python.`;
  }
  
  // Parameter errors
  if (error.includes('missing') || error.includes('required')) {
    return `❌ Missing required parameter for ${toolName}. Check tool definition in ELIZA_TOOLS for required fields. Example: execute_python requires both 'code' and 'purpose'.`;
  }
  
  // JSON parse errors
  if (error.includes('JSON') || error.includes('parse')) {
    return `❌ Invalid JSON in tool arguments. Ensure proper escaping of quotes and valid JSON structure.`;
  }
  
  return `❌ Execution failed: ${error}. Review error details and adjust approach.`;
}

/**
 * Shared tool execution framework for all executives
 * Logs usage, routes to appropriate edge functions, handles errors with detailed learning points
 */
export async function executeToolCall(
  supabase: SupabaseClient,
  toolCall: any,
  executiveName: 'Eliza' | 'CSO' | 'CTO' | 'CIO' | 'CAO',
  SUPABASE_URL: string,
  SERVICE_ROLE_KEY: string,
  session_credentials?: any
): Promise<any> {
  const startTime = Date.now();
  const { name, arguments: args } = toolCall.function || toolCall;
  
  // Validate tool call structure
  if (!name) {
    await logFunctionUsage(supabase, {
      function_name: 'invalid_tool_call',
      executive_name: executiveName,
      success: false,
      execution_time_ms: Date.now() - startTime,
      error_message: 'Tool call missing function name',
      parameters: toolCall
    });
    return { 
      success: false, 
      error: 'Invalid tool call: missing function name',
      learning_point: 'Tool calls must include a function name. Check tool call structure.'
    };
  }
  
  // Parse arguments with detailed error feedback
  let parsedArgs;
  try {
    parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
  } catch (parseError) {
    await logFunctionUsage(supabase, {
      function_name: name,
      executive_name: executiveName,
      success: false,
      execution_time_ms: Date.now() - startTime,
      error_message: 'Failed to parse tool arguments',
      parameters: { raw_args: args, parse_error: parseError.message }
    });
    return { 
      success: false, 
      error: 'Invalid tool arguments: JSON parse failed',
      learning_point: 'Tool arguments must be valid JSON. Check syntax, ensure quotes are properly escaped, and validate JSON structure.'
    };
  }
  
  // Validate execute_python specific requirements
  if (name === 'execute_python') {
    if (!parsedArgs.code) {
      return {
        success: false,
        error: 'execute_python requires "code" parameter',
        learning_point: 'execute_python tool call must include: { code: "your_python_code", purpose: "description" }'
      };
    }
    if (!parsedArgs.purpose) {
      console.warn(`⚠️ execute_python called without purpose parameter by ${executiveName}`);
      parsedArgs.purpose = 'No purpose specified';
    }
  }
  
  console.log(`🔧 [${executiveName}] Executing tool: ${name}`, parsedArgs);
  
  try {
    let result: any;
    
    // Route tool calls to appropriate edge functions
    switch(name) {
      // ====================================================================
      // CONVERSATIONAL USER ACQUISITION TOOLS
      // ====================================================================
      case 'qualify_lead':
        console.log(`🎯 [${executiveName}] Qualify Lead`);
        const qualifyResult = await supabase.functions.invoke('qualify-lead', { body: parsedArgs });
        result = qualifyResult.error 
          ? { success: false, error: qualifyResult.error.message }
          : { success: true, result: qualifyResult.data };
        break;

      case 'identify_service_interest':
        console.log(`🔍 [${executiveName}] Identify Service Interest`);
        const interestResult = await supabase.functions.invoke('identify-service-interest', { body: parsedArgs });
        result = interestResult.error
          ? { success: false, error: interestResult.error.message }
          : { success: true, result: interestResult.data };
        break;

      case 'suggest_tier_based_on_needs':
        console.log(`💡 [${executiveName}] Suggest Pricing Tier`);
        const { estimated_monthly_usage, budget_range } = parsedArgs;
        let recommendedTier = 'free';
        let reasoning = '';

        if (estimated_monthly_usage <= 100) {
          recommendedTier = 'free';
          reasoning = 'Free tier (100 requests/mo) fits your estimated usage perfectly.';
        } else if (estimated_monthly_usage <= 1000) {
          recommendedTier = 'basic';
          reasoning = 'Basic tier ($10/mo, 1,000 requests) gives you 10x headroom for growth.';
        } else if (estimated_monthly_usage <= 10000) {
          recommendedTier = 'pro';
          reasoning = 'Pro tier ($50/mo, 10,000 requests) handles your volume with best value.';
        } else {
          recommendedTier = 'enterprise';
          reasoning = 'Enterprise tier ($500/mo, unlimited) for your high-volume needs.';
        }

        // Adjust for budget
        if (budget_range === 'budget-conscious' && recommendedTier === 'enterprise') {
          recommendedTier = 'pro';
          reasoning += ' Consider Pro tier as a cost-effective alternative.';
        }

        result = { 
          success: true, 
          result: { 
            recommended_tier: recommendedTier, 
            reasoning,
            monthly_cost: { free: 0, basic: 10, pro: 50, enterprise: 500 }[recommendedTier]
          } 
        };
        break;

      case 'create_user_profile_from_session':
        console.log(`👤 [${executiveName}] Create User Profile`);
        const profileResult = await supabase.functions.invoke('convert-session-to-user', { 
          body: { action: 'create_user_profile', ...parsedArgs }
        });
        result = profileResult.error
          ? { success: false, error: profileResult.error.message }
          : { success: true, result: profileResult.data };
        break;

      case 'generate_stripe_payment_link':
        console.log(`💳 [${executiveName}] Generate Payment Link`);
        const paymentResult = await supabase.functions.invoke('generate-stripe-link', { body: parsedArgs });
        result = paymentResult.error
          ? { success: false, error: paymentResult.error.message }
          : { success: true, result: paymentResult.data };
        break;

      case 'check_onboarding_progress':
        console.log(`📊 [${executiveName}] Check Onboarding Progress`);
        const { data: checkpoints } = await supabase
          .from('onboarding_checkpoints')
          .select('*')
          .eq('api_key', parsedArgs.api_key)
          .order('completed_at', { ascending: true });

        result = {
          success: true,
          result: {
            checkpoints: checkpoints || [],
            completed_count: checkpoints?.length || 0,
            activation_completed: checkpoints?.some(c => c.checkpoint === 'value_realized') || false,
          }
        };
        break;

      case 'send_usage_alert':
        console.log(`⚠️ [${executiveName}] Send Usage Alert`);
        const alertResult = await supabase.functions.invoke('usage-monitor', { 
          body: { api_key: parsedArgs.api_key, alert_type: parsedArgs.alert_type }
        });
        result = alertResult.error
          ? { success: false, error: alertResult.error.message }
          : { success: true, result: alertResult.data };
        break;

      case 'link_api_key_to_conversation':
        console.log(`🔗 [${executiveName}] Link API Key to Conversation`);
        const linkResult = await supabase.functions.invoke('convert-session-to-user', {
          body: { action: 'link_api_key_to_session', ...parsedArgs }
        });
        result = linkResult.error
          ? { success: false, error: linkResult.error.message }
          : { success: true, result: linkResult.data };
        break;

      case 'apply_retention_discount':
        console.log(`🎁 [${executiveName}] Apply Retention Discount`);
        // Update API key with discount metadata
        const { error: discountError } = await supabase
          .from('service_api_keys')
          .update({
            metadata: {
              discount_percent: parsedArgs.discount_percent,
              discount_duration_months: parsedArgs.duration_months,
              discount_applied_at: new Date().toISOString(),
            }
          })
          .eq('api_key', parsedArgs.api_key);

        result = discountError
          ? { success: false, error: discountError.message }
          : { 
              success: true, 
              result: { 
                discount_applied: true,
                message: `${parsedArgs.discount_percent}% discount applied for ${parsedArgs.duration_months} months`
              } 
            };
        break;

      // ====================================================================
      // EXISTING TOOLS
      // ====================================================================
      case 'invoke_edge_function':
      case 'call_edge_function':
        const { function_name, payload, body } = parsedArgs;
        const targetFunction = function_name || parsedArgs.function_name;
        const targetPayload = payload || body || {};
        
        console.log(`📡 [${executiveName}] Invoking edge function: ${targetFunction}`);
        const funcResult = await supabase.functions.invoke(targetFunction, { body: targetPayload });
        
        if (funcResult.error) {
          console.error(`❌ [${executiveName}] Edge function error:`, funcResult.error);
          result = { success: false, error: funcResult.error.message || 'Function execution failed' };
        } else {
          result = { success: true, result: funcResult.data };
        }
        break;
        
      case 'execute_python':
        const { code, purpose } = parsedArgs;
        console.log(`🐍 [${executiveName}] Execute Python - ${purpose || 'No purpose'}`);
        
        const pythonResult = await supabase.functions.invoke('python-executor', {
          body: { 
            code, 
            purpose,
            source: executiveName.toLowerCase() + '-executive',
            agent_id: executiveName.toLowerCase()
          }
        });
        
        if (pythonResult.error) {
          result = { success: false, error: pythonResult.error.message || 'Python execution failed' };
        } else {
          result = { success: true, result: pythonResult.data };
        }
        break;
        
      case 'get_my_feedback':
        const limit = parsedArgs.limit || 10;
        const unacknowledgedOnly = parsedArgs.unacknowledged_only !== false; // Default true
        const acknowledgeIds = parsedArgs.acknowledge_ids || [];
        
        console.log(`📚 [${executiveName}] Get my feedback - limit: ${limit}, unack only: ${unacknowledgedOnly}`);
        
        // Acknowledge specified feedback items first
        if (acknowledgeIds.length > 0) {
          await supabase
            .from('executive_feedback')
            .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
            .in('id', acknowledgeIds);
          console.log(`✅ [${executiveName}] Acknowledged ${acknowledgeIds.length} feedback items`);
        }
        
        // Fetch feedback
        let query = supabase
          .from('executive_feedback')
          .select('*')
          .eq('executive_name', executiveName)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        if (unacknowledgedOnly) {
          query = query.eq('acknowledged', false);
        }
        
        const { data: feedback, error: feedbackError } = await query;
        
        if (feedbackError) {
          result = { success: false, error: feedbackError.message };
        } else {
          result = { 
            success: true, 
            result: {
              feedback: feedback || [],
              count: feedback?.length || 0,
              acknowledged_count: acknowledgeIds.length
            }
          };
        }
        break;
        
      case 'createGitHubDiscussion':
        console.log(`📝 [${executiveName}] Create GitHub Discussion`);
        
        // Derive executive from executiveName if not explicitly provided
        const discussionExec = parsedArgs.executive || 
          (executiveName?.toLowerCase()?.includes('strategy') ? 'cso' :
           executiveName?.toLowerCase()?.includes('technology') ? 'cto' :
           executiveName?.toLowerCase()?.includes('information') ? 'cio' :
           executiveName?.toLowerCase()?.includes('analytics') ? 'cao' : 'eliza');
        
        const discussionResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'create_discussion',
            data: {
              repositoryId: 'R_kgDONfvCEw',
              title: parsedArgs.title,
              body: parsedArgs.body,
              categoryId: parsedArgs.categoryId || 'DIC_kwDOPHeChc4CkXxI',
              executive: discussionExec
            },
            session_credentials
          }
        });
        
        if (discussionResult.error) {
          result = { success: false, error: discussionResult.error.message };
        } else {
          result = { success: true, result: discussionResult.data };
        }
        break;

      case 'createGitHubIssue':
        console.log(`🐛 [${executiveName}] Create GitHub Issue`);
        
        // Derive executive from executiveName if not explicitly provided
        const issueExec = parsedArgs.executive || 
          (executiveName?.toLowerCase()?.includes('strategy') ? 'cso' :
           executiveName?.toLowerCase()?.includes('technology') ? 'cto' :
           executiveName?.toLowerCase()?.includes('information') ? 'cio' :
           executiveName?.toLowerCase()?.includes('analytics') ? 'cao' : 'eliza');
        
        const issueResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'create_issue',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              title: parsedArgs.title,
              body: parsedArgs.body,
              labels: parsedArgs.labels || [],
              executive: issueExec
            },
            session_credentials
          }
        });
        
        if (issueResult.error) {
          result = { success: false, error: issueResult.error.message };
        } else {
          result = { success: true, result: issueResult.data };
        }
        break;

      case 'commentOnGitHubIssue':
        console.log(`💬 [${executiveName}] Comment on GitHub Issue #${parsedArgs.issue_number}`);
        
        // Derive executive from executiveName if not explicitly provided
        const commentExec = parsedArgs.executive || 
          (executiveName?.toLowerCase()?.includes('strategy') ? 'cso' :
           executiveName?.toLowerCase()?.includes('technology') ? 'cto' :
           executiveName?.toLowerCase()?.includes('information') ? 'cio' :
           executiveName?.toLowerCase()?.includes('analytics') ? 'cao' : 'eliza');
        
        const commentResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'comment_on_issue',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              issue_number: parsedArgs.issue_number,
              comment: parsedArgs.comment,
              executive: commentExec
            },
            session_credentials
          }
        });
        
        if (commentResult.error) {
          result = { success: false, error: commentResult.error.message };
        } else {
          result = { success: true, result: commentResult.data };
        }
        break;

      case 'listGitHubIssues':
        console.log(`📋 [${executiveName}] List GitHub Issues`);
        
        const listResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'list_issues',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              state: parsedArgs.state || 'open',
              per_page: parsedArgs.limit || 20
            },
            session_credentials
          }
        });
        
        if (listResult.error) {
          result = { success: false, error: listResult.error.message };
        } else {
          result = { success: true, result: listResult.data };
        }
        break;

      // ====================================================================
      // GITHUB PULL REQUEST TOOLS
      // ====================================================================
      case 'createGitHubPullRequest':
        console.log(`🔄 [${executiveName}] Create GitHub PR: ${parsedArgs.title}`);
        const createPRResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'create_pull_request',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              title: parsedArgs.title,
              body: parsedArgs.body,
              head: parsedArgs.head,
              base: parsedArgs.base || 'main',
              draft: parsedArgs.draft || false
            },
            session_credentials
          }
        });
        result = createPRResult.error
          ? { success: false, error: createPRResult.error.message }
          : { success: true, result: createPRResult.data };
        break;

      case 'listGitHubPullRequests':
        console.log(`📋 [${executiveName}] List GitHub PRs`);
        const listPRResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'list_pull_requests',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              state: parsedArgs.state || 'open'
            },
            session_credentials
          }
        });
        result = listPRResult.error
          ? { success: false, error: listPRResult.error.message }
          : { success: true, result: listPRResult.data };
        break;

      case 'mergeGitHubPullRequest':
        console.log(`✅ [${executiveName}] Merge GitHub PR #${parsedArgs.pull_number}`);
        const mergePRResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'merge_pull_request',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              pull_number: parsedArgs.pull_number,
              merge_method: parsedArgs.merge_method || 'squash',
              commit_title: parsedArgs.commit_title,
              commit_message: parsedArgs.commit_message
            },
            session_credentials
          }
        });
        result = mergePRResult.error
          ? { success: false, error: mergePRResult.error.message }
          : { success: true, result: mergePRResult.data };
        break;

      case 'closeGitHubPullRequest':
        console.log(`❌ [${executiveName}] Close GitHub PR #${parsedArgs.pull_number}`);
        const closePRResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'close_pull_request',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              pull_number: parsedArgs.pull_number
            },
            session_credentials
          }
        });
        result = closePRResult.error
          ? { success: false, error: closePRResult.error.message }
          : { success: true, result: closePRResult.data };
        break;

      // ====================================================================
      // GITHUB BRANCH TOOLS
      // ====================================================================
      case 'createGitHubBranch':
        console.log(`🌿 [${executiveName}] Create GitHub Branch: ${parsedArgs.branch_name}`);
        const createBranchResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'create_branch',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              branch_name: parsedArgs.branch_name,
              from_branch: parsedArgs.from_branch || 'main'
            },
            session_credentials
          }
        });
        result = createBranchResult.error
          ? { success: false, error: createBranchResult.error.message }
          : { success: true, result: createBranchResult.data };
        break;

      case 'listGitHubBranches':
        console.log(`📋 [${executiveName}] List GitHub Branches`);
        const listBranchesResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'list_branches',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem'
            },
            session_credentials
          }
        });
        result = listBranchesResult.error
          ? { success: false, error: listBranchesResult.error.message }
          : { success: true, result: listBranchesResult.data };
        break;

      case 'getGitHubBranchInfo':
        console.log(`🔍 [${executiveName}] Get GitHub Branch Info: ${parsedArgs.branch}`);
        const branchInfoResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'get_branch_info',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              branch: parsedArgs.branch
            },
            session_credentials
          }
        });
        result = branchInfoResult.error
          ? { success: false, error: branchInfoResult.error.message }
          : { success: true, result: branchInfoResult.data };
        break;

      // ====================================================================
      // GITHUB FILE & CODE TOOLS
      // ====================================================================
      case 'getGitHubFileContent':
        console.log(`📄 [${executiveName}] Get GitHub File: ${parsedArgs.path}`);
        const getFileResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'get_file_content',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              path: parsedArgs.path,
              ref: parsedArgs.ref || 'main'
            },
            session_credentials
          }
        });
        result = getFileResult.error
          ? { success: false, error: getFileResult.error.message }
          : { success: true, result: getFileResult.data };
        break;

      case 'commitGitHubFile':
        console.log(`📝 [${executiveName}] Commit GitHub File: ${parsedArgs.path}`);
        const commitFileResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'commit_file',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              path: parsedArgs.path,
              content: parsedArgs.content,
              message: parsedArgs.message,
              branch: parsedArgs.branch || 'main',
              sha: parsedArgs.sha
            },
            session_credentials
          }
        });
        result = commitFileResult.error
          ? { success: false, error: commitFileResult.error.message }
          : { success: true, result: commitFileResult.data };
        break;

      case 'deleteGitHubFile':
        console.log(`🗑️ [${executiveName}] Delete GitHub File: ${parsedArgs.path}`);
        const deleteFileResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'delete_file',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              path: parsedArgs.path,
              message: parsedArgs.message,
              branch: parsedArgs.branch || 'main',
              sha: parsedArgs.sha
            },
            session_credentials
          }
        });
        result = deleteFileResult.error
          ? { success: false, error: deleteFileResult.error.message }
          : { success: true, result: deleteFileResult.data };
        break;

      case 'listGitHubFiles':
        console.log(`📂 [${executiveName}] List GitHub Files: ${parsedArgs.path || '/'}`);
        const listFilesResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'list_files',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              path: parsedArgs.path || '',
              ref: parsedArgs.ref || 'main'
            },
            session_credentials
          }
        });
        result = listFilesResult.error
          ? { success: false, error: listFilesResult.error.message }
          : { success: true, result: listFilesResult.data };
        break;

      case 'searchGitHubCode':
        console.log(`🔍 [${executiveName}] Search GitHub Code: ${parsedArgs.query}`);
        const searchCodeResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'search_code',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              query: parsedArgs.query
            },
            session_credentials
          }
        });
        result = searchCodeResult.error
          ? { success: false, error: searchCodeResult.error.message }
          : { success: true, result: searchCodeResult.data };
        break;

      // ====================================================================
      // GITHUB WORKFLOW TOOLS
      // ====================================================================
      case 'trigger_github_workflow':
        console.log(`▶️ [${executiveName}] Trigger GitHub Workflow: ${parsedArgs.workflow_file}`);
        const triggerWorkflowResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'trigger_workflow',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              workflow_file: parsedArgs.workflow_file,
              ref: parsedArgs.ref || 'main',
              inputs: parsedArgs.inputs || {}
            },
            session_credentials
          }
        });
        result = triggerWorkflowResult.error
          ? { success: false, error: triggerWorkflowResult.error.message }
          : { success: true, result: triggerWorkflowResult.data };
        break;

      case 'createGitHubWorkflowFile':
        console.log(`📋 [${executiveName}] Create GitHub Workflow: ${parsedArgs.workflow_name}`);
        // Create workflow file in .github/workflows/ directory
        const workflowPath = `.github/workflows/${parsedArgs.workflow_name}.yml`;
        const createWorkflowResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'commit_file',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              path: workflowPath,
              content: parsedArgs.yaml_content,
              message: parsedArgs.commit_message || `Add workflow: ${parsedArgs.workflow_name}`,
              branch: parsedArgs.branch || 'main'
            },
            session_credentials
          }
        });
        result = createWorkflowResult.error
          ? { success: false, error: createWorkflowResult.error.message }
          : { success: true, result: { ...createWorkflowResult.data, workflow_path: workflowPath } };
        
      case 'list_available_functions':
        const functionsResult = await supabase.functions.invoke('list-available-functions', {
          body: { category: parsedArgs.category }
        });
        result = { success: true, result: functionsResult.data };
        break;
        
      case 'get_function_usage_analytics':
        const analyticsResult = await supabase.functions.invoke('function-usage-analytics', {
          body: parsedArgs
        });
        result = { success: true, result: analyticsResult.data };
        break;
        
      case 'propose_new_edge_function':
        const proposalResult = await supabase.functions.invoke('propose-new-edge-function', {
          body: { ...parsedArgs, proposed_by: executiveName }
        });
        result = { success: true, result: proposalResult.data };
        break;
        
      case 'vote_on_function_proposal':
        const voteResult = await supabase.functions.invoke('vote-on-proposal', {
          body: { ...parsedArgs, executive_name: executiveName }
        });
        result = { success: true, result: voteResult.data };
        break;
        
      case 'list_function_proposals':
        const proposalsResult = await supabase.functions.invoke('list-function-proposals', {
          body: parsedArgs
        });
        result = { success: true, result: proposalsResult.data };
        break;
        
      // Task-Orchestrator Tools
      case 'auto_assign_tasks':
        console.log(`🤖 [${executiveName}] Auto-assigning pending tasks to idle agents`);
        const assignResult = await supabase.functions.invoke('task-orchestrator', {
          body: { action: 'auto_assign_tasks', data: {} }
        });
        result = assignResult.error 
          ? { success: false, error: assignResult.error.message }
          : { success: true, result: assignResult.data };
        break;

      case 'rebalance_workload':
        console.log(`⚖️ [${executiveName}] Analyzing workload distribution`);
        const rebalanceResult = await supabase.functions.invoke('task-orchestrator', {
          body: { action: 'rebalance_workload', data: {} }
        });
        result = rebalanceResult.error
          ? { success: false, error: rebalanceResult.error.message }
          : { success: true, result: rebalanceResult.data };
        break;

      case 'identify_blockers':
        console.log(`🚧 [${executiveName}] Identifying blocked tasks`);
        const blockersResult = await supabase.functions.invoke('task-orchestrator', {
          body: { action: 'identify_blockers', data: {} }
        });
        result = blockersResult.error
          ? { success: false, error: blockersResult.error.message }
          : { success: true, result: blockersResult.data };
        break;

      case 'clear_blocked_tasks':
        console.log(`🧹 [${executiveName}] Clearing blocked tasks`);
        const clearResult = await supabase.functions.invoke('task-orchestrator', {
          body: { action: 'clear_all_blocked_tasks', data: {} }
        });
        result = clearResult.error
          ? { success: false, error: clearResult.error.message }
          : { success: true, result: clearResult.data };
        break;

      case 'bulk_update_task_status':
        console.log(`📦 [${executiveName}] Bulk updating task status`);
        const bulkResult = await supabase.functions.invoke('task-orchestrator', {
          body: {
            action: 'bulk_update_task_status',
            data: {
              task_ids: parsedArgs.task_ids,
              new_status: parsedArgs.new_status,
              new_stage: parsedArgs.new_stage
            }
          }
        });
        result = bulkResult.error
          ? { success: false, error: bulkResult.error.message }
          : { success: true, result: bulkResult.data };
        break;

      case 'get_task_performance_report':
        console.log(`📊 [${executiveName}] Generating task performance report`);
        const reportResult = await supabase.functions.invoke('task-orchestrator', {
          body: { action: 'performance_report', data: {} }
        });
        result = reportResult.error
          ? { success: false, error: reportResult.error.message }
          : { success: true, result: reportResult.data };
        break;

      // SuperDuper Agent Tools
      case 'consult_code_architect':
        console.log(`🏗️ [${executiveName}] Consulting Code Architect`);
        const codeArchResult = await supabase.functions.invoke('superduper-code-architect', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = codeArchResult.error
          ? { success: false, error: codeArchResult.error.message }
          : { success: true, result: codeArchResult.data };
        break;

      case 'consult_business_strategist':
        console.log(`📈 [${executiveName}] Consulting Business Strategist`);
        const bizResult = await supabase.functions.invoke('superduper-business-growth', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = bizResult.error
          ? { success: false, error: bizResult.error.message }
          : { success: true, result: bizResult.data };
        break;

      case 'consult_finance_expert':
        console.log(`💰 [${executiveName}] Consulting Finance Expert`);
        const financeResult = await supabase.functions.invoke('superduper-finance-investment', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = financeResult.error
          ? { success: false, error: financeResult.error.message }
          : { success: true, result: financeResult.data };
        break;

      case 'consult_communication_expert':
        console.log(`✉️ [${executiveName}] Consulting Communication Expert`);
        const commResult = await supabase.functions.invoke('superduper-communication-outreach', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = commResult.error
          ? { success: false, error: commResult.error.message }
          : { success: true, result: commResult.data };
        break;

      case 'consult_content_producer':
        console.log(`🎬 [${executiveName}] Consulting Content Producer`);
        const contentResult = await supabase.functions.invoke('superduper-content-media', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = contentResult.error
          ? { success: false, error: contentResult.error.message }
          : { success: true, result: contentResult.data };
        break;

      case 'consult_brand_designer':
        console.log(`🎨 [${executiveName}] Consulting Brand Designer`);
        const designResult = await supabase.functions.invoke('superduper-design-brand', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = designResult.error
          ? { success: false, error: designResult.error.message }
          : { success: true, result: designResult.data };
        break;

      case 'consult_career_coach':
        console.log(`🎯 [${executiveName}] Consulting Career Coach`);
        const coachResult = await supabase.functions.invoke('superduper-development-coach', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = coachResult.error
          ? { success: false, error: coachResult.error.message }
          : { success: true, result: coachResult.data };
        break;

      case 'consult_domain_specialist':
        console.log(`🌍 [${executiveName}] Consulting Domain Specialist`);
        const domainResult = await supabase.functions.invoke('superduper-domain-experts', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = domainResult.error
          ? { success: false, error: domainResult.error.message }
          : { success: true, result: domainResult.data };
        break;

      case 'consult_integration_specialist':
        console.log(`🔌 [${executiveName}] Consulting Integration Specialist`);
        const integrationResult = await supabase.functions.invoke('superduper-integration', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = integrationResult.error
          ? { success: false, error: integrationResult.error.message }
          : { success: true, result: integrationResult.data };
        break;

      case 'consult_research_analyst':
        console.log(`🔬 [${executiveName}] Consulting Research Analyst`);
        const researchResult = await supabase.functions.invoke('superduper-research-intelligence', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = researchResult.error
          ? { success: false, error: researchResult.error.message }
          : { success: true, result: researchResult.data };
        break;

      case 'consult_viral_content_expert':
        console.log(`🚀 [${executiveName}] Consulting Viral Content Expert`);
        const viralResult = await supabase.functions.invoke('superduper-social-viral', {
          body: { action: parsedArgs.action, params: { context: parsedArgs.context } }
        });
        result = viralResult.error
          ? { success: false, error: viralResult.error.message }
          : { success: true, result: viralResult.data };
        break;

      case 'route_to_superduper_agent':
        console.log(`🎯 [${executiveName}] Routing to SuperDuper specialist`);
        const routeResult = await supabase.functions.invoke('superduper-router', {
          body: { 
            request: parsedArgs.request,
            preferred_specialist: parsedArgs.preferred_specialist 
          }
        });
        result = routeResult.error
          ? { success: false, error: routeResult.error.message }
          : { success: true, result: routeResult.data };
        break;

      // ====================================================================
      // DIAGNOSTIC & ANALYTICS TOOLS
      // ====================================================================
      case 'get_edge_function_logs':
        console.log(`📋 [${executiveName}] Get Edge Function Logs: ${parsedArgs.function_name}`);
        const logsResult = await supabase.functions.invoke('get-edge-function-logs', {
          body: parsedArgs
        });
        result = logsResult.error
          ? { success: false, error: logsResult.error.message }
          : { success: true, result: logsResult.data };
        break;

      case 'get_function_version_analytics':
        console.log(`📊 [${executiveName}] Get Function Version Analytics: ${parsedArgs.function_name}`);
        const versionAnalyticsResult = await supabase.functions.invoke('get-function-version-analytics', {
          body: parsedArgs
        });
        result = versionAnalyticsResult.error
          ? { success: false, error: versionAnalyticsResult.error.message }
          : { success: true, result: versionAnalyticsResult.data };
        break;

      case 'get_tool_usage_analytics':
        console.log(`📈 [${executiveName}] Get Tool Usage Analytics`);
        const toolAnalyticsResult = await supabase.functions.invoke('tool-usage-analytics', {
          body: parsedArgs
        });
        result = toolAnalyticsResult.error
          ? { success: false, error: toolAnalyticsResult.error.message }
          : { success: true, result: toolAnalyticsResult.data };
        break;

      // ====================================================================
      // SYSTEM HEALTH & MONITORING TOOLS (FIXED)
      // ====================================================================
      case 'check_system_status':
      case 'check_ecosystem_health':
      case 'generate_health_report':
        console.log(`🩺 [${executiveName}] System Health Check: ${name}`);
        const healthResult = await supabase.functions.invoke('system-status', { 
          body: { action: name, ...parsedArgs } 
        });
        result = healthResult.error
          ? { success: false, error: healthResult.error.message }
          : { success: true, result: healthResult.data };
        break;

      // ====================================================================
      // CODE EXECUTION TOOLS (FIXED)
      // ====================================================================
      case 'run_code':
        // Alias for execute_python
        console.log(`🐍 [${executiveName}] Run Code (alias for execute_python)`);
        const runCodeResult = await supabase.functions.invoke('python-executor', {
          body: { 
            code: parsedArgs.code, 
            purpose: parsedArgs.purpose || 'Code execution via run_code',
            source: executiveName.toLowerCase() + '-executive',
            agent_id: executiveName.toLowerCase()
          }
        });
        result = runCodeResult.error
          ? { success: false, error: runCodeResult.error.message }
          : { success: true, result: runCodeResult.data };
        break;

      // ====================================================================
      // MCP & PATENT TOOLS (FIXED)
      // ====================================================================
      case 'search_uspto_patents':
        console.log(`🔍 [${executiveName}] USPTO Patent Search`);
        const patentResult = await supabase.functions.invoke('uspto-patent-mcp', {
          body: { action: 'search', ...parsedArgs }
        });
        result = patentResult.error
          ? { success: false, error: patentResult.error.message }
          : { success: true, result: patentResult.data };
        break;

      // ====================================================================
      // WORKFLOW TOOLS (FIXED)
      // ====================================================================
      case 'list_workflow_templates':
        console.log(`📋 [${executiveName}] List Workflow Templates`);
        const templatesResult = await supabase.functions.invoke('workflow-template-manager', {
          body: { action: 'list_templates', ...parsedArgs }
        });
        result = templatesResult.error
          ? { success: false, error: templatesResult.error.message }
          : { success: true, result: templatesResult.data };
        break;

      case 'execute_workflow_template':
        console.log(`▶️ [${executiveName}] Execute Workflow Template: ${parsedArgs.template_id}`);
        const workflowResult = await supabase.functions.invoke('workflow-template-manager', {
          body: { action: 'execute_template', ...parsedArgs }
        });
        result = workflowResult.error
          ? { success: false, error: workflowResult.error.message }
          : { success: true, result: workflowResult.data };
        break;

      // Agent management tools
      case 'list_agents':
      case 'spawn_agent':
      case 'update_agent_status':
      case 'assign_task':
      case 'list_tasks':
      case 'update_task_status':
      case 'delete_task':
      case 'get_agent_workload':
      case 'get_agent_by_name':
      case 'get_agent_stats':
      case 'batch_spawn_agents':
      case 'archive_agent':
        const agentResult = await supabase.functions.invoke('agent-manager', {
          body: { action: name.replace('_', '_').toLowerCase(), ...parsedArgs }
        });
        result = { success: true, result: agentResult.data };
        break;

      // ====================================================================
      // KNOWLEDGE MANAGEMENT TOOLS
      // ====================================================================
      case 'store_knowledge':
        console.log(`🧠 [${executiveName}] Store Knowledge: ${parsedArgs.name}`);
        const storeKnowledgeResult = await supabase.functions.invoke('knowledge-manager', {
          body: { action: 'store_knowledge', data: parsedArgs }
        });
        result = storeKnowledgeResult.error
          ? { success: false, error: storeKnowledgeResult.error.message }
          : { success: true, result: storeKnowledgeResult.data };
        break;

      case 'search_knowledge':
        console.log(`🔍 [${executiveName}] Search Knowledge: ${parsedArgs.search_term || parsedArgs.entity_type || 'all'}`);
        const searchKnowledgeResult = await supabase.functions.invoke('knowledge-manager', {
          body: { action: 'search_knowledge', data: parsedArgs }
        });
        result = searchKnowledgeResult.error
          ? { success: false, error: searchKnowledgeResult.error.message }
          : { success: true, result: searchKnowledgeResult.data };
        break;

      case 'create_knowledge_relationship':
        console.log(`🔗 [${executiveName}] Create Knowledge Relationship`);
        const createRelResult = await supabase.functions.invoke('knowledge-manager', {
          body: { action: 'create_relationship', data: parsedArgs }
        });
        result = createRelResult.error
          ? { success: false, error: createRelResult.error.message }
          : { success: true, result: createRelResult.data };
        break;

      case 'get_related_knowledge':
        console.log(`🕸️ [${executiveName}] Get Related Knowledge: ${parsedArgs.entity_id}`);
        const relatedResult = await supabase.functions.invoke('knowledge-manager', {
          body: { action: 'get_related_entities', data: parsedArgs }
        });
        result = relatedResult.error
          ? { success: false, error: relatedResult.error.message }
          : { success: true, result: relatedResult.data };
        break;

      case 'get_knowledge_status':
        console.log(`📊 [${executiveName}] Get Knowledge Status`);
        const statusResult = await supabase.functions.invoke('knowledge-manager', {
          body: { action: 'check_status', data: {} }
        });
        result = statusResult.error
          ? { success: false, error: statusResult.error.message }
          : { success: true, result: statusResult.data };
        break;

      case 'delete_knowledge':
        console.log(`🗑️ [${executiveName}] Delete Knowledge: ${parsedArgs.entity_id}`);
        const deleteKnowledgeResult = await supabase.functions.invoke('knowledge-manager', {
          body: { action: 'delete_knowledge', data: parsedArgs }
        });
        result = deleteKnowledgeResult.error
          ? { success: false, error: deleteKnowledgeResult.error.message }
          : { success: true, result: deleteKnowledgeResult.data };
        break;

      // ====================================================================
      // DEPLOYMENT AUTOMATION TOOLS
      // ====================================================================
      case 'deploy_approved_function':
        console.log(`🚀 [${executiveName}] Deploy Approved Function: ${parsedArgs.proposal_id}`);
        const deployResult = await supabase.functions.invoke('deploy-approved-edge-function', {
          body: { 
            action: 'deploy_single',
            proposal_id: parsedArgs.proposal_id,
            auto_deploy: parsedArgs.auto_deploy ?? true,
            run_health_check: parsedArgs.run_health_check ?? true,
            version_tag: parsedArgs.version_tag
          }
        });
        result = deployResult.error
          ? { success: false, error: deployResult.error.message }
          : { success: true, result: deployResult.data };
        break;

      case 'get_deployment_status':
        console.log(`📊 [${executiveName}] Get Deployment Status`);
        const statusDeployResult = await supabase.functions.invoke('deploy-approved-edge-function', {
          body: { 
            action: 'get_deployment_status',
            proposal_id: parsedArgs.proposal_id
          }
        });
        result = statusDeployResult.error
          ? { success: false, error: statusDeployResult.error.message }
          : { success: true, result: statusDeployResult.data };
        break;

      case 'rollback_deployment':
        console.log(`⏮️ [${executiveName}] Rollback Deployment: ${parsedArgs.proposal_id}`);
        const rollbackResult = await supabase.functions.invoke('deploy-approved-edge-function', {
          body: { 
            action: 'rollback',
            proposal_id: parsedArgs.proposal_id
          }
        });
        result = rollbackResult.error
          ? { success: false, error: rollbackResult.error.message }
          : { success: true, result: rollbackResult.data };
        break;

      case 'process_deployment_queue':
        console.log(`📋 [${executiveName}] Process Deployment Queue`);
        const queueResult = await supabase.functions.invoke('deploy-approved-edge-function', {
          body: { 
            action: 'process_queue',
            auto_deploy: parsedArgs.auto_deploy ?? true,
            run_health_check: parsedArgs.run_health_check ?? true
          }
        });
        result = queueResult.error
          ? { success: false, error: queueResult.error.message }
          : { success: true, result: queueResult.data };
        break;
        
      default:
        console.warn(`⚠️ [${executiveName}] Unknown tool: ${name}`);
        result = { 
          success: false, 
          error: `Unknown tool: ${name}. Available tools include: invoke_edge_function, execute_python, createGitHubIssue, list_agents, assign_task, check_system_status, get_tool_usage_analytics, store_knowledge, search_knowledge, deploy_approved_function, and more.`
        };
    }
    
    const executionTime = Date.now() - startTime;
    
    // Add learning point if there was an error
    if (result.error && !result.learning_point) {
      result.learning_point = analyzeLearningFromError(name, result.error, parsedArgs);
    }
    
    // Log function usage
    await logFunctionUsage(supabase, {
      function_name: name,
      executive_name: executiveName,
      invoked_by: 'tool_call',
      success: result.success !== false,
      execution_time_ms: executionTime,
      parameters: parsedArgs,
      result_summary: result.success ? 'Tool executed successfully' : result.error,
      metadata: result.learning_point ? { learning_point: result.learning_point } : undefined
    });
    
    return result;
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Tool execution failed';
    const learningPoint = analyzeLearningFromError(name, errorMessage, parsedArgs);
    
    console.error(`❌ [${executiveName}] Tool execution error for ${name}:`, error);
    
    // Log failed execution
    await logFunctionUsage(supabase, {
      function_name: name,
      executive_name: executiveName,
      invoked_by: 'tool_call',
      success: false,
      execution_time_ms: executionTime,
      parameters: parsedArgs,
      error_message: errorMessage,
      metadata: { learning_point: learningPoint }
    });
    
    return { 
      success: false, 
      error: errorMessage,
      learning_point: learningPoint
    };
  }
}