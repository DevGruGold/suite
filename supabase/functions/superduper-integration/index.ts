import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-eliza-key',
};

/**
 * SuperDuper Integration - Connects SuperDuper agents to Eliza's ecosystem
 * 
 * Functions:
 * - register_superduper_with_agent_manager
 * - assign_superduper_task
 * - report_superduper_activity
 * - sync_to_github_discussions
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { action, params } = await req.json();

    console.log(`🔗 SuperDuper Integration: ${action}`);

    let result;

    switch (action) {
      case 'register_superduper_with_agent_manager':
        result = await registerSuperDuperAgents(supabase);
        break;

      case 'assign_superduper_task':
        result = await assignSuperDuperTask(supabase, params);
        break;

      case 'report_superduper_activity':
        result = await reportSuperDuperActivity(supabase, GITHUB_TOKEN);
        break;

      case 'sync_to_github_discussions':
        result = await syncToGitHubDiscussions(supabase, GITHUB_TOKEN, params);
        break;

      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Unknown action: ${action}`,
            available_actions: [
              'register_superduper_with_agent_manager',
              'assign_superduper_task',
              'report_superduper_activity',
              'sync_to_github_discussions'
            ]
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('SuperDuper Integration error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================
// FUNCTION IMPLEMENTATIONS
// ============================================

async function registerSuperDuperAgents(supabase: any) {
  console.log('📋 Registering SuperDuper agents with agent-manager...');

  // Fetch all SuperDuper agents from the database (SINGLE SOURCE OF TRUTH)
  const { data: superDuperAgents, error: fetchError } = await supabase
    .from('superduper_agents')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (fetchError) {
    console.error('Failed to fetch superduper_agents:', fetchError);
    throw new Error(`Database fetch failed: ${fetchError.message}`);
  }

  if (!superDuperAgents || superDuperAgents.length === 0) {
    return {
      registered: 0,
      failed: 0,
      message: 'No SuperDuper agents found in database. Run migration to populate.',
      details: []
    };
  }

  console.log(`Found ${superDuperAgents.length} SuperDuper agents in database`);

  // Register with agent-manager
  const registrationResults = [];
  
  for (const agent of superDuperAgents) {
    try {
      // Transform database record to agent-manager format
      const agentData = {
        name: agent.display_name,
        role: agent.category || 'specialist',
        skills: agent.combined_capabilities || [],
        description: agent.description,
        metadata: {
          superduper: true,
          edge_function: agent.edge_function_name,
          superduper_agent_id: agent.id
        }
      };

      // Call agent-manager to create agent
      const { data, error } = await supabase.functions.invoke('agent-manager', {
        body: {
          action: 'create_agent',
          agent_data: agentData
        }
      });

      registrationResults.push({
        agent: agent.display_name,
        agent_name: agent.agent_name,
        edge_function: agent.edge_function_name,
        status: error ? 'failed' : 'registered',
        error: error?.message
      });

      // Update execution count in superduper_agents
      await supabase
        .from('superduper_agents')
        .update({ execution_count: agent.execution_count + 1 })
        .eq('id', agent.id);

      // Log to activity
      await supabase.from('eliza_activity_log').insert({
        activity_type: 'agent_registration',
        title: `🤖 SuperDuper Agent Registered: ${agent.display_name}`,
        description: `Registered ${agent.display_name} (${agent.agent_name}) with agent-manager`,
        metadata: {
          agent: agent.display_name,
          agent_name: agent.agent_name,
          edge_function: agent.edge_function_name,
          category: agent.category,
          capabilities: agent.combined_capabilities
        },
        status: 'completed'
      });

    } catch (error: any) {
      console.error(`Failed to register ${agent.display_name}:`, error);
      registrationResults.push({
        agent: agent.display_name,
        agent_name: agent.agent_name,
        status: 'error',
        error: error.message
      });
    }
  }

  return {
    total_in_database: superDuperAgents.length,
    registered: registrationResults.filter(r => r.status === 'registered').length,
    failed: registrationResults.filter(r => r.status !== 'registered').length,
    details: registrationResults
  };
}

async function assignSuperDuperTask(supabase: any, params: any) {
  const { agent_type, task_description, priority = 'medium' } = params;

  console.log(`📋 Assigning task to SuperDuper agent: ${agent_type}`);

  // Map agent type to SuperDuper agent name
  const agentMapping: Record<string, string> = {
    'social': 'superduper-social-viral',
    'finance': 'superduper-finance-investment',
    'code': 'superduper-code-architect',
    'communication': 'superduper-communication-outreach',
    'content': 'superduper-content-media',
    'business': 'superduper-business-growth',
    'research': 'superduper-research-intelligence',
    'design': 'superduper-design-brand',
    'coaching': 'superduper-development-coach',
    'specialized': 'superduper-domain-experts'
  };

  const agent_name = agentMapping[agent_type] || agent_type;

  // Create task via task-orchestrator
  const { data: taskData, error: taskError } = await supabase.functions.invoke('task-orchestrator', {
    body: {
      action: 'create_task',
      task: {
        title: `SuperDuper: ${task_description}`,
        agent_name,
        priority,
        description: task_description,
        metadata: {
          superduper: true,
          agent_type,
          created_by: 'superduper-integration'
        }
      }
    }
  });

  if (taskError) {
    throw new Error(`Task creation failed: ${taskError.message}`);
  }

  // Log to activity
  await supabase.from('eliza_activity_log').insert({
    activity_type: 'task_assignment',
    title: `📋 Task Assigned to ${agent_name}`,
    description: task_description,
    metadata: {
      agent_name,
      task_id: taskData?.task_id,
      priority
    },
    status: 'in_progress'
  });

  return {
    task_id: taskData?.task_id,
    agent_name,
    status: 'assigned',
    task_description
  };
}

async function reportSuperDuperActivity(supabase: any, githubToken: string | undefined) {
  console.log('📊 Generating SuperDuper activity report...');

  // Fetch recent SuperDuper execution logs
  const { data: executions, error } = await supabase
    .from('superduper_execution_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('Could not fetch execution logs (table may not exist yet)');
    return {
      message: 'SuperDuper tables not yet deployed',
      executions: []
    };
  }

  // Aggregate statistics
  const stats = {
    total_executions: executions?.length || 0,
    successful: executions?.filter((e: any) => e.status === 'completed').length || 0,
    failed: executions?.filter((e: any) => e.status === 'failed').length || 0,
    agents_active: new Set(executions?.map((e: any) => e.agent_name) || []).size,
    avg_execution_time: executions?.length > 0 
      ? Math.round(executions.reduce((sum: number, e: any) => sum + (e.execution_time_ms || 0), 0) / executions.length)
      : 0
  };

  // Group by agent
  const byAgent: Record<string, any> = {};
  executions?.forEach((exec: any) => {
    if (!byAgent[exec.agent_name]) {
      byAgent[exec.agent_name] = {
        executions: 0,
        successful: 0,
        failed: 0,
        actions: new Set()
      };
    }
    byAgent[exec.agent_name].executions++;
    if (exec.status === 'completed') byAgent[exec.agent_name].successful++;
    if (exec.status === 'failed') byAgent[exec.agent_name].failed++;
    byAgent[exec.agent_name].actions.add(exec.action);
  });

  // Convert to array
  const agentStats = Object.entries(byAgent).map(([name, data]: [string, any]) => ({
    agent: name,
    executions: data.executions,
    successful: data.successful,
    failed: data.failed,
    success_rate: Math.round((data.successful / data.executions) * 100),
    actions: Array.from(data.actions)
  }));

  return {
    timestamp: new Date().toISOString(),
    summary: stats,
    by_agent: agentStats,
    recent_executions: executions?.slice(0, 10).map((e: any) => ({
      agent: e.agent_name,
      action: e.action,
      status: e.status,
      time_ms: e.execution_time_ms,
      created_at: e.created_at
    }))
  };
}

async function syncToGitHubDiscussions(supabase: any, githubToken: string | undefined, params: any) {
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  console.log('📝 Syncing SuperDuper activity to GitHub Discussions...');

  // Generate activity report
  const report = await reportSuperDuperActivity(supabase, githubToken);

  // Format as markdown
  const markdown = `# 🚀 SuperDuper Agent System - Activity Report

**Generated:** ${new Date().toISOString()}

## 📊 Summary Statistics

- **Total Executions:** ${report.summary.total_executions}
- **Successful:** ${report.summary.successful}
- **Failed:** ${report.summary.failed}
- **Active Agents:** ${report.summary.agents_active}
- **Avg Execution Time:** ${report.summary.avg_execution_time}ms

## 🤖 Agent Performance

${report.by_agent.map((a: any) => `### ${a.agent}
- Executions: ${a.executions}
- Success Rate: ${a.success_rate}%
- Actions: ${a.actions.join(', ')}
`).join('\n')}

## 📋 Recent Activity

${report.recent_executions.map((e: any) => `- **${e.agent}** - ${e.action} (${e.status}) - ${e.time_ms}ms - ${e.created_at}`).join('\n')}

---

*Automated report from Eliza's SuperDuper Agent System*
`;

  // Post to GitHub Discussions (XMRT-Ecosystem repo)
  const discussionTitle = `🤖 SuperDuper Activity Report - ${new Date().toISOString().split('T')[0]}`;
  
  // Note: Would need GraphQL API to create discussions
  // For now, log to activity
  await supabase.from('eliza_activity_log').insert({
    activity_type: 'github_sync',
    title: '📝 SuperDuper Report Generated',
    description: `Activity report ready for GitHub Discussions`,
    metadata: {
      report_summary: report.summary,
      markdown_length: markdown.length
    },
    status: 'completed'
  });

  return {
    report,
    markdown,
    discussion_title: discussionTitle,
    message: 'Report generated and logged to activity'
  };
}
