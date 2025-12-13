import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'deploy-approved-edge-function';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const body = await req.json().catch(() => ({}));
    const { 
      action = 'process_queue',
      proposal_id,
      auto_deploy = true,
      run_health_check = true,
      version_tag
    } = body;

    console.log(`🚀 [deploy-approved-edge-function] Action: ${action}`, { proposal_id, auto_deploy });

    switch (action) {
      case 'process_queue':
        return await processDeploymentQueue(supabase, auto_deploy, run_health_check, startTime);
      
      case 'deploy_single':
        if (!proposal_id) {
          return errorResponse('proposal_id required for deploy_single action', 400);
        }
        return await deploySingleProposal(supabase, proposal_id, auto_deploy, run_health_check, version_tag, startTime);
      
      case 'get_deployment_status':
        return await getDeploymentStatus(supabase, proposal_id);
      
      case 'rollback':
        if (!proposal_id) {
          return errorResponse('proposal_id required for rollback action', 400);
        }
        return await rollbackDeployment(supabase, proposal_id);
      
      default:
        return errorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (error) {
    console.error('❌ [deploy-approved-edge-function] Error:', error);
    await usageTracker.failure(error.message, 500);
    return errorResponse(error.message, 500);
  }
});

// Helper functions
function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function okResponse(data: any) {
  return new Response(
    JSON.stringify({ ok: true, ...data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Process the deployment queue - deploy all proposals with 'queued_for_deployment' status
async function processDeploymentQueue(
  supabase: any,
  auto_deploy: boolean,
  run_health_check: boolean,
  startTime: number
) {
  console.log('📋 Processing deployment queue...');

  // Fetch proposals ready for deployment
  const { data: proposals, error: fetchError } = await supabase
    .from('edge_function_proposals')
    .select('*')
    .in('status', ['queued_for_deployment', 'approved'])
    .order('updated_at', { ascending: true });

  if (fetchError) {
    console.error('❌ Failed to fetch proposals:', fetchError);
    return errorResponse(`Failed to fetch proposals: ${fetchError.message}`, 500);
  }

  if (!proposals || proposals.length === 0) {
    console.log('✅ No proposals queued for deployment');
    return okResponse({ 
      message: 'No proposals queued for deployment',
      processed: 0,
      execution_time_ms: Date.now() - startTime
    });
  }

  console.log(`📦 Found ${proposals.length} proposals to process`);

  const results = [];
  for (const proposal of proposals) {
    try {
      const deployResult = await deployProposal(supabase, proposal, auto_deploy, run_health_check);
      results.push({
        proposal_id: proposal.id,
        function_name: proposal.function_name,
        ...deployResult
      });
    } catch (error) {
      console.error(`❌ Failed to deploy ${proposal.function_name}:`, error);
      results.push({
        proposal_id: proposal.id,
        function_name: proposal.function_name,
        success: false,
        error: error.message
      });
    }
  }

  // Log activity
  await supabase.from('eliza_activity_log').insert({
    activity_type: 'deployment_queue_processed',
    title: 'Deployment Queue Processed',
    description: `Processed ${proposals.length} proposals: ${results.filter(r => r.success).length} successful`,
    status: results.every(r => r.success) ? 'completed' : 'partial',
    metadata: { results, execution_time_ms: Date.now() - startTime }
  });

  return okResponse({
    processed: proposals.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
    execution_time_ms: Date.now() - startTime
  });
}

// Deploy a single proposal by ID
async function deploySingleProposal(
  supabase: any,
  proposal_id: string,
  auto_deploy: boolean,
  run_health_check: boolean,
  version_tag: string | undefined,
  startTime: number
) {
  const { data: proposal, error: fetchError } = await supabase
    .from('edge_function_proposals')
    .select('*')
    .eq('id', proposal_id)
    .single();

  if (fetchError || !proposal) {
    return errorResponse(`Proposal not found: ${proposal_id}`, 404);
  }

  if (!['approved', 'queued_for_deployment'].includes(proposal.status)) {
    return errorResponse(`Proposal status is '${proposal.status}', must be 'approved' or 'queued_for_deployment'`, 400);
  }

  const result = await deployProposal(supabase, proposal, auto_deploy, run_health_check, version_tag);

  return okResponse({
    proposal_id,
    function_name: proposal.function_name,
    ...result,
    execution_time_ms: Date.now() - startTime
  });
}

// Core deployment logic
async function deployProposal(
  supabase: any,
  proposal: any,
  auto_deploy: boolean,
  run_health_check: boolean,
  version_tag?: string
): Promise<{ success: boolean; error?: string; commit_sha?: string; pr_url?: string; health_check?: any }> {
  const { id, function_name, implementation_code, final_analysis } = proposal;
  
  console.log(`🚀 Deploying function: ${function_name}`);

  // Update status to deploying
  await supabase
    .from('edge_function_proposals')
    .update({ status: 'deploying' })
    .eq('id', id);

  // Extract code from implementation_code or final_analysis
  let functionCode: string | null = null;
  
  if (implementation_code) {
    try {
      const impl = typeof implementation_code === 'string' 
        ? JSON.parse(implementation_code) 
        : implementation_code;
      functionCode = impl.code || impl.generated_code || impl;
    } catch {
      functionCode = implementation_code;
    }
  }
  
  if (!functionCode && final_analysis) {
    try {
      const analysis = typeof final_analysis === 'string'
        ? JSON.parse(final_analysis)
        : final_analysis;
      functionCode = analysis.generated_code || analysis.code;
    } catch {
      // Ignore parse errors
    }
  }

  if (!functionCode || typeof functionCode !== 'string') {
    await updateProposalStatus(supabase, id, 'deployment_failed', {
      error: 'No valid function code found in proposal'
    });
    return { success: false, error: 'No valid function code found in proposal' };
  }

  try {
    // Step 1: Commit the function code to GitHub
    const functionPath = `supabase/functions/${function_name}/index.ts`;
    const commitMessage = `[Governance] Deploy approved function: ${function_name}\n\nProposal ID: ${id}\nApproved by Executive Council`;
    
    console.log(`📝 Committing to ${functionPath}...`);
    
    const commitResult = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'commit_file',
        data: {
          path: functionPath,
          message: commitMessage,
          content: functionCode,
          branch: auto_deploy ? 'main' : `deploy/${function_name}-${Date.now()}`
        }
      }
    });

    if (commitResult.error) {
      throw new Error(`GitHub commit failed: ${commitResult.error.message}`);
    }

    const commit_sha = commitResult.data?.sha || commitResult.data?.commit?.sha;
    console.log(`✅ Function code committed: ${commit_sha}`);

    // Step 2: Update config.toml to register the function
    await updateConfigToml(supabase, function_name, auto_deploy);

    // Step 3: Create PR if not auto-deploying
    let pr_url = null;
    if (!auto_deploy) {
      const prResult = await supabase.functions.invoke('github-integration', {
        body: {
          action: 'create_pull_request',
          data: {
            title: `[Auto-Deploy] ${function_name}`,
            body: generatePRBody(proposal),
            head: `deploy/${function_name}-${Date.now()}`,
            base: 'main'
          }
        }
      });
      pr_url = prResult.data?.html_url;
      console.log(`📋 PR created: ${pr_url}`);
    }

    // Step 4: Wait for Lovable auto-deployment (if auto_deploy)
    let health_check = null;
    if (auto_deploy && run_health_check) {
      console.log('⏳ Waiting 60s for Lovable auto-deployment...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      // Run health check
      health_check = await runHealthCheck(supabase, function_name);
    }

    // Step 5: Update proposal status to deployed
    const deployment_details = {
      deployed_at: new Date().toISOString(),
      commit_sha,
      pr_url,
      health_check,
      version_tag: version_tag || commit_sha?.substring(0, 7),
      auto_deployed: auto_deploy
    };

    await updateProposalStatus(supabase, id, 'deployed', deployment_details);

    // Step 6: Create activity feed entry
    await supabase.from('activity_feed').insert({
      type: 'function_deployed',
      title: `🚀 Function Deployed: ${function_name}`,
      description: `Successfully deployed ${function_name} via governance workflow`,
      data: { proposal_id: id, commit_sha, health_check_passed: health_check?.success }
    });

    // Step 7: Create GitHub discussion announcement
    await supabase.functions.invoke('github-integration', {
      body: {
        action: 'create_discussion',
        data: {
          repositoryId: 'R_kgDONfvCEw',
          categoryId: 'DIC_kwDOPHeChc4CkXxI',
          title: `🚀 [Deployed] ${function_name} is now live!`,
          body: generateDeploymentAnnouncement(proposal, commit_sha, health_check),
          executive: 'council'
        }
      }
    });

    console.log(`✅ Deployment complete for ${function_name}`);

    return { success: true, commit_sha, pr_url, health_check };

  } catch (error) {
    console.error(`❌ Deployment failed for ${function_name}:`, error);
    
    await updateProposalStatus(supabase, id, 'deployment_failed', {
      error: error.message,
      failed_at: new Date().toISOString()
    });

    // Log failure
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'deployment_failed',
      title: `❌ Deployment Failed: ${function_name}`,
      description: error.message,
      status: 'failed',
      metadata: { proposal_id: id, error: error.message }
    });

    return { success: false, error: error.message };
  }
}

