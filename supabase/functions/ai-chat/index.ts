import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'ai-chat';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tool definitions for Vertex AI
const tools = [
  {
    name: "exec_python",
    description: "Executes a Python code snippet via the python-executor Edge Function.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "The Python code snippet to execute." }
      },
      required: ["code"]
    }
  },
  {
    name: "add_memory",
    description: "Adds a new memory to the system.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The content of the memory to be stored." },
        sector: { type: "string", description: "The memory sector (semantic, episodic, procedural)." }
      },
      required: ["content"]
    }
  },
  {
    name: "query_memory",
    description: "Queries the memory system for relevant memories.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The natural language query." },
        k: { type: "integer", description: "Number of memories to retrieve (default 5)." }
      },
      required: ["query"]
    }
  }
];

async function callEdgeFunction(functionName: string, payload: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !serviceRoleKey) {
    return { error: "Supabase configuration missing" };
  }
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `Function call failed: ${response.status} - ${errorText}` };
    }

    return await response.json();
  } catch (error: any) {
    return { error: `Network error: ${error.message}` };
  }
}

async function callVertexAI(messages: any[], systemPrompt: string) {
  const VERTEX_API_KEY = Deno.env.get('VERTEX_AI_API_KEY');
  
  if (!VERTEX_API_KEY) {
    throw new Error('VERTEX_AI_API_KEY not configured');
  }

  // Convert messages to Vertex AI format
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    tools: [{ functionDeclarations: tools }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    }
  };

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

async function callLovableGateway(messages: any[], systemPrompt: string) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

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
      tools: tools.map(t => ({
        type: 'function',
        function: t
      })),
      tool_choice: 'auto',
      max_tokens: 2048
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
      version: 'vertex-ai-primary',
      primary_provider: 'vertex_ai',
      fallback_provider: 'lovable_gateway'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { text, url, messages: inputMessages } = body;

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

    const systemPrompt = `You are Eliza, an intelligent AI assistant with access to tools for code execution and memory management.
Use exec_python when asked to run Python code.
Use add_memory when the user provides facts to store.
Use query_memory when the user asks about past information.
For analysis questions, respond directly without tools.`;

    const messages = inputMessages || [{ role: 'user', content: userContent }];
    let aiProvider = 'vertex_ai';
    let aiResponse: any;
    let toolCalls: any[] = [];
    let finalResponse = '';

    // Try Vertex AI first, fallback to Lovable Gateway
    try {
      console.log('🔷 Attempting Vertex AI (primary)...');
      aiResponse = await callVertexAI(messages, systemPrompt);
      
      // Parse Vertex AI response
      const candidate = aiResponse.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            finalResponse = part.text;
          }
          if (part.functionCall) {
            toolCalls.push({
              name: part.functionCall.name,
              arguments: part.functionCall.args
            });
          }
        }
      }
      console.log('✅ Vertex AI responded');
    } catch (vertexError: any) {
      console.warn('⚠️ Vertex AI failed:', vertexError.message);
      
      try {
        console.log('🔶 Falling back to Lovable Gateway...');
        aiProvider = 'lovable_gateway';
        aiResponse = await callLovableGateway(messages, systemPrompt);
        
        // Parse OpenAI-style response
        const choice = aiResponse.choices?.[0];
        if (choice?.message?.content) {
          finalResponse = choice.message.content;
        }
        if (choice?.message?.tool_calls) {
          toolCalls = choice.message.tool_calls.map((tc: any) => ({
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments)
          }));
        }
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

    // Execute tool calls if any
    const toolResults: any[] = [];
    for (const tool of toolCalls) {
      let result: any;
      
      if (tool.name === 'exec_python') {
        result = await callEdgeFunction('python-executor', { code: tool.arguments.code });
      } else if (tool.name === 'add_memory') {
        result = await callEdgeFunction('vectorize-memory', { 
          content: tool.arguments.content,
          context_type: tool.arguments.sector || 'semantic'
        });
      } else if (tool.name === 'query_memory') {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        const { data } = await supabase
          .from('memory_contexts')
          .select('content, context_type, importance_score')
          .textSearch('content', tool.arguments.query)
          .limit(tool.arguments.k || 5);
        result = { memories: data || [] };
      }
      
      toolResults.push({ tool: tool.name, result });
    }

    // If tools were called, make follow-up call for synthesis
    if (toolCalls.length > 0 && toolResults.length > 0) {
      const synthesisMessages = [
        ...messages,
        { 
          role: 'assistant', 
          content: `I executed the following tools:\n${toolResults.map(tr => 
            `- ${tr.tool}: ${JSON.stringify(tr.result).substring(0, 500)}`
          ).join('\n')}`
        },
        { role: 'user', content: 'Please summarize the results in a helpful way.' }
      ];

      try {
        if (aiProvider === 'vertex_ai') {
          const synthesisResponse = await callVertexAI(synthesisMessages, systemPrompt);
          finalResponse = synthesisResponse.candidates?.[0]?.content?.parts?.[0]?.text || finalResponse;
        } else {
          const synthesisResponse = await callLovableGateway(synthesisMessages, systemPrompt);
          finalResponse = synthesisResponse.choices?.[0]?.message?.content || finalResponse;
        }
      } catch (e) {
        // Keep original response if synthesis fails
        console.warn('Synthesis call failed, using tool results directly');
      }
    }

    await usageTracker.success({ provider: aiProvider, tools_called: toolCalls.length });
    
    return new Response(JSON.stringify({
      ok: true,
      ai_response: finalResponse,
      provider: aiProvider,
      tool_calls: toolCalls,
      tool_results: toolResults
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
