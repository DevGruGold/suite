/**
 * Fallback Tool Executor
 * Executes tool calls from fallback AI responses and synthesizes results
 */

import { executeToolCall } from './toolExecutor.ts';
import {
  parseToolCodeBlocks,
  parseDeepSeekToolCalls,
  parseConversationalToolIntent,
  synthesizeToolResults
} from './executiveHelpers.ts';

export interface FallbackResult {
  content: string;
  tool_calls?: any[];
  provider: string;
  model: string;
}

export interface ProcessedFallbackResult {
  content: string;
  toolCallsExecuted: number;
  provider: string;
  model: string;
  hasToolCalls: boolean;
}

/**
 * Process fallback AI response with tool execution
 * Parses tool calls from content, executes them, and synthesizes natural language response
 */
export async function processFallbackWithToolExecution(
  fallbackResult: FallbackResult,
  supabase: any,
  executiveName: string,
  SUPABASE_URL: string,
  SERVICE_ROLE_KEY: string,
  userQuery: string
): Promise<ProcessedFallbackResult> {
  let content = fallbackResult.content || '';
  let toolCalls = fallbackResult.tool_calls || [];
  
  // Check for text-embedded tool calls if no native tool calls
  if (toolCalls.length === 0 && content) {
    const textToolCalls = 
      parseToolCodeBlocks(content) || 
      parseDeepSeekToolCalls(content) ||
      parseConversationalToolIntent(content);
    
    if (textToolCalls && textToolCalls.length > 0) {
      console.log(`🔧 [${executiveName}] Detected ${textToolCalls.length} text-embedded tool call(s)`);
      toolCalls = textToolCalls;
    }
  }
  
  // Execute tool calls if found
  if (toolCalls.length > 0) {
    console.log(`🔧 [${executiveName}] Executing ${toolCalls.length} tool(s) from ${fallbackResult.provider} fallback`);
    
    const toolResults: Array<{ tool: string; result: any }> = [];
    
    for (const toolCall of toolCalls) {
      try {
        const result = await executeToolCall(supabase, toolCall, executiveName, SUPABASE_URL, SERVICE_ROLE_KEY);
        toolResults.push({
          tool: toolCall.function?.name || 'unknown',
          result
        });
      } catch (err) {
        console.error(`⚠️ Tool execution failed for ${toolCall.function?.name}:`, err);
        toolResults.push({
          tool: toolCall.function?.name || 'unknown',
          result: { error: err instanceof Error ? err.message : 'Tool execution failed' }
        });
      }
    }
    
    // Synthesize results into natural language
    const synthesized = await synthesizeToolResults(toolResults, userQuery, executiveName);
    
    // Clean tool_code blocks from content
    let cleanContent = content.replace(/```tool_code[\s\S]*?```/g, '').trim();
    cleanContent = cleanContent.replace(/<｜tool▁calls▁begin｜>.*?<｜tool▁calls▁end｜>/s, '').trim();
    
    // Use synthesized content if available, otherwise append tool results summary
    if (synthesized) {
      return {
        content: synthesized,
        toolCallsExecuted: toolResults.length,
        provider: fallbackResult.provider,
        model: fallbackResult.model,
        hasToolCalls: true
      };
    } else {
      // Fallback: append tool results summary
      const toolSummary = toolResults.map(r => 
        `${r.tool}: ${JSON.stringify(r.result).slice(0, 200)}`
      ).join('\n');
      
      return {
        content: cleanContent ? `${cleanContent}\n\n📊 Tool Results:\n${toolSummary}` : `📊 Tool Results:\n${toolSummary}`,
        toolCallsExecuted: toolResults.length,
        provider: fallbackResult.provider,
        model: fallbackResult.model,
        hasToolCalls: true
      };
    }
  }
  
  // No tool calls - return cleaned content
  return {
    content: content.replace(/```tool_code[\s\S]*?```/g, '').trim(),
    toolCallsExecuted: 0,
    provider: fallbackResult.provider,
    model: fallbackResult.model,
    hasToolCalls: false
  };
}

/**
 * Emergency static fallback when all AI providers fail
 * Attempts to execute obvious tool calls and provide helpful response
 */
