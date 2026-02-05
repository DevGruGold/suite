
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executeAIRequest } from "./ai-gateway.ts";
import { executeToolCall } from "./toolExecutor.ts";
import { startUsageTracking } from "./edgeFunctionUsageLogger.ts";

export interface SuperDuperAgentConfig {
    agent_name: string;
    display_name: string;
    system_prompt: string;
    tools: any[];
}

export class SuperDuperAgent {
    private config: SuperDuperAgentConfig;
    private supabase: any;
    private supabaseUrl: string;
    private serviceRoleKey: string;

    constructor(config: SuperDuperAgentConfig) {
        this.config = config;
        this.supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        this.serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        this.supabase = createClient(this.supabaseUrl, this.serviceRoleKey);
    }

    async handleRequest(req: Request): Promise<Response> {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-eliza-key',
        };

        if (req.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const usageTracker = startUsageTracking(`superduper-${this.config.agent_name}`, undefined, { method: req.method });

        // Define body outside try block for error handling scope
        let body: any = {};

        try {
            try {
                body = await req.json();
            } catch {
                // Empty body handling
            }

            const { action, params, context = {} } = body;
            const actionName = action || 'unknown';

            // Check if this is a health check / cron
            if (!action) {
                await usageTracker.success({ result_summary: 'health_check' });
                return new Response(JSON.stringify({
                    success: true,
                    agent: this.config.display_name,
                    status: "active"
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            console.log(`🤖 [${this.config.display_name}] Processing action: ${action}`);

            // Build context for the AI
            const taskContext = `
      CURRENT TASK: ${action}
      PARAMETERS: ${JSON.stringify(params)}
      ADDITIONAL CONTEXT: ${JSON.stringify(context)}
      `;

            const messages = [
                { role: 'system', content: this.config.system_prompt },
                { role: 'user', content: `Please execute the following task.\n${taskContext}\n\nThink step-by-step. If you need more information or need to take action, use the available tools.` }
            ];

            // 1. Plan / Thought Loop (Simple single-turn for now, can loop if needed)

            let finalResponse = {};

            // Step 1: Initial AI Call
            console.log(`🤖 [${this.config.display_name}] Thinking...`);
            const aiResponse = await executeAIRequest(messages, {
                tools: this.config.tools,
                tool_choice: 'auto',
                temperature: 0.2 // Lower temp for execution
            });

            const aiMessage = aiResponse.choices[0].message;

            // Step 2: Tool Execution (if any)
            if (aiMessage.tool_calls) {
                console.log(`🛠️ [${this.config.display_name}] Tool calls detected: ${aiMessage.tool_calls.length}`);

                const toolResults = [];
                for (const toolCall of aiMessage.tool_calls) {
                    const result = await executeToolCall(
                        this.supabase,
                        toolCall,
                        this.config.agent_name as any, // Cast to any to bypass strict type check in shared module if needed, or update module
                        this.supabaseUrl,
                        this.serviceRoleKey
                    );
                    toolResults.push({
                        tool_call_id: toolCall.id,
                        role: 'tool',
                        name: toolCall.function.name,
                        content: JSON.stringify(result)
                    });
                }

                // Add results back to history
                messages.push(aiMessage);
                messages.push(...toolResults);

                // Step 3: Final Response
                console.log(`🤖 [${this.config.display_name}] Synthesizing result...`);
                const finalAiResponse = await executeAIRequest(messages, { temperature: 0.5 });
                finalResponse = {
                    result: finalAiResponse.choices[0].message.content,
                    tool_executions: toolResults.length
                };
            } else {
                // No tools called, just return the text
                finalResponse = {
                    result: aiMessage.content,
                    tool_executions: 0
                };
            }

            await usageTracker.success({ result_summary: actionName, tool_calls: (finalResponse as any).tool_executions });

            // Log to persistent execution log for Eliza/STAE audit
            const taskId = context?.task_id || null;
            await this.supabase.from('superduper_execution_log').insert({
                agent_id: this.config.agent_name,
                task_id: taskId,
                action: action,
                params: params,
                result: finalResponse,
                status: 'success',
                tool_usage: (finalResponse as any).tool_executions > 0 ? aiMessage.tool_calls : null
            });

            // Notify user via Inbox if user_id is present
            const userId = context?.user_id;
            if (userId) {
                await this.supabase.from('inbox_messages').insert({
                    user_id: userId,
                    task_id: taskId,
                    title: `Task Completed: ${actionName}`,
                    content: `Your task assigned to ${this.config.display_name} has been completed.\n\nResult Summary: ${(finalResponse as any).result?.substring(0, 100)}...`,
                    is_read: false
                });
            }

            return new Response(JSON.stringify({
                success: true,
                data: finalResponse
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        } catch (error: any) {
            console.error(`❌ [${this.config.display_name}] Error:`, error);
            await usageTracker.failure(error.message, 500);

            // Log failure
            const taskId = body?.context?.task_id || null;
            await this.supabase.from('superduper_execution_log').insert({
                agent_id: this.config.agent_name,
                task_id: taskId,
                action: body?.action || 'unknown',
                params: body?.params,
                error: error.message,
                status: 'failure'
            });

            return new Response(JSON.stringify({
                success: false,
                error: error.message
            }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
    }
}
