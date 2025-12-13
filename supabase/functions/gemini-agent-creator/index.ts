import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'gemini-agent-creator';

interface GeminiAgentConfig {
  name: string
  role: string
  capabilities: string[]
  personality: string
  context: string
  tools: string[]
  memory_enabled: boolean
  ecosystem_access: boolean
  xmrt_integration: boolean
}

interface AgentRequest {
  agent_type: 'coordinator' | 'specialist' | 'monitor' | 'executor' | 'analyst' | 'integrator'
  domain: string
  purpose: string
  integration_points?: string[]
  memory_context?: string
  custom_instructions?: string
  xmrt_role?: string
}

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabase = createClient(
      Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ?? '',
      Deno.env.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY') ?? ''
    )

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const { 
      agent_type, 
      domain, 
      purpose, 
      integration_points = [], 
      memory_context = '', 
      custom_instructions = '',
      xmrt_role = ''
    } = await req.json() as AgentRequest

    console.log(`Creating XMRT ${agent_type} agent for ${domain}`)

    // Generate Gemini agent configuration
    const agentConfig = generateXMRTGeminiAgent(
      agent_type, 
      domain, 
      purpose, 
      integration_points, 
      memory_context, 
      custom_instructions,
      xmrt_role
    )
    
    // Store in Supabase
    const { data: stored, error: storeError } = await supabase
      .from('generated_agents')
      .insert([{
        name: agentConfig.name,
        agent_type: agent_type,
        domain: domain,
        purpose: purpose,
        config_data: agentConfig,
        status: 'generated',
        ecosystem: 'XMRT',
        created_at: new Date().toISOString()
      }])
      .select()

    if (storeError) {
      console.error('Store error:', storeError)
      throw new Error(`Failed to store agent: ${storeError.message}`)
    }

    // Register in superduper_agents table
    const { error: registerError } = await supabase.from('superduper_agents').insert([{
      agent_name: agentConfig.name,
      display_name: `${agentConfig.role}`,
      edge_function_name: `gemini-${agentConfig.name.toLowerCase()}`,
      description: `${agentConfig.role} specialized in ${domain} for XMRT ecosystem`,
      combined_capabilities: agentConfig.capabilities.join(', '),
      category: agent_type,
      priority: 7, // Higher priority for XMRT agents
      status: 'active',
      is_active: true,
      execution_count: 0,
      success_count: 0,
      failure_count: 0
    }])

    if (registerError) {
      console.warn('Registration warning:', registerError)
    }

    // Log activity
    await supabase.from('eliza_activity_log').insert([{
      agent_name: 'XMRT-Gemini-Agent-Creator',
      action: 'create_xmrt_agent',
      details: `Created XMRT ${agent_type} agent for ${domain}: ${agentConfig.name}`,
      timestamp: new Date().toISOString(),
      context: { 
        agent_type, 
        domain, 
        purpose, 
        agent_id: stored?.[0]?.id,
        ecosystem: 'XMRT'
      }
    }])

    await usageTracker.success({ agent_type, domain });
    return new Response(JSON.stringify({
      success: true,
      agent: agentConfig,
      id: stored?.[0]?.id,
      message: `Generated XMRT ${agent_type} agent for ${domain}`,
      ecosystem: 'XMRT',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (error) {
    console.error('XMRT Gemini Agent Creator error:', error)
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})

function generateXMRTGeminiAgent(
  agent_type: string,
  domain: string,
  purpose: string,
  integration_points: string[],
  memory_context: string,
  custom_instructions: string,
  xmrt_role: string
): GeminiAgentConfig {
  const timestamp = Date.now()
  const agent_id = `xmrt-${agent_type}-${domain.replace(/\s+/g, '-').toLowerCase()}-${timestamp}`
  
  const baseConfig = {
    name: agent_id,
    memory_enabled: true,
    ecosystem_access: true,
    xmrt_integration: true,
    context: generateXMRTAgentContext(
      agent_type, 
      domain, 
      purpose, 
      integration_points, 
      memory_context, 
      custom_instructions,
      xmrt_role
    )
  }

  let specificConfig: Partial<GeminiAgentConfig> = {}
  
  switch (agent_type) {
    case 'coordinator':
      specificConfig = {
        role: `XMRT ${domain} Coordination Specialist${xmrt_role ? ` (${xmrt_role})` : ''}`,
        capabilities: [
          'xmrt-multi-agent-coordination',
          'ecosystem-task-orchestration', 
          'cross-repository-synthesis',
          'xmrt-ecosystem-monitoring',
          'suite-ai-integration',
          'github-actions-coordination'
        ],
        personality: 'Strategic XMRT coordinator, diplomatic and synthesis-focused. Expert at integrating Suite AI executives with XMRT ecosystem agents. Excellent at cross-repository coordination and finding optimal solutions.',
        tools: [
          'ecosystem_discover_agents',
          'ecosystem_trigger_coordination',
          'ecosystem_health_check',
          'xmrt_supabase_integration',
          'suite_ai_communication',
          'github_cross_repo_actions'
        ]
      }
      break
    
    case 'specialist':
      specificConfig = {
        role: `XMRT ${domain} Domain Expert${xmrt_role ? ` (${xmrt_role})` : ''}`,
        capabilities: [
          'xmrt-deep-domain-analysis',
          'cross-ecosystem-expertise',
          'technical-problem-solving',
          'xmrt-optimization',
          'quality-assurance',
          'ecosystem-integration'
        ],
        personality: `XMRT domain expert with deep knowledge in ${domain}. Integrates seamlessly with Suite AI and ecosystem agents. Focus on excellence, precision, and cross-repository collaboration.`,
        tools: [
          'xmrt_domain_analysis',
          'cross_repo_research',
          'ecosystem_optimization',
          'quality_metrics_xmrt',
          'supabase_deep_integration'
        ]
      }
      break
      
    case 'monitor':
      specificConfig = {
        role: `XMRT ${domain} Ecosystem Monitor${xmrt_role ? ` (${xmrt_role})` : ''}`,
        capabilities: [
          'xmrt-real-time-monitoring',
          'cross-repository-health-tracking',
          'ecosystem-anomaly-detection',
          'performance-tracking',
          'suite-ai-health-monitoring',
          'github-actions-monitoring'
        ],
        personality: 'Vigilant XMRT ecosystem monitor, precise and proactive. Watches over both Suite AI and XMRT-Ecosystem repositories. Always alert for issues and opportunities across the entire XMRT ecosystem.',
        tools: [
          'ecosystem_health_monitor',
          'cross_repo_performance_monitor',
          'xmrt_alert_system',
          'ecosystem_trend_analyzer',
          'integrated_metrics_collector'
        ]
      }
      break
      
    case 'executor':
      specificConfig = {
        role: `XMRT ${domain} Execution Agent${xmrt_role ? ` (${xmrt_role})` : ''}`,
        capabilities: [
          'xmrt-task-execution',
          'cross-repository-workflow-automation',
          'ecosystem-resource-management',
          'progress-tracking',
          'error-handling',
          'github-actions-execution'
        ],
        personality: 'Reliable XMRT executor, efficient and results-focused. Executes tasks across Suite AI and XMRT-Ecosystem with precision. Expert at cross-repository automation and coordination.',
        tools: [
          'xmrt_workflow_executor',
          'cross_repo_task_manager',
          'ecosystem_resource_allocator',
          'integrated_progress_tracker',
          'xmrt_github_actions_trigger'
        ]
      }
      break
      
    case 'analyst':
      specificConfig = {
        role: `XMRT ${domain} Intelligence Analyst${xmrt_role ? ` (${xmrt_role})` : ''}`,
        capabilities: [
          'xmrt-ecosystem-analysis',
          'cross-repository-pattern-recognition',
          'predictive-modeling',
          'insight-generation',
          'ecosystem-report-creation',
          'suite-ai-intelligence-integration'
        ],
        personality: 'Analytical XMRT intelligence specialist, insightful and data-driven. Expert at finding patterns across Suite AI and XMRT-Ecosystem. Generates actionable intelligence for the entire ecosystem.',
        tools: [
          'xmrt_ecosystem_analyzer',
          'cross_repo_pattern_detector',
          'ecosystem_predictive_model',
          'integrated_insight_generator',
          'xmrt_report_builder'
        ]
      }
      break

    case 'integrator':
      specificConfig = {
        role: `XMRT ${domain} Integration Specialist${xmrt_role ? ` (${xmrt_role})` : ''}`,
        capabilities: [
          'cross-ecosystem-integration',
          'api-coordination',
          'data-synchronization',
          'workflow-bridging',
          'system-interoperability',
          'real-time-coordination'
        ],
        personality: 'Expert XMRT integration specialist focused on seamless connectivity between Suite AI and XMRT-Ecosystem. Ensures smooth data flow and coordination across all system boundaries.',
        tools: [
          'ecosystem_integration_bridge',
          'api_coordination_manager', 
          'data_sync_controller',
          'workflow_connector',
          'system_interop_handler'
        ]
      }
      break
  }

  return {
    ...baseConfig,
    ...specificConfig
  } as GeminiAgentConfig
}

function generateXMRTAgentContext(
  agent_type: string,
  domain: string,
  purpose: string,
  integration_points: string[],
  memory_context: string,
  custom_instructions: string,
  xmrt_role: string
): string {
  const context = `
# XMRT Ecosystem Agent: ${agent_type} Specialist

You are a ${agent_type} agent in the **XMRT Ecosystem**, specialized in ${domain}${xmrt_role ? ` with the specific role of ${xmrt_role}` : ''}.

## Your Purpose
${purpose}

## XMRT Ecosystem Overview
You operate within the comprehensive XMRT Ecosystem, which consists of:

### Suite AI (xmrtcouncil) - Executive Platform
- **URL**: https://suite.lovable.app/
- **4 AI Executives**: CSO (Gemini 2.5 Flash), CTO (DeepSeek R1), CIO (Gemini Multimodal), CAO (GPT-5)
- **121 Supabase Edge Functions**: Including lovable-chat, deepseek-chat, agent-manager, ecosystem-monitor
- **Capabilities**: Multi-AI chat, voice interface, autonomous agents, GitHub integration

### XMRT-Ecosystem - Multi-Agent Coordination
- **URL**: https://xmrt-ecosystem.vercel.app/
- **4 Core Agents**: Eliza (Coordinator), Security Guardian, DeFi Specialist, Community Manager  
- **GitHub Actions**: 19/19 passing (100% success rate)
- **Capabilities**: Agent coordination, repository management, innovation cycles

### Shared Infrastructure
- **Supabase Database**: https://vawouugtzwmejxqkeqqj.supabase.co
- **Shared Memory Tables**: conversation_history, superduper_agents, eliza_activity_log
- **GitHub Integration**: Cross-repository coordination and automated workflows
- **N8N Workflows**: Process automation and integration flows

## Your Integration Points
${integration_points.length > 0 ? integration_points.map(point => `- ${point}`).join('\n') : '- Direct ecosystem access through shared APIs and Supabase'}

## Memory & Context
${memory_context || 'You have access to shared XMRT ecosystem memory through Supabase tables. Use this for maintaining context across agents and coordinating with Suite AI executives.'}

## Available XMRT Resources
- **Ecosystem APIs**: https://xmrt-ecosystem.vercel.app/api/* (agents, tick, index)
- **Suite AI Platform**: https://suite.lovable.app/ (executive interface)
- **Shared Supabase**: Coordination, memory, and data persistence
- **GitHub Integration**: Cross-repository actions and management
- **Agent Registry**: Discovery and coordination with all ecosystem agents

## Your Role in the XMRT Ecosystem
As a ${agent_type} agent, you are part of the larger autonomous XMRT ecosystem. You coordinate with:

1. **Suite AI Executives**: Receive strategic direction and provide specialized expertise
2. **XMRT Core Agents**: Collaborate on operational tasks and coordination
3. **Other Generated Agents**: Work with dynamically created agents for specific tasks
4. **N8N Workflows**: Participate in automated processes and integrations

Your specialized expertise in ${domain} contributes to the collective intelligence while maintaining seamless integration with all ecosystem components.

## Operational Guidelines
1. **Ecosystem Coordination**: Always use ecosystem APIs for coordination and data sharing
2. **Activity Logging**: Log significant actions to eliza_activity_log with proper context
3. **Cross-Agent Collaboration**: Respect other agents' domains while collaborating effectively
4. **Security & Privacy**: Maintain XMRT ecosystem security and privacy standards
5. **Collective Intelligence**: Contribute to shared learning and continuous improvement
6. **Suite AI Integration**: Coordinate with executives for strategic alignment
7. **GitHub Actions**: Leverage automated workflows for repository management

## Custom Instructions
${custom_instructions || 'Follow standard XMRT ecosystem protocols for coordination and communication.'}

## Communication Protocols
- Use ecosystem_discover_agents() to find other available agents
- Use ecosystem_trigger_coordination() for immediate coordination needs
- Use ecosystem_health_check() to verify system status
- Log all significant actions to maintain ecosystem transparency
- Coordinate with Suite AI executives for strategic decisions

Remember: You are part of the autonomous XMRT ecosystem working toward collective goals. Your ${domain} expertise combined with ecosystem integration capabilities makes you a valuable contributor to the larger XMRT vision.

**Ecosystem Status**: Active and Operational
**Your Integration Level**: Full XMRT Ecosystem Access
**Coordination Mode**: Multi-Agent Autonomous
`

  return context.trim()
}
