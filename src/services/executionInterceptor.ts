/**
 * Execution Interceptor Service
 * 
 * Routes Eliza's execution intents to the appropriate edge functions
 * and manages the background execution flow.
 * 
 * Flow:
 * 1. Detect execution intent in Eliza's response
 * 2. Extract function name, code, and parameters
 * 3. Route to appropriate edge function (python-executor, github-integration, etc.)
 * 4. Track execution via Realtime subscription
 * 5. Stream results back to chat UI
 */

import { supabase } from '@/integrations/supabase/client';

export interface ExecutionIntent {
  type: 'python_code' | 'github_operation' | 'agent_spawn' | 'task_create' | 'function_call';
  function_name?: string;
  code?: string;
  parameters?: Record<string, any>;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface ExecutionResult {
  shouldExecute: boolean;
  executionId?: string;
  streamChannel?: string;
  intent?: ExecutionIntent;
  displayMessage?: string;
}

class ExecutionInterceptorService {
  /**
   * Detect if Eliza's response contains an execution intent
   */
  detectIntent(elizaResponse: string): ExecutionIntent | null {
    // Pattern 1: Python code blocks
    const pythonCodeMatch = elizaResponse.match(/```python\n([\s\S]*?)```/);
    if (pythonCodeMatch) {
      return {
        type: 'python_code',
        code: pythonCodeMatch[1].trim(),
        description: this.extractDescription(elizaResponse, pythonCodeMatch.index!),
      };
    }

    // Pattern 2: Explicit function calls (e.g., "EXECUTE: github-integration()")
    const functionCallMatch = elizaResponse.match(/EXECUTE:\s*([a-z-]+)\((.*?)\)/);
    if (functionCallMatch) {
      const functionName = functionCallMatch[1];
      const paramsStr = functionCallMatch[2];
      
      try {
        const parameters = paramsStr ? JSON.parse(`{${paramsStr}}`) : {};
        return {
          type: 'function_call',
          function_name: functionName,
          parameters,
          description: this.extractDescription(elizaResponse, functionCallMatch.index!),
        };
      } catch (e) {
        console.warn('Failed to parse function parameters:', e);
      }
    }

    // Pattern 3: GitHub operations
    const githubMatch = elizaResponse.match(/\b(create\s+issue|create\s+PR|commit|fork\s+repo)\b/i);
    if (githubMatch) {
      return {
        type: 'github_operation',
        description: elizaResponse,
      };
    }

    // Pattern 4: Agent spawning
    const agentMatch = elizaResponse.match(/\b(spawn\s+agent|create\s+agent|new\s+agent)\b/i);
    if (agentMatch) {
      return {
        type: 'agent_spawn',
        description: elizaResponse,
      };
    }

    // Pattern 5: Task creation
    const taskMatch = elizaResponse.match(/\b(create\s+task|assign\s+task|new\s+task)\b/i);
    if (taskMatch) {
      return {
        type: 'task_create',
        description: elizaResponse,
      };
    }

    return null;
  }

  /**
   * Extract description from context around the match
   */
  private extractDescription(text: string, matchIndex: number): string {
    // Get 200 chars before and after the match
    const start = Math.max(0, matchIndex - 200);
    const end = Math.min(text.length, matchIndex + 200);
    return text.substring(start, end).trim();
  }

  /**
   * Execute the detected intent
   */
  async executeIntent(intent: ExecutionIntent): Promise<ExecutionResult> {
    console.log('🎯 [ExecutionInterceptor] Executing intent:', intent.type);

    try {
      switch (intent.type) {
        case 'python_code':
          return await this.executePythonCode(intent);
        
        case 'function_call':
          return await this.executeFunction(intent);
        
        case 'github_operation':
          return await this.executeGitHubOperation(intent);
        
        case 'agent_spawn':
          return await this.executeAgentSpawn(intent);
        
        case 'task_create':
          return await this.executeTaskCreate(intent);
        
        default:
          return {
            shouldExecute: false,
            displayMessage: 'Unknown execution type',
          };
      }
    } catch (error) {
      console.error('❌ [ExecutionInterceptor] Execution failed:', error);
      return {
        shouldExecute: false,
        displayMessage: `Execution failed: ${error.message}`,
      };
    }
  }

  /**
   * Execute Python code via python-executor
   */
  private async executePythonCode(intent: ExecutionIntent): Promise<ExecutionResult> {
    if (!intent.code) {
      return {
        shouldExecute: false,
        displayMessage: 'No code provided',
      };
    }

    console.log('🐍 [ExecutionInterceptor] Executing Python code...');

    // Call python-executor edge function
    const { data, error } = await supabase.functions.invoke('python-executor', {
      body: {
        code: intent.code,
        purpose: intent.description || 'User-requested execution',
        source: 'unified-chat',
      },
    });

    if (error) {
      throw new Error(`Python execution failed: ${error.message}`);
    }

    // Create execution tracking ID
    const executionId = `exec-${Date.now()}`;

    // Log to activity log for Realtime streaming
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'python_execution_started',
      title: '🐍 Executing Python Code',
      description: intent.description || 'Running user-requested code',
      metadata: {
        execution_id: executionId,
        code_length: intent.code.length,
        source: 'unified-chat',
      },
      status: 'in_progress',
    });

