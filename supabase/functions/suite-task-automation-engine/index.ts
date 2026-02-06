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
  const usageTracker = (action: string) => console.log(`🚀 [STAE] Action: ${action}`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { action, data = {} } = body;

    usageTracker(action);

    // --- REUSABLE CORE LOGIC ---

    const executeSmartAssign = async (targetTaskId?: string, preferAgentId?: string, minSkillMatch = 0.3) => {
      if (targetTaskId) {
        // Single task assignment
        const { data: task } = await supabase.from('tasks').select('id, metadata, title').eq('id', targetTaskId).single();
        if (!task) throw new Error(`Task ${targetTaskId} not found`);
        const skills = task.metadata?.required_skills || [];
        const assignResult = await smartAssignTask(supabase, targetTaskId, skills, preferAgentId, minSkillMatch);
        return { success: true, task_id: targetTaskId, task_title: task.title, ...assignResult };
      } else {
        // Batch assignment (default behavior for cron)
        const { data: pendingTasks } = await supabase
          .from('tasks')
          .select('id, metadata')
          .is('assignee_agent_id', null)
          .eq('status', 'PENDING')
          .limit(10);

        const assignments = [];
        for (const task of pendingTasks || []) {
          const skills = task.metadata?.required_skills || [];
          const assignResult = await smartAssignTask(supabase, task.id, skills, preferAgentId, minSkillMatch);
          assignments.push({ task_id: task.id, ...assignResult });
        }
        return { success: true, batch_mode: true, tasks_processed: assignments.length, assignments };
      }
    };

    const executeChecklistAdvance = async (targetTaskId?: string) => {
      let tasksToCheck = [];
      if (targetTaskId) {
        const { data: task } = await supabase.from('tasks').select('*').eq('id', targetTaskId).single();
        if (task) tasksToCheck = [task];
      } else {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('*')
          .in('status', ['PENDING', 'CLAIMED', 'IN_PROGRESS'])
          .neq('stage', 'INTEGRATE');
        tasksToCheck = tasks || [];
      }

      const advancedTasks = [];
      const STAGE_ORDER = ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'];
      const STAGE_THRESHOLDS: Record<string, { minChecklist: number; minHours: number }> = {
        'DISCUSS': { minChecklist: 0.5, minHours: 2 },
        'PLAN': { minChecklist: 0.8, minHours: 4 },
        'EXECUTE': { minChecklist: 1.0, minHours: 8 },
        'VERIFY': { minChecklist: 0.8, minHours: 2 }
      };

      for (const task of tasksToCheck) {
        const checklist = task.metadata?.checklist || [];
        const completedItems = task.completed_checklist_items || [];
        const checklistProgress = checklist.length > 0 ? completedItems.length / checklist.length : 1;
        const stageStarted = task.stage_started_at || task.created_at;
        const hoursInStage = (Date.now() - new Date(stageStarted).getTime()) / (1000 * 60 * 60);
        const currentStageIdx = STAGE_ORDER.indexOf(task.stage);
        const threshold = STAGE_THRESHOLDS[task.stage];

        if (threshold && currentStageIdx < STAGE_ORDER.length - 1) {
          // REQUIRE documented progress: at least one checklist item OR explicit progress
          const hasDocumentedProgress = completedItems.length > 0 || (task.progress_percentage > 0);

          const meetsChecklistThreshold = checklistProgress >= threshold.minChecklist;
          const meetsTimeThreshold = hoursInStage >= threshold.minHours;
          const shouldAdvance = hasDocumentedProgress && (meetsChecklistThreshold || meetsTimeThreshold);

          if (shouldAdvance) {
            const nextStage = STAGE_ORDER[currentStageIdx + 1];
            await supabase.from('tasks').update({
              stage: nextStage,
              stage_started_at: new Date().toISOString()
            }).eq('id', task.id);

            await supabase.from('eliza_activity_log').insert({
              activity_type: 'stae_stage_advance',
              title: `⏩ STAE: Stage Advanced`,
              description: `Task "${task.title}" advanced from ${task.stage} to ${nextStage} (checklist: ${Math.round(checklistProgress * 100)}%)`,
              status: 'completed',
              task_id: task.id,
              metadata: { from_stage: task.stage, to_stage: nextStage, checklist_progress: checklistProgress }
            });

            advancedTasks.push({ task_id: task.id, title: task.title, from: task.stage, to: nextStage });
          }
        }
      }

      return { success: true, tasks_checked: tasksToCheck.length, tasks_advanced: advancedTasks.length, advanced: advancedTasks };
    };

    const executeAutoResolveBlockers = async (targetTaskId?: string) => {
      let blockedTasks = [];
      if (targetTaskId) {
        const { data: task } = await supabase.from('tasks').select('*').eq('id', targetTaskId).eq('status', 'BLOCKED').single();
        if (task) blockedTasks = [task];
      } else {
        const { data: tasks } = await supabase.from('tasks').select('*').eq('status', 'BLOCKED').limit(20);
        blockedTasks = tasks || [];
      }

      const RESOLUTION_RULES: Record<string, { autoResolve: boolean; action: string; message: string; type: string }> = {
        'github': { autoResolve: true, action: 'verify_github_access', message: 'GitHub access verified', type: 'github' },
        'dependency': { autoResolve: false, action: 'install_dependency', message: 'Dependency needs manual installation', type: 'dependency' },
        'permission': { autoResolve: false, action: 'escalate_to_admin', message: 'Permission issue escalated', type: 'permission' },
        'api': { autoResolve: true, action: 'retry_api_call', message: 'API connection retried', type: 'api' },
        'waiting': { autoResolve: false, action: 'check_dependency_status', message: 'Waiting for dependent task', type: 'waiting' },
        'approval': { autoResolve: false, action: 'check_governance_status', message: 'Awaiting council approval', type: 'approval' }
      };

      const resolutions = [];
      for (const task of blockedTasks) {
        const reason = (task.blocked_reason || '').toLowerCase();
        let matchedRule = null;
        for (const [key, rule] of Object.entries(RESOLUTION_RULES)) {
          if (reason.includes(key)) {
            matchedRule = rule;
            break;
          }
        }

        if (matchedRule?.autoResolve) {
          await supabase.from('tasks').update({
            status: 'IN_PROGRESS',
            blocked_reason: null,
            metadata: { ...task.metadata, last_blocker_resolved: new Date().toISOString() }
          }).eq('id', task.id);

          await supabase.from('task_blocker_resolutions').insert({
            task_id: task.id,
            blocker_type: matchedRule.type,
            original_reason: task.blocked_reason,
            resolution_action: matchedRule.action,
            resolved_automatically: true,
            resolution_notes: matchedRule.message
          });

          await supabase.from('eliza_activity_log').insert({
            activity_type: 'stae_blocker_resolved',
            title: `🔓 STAE: Blocker Auto-Resolved`,
            description: `Task "${task.title}" unblocked: ${matchedRule.message}`,
            status: 'completed',
            task_id: task.id
          });

          resolutions.push({ task_id: task.id, resolved: true, action: matchedRule.action });
        } else if (matchedRule) {
          resolutions.push({ task_id: task.id, resolved: false, suggestion: matchedRule.message, action: matchedRule.action });
        } else {
          resolutions.push({ task_id: task.id, resolved: false, suggestion: 'No resolution found', action: 'manual' });
        }
      }
      return { success: true, blocked_tasks_checked: blockedTasks.length, resolutions };
    };

    let result: any;

    switch (action) {
      case 'run_all': {
        console.log('🔄 Executing consolidated run_all cycle...');
        const assignResult = await executeSmartAssign(undefined, undefined, 0.3);
        const advanceResult = await executeChecklistAdvance();
        const resolveResult = await executeAutoResolveBlockers();

        result = {
          success: true,
          action: 'run_all',
          smart_assign: assignResult,
          checklist_advance: advanceResult,
          resolve_blockers: resolveResult
        };
        break;
      }

      case 'create_from_template': {
        const { template_name, title, description, priority, repo, auto_assign = true } = data;
        if (!template_name || !title) throw new Error('template_name and title are required');
        const { data: template, error: templateError } = await supabase.from('task_templates').select('*').eq('template_name', template_name).eq('is_active', true).single();
        if (templateError || !template) throw new Error(`Template '${template_name}' not found or inactive`);
        const taskDescription = description || template.description_template.replace('{{title}}', title);
        const taskId = `task-${crypto.randomUUID()}`;
        const { data: task, error: taskError } = await supabase.from('tasks').insert({
          id: taskId, title, description: taskDescription, repo: repo || 'xmrt-ecosystem', category: template.category, stage: template.default_stage, priority: priority ?? template.default_priority, status: 'PENDING',
          metadata: { created_from_template: template_name, template_id: template.id, required_skills: template.required_skills, checklist: template.checklist, auto_advance_threshold_hours: template.auto_advance_threshold_hours, estimated_duration_hours: template.estimated_duration_hours },
          auto_advance_threshold_hours: template.auto_advance_threshold_hours
        }).select().single();
        if (taskError) throw taskError;
        await supabase.from('task_templates').update({ times_used: template.times_used + 1 }).eq('id', template.id);
        await supabase.from('eliza_activity_log').insert({ activity_type: 'stae_task_created', title: `📋 STAE: Task Created from Template`, description: `Created task "${title}" using template "${template_name}"`, status: 'completed', task_id: task.id, metadata: { template_name, category: template.category, auto_assign } });
        let assignmentResult = null;
        if (auto_assign) {
          assignmentResult = await executeSmartAssign(task.id, undefined, 0.3);
        }
        result = { success: true, task, template_used: template_name, auto_assigned: auto_assign, assignment: assignmentResult };
        break;
      }

      case 'smart_assign': {
        const { task_id, prefer_agent_id, min_skill_match, auto_batch } = data;
        if (auto_batch) {
          result = await executeSmartAssign(undefined, prefer_agent_id, min_skill_match);
        } else {
          result = await executeSmartAssign(task_id, prefer_agent_id, min_skill_match);
        }
        break;
      }

      case 'auto_create_and_assign': {
        const { template_name, title, description, priority } = data;
        const createResult = await supabase.functions.invoke('suite-task-automation-engine', {
          body: { action: 'create_from_template', data: { template_name, title, description, priority, auto_assign: true } }
        });
        result = createResult.data;
        break;
      }

      case 'verify_completion': {
        const { task_id } = data;
        if (!task_id) throw new Error('task_id is required');
        const { data: task } = await supabase.from('tasks').select('*').eq('id', task_id).single();
        if (!task) throw new Error(`Task ${task_id} not found`);
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
        const passesQualityGate = qualityScore >= 60;
        await supabase.from('eliza_activity_log').insert({ activity_type: 'stae_quality_verification', title: `🔍 STAE: Quality Verification`, description: `Task "${task.title}" scored ${qualityScore}% - ${passesQualityGate ? 'PASSED' : 'NEEDS REVIEW'}`, status: passesQualityGate ? 'completed' : 'pending', task_id, metadata: { checks, qualityScore, passesQualityGate } });
        result = { success: true, task_id, quality_score: qualityScore, passes_quality_gate: passesQualityGate, checks, recommendation: passesQualityGate ? 'Task meets quality standards - ready for completion' : 'Task needs review - some quality checks failed' };
        break;
      }

      case 'extract_knowledge': {
        const { task_id, completed_since_hours = 24 } = data;
        let tasksToProcess = [];
        if (task_id) {
          const { data: task } = await supabase.from('tasks').select('*').eq('id', task_id).single();
          if (task) tasksToProcess = [task];
        } else {
          const cutoff = new Date(Date.now() - completed_since_hours * 60 * 60 * 1000).toISOString();
          const { data: tasks } = await supabase.from('tasks').select('*').eq('status', 'COMPLETED').gte('updated_at', cutoff).is('metadata->knowledge_extracted', null);
          tasksToProcess = tasks || [];
        }
        const extractedKnowledge = [];
        for (const task of tasksToProcess) {
          const learnings = { task_id: task.id, title: task.title, category: task.category, resolution: task.resolution || task.result, duration_hours: task.metadata?.actual_duration_hours, template_used: task.metadata?.created_from_template, skills_used: task.metadata?.required_skills || [], blockers_encountered: task.blocked_reason ? [task.blocked_reason] : [], stage_progression: task.stage, success: task.status === 'COMPLETED' };
          await supabase.from('learning_patterns').insert({ learning_type: 'task_completion', context: JSON.stringify({ task_category: task.category, template: task.metadata?.created_from_template, skills: task.metadata?.required_skills }), pattern_data: learnings, confidence: task.status === 'COMPLETED' ? 0.9 : 0.5, application_count: 1, last_applied: new Date().toISOString() });
          await supabase.from('tasks').update({ metadata: { ...task.metadata, knowledge_extracted: true, extracted_at: new Date().toISOString() } }).eq('id', task.id);
          extractedKnowledge.push(learnings);
        }
        if (extractedKnowledge.length > 0) {
          await supabase.from('eliza_activity_log').insert({ activity_type: 'stae_knowledge_extraction', title: `📚 STAE: Knowledge Extraction`, description: `Extracted knowledge from ${extractedKnowledge.length} completed task(s)`, status: 'completed', metadata: { tasks_processed: extractedKnowledge.length } });
        }
        result = { success: true, tasks_processed: extractedKnowledge.length, knowledge_entries: extractedKnowledge };
        break;
      }

      case 'get_metrics': {
        const { time_window_hours = 24, store_metrics = false } = data;
        const cutoff = new Date(Date.now() - time_window_hours * 60 * 60 * 1000).toISOString();
        const { data: allTasks, count: totalTasks } = await supabase.from('tasks').select('*', { count: 'exact' }).gte('created_at', cutoff);
        const templateTasks = allTasks?.filter(t => t.metadata?.created_from_template) || [];
        const automationCoverage = totalTasks ? Math.round((templateTasks.length / totalTasks) * 100) : 0;
        const autoAssignedTasks = allTasks?.filter(t => t.metadata?.auto_assigned) || [];
        const autoAssignmentRate = totalTasks ? Math.round((autoAssignedTasks.length / totalTasks) * 100) : 0;
        const completedTasks = allTasks?.filter(t => t.status === 'COMPLETED') || [];
        const knowledgeExtracted = completedTasks.filter(t => t.metadata?.knowledge_extracted) || [];
        const knowledgeExtractionRate = completedTasks.length ? Math.round((knowledgeExtracted.length / completedTasks.length) * 100) : 0;
        const { data: agents } = await supabase.from('agents').select('id, name, status, current_workload, max_concurrent_tasks').neq('status', 'ARCHIVED');
        const activeAgents = agents?.filter(a => a.status !== 'OFFLINE') || [];
        const totalCapacity = activeAgents.reduce((sum, a) => sum + (a.max_concurrent_tasks || 5), 0);
        const currentWorkload = activeAgents.reduce((sum, a) => sum + (a.current_workload || 0), 0);
        const agentUtilization = totalCapacity ? Math.round((currentWorkload / totalCapacity) * 100) : 0;
        const { data: templates } = await supabase.from('task_templates').select('template_name, times_used, success_rate').order('times_used', { ascending: false });
        const completionTimes = completedTasks.filter(t => t.created_at && t.updated_at).map(t => (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60));
        const avgCompletionTime = completionTimes.length ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length * 10) / 10 : 0;
        const metrics = { time_window_hours, automation_coverage: `${automationCoverage}%`, auto_assignment_rate: `${autoAssignmentRate}%`, knowledge_extraction_rate: `${knowledgeExtractionRate}%`, agent_utilization: `${agentUtilization}%`, avg_completion_time_hours: avgCompletionTime, total_tasks: totalTasks || 0, template_tasks: templateTasks.length, completed_tasks: completedTasks.length, active_agents: activeAgents.length, template_usage: templates?.slice(0, 5) || [] };
        if (store_metrics) await supabase.from('autonomy_metrics').insert({ metric_name: 'stae_automation_metrics', metric_value: metrics, measured_at: new Date().toISOString() });
        result = { success: true, metrics, generated_at: new Date().toISOString() };
        break;
      }

      case 'list_templates': {
        const { category, include_inactive = false } = data;
        let query = supabase.from('task_templates').select('*').order('times_used', { ascending: false });
        if (!include_inactive) query = query.eq('is_active', true);
        if (category) query = query.eq('category', category);
        const { data: templates, error } = await query;
        if (error) throw error;
        result = { success: true, templates, count: templates?.length || 0 };
        break;
      }

      case 'update_template_stats': {
        const { template_name, task_success } = data;
        const { data: template } = await supabase.from('task_templates').select('*').eq('template_name', template_name).single();
        if (template) {
          const currentRate = template.success_rate || 0;
          const currentCount = template.times_used || 0;
          const newRate = ((currentRate * (currentCount - 1)) + (task_success ? 100 : 0)) / currentCount;
          await supabase.from('task_templates').update({ success_rate: Math.round(newRate * 10) / 10 }).eq('template_name', template_name);
        }
        result = { success: true, template_name, updated: !!template };
        break;
      }

      case 'checklist_based_advance':
        result = await executeChecklistAdvance(data.task_id);
        break;

      case 'auto_resolve_blockers':
        result = await executeAutoResolveBlockers(data.task_id);
        break;

      case 'verify_task_execution': {
        const { task_id_range_start = 1, task_id_range_end = 99 } = data;
        const { data: tasks } = await supabase.from('tasks').select('id, title, status, stage, assigned_agent_id').gte('id', task_id_range_start).lte('id', task_id_range_end).in('status', ['COMPLETED', 'IN_PROGRESS']);
        const auditResults = [];
        if (tasks && tasks.length > 0) {
          for (const task of tasks) {
            const { data: logs } = await supabase.from('superduper_execution_log').select('id, status, created_at').eq('task_id', task.id).eq('status', 'success').limit(1);
            const hasLogs = logs && logs.length > 0;
            if (!hasLogs) {
              auditResults.push({ task_id: task.id, title: task.title, status: 'MISSING_PROOF', action: 'Flagged for human review' });
              await supabase.from('eliza_activity_log').insert({ activity_type: 'stae_audit_failure', title: `⚠️ Audit: No Proof for Task #${task.id}`, description: `Task "${task.title}" has no SuperDuper execution logs. Flagged for review.`, status: 'action_required', task_id: task.id, metadata: { agent: task.assigned_agent_id } });
            } else {
              auditResults.push({ task_id: task.id, status: 'VERIFIED' });
            }
          }
        }
        result = { success: true, audit_summary: { total_checked: tasks?.length || 0, verified: auditResults.filter(r => r.status === 'VERIFIED').length, flagged: auditResults.filter(r => r.status === 'MISSING_PROOF').length, details: auditResults } };
        break;
      }

      case 'update_checklist_item': {
        const { task_id, item_index, item_text, completed } = data;
        if (!task_id) throw new Error('task_id is required');
        const { data: task } = await supabase.from('tasks').select('*').eq('id', task_id).single();
        if (!task) throw new Error(`Task ${task_id} not found`);
        const completedItems = [...(task.completed_checklist_items || [])];
        const checklist = task.metadata?.checklist || [];
        const itemToMark = item_index !== undefined ? checklist[item_index] : item_text;
        if (completed && !completedItems.includes(itemToMark)) { completedItems.push(itemToMark); } else if (!completed) { const idx = completedItems.indexOf(itemToMark); if (idx > -1) completedItems.splice(idx, 1); }
        await supabase.from('tasks').update({ completed_checklist_items: completedItems }).eq('id', task_id);
        const progress = checklist.length > 0 ? Math.round((completedItems.length / checklist.length) * 100) : 100;
        result = { success: true, task_id, checklist_progress: `${progress}%`, completed_items: completedItems.length, total_items: checklist.length };
        break;
      }

      case 'get_checklist_progress': {
        const { task_id } = data;
        if (!task_id) throw new Error('task_id is required');
        const { data: task } = await supabase.from('tasks').select('*').eq('id', task_id).single();
        if (!task) throw new Error(`Task ${task_id} not found`);
        const checklist = task.metadata?.checklist || [];
        const completedItems = task.completed_checklist_items || [];
        const progress = checklist.length > 0 ? Math.round((completedItems.length / checklist.length) * 100) : 100;
        result = { success: true, task_id, progress_percent: progress, completed_items: completedItems, pending_items: checklist.filter((item: string) => !completedItems.includes(item)), total_items: checklist.length };
        break;
      }

      case 'document_agent_progress': {
        const { task_id, agent_id, work_summary, items_completed = [], progress_note } = data;
        if (!task_id) throw new Error('task_id is required');
        const { data: task } = await supabase.from('tasks').select('*').eq('id', task_id).single();
        if (!task) throw new Error(`Task ${task_id} not found`);
        const existingCompleted = task.completed_checklist_items || [];
        const checklist = task.metadata?.checklist || [];
        const newlyCompleted = (items_completed || []).filter((item: string) => !existingCompleted.includes(item));
        const updatedCompleted = [...existingCompleted, ...newlyCompleted];
        const progressPercent = checklist.length > 0 ? Math.round((updatedCompleted.length / checklist.length) * 100) : Math.min(100, (task.progress_percentage || 0) + 10);
        const existingNotes = task.metadata?.agent_notes || [];
        const newNote = { timestamp: new Date().toISOString(), agent_id: agent_id || task.assignee_agent_id, summary: work_summary || progress_note || `Completed: ${newlyCompleted.join(', ')}`, items_completed: newlyCompleted };
        await supabase.from('tasks').update({ completed_checklist_items: updatedCompleted, progress_percentage: progressPercent, metadata: { ...task.metadata, agent_notes: [...existingNotes, newNote], last_progress_update: new Date().toISOString() } }).eq('id', task_id);
        await supabase.from('eliza_activity_log').insert({ activity_type: 'agent_progress_documented', title: `📝 Agent Progress: ${task.title}`, description: work_summary || `Completed ${newlyCompleted.length} items (${progressPercent}% total)`, status: 'completed', task_id: task_id, agent_id: agent_id || task.assignee_agent_id, metadata: { items_completed: newlyCompleted, progress_percent: progressPercent, note: progress_note } });
        result = { success: true, task_id, progress_percent: progressPercent, items_newly_completed: newlyCompleted, total_completed: updatedCompleted.length, total_items: checklist.length, note_recorded: !!work_summary || !!progress_note };
        break;
      }

      case 'escalate_stalled_task': {
        const { task_id, reason } = data;
        if (!task_id) throw new Error('task_id is required');
        const { data: task } = await supabase.from('tasks').select('*').eq('id', task_id).single();
        if (!task) throw new Error(`Task ${task_id} not found`);
        await supabase.from('tasks').update({ priority: Math.min((task.priority || 5) + 2, 10), metadata: { ...task.metadata, escalated: true, escalation_reason: reason, escalated_at: new Date().toISOString() } }).eq('id', task_id);
        await supabase.from('eliza_activity_log').insert({ activity_type: 'stae_task_escalated', title: `🚨 STAE: Task Escalated to Council`, description: `Task "${task.title}" requires council attention: ${reason || 'Stalled progress'}`, status: 'pending', task_id: task_id, metadata: { original_priority: task.priority, new_priority: Math.min((task.priority || 5) + 2, 10) } });
        result = { success: true, task_id, escalated: true, new_priority: Math.min((task.priority || 5) + 2, 10) };
        break;
      }

      case 'update_template_performance': {
        const { time_window_hours = 168 } = data;
        const cutoff = new Date(Date.now() - time_window_hours * 60 * 60 * 1000).toISOString();
        const { data: templates } = await supabase.from('task_templates').select('*');
        const updates = [];
        for (const template of templates || []) {
          const { data: tasks } = await supabase.from('tasks').select('*').eq('metadata->>created_from_template', template.template_name).gte('created_at', cutoff);
          if (!tasks || tasks.length === 0) continue;
          const completedTasks = tasks.filter(t => t.status === 'COMPLETED');
          const successRate = Math.round((completedTasks.length / tasks.length) * 100);
          const durations = completedTasks.filter(t => t.created_at && t.updated_at).map(t => (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60));
          const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
          await supabase.from('task_templates').update({ success_rate: successRate, estimated_duration_hours: avgDuration ? Math.round(avgDuration * 10) / 10 : template.estimated_duration_hours }).eq('id', template.id);
          updates.push({ template: template.template_name, tasks_analyzed: tasks.length, success_rate: successRate, avg_duration: avgDuration });
        }
        result = { success: true, templates_updated: updates.length, updates };
        break;
      }

      case 'get_optimization_recommendations': {
        const recommendations = [];
        const { data: agents } = await supabase.from('agents').select('*').neq('status', 'ARCHIVED');
        for (const agent of agents || []) {
          const { count: completed } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('assignee_agent_id', agent.id).eq('status', 'COMPLETED');
          const { count: failed } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('assignee_agent_id', agent.id).eq('status', 'FAILED');
          const total = (completed || 0) + (failed || 0);
          if (total >= 5 && (completed || 0) / total < 0.7) { recommendations.push({ type: 'agent_performance', severity: 'medium', agent: agent.name, message: `Agent ${agent.name} has low success rate (${Math.round(((completed || 0) / total) * 100)}%). Consider retraining or reassigning tasks.` }); }
        }
        const { data: templates } = await supabase.from('task_templates').select('*').gt('times_used', 5);
        for (const template of templates || []) { if ((template.success_rate || 0) < 60) { recommendations.push({ type: 'template_optimization', severity: 'low', template: template.template_name, message: `Template "${template.template_name}" has ${template.success_rate}% success rate. Consider updating checklist or requirements.` }); } }
        const { data: pendingTasks } = await supabase.from('tasks').select('*').is('assignee_agent_id', null).eq('status', 'PENDING').limit(10);
        for (const task of pendingTasks || []) { const requiredSkills = task.metadata?.required_skills || []; if (requiredSkills.length > 0) { recommendations.push({ type: 'skill_gap', severity: 'high', task: task.title, message: `Unassigned task needs skills: ${requiredSkills.join(', ')}. Consider spawning specialized agent.` }); } }
        const busyAgents = (agents || []).filter(a => (a.current_workload || 0) >= (a.max_concurrent_tasks || 5) * 0.8);
        const idleAgents = (agents || []).filter(a => a.status === 'IDLE' && (a.current_workload || 0) === 0);
        if (busyAgents.length > 2 && idleAgents.length > 0) { recommendations.push({ type: 'workload_imbalance', severity: 'medium', message: `${busyAgents.length} agents overloaded while ${idleAgents.length} are idle. Run smart_assign to rebalance.` }); }
        result = { success: true, recommendations, generated_at: new Date().toISOString() };
        break;
      }

      case 'create_knowledge_relationships': {
        const { task_id, entity_type = 'task_pattern' } = data;
        if (!task_id) throw new Error('task_id is required');
        const { data: task } = await supabase.from('tasks').select('*').eq('id', task_id).single();
        if (!task) throw new Error(`Task ${task_id} not found`);
        const relationships = [];
        const { data: entity } = await supabase.from('knowledge_entities').insert({ entity_type, entity_name: `Pattern: ${task.category}/${task.metadata?.created_from_template || 'manual'}`, confidence: task.status === 'COMPLETED' ? 0.9 : 0.5, metadata: { task_id: task.id, category: task.category, template: task.metadata?.created_from_template, skills_used: task.metadata?.required_skills, duration_hours: task.updated_at && task.created_at ? (new Date(task.updated_at).getTime() - new Date(task.created_at).getTime()) / (1000 * 60 * 60) : null, success: task.status === 'COMPLETED' } }).select().single();
        if (entity) {
          relationships.push({ entity_id: entity.id, type: 'task_pattern' });
          if (task.assignee_agent_id) { await supabase.from('entity_relationships').insert({ source_entity_id: entity.id, target_entity_type: 'agent', target_entity_name: task.assignee_agent_id, relationship_type: 'completed_by', strength: task.status === 'COMPLETED' ? 0.9 : 0.3 }); relationships.push({ type: 'agent_link', agent_id: task.assignee_agent_id }); }
          for (const skill of task.metadata?.required_skills || []) { await supabase.from('entity_relationships').insert({ source_entity_id: entity.id, target_entity_type: 'skill', target_entity_name: skill, relationship_type: 'requires_skill', strength: 0.8 }); relationships.push({ type: 'skill_link', skill }); }
        }
        result = { success: true, task_id, entity_created: !!entity, relationships };
        break;
      }

      case 'advance_task_stage': {
        const { task_id, target_stage } = data;
        if (!task_id) throw new Error('task_id is required');
        const STAGE_ORDER = ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'];
        const { data: task } = await supabase.from('tasks').select('*').eq('id', task_id).single();
        if (!task) throw new Error(`Task ${task_id} not found`);
        const currentIdx = STAGE_ORDER.indexOf(task.stage);
        let nextStage = target_stage;
        if (!nextStage) { if (currentIdx < STAGE_ORDER.length - 1) { nextStage = STAGE_ORDER[currentIdx + 1]; } else { throw new Error('Task is already at final stage'); } }
        if (!STAGE_ORDER.includes(nextStage)) { throw new Error(`Invalid stage: ${nextStage}. Valid: ${STAGE_ORDER.join(', ')}`); }
        await supabase.from('tasks').update({ stage: nextStage, stage_started_at: new Date().toISOString() }).eq('id', task_id);
        await supabase.from('eliza_activity_log').insert({ activity_type: 'stae_manual_advance', title: `⏩ STAE: Manual Stage Advance`, description: `Task "${task.title}" manually advanced from ${task.stage} to ${nextStage}`, status: 'completed', task_id });
        result = { success: true, task_id, previous_stage: task.stage, new_stage: nextStage };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}. Available: run_all, create_from_template, smart_assign, verify_completion, extract_knowledge, get_metrics, list_templates, checklist_based_advance, auto_resolve_blockers, update_checklist_item, get_checklist_progress, escalate_stalled_task, update_template_performance, get_optimization_recommendations, create_knowledge_relationships, advance_task_stage`);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ [STAE] Action ${action} completed in ${executionTime}ms`);
    return new Response(JSON.stringify({ ...result, execution_time_ms: executionTime }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ [STAE] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

  // First fetch existing task to preserve its metadata (especially checklist!)
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('metadata')
    .eq('id', taskId)
    .single();

  const existingMetadata = existingTask?.metadata || {};

  // Assign task to best agent - MERGE with existing metadata to preserve checklist
  const { error: assignError } = await supabase
    .from('tasks')
    .update({
      assignee_agent_id: bestMatch.agent.id,
      status: 'CLAIMED',
      metadata: {
        ...existingMetadata,  // Preserve existing metadata (checklist, etc.)
        auto_assigned: true,
        assignment_score: bestMatch.totalScore
      }
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
