import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateExecutiveSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { buildContextualPrompt } from '../_shared/contextBuilder.ts';
import { EdgeFunctionLogger } from "../_shared/logging.ts";
import { ELIZA_TOOLS } from '../_shared/elizaTools.ts';
import { executeToolCall } from '../_shared/toolExecutor.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const logger = EdgeFunctionLogger('cto-executive');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parser for DeepSeek's text-based tool call format
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

// Parser for Gemini/Kimi tool_code block format (fallback responses)
function parseToolCodeBlocks(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  
  // Pattern: ```tool_code blocks
  const toolCodeRegex = /```tool_code\s*\n?([\s\S]*?)```/g;
  let match;
  
  while ((match = toolCodeRegex.exec(content)) !== null) {
    const code = match[1].trim();
    
    // Parse invoke_edge_function({ function_name: "...", payload: {...} })
    const invokeMatch = code.match(/invoke_edge_function\s*\(\s*\{([\s\S]*?)\}\s*\)/);
    if (invokeMatch) {
      try {
        let argsStr = `{${invokeMatch[1]}}`;
        argsStr = argsStr.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"').replace(/""+/g, '"');
        const args = JSON.parse(argsStr);
        toolCalls.push({
          id: `tool_code_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: { name: 'invoke_edge_function', arguments: JSON.stringify(args) }
        });
      } catch (e) {
        console.warn('Failed to parse invoke_edge_function from tool_code:', e.message);
      }
      continue;
    }
    
    // Parse direct function calls like check_system_status({}) or system_status()
    const directMatch = code.match(/(\w+)\s*\(\s*(\{[\s\S]*?\})?\s*\)/);
    if (directMatch) {
      const funcName = directMatch[1];
      let argsStr = directMatch[2] || '{}';
      try {
        argsStr = argsStr.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"').replace(/""+/g, '"');
        const parsedArgs = JSON.parse(argsStr);
        toolCalls.push({
          id: `tool_code_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: { name: funcName, arguments: JSON.stringify(parsedArgs) }
        });
      } catch (e) {
        console.warn(`Failed to parse ${funcName} from tool_code:`, e.message);
      }
    }
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

// Fallback to Kimi K2 via OpenRouter
async function callKimiFallback(messages: any[], tools?: any[]): Promise<any> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) return null;
  
  console.log('🔄 Trying Kimi K2 fallback via OpenRouter...');
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://xmrt.pro',
        'X-Title': 'XMRT Eliza'
      },
      body: JSON.stringify({
        model: 'moonshotai/kimi-k2',
        messages,
        tools,
        tool_choice: tools ? 'auto' : undefined,
        temperature: 0.9,
        max_tokens: 8000,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Kimi K2 fallback successful');
      return {
        content: data.choices?.[0]?.message?.content || '',
        tool_calls: data.choices?.[0]?.message?.tool_calls || [],
        provider: 'openrouter',
        model: 'moonshotai/kimi-k2'
      };
    }
  } catch (error) {
    console.warn('⚠️ Kimi K2 fallback failed:', error.message);
  }
  return null;
}