    return {
      shouldExecute: true,
      executionId,
      streamChannel: 'eliza_python_executions',
      intent,
      displayMessage: '🐍 **Executing Python code in background...**\n\nWatch the **Background Work** panel for real-time execution results.',
    };
  }

  /**
   * Execute arbitrary edge function
   */
  private async executeFunction(intent: ExecutionIntent): Promise<ExecutionResult> {
    if (!intent.function_name) {
      return {
        shouldExecute: false,
        displayMessage: 'No function name provided',
      };
    }

    console.log(`📞 [ExecutionInterceptor] Calling function: ${intent.function_name}`);

    const { data, error } = await supabase.functions.invoke(intent.function_name, {
      body: intent.parameters || {},
    });

    if (error) {
      throw new Error(`Function call failed: ${error.message}`);
    }

    const executionId = `func-${Date.now()}`;

    await supabase.from('eliza_activity_log').insert({
      activity_type: 'function_call',
      title: `📞 Called: ${intent.function_name}`,
      description: intent.description || `Executed ${intent.function_name}`,
      metadata: {
        execution_id: executionId,
        function_name: intent.function_name,
        parameters: intent.parameters,
        result: data,
      },
      status: 'completed',
    });

    return {
      shouldExecute: true,
      executionId,
      streamChannel: 'eliza_activity_log',
      intent,
      displayMessage: `📞 **Function executed:** ${intent.function_name}\n\nResult: ${JSON.stringify(data, null, 2)}`,
    };
  }

  /**
   * Execute GitHub operation
   */
  private async executeGitHubOperation(intent: ExecutionIntent): Promise<ExecutionResult> {
    console.log('🐙 [ExecutionInterceptor] Executing GitHub operation...');

    // Parse the GitHub operation from description
    const operation = this.parseGitHubOperation(intent.description!);

    const { data, error } = await supabase.functions.invoke('github-integration', {
      body: {
        ...operation,
        executive: 'eliza', // Default to Eliza for intercepted operations
      },
    });

    if (error) {
      throw new Error(`GitHub operation failed: ${error.message}`);
    }

    const executionId = `github-${Date.now()}`;

    await supabase.from('eliza_activity_log').insert({
      activity_type: 'github_operation',
      title: `🐙 GitHub: ${operation.action}`,
      description: intent.description!,
      metadata: {
        execution_id: executionId,
        operation,
        result: data,
      },
      status: 'completed',
    });

    return {
      shouldExecute: true,
      executionId,
      streamChannel: 'eliza_activity_log',
      intent,
      displayMessage: `🐙 **GitHub operation completed:** ${operation.action}\n\nResult: ${JSON.stringify(data, null, 2)}`,
    };
  }

  /**
   * Parse GitHub operation from natural language
   */
  private parseGitHubOperation(description: string): Record<string, any> {
    // Simple parsing - in production, use LLM for complex parsing
    if (/create\s+issue/i.test(description)) {
      return {
        action: 'create_issue',
        repo: 'XMRT-Ecosystem', // Default repo
        // Extract title and body from description
      };
    }

    if (/create\s+PR/i.test(description)) {
      return {
        action: 'create_pull_request',
        repo: 'XMRT-Ecosystem',
      };
    }

    if (/commit/i.test(description)) {
      return {
        action: 'commit',
        repo: 'XMRT-Ecosystem',
      };
    }

    return {
      action: 'unknown',
      description,
    };
  }

  /**
   * Execute agent spawn
   */
  private async executeAgentSpawn(intent: ExecutionIntent): Promise<ExecutionResult> {
    console.log('🤖 [ExecutionInterceptor] Spawning agent...');

    // Parse agent details from description
    const agentData = this.parseAgentData(intent.description!);

    const { data, error } = await supabase.functions.invoke('agent-manager', {
      body: {
        action: 'spawn_agent',
        data: agentData,
      },
    });

    if (error) {
      throw new Error(`Agent spawn failed: ${error.message}`);
    }

    const executionId = `agent-${Date.now()}`;

    return {
      shouldExecute: true,
      executionId,
      streamChannel: 'agents',
      intent,
      displayMessage: `🤖 **Agent spawned:** ${agentData.name}\n\nRole: ${agentData.role}\nSkills: ${agentData.skills.join(', ')}`,
    };
  }

  /**
   * Parse agent data from natural language
   */
  private parseAgentData(description: string): Record<string, any> {
    // Simple parsing - in production, use LLM
    return {
      name: `Agent-${Date.now()}`,
      role: 'Integrator',
      skills: ['github', 'code_review'],
    };
  }

  /**
   * Execute task creation
   */
  private async executeTaskCreate(intent: ExecutionIntent): Promise<ExecutionResult> {
    console.log('📋 [ExecutionInterceptor] Creating task...');

    const taskData = this.parseTaskData(intent.description!);

    const { data, error } = await supabase.functions.invoke('agent-manager', {
      body: {
        action: 'assign_task',
        data: taskData,
      },
    });

    if (error) {
      throw new Error(`Task creation failed: ${error.message}`);
    }

    const executionId = `task-${Date.now()}`;

    return {
      shouldExecute: true,
      executionId,
      streamChannel: 'tasks',
      intent,
      displayMessage: `📋 **Task created:** ${taskData.title}\n\nAssigned to: ${taskData.assignee_agent_id}\nPriority: ${taskData.priority}`,
    };
  }

  /**
   * Parse task data from natural language
   */
  private parseTaskData(description: string): Record<string, any> {
    return {
      title: 'New Task',
      description,
      repo: 'XMRT-Ecosystem',
      category: 'improvement',
      priority: 5,
      assignee_agent_id: 'agent-integrator',
    };
  }

  /**
   * Main interception method
   */
  async interceptAndExecute(elizaResponse: string): Promise<ExecutionResult> {
    // Detect intent
    const intent = this.detectIntent(elizaResponse);

    if (!intent) {
      return {
        shouldExecute: false,
        displayMessage: elizaResponse, // Normal chat message
      };
    }

    // Execute intent
    return await this.executeIntent(intent);
  }
}

export const executionInterceptor = new ExecutionInterceptorService();
