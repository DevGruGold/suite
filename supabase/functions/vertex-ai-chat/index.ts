import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateElizaSystemPrompt } from "../_shared/elizaSystemPrompt.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";
import { getAICredential, createCredentialRequiredResponse } from "../_shared/credentialCascade.ts";
import { callLovableAIGateway } from "../_shared/unifiedAIFallback.ts";
import { buildContextualPrompt } from "../_shared/contextBuilder.ts";
import { executeToolCall as sharedExecuteToolCall } from "../_shared/toolExecutor.ts";
import { startUsageTracking, logUsageMetrics } from "../_shared/edgeFunctionUsageLogger.ts";
import { needsDataRetrieval } from "../_shared/executiveHelpers.ts";

const FUNCTION_NAME = 'vertex-ai-chat';
const EXECUTIVE_NAME = 'Eliza';
const MODEL_TYPE = 'vertex';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Performance monitoring interface
interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  toolCalls: number;
  errors: number;
  modelType: string;
  functionName: string;
}

// Enhanced tool call parsers for different AI model formats
function parseDeepSeekToolCalls(content: string): Array<any> | null {
  const toolCallsMatch = content.match(/<｜tool▁calls▁begin｜>(.*?)<｜tool▁calls▁end｜>/s);
  if (!toolCallsMatch) return null;
  
  const toolCallsText = toolCallsMatch[1];
  const toolCallPattern = /<｜tool▁call▁begin｜>(.*?)<｜tool▁sep｜>(.*?)<｜tool▁call▁end｜>/gs;
  const toolCalls: Array<any> = [];
  
  let match;
  while ((match = toolCallPattern.exec(toolCallsText)) !== null) {
    const functionName = match[1].trim();
    let args = match[2].trim();
    
    let parsedArgs = {};
    if (args && args !== '{}') {
      try {
        parsedArgs = JSON.parse(args);
      } catch (e) {
        console.warn(`Failed to parse DeepSeek tool args for ${functionName}:`, args);
      }
    }
    
    toolCalls.push({
      id: `deepseek_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: 'function',
      function: {
        name: functionName,
        arguments: JSON.stringify(parsedArgs)
      }
    });
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

function parseGeminiToolCalls(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  
  // Pattern for ```tool_code blocks
  const toolCodeRegex = /```tool_code\s*([\s\S]*?)```/g;
  let match;
  
  while ((match = toolCodeRegex.exec(content)) !== null) {
    const codeBlock = match[1].trim();
    
    try {
      const functionCallMatch = codeBlock.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/);
      if (functionCallMatch) {
        const functionName = functionCallMatch[1];
        let argsString = functionCallMatch[2].trim();
        
        let parsedArgs = {};
        if (argsString) {
          try {
            // Handle both JSON and simple parameter formats
            if (argsString.startsWith('{')) {
              parsedArgs = JSON.parse(argsString);
            } else {
              // Simple parameter parsing for non-JSON formats
              parsedArgs = { query: argsString.replace(/['"]/g, '') };
            }
          } catch {
            console.warn(`Failed to parse Gemini tool args for ${functionName}:`, argsString);
          }
        }
        
        toolCalls.push({
          id: `gemini_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: {
            name: functionName,
            arguments: JSON.stringify(parsedArgs)
          }
        });
      }
    } catch (e) {
      console.warn('Error parsing Gemini tool_code block:', e);
    }
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

function parseKimiToolCalls(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  
  // Pattern for Kimi's JSON tool format
  const kimiToolRegex = /```json\s*{\s*"tool_call":\s*{[^}]*"name":\s*"([^"]+)"[^}]*"parameters":\s*([^}]*{})\s*}\s*}/g;
  let match;
  
  while ((match = kimiToolRegex.exec(content)) !== null) {
    const functionName = match[1];
    let parametersString = match[2];
    
    try {
      const parameters = JSON.parse(parametersString);
      
      toolCalls.push({
        id: `kimi_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        type: 'function',
        function: {
          name: functionName,
          arguments: JSON.stringify(parameters)
        }
      });
    } catch (e) {
      console.warn(`Failed to parse Kimi tool parameters for ${functionName}:`, parametersString);
    }
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

// Enhanced executeToolCall with retry logic and performance monitoring
async function executeToolCall(
  toolCall: any, 
  supabase: any, 
  sessionInfo: any,
  metrics: PerformanceMetrics,
  maxRetries: number = 3
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Executing tool call (attempt ${attempt}/${maxRetries}):`, JSON.stringify(toolCall, null, 2));
      
      const result = await sharedExecuteToolCall(toolCall, supabase, sessionInfo);
      
      if (result.success) {
        metrics.toolCalls++;
        return {
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(result.data)
        };
      } else {
        if (attempt === maxRetries) {
          throw new Error(result.error || 'Tool execution failed after all retries');
        }
        
        console.warn(`Tool execution attempt ${attempt} failed:`, result.error);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      }
    } catch (error) {
      metrics.errors++;
      
      if (attempt === maxRetries) {
        console.error(`Tool execution failed after ${maxRetries} attempts:`, error);
        return {
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify({
            error: error.message,
            message: `Tool execution failed after ${maxRetries} attempts. Please try again or use a different approach.`,
            attempt_number: attempt,
            max_retries: maxRetries
          })
        };
      }
      
      console.warn(`Tool execution attempt ${attempt} failed with error:`, error.message);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Main serve function with comprehensive error handling and monitoring
serve(async (req) => {
  const metrics: PerformanceMetrics = {
    startTime: Date.now(),
    toolCalls: 0,
    errors: 0,
    modelType: MODEL_TYPE,
    functionName: FUNCTION_NAME
  };
  
  // Start usage tracking
  const trackingId = startUsageTracking(FUNCTION_NAME);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, conversation_id, session_token, context } = await req.json();
    
    if (!message) {
      throw new Error('Message is required');
    }
    
    console.log(`${FUNCTION_NAME} processing request for model: ${MODEL_TYPE}`);
    
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Get AI credentials with proper cascade
    const credential = await getAICredential(supabase, MODEL_TYPE, session_token);
    if (!credential) {
      return createCredentialRequiredResponse(corsHeaders, MODEL_TYPE);
    }

    // Build contextual system prompt
    const systemPrompt = await buildContextualPrompt({
      basePrompt: generateElizaSystemPrompt(),
      conversationId: conversation_id,
      sessionToken: session_token,
      supabase,
      context: context || {}
    });

    // Prepare session info for tool execution
    const sessionInfo = {
      conversation_id,
      session_token,
      executive_name: EXECUTIVE_NAME,
      function_name: FUNCTION_NAME,
      model_type: MODEL_TYPE,
      tracking_id: trackingId
    };

    // Prepare messages array
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ];

    // Add context messages if provided
    if (context && context.previous_messages) {
      messages.splice(1, 0, ...context.previous_messages);
    }

    console.log(`Calling AI Gateway for ${MODEL_TYPE} with ${messages.length} messages`);

    // Call AI Gateway with enhanced tool support
    const aiResponse = await callLovableAIGateway({
      model: MODEL_TYPE,
      messages: messages,
      tools: ELIZA_TOOLS,
      tool_choice: "auto",
      credential: credential,
      session_info: sessionInfo,
      max_tokens: 4000,
      temperature: 0.7
    });

    if (!aiResponse.success) {
      throw new Error(aiResponse.error || 'AI Gateway call failed');
    }

    let responseContent = aiResponse.data.content || '';
    let toolCalls = aiResponse.data.tool_calls || [];

    // Parse tool calls from different model formats if not already present
    if (!toolCalls || toolCalls.length === 0) {
      let parsedToolCalls = null;
      
      console.log(`Attempting to parse tool calls from ${MODEL_TYPE} response format`);
      
      // Try different parsing strategies based on model type
      switch (MODEL_TYPE) {
        case 'deepseek':
          parsedToolCalls = parseDeepSeekToolCalls(responseContent);
          break;
        case 'gemini':
          parsedToolCalls = parseGeminiToolCalls(responseContent);
          break;
        case 'kimi':
          parsedToolCalls = parseKimiToolCalls(responseContent) || parseGeminiToolCalls(responseContent);
          break;
        case 'openai':
        case 'anthropic':
        default:
          // These models typically return native tool calls
          break;
      }
      
      if (parsedToolCalls) {
        console.log(`Parsed ${parsedToolCalls.length} tool calls from ${MODEL_TYPE} response`);
        toolCalls = parsedToolCalls;
      }
    }

    // Execute tool calls if present
    if (toolCalls && toolCalls.length > 0) {
      console.log(`Processing ${toolCalls.length} tool calls`);
      
      const toolMessages = [];
      
      for (const toolCall of toolCalls) {
        const toolResult = await executeToolCall(toolCall, supabase, sessionInfo, metrics);
        toolMessages.push(toolResult);
      }
      
      // Get follow-up response with tool results
      console.log(`Getting follow-up response with ${toolMessages.length} tool results`);
      
      const followUpMessages = [
        ...messages,
        { role: "assistant", content: responseContent, tool_calls: toolCalls },
        ...toolMessages
      ];
      
      const followUpResponse = await callLovableAIGateway({
        model: MODEL_TYPE,
        messages: followUpMessages,
        credential: credential,
        session_info: sessionInfo,
        max_tokens: 4000,
        temperature: 0.7
      });
      
      if (followUpResponse.success) {
        responseContent = followUpResponse.data.content || responseContent;
      } else {
        console.warn('Follow-up response failed, using original response');
      }
    }

    // Complete metrics
    metrics.endTime = Date.now();
    
    // Log usage metrics
    await logUsageMetrics(trackingId, {
      function_name: FUNCTION_NAME,
      model_type: MODEL_TYPE,
      execution_time: metrics.endTime - metrics.startTime,
      tool_calls_executed: metrics.toolCalls,
      errors_encountered: metrics.errors,
      success: true
    });

    const response = {
      content: responseContent,
      executive: EXECUTIVE_NAME,
      function_used: FUNCTION_NAME,
      model_type: MODEL_TYPE,
      tool_calls_processed: toolCalls?.length || 0,
      execution_time_ms: metrics.endTime - metrics.startTime,
      performance_metrics: {
        tool_calls: metrics.toolCalls,
        errors: metrics.errors,
        success_rate: metrics.toolCalls > 0 ? ((metrics.toolCalls - metrics.errors) / metrics.toolCalls * 100).toFixed(2) : 100
      },
      timestamp: new Date().toISOString()
    };

    console.log(`${FUNCTION_NAME} completed successfully in ${metrics.endTime - metrics.startTime}ms`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    metrics.endTime = Date.now();
    metrics.errors++;
    
    console.error(`${FUNCTION_NAME} error:`, error);
    
    // Log error metrics
    await logUsageMetrics(trackingId, {
      function_name: FUNCTION_NAME,
      model_type: MODEL_TYPE,
      execution_time: metrics.endTime - metrics.startTime,
      tool_calls_executed: metrics.toolCalls,
      errors_encountered: metrics.errors,
      success: false,
      error_message: error.message
    }).catch(e => console.error('Failed to log error metrics:', e));
    
    const errorResponse = {
      error: error.message,
      executive: EXECUTIVE_NAME,
      function_used: FUNCTION_NAME,
      model_type: MODEL_TYPE,
      execution_time_ms: metrics.endTime - metrics.startTime,
      error_details: {
        tool_calls_attempted: metrics.toolCalls,
        errors_encountered: metrics.errors,
        error_type: error.constructor.name
      },
      timestamp: new Date().toISOString(),
      retry_suggestion: "Please try again with a simpler request or check your input format"
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});