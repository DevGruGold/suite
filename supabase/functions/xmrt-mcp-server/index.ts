import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";
import { TOOL_REGISTRY } from "./tools/tool-registry.ts";
import { RESOURCE_REGISTRY } from "./resources/resource-registry.ts";
import { PROMPT_REGISTRY } from "./prompts/prompt-registry.ts";
import { MCPServerInfo, MCPRequest, MCPResponse, Tool } from "./types.ts";

const MCP_SERVER_INFO: MCPServerInfo = {
  name: "xmrt-mcp-server",
  version: "1.0.0",
  protocolVersion: "2025-06-18",
  capabilities: {
    tools: {},
    resources: {
      subscribe: true,
      listChanged: true
    },
    prompts: {},
    logging: {}
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: MCPRequest = await req.json();
    const { method, params } = body;

    console.log('MCP Request:', { method, params });

    let response: MCPResponse;

    switch (method) {
      case 'initialize':
        response = {
          protocolVersion: MCP_SERVER_INFO.protocolVersion,
          capabilities: MCP_SERVER_INFO.capabilities,
          serverInfo: {
            name: MCP_SERVER_INFO.name,
            version: MCP_SERVER_INFO.version
          }
        };
        break;

      case 'tools/list':
        response = {
          tools: TOOL_REGISTRY
        };
        break;

      case 'tools/call':
        response = await handleToolCall(params, supabase);
        break;

      case 'resources/list':
        response = {
          resources: RESOURCE_REGISTRY
        };
        break;

      case 'resources/read':
        response = await handleResourceRead(params, supabase);
        break;

      case 'resources/subscribe':
        response = await handleResourceSubscribe(params, supabase);
        break;

      case 'prompts/list':
        response = {
          prompts: PROMPT_REGISTRY
        };
        break;

      case 'prompts/get':
        response = await handlePromptGet(params);
        break;

      case 'ping':
        response = { status: 'pong' };
        break;

      default:
        throw new Error(`Unknown method: ${method}`);
    }

    // Log MCP operation
    await supabase.from('webhook_logs').insert({
      webhook_name: 'xmrt_mcp_server',
      trigger_table: 'mcp_operations',
      trigger_operation: method,
      payload: { method, params, response },
      status: 'completed'
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('MCP Server Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleToolCall(params: any, supabase: any): Promise<MCPResponse> {
  const { name, arguments: args } = params;
  
  const tool = TOOL_REGISTRY.find((t: Tool) => t.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  console.log(`Executing tool: ${name}`, args);

  // Route to appropriate edge function based on tool name
  const toolRoutes: Record<string, string> = {
    // AI & Conversation
    'xmrt_chat': 'gemini-chat',
    'xmrt_deepseek_chat': 'deepseek-chat',
    'xmrt_openai_chat': 'openai-chat',
    
    // GitHub
    'xmrt_github_list_repos': 'github-integration',
    'xmrt_github_create_issue': 'github-integration',
    'xmrt_github_search_code': 'github-integration',
    'xmrt_github_get_commits': 'github-integration',
    
    // Mining
    'xmrt_get_mining_stats': 'mining-proxy',
    'xmrt_check_faucet_eligibility': 'system-status',
    'xmrt_claim_faucet': 'system-status',
    
    // Task Orchestration
    'xmrt_create_workflow': 'multi-step-orchestrator',
    'xmrt_assign_task_to_agent': 'task-orchestrator',
    'xmrt_get_task_status': 'task-orchestrator',
    
    // Knowledge & Memory
    'xmrt_store_knowledge': 'knowledge-manager',
    'xmrt_search_knowledge': 'knowledge-manager',
    'xmrt_search_memories': 'knowledge-manager',
    'xmrt_extract_knowledge': 'extract-knowledge',
    
    // Python Execution
    'xmrt_execute_python': 'python-executor',
    'xmrt_fix_python_code': 'autonomous-code-fixer',
    
    // Monitoring
    'xmrt_get_system_status': 'system-status',
    'xmrt_get_ecosystem_metrics': 'ecosystem-monitor',
    'xmrt_get_diagnostics': 'system-diagnostics',
    
    // Self-Optimization
    'xmrt_analyze_skill_gaps': 'self-optimizing-agent-architecture',
    'xmrt_optimize_task_routing': 'self-optimizing-agent-architecture',
    'xmrt_detect_specializations': 'self-optimizing-agent-architecture',
    'xmrt_forecast_workload': 'self-optimizing-agent-architecture',
    'xmrt_autonomous_debugging': 'self-optimizing-agent-architecture',
    'xmrt_run_full_optimization': 'self-optimizing-agent-architecture',
    
    // USPTO Patent Research
    'search_uspto_patents': 'uspto-patent-mcp',
    'get_patent_details': 'uspto-patent-mcp',
    'download_patent_pdf': 'uspto-patent-mcp',
    'analyze_inventor_patents': 'uspto-patent-mcp',
    
    // XMRTCharger
    'xmrt_charger_connect_device': 'monitor-device-connections',
    'xmrt_charger_issue_command': 'issue-engagement-command',
    'xmrt_charger_validate_pop': 'validate-pop-event',
    'xmrt_charger_get_metrics': 'aggregate-device-metrics'
  };

  const targetFunction = toolRoutes[name];
  if (!targetFunction) {
    throw new Error(`No route configured for tool: ${name}`);
  }

  // Transform args based on target function
  let functionPayload = transformArgsForFunction(name, args);

  const { data, error } = await supabase.functions.invoke(targetFunction, {
    body: functionPayload
  });

  if (error) {
    throw new Error(`Tool execution failed: ${error.message}`);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

function transformArgsForFunction(toolName: string, args: any): any {
  // Transform MCP tool arguments to match target function expectations
  switch (toolName) {
    case 'xmrt_chat':
    case 'xmrt_deepseek_chat':
    case 'xmrt_openai_chat':
      return { message: args.message, session_id: args.session_id };
    
    case 'xmrt_github_list_repos':
      return { action: 'list_repos', org: args.org || 'DevGruGold' };
    
    case 'xmrt_github_create_issue':
      return { 
        action: 'create_issue', 
        repo: args.repo, 
        title: args.title, 
        body: args.body,
        labels: args.labels 
      };
    
    case 'xmrt_github_search_code':
      return { action: 'search_code', query: args.query, repos: args.repos };
    
    case 'xmrt_store_knowledge':
      return {
        action: 'store_knowledge',
        entity_name: args.entity_name,
        entity_type: args.entity_type,
        description: args.description,
        metadata: args.metadata
      };
    
    case 'xmrt_search_knowledge':
      return {
        action: 'search_knowledge',
        query: args.query,
        entity_types: args.entity_types
      };
    
    case 'xmrt_execute_python':
      return {
        code: args.code,
        purpose: args.purpose,
        timeout: args.timeout || 30
      };
    
    // Self-Optimization tools
    case 'xmrt_analyze_skill_gaps':
      return { action: 'analyze_skill_gaps' };
    
    case 'xmrt_optimize_task_routing':
      return { action: 'optimize_task_routing' };
    
    case 'xmrt_detect_specializations':
      return { action: 'detect_specializations' };
    
    case 'xmrt_forecast_workload':
      return { action: 'forecast_workload', timeframe: args.timeframe || '24h' };
    
    case 'xmrt_autonomous_debugging':
      return { action: 'autonomous_debugging' };
    
    case 'xmrt_run_full_optimization':
      return { action: 'run_full_optimization' };
    
    // XMRTCharger tools
    case 'xmrt_charger_connect_device':
      return { 
        action: 'connect',
        device_fingerprint: args.device_fingerprint,
        battery_level: args.battery_level,
        device_type: args.device_type,
        ip_address: args.ip_address,
        user_agent: args.user_agent
      };
    
    case 'xmrt_charger_issue_command':
      return {
        action: 'command',
        device_id: args.device_id,
        target_all: args.target_all,
        command_type: args.command_type,
        command_payload: args.command_payload,
        priority: args.priority,
        expires_in_minutes: args.expires_in_minutes
      };
    
    case 'xmrt_charger_validate_pop':
      return {
        action: 'validate',
        wallet_address: args.wallet_address,
        device_id: args.device_id,
        event_type: args.event_type,
        event_data: args.event_data,
        session_id: args.session_id
      };
    
    case 'xmrt_charger_get_metrics':
      return {
        action: 'metrics',
        timeframe: args.timeframe || 'daily',
        start_date: args.start_date,
        end_date: args.end_date
      };
    
    // USPTO Patent tools
    case 'search_uspto_patents':
      return {
        method: 'tools/call',
        params: {
          name: 'search_patents',
          arguments: {
            query: args.query,
            rows: args.rows || 25
          }
        }
      };
    
    case 'get_patent_details':
      return {
        method: 'tools/call',
        params: {
          name: 'get_patent_fulltext',
          arguments: {
            patent_number: args.patent_number
          }
        }
      };
    
    case 'download_patent_pdf':
      return {
        method: 'tools/call',
        params: {
          name: 'download_patent_pdf',
          arguments: {
            patent_number: args.patent_number
          }
        }
      };
    
    case 'analyze_inventor_patents':
      return {
        method: 'tools/call',
        params: {
          name: 'search_by_inventor',
          arguments: {
            inventor_name: args.inventor_name,
            date_from: args.date_from,
            rows: 100
          }
        }
      };
    
    default:
      return args;
  }
}

async function handleResourceRead(params: any, supabase: any): Promise<MCPResponse> {
  const { uri } = params;
  
  console.log(`Reading resource: ${uri}`);

  // Parse resource URI
  const [protocol, path] = uri.split('://');
  if (protocol !== 'xmrt') {
    throw new Error(`Invalid protocol: ${protocol}`);
  }

  const [category, ...rest] = path.split('/');
  let contents: any;

  switch (category) {
    case 'mining':
      contents = await fetchMiningResource(rest.join('/'), supabase);
      break;
    case 'dao':
      contents = await fetchDaoResource(rest.join('/'), supabase);
      break;
    case 'knowledge':
      contents = await fetchKnowledgeResource(rest.join('/'), supabase);
      break;
    case 'github':
      contents = await fetchGithubResource(rest.join('/'), supabase);
      break;
    default:
      throw new Error(`Unknown resource category: ${category}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(contents, null, 2)
      }
    ]
  };
}

async function fetchMiningResource(path: string, supabase: any): Promise<any> {
  if (path === 'current-stats') {
    const { data } = await supabase.functions.invoke('mining-proxy', { body: {} });
    return data;
  }
  throw new Error(`Unknown mining resource: ${path}`);
}

async function fetchDaoResource(path: string, supabase: any): Promise<any> {
  if (path === 'proposals') {
    const { data } = await supabase.from('dao_proposals').select('*').eq('status', 'active');
    return data;
  }
  if (path === 'treasury') {
    const { data } = await supabase.from('treasury_balances').select('*');
    return data;
  }
  throw new Error(`Unknown DAO resource: ${path}`);
}

async function fetchKnowledgeResource(path: string, supabase: any): Promise<any> {
  if (path === 'entities') {
    const { data } = await supabase.from('knowledge_entities').select('*').order('confidence_score', { ascending: false }).limit(100);
    return data;
  }
  if (path === 'patterns') {
    const { data } = await supabase.from('learning_patterns').select('*').order('confidence_score', { ascending: false }).limit(50);
    return data;
  }
  throw new Error(`Unknown knowledge resource: ${path}`);
}

async function fetchGithubResource(path: string, supabase: any): Promise<any> {
  if (path === 'repos') {
    const { data } = await supabase.functions.invoke('github-integration', {
      body: { action: 'list_repos', org: 'DevGruGold' }
    });
    return data;
  }
  if (path === 'recent-commits') {
    const { data } = await supabase.functions.invoke('github-integration', {
      body: { action: 'recent_commits', limit: 20 }
    });
    return data;
  }
  throw new Error(`Unknown GitHub resource: ${path}`);
}

async function handleResourceSubscribe(params: any, supabase: any): Promise<MCPResponse> {
  const { uri } = params;
  
  // For now, return success - actual subscriptions would use Supabase Realtime
  return {
    subscribed: true,
    uri
  };
}

async function handlePromptGet(params: any): Promise<MCPResponse> {
  const { name, arguments: args } = params;
  
  const prompt = PROMPT_REGISTRY.find(p => p.name === name);
  if (!prompt) {
    throw new Error(`Prompt not found: ${name}`);
  }

  // Generate prompt text based on template and arguments
  let promptText = generatePromptText(name, args || {});

  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: promptText
        }
      }
    ]
  };
}

function generatePromptText(promptName: string, args: Record<string, any>): string {
  switch (promptName) {
    case 'xmrt_create_proposal':
      return `Create a new DAO governance proposal:
Topic: ${args.topic}
Description: ${args.description}
${args.budget ? `Budget: ${args.budget}` : ''}

Please format this as a formal governance proposal with:
1. Executive Summary
2. Problem Statement
3. Proposed Solution
4. Implementation Timeline
5. Budget Breakdown (if applicable)
6. Success Metrics`;

    case 'xmrt_code_review':
      return `Review the code changes in repository ${args.repo}, PR #${args.pr_number}.

Please analyze:
1. Code quality and best practices
2. Potential bugs or security issues
3. Performance implications
4. Documentation completeness
5. Test coverage
6. Suggestions for improvement`;

    case 'xmrt_debug_issue':
      return `Debug and analyze the following issue:
${args.issue_description}

${args.logs ? `Available logs:\n${args.logs}` : ''}

Please provide:
1. Root cause analysis
2. Potential fixes
3. Prevention strategies
4. Testing recommendations`;

    case 'xmrt_mining_analysis':
      return `Analyze Monero mining performance for the ${args.timeframe || '7d'} timeframe.

Please provide:
1. Hashrate trends and stability
2. Profitability analysis
3. Pool performance metrics
4. Optimization recommendations
5. Comparative analysis with historical data`;

    case 'xmrt_ecosystem_health':
      return `Provide a comprehensive XMRT ecosystem health analysis.

Please analyze:
1. Mining operations status
2. DAO activity and engagement
3. Treasury health and sustainability
4. Agent performance and uptime
5. Knowledge base growth
6. Community engagement metrics
7. Overall system reliability
8. Recommendations for improvement`;

    default:
      return `Execute prompt: ${promptName}`;
  }
}