// Fallback to Gemini API with native tool calling and tool_code detection
async function callGeminiFallback(
  messages: any[], 
  images?: string[], 
  supabase?: any, 
  SUPABASE_URL?: string, 
  SERVICE_ROLE_KEY?: string,
  tools?: any[]
): Promise<any> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return null;
  
  console.log('🔄 Trying Gemini fallback with native tool calling...');
  
  try {
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');
    const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
    const userText = lastUserMessage?.content || 'Help me with XMRT DAO';
    
    const parts: any[] = [{ text: `${systemPrompt}\n\nUser: ${userText}` }];
    
    if (images && images.length > 0) {
      for (const imageBase64 of images) {
        const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          parts.push({ inline_data: { mime_type: matches[1], data: matches[2] } });
        }
      }
    }
    
    // Convert ELIZA_TOOLS to Gemini's function declarations format
    const geminiTools = tools && tools.length > 0 ? [{
      functionDeclarations: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters
      }))
    }] : undefined;
    
    console.log(`📦 Passing ${tools?.length || 0} tools to Gemini`);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          tools: geminiTools,
          generationConfig: { temperature: 0.7, maxOutputTokens: 8000 }
        })
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      const responseParts = data.candidates?.[0]?.content?.parts || [];
      
      // Check for native function calls from Gemini
      const functionCalls = responseParts.filter((p: any) => p.functionCall);
      if (functionCalls.length > 0 && supabase && SUPABASE_URL && SERVICE_ROLE_KEY) {
        console.log(`🔧 Gemini returned ${functionCalls.length} native function calls - executing...`);
        const toolResults = [];
        
        for (const fc of functionCalls) {
          const toolCall = {
            id: `gemini_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            type: 'function',
            function: { 
              name: fc.functionCall.name, 
              arguments: JSON.stringify(fc.functionCall.args || {}) 
            }
          };
          console.log(`  → Executing: ${fc.functionCall.name}`);
          const result = await executeToolCall(supabase, toolCall, 'CTO', SUPABASE_URL, SERVICE_ROLE_KEY);
          toolResults.push({ tool: fc.functionCall.name, result });
        }
        
        // Synthesize results into natural response
        const resultSummary = toolResults.map(r => {
          const resultStr = typeof r.result === 'string' ? r.result : JSON.stringify(r.result);
          return `**${r.tool}:** ${resultStr.slice(0, 500)}${resultStr.length > 500 ? '...' : ''}`;
        }).join('\n\n');
        
        return { 
          content: `I executed ${toolResults.length} operation(s):\n\n${resultSummary}`, 
          provider: 'gemini', 
          model: 'gemini-2.0-flash-exp', 
          toolsExecuted: toolResults.length,
          tool_calls: functionCalls.map((fc: any) => ({
            function: { name: fc.functionCall.name, arguments: JSON.stringify(fc.functionCall.args) }
          }))
        };
      }
      
      // Extract text response
      let text = responseParts.find((p: any) => p.text)?.text;
      if (text) {
        console.log('✅ Gemini fallback successful');
        
        // Fallback: Check for tool_code blocks in text response
        if (text.includes('```tool_code') && supabase && SUPABASE_URL && SERVICE_ROLE_KEY) {
          console.log('🔧 Detected tool_code blocks in Gemini text response - executing...');
          const textToolCalls = parseToolCodeBlocks(text);
          if (textToolCalls && textToolCalls.length > 0) {
            const toolResults = [];
            for (const toolCall of textToolCalls) {
              const result = await executeToolCall(supabase, toolCall, 'CTO', SUPABASE_URL, SERVICE_ROLE_KEY);
              toolResults.push({ tool: toolCall.function.name, result });
            }
            text = text.replace(/```tool_code[\s\S]*?```/g, '').trim();
            text += `\n\n**Tool Execution Results:**\n${toolResults.map(r => `- ${r.tool}: ${JSON.stringify(r.result).slice(0, 200)}...`).join('\n')}`;
            return { content: text, provider: 'gemini', model: 'gemini-2.0-flash-exp', toolsExecuted: toolResults.length };
          }
        }
        
        return { content: text, provider: 'gemini', model: 'gemini-2.0-flash-exp' };
      }
    } else {
      const errorText = await response.text();
      console.warn('⚠️ Gemini API error:', response.status, errorText);
    }
  } catch (error) {
    console.warn('⚠️ Gemini fallback failed:', error.message);
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError);
      await logger.error('Body parsing failed', parseError, 'request_parsing');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { type: 'validation_error', code: 400, message: 'Invalid JSON in request body' }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { 
      messages, 
      conversationHistory = [], 
      userContext = { ip: 'unknown', isFounder: false }, 
      miningStats = null, 
      systemVersion = null,
      councilMode = false,
      images = []
    } = requestBody;
    
    await logger.info('Request received', 'ai_interaction', { 
      messagesCount: messages?.length,
      hasHistory: conversationHistory?.length > 0,
      userContext,
      executive: 'CTO',
      councilMode,
      hasImages: images?.length > 0
    });

    if (!messages || !Array.isArray(messages)) {
      console.error('❌ Invalid messages parameter');
      await logger.error('Invalid request format', new Error('Messages must be an array'), 'validation');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { type: 'validation_error', code: 400, message: 'Invalid request: messages must be an array' }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('💻 CTO Executive (DeepSeek) - Processing with full capabilities');

    // Initialize Supabase client
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Build system prompt
    const executivePrompt = generateExecutiveSystemPrompt('CTO');
    let contextualPrompt = await buildContextualPrompt(executivePrompt, {
      conversationHistory,
      userContext,
      miningStats,
      systemVersion
    });

    if (councilMode) {
      contextualPrompt += `\n\n🏛️ COUNCIL MODE: Provide concise 2-4 paragraph response. Full tool access retained.`;
    }

    const aiMessages = [{ role: 'system', content: contextualPrompt }, ...messages];
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
    
    // ========== PRIORITY VISION ROUTING ==========
    if (images && images.length > 0) {
      console.log(`🖼️ Images detected (${images.length}) - routing to vision-capable model`);
      
      const geminiResult = await callGeminiFallback(aiMessages, images, supabase, SUPABASE_URL, SERVICE_ROLE_KEY, ELIZA_TOOLS);
      if (geminiResult) {
        return new Response(
          JSON.stringify({
            success: true,
            response: geminiResult.content,
            hasToolCalls: false,
            executive: 'deepseek-chat',
            executiveTitle: 'Chief Technology Officer (CTO) [Vision via Gemini]',
            provider: geminiResult.provider,
            model: geminiResult.model,
            vision_analysis: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    if (!DEEPSEEK_API_KEY) {
      console.warn('⚠️ DEEPSEEK_API_KEY not configured, trying fallbacks...');
      
      // Try Kimi K2 fallback
      const kimiResult = await callKimiFallback(aiMessages, ELIZA_TOOLS);
      if (kimiResult) {
        return new Response(
          JSON.stringify({
            success: true,
            response: kimiResult.content,
            hasToolCalls: false,
            executive: 'deepseek-chat',
            executiveTitle: 'Chief Technology Officer (CTO) [Kimi K2 Fallback]',
            provider: kimiResult.provider,
            model: kimiResult.model,
            fallback: 'kimi'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Try Gemini fallback
      const geminiResult = await callGeminiFallback(aiMessages, [], supabase, SUPABASE_URL, SERVICE_ROLE_KEY, ELIZA_TOOLS);
      if (geminiResult) {
        return new Response(
          JSON.stringify({
            success: true,
            response: geminiResult.content,
            hasToolCalls: false,
            executive: 'deepseek-chat',
            executiveTitle: 'Chief Technology Officer (CTO) [Gemini Fallback]',
            provider: geminiResult.provider,
            model: geminiResult.model,
            fallback: 'gemini'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('DEEPSEEK_API_KEY is not configured and all fallbacks failed');
    }
    
    console.log('📤 Calling DeepSeek API with tools...');
    const apiStartTime = Date.now();
    
    // Call DeepSeek API with tools
    let deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: aiMessages,
        tools: ELIZA_TOOLS,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: councilMode ? 800 : 2000
      })
    });
    
    // ========== HANDLE API ERRORS WITH FALLBACK CASCADE ==========
    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      console.error('❌ DeepSeek API error:', deepseekResponse.status, errorText);
      
      if (deepseekResponse.status === 402 || deepseekResponse.status === 429 || deepseekResponse.status >= 500) {
        console.log(`⚠️ DeepSeek returned ${deepseekResponse.status}, trying fallback cascade...`);
        
        // Try Kimi K2 fallback
        const kimiResult = await callKimiFallback(aiMessages, ELIZA_TOOLS);
        if (kimiResult) {
          // Process tool calls if any
          if (kimiResult.tool_calls && kimiResult.tool_calls.length > 0) {
            console.log(`🔧 Executing ${kimiResult.tool_calls.length} tool(s) from Kimi K2`);
            const toolResults = [];
            for (const toolCall of kimiResult.tool_calls) {
              const result = await executeToolCall(supabase, toolCall, 'CTO', SUPABASE_URL, SERVICE_ROLE_KEY);
              toolResults.push({ tool_call_id: toolCall.id, role: 'tool', content: JSON.stringify(result) });
            }
            
            const secondResult = await callKimiFallback([
              ...aiMessages,
              { role: 'assistant', content: kimiResult.content, tool_calls: kimiResult.tool_calls },
              ...toolResults
            ]);
            
            if (secondResult) {
              return new Response(
                JSON.stringify({
                  success: true,
                  response: secondResult.content,
                  hasToolCalls: true,
                  toolCallsExecuted: kimiResult.tool_calls.length,
                  executive: 'deepseek-chat',
                  executiveTitle: 'Chief Technology Officer (CTO) [Kimi K2 Fallback]',
                  provider: 'openrouter',
                  model: 'moonshotai/kimi-k2',
                  fallback: 'kimi'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
          
          return new Response(
            JSON.stringify({
              success: true,
              response: kimiResult.content,
              hasToolCalls: false,
              executive: 'deepseek-chat',
              executiveTitle: 'Chief Technology Officer (CTO) [Kimi K2 Fallback]',
              provider: kimiResult.provider,
              model: kimiResult.model,
              fallback: 'kimi'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Try Gemini fallback
        const geminiResult = await callGeminiFallback(aiMessages, [], supabase, SUPABASE_URL, SERVICE_ROLE_KEY, ELIZA_TOOLS);
        if (geminiResult) {
          return new Response(
            JSON.stringify({
              success: true,
              response: geminiResult.content,
              hasToolCalls: false,
              executive: 'deepseek-chat',
              executiveTitle: 'Chief Technology Officer (CTO) [Gemini Fallback]',
              provider: geminiResult.provider,
              model: geminiResult.model,
              fallback: 'gemini'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      throw new Error(`DeepSeek API error: ${deepseekResponse.status} - ${errorText}`);
    }
    
    const deepseekData = await deepseekResponse.json();
    let content = deepseekData.choices?.[0]?.message?.content || '';
    let toolCalls = deepseekData.choices?.[0]?.message?.tool_calls || [];
    
    // Check for text-embedded tool calls
    if (!toolCalls.length && content) {
      const textToolCalls = parseDeepSeekToolCalls(content);
      if (textToolCalls) {
        toolCalls = textToolCalls;
        content = content.replace(/<｜tool▁calls▁begin｜>.*?<｜tool▁calls▁end｜>/s, '').trim();
      }
    }
    
    // ========== EXECUTE TOOL CALLS ==========
    if (toolCalls && toolCalls.length > 0) {
      console.log(`🔧 CTO executing ${toolCalls.length} tool(s)`);
      
      const toolResults = [];
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name;
        
        // Validate tool exists
        const validTools = ELIZA_TOOLS.map(t => t.function?.name);
        if (!validTools.includes(toolName)) {
          console.warn(`⚠️ Unknown tool attempted: ${toolName}`);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolName,
            content: JSON.stringify({ 
              error: `Unknown tool: ${toolName}. Use invoke_edge_function or check tool registry.`
            })
          });
          continue;
        }
        
        const result = await executeToolCall(supabase, toolCall, 'CTO', SUPABASE_URL, SERVICE_ROLE_KEY);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: JSON.stringify(result)
        });
      }
      
      // Get final response after tool execution
      const secondResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            ...aiMessages,
            { role: 'assistant', content: content, tool_calls: toolCalls },
            ...toolResults
          ],
          temperature: 0.7,
          max_tokens: 4096
        })
      });
      
      if (secondResponse.ok) {
        const secondData = await secondResponse.json();
        content = secondData.choices?.[0]?.message?.content || content;
      }
    }
    
    const apiDuration = Date.now() - apiStartTime;
    
    console.log(`✅ CTO Executive responded in ${apiDuration}ms`);
    await logger.apiCall('deepseek_api', 200, apiDuration, { 
      executive: 'CTO',
      responseLength: content?.length || 0,
      toolCalls: toolCalls?.length || 0,
      usage: deepseekData.usage
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: content,
        hasToolCalls: toolCalls?.length > 0,
        toolCallsExecuted: toolCalls?.length || 0,
        executive: 'deepseek-chat',
        executiveTitle: 'Chief Technology Officer (CTO)',
        provider: 'deepseek',
        model: 'deepseek-chat',
        confidence: 85,
        usage: deepseekData.usage
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ CTO Executive error:', error);
    await logger.error('Function execution failed', error, 'error');
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    let statusCode = 500;
    
    if (errorMessage.includes('402') || errorMessage.includes('Payment Required')) {
      statusCode = 402;
    } else if (errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
      statusCode = 429;
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: {
          type: statusCode === 402 ? 'payment_required' : 
                statusCode === 429 ? 'rate_limit' : 'service_unavailable',
          code: statusCode,
          message: errorMessage,
          service: 'deepseek-chat',
          details: {
            timestamp: new Date().toISOString(),
            executive: 'CTO',
            model: 'deepseek-chat'
          },
          canRetry: statusCode !== 402,
          suggestedAction: statusCode === 402 ? 'add_credits' : 'try_alternative'
        }
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
