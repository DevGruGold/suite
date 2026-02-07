import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const usageTracker = startUsageTracking('self-optimizing-agent-architecture');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { action } = await req.json();

    console.log(`🤖 Self-Optimizer: ${action}`);

    let result;

    switch (action) {
      case 'analyze_skill_gaps':
        result = await analyzeSkillGaps(supabase);
        break;
      
      case 'optimize_task_routing':
        result = await optimizeTaskRouting(supabase);
        break;
      
      case 'detect_specializations':
        result = await detectSpecializations(supabase);
        break;
      
      case 'forecast_workload':
        result = await forecastWorkload(supabase);
        break;
      
      case 'autonomous_debugging':
        result = await autonomousDebugging(supabase);
        break;
      
      case 'run_full_optimization':
        result = await runFullOptimization(supabase);
        break;
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await usageTracker.success({ result_summary: `action_${action}` });
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Self-optimizer error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function runFullOptimization(supabase: any) {
  console.log('🔄 Running full optimization cycle...');
  
  const results = {
    skillGaps: await analyzeSkillGaps(supabase),
    taskRouting: await optimizeTaskRouting(supabase),
    specializations: await detectSpecializations(supabase),
    workload: await forecastWorkload(supabase),
    debugging: await autonomousDebugging(supabase),
    timestamp: new Date().toISOString()
  };

  await supabase.from('eliza_activity_log').insert({
    activity_type: 'self_optimization',
    title: 'Full Optimization Cycle Complete',
    description: `Analyzed ${results.skillGaps.skillGapsFound} skill gaps, optimized ${results.taskRouting.tasksOptimized} tasks, detected ${results.specializations.specializationsDetected} specializations`,
    status: 'completed',
    metadata: results
  });

  return results;
}

async function analyzeSkillGaps(supabase: any) {
  console.log('🔍 Analyzing skill gaps...');

  const { data: blockedTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'BLOCKED');

  const skillGaps = new Map<string, { frequency: number, taskIds: string[] }>();

  for (const task of blockedTasks || []) {
    const extractedSkills = extractRequiredSkills(task.blocking_reason || '', task.description);
    
    for (const skill of extractedSkills) {
      if (!skillGaps.has(skill)) {
        skillGaps.set(skill, { frequency: 0, taskIds: [] });
      }
      const gap = skillGaps.get(skill)!;
      gap.frequency++;
      gap.taskIds.push(task.id);
    }
  }

  for (const [skill, data] of skillGaps) {
    await supabase.from('skill_gap_analysis').upsert({
      identified_skill: skill,
      frequency: data.frequency,
      blocked_tasks: data.taskIds,
      priority: Math.min(10, 5 + Math.floor(data.frequency / 2)),
      status: 'identified'
    }, { onConflict: 'identified_skill' });
  }

  const { data: topGaps } = await supabase
    .from('skill_gap_analysis')
    .select('*')
    .eq('status', 'identified')
    .order('priority', { ascending: false })
    .limit(3);

  let learningTasksCreated = 0;
  for (const gap of topGaps || []) {
    await createLearningTask(supabase, gap.identified_skill);
    learningTasksCreated++;
  }

  return { 
    skillGapsFound: skillGaps.size, 
    learningTasksCreated,
    topSkillGaps: Array.from(skillGaps.entries()).slice(0, 5)
  };
}

async function createLearningTask(supabase: any, skill: string) {
  const { data: learningMaterials } = await supabase
    .from('knowledge_entities')
    .select('*')
    .or(`entity_name.ilike.%${skill}%,description.ilike.%${skill}%`)
    .limit(10);

  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .eq('status', 'IDLE')
    .limit(5);

  if (!agents || agents.length === 0) return null;

  const bestAgent = selectBestLearningAgent(agents, skill);

  const { data: session } = await supabase
    .from('learning_sessions')
    .insert({
      agent_id: bestAgent.id,
      skill_being_learned: skill,
      learning_materials: { resources: learningMaterials || [] },
      status: 'in_progress'
    })
    .select()
    .single();

  const { data: learningTask } = await supabase
    .from('tasks')
    .insert({
      id: `learning-${skill.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      title: `Learn Skill: ${skill}`,
      description: `Study and practice ${skill} to acquire proficiency`,
      repo: 'xmrt-dao',
      category: 'learning',
      stage: 'LEARNING',
      status: 'IN_PROGRESS',
      assignee_agent_id: bestAgent.id,
      priority: 8
    })
    .select()
    .single();

  await supabase
    .from('learning_sessions')
    .update({ learning_task_id: learningTask?.id })
    .eq('id', session?.id);

  await supabase
    .from('skill_gap_analysis')
    .update({ 
      status: 'learning',
      proposed_learning_tasks: [learningTask?.id]
    })
    .eq('identified_skill', skill);

  return { session, learningTask };
}

function selectBestLearningAgent(agents: any[], skill: string) {
  return agents.sort((a, b) => {
    const aRelatedSkills = a.skills.filter((s: string) => 
      s.toLowerCase().includes(skill.toLowerCase().split(' ')[0])
    ).length;
    const bRelatedSkills = b.skills.filter((s: string) => 
      s.toLowerCase().includes(skill.toLowerCase().split(' ')[0])
    ).length;
    return bRelatedSkills - aRelatedSkills;
  })[0];
}

function extractRequiredSkills(blockingReason: string, description: string): string[] {
  const text = `${blockingReason} ${description}`.toLowerCase();
  const skillPatterns = [
    /requires?\s+(\w+(?:\s+\w+)?)\s+skill/gi,
    /need(?:s|ed)?\s+(\w+(?:\s+\w+)?)\s+expertise/gi,
    /missing\s+(\w+(?:\s+\w+)?)\s+knowledge/gi,
    /(\w+(?:\s+\w+)?)\s+proficiency\s+required/gi
  ];

  const skills = new Set<string>();
  
  for (const pattern of skillPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) {
        skills.add(match[1].trim());
      }
    }
  }

  return Array.from(skills);
}

async function optimizeTaskRouting(supabase: any) {
  console.log('🎯 Optimizing task routing...');

  const { data: agents } = await supabase.from('agents').select('*');
  const { data: pendingTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'PENDING')
    .order('priority', { ascending: false })
    .limit(20);

  const assignments = [];

  for (const task of pendingTasks || []) {
    const bestAgent = await findBestAgentForTask(supabase, task, agents || []);
    
    if (bestAgent && bestAgent.matchScore > 0.3) {
      assignments.push({
        task_id: task.id,
        agent_id: bestAgent.id,
        confidence_score: bestAgent.matchScore,
        routing_reason: bestAgent.reason
      });
    }
  }

  for (const assignment of assignments) {
    await supabase
      .from('tasks')
      .update({ 
        assignee_agent_id: assignment.agent_id,
        status: 'IN_PROGRESS'
      })
      .eq('id', assignment.task_id);
    
    await supabase
      .from('agents')
      .update({ status: 'BUSY' })
      .eq('id', assignment.agent_id);

    await supabase.from('agent_performance_metrics').insert({
      agent_id: assignment.agent_id,
      metric_type: 'task_assignment',
      metric_value: assignment.confidence_score,
      time_window: '1h',
      metadata: { task_id: assignment.task_id, reason: assignment.routing_reason }
    });
  }

  return { tasksOptimized: assignments.length, assignments: assignments.slice(0, 5) };
}

async function findBestAgentForTask(supabase: any, task: any, agents: any[]) {
  const scoredAgents = [];

  for (const agent of agents) {
    let score = 0;
    const reasons = [];

    const requiredSkills = extractRequiredSkills(task.description, task.title);
    const agentSkills = agent.skills || [];
    const matchedSkills = requiredSkills.filter(rs => 
      agentSkills.some((as: string) => as.toLowerCase().includes(rs.toLowerCase()))
    );
    const skillMatchPercentage = requiredSkills.length > 0 
      ? matchedSkills.length / requiredSkills.length 
      : 0.5;
    score += skillMatchPercentage * 0.4;
    if (skillMatchPercentage > 0.7) reasons.push('Strong skill match');

    const { data: similarTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('assignee_agent_id', agent.id)
      .eq('category', task.category)
      .eq('status', 'COMPLETED')
      .limit(10);

    const { data: failedTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('assignee_agent_id', agent.id)
      .eq('category', task.category)
      .in('status', ['BLOCKED', 'FAILED'])
      .limit(10);

    const successRate = (similarTasks?.length || 0) > 0 
      ? (similarTasks?.length || 0) / ((similarTasks?.length || 0) + (failedTasks?.length || 0) + 1) 
      : 0.5;
    score += successRate * 0.3;
    if (successRate > 0.8) reasons.push('High success rate');

    const { data: activeTasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('assignee_agent_id', agent.id)
      .in('status', ['PENDING', 'IN_PROGRESS']);

    const workloadScore = Math.max(0, 1 - ((activeTasks?.length || 0) / 5));
    score += workloadScore * 0.2;
    if ((activeTasks?.length || 0) === 0) reasons.push('Currently idle');

    const availabilityScore = agent.status === 'IDLE' ? 1.0 : 0.5;
    score += availabilityScore * 0.1;

    scoredAgents.push({
      ...agent,
      matchScore: score,
      reason: reasons.join(', ') || 'Basic match'
    });
  }

  scoredAgents.sort((a, b) => b.matchScore - a.matchScore);
  return scoredAgents[0];
}

async function detectSpecializations(supabase: any) {
  console.log('🎓 Detecting agent specializations...');

  const { data: agents } = await supabase.from('agents').select('*');
  const specializations = [];

  for (const agent of agents || []) {
    const { data: completedTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('assignee_agent_id', agent.id)
      .eq('status', 'COMPLETED');

    const categoryBreakdown: Record<string, number> = {};
    for (const task of completedTasks || []) {
      categoryBreakdown[task.category] = (categoryBreakdown[task.category] || 0) + 1;
    }

    const totalTasks = completedTasks?.length || 0;

    for (const [category, count] of Object.entries(categoryBreakdown)) {
      const percentage = count / totalTasks;

      if (percentage > 0.5 && count >= 5) {
        const { data: categoryTasks } = await supabase
          .from('tasks')
          .select('*')
          .eq('assignee_agent_id', agent.id)
          .eq('category', category);

        const successCount = categoryTasks?.filter((t: any) => t.status === 'COMPLETED').length || 0;
        const successRate = categoryTasks?.length ? successCount / categoryTasks.length : 0;

        await supabase.from('agent_specializations').upsert({
          agent_id: agent.id,
          specialization_area: category,
          proficiency_score: successRate,
          tasks_completed_in_area: count,
          success_rate: successRate,
          last_updated: new Date().toISOString()
        }, { onConflict: 'agent_id,specialization_area' });

        specializations.push({
          agent_id: agent.id,
          agent_name: agent.name,
          specialization: category,
          proficiency: successRate
        });

        if (successRate > 0.85 && count >= 10) {
          await proposeRoleChange(supabase, agent, category, successRate);
        }
      }
    }
  }

  return { specializationsDetected: specializations.length, specializations };
}

async function proposeRoleChange(supabase: any, agent: any, specialization: string, proficiency: number) {
  const roleMapping: Record<string, string> = {
    'security': 'Security Architect',
    'frontend': 'Frontend Specialist',
    'backend': 'Backend Engineer',
    'devops': 'DevOps Engineer',
    'blockchain': 'Blockchain Developer',
    'learning': 'Learning Coordinator'
  };

  const proposedRole = roleMapping[specialization] || `${specialization} Specialist`;

  await supabase.from('decisions').insert({
    id: `decision-${Date.now()}`,
    agent_id: 'self-optimizer',
    decision: `Propose role change for ${agent.name} to ${proposedRole}`,
    rationale: `Agent has demonstrated ${(proficiency * 100).toFixed(1)}% success rate in ${specialization} over 10+ tasks`
  });

  await supabase.from('tasks').insert({
    id: `role-change-${Date.now()}`,
    title: `Review Role Change: ${agent.name} → ${proposedRole}`,
    description: `Self-optimizer detected strong specialization. Agent: ${agent.name}, Proposed Role: ${proposedRole}, Proficiency: ${(proficiency * 100).toFixed(1)}%`,
    repo: 'xmrt-dao',
    category: 'governance',
    stage: 'REVIEW',
    status: 'PENDING',
    priority: 7,
    assignee_agent_id: 'eliza'
  });
}

async function forecastWorkload(supabase: any) {
  console.log('📊 Forecasting workload...');

  const historicalData = await getHistoricalTaskData(supabase, 7);

  const forecast = {
    next_1h: predictTaskVolume(historicalData, 1),
    next_24h: predictTaskVolume(historicalData, 24),
    next_7d: predictTaskVolume(historicalData, 168)
  };

  const { data: agents } = await supabase.from('agents').select('*');
  const totalCapacity = (agents?.length || 0) * 3;

  const recommendations = [];

  if (forecast.next_1h > totalCapacity * 0.8) {
    recommendations.push('Consider spawning additional agents for next hour');
  }

  if (forecast.next_24h < totalCapacity * 0.3) {
    recommendations.push('Workload dropping - consider agent consolidation');
  }

  for (const [window, predictedValue] of Object.entries(forecast)) {
    await supabase.from('workload_forecasts').insert({
      forecast_type: 'task_volume',
      forecast_window: window,
      predicted_value: predictedValue,
      confidence_score: 0.75,
      contributing_factors: { 
        historical_avg: historicalData.avg, 
        trend: historicalData.trend 
      },
      recommended_actions: recommendations
    });
  }

  return { forecast, recommendations, totalCapacity };
}

async function getHistoricalTaskData(supabase: any, days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data: tasks } = await supabase
    .from('tasks')
    .select('created_at')
    .gte('created_at', startDate.toISOString());

  const tasksByHour: Record<string, number> = {};
  
  for (const task of tasks || []) {
    const hour = new Date(task.created_at).toISOString().split('T')[0];
    tasksByHour[hour] = (tasksByHour[hour] || 0) + 1;
  }

  const values = Object.values(tasksByHour);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const trend = values.length > 1 ? (values[values.length - 1] - values[0]) / values.length : 0;

  return { avg, trend, values };
}

function predictTaskVolume(historicalData: any, hours: number): number {
  const baseRate = historicalData.avg || 0;
  const trendImpact = historicalData.trend * hours;
  return Math.max(0, Math.round(baseRate + trendImpact));
}

async function autonomousDebugging(supabase: any) {
  console.log('🔧 Running autonomous debugging...');

  const anomalies = await detectAnomalies(supabase);

  let workflowsLaunched = 0;

  for (const anomaly of anomalies) {
    if (anomaly.severity === 'high' || anomaly.severity === 'medium') {
      await supabase.from('tasks').insert({
        id: `debug-${anomaly.type}-${Date.now()}`,
        title: `Debug: ${anomaly.description}`,
        description: `Detected anomaly: ${anomaly.details}. Severity: ${anomaly.severity}`,
        repo: 'xmrt-dao',
        category: 'debugging',
        stage: 'DEBUG',
        status: 'PENDING',
        priority: anomaly.severity === 'high' ? 9 : 7
      });

      workflowsLaunched++;
    }
  }

  return { anomaliesDetected: anomalies.length, workflowsLaunched, anomalies };
}

async function detectAnomalies(supabase: any) {
  const anomalies = [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: recentTasks } = await supabase
    .from('tasks')
    .select('*')
    .gte('created_at', oneHourAgo);

  if (recentTasks && recentTasks.length > 0) {
    const completionRate = recentTasks.filter((t: any) => t.status === 'COMPLETED').length / recentTasks.length;
    
    if (completionRate < 0.5) {
      anomalies.push({
        type: 'low_completion_rate',
        description: 'Task completion rate dropped below 50%',
        details: `Only ${(completionRate * 100).toFixed(1)}% tasks completed in last hour`,
        severity: 'high'
      });
    }
  }

  const { data: recentExecutions } = await supabase
    .from('eliza_python_executions')
    .select('*')
    .gte('created_at', oneHourAgo);

  if (recentExecutions && recentExecutions.length > 0) {
    const failureRate = recentExecutions.filter((e: any) => e.exit_code !== 0).length / recentExecutions.length;
    
    if (failureRate > 0.3) {
      anomalies.push({
        type: 'python_execution_failures',
        description: 'Python execution failure rate exceeds 30%',
        details: `${(failureRate * 100).toFixed(1)}% failure rate detected`,
        severity: 'medium'
      });
    }
  }

  const { data: busyAgents } = await supabase
    .from('agents')
    .select('*')
    .eq('status', 'BUSY');

  for (const agent of busyAgents || []) {
    const { data: agentTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('assignee_agent_id', agent.id)
      .in('status', ['IN_PROGRESS', 'PENDING']);
    
    if (!agentTasks || agentTasks.length === 0) {
      anomalies.push({
        type: 'agent_stuck',
        description: `Agent ${agent.name} is BUSY but has no active tasks`,
        details: `Agent may be stuck in invalid state`,
        severity: 'medium',
        agent_id: agent.id
      });
    }
  }

  return anomalies;
}