export async function emergencyStaticFallback(
  userQuery: string,
  supabase: any,
  executiveName: string,
  SUPABASE_URL: string,
  SERVICE_ROLE_KEY: string
): Promise<ProcessedFallbackResult> {
  console.log(`🚨 [${executiveName}] Emergency static fallback activated`);
  
  const queryLower = userQuery.toLowerCase();
  const toolsToExecute: Array<{ name: string; args: any }> = [];
  
  // Detect obvious tool intents
  if (queryLower.includes('mining') || queryLower.includes('hashrate') || queryLower.includes('worker')) {
    toolsToExecute.push({ name: 'get_mining_stats', args: {} });
  }
  if (queryLower.includes('status') || queryLower.includes('health') || queryLower.includes('system')) {
    toolsToExecute.push({ name: 'get_system_status', args: {} });
  }
  if (queryLower.includes('agent') || queryLower.includes('list agent')) {
    toolsToExecute.push({ name: 'list_agents', args: {} });
  }
  if (queryLower.includes('task') || queryLower.includes('list task')) {
    toolsToExecute.push({ name: 'list_tasks', args: {} });
  }
  if (queryLower.includes('ecosystem') || queryLower.includes('metrics') || queryLower.includes('dao')) {
    toolsToExecute.push({ name: 'get_ecosystem_metrics', args: {} });
  }
  
  // Execute detected tools
  const toolResults: Array<{ tool: string; result: any }> = [];
  
  for (const tool of toolsToExecute) {
    try {
      const toolCall = {
        id: `emergency_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        function: { name: tool.name, arguments: JSON.stringify(tool.args) }
      };
      const result = await executeToolCall(supabase, toolCall, executiveName, SUPABASE_URL, SERVICE_ROLE_KEY);
      toolResults.push({ tool: tool.name, result });
    } catch (err) {
      console.error(`⚠️ Emergency tool ${tool.name} failed:`, err);
    }
  }
  
  // Build response
  if (toolResults.length > 0) {
    // Format tool results nicely
    let response = `⚠️ AI services are temporarily limited, but I was able to fetch the data you requested:\n\n`;
    
    for (const { tool, result } of toolResults) {
      if (tool === 'get_mining_stats') {
        const stats = result?.stats || result;
        response += `**Mining Stats:**\n`;
        response += `- Hash Rate: ${stats?.hashRate || stats?.hashrate || 0} H/s\n`;
        response += `- Valid Shares: ${stats?.validShares || 0}\n`;
        response += `- Workers: ${stats?.workerCount || stats?.workers?.length || 0}\n\n`;
      } else if (tool === 'get_system_status') {
        const status = result?.status || result;
        response += `**System Status:**\n`;
        response += `- Health: ${status?.healthScore || status?.health_score || 'N/A'}%\n`;
        response += `- Status: ${status?.overallStatus || 'operational'}\n\n`;
      } else if (tool === 'list_agents') {
        const agents = result?.agents || result || [];
        response += `**Agents:**\n`;
        if (Array.isArray(agents)) {
          agents.slice(0, 5).forEach((a: any) => {
            response += `- ${a.name}: ${a.status}\n`;
          });
          if (agents.length > 5) response += `...and ${agents.length - 5} more\n`;
        }
        response += '\n';
      } else if (tool === 'list_tasks') {
        const tasks = result?.tasks || result || [];
        response += `**Tasks:**\n`;
        if (Array.isArray(tasks)) {
          tasks.slice(0, 5).forEach((t: any) => {
            response += `- ${t.title}: ${t.status} (${t.stage})\n`;
          });
          if (tasks.length > 5) response += `...and ${tasks.length - 5} more\n`;
        }
        response += '\n';
      } else {
        response += `**${tool}:** ${JSON.stringify(result).slice(0, 300)}\n\n`;
      }
    }
    
    response += `\n_Note: Full AI capabilities will resume once credits are topped up._`;
    
    return {
      content: response,
      toolCallsExecuted: toolResults.length,
      provider: 'emergency_static',
      model: 'static_fallback',
      hasToolCalls: true
    };
  }
  
  // No tools matched - provide generic helpful response
  return {
    content: `⚠️ **AI services are temporarily limited**

All AI providers are currently experiencing issues (likely credit exhaustion). 

**What you can do:**
1. Add credits to the Lovable AI Gateway
2. Top up DeepSeek or OpenRouter accounts
3. Try again in a few minutes

**I can still help with basic queries.** If you're looking for:
- Mining stats → Ask "show mining stats"
- System health → Ask "check system status"  
- Agent list → Ask "list agents"
- Task status → Ask "list tasks"

_These queries use direct tool execution without AI synthesis._`,
    toolCallsExecuted: 0,
    provider: 'emergency_static',
    model: 'static_fallback',
    hasToolCalls: false
  };
}
