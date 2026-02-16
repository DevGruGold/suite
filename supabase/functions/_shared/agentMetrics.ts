
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function recordTaskCompletion(
    taskId: string,
    agentId: string,
    status: string,
    category: string,
    metadata: any = {}
) {
    // Calculate duration if start time is available in metadata
    let durationSeconds = 0;
    if (metadata?.started_at) {
        const start = new Date(metadata.started_at).getTime();
        const end = Date.now();
        durationSeconds = (end - start) / 1000;
    }

    // 1. Record Performance Metric (Time Series)
    const { error: metricError } = await supabase
        .from('agent_performance_metrics')
        .insert({
            agent_id: agentId,
            metric_type: 'task_completion',
            metric_value: status === 'COMPLETED' ? 1 : 0, // 1 for success, 0 for failure
            time_window: 'daily', // Granularity - could be used for aggregation grouping
            metadata: {
                task_id: taskId,
                category,
                duration_seconds: durationSeconds,
                status,
                timestamp: new Date().toISOString()
            },
            recorded_at: new Date().toISOString()
        });

    if (metricError) {
        console.error('Error recording metric:', metricError);
    }

    // 2. Update Agent Specialization (Aggregated)
    if (category && category !== 'other') {
        try {
            // Fetch existing specialization
            const { data: existingSpec, error: fetchError } = await supabase
                .from('agent_specializations')
                .select('*')
                .eq('agent_id', agentId)
                .eq('specialization_area', category)
                .maybeSingle();

            if (fetchError) {
                console.error('Error fetching specialization:', fetchError);
                return;
            }

            const isSuccess = status === 'COMPLETED';
            const currentCount = existingSpec?.tasks_completed_in_area || 0;
            const currentSuccessRate = existingSpec?.success_rate || 0;

            // Calculate new success rate
            // New Success Rate = ((Old Rate * Old Count) + (1 if success else 0)) / (Old Count + 1)
            const newCount = currentCount + 1;
            const newSuccessRate = ((currentSuccessRate * currentCount) + (isSuccess ? 1 : 0)) / newCount;
            const newProficiency = newSuccessRate * 100; // Scale to 0-100

            const now = new Date().toISOString();

            if (existingSpec) {
                const { error: updateError } = await supabase
                    .from('agent_specializations')
                    .update({
                        proficiency_score: newProficiency,
                        success_rate: newSuccessRate,
                        tasks_completed_in_area: newCount,
                        last_updated: now,
                        metadata: {
                            ...existingSpec.metadata,
                            last_task_id: taskId,
                            last_task_status: status
                        }
                    })
                    .eq('id', existingSpec.id);

                if (updateError) console.error('Error updating specialization:', updateError);

            } else {
                const { error: insertError } = await supabase
                    .from('agent_specializations')
                    .insert({
                        agent_id: agentId,
                        specialization_area: category,
                        proficiency_score: newProficiency,
                        success_rate: newSuccessRate,
                        tasks_completed_in_area: newCount,
                        detected_at: now,
                        last_updated: now,
                        metadata: {
                            last_task_id: taskId,
                            last_task_status: status
                        }
                    });

                if (insertError) console.error('Error inserting specialization:', insertError);
            }
        } catch (e) {
            console.error('Exception updating specialization:', e);
        }
    }
}

export async function getAgentMetrics(agentId: string) {
    // Get specializations
    const { data: specs, error: specError } = await supabase
        .from('agent_specializations')
        .select('*')
        .eq('agent_id', agentId);

    if (specError) throw specError;

    // Get recent performance metrics (last 50)
    const { data: recentMetrics, error: metricError } = await supabase
        .from('agent_performance_metrics')
        .select('*')
        .eq('agent_id', agentId)
        .order('recorded_at', { ascending: false })
        .limit(50);

    if (metricError) throw metricError;

    return {
        specializations: specs || [],
        recent_activity: recentMetrics || []
    };
}
