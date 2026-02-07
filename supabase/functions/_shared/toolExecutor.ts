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
  executiveName: 'Eliza' | 'CSO' | 'CTO' | 'CIO' | 'CAO' | 'COO' | string,
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

  // Parse arguments with detailed error feedback including expected schema
  let parsedArgs;
  try {
    parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
  } catch (parseError) {
    // Provide tool-specific expected schema in error messages
    const expectedSchemas: Record<string, string> = {
      'execute_python': '{ "code": "python_code_string", "purpose": "description_of_what_code_does" }',
      'assign_task': '{ "title": "string", "description": "string", "category": "code|infra|research|governance|mining|device|ops|other", "assignee_agent_id": "agent-xxx", "stage": "DISCUSS|PLAN|EXECUTE|VERIFY|INTEGRATE" }',
      'update_task_status': '{ "task_id": "uuid", "status": "PENDING|CLAIMED|IN_PROGRESS|BLOCKED|DONE|CANCELLED|COMPLETED|FAILED", "stage": "DISCUSS|PLAN|EXECUTE|VERIFY|INTEGRATE" }',
      'update_agent_status': '{ "agent_id": "agent-xxx", "status": "IDLE|BUSY|ARCHIVED|ERROR|OFFLINE" }',
      'createGitHubIssue': '{ "title": "string", "body": "string", "repo": "XMRT-Ecosystem", "labels": ["bug"] }',
      'invoke_edge_function': '{ "function_name": "string", "payload": {} }',
      'bulk_update_task_status': '{ "task_ids": ["uuid1", "uuid2"], "new_status": "PENDING|CLAIMED|IN_PROGRESS|BLOCKED|DONE|CANCELLED|COMPLETED|FAILED" }'
    };

    const expectedSchema = expectedSchemas[name] || 'Check tool definition for required parameters';

    await logFunctionUsage(supabase, {
      function_name: name,
      executive_name: executiveName,
      success: false,
      execution_time_ms: Date.now() - startTime,
      error_message: `Failed to parse tool arguments for ${name}`,
      parameters: { raw_args: args, parse_error: parseError.message, expected_schema: expectedSchema }
    });
    return {
      success: false,
      error: `Invalid tool arguments for ${name}: JSON parse failed. Expected format: ${expectedSchema}`,
      learning_point: `Tool ${name} requires valid JSON. Expected schema: ${expectedSchema}. Ensure quotes are escaped and JSON is valid.`
    };
  }

  // Validate execute_python specific requirements with syntax pre-checks
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

    // Pre-execution Python syntax validation to catch common issues
    const code = parsedArgs.code;
    const syntaxIssues: string[] = [];

    // Check for unterminated strings (common failure mode)
    const singleQuoteCount = (code.match(/(?<!\\)'/g) || []).length;
    const doubleQuoteCount = (code.match(/(?<!\\)"/g) || []).length;
    const tripleDoubleCount = (code.match(/"""/g) || []).length;
    const tripleSingleCount = (code.match(/'''/g) || []).length;

    // After removing triple quotes, check if remaining quotes are balanced
    const adjustedSingle = singleQuoteCount - (tripleSingleCount * 3);
    const adjustedDouble = doubleQuoteCount - (tripleDoubleCount * 3);

    if (adjustedSingle % 2 !== 0) {
      syntaxIssues.push("Unbalanced single quotes (') - possible unterminated string");
    }
    if (adjustedDouble % 2 !== 0) {
      syntaxIssues.push('Unbalanced double quotes (") - possible unterminated string');
    }

    // Check for network operations that will fail
    const networkPatterns = [
      { pattern: /urllib\.request/i, msg: "urllib.request detected - WILL FAIL (no network access)" },
      { pattern: /requests\.(get|post|put|delete)/i, msg: "requests module detected - WILL FAIL (no network access)" },
      { pattern: /socket\./i, msg: "socket module detected - WILL FAIL (no network access)" },
      { pattern: /urlopen\(/i, msg: "urlopen() detected - WILL FAIL (no network access)" },
      { pattern: /http\.client/i, msg: "http.client detected - WILL FAIL (no network access)" },
    ];

    for (const { pattern, msg } of networkPatterns) {
      if (pattern.test(code)) {
        syntaxIssues.push(msg);
      }
    }

    // Check for missing print statement (common issue - no output)
    if (!code.includes('print(') && !code.includes('print (')) {
      syntaxIssues.push("No print() statement - output may not be captured. Add print(result) at the end.");
    }

    // If critical issues found, return early with helpful guidance
    if (syntaxIssues.some(issue => issue.includes('WILL FAIL'))) {
      console.error(`🚫 [${executiveName}] Python pre-validation BLOCKED execution:`, syntaxIssues);
      return {
        success: false,
        error: `Python code blocked before execution due to: ${syntaxIssues.join('; ')}`,
        learning_point: `Python sandbox has NO network access. For HTTP/API calls, use invoke_edge_function instead. For computation only, remove network code and use pure Python.`,
        detected_issues: syntaxIssues
      };
    }

    // Log warnings but allow execution
    if (syntaxIssues.length > 0) {
      console.warn(`⚠️ [${executiveName}] Python pre-validation warnings:`, syntaxIssues);
    }
  }

  console.log(`🔧 [${executiveName}] Executing tool: ${name}`, parsedArgs);

  try {
    let result: any;

    // Route tool calls to appropriate edge functions
    switch (name) {
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
      case 'delegate_to_specialist': {
        // Map friendly roles to actual edge function names
        const agentMap: Record<string, string> = {
          'social-viral': 'superduper-social-viral',
          'code-architect': 'superduper-code-architect',
          'business-growth': 'superduper-business-growth',
          'finance-investment': 'superduper-finance-investment',
          'design-brand': 'superduper-design-brand',
          'content-media': 'superduper-content-media',
          'communication-outreach': 'superduper-communication-outreach',
          'research-intelligence': 'superduper-research-intelligence',
          'integration': 'superduper-integration',
          'development-coach': 'superduper-development-coach',
          'domain-experts': 'superduper-domain-experts'
        };

        const specialistFn = agentMap[args.specialist_role];
        if (!specialistFn) {
          throw new Error(`Unknown specialist role: ${args.specialist_role}`);
        }

        console.log(`🤝 Delegating task to ${specialistFn}...`);

        const { data, error } = await supabase.functions.invoke(specialistFn, {
          body: {
            action: 'process_task', // Standard action for SuperDuper agents
            params: {
              instruction: args.task_description,
              context: args.context_data || {}
            },
            // Pass the manager's context if available, or identity
            context: {
              manager: executiveName, // "Michael", "Gemmy", etc.
              delegated_at: new Date().toISOString()
            }
          }
        });

        if (error) throw error;
        return data;
      }

      case 'invoke_edge_function':
      case 'call_edge_function':
        let { function_name, payload, body } = parsedArgs;
        let targetFunction = function_name || parsedArgs.function_name;
        let targetPayload = payload || body || {};

        // Auto-correct common VSCO function name hallucinations
        // AI sometimes hallucinates "vsco-manage-events" instead of using vsco_manage_events tool
        if (targetFunction && (targetFunction.startsWith('vsco-manage-') || targetFunction.startsWith('vsco_manage_'))) {
          const entityType = targetFunction.replace(/^vsco[-_]manage[-_]/, '');
          console.warn(`⚠️ Auto-correcting hallucinated function "${targetFunction}" → vsco-workspace`);
          console.warn(`💡 Next time, use the dedicated tool: vsco_manage_${entityType}`);
          targetFunction = 'vsco-workspace';
          // Infer action from payload or default to list
          if (!targetPayload?.action) {
            targetPayload = { ...targetPayload, action: `list_${entityType}` };
          }
        }

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
      // GITHUB EVENT MONITORING TOOLS
      // ====================================================================
      case 'list_github_commits':
        console.log(`📝 [${executiveName}] List GitHub Commits`);
        const listCommitsResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'list_commits',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              author: parsedArgs.author,
              since: parsedArgs.since,
              until: parsedArgs.until,
              sha: parsedArgs.sha,
              path: parsedArgs.path,
              per_page: parsedArgs.per_page || 30
            },
            session_credentials
          }
        });
        result = listCommitsResult.error
          ? { success: false, error: listCommitsResult.error.message }
          : { success: true, result: listCommitsResult.data };
        break;

      case 'get_commit_details':
        console.log(`📦 [${executiveName}] Get Commit Details: ${parsedArgs.commit_sha}`);
        const commitDetailsResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'get_commit_details',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              commit_sha: parsedArgs.commit_sha
            },
            session_credentials
          }
        });
        result = commitDetailsResult.error
          ? { success: false, error: commitDetailsResult.error.message }
          : { success: true, result: commitDetailsResult.data };
        break;

      case 'list_repo_events':
        console.log(`📊 [${executiveName}] List Repo Events`);
        const repoEventsResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'list_repo_events',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              per_page: parsedArgs.per_page || 30
            },
            session_credentials
          }
        });
        result = repoEventsResult.error
          ? { success: false, error: repoEventsResult.error.message }
          : { success: true, result: repoEventsResult.data };
        break;

      case 'list_github_releases':
        console.log(`🏷️ [${executiveName}] List GitHub Releases`);
        const releasesResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'list_releases',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              per_page: parsedArgs.per_page || 30
            },
            session_credentials
          }
        });
        result = releasesResult.error
          ? { success: false, error: releasesResult.error.message }
          : { success: true, result: releasesResult.data };
        break;

      case 'list_github_contributors':
        console.log(`👥 [${executiveName}] List GitHub Contributors`);
        const contributorsResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'list_contributors',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              include_anonymous: parsedArgs.include_anonymous || false,
              per_page: parsedArgs.per_page || 30
            },
            session_credentials
          }
        });
        result = contributorsResult.error
          ? { success: false, error: contributorsResult.error.message }
          : { success: true, result: contributorsResult.data };
        break;

      case 'get_release_details':
        console.log(`🏷️ [${executiveName}] Get Release Details: ${parsedArgs.release_id || 'latest'}`);
        const releaseDetailsResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'get_release_details',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              release_id: parsedArgs.release_id || 'latest'
            },
            session_credentials
          }
        });
        result = releaseDetailsResult.error
          ? { success: false, error: releaseDetailsResult.error.message }
          : { success: true, result: releaseDetailsResult.data };
        break;

      case 'getGitHubIssueComments':
        console.log(`💬 [${executiveName}] Get Issue Comments: #${parsedArgs.issue_number}`);
        const issueCommentsResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'get_issue_comments',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              issue_number: parsedArgs.issue_number,
              per_page: parsedArgs.per_page || 30
            },
            session_credentials
          }
        });
        result = issueCommentsResult.error
          ? { success: false, error: issueCommentsResult.error.message }
          : { success: true, result: issueCommentsResult.data };
        break;

      case 'getGitHubDiscussionComments':
        console.log(`💬 [${executiveName}] Get Discussion Comments: #${parsedArgs.discussion_number}`);
        const discussionCommentsResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'get_discussion_comments',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              discussion_number: parsedArgs.discussion_number,
              first: parsedArgs.first || 30
            },
            session_credentials
          }
        });
        result = discussionCommentsResult.error
          ? { success: false, error: discussionCommentsResult.error.message }
          : { success: true, result: discussionCommentsResult.data };
        break;

      case 'updateGitHubIssue':
        console.log(`✏️ [${executiveName}] Update Issue: #${parsedArgs.issue_number}`);
        const updateIssueResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'update_issue',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              issue_number: parsedArgs.issue_number,
              title: parsedArgs.title,
              body: parsedArgs.body,
              state: parsedArgs.state,
              labels: parsedArgs.labels,
              assignees: parsedArgs.assignees
            },
            session_credentials
          }
        });
        result = updateIssueResult.error
          ? { success: false, error: updateIssueResult.error.message }
          : { success: true, result: updateIssueResult.data };
        break;

      case 'closeGitHubIssue':
        console.log(`❌ [${executiveName}] Close Issue: #${parsedArgs.issue_number}`);
        // If comment provided, add it first
        if (parsedArgs.comment) {
          await supabase.functions.invoke('github-integration', {
            body: {
              action: 'comment_on_issue',
              data: {
                repo: parsedArgs.repo || 'XMRT-Ecosystem',
                issue_number: parsedArgs.issue_number,
                comment: parsedArgs.comment
              },
              session_credentials
            }
          });
        }
        const closeIssueResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'close_issue',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              issue_number: parsedArgs.issue_number
            },
            session_credentials
          }
        });
        result = closeIssueResult.error
          ? { success: false, error: closeIssueResult.error.message }
          : { success: true, result: closeIssueResult.data };
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
      case 'set_task_status':
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

      case 'recall_entity':
        console.log(`🧠 [${executiveName}] Recall Entity: ${parsedArgs.name}`);
        const recallResult = await supabase.functions.invoke('knowledge-manager', {
          body: { action: 'search_knowledge', data: { search_term: parsedArgs.name } }
        });
        result = recallResult.error
          ? { success: false, error: recallResult.error.message }
          : { success: true, result: recallResult.data };
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

      // ====================================================================
      // STAE - SUITE TASK AUTOMATION ENGINE TOOLS
      // ====================================================================
      case 'create_task_from_template':
        console.log(`📋 [${executiveName}] STAE: Create Task from Template`);
        const createTemplateResult = await supabase.functions.invoke('suite-task-automation-engine', {
          body: {
            action: 'create_from_template',
            data: {
              ...parsedArgs,
              created_by_user_id: session_credentials?.user_id
            }
          }
        });
        result = createTemplateResult.error
          ? { success: false, error: createTemplateResult.error.message }
          : { success: true, result: createTemplateResult.data };
        break;

      case 'smart_assign_task':
        console.log(`🤖 [${executiveName}] STAE: Smart Assign Task`);
        const smartAssignResult = await supabase.functions.invoke('suite-task-automation-engine', {
          body: { action: 'smart_assign', data: parsedArgs }
        });
        result = smartAssignResult.error
          ? { success: false, error: smartAssignResult.error.message }
          : { success: true, result: smartAssignResult.data };
        break;

      case 'get_automation_metrics':
        console.log(`📊 [${executiveName}] STAE: Get Automation Metrics`);
        const metricsResult = await supabase.functions.invoke('suite-task-automation-engine', {
          body: { action: 'get_metrics', data: parsedArgs }
        });
        result = metricsResult.error
          ? { success: false, error: metricsResult.error.message }
          : { success: true, result: metricsResult.data };
        break;

      case 'update_task_checklist':
        console.log(`✅ [${executiveName}] STAE Phase 2: Update Checklist`);
        const checklistResult = await supabase.functions.invoke('suite-task-automation-engine', {
          body: { action: 'update_checklist_item', data: parsedArgs }
        });
        result = checklistResult.error
          ? { success: false, error: checklistResult.error.message }
          : { success: true, result: checklistResult.data };
        break;

      case 'resolve_blocked_task':
        console.log(`🔓 [${executiveName}] STAE Phase 2: Resolve Blocked Task`);
        const resolveResult = await supabase.functions.invoke('suite-task-automation-engine', {
          body: { action: 'auto_resolve_blockers', data: { task_id: parsedArgs.task_id } }
        });
        result = resolveResult.error
          ? { success: false, error: resolveResult.error.message }
          : { success: true, result: resolveResult.data };
        break;

      case 'get_stae_recommendations':
        console.log(`💡 [${executiveName}] STAE Phase 3: Get Recommendations`);
        const recsResult = await supabase.functions.invoke('suite-task-automation-engine', {
          body: { action: 'get_optimization_recommendations', data: {} }
        });
        result = recsResult.error
          ? { success: false, error: recsResult.error.message }
          : { success: true, result: recsResult.data };
        break;

      case 'advance_task_stage':
        console.log(`⏩ [${executiveName}] STAE Phase 2: Advance Task Stage`);
        const advanceResult = await supabase.functions.invoke('suite-task-automation-engine', {
          body: { action: 'advance_task_stage', data: parsedArgs }
        });
        result = advanceResult.error
          ? { success: false, error: advanceResult.error.message }
          : { success: true, result: advanceResult.data };
        break;

      // ====================================================================
      // VSCO WORKSPACE TOOLS
      // ====================================================================
      case 'vsco_manage_jobs':
        console.log(`📸 [${executiveName}] VSCO Manage Jobs: ${parsedArgs.action}`);
        const vscoJobsResult = await supabase.functions.invoke('vsco-workspace', {
          body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
        });
        result = vscoJobsResult.error
          ? { success: false, error: vscoJobsResult.error.message }
          : { success: true, result: vscoJobsResult.data };
        break;

      case 'vsco_manage_contacts':
        console.log(`📇 [${executiveName}] VSCO Manage Contacts: ${parsedArgs.action}`);
        const vscoContactsResult = await supabase.functions.invoke('vsco-workspace', {
          body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
        });
        result = vscoContactsResult.error
          ? { success: false, error: vscoContactsResult.error.message }
          : { success: true, result: vscoContactsResult.data };
        break;

      case 'vsco_manage_events':
        console.log(`📅 [${executiveName}] VSCO Manage Events: ${parsedArgs.action}`);
        const vscoEventsResult = await supabase.functions.invoke('vsco-workspace', {
          body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
        });
        result = vscoEventsResult.error
          ? { success: false, error: vscoEventsResult.error.message }
          : { success: true, result: vscoEventsResult.data };
        break;

      case 'vsco_analytics':
        console.log(`📊 [${executiveName}] VSCO Analytics: ${parsedArgs.action}`);
        const vscoAnalyticsResult = await supabase.functions.invoke('vsco-workspace', {
          body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
        });
        result = vscoAnalyticsResult.error
          ? { success: false, error: vscoAnalyticsResult.error.message }
          : { success: true, result: vscoAnalyticsResult.data };
        break;

      case 'vsco_manage_products':
        console.log(`💰 [${executiveName}] VSCO Manage Products: ${parsedArgs.action}`);
        const vscoProductsResult = await supabase.functions.invoke('vsco-workspace', {
          body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
        });
        result = vscoProductsResult.error
          ? { success: false, error: vscoProductsResult.error.message }
          : { success: true, result: vscoProductsResult.data };
        break;

      // ====================================================================
      // ECOSYSTEM DISCOVERY TOOLS
      // ====================================================================
      case 'search_edge_functions':
        console.log(`🔍 [${executiveName}] Search Edge Functions: ${parsedArgs.query}`);
        const searchFuncResult = await supabase.functions.invoke('search-edge-functions', {
          body: parsedArgs
        });
        result = searchFuncResult.error
          ? { success: false, error: searchFuncResult.error.message }
          : { success: true, result: searchFuncResult.data };
        break;

      case 'list_available_functions':
        console.log(`📋 [${executiveName}] List Available Functions`);
        const listFuncResult = await supabase.functions.invoke('list-available-functions', {
          body: parsedArgs
        });
        result = listFuncResult.error
          ? { success: false, error: listFuncResult.error.message }
          : { success: true, result: listFuncResult.data };
        break;

      case 'vsco_manage_worksheets':
        console.log(`📋 [${executiveName}] VSCO Manage Worksheets: ${parsedArgs.action}`);
        const vscoWorksheetsResult = await supabase.functions.invoke('vsco-workspace', {
          body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
        });
        result = vscoWorksheetsResult.error
          ? { success: false, error: vscoWorksheetsResult.error.message }
          : { success: true, result: vscoWorksheetsResult.data };
        break;

      case 'vsco_manage_notes':
        console.log(`📝 [${executiveName}] VSCO Manage Notes: ${parsedArgs.action}`);
        const vscoNotesResult = await supabase.functions.invoke('vsco-workspace', {
          body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
        });
        result = vscoNotesResult.error
          ? { success: false, error: vscoNotesResult.error.message }
          : { success: true, result: vscoNotesResult.data };
        break;

      case 'vsco_manage_financials':
        console.log(`💵 [${executiveName}] VSCO Manage Financials: ${parsedArgs.action}`);
        const vscoFinancialsResult = await supabase.functions.invoke('vsco-workspace', {
          body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
        });
        result = vscoFinancialsResult.error
          ? { success: false, error: vscoFinancialsResult.error.message }
          : { success: true, result: vscoFinancialsResult.data };
        break;

      case 'vsco_manage_settings':
        console.log(`⚙️ [${executiveName}] VSCO Manage Settings: ${parsedArgs.action}`);
        const vscoSettingsResult = await supabase.functions.invoke('vsco-workspace', {
          body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
        });
        result = vscoSettingsResult.error
          ? { success: false, error: vscoSettingsResult.error.message }
          : { success: true, result: vscoSettingsResult.data };
        break;

      case 'vsco_manage_users':
        console.log(`👥 [${executiveName}] VSCO Manage Users: ${parsedArgs.action}`);
        const vscoUsersResult = await supabase.functions.invoke('vsco-workspace', {
          body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
        });
        result = vscoUsersResult.error
          ? { success: false, error: vscoUsersResult.error.message }
          : { success: true, result: vscoUsersResult.data };
        break;

      // ====================================================================
      // GITHUB CONTRIBUTION SYNC TOOLS
      // ====================================================================
      case 'sync_github_contributions':
        console.log(`🔄 [${executiveName}] Sync GitHub Contributions`);
        const syncContribResult = await supabase.functions.invoke('sync-github-contributions', {
          body: {
            repo: parsedArgs.repo || 'XMRT-Ecosystem',
            owner: parsedArgs.owner || 'DevGruGold',
            max_commits: parsedArgs.max_commits || 100
          }
        });
        result = syncContribResult.error
          ? { success: false, error: syncContribResult.error.message }
          : { success: true, result: syncContribResult.data };
        break;


      // ==================== ECOSYSTEM COORDINATION TOOLS ====================
      case 'trigger_ecosystem_coordination': {
        try {
          const cycleType = args.cycle_type || 'standard';
          console.log(`🚀 Triggering ${cycleType} ecosystem coordination...`);

          const response = await fetch('https://xmrt-ecosystem.vercel.app/api/tick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cycle_type: cycleType }),
            signal: AbortSignal.timeout(120000) // 2 minute timeout
          });

          if (!response.ok) {
            return {
              success: false,
              error: `Coordination trigger failed: ${response.status} ${response.statusText}`
            };
          }

          const data = await response.json();

          return {
            success: true,
            message: `Ecosystem coordination cycle (${cycleType}) completed successfully`,
            timestamp: data.timestamp,
            agents_discovered: data.agents?.length || 0,
            health_checks_performed: data.health_checks?.length || 0,
            coordination_summary: data.summary || 'Coordination cycle completed',
            details: data
          };
        } catch (error) {
          console.error('Ecosystem coordination error:', error);
          return {
            success: false,
            error: `Failed to trigger coordination: ${error.message}`
          };
        }
      }

      case 'get_ecosystem_status': {
        try {
          console.log('📊 Fetching ecosystem status...');

          // Query agents endpoint
          const agentsResponse = await fetch('https://xmrt-ecosystem.vercel.app/api/agents', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000)
          });

          // Query system info
          const systemResponse = await fetch('https://xmrt-ecosystem.vercel.app/api/index', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000)
          });

          const agentsData = agentsResponse.ok ? await agentsResponse.json() : { agents: [] };
          const systemData = systemResponse.ok ? await systemResponse.json() : { status: 'unknown' };

          return {
            success: true,
            ecosystem_health: systemData.status || 'healthy',
            version: systemData.version || 'unknown',
            total_agents: agentsData.agents?.length || 0,
            agents: agentsData.agents || [],
            timestamp: new Date().toISOString(),
            deployment_url: 'https://xmrt-ecosystem.vercel.app',
            message: `Ecosystem status: ${agentsData.agents?.length || 0} agents discovered`
          };
        } catch (error) {
          console.error('Get ecosystem status error:', error);
          return {
            success: false,
            error: `Failed to get ecosystem status: ${error.message}`
          };
        }
      }

      case 'query_ecosystem_agents': {
        try {
          const filterBy = args.filter_by || 'all';
          console.log(`🔍 Querying ecosystem agents (filter: ${filterBy})...`);

          const response = await fetch('https://xmrt-ecosystem.vercel.app/api/agents', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000)
          });

          if (!response.ok) {
            return {
              success: false,
              error: `Agent query failed: ${response.status}`
            };
          }

          const data = await response.json();
          let agents = data.agents || [];

          // Apply filters
          if (filterBy === 'active') {
            agents = agents.filter(a => a.status === 'active' || a.status === 'online');
          } else if (filterBy === 'supabase') {
            agents = agents.filter(a => a.source === 'xmrtcouncil_supabase' || a.type === 'supabase_edge_function');
          } else if (filterBy === 'vercel') {
            agents = agents.filter(a => a.type === 'vercel_api' || a.source?.includes('vercel'));
          } else if (filterBy === 'priority') {
            agents = agents.sort((a, b) => (a.priority || 5) - (b.priority || 5));
          }

          return {
            success: true,
            total_agents: agents.length,
            filter_applied: filterBy,
            agents: agents,
            agent_summary: agents.map(a => ({
              name: a.name || a.display_name,
              type: a.type,
              status: a.status,
              source: a.source
            })),
            message: `Found ${agents.length} agents matching filter: ${filterBy}`
          };
        } catch (error) {
          console.error('Query ecosystem agents error:', error);
          return {
            success: false,
            error: `Failed to query agents: ${error.message}`
          };
        }
      }

      // ====================================================================
      // ANALYTICS & LOG MANAGEMENT TOOLS
      // ====================================================================
      case 'sync_function_logs':
        console.log(`🔄 [${executiveName}] Sync function logs - ${parsedArgs.hours_back || 1}h back`);
        const syncLogResult = await supabase.functions.invoke('sync-function-logs', {
          body: { hours_back: Math.min(parsedArgs.hours_back || 1, 24) }
        });
        result = syncLogResult.error
          ? { success: false, error: syncLogResult.error.message }
          : { success: true, result: syncLogResult.data };
        break;

      case 'get_function_usage_analytics':
        console.log(`📊 [${executiveName}] Get function usage analytics`);
        const usageAnalyticsResult = await supabase.functions.invoke('function-usage-analytics', {
          body: {
            function_name: parsedArgs.function_name,
            time_window_hours: parsedArgs.time_window_hours || 24,
            group_by: parsedArgs.group_by || 'function'
          }
        });
        result = usageAnalyticsResult.error
          ? { success: false, error: usageAnalyticsResult.error.message }
          : { success: true, result: usageAnalyticsResult.data };
        break;

      case 'check_system_status':
        console.log(`🏥 [${executiveName}] Check system status`);
        const systemStatusResult = await supabase.functions.invoke('system-status', { body: {} });
        result = systemStatusResult.error
          ? { success: false, error: systemStatusResult.error.message }
          : { success: true, result: systemStatusResult.data };
        break;

      case 'query_cron_registry':
        console.log(`⏰ [${executiveName}] Query cron registry: ${parsedArgs?.action || 'list_all'}`);
        const cronRegistryResult = await supabase.functions.invoke('get-cron-registry', {
          body: {
            action: parsedArgs?.action || 'list_all',
            platform: parsedArgs?.platform,
            function_name: parsedArgs?.function_name,
            job_name: parsedArgs?.job_name,
            include_inactive: parsedArgs?.include_inactive,
            time_window_hours: parsedArgs?.time_window_hours
          }
        });
        result = cronRegistryResult.error
          ? { success: false, error: cronRegistryResult.error.message }
          : { success: true, ...cronRegistryResult.data };
        break;

      default:
        console.warn(`⚠️ [${executiveName}] Unknown tool: ${name}`);
        result = {
          success: false,
          error: `Unknown tool: ${name}. Available tools include: invoke_edge_function, execute_python, createGitHubIssue, list_agents, assign_task, check_system_status, get_tool_usage_analytics, store_knowledge, search_knowledge, deploy_approved_function, create_task_from_template, smart_assign_task, get_automation_metrics, update_task_checklist, resolve_blocked_task, get_stae_recommendations, advance_task_stage, sync_github_contributions, sync_function_logs, get_function_usage_analytics, query_cron_registry, and more.`
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

// Add VSCO tool handlers to the switch statement by exporting a helper
export async function getVscoToolHandler(name: string, parsedArgs: any, supabase: any, executiveName: string): Promise<any | null> {
  switch (name) {
    case 'vsco_manage_jobs':
      console.log(`📸 [${executiveName}] VSCO Manage Jobs: ${parsedArgs.action}`);
      return supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'vsco_manage_contacts':
      console.log(`📇 [${executiveName}] VSCO Manage Contacts: ${parsedArgs.action}`);
      return supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'vsco_manage_events':
      console.log(`📅 [${executiveName}] VSCO Manage Events: ${parsedArgs.action}`);
      return supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'vsco_analytics':
      console.log(`📊 [${executiveName}] VSCO Analytics: ${parsedArgs.action}`);
      return supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'vsco_manage_products':
      console.log(`💰 [${executiveName}] VSCO Manage Products: ${parsedArgs.action}`);
      return supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'vsco_manage_worksheets':
      console.log(`📋 [${executiveName}] VSCO Manage Worksheets: ${parsedArgs.action}`);
      return supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'vsco_manage_notes':
      console.log(`📝 [${executiveName}] VSCO Manage Notes: ${parsedArgs.action}`);
      return supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'vsco_manage_financials':
      console.log(`💵 [${executiveName}] VSCO Manage Financials: ${parsedArgs.action}`);
      return supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'vsco_manage_settings':
      console.log(`⚙️ [${executiveName}] VSCO Manage Settings: ${parsedArgs.action}`);
      return supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'vsco_manage_users':
      console.log(`👥 [${executiveName}] VSCO Manage Users: ${parsedArgs.action}`);
      return supabase.functions.invoke('vsco-workspace', {
        body: { action: parsedArgs.action, data: parsedArgs, executive: executiveName }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    // ====================================================================
    // CORPORATE LICENSING TOOLS
    // ====================================================================
    case 'start_license_application':
      console.log(`📋 [${executiveName}] Start License Application`);
      return supabase.functions.invoke('process-license-application', {
        body: { action: 'create_draft', data: { session_key: parsedArgs.session_key, partial_data: parsedArgs } }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'update_license_application':
      console.log(`📝 [${executiveName}] Update License Application`);
      if (parsedArgs.application_id) {
        return supabase.functions.invoke('process-license-application', {
          body: { action: 'update_application', data: { application_id: parsedArgs.application_id, updates: parsedArgs } }
        }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });
      } else {
        // Find by session key and update
        return supabase.functions.invoke('process-license-application', {
          body: { action: 'get_draft_by_session', data: { session_key: parsedArgs.session_key } }
        }).then((draftResult: any) => {
          if (draftResult.data?.draft?.id) {
            return supabase.functions.invoke('process-license-application', {
              body: { action: 'update_application', data: { application_id: draftResult.data.draft.id, updates: parsedArgs } }
            }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });
          }
          return { success: false, error: 'No draft application found for this session' };
        });
      }

    case 'calculate_license_savings':
      console.log(`💰 [${executiveName}] Calculate License Savings`);
      return supabase.functions.invoke('process-license-application', {
        body: { action: 'calculate_savings', data: parsedArgs }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    case 'submit_license_application':
      console.log(`✅ [${executiveName}] Submit License Application`);
      if (!parsedArgs.compliance_commitment) {
        return { success: false, error: 'User must accept the ethical commitment before submitting' };
      }
      if (parsedArgs.application_id) {
        return supabase.functions.invoke('process-license-application', {
          body: { action: 'update_application', data: { application_id: parsedArgs.application_id, updates: { application_status: 'submitted', compliance_commitment: true } } }
        }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });
      } else {
        return supabase.functions.invoke('process-license-application', {
          body: { action: 'get_draft_by_session', data: { session_key: parsedArgs.session_key } }
        }).then((draftResult: any) => {
          if (draftResult.data?.draft?.id) {
            return supabase.functions.invoke('process-license-application', {
              body: { action: 'update_application', data: { application_id: draftResult.data.draft.id, updates: { application_status: 'submitted', compliance_commitment: true } } }
            }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });
          }
          return { success: false, error: 'No draft application found to submit' };
        });
      }

    case 'get_license_application_status':
      console.log(`📊 [${executiveName}] Get License Application Status`);
      return supabase.functions.invoke('process-license-application', {
        body: { action: 'get_application_status', data: parsedArgs }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    // ====================================================================
    // VSCO SUITE QUOTE WORKFLOW
    // ====================================================================
    case 'create_suite_quote':
      console.log(`📧 [${executiveName}] Create Suite Quote for ${parsedArgs.company_name}`);
      return supabase.functions.invoke('create-suite-quote', {
        body: parsedArgs
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : { success: true, result: res.data });

    // ====================================================================
    // GOOGLE CLOUD SERVICES (Dedicated Functions: google-gmail, google-drive, google-sheets, google-calendar)
    // ====================================================================
    case 'google_gmail':
      console.log(`📧 [${executiveName}] Google Gmail: ${parsedArgs.action}`);
      return supabase.functions.invoke('google-gmail', {
        body: parsedArgs
      }).then((res: any) => res.error
        ? { success: false, error: res.error.message, credential_required: true }
        : res.data);

    case 'google_drive':
      console.log(`📁 [${executiveName}] Google Drive: ${parsedArgs.action}`);
      return supabase.functions.invoke('google-drive', {
        body: parsedArgs
      }).then((res: any) => res.error
        ? { success: false, error: res.error.message, credential_required: true }
        : res.data);

    case 'google_sheets':
      console.log(`📊 [${executiveName}] Google Sheets: ${parsedArgs.action}`);
      return supabase.functions.invoke('google-sheets', {
        body: parsedArgs
      }).then((res: any) => res.error
        ? { success: false, error: res.error.message, credential_required: true }
        : res.data);

    case 'google_calendar':
      console.log(`📅 [${executiveName}] Google Calendar: ${parsedArgs.action}`);
      return supabase.functions.invoke('google-calendar', {
        body: parsedArgs
      }).then((res: any) => res.error
        ? { success: false, error: res.error.message, credential_required: true }
        : res.data);

    case 'google_cloud_status':
      console.log(`🔐 [${executiveName}] Google Cloud Status Check`);
      return supabase.functions.invoke('google-cloud-auth', {
        body: { action: 'status' }
      }).then((res: any) => res.error
        ? { success: false, error: res.error.message }
        : res.data);

    case 'introspect_function_actions':
      console.log(`🔍 [${executiveName}] Introspecting function: ${parsedArgs.function_name || 'all'}`);
      return supabase.functions.invoke('get-function-actions', {
        body: {
          function_name: parsedArgs.function_name,
          category: parsedArgs.category
        }
      }).then((res: any) => res.error ? { success: false, error: res.error.message } : res.data);

    // ====================================================================
    // 🔷 VERTEX AI EXPRESS TOOLS
    // ====================================================================
    case 'vertex_ai_generate':
      console.log(`🔷 [${executiveName}] Vertex AI Generate: ${parsedArgs.model || 'gemini-2.5-flash'}`);
      return supabase.functions.invoke('vertex-ai-chat', {
        body: {
          messages: [{ role: 'user', content: parsedArgs.prompt }],
          model: parsedArgs.model || 'gemini-2.5-flash',
          temperature: parsedArgs.temperature || 0.7,
          maxTokens: parsedArgs.max_tokens || 4096,
          systemPrompt: parsedArgs.system_prompt
        }
      }).then((res: any) => res.error
        ? { success: false, error: res.error.message }
        : { success: true, response: res.data?.response, model: res.data?.model, provider: 'vertex-ai-express' });

    case 'vertex_ai_count_tokens':
      console.log(`🔢 [${executiveName}] Vertex AI Token Count`);
      const VERTEX_AI_API_KEY = Deno.env.get('VERTEX_AI_API_KEY');
      if (!VERTEX_AI_API_KEY) {
        return { success: false, error: 'VERTEX_AI_API_KEY not configured' };
      }
      const model = parsedArgs.model || 'gemini-2.5-flash';
      const tokenCountResponse = await fetch(
        `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:countTokens?key=${VERTEX_AI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: parsedArgs.text }] }]
          })
        }
      );
      if (!tokenCountResponse.ok) {
        const errorText = await tokenCountResponse.text();
        return { success: false, error: `Token count failed: ${errorText}` };
      }
      const tokenData = await tokenCountResponse.json();
      return {
        success: true,
        total_tokens: tokenData.totalTokens,
        text_length: parsedArgs.text?.length || 0,
        model
      };

    // ====================================================================
    // 🖼️ VERTEX AI IMAGE GENERATION
    // ====================================================================
    case 'vertex_generate_image':
      console.log(`🖼️ [${executiveName}] Vertex AI Image Generation: ${parsedArgs.prompt?.substring(0, 50)}...`);
      return supabase.functions.invoke('vertex-ai-chat', {
        body: {
          action: 'generate_image',
          prompt: parsedArgs.prompt,
          image_model: parsedArgs.model,
          aspect_ratio: parsedArgs.aspect_ratio,
          count: parsedArgs.count || 1
        }
      }).then((res: any) => res.error
        ? { success: false, error: res.error.message }
        : {
          success: true,
          images: res.data?.images,
          count: res.data?.count,
          text: res.data?.text,
          provider: 'vertex-ai-express'
        });

    // ====================================================================
    // 🎬 VERTEX AI VIDEO GENERATION (Veo)
    // ====================================================================
    case 'vertex_generate_video':
      console.log(`🎬 [${executiveName}] Vertex AI Video Generation: ${parsedArgs.prompt?.substring(0, 50)}...`);
      return supabase.functions.invoke('vertex-ai-chat', {
        body: {
          action: 'generate_video',
          prompt: parsedArgs.prompt,
          video_model: parsedArgs.model,
          aspect_ratio: parsedArgs.aspect_ratio,
          duration_seconds: parsedArgs.duration_seconds || 5
        }
      }).then((res: any) => res.error
        ? { success: false, error: res.error.message }
        : {
          success: true,
          operation_id: res.data?.operationId,
          operation_name: res.data?.operationName,
          message: res.data?.message,
          provider: 'vertex-ai-express'
        });

    case 'vertex_check_video_status':
      console.log(`📽️ [${executiveName}] Checking video status: ${parsedArgs.operation_name}`);
      return supabase.functions.invoke('vertex-ai-chat', {
        body: {
          action: 'check_video_status',
          operation_name: parsedArgs.operation_name
        }
      }).then((res: any) => res.error
        ? { success: false, error: res.error.message }
        : {
          success: true,
          done: res.data?.done,
          video_url: res.data?.videoUrl,
          error: res.data?.error,
          provider: 'vertex-ai-express'
        });

    default:
      return null;
  }
}