// Update config.toml to add the new function
async function updateConfigToml(supabase: any, function_name: string, auto_deploy: boolean) {
  console.log(`📄 Updating config.toml for ${function_name}...`);
  
  // First, get current config.toml
  const getResult = await supabase.functions.invoke('github-integration', {
    body: {
      action: 'get_file_content',
      data: { path: 'supabase/config.toml' }
    }
  });

  if (getResult.error) {
    console.warn('⚠️ Could not fetch config.toml:', getResult.error.message);
    return;
  }

  let configContent = getResult.data?.content || '';
  
  // Decode base64 if needed
  if (getResult.data?.encoding === 'base64') {
    configContent = atob(configContent);
  }

  // Check if function already exists
  if (configContent.includes(`[functions.${function_name}]`)) {
    console.log(`ℹ️ Function ${function_name} already in config.toml`);
    return;
  }

  // Add new function entry before the last section or at the end
  const newEntry = `\n[functions.${function_name}]\nverify_jwt = false\n`;
  
  // Find a good place to insert (after last [functions.*] entry)
  const lastFunctionIndex = configContent.lastIndexOf('[functions.');
  if (lastFunctionIndex !== -1) {
    const nextSectionIndex = configContent.indexOf('\n[', lastFunctionIndex + 1);
    if (nextSectionIndex !== -1) {
      configContent = configContent.slice(0, nextSectionIndex) + newEntry + configContent.slice(nextSectionIndex);
    } else {
      configContent += newEntry;
    }
  } else {
    configContent += newEntry;
  }

  // Commit updated config.toml
  const commitResult = await supabase.functions.invoke('github-integration', {
    body: {
      action: 'commit_file',
      data: {
        path: 'supabase/config.toml',
        message: `[Governance] Register function: ${function_name}`,
        content: configContent,
        branch: auto_deploy ? 'main' : `deploy/${function_name}-${Date.now()}`,
        sha: getResult.data?.sha
      }
    }
  });

  if (commitResult.error) {
    console.warn('⚠️ Could not update config.toml:', commitResult.error.message);
  } else {
    console.log(`✅ config.toml updated for ${function_name}`);
  }
}

