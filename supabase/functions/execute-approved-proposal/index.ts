import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { proposal_id } = await req.json();

    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: 'Missing proposal_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🚀 Executing approved proposal workflow: ${proposal_id}`);

    // Get the proposal
    const { data: proposal, error: proposalError } = await supabase
      .from('edge_function_proposals')
      .select('*')
      .eq('id', proposal_id)
      .single();

    if (proposalError || !proposal) {
      console.error('❌ Proposal not found:', proposalError);
      return new Response(
        JSON.stringify({ error: 'Proposal not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (proposal.status !== 'approved') {
      return new Response(
        JSON.stringify({ error: `Proposal status is ${proposal.status}, expected 'approved'` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get approval votes for context
    const { data: votes } = await supabase
      .from('executive_votes')
      .select('*')
      .eq('proposal_id', proposal_id)
      .eq('vote', 'approve');

    const approverNames = votes?.map(v => v.executive_name).join(', ') || 'Council';

    // Step 1: Update status to queued_for_deployment
    const { error: updateError } = await supabase
      .from('edge_function_proposals')
      .update({ 
        status: 'queued_for_deployment',
        updated_at: new Date().toISOString()
      })
      .eq('id', proposal_id);

    if (updateError) {
      console.error('❌ Failed to update proposal status:', updateError);
      throw updateError;
    }

    console.log('✅ Updated proposal status to queued_for_deployment');

    // Step 2: Create implementation task
    const taskDescription = `
## Implementation Task: ${proposal.function_name}

**Approved by:** ${approverNames}
**Category:** ${proposal.category || 'general'}

### Description
${proposal.description}

### Rationale
${proposal.rationale}

### Use Cases
${Array.isArray(proposal.use_cases) ? proposal.use_cases.map((u: string) => `- ${u}`).join('\n') : proposal.use_cases}

### Implementation Notes
${proposal.implementation_code || 'No implementation outline provided. Please scaffold the function structure.'}

### Deliverables
1. Create edge function at \`supabase/functions/${proposal.function_name}/index.ts\`
2. Add function config to \`supabase/config.toml\`
3. Register in \`elizaTools.ts\` if applicable
4. Write tests and documentation
5. Update proposal status to 'deployed' after completion
`;

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title: `Implement: ${proposal.function_name}`,
        description: taskDescription,
        status: 'PENDING',
        priority: 'HIGH',
        category: 'development',
        metadata: {
          proposal_id,
          function_name: proposal.function_name,
          approved_by: approverNames,
          workflow: 'governance_approval'
        }
      })
      .select()
      .single();

    if (taskError) {
      console.error('⚠️ Failed to create task:', taskError);
    } else {
      console.log(`✅ Created implementation task: ${task?.id}`);
    }

    // Step 3: Try to create GitHub issue (if github-integration is available)
    let githubIssue = null;
    try {
      const { data: ghData, error: ghError } = await supabase.functions.invoke('github-integration', {
        body: {
          action: 'create_issue',
          executive: 'council', // Council handles governance decisions
          repo: 'XMRT-Ecosystem',
          title: `[Governance Approved] Implement: ${proposal.function_name}`,
          body: `## Governance Proposal Approved

**Proposal ID:** ${proposal_id}
**Function Name:** \`${proposal.function_name}\`
**Approved By:** ${approverNames}

### Description
${proposal.description}

### Rationale  
${proposal.rationale}

### Use Cases
${Array.isArray(proposal.use_cases) ? proposal.use_cases.map((u: string) => `- ${u}`).join('\n') : proposal.use_cases}

---
*This issue was automatically created by the governance workflow after executive council approval.*
`,
          labels: ['governance', 'approved', 'implementation', 'automated']
        }
      });

      if (!ghError && ghData?.issue) {
        githubIssue = ghData.issue;
        console.log(`✅ Created GitHub issue: ${githubIssue.number}`);
      }
    } catch (ghErr) {
      console.log('⚠️ GitHub issue creation skipped:', ghErr);
    }

    // Step 4: Notify via activity feed
    await supabase
      .from('activity_feed')
      .insert({
        type: 'implementation_queued',
        title: `Implementation Queued: ${proposal.function_name}`,
        description: `Approved proposal is now queued for deployment. Task created for development team.`,
        data: {
          proposal_id,
          function_name: proposal.function_name,
          task_id: task?.id,
          github_issue: githubIssue?.number,
          approved_by: approverNames
        }
      });

    // Step 5: Try to notify proposer (if we have their session info)
    if (proposal.proposed_by) {
      await supabase
        .from('activity_feed')
        .insert({
          type: 'proposal_approved_notification',
          title: `🎉 Your Proposal Was Approved!`,
          description: `${proposal.proposed_by}, your proposal for "${proposal.function_name}" has been approved by the executive council and is queued for implementation.`,
          data: {
            proposal_id,
            function_name: proposal.function_name,
            proposer: proposal.proposed_by
          }
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        proposal_id,
        function_name: proposal.function_name,
        new_status: 'queued_for_deployment',
        task_created: !!task,
        task_id: task?.id,
        github_issue_created: !!githubIssue,
        github_issue_number: githubIssue?.number,
        message: `Proposal approved and queued for implementation. Task ID: ${task?.id}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Execute approved proposal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
