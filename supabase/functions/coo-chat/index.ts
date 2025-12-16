import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateElizaSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { getAICredential, createCredentialRequiredResponse } from "../_shared/credentialCascade.ts";
import { callLovableAIGateway } from '../_shared/unifiedAIFallback.ts';
import { buildContextualPrompt } from '../_shared/contextBuilder.ts';
import { executeToolCall as sharedExecuteToolCall } from '../_shared/toolExecutor.ts';
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';
import { needsDataRetrieval } from '../_shared/executiveHelpers.ts';

const FUNCTION_NAME = 'coo-chat';
const EXECUTIVE_NAME = 'Eliza';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function parseToolCodeBlocks(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  
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
            parsedArgs = JSON.parse(argsString);
          } catch {
            console.warn(`Failed to parse tool_code args for ${functionName}:`, argsString);
          }
        }
        
        toolCalls.push({
          id: `toolcode_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: {
            name: functionName,
            arguments: JSON.stringify(parsedArgs)
          }
        });
      }
    } catch (e) {
      console.warn('Error parsing tool_code block:', e);
    }
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

function parseKimiToolCalls(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  
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

// Enhanced executeToolCall function with proper error handling
async function executeToolCall(toolCall: any, supabase: any, sessionInfo: any): Promise<any> {
  try {
    console.log(`Executing tool call:`, JSON.stringify(toolCall, null, 2));
    
    // Use the shared tool executor with proper error handling
    const result = await sharedExecuteToolCall(toolCall, supabase, sessionInfo);
    
    if (result.success) {
      return {
        tool_call_id: toolCall.id,
        role: "tool",
        content: JSON.stringify(result.data)
      };
    } else {
      console.error(`Tool execution failed:`, result.error);
      return {
        tool_call_id: toolCall.id,
        role: "tool", 
        content: JSON.stringify({
          error: result.error,
          message: "Tool execution failed. Please try again or use a different approach."
        })
      };
    }
  } catch (error) {
    console.error(`Tool execution error:`, error);
    return {
      tool_call_id: toolCall.id,
      role: "tool",
      content: JSON.stringify({
        error: error.message,
        message: "Unexpected error during tool execution."
      })
    };
  }
}

serve(async (req) => {
  // Start usage tracking
  const trackingId = startUsageTracking(FUNCTION_NAME);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, conversation_id, session_token } = await req.json();
    
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Get AI credentials with proper cascade
    const credential = await getAICredential(supabase, 'gemini', session_token);
    if (!credential) {
      return createCredentialRequiredResponse(corsHeaders, 'gemini');
    }

    // Build contextual system prompt
    const systemPrompt = await buildContextualPrompt({
      basePrompt: generateElizaSystemPrompt(),
      conversationId: conversation_id,
      sessionToken: session_token,
      supabase
    });

    // Prepare session info for tool execution
    const sessionInfo = {
      conversation_id,
      session_token,
      executive_name: EXECUTIVE_NAME,
      function_name: FUNCTION_NAME
    };

    // Call AI Gateway with enhanced tool support
    const aiResponse = await callLovableAIGateway({
      model: 'gemini',
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      tools: ELIZA_TOOLS,
      tool_choice: "auto",
      credential: credential,
      session_info: sessionInfo
    });

    if (!aiResponse.success) {
      throw new Error(aiResponse.error || 'AI Gateway call failed');
    }

    let responseContent = aiResponse.data.content || '';
    const toolCalls = aiResponse.data.tool_calls || [];

    // Parse tool calls from different model formats if not already present
    if (!toolCalls || toolCalls.length === 0) {
      let parsedToolCalls = null;
      
      // Try different parsing strategies based on model type
      if ('gemini' === 'deepseek') {
        parsedToolCalls = parseDeepSeekToolCalls(responseContent);
      } else if ('gemini' === 'gemini' || 'gemini' === 'kimi') {
        parsedToolCalls = parseToolCodeBlocks(responseContent) || parseKimiToolCalls(responseContent);
      }
      
      if (parsedToolCalls) {
        console.log(`Parsed ${parsedToolCalls.length} tool calls from response content`);
        
        // Execute tool calls
        const toolMessages = [];
        for (const toolCall of parsedToolCalls) {
          const toolResult = await executeToolCall(toolCall, supabase, sessionInfo);
          toolMessages.push(toolResult);
        }
        
        // Get follow-up response with tool results
        const followUpResponse = await callLovableAIGateway({
          model: 'gemini',
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
            { role: "assistant", content: responseContent, tool_calls: parsedToolCalls },
            ...toolMessages
          ],
          credential: credential,
          session_info: sessionInfo
        });
        
        if (followUpResponse.success) {
          responseContent = followUpResponse.data.content || responseContent;
        }
      }
    } else {
      // Handle native tool calls
      console.log(`Processing ${toolCalls.length} native tool calls`);
      
      const toolMessages = [];
      for (const toolCall of toolCalls) {
        const toolResult = await executeToolCall(toolCall, supabase, sessionInfo);
        toolMessages.push(toolResult);
      }
      
      // Get follow-up response with tool results
      const followUpResponse = await callLovableAIGateway({
        model: 'gemini',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
          { role: "assistant", content: responseContent, tool_calls: toolCalls },
          ...toolMessages
        ],
        credential: credential,
        session_info: sessionInfo
      });
      
      if (followUpResponse.success) {
        responseContent = followUpResponse.data.content || responseContent;
      }
    }

    return new Response(
      JSON.stringify({
        content: responseContent,
        executive: EXECUTIVE_NAME,
        function_used: FUNCTION_NAME,
        tool_calls_processed: toolCalls?.length || 0
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error(`${FUNCTION_NAME} error:`, error);
    
    return new Response(
      JSON.stringify({
        error: error.message,
        executive: EXECUTIVE_NAME,
        function_used: FUNCTION_NAME,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});