// Run health check on deployed function
async function runHealthCheck(supabase: any, function_name: string) {
  console.log(`🏥 Running health check for ${function_name}...`);
  
  try {
    // Get recent logs
    const logsResult = await supabase.functions.invoke('get-edge-function-logs', {
      body: { function_name, limit: 10, time_window_hours: 1 }
    });

    // Try invoking the function
    let invocationSuccess = false;
    try {
      const testResult = await supabase.functions.invoke(function_name, {
        body: { _health_check: true }
      });
      invocationSuccess = !testResult.error;
    } catch {
      invocationSuccess = false;
    }

    return {
      success: invocationSuccess,
      logs_available: !logsResult.error,
      recent_errors: logsResult.data?.error_count || 0,
      checked_at: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      checked_at: new Date().toISOString()
    };
  }
}

// Update proposal status with deployment details
async function updateProposalStatus(supabase: any, id: string, status: string, details: any) {
  await supabase
    .from('edge_function_proposals')
    .update({
      status,
      deployment_details: details,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);
}

// Get deployment status for a proposal
async function getDeploymentStatus(supabase: any, proposal_id?: string) {
  let query = supabase
    .from('edge_function_proposals')
    .select('id, function_name, status, deployment_details, updated_at');
  
  if (proposal_id) {
    query = query.eq('id', proposal_id);
  } else {
    query = query.in('status', ['deploying', 'deployed', 'deployment_failed', 'queued_for_deployment']);
  }

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(20);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return okResponse({ deployments: data || [] });
}

// Rollback a deployment
async function rollbackDeployment(supabase: any, proposal_id: string) {
  const { data: proposal, error } = await supabase
    .from('edge_function_proposals')
    .select('*')
    .eq('id', proposal_id)
    .single();

  if (error || !proposal) {
    return errorResponse('Proposal not found', 404);
  }

  if (proposal.status !== 'deployed') {
    return errorResponse(`Cannot rollback: proposal status is '${proposal.status}'`, 400);
  }

  const { function_name, deployment_details } = proposal;
  const previous_sha = deployment_details?.previous_sha;

  console.log(`⏮️ Rolling back ${function_name}...`);

  // If we have a previous SHA, revert to that version
  if (previous_sha) {
    // Get the previous file content
    const fileResult = await supabase.functions.invoke('github-integration', {
      body: {
        action: 'get_file_content',
        data: { 
          path: `supabase/functions/${function_name}/index.ts`,
          ref: previous_sha
        }
      }
    });

    if (!fileResult.error && fileResult.data?.content) {
      await supabase.functions.invoke('github-integration', {
        body: {
          action: 'commit_file',
          data: {
            path: `supabase/functions/${function_name}/index.ts`,
            message: `[Rollback] Revert ${function_name} to ${previous_sha}`,
            content: fileResult.data.encoding === 'base64' 
              ? atob(fileResult.data.content) 
              : fileResult.data.content,
            branch: 'main'
          }
        }
      });
    }
  } else {
    // Delete the function file
    await supabase.functions.invoke('github-integration', {
      body: {
        action: 'delete_file',
        data: {
          path: `supabase/functions/${function_name}/index.ts`,
          message: `[Rollback] Remove ${function_name}`,
          branch: 'main'
        }
      }
    });
  }

  // Update proposal status
  await updateProposalStatus(supabase, proposal_id, 'rolled_back', {
    rolled_back_at: new Date().toISOString(),
    reverted_to: previous_sha || 'deleted'
  });

  // Log activity
  await supabase.from('eliza_activity_log').insert({
    activity_type: 'deployment_rollback',
    title: `⏮️ Rollback: ${function_name}`,
    description: `Function ${function_name} rolled back`,
    status: 'completed',
    metadata: { proposal_id, function_name }
  });

  return okResponse({
    rolled_back: true,
    function_name,
    reverted_to: previous_sha || 'deleted'
  });
}

// Generate PR body
function generatePRBody(proposal: any): string {
  return `## 🚀 Auto-Deploy: ${proposal.function_name}

### Proposal Details
- **ID**: ${proposal.id}
- **Description**: ${proposal.description || 'No description'}
- **Category**: ${proposal.category || 'general'}

### Approval Information
- **Status**: Approved by Executive Council
- **Votes**: ${JSON.stringify(proposal.votes || {})}

### Generated Code
This PR was automatically generated by the governance system after the proposal was approved.

---
*This PR was created by the deploy-approved-edge-function automation.*`;
}

// Generate deployment announcement
function generateDeploymentAnnouncement(proposal: any, commit_sha: string, health_check: any): string {
  return `## 🚀 New Function Deployed: ${proposal.function_name}

The Executive Council has approved and deployed a new edge function!

### Details
- **Function**: \`${proposal.function_name}\`
- **Commit**: ${commit_sha}
- **Health Check**: ${health_check?.success ? '✅ Passed' : '⚠️ Pending verification'}

### Description
${proposal.description || 'No description provided.'}

### How to Use
\`\`\`typescript
const result = await supabase.functions.invoke('${proposal.function_name}', {
  body: { /* your parameters */ }
});
\`\`\`

---
*Deployed via XMRT-DAO Governance System*
🤖 **AI Executive Council**`;
}
