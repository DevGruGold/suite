import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { callAIWithFallback } from '../_shared/unifiedAIFallback.ts';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'multi-step-orchestrator';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Step {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
}

interface WorkflowExecution {
  id: string;
  name: string;
  description: string;
  steps: Step[];
  status: 'running' | 'completed' | 'failed';
  currentStepIndex: number;
  startTime: string;
  endTime?: string;
  finalResult?: any;
  failedStep?: string;
}

// Helper function to map workflow progress to pipeline stages
function getStageForProgress(stepIndex: number, totalSteps: number): string {
  const progress = (stepIndex + 1) / totalSteps;
  if (progress <= 0.2) return 'DISCUSS';
  if (progress <= 0.4) return 'PLAN';
  if (progress <= 0.7) return 'EXECUTE';
  if (progress <= 0.9) return 'VERIFY';
  return 'INTEGRATE';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { workflow, userInput, context = {} } = await req.json();
    
    console.log('🎬 Multi-Step Orchestrator: Starting workflow:', workflow);
    
    // Initialize workflow execution
    const execution: WorkflowExecution = {
      id: `workflow-${Date.now()}`,
      name: workflow.name || 'Multi-Step Task',
      description: workflow.description || 'Executing background workflow',
      steps: workflow.steps.map((step: any, index: number) => ({
        id: `step-${index}`,
        name: step.name,
        description: step.description,
        status: 'pending' as const
      })),
      status: 'running',
      currentStepIndex: 0,
      startTime: new Date().toISOString()
    };
    
    // Create database record for workflow execution
    const { data: dbExecution, error: dbError } = await supabase
      .from('workflow_executions')
      .insert({
        workflow_id: execution.id,
        name: execution.name,
        description: execution.description,
        status: 'running',
        current_step_index: 0,
        total_steps: execution.steps.length,
        start_time: execution.startTime,
        metadata: {
          workflow_type: workflow.workflow_type || 'custom',
          user_context: context
        }
      })
      .select()
      .single();
    
    if (dbError) {
      console.error('Failed to create workflow execution record:', dbError);
      throw dbError;
    }
    
    // Create database records for all steps
    const stepRecords = execution.steps.map((step, index) => ({
      workflow_execution_id: dbExecution.id,
      step_id: step.id,
      step_index: index,
      name: step.name,
      description: step.description,
      step_type: workflow.steps[index].type,
      status: 'pending'
    }));
    
    const { error: stepsError } = await supabase
      .from('workflow_steps')
      .insert(stepRecords);
    
    if (stepsError) {
      console.error('Failed to create workflow steps records:', stepsError);
    }
    
    // ========== CREATE REAL TASK IN PIPELINE ==========
    // Estimate task duration based on step count (rough: 1 min per step)
    const estimatedMinutes = execution.steps.length * 1;
    
    // Only assign an agent for longer tasks (>= 5 minutes)
    let assignedAgentId: string | null = null;
    let assignedAgentName: string | null = null;
    let idleAgent: any = null;
    
    if (estimatedMinutes >= 5) {
      const { data: foundAgent } = await supabase
        .from('agents')
        .select('id, name, current_workload')
        .eq('status', 'IDLE')
        .limit(1)
        .single();
      
      if (foundAgent) {
        idleAgent = foundAgent;
        assignedAgentId = foundAgent.id;
        assignedAgentName = foundAgent.name;
        console.log(`📋 Long task (${estimatedMinutes} min) - assigned to agent: ${foundAgent.name}`);
      }
    } else {
      console.log(`⚡ Quick task (${estimatedMinutes} min) - executing directly without agent assignment`);
    }
    
    // Create the visual pipeline task with checklist from step names
    const pipelineTaskId = `task-${execution.id}`;
    const stepNames = execution.steps.map(s => s.name);
    
    const { data: pipelineTask, error: taskError } = await supabase
      .from('tasks')
      .insert({
        id: pipelineTaskId,
        title: execution.name,
        description: execution.description || `Executing ${execution.steps.length} workflow steps`,
        repo: 'xmrt-suite',
        category: 'infrastructure',
        stage: 'DISCUSS',
        status: 'IN_PROGRESS',
        priority: 7,
        progress_percentage: 0,
        stage_started_at: new Date().toISOString(),
        assignee_agent_id: assignedAgentId,
        completed_checklist_items: [], // Initialize empty, will be populated as steps complete
        metadata: { 
          workflow_id: execution.id, 
          total_steps: execution.steps.length,
          step_names: stepNames,
          checklist: stepNames // Store checklist in metadata for STAE compatibility
        }
      })
      .select()
      .single();
    
    if (taskError) {
      console.error('Failed to create pipeline task:', taskError);
    } else {
      console.log(`✅ Created pipeline task: ${pipelineTaskId}`);
      
      // Mark agent as BUSY and increment workload
      if (assignedAgentId) {
        await supabase
          .from('agents')
          .update({ 
            status: 'BUSY',
            current_workload: idleAgent?.current_workload ? idleAgent.current_workload + 1 : 1
          })
          .eq('id', assignedAgentId);
      }
    }
    
    // Log workflow start with task_id linkage
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'multi_step_workflow',
      title: `🎬 Started: ${execution.name}`,
      description: `Executing ${execution.steps.length} steps${assignedAgentName ? ` (Agent: ${assignedAgentName})` : ''}`,
      task_id: pipelineTaskId,
      agent_id: assignedAgentId,
      metadata: {
        workflow_id: execution.id,
        total_steps: execution.steps.length,
        steps: execution.steps.map(s => s.name),
        assigned_agent: assignedAgentName
      },
      status: 'running'
    });
    
    // Execute steps sequentially with background processing
    const executeWorkflow = async () => {
      let currentStage = 'DISCUSS';
      
      for (let i = 0; i < execution.steps.length; i++) {
        const step = execution.steps[i];
        execution.currentStepIndex = i;
        step.status = 'running';
        step.startTime = new Date().toISOString();
        
        // Calculate progress and new stage
        const progressPercent = Math.round(((i + 0.5) / execution.steps.length) * 100);
        const newStage = getStageForProgress(i, execution.steps.length);
        const stageChanged = newStage !== currentStage;
        
        // Update database: workflow execution and step status
        await supabase
          .from('workflow_executions')
          .update({ current_step_index: i })
          .eq('workflow_id', execution.id);
        
        await supabase
          .from('workflow_steps')
          .update({ 
            status: 'running',
            start_time: step.startTime
          })
          .eq('workflow_execution_id', dbExecution.id)
          .eq('step_index', i);
        
        // ========== UPDATE PIPELINE TASK IN REAL-TIME ==========
        const taskUpdate: any = {
          progress_percentage: progressPercent,
          stage: newStage,
          updated_at: new Date().toISOString()
        };
        if (stageChanged) {
          taskUpdate.stage_started_at = new Date().toISOString();
          currentStage = newStage;
          console.log(`📊 Task moved to stage: ${newStage} (${progressPercent}%)`);
        }
        
        await supabase
          .from('tasks')
          .update(taskUpdate)
          .eq('id', pipelineTaskId);
        
        console.log(`🔄 Executing step ${i + 1}/${execution.steps.length}: ${step.name}`);
        
        try {
          // Execute the step based on its type
          const stepDefinition = workflow.steps[i];
          let result;
          
          switch (stepDefinition.type) {
            case 'ai_analysis':
              result = await executeAIAnalysis(stepDefinition, lovableApiKey, userInput, context);
              break;
            
            case 'data_fetch':
              result = await executeDataFetch(stepDefinition, supabase);
              break;
            
            case 'api_call':
              result = await executeAPICall(stepDefinition, supabaseUrl, supabaseServiceKey);
              // Check if API call failed but don't throw - log and continue
              if (!result.success) {
                console.warn(`⚠️ API call had issues but continuing: ${result.error}`);
              }
              break;
            
            case 'decision':
              result = await executeDecision(stepDefinition, lovableApiKey, context);
              break;
            
            case 'code_execution':
              result = await executeCode(stepDefinition, supabaseUrl, supabaseServiceKey);
              break;
            
            default:
              result = { status: 'skipped', reason: 'Unknown step type', type: stepDefinition.type };
          }
          
          step.status = 'completed';
          step.result = result;
          step.endTime = new Date().toISOString();
          step.duration = new Date(step.endTime).getTime() - new Date(step.startTime).getTime();
          
          console.log(`✅ Step ${i + 1} completed in ${step.duration}ms`);
          
          // Update database: mark step as completed
          await supabase
            .from('workflow_steps')
            .update({
              status: 'completed',
              result,
              end_time: step.endTime,
              duration_ms: step.duration
            })
            .eq('workflow_execution_id', dbExecution.id)
            .eq('step_index', i);
          
          // Update pipeline task progress after step completion
          const completedProgressPercent = Math.round(((i + 1) / execution.steps.length) * 100);
          const completedStage = getStageForProgress(i, execution.steps.length);
          
          // ========== UPDATE COMPLETED CHECKLIST ITEMS ==========
          // Get current task to retrieve existing completed items
          const { data: currentTask } = await supabase
            .from('tasks')
            .select('completed_checklist_items, metadata')
            .eq('id', pipelineTaskId)
            .single();
          
          const existingCompleted = currentTask?.completed_checklist_items || [];
          const checklist = currentTask?.metadata?.checklist || currentTask?.metadata?.step_names || [];
          
          // Add the completed step name to checklist items
          const stepName = step.name;
          const updatedCompleted = existingCompleted.includes(stepName) 
            ? existingCompleted 
            : [...existingCompleted, stepName];
          
          await supabase
            .from('tasks')
            .update({
              progress_percentage: completedProgressPercent,
              stage: completedStage,
              completed_checklist_items: updatedCompleted,
              updated_at: new Date().toISOString()
            })
            .eq('id', pipelineTaskId);
          
          // Log step completion with task_id linkage
          await supabase.from('eliza_activity_log').insert({
            activity_type: 'workflow_step_completed',
            title: `✅ Step ${i + 1}/${execution.steps.length}: ${step.name}`,
            description: `Completed in ${step.duration}ms (${completedProgressPercent}% → ${completedStage})`,
            task_id: pipelineTaskId,
            agent_id: assignedAgentId,
            metadata: {
              workflow_id: execution.id,
              step_id: step.id,
              step_index: i,
              duration_ms: step.duration,
              current_stage: completedStage,
              progress_percent: completedProgressPercent,
              result_summary: result.success !== undefined ? (result.success ? 'Success' : 'Partial Success') : 'Completed',
              result_preview: JSON.stringify(result).substring(0, 200)
            },
            status: 'completed'
          });
          
        } catch (stepError) {
          console.error(`❌ Step ${i + 1} failed:`, stepError);
          
          step.status = 'failed';
          step.error = stepError.message;
          step.endTime = new Date().toISOString();
          step.duration = new Date(step.endTime).getTime() - new Date(step.startTime!).getTime();
          
          execution.status = 'failed';
          execution.failedStep = step.name;
          execution.endTime = new Date().toISOString();
          
          // Update database: mark step and workflow as failed
          await supabase
            .from('workflow_steps')
            .update({
              status: 'failed',
              error: stepError.message,
              end_time: step.endTime,
              duration_ms: step.duration
            })
            .eq('workflow_execution_id', dbExecution.id)
            .eq('step_index', i);
          
          await supabase
            .from('workflow_executions')
            .update({
              status: 'failed',
              failed_step: step.name,
              end_time: execution.endTime
            })
            .eq('workflow_id', execution.id);
          
          // ========== MARK PIPELINE TASK AS BLOCKED ==========
          await supabase
            .from('tasks')
            .update({
              status: 'BLOCKED',
              blocking_reason: `Step ${i + 1} failed: ${stepError.message}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', pipelineTaskId);
          
          // Release agent back to IDLE on failure
          if (assignedAgentId) {
            await supabase
              .from('agents')
              .update({ 
                status: 'IDLE',
                current_workload: Math.max(0, (idleAgent?.current_workload || 1) - 1)
              })
              .eq('id', assignedAgentId);
          }
          
          // Log step failure with task_id linkage
          await supabase.from('eliza_activity_log').insert({
            activity_type: 'workflow_step_failed',
            title: `❌ Failed at Step ${i + 1}/${execution.steps.length}: ${step.name}`,
            description: `Error: ${stepError.message}`,
            task_id: pipelineTaskId,
            agent_id: assignedAgentId,
            metadata: {
              workflow_id: execution.id,
              step_id: step.id,
              step_index: i,
              error: stepError.message,
              duration_ms: step.duration
            },
            status: 'failed'
          });
          
          break; // Stop workflow on failure
        }
      }
      
      // Workflow completed successfully if we got through all steps
      if (execution.status === 'running') {
        execution.status = 'completed';
        execution.endTime = new Date().toISOString();
        
        // Compile final result
        execution.finalResult = {
          success: true,
          steps_completed: execution.steps.filter(s => s.status === 'completed').length,
          total_duration: new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime(),
          results: execution.steps.map(s => ({
            step: s.name,
            result: s.result
          }))
        };
        
        console.log('🎉 Workflow completed successfully!');
        
        // Update database: mark workflow as completed
        await supabase
          .from('workflow_executions')
          .update({
            status: 'completed',
            end_time: execution.endTime,
            final_result: execution.finalResult
          })
          .eq('workflow_id', execution.id);
        
        // ========== MARK PIPELINE TASK AS COMPLETED ==========
        await supabase
          .from('tasks')
          .update({
            status: 'COMPLETED',
            stage: 'INTEGRATE',
            progress_percentage: 100,
            resolution_notes: `Workflow completed: ${execution.steps.length} steps executed successfully in ${execution.finalResult.total_duration}ms`,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', pipelineTaskId);
        
        // Release agent back to IDLE
        if (assignedAgentId) {
          await supabase
            .from('agents')
            .update({ 
              status: 'IDLE',
              current_workload: Math.max(0, (idleAgent?.current_workload || 1) - 1)
            })
            .eq('id', assignedAgentId);
          console.log(`✅ Released agent ${assignedAgentName} back to IDLE`);
        }
        
        // Log workflow completion with task_id linkage
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'multi_step_workflow',
          title: `🎉 Completed: ${execution.name}`,
          description: `All ${execution.steps.length} steps completed successfully`,
          task_id: pipelineTaskId,
          agent_id: assignedAgentId,
          metadata: {
            workflow_id: execution.id,
            total_steps: execution.steps.length,
            total_duration_ms: execution.finalResult.total_duration,
            final_result: execution.finalResult
          },
          status: 'completed'
        });
      }
      
      // Store execution record
      await supabase.from('webhook_logs').insert({
        webhook_name: 'multi_step_workflow',
        trigger_table: 'eliza_activity_log',
        trigger_operation: 'EXECUTE',
        payload: {
          execution_id: execution.id,
          workflow_name: execution.name,
          status: execution.status
        },
        response: execution.finalResult || {
          failed_at_step: execution.failedStep,
          error: execution.steps.find(s => s.status === 'failed')?.error
        },
        status: execution.status === 'completed' ? 'completed' : 'failed'
      });
    };
    
    // Run workflow in background using waitUntil
    EdgeRuntime.waitUntil(executeWorkflow());
    
    // Return immediately with workflow ID and tracking info
    return new Response(JSON.stringify({
      success: true,
      message: `Started background workflow: ${execution.name}`,
      workflow_id: execution.id,
      total_steps: execution.steps.length,
      estimated_duration: `${workflow.steps.length * 2}-${workflow.steps.length * 5} seconds`,
      tracking: {
        monitor_via: 'Task Pipeline Visualizer',
        activity_log_table: 'eliza_activity_log',
        workflow_id: execution.id
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Multi-Step Orchestrator error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Step execution functions
async function executeAIAnalysis(step: any, apiKey: string, userInput: string, context: any) {
  try {
    const result = await callAIWithFallback(
      [
        { role: 'system', content: step.system_prompt || 'You are a helpful AI assistant analyzing data.' },
        { role: 'user', content: step.prompt || userInput }
      ],
      {
        temperature: step.temperature || 0.7,
        maxTokens: step.max_tokens || 1000
      }
    );
    
    const content = typeof result === 'string' ? result : (result.content || result.message || JSON.stringify(result));
    const provider = typeof result === 'object' && result.provider ? result.provider : 'unified_cascade';
    
    console.log(`✅ AI Analysis completed via: ${provider}`);
    
    return {
      analysis: content,
      model: provider
    };
  } catch (error) {
    console.error('❌ AI analysis failed after all providers:', error);
    throw new Error(`AI analysis failed after all providers: ${error.message}`);
  }
}

async function executeDataFetch(step: any, supabase: any) {
  const { data, error } = await supabase
    .from(step.table)
    .select(step.select || '*')
    .limit(step.limit || 100);
  
  if (error) throw error;
  
  return {
    data,
    count: data?.length || 0,
    table: step.table
  };
}

async function executeAPICall(step: any, supabaseUrl: string, serviceKey: string) {
  // Direct edge function calls for internal functions, fetch for external URLs
  if (step.function) {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, serviceKey);
    
    const result = await supabase.functions.invoke(step.function, {
      body: step.body
    });
    
    return !result.error ? {
      success: true,
      status: 200,
      data: result.data,
      function: step.function
    } : {
      success: false,
      status: result.error.status || 500,
      error: result.error.message || result.error,
      attempted_function: step.function
    };
  }
  
  // For external URLs, use direct fetch
  const url = step.url;
  if (!url) {
    throw new Error('No URL or function name provided for API call');
  }
  
  try {
    const response = await fetch(url, {
      method: step.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...step.headers
      },
      body: step.body ? JSON.stringify(step.body) : undefined
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        status: response.status,
        error: `HTTP ${response.status}: ${errorText || response.statusText}`,
        url
      };
    }
    
    const result = await response.json();
    return {
      success: true,
      status: response.status,
      data: result,
      url
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      url
    };
  }
}

async function executeDecision(step: any, apiKey: string, context: any) {
  try {
    const result = await callAIWithFallback(
      [
        { 
          role: 'system', 
          content: 'You are a decision engine. Analyze the context and make a strategic decision. Respond with JSON: {"decision": "...", "reasoning": "...", "confidence": 0-1}' 
        },
        { 
          role: 'user', 
          content: `Context: ${JSON.stringify(context)}\n\nDecision needed: ${step.decision_prompt}` 
        }
      ],
      { temperature: 0.3, maxTokens: 1000 }
    );
    
    const content = typeof result === 'string' ? result : (result.content || result.message || '');
    const provider = typeof result === 'object' && result.provider ? result.provider : 'unified_cascade';
    
    console.log(`✅ Decision completed via: ${provider}`);
    
    // Try to parse JSON from response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.warn('Could not parse decision as JSON, returning raw');
    }
    
    return {
      decision: content,
      reasoning: 'Raw AI response',
      confidence: 0.7,
      provider
    };
  } catch (error) {
    console.error('❌ Decision making failed after all providers:', error);
    throw new Error(`Decision making failed after all providers: ${error.message}`);
  }
  
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function executeCode(step: any, supabaseUrl: string, serviceKey: string) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, serviceKey);
  
  const result = await supabase.functions.invoke('python-executor', {
    body: {
      code: step.code,
      purpose: step.purpose || 'Workflow step execution',
      source: 'multi-step-orchestrator'
    }
  });
  
  return !result.error ? result.data : {
    error: result.error.message || result.error,
    exitCode: 1
  };
}
