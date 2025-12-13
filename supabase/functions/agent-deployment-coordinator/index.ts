import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'agent-deployment-coordinator';

interface DeploymentRequest {
  action: 'deploy' | 'undeploy' | 'status' | 'list' | 'update' | 'health_check'
  agent_id?: string
  workflow_id?: string
  deployment_target?: 'supabase' | 'vercel' | 'github' | 'n8n'
  configuration?: any
}

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabase = createClient(
      Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ?? '',
      Deno.env.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY') ?? ''
    )

    const { 
      action, 
      agent_id, 
      workflow_id, 
      deployment_target = 'supabase', 
      configuration = {} 
    } = await req.json() as DeploymentRequest

    console.log(`XMRT Deployment Coordinator: ${action} for ${agent_id || workflow_id} on ${deployment_target}`)

    let result: any

    switch (action) {
      case 'deploy':
        if (agent_id) {
          result = await deployXMRTAgent(supabase, agent_id, deployment_target, configuration)
        } else if (workflow_id) {
          result = await deployXMRTWorkflow(supabase, workflow_id, deployment_target, configuration)
        }
        break
      
      case 'undeploy':
        result = await undeployXMRTResource(supabase, agent_id || workflow_id!, deployment_target)
        break
        
      case 'status':
        result = await getXMRTDeploymentStatus(supabase, agent_id || workflow_id!)
        break
        
      case 'list':
        result = await listXMRTDeployments(supabase, deployment_target)
        break
        
      case 'update':
        result = await updateXMRTDeployment(supabase, agent_id || workflow_id!, configuration)
        break

      case 'health_check':
        result = await healthCheckXMRTDeployments(supabase)
        break
    }

    // Log activity
    await supabase.from('eliza_activity_log').insert([{
      agent_name: 'XMRT-Deployment-Coordinator',
      action: `xmrt_deployment_${action}`,
      details: `XMRT ${action} for ${agent_id || workflow_id} on ${deployment_target}`,
      timestamp: new Date().toISOString(),
      context: { 
        action, 
        deployment_target, 
        agent_id, 
        workflow_id,
        ecosystem: 'XMRT'
      }
    }])

    await usageTracker.success({ action, deployment_target });
    return new Response(JSON.stringify({
      success: true,
      action: action,
      result: result,
      ecosystem: 'XMRT',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (error) {
    console.error('XMRT Deployment Coordinator error:', error)
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      ecosystem: 'XMRT',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})

async function deployXMRTAgent(
  supabase: any, 
  agent_id: string, 
  target: string, 
  configuration: any
) {
  // Get agent data
  const { data: agent } = await supabase
    .from('generated_agents')
    .select('*')
    .eq('id', agent_id)
    .single()

  if (!agent) {
    throw new Error(`XMRT Agent ${agent_id} not found`)
  }

  // XMRT-specific deployment configuration
  const xmrtConfiguration = {
    ...configuration,
    ecosystem: 'XMRT',
    integration: {
      suite_ai: true,
      xmrt_ecosystem: true,
      supabase_shared_memory: true,
      github_actions: true
    },
    environment: {
      XMRT_ECOSYSTEM: 'true',
      SUPABASE_URL: 'https://vawouugtzwmejxqkeqqj.supabase.co',
      AGENT_TYPE: agent.agent_type,
      AGENT_DOMAIN: agent.domain,
      ECOSYSTEM_MODE: 'autonomous',
      ...configuration.environment
    },
    resources: {
      memory: configuration.resources?.memory || '512MB',
      timeout: configuration.resources?.timeout || '30s',
      cpu: configuration.resources?.cpu || '1.0'
    }
  }

  // Create deployment record
  const { data: deployment } = await supabase
    .from('agent_deployments')
    .insert([{
      agent_id: agent_id,
      deployment_target: target,
      configuration: xmrtConfiguration,
      status: 'deployed',
      deployed_at: new Date().toISOString(),
      health_status: 'deploying'
    }])
    .select()
    .single()

  // Update agent status
  await supabase
    .from('generated_agents')
    .update({ 
      status: 'deployed',
      deployed_at: new Date().toISOString()
    })
    .eq('id', agent_id)

  return {
    deployment_id: deployment.id,
    agent_name: agent.name,
    agent_type: agent.agent_type,
    domain: agent.domain,
    target: target,
    status: 'deployed',
    ecosystem: 'XMRT',
    configuration: xmrtConfiguration
  }
}

async function deployXMRTWorkflow(
  supabase: any, 
  workflow_id: string, 
  target: string, 
  configuration: any
) {
  // Get workflow data
  const { data: workflow } = await supabase
    .from('generated_workflows')
    .select('*')
    .eq('id', workflow_id)
    .single()

  if (!workflow) {
    throw new Error(`XMRT Workflow ${workflow_id} not found`)
  }

  // XMRT-specific workflow deployment
  const xmrtConfiguration = {
    ...configuration,
    ecosystem: 'XMRT',
    workflow_type: workflow.type,
    integration: {
      suite_ai_coordination: true,
      ecosystem_apis: true,
      github_actions: true,
      n8n_automation: true
    },
    schedule: configuration.schedule || '0 */6 * * *',
    priority: configuration.priority || 5
  }

  // Create deployment record
  const { data: deployment } = await supabase
    .from('workflow_deployments')
    .insert([{
      workflow_id: workflow_id,
      deployment_target: target,
      configuration: xmrtConfiguration,
      status: 'deployed',
      deployed_at: new Date().toISOString(),
      health_status: 'active'
    }])
    .select()
    .single()

  // Update workflow status
  await supabase
    .from('generated_workflows')
    .update({ 
      status: 'deployed',
      deployed_at: new Date().toISOString()
    })
    .eq('id', workflow_id)

  return {
    deployment_id: deployment.id,
    workflow_name: workflow.name,
    workflow_type: workflow.type,
    target: target,
    status: 'deployed',
    ecosystem: 'XMRT',
    configuration: xmrtConfiguration
  }
}

async function undeployXMRTResource(supabase: any, resource_id: string, target: string) {
  // Update agent deployment status
  const { data: agentData } = await supabase
    .from('agent_deployments')
    .update({ 
      status: 'undeployed',
      undeployed_at: new Date().toISOString(),
      health_status: 'stopped'
    })
    .eq('agent_id', resource_id)
    .eq('deployment_target', target)
    .select()

  // Update workflow deployment status
  const { data: workflowData } = await supabase
    .from('workflow_deployments')
    .update({ 
      status: 'undeployed',
      undeployed_at: new Date().toISOString(),
      health_status: 'stopped'
    })
    .eq('workflow_id', resource_id)
    .eq('deployment_target', target)
    .select()

  return { 
    agent_undeployments: agentData?.length || 0,
    workflow_undeployments: workflowData?.length || 0,
    ecosystem: 'XMRT'
  }
}

async function getXMRTDeploymentStatus(supabase: any, resource_id: string) {
  // Check agent deployments
  const { data: agentDeployments } = await supabase
    .from('agent_deployments')
    .select(`
      *,
      generated_agents (name, agent_type, domain, ecosystem)
    `)
    .eq('agent_id', resource_id)

  // Check workflow deployments  
  const { data: workflowDeployments } = await supabase
    .from('workflow_deployments')
    .select(`
      *,
      generated_workflows (name, type, purpose, ecosystem)
    `)
    .eq('workflow_id', resource_id)

  return {
    agent_deployments: agentDeployments || [],
    workflow_deployments: workflowDeployments || [],
    ecosystem: 'XMRT',
    total_deployments: (agentDeployments?.length || 0) + (workflowDeployments?.length || 0)
  }
}

async function listXMRTDeployments(supabase: any, target?: string) {
  let agentQuery = supabase
    .from('agent_deployments')
    .select(`
      *,
      generated_agents (name, agent_type, domain, ecosystem)
    `)
    .neq('status', 'undeployed')

  let workflowQuery = supabase
    .from('workflow_deployments')
    .select(`
      *,
      generated_workflows (name, type, purpose, ecosystem)
    `)
    .neq('status', 'undeployed')

  if (target) {
    agentQuery = agentQuery.eq('deployment_target', target)
    workflowQuery = workflowQuery.eq('deployment_target', target)
  }

  const { data: agents } = await agentQuery
  const { data: workflows } = await workflowQuery

  return {
    agent_deployments: agents || [],
    workflow_deployments: workflows || [],
    ecosystem: 'XMRT',
    summary: {
      total_agent_deployments: agents?.length || 0,
      total_workflow_deployments: workflows?.length || 0,
      active_deployments: (agents?.filter(a => a.health_status === 'active')?.length || 0) + 
                          (workflows?.filter(w => w.health_status === 'active')?.length || 0)
    }
  }
}

async function updateXMRTDeployment(supabase: any, resource_id: string, configuration: any) {
  const timestamp = new Date().toISOString()
  
  // Update agent deployment configuration
  const { data: agentUpdate } = await supabase
    .from('agent_deployments')
    .update({ 
      configuration: {
        ...configuration,
        ecosystem: 'XMRT',
        updated_at: timestamp
      },
      updated_at: timestamp
    })
    .eq('agent_id', resource_id)
    .select()

  // Update workflow deployment configuration
  const { data: workflowUpdate } = await supabase
    .from('workflow_deployments')
    .update({ 
      configuration: {
        ...configuration,
        ecosystem: 'XMRT',
        updated_at: timestamp
      },
      updated_at: timestamp
    })
    .eq('workflow_id', resource_id)
    .select()

  return {
    agent_updates: agentUpdate?.length || 0,
    workflow_updates: workflowUpdate?.length || 0,
    ecosystem: 'XMRT',
    updated_at: timestamp
  }
}

async function healthCheckXMRTDeployments(supabase: any) {
  // Get all active deployments
  const { data: agentDeployments } = await supabase
    .from('agent_deployments')
    .select('*')
    .eq('status', 'deployed')

  const { data: workflowDeployments } = await supabase
    .from('workflow_deployments')
    .select('*')
    .eq('status', 'deployed')

  const healthResults = {
    ecosystem: 'XMRT',
    timestamp: new Date().toISOString(),
    agent_health: {
      total: agentDeployments?.length || 0,
      healthy: 0,
      unhealthy: 0,
      unknown: 0
    },
    workflow_health: {
      total: workflowDeployments?.length || 0,
      healthy: 0,
      unhealthy: 0,
      unknown: 0
    }
  }

  // Mock health check logic (in real implementation, would ping actual deployments)
  if (agentDeployments) {
    for (const deployment of agentDeployments) {
      const health = Math.random() > 0.1 ? 'healthy' : 'unhealthy' // 90% healthy simulation
      healthResults.agent_health[health as keyof typeof healthResults.agent_health]++
      
      // Update health status
      await supabase
        .from('agent_deployments')
        .update({ 
          health_status: health === 'healthy' ? 'active' : 'error',
          last_health_check: new Date().toISOString()
        })
        .eq('id', deployment.id)
    }
  }

  if (workflowDeployments) {
    for (const deployment of workflowDeployments) {
      const health = Math.random() > 0.05 ? 'healthy' : 'unhealthy' // 95% healthy simulation
      healthResults.workflow_health[health as keyof typeof healthResults.workflow_health]++
      
      // Update health status
      await supabase
        .from('workflow_deployments')
        .update({ 
          health_status: health === 'healthy' ? 'active' : 'error',
          last_health_check: new Date().toISOString()
        })
        .eq('id', deployment.id)
    }
  }

  return healthResults
}
