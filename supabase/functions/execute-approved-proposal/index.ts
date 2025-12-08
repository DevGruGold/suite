import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateTextWithFallback } from "../_shared/unifiedAIFallback.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Category-based code generation templates
const categoryTemplates: Record<string, string> = {
  monitoring: `Include comprehensive logging, metrics collection, health checks, and observability patterns. Add prometheus-compatible metrics endpoints if relevant.`,
  ai: `Include AI provider fallback cascade (Lovable AI -> Gemini -> DeepSeek), proper error handling for rate limits (429) and payment issues (402), and response validation.`,
  autonomous: `Include self-healing patterns, exponential backoff retry logic, circuit breaker patterns, and automatic error recovery. Log all autonomous decisions for audit.`,
  infrastructure: `Include rate limiting, request validation, caching where appropriate, and connection pooling. Add proper timeout handling and resource cleanup.`,
  governance: `Include comprehensive audit logging, activity feed updates, vote tracking, and transparent decision recording. Ensure all governance actions are traceable.`,
  general: `Follow standard patterns with proper CORS, error handling, logging, and Supabase client initialization. Include activity logging for important operations.`
};

// Generate code using AI fallback cascade
async function generateEdgeFunctionCode(
  supabase: any,
  proposal: any,
  category: string
): Promise<{ code: string; explanation: string; ai_provider: string }> {
  const categoryGuidance = categoryTemplates[category] || categoryTemplates.general;
  
  const codeGenPrompt = `Generate a production-ready Deno edge function for Supabase based on this approved proposal:

**Function Name:** ${proposal.function_name}
**Description:** ${proposal.description}
**Rationale:** ${proposal.rationale}
**Category:** ${category}
**Use Cases:** ${Array.isArray(proposal.use_cases) ? proposal.use_cases.join(', ') : proposal.use_cases || 'General purpose'}

**Category-Specific Requirements:**
${categoryGuidance}

**Implementation Notes from Proposal:**
${proposal.implementation_code || 'No specific implementation notes provided.'}

**Required Structure:**
1. Import serve from Deno std and createClient from Supabase
2. Define CORS headers
3. Handle OPTIONS preflight requests
4. Initialize Supabase client with service role key
5. Parse and validate request body
6. Implement core business logic
7. Log important operations to activity_feed
8. Return proper JSON responses with CORS headers

Generate ONLY the TypeScript code, no markdown, no explanations. The code should be complete and ready to deploy.`;

  try {
    console.log('🔄 Generating edge function code with AI fallback cascade...');
    const generatedCode = await generateTextWithFallback(codeGenPrompt, 
      'You are an expert Deno/TypeScript developer specializing in Supabase Edge Functions. Generate clean, production-ready code following best practices. Output ONLY code, no markdown formatting or explanations.',
      {
        temperature: 0.3,
        maxTokens: 4000,
        useFullElizaContext: false
      }
    );
    
    // Clean up any markdown formatting
    const cleanedCode = generatedCode
      .replace(/```typescript\n?/g, '')
      .replace(/```ts\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const explanation = `Code generated using AI fallback cascade based on proposal specifications. Category: ${category}. Includes ${categoryGuidance.split('.')[0].toLowerCase()}.`;

    console.log('✅ Edge function code generated via AI cascade');
    return { code: cleanedCode, explanation, ai_provider: 'ai_cascade' };
  } catch (error) {
    console.warn('⚠️ AI code generation failed, using template:', error);
    return generateTemplateCode(proposal, category);
  }
}

// Fallback template-based code generation
function generateTemplateCode(proposal: any, category: string): { code: string; explanation: string; ai_provider: string } {
  const functionName = proposal.function_name.replace(/-/g, '_');
  
  const code = `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body
    const body = await req.json().catch(() => ({}));
    
    console.log('🚀 ${proposal.function_name} invoked:', JSON.stringify(body));

    // TODO: Implement core logic based on proposal:
    // Description: ${proposal.description}
    // Rationale: ${proposal.rationale}
    // Use Cases: ${Array.isArray(proposal.use_cases) ? proposal.use_cases.join(', ') : proposal.use_cases || 'General'}

    const result = {
      success: true,
      function: '${proposal.function_name}',
      message: 'Function executed successfully',
      timestamp: new Date().toISOString()
    };

    // Log activity
    await supabase
      .from('activity_feed')
      .insert({
        type: '${functionName}_execution',
        title: '${proposal.function_name} Executed',
        description: 'Function executed successfully',
        data: { ...body, result }
      });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ ${proposal.function_name} error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
`;

  return {
    code,
    explanation: 'Template-based code generated. Requires manual implementation of core business logic.',
    ai_provider: 'template_fallback'
  };
}

// Determine category from proposal
function determineCategory(proposal: any): string {
  const category = proposal.category?.toLowerCase() || '';
  const name = proposal.function_name?.toLowerCase() || '';
  const description = proposal.description?.toLowerCase() || '';
  
  if (category && categoryTemplates[category]) {
    return category;
  }
  
  if (name.includes('monitor') || name.includes('health') || name.includes('metric') || description.includes('monitoring')) {
    return 'monitoring';
  }
  if (name.includes('ai') || name.includes('chat') || name.includes('llm') || description.includes('ai ') || description.includes('artificial intelligence')) {
    return 'ai';
  }
  if (name.includes('auto') || name.includes('autonomous') || description.includes('autonomous') || description.includes('self-')) {
    return 'autonomous';
  }
  if (name.includes('cache') || name.includes('rate') || name.includes('infra') || description.includes('infrastructure')) {
    return 'infrastructure';
  }
  if (name.includes('govern') || name.includes('vote') || name.includes('proposal') || description.includes('governance')) {
    return 'governance';
  }
  
  return 'general';
}

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
      .eq('proposal_id', proposal_id);

    const approvalVotes = votes?.filter(v => v.vote === 'approve') || [];
    const rejectionVotes = votes?.filter(v => v.vote === 'reject') || [];
    const approverNames = approvalVotes.map(v => v.executive_name).join(', ') || 'Council';

    // Determine category for workflow routing
    const category = determineCategory(proposal);
    console.log(`📂 Category determined: ${category}`);

    // Step 1: Generate edge function code using AI fallback cascade
    console.log('🤖 Generating edge function code...');
    const { code: generatedCode, explanation: codeExplanation, ai_provider } = await generateEdgeFunctionCode(
      supabase,
      proposal,
      category
    );

    // Step 2: Build comprehensive final analysis
    const finalAnalysis = {
      decision: 'approved',
      decision_summary: `Approved by ${approvalVotes.length} vote(s) (${approverNames})`,
      vote_breakdown: {
        executive: {
          approvals: approvalVotes.filter(v => ['CSO', 'CTO', 'CIO', 'CAO'].includes(v.executive_name)).length,
          rejections: rejectionVotes.filter(v => ['CSO', 'CTO', 'CIO', 'CAO'].includes(v.executive_name)).length,
          details: votes?.filter(v => ['CSO', 'CTO', 'CIO', 'CAO'].includes(v.executive_name)).map(v => ({
            executive: v.executive_name,
            vote: v.vote,
            reasoning: v.reasoning
          })) || []
        },
        community: {
          approvals: approvalVotes.filter(v => !['CSO', 'CTO', 'CIO', 'CAO'].includes(v.executive_name)).length,
          rejections: rejectionVotes.filter(v => !['CSO', 'CTO', 'CIO', 'CAO'].includes(v.executive_name)).length
        },
        total_votes: votes?.length || 0
      },
      implementation_plan: {
        file_path: `supabase/functions/${proposal.function_name}/index.ts`,
        config_entry: `[functions.${proposal.function_name}]\nverify_jwt = false`,
        category,
        category_guidance: categoryTemplates[category] || categoryTemplates.general,
        eliza_tool_required: true,
        estimated_complexity: category === 'ai' || category === 'autonomous' ? 'high' : 'medium'
      },
      generated_code: generatedCode,
      code_explanation: codeExplanation,
      ai_provider,
      next_steps: [
        `Create file: supabase/functions/${proposal.function_name}/index.ts`,
        'Add function entry to supabase/config.toml',
        'Register tool in elizaTools.ts if applicable',
        'Deploy and test the function',
        'Update proposal status to deployed'
      ],
      approved_by: approverNames,
      processed_at: new Date().toISOString()
    };

    // Step 3: Update proposal status to queued_for_deployment with final analysis
    const { error: updateError } = await supabase
      .from('edge_function_proposals')
      .update({ 
        status: 'queued_for_deployment',
        implementation_code: JSON.stringify(finalAnalysis),
        updated_at: new Date().toISOString()
      })
      .eq('id', proposal_id);

    if (updateError) {
      console.error('❌ Failed to update proposal status:', updateError);
      throw updateError;
    }

    console.log('✅ Updated proposal with final analysis and generated code');

    // Step 4: Create implementation task
    const taskDescription = `
## Implementation Task: ${proposal.function_name}

**Approved by:** ${approverNames}
**Category:** ${category}
**Estimated Complexity:** ${finalAnalysis.implementation_plan.estimated_complexity}
**AI Provider:** ${ai_provider}

### Description
${proposal.description}

### Rationale
${proposal.rationale}

### Use Cases
${Array.isArray(proposal.use_cases) ? proposal.use_cases.map((u: string) => `- ${u}`).join('\n') : proposal.use_cases}

### Implementation Plan
1. Create edge function at \`${finalAnalysis.implementation_plan.file_path}\`
2. Add to config.toml:
\`\`\`toml
${finalAnalysis.implementation_plan.config_entry}
\`\`\`
3. Register in \`elizaTools.ts\` if applicable
4. Write tests and documentation
5. Update proposal status to 'deployed' after completion

### Generated Code
The AI-generated code is stored in the proposal's implementation_code field.
Category-specific patterns applied: ${category}
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
          workflow: 'governance_approval',
          category,
          has_generated_code: true,
          ai_provider
        }
      })
      .select()
      .single();

    if (taskError) {
      console.error('⚠️ Failed to create task:', taskError);
    } else {
      console.log(`✅ Created implementation task: ${task?.id}`);
    }

    // Step 5: Try to create GitHub issue
    let githubPR = null;
    try {
      const prBody = `## Governance Approved: ${proposal.function_name}

**Proposal ID:** ${proposal_id}
**Category:** ${category}
**Approved By:** ${approverNames}
**AI Provider:** ${ai_provider}

### Description
${proposal.description}

### Rationale  
${proposal.rationale}

### Use Cases
${Array.isArray(proposal.use_cases) ? proposal.use_cases.map((u: string) => `- ${u}`).join('\n') : proposal.use_cases}

### Files to Create/Modify
- \`supabase/functions/${proposal.function_name}/index.ts\` - Main function code
- \`supabase/config.toml\` - Add function configuration

### Generated Code Preview
\`\`\`typescript
${generatedCode.substring(0, 1500)}${generatedCode.length > 1500 ? '\n// ... (truncated)' : ''}
\`\`\`

---
*This issue was automatically created by the governance workflow after executive council approval.*
`;

      const { data: ghData, error: ghError } = await supabase.functions.invoke('github-integration', {
        body: {
          action: 'create_issue',
          executive: 'council',
          repo: 'XMRT-Ecosystem',
          title: `[Governance Approved] Implement: ${proposal.function_name}`,
          body: prBody,
          labels: ['governance', 'approved', 'implementation', 'automated', category]
        }
      });

      if (!ghError && ghData?.issue) {
        githubPR = ghData.issue;
        console.log(`✅ Created GitHub issue: ${githubPR.number}`);
      }
    } catch (ghErr) {
      console.log('⚠️ GitHub issue creation skipped:', ghErr);
    }

    // Step 6: Notify via activity feed
    await supabase
      .from('activity_feed')
      .insert({
        type: 'implementation_queued',
        title: `Implementation Queued: ${proposal.function_name}`,
        description: `Approved proposal is now queued for deployment with AI-generated code. Category: ${category}`,
        data: {
          proposal_id,
          function_name: proposal.function_name,
          task_id: task?.id,
          github_issue: githubPR?.number,
          approved_by: approverNames,
          category,
          has_generated_code: true,
          ai_provider,
          final_analysis: finalAnalysis
        }
      });

    // Step 7: Notify proposer
    if (proposal.proposed_by) {
      await supabase
        .from('activity_feed')
        .insert({
          type: 'proposal_approved_notification',
          title: `🎉 Your Proposal Was Approved!`,
          description: `${proposal.proposed_by}, your proposal for "${proposal.function_name}" has been approved by the executive council and is queued for implementation with AI-generated code.`,
          data: {
            proposal_id,
            function_name: proposal.function_name,
            proposer: proposal.proposed_by,
            category,
            ai_provider,
            next_steps: finalAnalysis.next_steps
          }
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        proposal_id,
        function_name: proposal.function_name,
        category,
        new_status: 'queued_for_deployment',
        task_created: !!task,
        task_id: task?.id,
        github_issue_created: !!githubPR,
        github_issue_number: githubPR?.number,
        ai_provider,
        final_analysis: finalAnalysis
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Execute Approved Proposal Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
