import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const payload = await req.json();

        console.log('Task Completion Webhook Received:', JSON.stringify(payload));

        const { old_record, record, type } = payload;
        const task = record;

        if (!task) {
            throw new Error('No task record found in payload');
        }

        if (task.status !== 'COMPLETED') {
            return new Response(JSON.stringify({ message: 'Task not completed, ignoring' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const taskId = task.id;
        const taskTitle = task.title;
        const assigneeAgentId = task.assignee_agent_id;
        const proofOfWorkLink = task.proof_of_work_link;
        const completedAt = task.completed_at || new Date().toISOString();

        console.log(`Processing completion for task: ${taskTitle} (${taskId})`);

        // Call knowledge-manager to store the fact
        const { data: knowledgeData, error: knowledgeError } = await supabaseClient.functions.invoke('knowledge-manager', {
            body: {
                action: 'store_knowledge',
                data: {
                    name: `Task Completed: ${taskTitle}`,
                    description: `Task '${taskTitle}' (ID: ${taskId}) has been successfully completed by agent ${assigneeAgentId || 'unknown'}. ${proofOfWorkLink ? `Proof of work: ${proofOfWorkLink}.` : 'No proof of work link provided.'} Completed at: ${completedAt}.`,
                    type: 'fact',
                    metadata: {
                        task_id: taskId,
                        assignee_agent_id: assigneeAgentId,
                        proof_of_work_link: proofOfWorkLink,
                        completed_at: completedAt,
                        source: 'task-completion-notifier'
                    }
                }
            }
        });

        if (knowledgeError) {
            console.error('Failed to store knowledge:', knowledgeError);
            throw knowledgeError;
        }

        console.log('Knowledge stored successfully:', knowledgeData);

        return new Response(JSON.stringify({ success: true, knowledge_data: knowledgeData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error processing webhook:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
