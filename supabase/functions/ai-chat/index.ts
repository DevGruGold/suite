import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';
import { generateElizaSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { executeToolCall } from '../_shared/toolExecutor.ts';
import { needsDataRetrieval, parseToolCodeBlocks, parseConversationalToolIntent } from '../_shared/executiveHelpers.ts';

const FUNCTION_NAME = 'ai-chat';
const MAX_TOOL_ITERATIONS = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert ELIZA_TOOLS to Vertex AI format
function convertToolsToVertexFormat(tools: typeof ELIZA_TOOLS) {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters
  }));
}

// Convert ELIZA_TOOLS to OpenAI format for Lovable Gateway
function convertToolsToOpenAIFormat(tools: typeof ELIZA_TOOLS) {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters
    }
  }));
}

async function callVertexAI(messages: any[], systemPrompt: string, forceToolUse: boolean = false) {
  const VERTEX_API_KEY = Deno.env.get('VERTEX_AI_API_KEY');
  
  if (!VERTEX_API_KEY) {
    throw new Error('VERTEX_AI_API_KEY not configured');
  }

  // Convert messages to Vertex AI format
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const vertexTools = convertToolsToVertexFormat(ELIZA_TOOLS);

  const body: any = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    tools: [{ functionDeclarations: vertexTools }],
    generationConfig: {
      temperature: forceToolUse ? 0.3 : 0.7,
      maxOutputTokens: 4096,
    }
  };

  // Force tool calling for data queries
  if (forceToolUse) {
    body.toolConfig = {
      functionCallingConfig: { mode: 'ANY' }
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${VERTEX_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

async function callLovableGateway(messages: any[], systemPrompt: string, forceToolUse: boolean = false) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const openaiTools = convertToolsToOpenAIFormat(ELIZA_TOOLS);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      tools: openaiTools,
      tool_choice: forceToolUse ? 'required' : 'auto',
      max_tokens: 4096,
      temperature: forceToolUse ? 0.3 : 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lovable Gateway error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok',
      version: 'full-eliza-tools',
      tools_count: ELIZA_TOOLS.length,
      primary_provider: 'vertex_ai',
      fallback_provider: 'lovable_gateway'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const { text, url, messages: inputMessages, context } = body;

    // Extract user content
    let userContent = text || '';
    if (url && !userContent) {
      try {
        const urlResponse = await fetch(url);
        userContent = await urlResponse.text();
        if (userContent.length > 50000) {
          userContent = userContent.substring(0, 50000) + '... [truncated]';
        }
      } catch (e) {
        userContent = `Failed to fetch URL: ${url}`;
      }
    }

    if (!userContent && (!inputMessages || inputMessages.length === 0)) {
      await usageTracker.failure('No content provided', 400);
      return new Response(JSON.stringify({ error: 'No content provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate the full Eliza system prompt
    const systemPrompt = generateElizaSystemPrompt();
    
    const messages = inputMessages || [{ role: 'user', content: userContent }];
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()?.content || userContent;
    
    // Detect if this is a data-seeking query that should force tool use
    const shouldForceTool = needsDataRetrieval(lastUserMessage);
    
    let aiProvider = 'vertex_ai';
    let aiResponse: any;
    let allToolCalls: any[] = [];
    let allToolResults: any[] = [];
    let finalResponse = '';
    let iteration = 0;

    // Try Vertex AI first, fallback to Lovable Gateway
    try {
      console.log(`🔷 ai-chat: Attempting Vertex AI (force_tools=${shouldForceTool})...`);
      aiResponse = await callVertexAI(messages, systemPrompt, shouldForceTool);
      console.log('✅ Vertex AI responded');
    } catch (vertexError: any) {
      console.warn('⚠️ Vertex AI failed:', vertexError.message);
      
      try {
        console.log('🔶 Falling back to Lovable Gateway...');
        aiProvider = 'lovable_gateway';
        aiResponse = await callLovableGateway(messages, systemPrompt, shouldForceTool);
        console.log('✅ Lovable Gateway responded');
      } catch (lovableError: any) {
        console.error('❌ All AI providers failed');
        await usageTracker.failure(`All providers failed: ${lovableError.message}`, 503);
        return new Response(JSON.stringify({
          error: 'All AI providers unavailable',
          vertex_error: vertexError.message,
          lovable_error: lovableError.message
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Tool execution loop
    let currentMessages = [...messages];
    
    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      let toolCalls: any[] = [];
      let responseText = '';

      // Parse response based on provider
      if (aiProvider === 'vertex_ai') {
        const candidate = aiResponse.candidates?.[0];
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              responseText = part.text;
            }
            if (part.functionCall) {
              toolCalls.push({
                name: part.functionCall.name,
                arguments: part.functionCall.args || {}
              });
            }
          }
        }
      } else {
        // OpenAI format (Lovable Gateway)
        const choice = aiResponse.choices?.[0];
        if (choice?.message?.content) {
          responseText = choice.message.content;
        }
        if (choice?.message?.tool_calls) {
          toolCalls = choice.message.tool_calls.map((tc: any) => ({
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string' 
              ? JSON.parse(tc.function.arguments) 
              : tc.function.arguments
          }));
        }
      }

      // Try to parse tool calls from text if none found natively
      if (toolCalls.length === 0 && responseText) {
        const textToolCalls = parseToolCodeBlocks(responseText);
        if (textToolCalls && textToolCalls.length > 0) {
          toolCalls = textToolCalls;
          console.log(`📝 Parsed ${toolCalls.length} tool calls from text`);
        } else {
          // Try conversational intent parsing
          const intentTools = parseConversationalToolIntent(responseText);
          if (intentTools && intentTools.length > 0) {
            toolCalls = intentTools;
            console.log(`🎯 Detected ${toolCalls.length} tools from conversational intent`);
          }
        }
      }

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        finalResponse = responseText;
        break;
      }

      console.log(`🔧 Iteration ${iteration}: Executing ${toolCalls.length} tool calls...`);

      // Execute tool calls
      for (const tool of toolCalls) {
        try {
          console.log(`  → Executing: ${tool.name}`);
          const result = await executeToolCall(
            supabase,
            { function: { name: tool.name, arguments: JSON.stringify(tool.arguments) } },
            'Eliza',
            SUPABASE_URL,
            SERVICE_ROLE_KEY
          );
          
          allToolCalls.push(tool);
          allToolResults.push({ tool: tool.name, result, success: true });
          
          // Add tool result to messages for next iteration
          currentMessages.push({
            role: 'assistant',
            content: `Called ${tool.name} with result: ${JSON.stringify(result).substring(0, 2000)}`
          });
        } catch (toolError: any) {
          console.error(`  ✗ Tool ${tool.name} failed:`, toolError.message);
          allToolCalls.push(tool);
          allToolResults.push({ tool: tool.name, error: toolError.message, success: false });
          
          currentMessages.push({
            role: 'assistant', 
            content: `Tool ${tool.name} failed: ${toolError.message}`
          });
        }
      }

      // If this was the last iteration, synthesize results
      if (iteration >= MAX_TOOL_ITERATIONS) {
        finalResponse = `Executed ${allToolCalls.length} tools. Results: ${JSON.stringify(allToolResults.slice(-3))}`;
        break;
      }

      // Make follow-up call to synthesize results
      currentMessages.push({
        role: 'user',
        content: 'Based on the tool results above, provide a helpful response to the original question.'
      });

      try {
        if (aiProvider === 'vertex_ai') {
          aiResponse = await callVertexAI(currentMessages, systemPrompt, false);
        } else {
          aiResponse = await callLovableGateway(currentMessages, systemPrompt, false);
        }
      } catch (e: any) {
        console.warn('Follow-up call failed:', e.message);
        finalResponse = `Tool execution completed. Results: ${JSON.stringify(allToolResults.slice(-3))}`;
        break;
      }
    }

    await usageTracker.success({ 
      provider: aiProvider, 
      tools_called: allToolCalls.length,
      iterations: iteration,
      force_tools: shouldForceTool
    });
    
    return new Response(JSON.stringify({
      ok: true,
      ai_response: finalResponse,
      provider: aiProvider,
      model: aiProvider === 'vertex_ai' ? 'gemini-2.0-flash' : 'gemini-2.5-flash',
      tool_calls: allToolCalls,
      tool_results: allToolResults,
      iterations: iteration,
      tools_available: ELIZA_TOOLS.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('ai-chat error:', error);
    await usageTracker.failure(error.message, 500);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
