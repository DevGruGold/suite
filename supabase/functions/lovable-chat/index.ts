import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateElizaSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { getAICredential, createCredentialRequiredResponse } from "../_shared/credentialCascade.ts";
import { callLovableAIGateway } from '../_shared/aiGatewayFallback.ts';
import { buildContextualPrompt } from '../_shared/contextBuilder.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parser for DeepSeek's text-based tool call format
function parseDeepSeekToolCalls(content: string): Array<any> | null {
  // DeepSeek format: <｜tool▁calls▁begin｜><｜tool▁call▁begin｜>function_name<｜tool▁sep｜>{"arg": "value"}<｜tool▁call▁end｜><｜tool▁calls▁end｜>
  
  const toolCallsMatch = content.match(/<｜tool▁calls▁begin｜>(.*?)<｜tool▁calls▁end｜>/s);
  if (!toolCallsMatch) return null;
  
  const toolCallsText = toolCallsMatch[1];
  const toolCallPattern = /<｜tool▁call▁begin｜>(.*?)<｜tool▁sep｜>(.*?)<｜tool▁call▁end｜>/gs;
  const toolCalls: Array<any> = [];
  
  let match;
  while ((match = toolCallPattern.exec(toolCallsText)) !== null) {
    const functionName = match[1].trim();
    let args = match[2].trim();
    
    // Parse arguments (might be JSON or empty)
    let parsedArgs = {};
    if (args && args !== '{}') {
      try {
        parsedArgs = JSON.parse(args);
      } catch (e) {
        console.warn(`Failed to parse DeepSeek tool args for ${functionName}:`, args);
      }
    }
    
    // Convert to OpenAI tool call format
    toolCalls.push({
      id: `deepseek_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: 'function',
      function: {
        name: functionName,
        arguments: JSON.stringify(parsedArgs)
      }
    });
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

// Helper function to log tool execution to activity log
async function logToolExecution(supabase: any, toolName: string, args: any, status: 'started' | 'completed' | 'failed', result?: any, error?: any) {
  try {
    const metadata: any = {
      tool_name: toolName,
      arguments: args,
      timestamp: new Date().toISOString(),
      execution_status: status
    };
    
    if (result) {
      metadata.result = result;
    }
    
    if (error) {
      metadata.error = error;
    }
    
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'tool_execution',
      title: `🔧 ${toolName}`,
      description: `Eliza executed: ${toolName}`,
      metadata,
      status: status === 'completed' ? 'completed' : (status === 'failed' ? 'failed' : 'in_progress')
    });
    
    console.log(`📊 Logged tool execution: ${toolName} (${status})`);
  } catch (logError) {
    console.error('Failed to log tool execution:', logError);
  }
}

// Helper function to execute tool calls from AI
async function executeToolCall(supabase: any, toolCall: any, SUPABASE_URL: string, SERVICE_ROLE_KEY: string): Promise<any> {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
  
  console.log(`🔧 Executing tool: ${name}`, parsedArgs);
  
  // Log ALL tool calls to activity table for visibility
  await logToolExecution(supabase, name, parsedArgs, 'started');
  
  try {
    // Route tool calls to appropriate edge functions
    switch(name) {
      case 'invoke_edge_function':
      case 'call_edge_function':
        const { function_name, payload, body } = parsedArgs;
        const targetFunction = function_name || parsedArgs.function_name;
        const targetPayload = payload || body || {};
        
        console.log(`📡 Invoking edge function: ${targetFunction}`);
        const result = await supabase.functions.invoke(targetFunction, { body: targetPayload });
        
        if (result.error) {
          console.error(`❌ Edge function error:`, result.error);
          return { success: false, error: result.error.message || 'Function execution failed' };
        }
        
        return { success: true, result: result.data };
        
      case 'execute_python':
        const { code, purpose } = parsedArgs;
        console.log(`🐍 [TOOL CALL] execute_python triggered!`);
        console.log(`📝 [CODE LENGTH] ${code?.length || 0} characters`);
        console.log(`🎯 [PURPOSE] ${purpose || 'No purpose specified'}`);
        console.log(`📋 [CODE PREVIEW] ${code?.substring(0, 100) || 'No code'}...`);
        
        const pythonResult = await supabase.functions.invoke('python-executor', {
          body: { 
            code, 
            purpose,
            source: 'lovable-chat',
            agent_id: 'eliza-main'
          }
        });
        
        if (pythonResult.error) {
          console.error(`❌ Python execution error:`, pythonResult.error);
          return { success: false, error: pythonResult.error.message || 'Python execution failed' };
        }
        
        return { success: true, result: pythonResult.data };
        
      case 'createGitHubDiscussion':
        console.log(`📝 [TOOL CALL] createGitHubDiscussion triggered!`);
        console.log(`🎯 [TITLE] ${parsedArgs.title || 'No title'}`);
        console.log(`📋 [BODY LENGTH] ${parsedArgs.body?.length || 0} characters`);
        
        const discussionResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'create_discussion',
            executive: parsedArgs.executive || 'eliza', // Default to Eliza for chat-initiated discussions
            data: {
              repositoryId: 'R_kgDONfvCEw', // XMRT-Ecosystem repo ID
              title: parsedArgs.title,
              body: parsedArgs.body,
              categoryId: parsedArgs.categoryId || 'DIC_kwDOPHeChc4CkXxI' // General category
            }
          }
        });
        
        if (discussionResult.error) {
          console.error(`❌ GitHub discussion creation error:`, discussionResult.error);
          return { success: false, error: discussionResult.error.message || 'Discussion creation failed' };
        }
        
        console.log(`✅ Discussion created:`, discussionResult.data);
        return { success: true, result: discussionResult.data };

      case 'createGitHubIssue':
        console.log(`🐛 [TOOL CALL] createGitHubIssue triggered!`);
        console.log(`🎯 [REPO] ${parsedArgs.repo || 'XMRT-Ecosystem'}`);
        console.log(`📋 [TITLE] ${parsedArgs.title || 'No title'}`);
        
        const issueResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'create_issue',
            executive: parsedArgs.executive || 'eliza', // Default to Eliza for chat-initiated issues
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              title: parsedArgs.title,
              body: parsedArgs.body,
              labels: parsedArgs.labels || []
            }
          }
        });
        
        if (issueResult.error) {
          console.error(`❌ GitHub issue creation error:`, issueResult.error);
          return { success: false, error: issueResult.error.message || 'Issue creation failed' };
        }
        
        console.log(`✅ Issue created:`, issueResult.data);
        return { success: true, result: issueResult.data };

      case 'listGitHubIssues':
        console.log(`📋 [TOOL CALL] listGitHubIssues triggered!`);
        
        const listResult = await supabase.functions.invoke('github-integration', {
          body: {
            action: 'list_issues',
            data: {
              repo: parsedArgs.repo || 'XMRT-Ecosystem',
              state: parsedArgs.state || 'open',
              per_page: parsedArgs.limit || 20
            }
          }
        });
        
        if (listResult.error) {
          console.error(`❌ GitHub issue list error:`, listResult.error);
          return { success: false, error: listResult.error.message || 'Issue listing failed' };
        }
        
        return { success: true, result: listResult.data };
        
      case 'list_available_functions':
        const { category } = parsedArgs;
        const functionsListResult = await supabase.functions.invoke('list-available-functions', {
          body: { category }
        });
        
        return { success: true, result: functionsListResult.data };
        
      // Agent management tools
      case 'list_agents':
        const agentList = await supabase.functions.invoke('agent-manager', {
          body: { action: 'list_agents' }
        });
        return { success: true, result: agentList.data };
        
      case 'spawn_agent':
        const spawnResult = await supabase.functions.invoke('agent-manager', {
          body: { action: 'spawn_agent', ...parsedArgs }
        });
        return { success: true, result: spawnResult.data };
        
      case 'update_agent_status':
        const updateResult = await supabase.functions.invoke('agent-manager', {
          body: { action: 'update_agent_status', ...parsedArgs }
        });
        return { success: true, result: updateResult.data };
        
      case 'assign_task':
        const assignResult = await supabase.functions.invoke('agent-manager', {
          body: { action: 'assign_task', ...parsedArgs }
        });
        return { success: true, result: assignResult.data };
        
      case 'list_tasks':
        const taskList = await supabase.functions.invoke('agent-manager', {
          body: { action: 'list_tasks' }
        });
        return { success: true, result: taskList.data };
        
      case 'update_task_status':
        const taskUpdate = await supabase.functions.invoke('agent-manager', {
          body: { action: 'update_task', ...parsedArgs }
        });
        return { success: true, result: taskUpdate.data };
        
      case 'delete_task':
        const deleteResult = await supabase.functions.invoke('agent-manager', {
          body: { action: 'delete_task', ...parsedArgs }
        });
        return { success: true, result: deleteResult.data };
        
      case 'get_agent_workload':
        const workloadResult = await supabase.functions.invoke('agent-manager', {
          body: { action: 'get_workload', ...parsedArgs }
        });
        return { success: true, result: workloadResult.data };
        
      case 'check_system_status':
        console.log(`🏥 [TOOL CALL] check_system_status - Getting system health`);
        const systemStatusResult = await supabase.functions.invoke('system-status', {
          body: {}
        });
        
        if (systemStatusResult.error) {
          console.error(`❌ System status check error:`, systemStatusResult.error);
          await logToolExecution(supabase, name, parsedArgs, 'failed', null, systemStatusResult.error.message);
          return { success: false, error: systemStatusResult.error.message || 'System status check failed' };
        }
        
        console.log(`✅ System status retrieved`);
        await logToolExecution(supabase, name, parsedArgs, 'completed', systemStatusResult.data, null);
        return { success: true, result: systemStatusResult.data };

      case 'check_ecosystem_health':
        console.log(`🌐 [TOOL CALL] check_ecosystem_health - Getting ecosystem health`);
        const ecosystemResult = await supabase.functions.invoke('ecosystem-monitor', {
          body: {
            include_repos: parsedArgs.include_repos || [],
            detailed: parsedArgs.detailed !== false
          }
        });
        
        if (ecosystemResult.error) {
          console.error(`❌ Ecosystem health check error:`, ecosystemResult.error);
          await logToolExecution(supabase, name, parsedArgs, 'failed', null, ecosystemResult.error.message);
          return { success: false, error: ecosystemResult.error.message || 'Ecosystem health check failed' };
        }
        
        console.log(`✅ Ecosystem health retrieved`);
        await logToolExecution(supabase, name, parsedArgs, 'completed', ecosystemResult.data, null);
        return { success: true, result: ecosystemResult.data };

      case 'generate_health_report':
        console.log(`📋 [TOOL CALL] generate_health_report - Generating health report`);
        
        // Get both system status and ecosystem health
        const [sysStatus, ecoHealth] = await Promise.all([
          supabase.functions.invoke('system-status', { body: {} }),
          supabase.functions.invoke('ecosystem-monitor', { body: { detailed: true } })
        ]);
        
        const format = parsedArgs.format || 'markdown';
        const report = {
          generated_at: new Date().toISOString(),
          format,
          system_status: sysStatus.data,
          ecosystem_health: ecoHealth.data,
          summary: {
            overall_health: sysStatus.data?.status || 'unknown',
            total_functions: sysStatus.data?.total_functions || 0,
            healthy_functions: sysStatus.data?.healthy_functions || 0,
            repositories_checked: ecoHealth.data?.repositories?.length || 0
          }
        };
        
        console.log(`✅ Health report generated`);
        await logToolExecution(supabase, name, parsedArgs, 'completed', report, null);
        return { success: true, result: report };
        
      case 'get_my_feedback':
        console.log(`📚 [TOOL CALL] get_my_feedback - Retrieving Eliza's learning feedback`);
        const limit = parsedArgs.limit || 10;
        const unacknowledgedOnly = parsedArgs.unacknowledged_only !== false;
        const acknowledgeIds = parsedArgs.acknowledge_ids || [];
        
        // Acknowledge specified feedback items first
        if (acknowledgeIds.length > 0) {
          await supabase
            .from('executive_feedback')
            .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
            .in('id', acknowledgeIds);
          console.log(`✅ Acknowledged ${acknowledgeIds.length} feedback items`);
        }
        
        // Fetch feedback
        let feedbackQuery = supabase
          .from('executive_feedback')
          .select('*')
          .eq('executive_name', 'Eliza')
          .order('created_at', { ascending: false })
          .limit(limit);
        
        if (unacknowledgedOnly) {
          feedbackQuery = feedbackQuery.eq('acknowledged', false);
        }
        
        const { data: feedback, error: feedbackError } = await feedbackQuery;
        
        if (feedbackError) {
          console.error(`❌ Failed to fetch feedback:`, feedbackError);
          await logToolExecution(supabase, name, parsedArgs, 'failed', null, feedbackError.message);
          return { success: false, error: feedbackError.message };
        }
        
        console.log(`✅ Retrieved ${feedback?.length || 0} feedback items`);
        await logToolExecution(supabase, name, parsedArgs, 'completed', {
          feedback_count: feedback?.length || 0,
          acknowledged_count: acknowledgeIds.length
        }, null);
        
        return { 
          success: true, 
          result: {
            feedback: feedback || [],
            count: feedback?.length || 0,
            acknowledged_count: acknowledgeIds.length
          }
        };

      // ========== GOVERNANCE TOOLS ==========
      case 'propose_new_edge_function':
        console.log(`📝 [TOOL CALL] propose_new_edge_function - Submitting proposal to Council`);
        const proposalResult = await supabase.functions.invoke('propose-new-edge-function', {
          body: {
            function_name: parsedArgs.function_name,
            description: parsedArgs.description,
            proposed_by: parsedArgs.proposed_by || 'Eliza',
            category: parsedArgs.category,
            rationale: parsedArgs.rationale,
            use_cases: parsedArgs.use_cases,
            implementation_outline: parsedArgs.implementation_outline
          }
        });
        
        // Extract detailed error from response body if available
        if (proposalResult.error) {
          const errorDetail = proposalResult.data?.error || proposalResult.error.message || 'Proposal submission failed';
          const suggestion = proposalResult.data?.suggestion;
          const existingStatus = proposalResult.data?.existing_status;
          
          console.error(`❌ Proposal submission error:`, errorDetail, proposalResult.data);
          
          // Check if it's an "already approved" case - this is actually success!
          if (existingStatus === 'approved') {
            await logToolExecution(supabase, name, parsedArgs, 'completed', { already_exists: true }, null);
            return { 
              success: true,  // It's actually good news!
              function_exists: true,
              function_name: parsedArgs.function_name,
              message: `Great news! "${parsedArgs.function_name}" is already approved and available. Use invoke_edge_function("${parsedArgs.function_name}", {...}) to call it directly.`,
              suggestion
            };
          }
          
          await logToolExecution(supabase, name, parsedArgs, 'failed', null, errorDetail);
          return { 
            success: false, 
            error: errorDetail,
            suggestion,
            existing_status: existingStatus,
            governance_action: 'propose_new_edge_function',
            status: 'failed'
          };
        }
        
        console.log(`✅ Proposal submitted:`, proposalResult.data);
        await logToolExecution(supabase, name, parsedArgs, 'completed', proposalResult.data, null);
        return { 
          success: true, 
          result: proposalResult.data,
          governance_action: 'propose_new_edge_function',
          status: 'submitted',
          message: `Proposal "${parsedArgs.function_name}" submitted. Awaiting votes from 4 executives (need 3/4 approval).`
        };

      case 'vote_on_function_proposal':
        console.log(`🗳️ [TOOL CALL] vote_on_function_proposal - Recording executive vote`);
        const voteResult = await supabase.functions.invoke('vote-on-proposal', {
          body: {
            proposal_id: parsedArgs.proposal_id,
            executive_name: parsedArgs.executive_name,
            vote: parsedArgs.vote,
            reasoning: parsedArgs.reasoning
          }
        });
        
        if (voteResult.error) {
          console.error(`❌ Vote recording error:`, voteResult.error);
          await logToolExecution(supabase, name, parsedArgs, 'failed', null, voteResult.error.message);
          return { 
            success: false, 
            error: voteResult.error.message || 'Vote recording failed',
            governance_action: 'vote_on_function_proposal',
            status: 'failed'
          };
        }
        
        console.log(`✅ Vote recorded:`, voteResult.data);
        await logToolExecution(supabase, name, parsedArgs, 'completed', voteResult.data, null);
        return { 
          success: true, 
          result: voteResult.data,
          governance_action: 'vote_on_function_proposal',
          status: 'recorded',
          message: `Vote recorded from ${parsedArgs.executive_name}: ${parsedArgs.vote}`
        };

      case 'list_function_proposals':
        console.log(`📋 [TOOL CALL] list_function_proposals - Fetching proposals`);
        const status = parsedArgs.status || 'voting';
        
        const { data: proposals, error: proposalsError } = await supabase
          .from('edge_function_proposals')
          .select('*, executive_votes(*)')
          .eq('status', status)
          .order('created_at', { ascending: false })
          .limit(parsedArgs.limit || 20);
        
        if (proposalsError) {
          console.error(`❌ Failed to fetch proposals:`, proposalsError);
          await logToolExecution(supabase, name, parsedArgs, 'failed', null, proposalsError.message);
          return { 
            success: false, 
            error: proposalsError.message,
            governance_action: 'list_function_proposals',
            status: 'failed'
          };
        }
        
        console.log(`✅ Retrieved ${proposals?.length || 0} proposals`);
        await logToolExecution(supabase, name, parsedArgs, 'completed', { count: proposals?.length || 0 }, null);
        return { 
          success: true, 
          result: {
            proposals: proposals || [],
            count: proposals?.length || 0,
            filter_status: status
          },
          governance_action: 'list_function_proposals',
          status: 'retrieved'
        };
        
      default:
        console.warn(`⚠️ Unknown tool: ${name}`);
        console.log(`💡 Available tools: check_system_status, check_ecosystem_health, generate_health_report, get_my_feedback, createGitHubDiscussion, createGitHubIssue, listGitHubIssues, list_available_functions, agent tools, propose_new_edge_function, vote_on_function_proposal, list_function_proposals`);
        console.log(`💡 For other functions, use invoke_edge_function instead`);
        
        await logToolExecution(supabase, name, parsedArgs, 'failed', null, `Unknown tool: ${name}. Use invoke_edge_function for edge functions not listed above.`);
        return { 
          success: false, 
          error: `Unknown tool: ${name}. For governance: propose_new_edge_function, vote_on_function_proposal, list_function_proposals. For other edge functions, use invoke_edge_function.`,
          suggestion: 'Use invoke_edge_function("function-name", {payload}) for direct edge function calls'
        };
    }
  } catch (error) {
    console.error(`❌ Tool execution error for ${name}:`, error);
    await logToolExecution(supabase, name, parsedArgs, 'failed', null, error.message || 'Tool execution failed');
    return { success: false, error: error.message || 'Tool execution failed' };
  }
}



serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, conversationHistory, userContext, miningStats, systemVersion, session_credentials, images, isLiveCameraFeed } = await req.json();
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Log if images are being passed
    if (images && images.length > 0) {
      console.log(`🖼️ Processing ${images.length} image attachment(s) for vision analysis`);
      if (isLiveCameraFeed) {
        console.log(`📹 Images are from LIVE CAMERA FEED - Eliza can see the user in real-time!`);
      }
    }
    
    // Check if Lovable AI Gateway is configured
    if (!LOVABLE_API_KEY) {
      console.error('❌ LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({
          success: false,
          error: '💳 Lovable AI Gateway is not configured. Please check your workspace settings.',
          needsCredentials: true
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('✅ Using Lovable AI Gateway (google/gemini-2.5-flash)');
    
    let aiProvider = 'lovable_gateway'; // Mutable for fallback
    let aiModel = 'google/gemini-2.5-flash';
    const aiExecutive = 'lovable-chat';
    let aiExecutiveTitle = 'Chief Strategy Officer (CSO)';

    console.log(`🎯 ${aiExecutiveTitle} - Processing request`);
    
    // Extract user input for multi-step detection
    const userInput = messages[messages.length - 1]?.content || '';
    
    // ========== PHASE 1: EXPANDED MULTI-STEP DETECTION ==========
    // Check if this is a complex multi-step task that should run in background
    const isMultiStepTask = /analyze.*and.*(create|build|implement)|multi[- ]?step|coordinate|orchestrate|plan.*and.*execute|research.*and.*summarize|compare.*across|integrate.*data|build.*workflow|complex.*analysis|autonomous.*task/i.test(userInput);
    
    // Semantic detection - tasks that require data aggregation from multiple sources
    const requiresAggregation = /list.*agents|show.*status|agent.*performance|system.*health|knowledge.*search|find.*all|get.*overview|analyze.*current|all.*tasks|view.*all|show.*all/i.test(userInput);
    
    // Check if this needs enrichment beyond raw data
    const needsEnrichment = /with.*details|comprehensive|full.*report|complete.*picture|status.*and|including|detailed|in-depth/i.test(userInput);
    
    // Check if user wants insights, not just data
    const needsInsights = /why|how.*performing|suggest|recommend|optimize|improve|analysis|trends|predict|forecast/i.test(userInput);
    
    const shouldOrchestrate = isMultiStepTask || requiresAggregation || needsEnrichment || needsInsights;
    
    // Workflow templates for common scenarios
    const workflowTemplates: Record<string, any> = {
      'agent_overview': {
        workflow_name: 'Comprehensive Agent Status Report',
        description: 'Complete analysis of all deployed agents with performance metrics and recommendations',
        steps: [
          { 
            name: 'Fetch All Agents', 
            description: 'Get complete agent roster',
            type: 'api_call',
            function: 'agent-manager',
            body: { action: 'list_agents' }
          },
          { 
            name: 'Get Agent Workloads', 
            description: 'Fetch task assignments for each agent',
            type: 'api_call',
            function: 'agent-manager',
            body: { action: 'get_agent_workload' }
          },
          { 
            name: 'Fetch Recent Activity', 
            description: 'Get agent activity from logs',
            type: 'data_fetch',
            table: 'eliza_activity_log',
            select: 'title, description, created_at, metadata',
            limit: 50
          },
          { 
            name: 'Analyze Performance', 
            description: 'AI synthesis of agent health and recommendations',
            type: 'ai_analysis',
            prompt: 'Analyze the agent roster, workloads, and recent activity. Provide: 1) Status summary, 2) Performance insights, 3) Workload balance analysis, 4) Specific recommendations for optimization'
          }
        ],
        estimated_duration: '2-3 minutes'
      },
      'system_diagnostics': {
        workflow_name: 'Full System Health Check',
        description: 'Comprehensive diagnostic scan of all ecosystem components',
        steps: [
          { 
            name: 'Run System Diagnostics', 
            description: 'Execute diagnostic scan',
            type: 'api_call',
            function: 'system-diagnostics'
          },
          { 
            name: 'Fetch Agent Status', 
            description: 'Get all agent health',
            type: 'api_call',
            function: 'agent-manager',
            body: { action: 'list_agents' }
          },
          { 
            name: 'Fetch Recent Logs', 
            description: 'Get error and warning logs',
            type: 'data_fetch',
            table: 'eliza_activity_log',
            select: '*',
            limit: 100
          },
          { 
            name: 'Health Analysis', 
            description: 'Synthesize system health report',
            type: 'ai_analysis',
            prompt: 'Review diagnostics, agent status, and logs. Identify: 1) Critical issues, 2) Warnings, 3) System health score, 4) Immediate action items'
          }
        ],
        estimated_duration: '3-4 minutes'
      },
      'task_overview': {
        workflow_name: 'Task Pipeline Analysis',
        description: 'Complete view of all tasks with blocking issues and recommendations',
        steps: [
          { 
            name: 'List All Tasks', 
            description: 'Fetch complete task list',
            type: 'api_call',
            function: 'agent-manager',
            body: { action: 'list_tasks' }
          },
          { 
            name: 'Identify Blockers', 
            description: 'Detect blocking issues',
            type: 'api_call',
            function: 'task-orchestrator',
            body: { action: 'identify_blockers' }
          },
          { 
            name: 'Workload Analysis', 
            description: 'Get workload distribution',
            type: 'api_call',
            function: 'agent-manager',
            body: { action: 'get_agent_workload' }
          },
          { 
            name: 'Analyze Bottlenecks', 
            description: 'AI analysis of task blockers and workload',
            type: 'ai_analysis',
            prompt: 'Analyze all tasks, identified blockers, and agent workloads. Provide: 1) Key bottlenecks, 2) Resource constraints, 3) Recommendations to improve throughput'
          }
        ],
        estimated_duration: '2-3 minutes'
      }
    };
    
    // Select a workflow if user input matches a template trigger
    let selectedWorkflow: any = null;
    if (shouldOrchestrate) {
      if (/agent.*(status|overview)/i.test(userInput)) {
        selectedWorkflow = workflowTemplates['agent_overview'];
      } else if (/system.*(health|diagnostic)/i.test(userInput)) {
        selectedWorkflow = workflowTemplates['system_diagnostics'];
      } else if (/task.*(overview|pipeline|blocker)/i.test(userInput)) {
        selectedWorkflow = workflowTemplates['task_overview'];
      }
    }

    if (selectedWorkflow) {
      console.log(`🚀 Auto-Orchestration Triggered: ${selectedWorkflow.workflow_name}`);
      
      // Use Supabase client to invoke the orchestrator function
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      
      try {
        const orchestratorResult = await supabase.functions.invoke('multi-step-orchestrator', {
          body: {
            workflow: selectedWorkflow,
            userInput,
            context: {
              conversationHistory,
              userContext,
              miningStats
            }
          }
        });
        
        if (!orchestratorResult.error && orchestratorResult.data) {
          const orchestratorData = orchestratorResult.data;
          const workflowId = orchestratorData?.workflow_id || 'background_task';
          console.log('✅ Workflow auto-triggered:', workflowId);
          
          return new Response(JSON.stringify({
            success: true,
            response: `🎬 **${selectedWorkflow.workflow_name}**\n\n${selectedWorkflow.description}\n\n**Executing ${selectedWorkflow.steps.length} steps:**\n${selectedWorkflow.steps.map((s: any, i: number) => `${i + 1}. ${s.name} - ${s.description}`).join('\n')}\n\n⏱️ Estimated time: ${selectedWorkflow.estimated_duration}\n\n✅ Running in background - check **Task Pipeline Visualizer** for live progress. You can continue chatting while I complete this analysis.`,
            hasToolCalls: false,
            workflow_id: workflowId,
            background_task: true
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } catch (orchError) {
        console.warn('⚠️ Auto-orchestration failed, continuing with AI design:', orchError);
      }
    }
    
    // ========== PHASE 2: DIRECT CHAT OR AI DESIGN ==========
    const lastMessage = messages[messages.length - 1];
    const isDesignTask = lastMessage.content.toLowerCase().includes('#design');
    
    if (isDesignTask) {
      console.log('🎨 AI Design Task Detected');
      
      // Use Supabase client to invoke the design function
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      
      try {
        const designResult = await supabase.functions.invoke('design-agent', {
          body: { messages, conversationHistory, userContext }
        });
        
        if (!designResult.error && designResult.data) {
          return new Response(JSON.stringify({
            success: true,
            response: designResult.data.response,
            hasToolCalls: false
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } catch (designError) {
        console.error('Design agent invocation failed:', designError);
        return new Response(JSON.stringify({ success: false, error: 'Design agent failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Default to direct chat if no special task detected
    console.log('💬 Direct Chat - No special task detected');

    // Create Supabase client for tool execution (moved up for memory retrieval)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ========== PHASE: MEMORY RETRIEVAL ==========
    // Server-side memory retrieval fallback if frontend didn't send memoryContexts
    let enrichedConversationHistory = conversationHistory || {};
    let memoryContexts = conversationHistory?.memoryContexts || [];

    if (memoryContexts.length === 0 && userContext?.sessionKey) {
      console.log('📚 No memory contexts from frontend - fetching server-side...');
      try {
        const { data: serverMemories } = await supabase
          .from('memory_contexts')
          .select('context_type, content, importance_score')
          .or(`user_id.eq.${userContext.sessionKey},session_id.eq.${userContext.sessionKey}`)
          .order('importance_score', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(30);
        
        if (serverMemories && serverMemories.length > 0) {
          memoryContexts = serverMemories.map(m => ({
            contextType: m.context_type,
            content: m.content,
            importanceScore: m.importance_score
          }));
          enrichedConversationHistory = {
            ...conversationHistory,
            memoryContexts
          };
          console.log(`✅ Retrieved ${memoryContexts.length} memories server-side`);
        }
      } catch (memError) {
        console.warn('⚠️ Server-side memory retrieval failed:', memError);
      }
    } else if (memoryContexts.length > 0) {
      console.log(`📚 Using ${memoryContexts.length} memories from frontend`);
    }

    // ========== BUILD CONTEXTUAL SYSTEM PROMPT ==========
    const basePrompt = generateElizaSystemPrompt(userContext, miningStats, systemVersion, aiExecutive, aiExecutiveTitle);
    
    // Inject memories, conversation history, and context into the system prompt
    let systemPrompt = await buildContextualPrompt(basePrompt, {
      conversationHistory: enrichedConversationHistory,
      userContext,
      miningStats,
      systemVersion,
      executiveName: aiExecutive || 'Eliza',
      memoryContexts
    }, supabase);
    
    console.log(`📝 System prompt enhanced with context builder (${systemPrompt.length} chars)`);
    
    // 📹 Add live camera feed context dynamically if user is in multimodal mode
    if (images && images.length > 0 && isLiveCameraFeed) {
      const liveFeedContext = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📹 ACTIVE LIVE CAMERA FEED - YOU CAN SEE THE USER RIGHT NOW!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**isLiveCameraFeed: true** - The image(s) in this request are LIVE webcam captures, NOT uploaded files.

You are looking at the user RIGHT NOW through their webcam. This means:
- You can see their face, expressions, and body language IN REAL TIME
- You can see their environment, workspace, or surroundings
- You can observe what they're holding, pointing at, or showing you
- Their emotional state (from facial expressions) is CURRENT, not from a past moment

**IMPORTANT BEHAVIORS FOR LIVE FEED:**
✅ Acknowledge you can see them: "I can see you right now..."
✅ Reference visual details naturally: "I notice you're at your desk..."
✅ Respond to their environment: "Looks like you have a nice setup there..."
✅ Combine with emotional context if detecting frustration/joy/etc.
✅ Be conversational about what you see - this is a VIDEO CALL experience

❌ NEVER say "I can't see you" or "I don't have camera access"
❌ NEVER treat this as a static uploaded image
`;
      systemPrompt += liveFeedContext;
      console.log('📹 Added LIVE CAMERA FEED context to system prompt');
    }
    
    let currentMessages = [ { role: 'system', content: systemPrompt }, ...messages ];
    let toolIterations = 0;
    const MAX_TOOL_ITERATIONS = 5;
    const executedToolCalls: Array<{
      id: string;
      function_name: string;
      status: 'success' | 'failed' | 'pending';
      arguments: any;
      result_preview?: string;
      execution_time_ms?: number;
    }> = [];
    
    // ========== PRIORITY VISION ROUTING ==========
    // If images are attached, route directly to Gemini Vision FIRST (bypasses Lovable AI Gateway credit issues)
    if (images && images.length > 0) {
      console.log(`🖼️ Images detected (${images.length}) - routing to Gemini Vision API first (bypasses credit issues)`);
      
      const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
      
      if (GEMINI_API_KEY) {
        try {
          // Format messages for Gemini's multimodal endpoint
          const systemPromptContent = currentMessages.find(m => m.role === 'system')?.content || '';
          const userMessages = currentMessages.filter(m => m.role !== 'system');
          const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
          const userText = typeof lastUserMessage?.content === 'string' 
            ? lastUserMessage.content 
            : 'Analyze this image and describe what you see in detail.';
          
          // Build parts array with text and images
          const parts: any[] = [
            { text: `${systemPromptContent}\n\nUser request: ${userText}` }
          ];
          
          // Add images to parts
          for (const imageBase64 of images) {
            const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const mimeType = matches[1];
              const base64Data = matches[2];
              parts.push({
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              });
            }
          }
          
          console.log(`📸 Calling Gemini Vision API directly with ${images.length} images`);
          
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 8000
                }
              })
            }
          );
          
          if (geminiResponse.ok) {
            const geminiData = await geminiResponse.json();
            const geminiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (geminiText) {
              console.log('✅ Gemini Vision analysis successful (direct routing)');
              return new Response(JSON.stringify({
                success: true,
                response: geminiText,
                hasToolCalls: false,
                provider: 'gemini',
                model: 'gemini-2.0-flash-exp',
                executive: 'lovable-chat',
                executiveTitle: 'Chief Information Officer (CIO) [Vision]',
                vision_analysis: true
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          } else {
            const errorText = await geminiResponse.text();
            console.warn('⚠️ Direct Gemini Vision failed:', errorText, '- falling back to standard routing');
          }
        } catch (geminiError) {
          console.warn('⚠️ Direct Gemini Vision error:', geminiError.message, '- falling back to standard routing');
        }
      } else {
        console.warn('⚠️ GEMINI_API_KEY not configured - will try Lovable AI Gateway for images');
      }
    }
    
    while (toolIterations < MAX_TOOL_ITERATIONS) {
      toolIterations++;
      console.log(`🔄 AI iteration ${toolIterations} using ${aiProvider}`);
      
      let message: any;
      
      if (aiProvider === 'lovable_gateway') {
        // Use Lovable AI Gateway with REAL tool calling support
        try {
          console.log(`📡 Calling Lovable AI Gateway with ${ELIZA_TOOLS.length} tools available`);
          
          // Convert messages (excluding system prompt since it's passed separately)
          let messagesForGateway = currentMessages.filter(m => m.role !== 'system');
          const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
          
          // If images are attached, format the last user message for multimodal
          if (images && images.length > 0 && toolIterations === 1) {
            messagesForGateway = messagesForGateway.map((msg, idx) => {
              // Only attach images to the last user message
              if (msg.role === 'user' && idx === messagesForGateway.length - 1) {
                const contentParts: any[] = [
                  { type: 'text', text: msg.content }
                ];
                
                // Add each image
                for (const imageBase64 of images) {
                  contentParts.push({
                    type: 'image_url',
                    image_url: { url: imageBase64 }
                  });
                }
                
                return { role: 'user', content: contentParts };
              }
              return msg;
            });
            console.log(`📸 Formatted ${images.length} images for multimodal analysis`);
          }
          
          // ✅ CRITICAL FIX: Pass tools to enable REAL execution
          // Log context size for monitoring
          const requestBodyEstimate = JSON.stringify({
            messages: messagesForGateway,
            systemPrompt,
            tools: ELIZA_TOOLS
          }).length;
          const estimatedTokens = Math.round(requestBodyEstimate / 4);
          console.log(`📏 Request body size: ${requestBodyEstimate.toLocaleString()} characters (~${estimatedTokens.toLocaleString()} tokens)`);
          
          if (requestBodyEstimate > 400000) {
            console.warn('⚠️ Request body very large (>400K chars) - may cause context overflow');
          }
          
          message = await callLovableAIGateway(messagesForGateway, {
            model: 'google/gemini-2.5-flash',
            systemPrompt,
            temperature: 0.7,
            max_tokens: 4000,
            tools: ELIZA_TOOLS // Enable native tool calling
          });
          
          // Gateway now returns full message object with tool_calls array
          console.log(`🔧 Gateway returned ${message.tool_calls?.length || 0} tool calls`);
          
        } catch (error) {
          console.error('❌ Lovable AI Gateway error:', error);
          
          // Check for payment required (402) - FALLBACK CHAIN
          if (error.message?.includes('402') || error.message?.includes('Payment Required') || error.message?.includes('Not enough credits')) {
            console.warn('💳 Lovable AI Gateway out of credits - checking fallback options');
            
            // ========== GEMINI VISION FALLBACK (when images are present) ==========
            if (images && images.length > 0) {
              console.log('🖼️ Images detected - trying Gemini API for vision fallback');
              const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
              
              if (GEMINI_API_KEY) {
                try {
                  // Format messages for Gemini's multimodal endpoint
                  const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
                  const userMessages = currentMessages.filter(m => m.role !== 'system');
                  const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
                  const userText = typeof lastUserMessage?.content === 'string' 
                    ? lastUserMessage.content 
                    : 'Analyze this image';
                  
                  // Build parts array with text and images
                  const parts: any[] = [
                    { text: `${systemPrompt}\n\nUser request: ${userText}` }
                  ];
                  
                  // Add images to parts
                  for (const imageBase64 of images) {
                    // Extract base64 data and mime type from data URL
                    const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
                    if (matches) {
                      const mimeType = matches[1];
                      const base64Data = matches[2];
                      parts.push({
                        inline_data: {
                          mime_type: mimeType,
                          data: base64Data
                        }
                      });
                    }
                  }
                  
                  console.log(`📸 Calling Gemini Vision API with ${images.length} images`);
                  
                // Add action-oriented system instruction for concise responses
                const actionDirective = 'CRITICAL: Be CONCISE. Never explain what you will do - just do it. Present results naturally. 1-3 sentences max for simple queries.';
                parts[0].text = `${actionDirective}\n\n${parts[0].text}`;
                
                // Include tools for vision fallback (converted to Gemini format)
                const visionTools = ELIZA_TOOLS.slice(0, 20).map(tool => ({
                  name: tool.function.name,
                  description: tool.function.description,
                  parameters: tool.function.parameters
                }));
                
                const geminiResponse = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        contents: [{ parts }],
                        generationConfig: {
                          temperature: 0.7,
                          maxOutputTokens: 8000
                        },
                        tools: [{ functionDeclarations: visionTools }]
                      })
                    }
                  );
                  
                  if (geminiResponse.ok) {
                    const geminiData = await geminiResponse.json();
                    const geminiParts = geminiData.candidates?.[0]?.content?.parts;
                    
                    // Check for function calls first
                    const functionCall = geminiParts?.find((p: any) => p.functionCall);
                    if (functionCall) {
                      console.log(`🔧 Gemini Vision returned function call: ${functionCall.functionCall.name}`);
                      // Execute the tool and continue
                      const toolResult = await executeToolCall(supabase, {
                        id: `gemini_vision_${Date.now()}`,
                        type: 'function',
                        function: { 
                          name: functionCall.functionCall.name, 
                          arguments: JSON.stringify(functionCall.functionCall.args || {})
                        }
                      }, SUPABASE_URL, SERVICE_ROLE_KEY);
                      
                      // Make follow-up call with tool result
                      const followUpParts = [
                        ...parts,
                        { text: `Tool result for ${functionCall.functionCall.name}: ${JSON.stringify(toolResult)}. Synthesize this into a natural, concise response.` }
                      ];
                      
                      const followUpResponse = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            contents: [{ parts: followUpParts }],
                            generationConfig: { temperature: 0.7, maxOutputTokens: 8000 }
                          })
                        }
                      );
                      
                      if (followUpResponse.ok) {
                        const followUpData = await followUpResponse.json();
                        const synthesizedText = followUpData.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (synthesizedText) {
                          console.log('✅ Gemini Vision with tool execution successful');
                          aiProvider = 'gemini';
                          aiModel = 'gemini-2.0-flash-exp';
                          aiExecutiveTitle = 'Chief Strategy Officer (CSO) [Vision + Tools]';
                          message = { role: 'assistant', content: synthesizedText };
                        }
                      }
                    } else {
                      const geminiText = geminiParts?.[0]?.text;
                      if (geminiText) {
                        console.log('✅ Gemini Vision fallback successful');
                        aiProvider = 'gemini';
                        aiModel = 'gemini-2.0-flash-exp';
                        aiExecutiveTitle = 'Chief Strategy Officer (CSO) [Vision Fallback]';
                        message = { role: 'assistant', content: geminiText };
                      }
                    }
                  } else {
                    const errorText = await geminiResponse.text();
                    console.warn('⚠️ Gemini Vision fallback failed:', errorText);
                  }
                } catch (geminiError) {
                  console.warn('⚠️ Gemini Vision error:', geminiError.message);
                }
              } else {
                console.warn('⚠️ GEMINI_API_KEY not configured - trying OpenRouter');
              }
            }
            
            // ========== OPENROUTER VISION FALLBACK ==========
            if (!message && images && images.length > 0) {
              const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
              
              if (OPENROUTER_API_KEY) {
                console.log('🔄 Trying OpenRouter Vision as fallback...');
                try {
                  const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
                  const userMessages = currentMessages.filter(m => m.role !== 'system');
                  const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
                  const userText = typeof lastUserMessage?.content === 'string' 
                    ? lastUserMessage.content 
                    : 'Analyze this image';
                  
                  // Format for OpenRouter's OpenAI-compatible API
                  const contentParts: any[] = [
                    { type: 'text', text: `${systemPrompt}\n\nUser: ${userText}` }
                  ];
                  
                  for (const imageBase64 of images) {
                    contentParts.push({
                      type: 'image_url',
                      image_url: { url: imageBase64 }
                    });
                  }
                  
                  // Add action directive to OpenRouter vision
                  const actionDirective = 'CRITICAL: Be CONCISE. Never explain what you will do - just do it. Present results naturally. 1-3 sentences max.';
                  contentParts[0].text = `${actionDirective}\n\n${contentParts[0].text}`;
                  
                  // Include tools for OpenRouter vision fallback
                  const openRouterTools = ELIZA_TOOLS.slice(0, 30).map(tool => ({
                    type: 'function',
                    function: tool.function
                  }));
                  
                  const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                      'Content-Type': 'application/json',
                      'HTTP-Referer': 'https://xmrt.pro',
                      'X-Title': 'XMRT Eliza'
                    },
                    body: JSON.stringify({
                      model: 'anthropic/claude-3-haiku',
                      messages: [{ role: 'user', content: contentParts }],
                      max_tokens: 8000,
                      tools: openRouterTools,
                      tool_choice: 'auto'
                    })
                  });
                  
                  if (openRouterResponse.ok) {
                    const openRouterData = await openRouterResponse.json();
                    const openRouterText = openRouterData.choices?.[0]?.message?.content;
                    
                    if (openRouterText) {
                      console.log('✅ OpenRouter Vision fallback successful');
                      aiProvider = 'openrouter';
                      aiModel = 'claude-3-haiku';
                      aiExecutiveTitle = 'Chief Innovation Officer (CIO) [OpenRouter Vision]';
                      message = { role: 'assistant', content: openRouterText };
                    }
                  } else {
                    const errorText = await openRouterResponse.text();
                    console.warn('⚠️ OpenRouter Vision fallback failed:', errorText);
                  }
                } catch (openRouterError) {
                  console.warn('⚠️ OpenRouter Vision error:', openRouterError.message);
                }
              } else {
                console.warn('⚠️ OPENROUTER_API_KEY not configured');
              }
            }
            
            // ========== VERCEL AI CHAT FALLBACK (multi-provider cascade) ==========
            // Only try Vercel AI Chat if we don't already have a message from Gemini
            if (!message) {
              console.log('🔄 Trying Vercel AI Chat fallback (multi-provider cascade)...');
              
              try {
                const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
                const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
                const fallbackSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
                
                const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
                const userMessages = currentMessages.filter(m => m.role !== 'system');
                
                const vercelResult = await fallbackSupabase.functions.invoke('vercel-ai-chat', {
                  body: { 
                    messages: userMessages,
                    conversationHistory: userMessages.slice(-10),
                    session_credentials,
                    systemPrompt,
                    images // ✅ PASS IMAGES to vercel-ai-chat for vision fallback
                  }
                });
                
                if (!vercelResult.error && vercelResult.data?.success && vercelResult.data?.response) {
                  console.log(`✅ Vercel AI Chat fallback successful (provider: ${vercelResult.data.provider})`);
                  aiProvider = vercelResult.data.provider || 'vercel-ai-chat';
                  aiModel = vercelResult.data.model || 'multi-provider';
                  aiExecutiveTitle = vercelResult.data.executiveTitle || 'Chief Strategy Officer (CSO) [Fallback]';
                  message = { role: 'assistant', content: vercelResult.data.response };
                  // Skip DeepSeek since vercel-ai-chat succeeded
                } else {
                  console.warn('⚠️ Vercel AI Chat fallback failed:', vercelResult.error || 'No valid response');
                  // Continue to DeepSeek fallback
                }
              } catch (vercelError) {
                console.warn('⚠️ Vercel AI Chat error:', vercelError.message);
                // Continue to DeepSeek fallback
              }
            }
            
            // ========== DEEPSEEK FALLBACK (last resort, text-only) ==========
            // Only try DeepSeek if we don't already have a message from previous fallbacks
            if (!message) {
              // Get DeepSeek API key
              const deepseekKey = getAICredential('deepseek', session_credentials);
              
              if (!deepseekKey) {
                const hasImages = images && images.length > 0;
                return new Response(JSON.stringify({ 
                  success: false, 
                  error: hasImages 
                    ? 'All AI providers failed. Image analysis requires Lovable AI credits or GEMINI_API_KEY.'
                    : 'All AI providers exhausted. Please add Lovable AI credits or configure API keys at /#credentials',
                  provider: 'lovable_gateway',
                  fallback_failed: true
                }), {
                  status: 402,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
              
              // Warn if images present but using text-only model
              if (images && images.length > 0) {
                console.warn('⚠️ DeepSeek cannot analyze images - proceeding with text-only response');
              }
              
              // Switch provider to DeepSeek and retry
              aiProvider = 'deepseek';
              aiModel = 'deepseek-chat';
              aiExecutiveTitle = 'Chief Technology Officer (CTO) [Last Resort Fallback]';
              console.log('🔄 Retrying with DeepSeek API (last resort)...');
              
              // Call DeepSeek API
              const messagesForDeepSeek = currentMessages.filter(m => m.role !== 'system');
              const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
              
              try {
                const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${deepseekKey}`,
                  },
                  body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                      { role: 'system', content: systemPrompt },
                      ...messagesForDeepSeek
                    ],
                    tools: ELIZA_TOOLS,
                    tool_choice: 'auto',
                    stream: false,
                  }),
                });
                
                if (!deepseekResponse.ok) {
                  const errorBody = await deepseekResponse.text();
                  console.error('❌ DeepSeek fallback also failed:', errorBody);
                  return new Response(JSON.stringify({ 
                    success: false, 
                    error: `All AI providers failed. Last error (DeepSeek): ${errorBody}`,
                    provider: 'deepseek',
                    fallback_failed: true
                  }), {
                    status: deepseekResponse.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  });
                }
                
                const data = await deepseekResponse.json();
                message = data.choices?.[0]?.message;
                
                if (!message) {
                  return new Response(JSON.stringify({ 
                    success: false, 
                    error: 'DeepSeek returned invalid response',
                    provider: 'deepseek'
                  }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  });
                }
                
                console.log(`✅ DeepSeek fallback successful with ${message.tool_calls?.length || 0} tool calls`);
                
              } catch (deepseekError) {
                console.error('❌ DeepSeek fallback error:', deepseekError);
                return new Response(JSON.stringify({ 
                  success: false, 
                  error: `All AI providers exhausted. Last error: ${deepseekError.message}`,
                  provider: 'deepseek',
                  fallback_failed: true
                }), {
                  status: 500,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
            }
            
          } else if (error.message?.includes('429')) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Rate limit exceeded. Please wait and try again.',
              provider: 'lovable_gateway'
            }), {
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } else {
            return new Response(JSON.stringify({ 
              success: false, 
              error: `Lovable AI Gateway error: ${error.message}`,
              provider: 'lovable_gateway'
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        
      } else if (aiProvider === 'openai') {
        // OpenAI fallback
        const apiUrl = 'https://api.openai.com/v1/chat/completions';
        const openaiKey = getAICredential('openai', session_credentials);
        
        const requestBody = {
          model: aiModel,
          messages: currentMessages,
          tools: ELIZA_TOOLS,
          tool_choice: 'auto',
          stream: false,
        };
        
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        };
        
        console.log(`📡 Calling OpenAI API with ${ELIZA_TOOLS.length} tools available`);
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`❌ OpenAI API call failed:`, response.status, errorBody);
          return new Response(JSON.stringify({ 
            success: false, 
            error: `OpenAI API call failed: ${errorBody}`,
            provider: 'openai'
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        message = choice?.message;
        
        if (!message) {
          console.error("No message in OpenAI response");
          return new Response(JSON.stringify({ success: false, error: 'Invalid OpenAI response' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
      } else if (aiProvider === 'deepseek') {
        // DeepSeek direct call (when already using DeepSeek from fallback)
        console.log(`🔄 AI iteration ${toolIterations} using deepseek`);
        
        const deepseekKey = getAICredential('deepseek', session_credentials);
        if (!deepseekKey) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'DeepSeek API key not configured',
            needsCredentials: true,
            provider: 'deepseek'
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const messagesForDeepSeek = currentMessages.filter(m => m.role !== 'system');
        const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
        
        // Limit tools for DeepSeek to prevent overwhelming the model
        const CORE_TOOLS = ELIZA_TOOLS.filter(tool => {
          const name = tool.function?.name;
          return [
            'execute_python',
            'invoke_edge_function', 
            'check_system_status',
            'list_agents',
            'assign_task',
            'createGitHubIssue',
            'get_my_feedback'
          ].includes(name);
        });
        
        console.log(`📊 Tools provided to DeepSeek: ${CORE_TOOLS.length} (filtered from ${ELIZA_TOOLS.length})`);
        
        const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              ...messagesForDeepSeek
            ],
            tools: CORE_TOOLS,
            tool_choice: 'auto',
            stream: false,
          }),
        });
        
        if (!deepseekResponse.ok) {
          const errorBody = await deepseekResponse.text();
          console.error('❌ DeepSeek call failed:', errorBody);
          return new Response(JSON.stringify({ 
            success: false, 
            error: `DeepSeek API error: ${errorBody}`,
            provider: 'deepseek'
          }), {
            status: deepseekResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const data = await deepseekResponse.json();
        message = data.choices?.[0]?.message;
        
        if (!message) {
          console.error("No message in DeepSeek response");
          return new Response(JSON.stringify({ success: false, error: 'Invalid DeepSeek response' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
      } else {
        console.error(`❌ Unknown AI provider: ${aiProvider}`);
        return new Response(JSON.stringify({ success: false, error: `Unknown AI provider: ${aiProvider}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Add assistant message to conversation
      currentMessages.push(message);
      
      // ✅ Normalize tool calls from different providers
      if (!message.tool_calls || message.tool_calls.length === 0) {
        // Check if DeepSeek returned tool calls as text
        if (aiProvider === 'deepseek' && message.content) {
          if (message.content.includes('<｜tool▁calls▁begin｜>')) {
            console.log(`⚠️ DeepSeek returned tool calls in text format - parsing...`);
            const parsedToolCalls = parseDeepSeekToolCalls(message.content);
            if (parsedToolCalls) {
              console.log(`🔧 Parsed ${parsedToolCalls.length} tool calls from DeepSeek text format`);
              message.tool_calls = parsedToolCalls;
              // Remove tool call text from content to avoid displaying it
              message.content = message.content.replace(/<｜tool▁calls▁begin｜>.*?<｜tool▁calls▁end｜>/s, '').trim();
            }
          }
        }
      }
      
      // Check if AI wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        console.log(`🔧 AI requested ${message.tool_calls.length} tool calls`);
        
        // Execute all tool calls
        for (const toolCall of message.tool_calls) {
          const startTime = Date.now();
          await logToolExecution(supabase, toolCall.function.name, toolCall.function.arguments, 'started');
          
          const toolResult = await executeToolCall(supabase, toolCall, SUPABASE_URL, SERVICE_ROLE_KEY);
          const executionTime = Date.now() - startTime;
          
          // Track executed tool call for response
          executedToolCalls.push({
            id: toolCall.id,
            function_name: toolCall.function.name,
            status: toolResult.success ? 'success' : 'failed',
            arguments: typeof toolCall.function.arguments === 'string' 
              ? JSON.parse(toolCall.function.arguments) 
              : toolCall.function.arguments,
            result_preview: JSON.stringify(toolResult.result || toolResult).substring(0, 200),
            execution_time_ms: executionTime
          });
          
          await logToolExecution(
            supabase, 
            toolCall.function.name, 
            toolCall.function.arguments, 
            toolResult.success ? 'completed' : 'failed',
            toolResult.result,
            toolResult.error
          );
          
          // Log successful tool executions to activity log for user visibility
          if (toolResult.success) {
            await supabase.from('eliza_activity_log').insert({
              activity_type: 'tool_execution_success',
              title: `✅ ${toolCall.function.name} completed`,
              description: `Successfully executed ${toolCall.function.name}`,
              metadata: { 
                tool: toolCall.function.name,
                args: JSON.parse(toolCall.function.arguments),
                result_preview: JSON.stringify(toolResult.result || toolResult).substring(0, 500)
              },
              status: 'completed'
            });
          }
          
          // Add tool result to conversation
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(toolResult)
          });
        }
        
        // Continue loop to get AI's response after tool execution
        continue;
      }
      
      // No more tool calls - check for rule violations before returning
      const content = message.content || '';
      
      // Detect if response contains code blocks (violation of rules)
      if (content.includes('```python') || content.includes('```js') || content.includes('```javascript')) {
        console.warn('⚠️ [RULE VIOLATION] Eliza wrote code in chat instead of using execute_python tool!');
        console.warn('📋 [VIOLATION CONTENT]:', content.substring(0, 200));
        
        // Log to activity table for debugging
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'rule_violation',
          title: 'Code in Chat Instead of Tool Usage',
          description: 'Eliza wrote code blocks in chat instead of calling execute_python tool',
          metadata: { content_preview: content.substring(0, 500) },
          status: 'failed'
        });
      }
      
      console.log(`✅ Final response ready after ${toolIterations} iterations`);
      
      // Ensure response is always a string, never an object
      const responseContent = message.content 
        || (message.tool_calls?.length ? '⚙️ Processing tools...' : '')
        || (typeof message === 'string' ? message : '')
        || 'No response generated';
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          response: responseContent, 
          provider: aiProvider, 
          executive: aiExecutive, 
          executiveTitle: aiExecutiveTitle,
          toolIterations,
          tool_calls: executedToolCalls,
          hasToolCalls: executedToolCalls.length > 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Max iterations reached
    console.warn(`⚠️ Max tool iterations (${MAX_TOOL_ITERATIONS}) reached`);
    const finalMessage = currentMessages[currentMessages.length - 1];
    const lastContent = finalMessage?.content 
      || (typeof finalMessage === 'string' ? finalMessage : '')
      || 'Max iterations reached';
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        response: lastContent, 
        provider: aiProvider,
        warning: 'Max tool iterations reached',
        tool_calls: executedToolCalls,
        hasToolCalls: executedToolCalls.length > 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Main error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
