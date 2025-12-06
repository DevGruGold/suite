import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TaskTemplate {
  id: string;
  category: string;
  template_name: string;
  description_template: string;
  default_stage: string;
  default_priority: number;
  required_skills: string[];
  checklist: string[];
  auto_advance_threshold_hours: number;
  estimated_duration_hours: number | null;
}

interface Agent {
  id: string;
  name: string;
  status: string;
  skills: string[];
  current_workload: number;
  max_concurrent_tasks: number;
}

/**
 * Suite Task Automation Engine (STAE)
 * Provides 90% automation of the task lifecycle through:
 * - Task template-based creation
 * - Intelligent skill-based agent matching
 * - Automated quality verification
 * - Knowledge extraction from completed tasks
 * - Comprehensive automation metrics
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { action, data = {} } = body;

    console.log(`🚀 [STAE] Action: ${action}`, data);

    let result: any;

    switch (action) {
      // ====================================================================
      // CREATE TASK FROM TEMPLATE
      // ====================================================================
      case 'create_from_template': {
        const { template_name, title, description, priority, auto_assign = true } = data;

        if (!template_name || !title) {
          throw new Error('template_name and title are required');
        }

        // Fetch template
        const { data: template, error: templateError } = await supabase
          .from('task_templates')
          .select('*')
          .eq('template_name', template_name)
          .eq('is_active', true)
          .single();

        if (templateError || !template) {
          throw new Error(`Template '${template_name}' not found or inactive`);
        }

        // Generate task description from template
        const taskDescription = description || template.description_template.replace('{{title}}', title);

        // Create task
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            title,
            description: taskDescription,
            category: template.category,
            stage: template.default_stage,
            priority: priority ?? template.default_priority,
            status: 'PENDING',
            metadata: {
              created_from_template: template_name,
              template_id: template.id,
              required_skills: template.required_skills,
              checklist: template.checklist,
              auto_advance_threshold_hours: template.auto_advance_threshold_hours,
              estimated_duration_hours: template.estimated_duration_hours
            },
            auto_advance_threshold_hours: template.auto_advance_threshold_hours
          })
          .select()
          .single();

        if (taskError) throw taskError;

        // Update template usage count
        await supabase
          .from('task_templates')
          .update({ times_used: template.times_used + 1 })
          .eq('id', template.id);

        // Log activity
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'stae_task_created',
          title: `📋 STAE: Task Created from Template`,
          description: `Created task "${title}" using template "${template_name}"`,
          status: 'completed',
          task_id: task.id,
          metadata: { template_name, category: template.category, auto_assign }
        });

        // Auto-assign if requested
        let assignmentResult = null;
        if (auto_assign) {
          const assignResponse = await smartAssignTask(supabase, task.id, template.required_skills);
          assignmentResult = assignResponse;
        }

        result = {
          success: true,
          task,
          template_used: template_name,
          auto_assigned: auto_assign,
          assignment: assignmentResult
        };
        break;
      }

      // ====================================================================
      // SMART ASSIGN TASK (Skill-based matching)
      // ====================================================================
      case 'smart_assign': {
        const { task_id, prefer_agent_id, min_skill_match = 0.3, auto_batch = false } = data;

        if (auto_batch) {
          // Batch assign all pending unassigned tasks
          const { data: pendingTasks } = await supabase
            .from('tasks')
            .select('id, metadata')
            .is('assignee_agent_id', null)
            .eq('status', 'PENDING')
            .limit(10);

          const assignments = [];
          for (const task of pendingTasks || []) {
            const skills = task.metadata?.required_skills || [];
            const assignResult = await smartAssignTask(supabase, task.id, skills, prefer_agent_id, min_skill_match);
            assignments.push({ task_id: task.id, ...assignResult });
          }

          result = {
            success: true,
            batch_mode: true,
            tasks_processed: assignments.length,
            assignments
          };
        } else {
          if (!task_id) throw new Error('task_id is required');

          // Get task to find required skills
          const { data: task } = await supabase
            .from('tasks')
            .select('id, metadata, title')
            .eq('id', task_id)
            .single();

          if (!task) throw new Error(`Task ${task_id} not found`);

          const skills = task.metadata?.required_skills || [];
          const assignResult = await smartAssignTask(supabase, task_id, skills, prefer_agent_id, min_skill_match);

          result = {
            success: true,
            task_id,
            task_title: task.title,
            ...assignResult
          };
        }
        break;
      }

      // ====================================================================
      // AUTO CREATE AND ASSIGN (Full automation)
      // ====================================================================
      case 'auto_create_and_assign': {
        const { template_name, title, description, priority } = data;

        // First create from template with auto_assign
        const createResult = await supabase.functions.invoke('suite-task-automation-engine', {
          body: { action: 'create_from_template', data: { template_name, title, description, priority, auto_assign: true } }
        });

        result = createResult.data;
        break;
      }

      // ====================================================================
      // VERIFY TASK COMPLETION (Quality checks)
      // ====================================================================
      case 'verify_completion': {
        const { task_id } = data;

        if (!task_id) throw new Error('task_id is required');

        const { data: task } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', task_id)
          .single();

        if (!task) throw new Error(`Task ${task_id} not found`);

        // Quality verification checks
        const checks = {
          has_deliverables: !!task.metadata?.deliverables || !!task.result,
          checklist_completed: await checkChecklistCompletion(task),
          no_blocking_issues: task.status !== 'BLOCKED',
          has_resolution: !!task.resolution || task.status === 'COMPLETED',
          stage_is_final: task.stage === 'INTEGRATE' || task.stage === 'VERIFY'
        };

        const passedChecks = Object.values(checks).filter(Boolean).length;
        const totalChecks = Object.keys(checks).length;
        const qualityScore = Math.round((passedChecks / totalChecks) * 100);

        // Determine if task passes quality gate
        const passesQualityGate = qualityScore >= 60;

        // Log verification
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'stae_quality_verification',
          title: `🔍 STAE: Quality Verification`,
          description: `Task "${task.title}" scored ${qualityScore}% - ${passesQualityGate ? 'PASSED' : 'NEEDS REVIEW'}`,
          status: passesQualityGate ? 'completed' : 'pending',
          task_id,
          metadata: { checks, qualityScore, passesQualityGate }
        });

        result = {
          success: true,
          task_id,
          quality_score: qualityScore,
          passes_quality_gate: passesQualityGate,
          checks,
          recommendation: passesQualityGate 
            ? 'Task meets quality standards - ready for completion'
            : 'Task needs review - some quality checks failed'
        };
        break;
      }

      // ====================================================================
      // EXTRACT KNOWLEDGE FROM COMPLETED TASKS
      // ====================================================================
      case 'extract_knowledge': {
        const { task_id, completed_since_hours = 24 } = data;

        let tasksToProcess = [];

        if (task_id) {
          // Extract from specific task
          const { data: task } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', task_id)
            .single();
          if (task) tasksToProcess = [task];
        } else {
          // Extract from recently completed tasks
          const cutoff = new Date(Date.now() - completed_since_hours * 60 * 60 * 1000).toISOString();
          const { data: tasks } = await supabase
            .from('tasks')
            .select('*')
            .eq('status', 'COMPLETED')
            .gte('updated_at', cutoff)
            .is('metadata->knowledge_extracted', null);
          tasksToProcess = tasks || [];
        }

        const extractedKnowledge = [];

        for (const task of tasksToProcess) {
          // Extract learnings
          const learnings = {
            task_id: task.id,
            title: task.title,
            category: task.category,
            resolution: task.resolution || task.result,
            duration_hours: task.metadata?.actual_duration_hours,
            template_used: task.metadata?.created_from_template,
            skills_used: task.metadata?.required_skills || [],
            blockers_encountered: task.blocked_reason ? [task.blocked_reason] : [],
            stage_progression: task.stage,
            success: task.status === 'COMPLETED'
          };

          // Store in learning_patterns
          await supabase.from('learning_patterns').insert({
            learning_type: 'task_completion',
            context: JSON.stringify({
              task_category: task.category,
              template: task.metadata?.created_from_template,
              skills: task.metadata?.required_skills
            }),
            pattern_data: learnings,
            confidence: task.status === 'COMPLETED' ? 0.9 : 0.5,
            application_count: 1,
            last_applied: new Date().toISOString()
          });

          // Mark task as knowledge-extracted
          await supabase
            .from('tasks')
            .update({ metadata: { ...task.metadata, knowledge_extracted: true, extracted_at: new Date().toISOString() } })
            .eq('id', task.id);

          extractedKnowledge.push(learnings);
        }

        // Log activity
        if (extractedKnowledge.length > 0) {
          await supabase.from('eliza_activity_log').insert({
            activity_type: 'stae_knowledge_extraction',
            title: `📚 STAE: Knowledge Extraction`,
            description: `Extracted knowledge from ${extractedKnowledge.length} completed task(s)`,
            status: 'completed',
            metadata: { tasks_processed: extractedKnowledge.length }
          });
        }

        result = {
          success: true,
          tasks_processed: extractedKnowledge.length,
          knowledge_entries: extractedKnowledge
        };
        break;
      }

      // ====================================================================
      // GET AUTOMATION METRICS
      // ====================================================================
      case 'get_metrics': {
        const { time_window_hours = 24, breakdown_by, store_metrics = false } = data;
        const cutoff = new Date(Date.now() - time_window_hours * 60 * 60 * 1000).toISOString();

        // Get all tasks in time window
        const { data: allTasks, count: totalTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact' })
          .gte('created_at', cutoff);

        // Tasks created from templates
        const templateTasks = allTasks?.filter(t => t.metadata?.created_from_template) || [];
        const automationCoverage = totalTasks ? Math.round((templateTasks.length / totalTasks) * 100) : 0;

        // Tasks with auto-assignment
        const autoAssignedTasks = allTasks?.filter(t => t.metadata?.auto_assigned) || [];
        const autoAssignmentRate = totalTasks ? Math.round((autoAssignedTasks.length / totalTasks) * 100) : 0;

        // Completed tasks with knowledge extraction
        const completedTasks = allTasks?.filter(t => t.status === 'COMPLETED') || [];
        const knowledgeExtracted = completedTasks.filter(t => t.metadata?.knowledge_extracted) || [];
        const knowledgeExtractionRate = completedTasks.length 
          ? Math.round((knowledgeExtracted.length / completedTasks.length) * 100) 
          : 0;

        // Agent utilization
        const { data: agents } = await supabase
          .from('agents')
          .select('id, name, status, current_workload, max_concurrent_tasks')
          .neq('status', 'ARCHIVED');

        const activeAgents = agents?.filter(a => a.status !== 'OFFLINE') || [];
        const totalCapacity = activeAgents.reduce((sum, a) => sum + (a.max_concurrent_tasks || 5), 0);
        const currentWorkload = activeAgents.reduce((sum, a) => sum + (a.current_workload || 0), 0);
        const agentUtilization = totalCapacity ? Math.round((currentWorkload / totalCapacity) * 100) : 0;

        // Template usage breakdown
        const { data: templates } = await supabase
          .from('task_templates')
          .select('template_name, times_used, success_rate')
          .order('times_used', { ascending: false });

        // Average task completion time
        const completionTimes = completedTasks
          .filter(t => t.created_at && t.updated_at)
          .map(t => (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60));
        const avgCompletionTime = completionTimes.length 
          ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length * 10) / 10 
          : 0;

        const metrics = {
          time_window_hours,
          automation_coverage: `${automationCoverage}%`,
          auto_assignment_rate: `${autoAssignmentRate}%`,
          knowledge_extraction_rate: `${knowledgeExtractionRate}%`,
          agent_utilization: `${agentUtilization}%`,
          avg_completion_time_hours: avgCompletionTime,
          total_tasks: totalTasks || 0,
          template_tasks: templateTasks.length,
          completed_tasks: completedTasks.length,
          active_agents: activeAgents.length,
          template_usage: templates?.slice(0, 5) || []
        };

        // Store metrics if requested (for historical tracking)
        if (store_metrics) {
          await supabase.from('autonomy_metrics').insert({
            metric_name: 'stae_automation_metrics',
            metric_value: metrics,
            measured_at: new Date().toISOString()
          });
        }

        result = {
          success: true,
          metrics,
          generated_at: new Date().toISOString()
        };
        break;
      }

      // ====================================================================
      // LIST TEMPLATES
      // ====================================================================
      case 'list_templates': {
        const { category, include_inactive = false } = data;

        let query = supabase
          .from('task_templates')
          .select('*')
          .order('times_used', { ascending: false });

        if (!include_inactive) {
          query = query.eq('is_active', true);
        }
        if (category) {
          query = query.eq('category', category);
        }

        const { data: templates, error } = await query;

        if (error) throw error;

        result = {
          success: true,
          templates,
          count: templates?.length || 0
        };
        break;
      }

      // ====================================================================
      // UPDATE TEMPLATE SUCCESS RATE
      // ====================================================================
      case 'update_template_stats': {
        const { template_name, task_success } = data;

        const { data: template } = await supabase
          .from('task_templates')
          .select('*')
          .eq('template_name', template_name)
          .single();

        if (template) {
          const currentRate = template.success_rate || 0;
          const currentCount = template.times_used || 0;
          const newRate = ((currentRate * (currentCount - 1)) + (task_success ? 100 : 0)) / currentCount;

          await supabase
            .from('task_templates')
            .update({ success_rate: Math.round(newRate * 10) / 10 })
            .eq('template_name', template_name);
        }

        result = { success: true, template_name, updated: !!template };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}. Available: create_from_template, smart_assign, auto_create_and_assign, verify_completion, extract_knowledge, get_metrics, list_templates`);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ [STAE] Action ${action} completed in ${executionTime}ms`);

    return new Response(
      JSON.stringify({ ...result, execution_time_ms: executionTime }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [STAE] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ====================================================================
// HELPER FUNCTIONS
// ====================================================================

/**
 * Intelligent agent matching using weighted scoring algorithm
 * - 40% Skill overlap
 * - 30% Workload capacity
 * - 20% Historical success rate
 * - 10% Recent activity
 */
async function smartAssignTask(
  supabase: any,
  taskId: string,
  requiredSkills: string[],
  preferAgentId?: string,
  minSkillMatch: number = 0.3
): Promise<any> {
  // Get available agents
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .in('status', ['IDLE', 'BUSY'])
    .neq('status', 'ARCHIVED')
    .neq('status', 'OFFLINE');

  if (!agents || agents.length === 0) {
    return { assigned: false, reason: 'No available agents' };
  }

  // Score each agent
  const scoredAgents = await Promise.all(agents.map(async (agent: Agent) => {
    const agentSkills = Array.isArray(agent.skills) ? agent.skills : [];
    
    // 40% - Skill overlap
    const matchingSkills = requiredSkills.filter(s => 
      agentSkills.some((as: string) => as.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(as.toLowerCase()))
    );
    const skillScore = requiredSkills.length > 0 
      ? matchingSkills.length / requiredSkills.length 
      : 0.5; // Default if no skills required

    // 30% - Workload capacity (prefer less-loaded agents)
    const maxTasks = agent.max_concurrent_tasks || 5;
    const currentLoad = agent.current_workload || 0;
    const workloadScore = 1 - (currentLoad / maxTasks);

    // 20% - Historical success rate (from recent completed tasks)
    const { count: completedCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('assignee_agent_id', agent.id)
      .eq('status', 'COMPLETED');
    
    const { count: totalCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('assignee_agent_id', agent.id)
      .in('status', ['COMPLETED', 'FAILED', 'CANCELLED']);

    const successRate = totalCount > 0 ? (completedCount || 0) / totalCount : 0.7; // Default to 70%

    // 10% - Recent activity (prefer active agents)
    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentActivity } = await supabase
      .from('eliza_activity_log')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .gte('created_at', recentCutoff);

    const activityScore = Math.min((recentActivity || 0) / 10, 1); // Normalize to 0-1

    // Calculate weighted score
    const totalScore = (skillScore * 0.4) + (workloadScore * 0.3) + (successRate * 0.2) + (activityScore * 0.1);

    return {
      agent,
      scores: { skill: skillScore, workload: workloadScore, success: successRate, activity: activityScore },
      totalScore,
      matchingSkills
    };
  }));

  // Sort by total score
  scoredAgents.sort((a, b) => b.totalScore - a.totalScore);

  // Check if preferred agent meets minimum criteria
  if (preferAgentId) {
    const preferredAgent = scoredAgents.find(a => a.agent.id === preferAgentId);
    if (preferredAgent && preferredAgent.scores.skill >= minSkillMatch) {
      scoredAgents.unshift(scoredAgents.splice(scoredAgents.indexOf(preferredAgent), 1)[0]);
    }
  }

  // Find best agent that meets minimum skill match
  const bestMatch = scoredAgents.find(a => a.scores.skill >= minSkillMatch || requiredSkills.length === 0);

  if (!bestMatch) {
    return { 
      assigned: false, 
      reason: `No agent meets minimum skill match of ${minSkillMatch * 100}%`,
      candidates: scoredAgents.slice(0, 3).map(a => ({ 
        name: a.agent.name, 
        skill_match: `${Math.round(a.scores.skill * 100)}%` 
      }))
    };
  }

  // Assign task to best agent
  const { error: assignError } = await supabase
    .from('tasks')
    .update({ 
      assignee_agent_id: bestMatch.agent.id,
      status: 'CLAIMED',
      metadata: { auto_assigned: true, assignment_score: bestMatch.totalScore }
    })
    .eq('id', taskId);

  if (assignError) {
    return { assigned: false, reason: `Assignment failed: ${assignError.message}` };
  }

  // Update agent workload
  await supabase
    .from('agents')
    .update({ 
      current_workload: (bestMatch.agent.current_workload || 0) + 1,
      status: 'BUSY'
    })
    .eq('id', bestMatch.agent.id);

  // Log activity
  await supabase.from('eliza_activity_log').insert({
    activity_type: 'stae_smart_assignment',
    title: `🤖 STAE: Smart Assignment`,
    description: `Assigned task to ${bestMatch.agent.name} (score: ${Math.round(bestMatch.totalScore * 100)}%)`,
    status: 'completed',
    task_id: taskId,
    agent_id: bestMatch.agent.id,
    metadata: { 
      scores: bestMatch.scores, 
      total_score: bestMatch.totalScore,
      matching_skills: bestMatch.matchingSkills
    }
  });

  return {
    assigned: true,
    agent_id: bestMatch.agent.id,
    agent_name: bestMatch.agent.name,
    assignment_score: `${Math.round(bestMatch.totalScore * 100)}%`,
    skill_match: `${Math.round(bestMatch.scores.skill * 100)}%`,
    matching_skills: bestMatch.matchingSkills,
    all_scores: bestMatch.scores
  };
}

/**
 * Check if task checklist is completed
 */
async function checkChecklistCompletion(task: any): Promise<boolean> {
  const checklist = task.metadata?.checklist || [];
  const completedItems = task.metadata?.completed_checklist_items || [];
  
  if (checklist.length === 0) return true; // No checklist = passes
  
  return completedItems.length >= checklist.length * 0.8; // 80% completion threshold
}
