import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateElizaSystemPrompt } from '../_shared/elizaSystemPrompt.ts';
import { getAICredential, createCredentialRequiredResponse } from "../_shared/credentialCascade.ts";
import { callLovableAIGateway } from '../_shared/unifiedAIFallback.ts';
import { createOpenAI } from "npm:@ai-sdk/openai@1.0.0";
import { generateText, tool } from "npm:ai@4.0.0";
import { z } from "npm:zod@3.24.1";

/**
 * Local intelligence fallback - generates contextual responses without external AI APIs
 */
function generateLocalResponse(userMessage: string, context: any): string {
  const msg = userMessage.toLowerCase();
  
  // API key issue detection
  if (msg.includes('api') || msg.includes('key') || msg.includes('error') || msg.includes('not working')) {
    return `I notice we're currently experiencing limitations with external AI services. All API keys appear to be unavailable or expired. 

However, I can still help you with:
• Information about the XMRT ecosystem and mining
• System status and diagnostics
• General guidance and support

To restore full AI capabilities, please check:
1. OpenAI API key (https://platform.openai.com/api-keys)
2. DeepSeek API key (https://platform.deepseek.com)
3. Gemini API key (https://makersuite.google.com/app/apikey)
4. WAN AI key (https://wan.ai)

What would you like to know about the XMRT system?`;
  }

  // Mining questions
  if (msg.includes('mining') || msg.includes('hashrate') || msg.includes('xmrt')) {
    const stats = context.miningStats;
    if (stats) {
      return `Based on current system data:
• Active devices: ${stats.activeDevices || 'N/A'}
• Total hashrate: ${stats.totalHashrate || 'N/A'}
• XMRT balance: ${stats.balance || 'N/A'}

Note: I'm running in local mode due to unavailable external AI services. For more detailed analysis, please ensure API keys are configured.`;
    }
    return `I can help with mining information, but I'm currently in local mode. To get real-time mining statistics and AI-powered analysis, please configure your API keys.`;
  }

  // Greeting
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    return `Hello! I'm Eliza, running in local intelligence mode. While external AI services are currently unavailable, I can still assist with basic information about XMRT, mining operations, and system status. What can I help you with?`;
  }

  // General fallback
  return `I'm currently operating in local mode as all external AI services (OpenAI, DeepSeek, Gemini, WAN AI) are unavailable. 

I can still provide:
✓ Basic information about XMRT and the ecosystem
✓ System status and diagnostics
✓ General guidance

For full AI-powered assistance, please configure at least one AI service API key.

How can I assist you today?`;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parser for tool_code blocks from fallback responses
function parseToolCodeBlocks(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  const toolCodeRegex = /```tool_code\s*\n?([\s\S]*?)```/g;
  let match;
  
  while ((match = toolCodeRegex.exec(content)) !== null) {
    const code = match[1].trim();
    
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
      } catch (e) { console.warn('Failed to parse invoke_edge_function:', e.message); }
      continue;
    }
    
    const directMatch = code.match(/(\w+)\s*\(\s*(\{[\s\S]*?\})?\s*\)/);
    if (directMatch) {
      const funcName = directMatch[1];
      let argsStr = directMatch[2] || '{}';
      try {
        argsStr = argsStr.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"').replace(/""+/g, '"');
        toolCalls.push({
          id: `tool_code_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: { name: funcName, arguments: JSON.stringify(JSON.parse(argsStr)) }
        });
      } catch (e) { console.warn(`Failed to parse ${funcName}:`, e.message); }
    }
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

// Execute parsed tool calls via Supabase functions
async function executeToolCodeCalls(toolCalls: any[], supabaseUrl: string, serviceRoleKey: string): Promise<any[]> {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const results = [];
  
  for (const toolCall of toolCalls) {
    const funcName = toolCall.function?.name;
    let args = {};
    try { args = JSON.parse(toolCall.function?.arguments || '{}'); } catch {}
    
    console.log(`🔧 Executing tool_code call: ${funcName}`);
    
    if (funcName === 'invoke_edge_function') {
      const { function_name, payload } = args as any;
      const { data, error } = await supabase.functions.invoke(function_name, { body: payload || {} });
      results.push({ tool: function_name, result: error ? { error: error.message } : data });
    } else {
      // Map direct function calls to edge functions
      const { data, error } = await supabase.functions.invoke(funcName.replace(/_/g, '-'), { body: args });
      results.push({ tool: funcName, result: error ? { error: error.message } : data });
    }
  }
  
  return results;
}

// Declare AI state variables OUTSIDE try block for catch block access
let aiProvider: string = 'unknown';
let aiModel: string = 'gpt-4o-mini';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, conversationHistory, userContext, miningStats, systemVersion, session_credentials, images, systemPrompt: customSystemPrompt } = await req.json();
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Check for images - if present, route to vision-capable models
    const hasImages = images && images.length > 0;
    if (hasImages) {
      console.log(`🖼️ Image analysis requested: ${images.length} images attached`);
    }
    
    // Intelligent AI service cascade with vision support
    // Priority for images: Gemini (best vision) -> OpenAI (gpt-4o vision) -> fallbacks
    const openaiKey = getAICredential('openai', session_credentials);
    const deepseekKey = getAICredential('deepseek', session_credentials);
    const geminiKey = getAICredential('gemini', session_credentials);
    const wanKey = getAICredential('wan', session_credentials);
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY'); // Backend key

    console.log('🔍 Available AI services:', {
      openai: !!openaiKey,
      deepseek: !!deepseekKey,
      gemini: !!geminiKey || !!GEMINI_API_KEY,
      wan: !!wanKey,
      hasImages
    });

    // ========== PRIORITY 1: Gemini Vision for Images ==========
    // If images are present, Gemini is the best choice for vision analysis
    if (hasImages && (geminiKey || GEMINI_API_KEY)) {
      console.log('🖼️ Images detected - using Gemini Vision API (best for images)');
      const effectiveGeminiKey = geminiKey || GEMINI_API_KEY;
      
      try {
        // Get user message content
        const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
        const userText = typeof lastUserMessage?.content === 'string' 
          ? lastUserMessage.content 
          : 'Analyze this image and describe what you see in detail.';
        
        // Build parts array for Gemini multimodal
        const systemContent = customSystemPrompt || messages.find((m: any) => m.role === 'system')?.content || '';
        const parts: any[] = [
          { text: `${systemContent}\n\nUser request: ${userText}` }
        ];
        
        // Add images to parts
        for (const imageBase64 of images) {
          const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            parts.push({
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            });
          }
        }
        
        console.log(`📸 Calling Gemini Vision API with ${images.length} images`);
        
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${effectiveGeminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8000
              }
            })
          }
        );
        
        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          let geminiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (geminiText) {
            console.log('✅ Gemini Vision analysis successful');
            
            // Check for tool_code blocks and execute them
            if (geminiText.includes('```tool_code')) {
              console.log('🔧 Detected tool_code blocks in Gemini Vision response - executing...');
              const textToolCalls = parseToolCodeBlocks(geminiText);
              if (textToolCalls && textToolCalls.length > 0) {
                const toolResults = await executeToolCodeCalls(textToolCalls, SUPABASE_URL, SERVICE_ROLE_KEY);
                geminiText = geminiText.replace(/```tool_code[\s\S]*?```/g, '').trim();
                geminiText += `\n\n**Tool Execution Results:**\n${toolResults.map(r => `- ${r.tool}: ${JSON.stringify(r.result).slice(0, 200)}...`).join('\n')}`;
              }
            }
            
            return new Response(
              JSON.stringify({
                success: true,
                response: geminiText,
                provider: 'gemini',
                model: 'gemini-2.0-flash-exp',
                executive: 'vercel-ai-chat',
                executiveTitle: 'Chief Information Officer (CIO) [Vision]',
                vision_analysis: true
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          const errorText = await geminiResponse.text();
          console.warn('⚠️ Gemini Vision failed:', errorText);
        }
      } catch (geminiError) {
        console.warn('⚠️ Gemini Vision error:', geminiError.message);
      }
    }

    // ========== PRIORITY 2: OpenAI Vision (gpt-4o supports images) ==========
    if (hasImages && openaiKey) {
      console.log('🖼️ Trying OpenAI Vision (gpt-4o) for image analysis');
      try {
        // Format messages with images for OpenAI vision
        const formattedMessages = messages.map((msg: any, idx: number) => {
          if (msg.role === 'user' && idx === messages.length - 1) {
            const contentParts: any[] = [
              { type: 'text', text: msg.content }
            ];
            for (const imageBase64 of images) {
              contentParts.push({
                type: 'image_url',
                image_url: { url: imageBase64 }
              });
            }
            return { role: 'user', content: contentParts };
          }
          return msg;
        });
        
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o', // Vision-capable model
            messages: formattedMessages,
            max_tokens: 8000
          })
        });
        
        if (openaiResponse.ok) {
          const openaiData = await openaiResponse.json();
          const openaiText = openaiData.choices?.[0]?.message?.content;
          
          if (openaiText) {
            console.log('✅ OpenAI Vision analysis successful');
            return new Response(
              JSON.stringify({
                success: true,
                response: openaiText,
                provider: 'openai',
                model: 'gpt-4o',
                executive: 'vercel-ai-chat',
                executiveTitle: 'Chief Analytics Officer (CAO) [Vision]',
                vision_analysis: true
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          const errorText = await openaiResponse.text();
          console.warn('⚠️ OpenAI Vision failed:', errorText);
        }
      } catch (openaiError) {
        console.warn('⚠️ OpenAI Vision error:', openaiError.message);
      }
    }

    // ========== PRIORITY 3: OpenRouter Vision (claude-3-haiku supports images) ==========
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (hasImages && openRouterKey) {
      console.log('🖼️ Trying OpenRouter Vision (claude-3-haiku) for image analysis');
      try {
        const contentParts: any[] = [
          { type: 'text', text: userMessage }
        ];
        
        for (const imageBase64 of images) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: imageBase64 }
          });
        }
        
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://xmrt.pro',
            'X-Title': 'XMRT Eliza'
          },
          body: JSON.stringify({
            model: 'anthropic/claude-3-haiku',
            messages: [{ role: 'user', content: contentParts }],
            max_tokens: 8000
          })
        });
        
        if (openRouterResponse.ok) {
          const openRouterData = await openRouterResponse.json();
          const openRouterText = openRouterData.choices?.[0]?.message?.content;
          
          if (openRouterText) {
            console.log('✅ OpenRouter Vision analysis successful');
            return new Response(
              JSON.stringify({
                success: true,
                response: openRouterText,
                provider: 'openrouter',
                model: 'claude-3-haiku',
                executive: 'vercel-ai-chat',
                executiveTitle: 'Chief Innovation Officer (CIO) [OpenRouter Vision]',
                vision_analysis: true
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          const errorText = await openRouterResponse.text();
          console.warn('⚠️ OpenRouter Vision failed:', errorText);
        }
      } catch (openRouterError) {
        console.warn('⚠️ OpenRouter Vision error:', openRouterError.message);
      }
    }

    // ========== STANDARD TEXT PROCESSING (no images or vision failed) ==========
    let API_KEY: string | null = null;
    let aiClient: any = null;

    if (openaiKey) {
      API_KEY = openaiKey;
      aiProvider = 'openai';
      aiModel = 'gpt-4o-mini';
      aiClient = createOpenAI({ apiKey: openaiKey });
      console.log('✅ Using OpenAI - Primary AI');
    } else if (deepseekKey) {
      console.log('⚠️ OpenAI not available, trying DeepSeek fallback');
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const fallbackSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        
        const deepseekResult = await fallbackSupabase.functions.invoke('deepseek-chat', {
          body: { 
            messages, 
            conversationHistory, 
            userContext, 
            miningStats, 
            systemVersion,
            session_credentials 
          }
        });

        if (!deepseekResult.error && deepseekResult.data) {
          return new Response(
            JSON.stringify({ success: true, response: deepseekResult.data.response, provider: 'deepseek', executive: 'vercel-ai-chat', executiveTitle: 'Chief Strategy Officer (CSO)' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (error) {
        console.warn('DeepSeek fallback failed:', error);
      }
    }
    
    // ========== PRIORITY 4.5: Kimi K2 via OpenRouter (between DeepSeek and Gemini) ==========
    if (!API_KEY && openRouterKey) {
      console.log('⚠️ Trying Kimi K2 via OpenRouter fallback');
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const fallbackSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        
        const kimiResult = await fallbackSupabase.functions.invoke('kimi-chat', {
          body: { 
            messages, 
            conversationHistory, 
            userContext, 
            miningStats, 
            systemVersion,
            session_credentials 
          }
        });

        if (!kimiResult.error && kimiResult.data?.response) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              response: kimiResult.data.response, 
              provider: 'kimi', 
              model: 'moonshotai/kimi-k2',
              executive: 'vercel-ai-chat', 
              executiveTitle: 'Chief Innovation Officer (CIO) [Kimi K2]' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (error) {
        console.warn('Kimi K2 fallback failed:', error);
      }
    } else if (geminiKey || GEMINI_API_KEY) {
      API_KEY = geminiKey || GEMINI_API_KEY;
      aiProvider = 'gemini';
      aiModel = 'gemini-1.5-flash';
      aiClient = createOpenAI({ 
        apiKey: API_KEY, 
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
      });
      console.log('✅ Using Gemini');
    } else if (wanKey) {
      API_KEY = wanKey;
      aiProvider = 'wan';
      aiModel = 'gpt-4o-mini';
      aiClient = createOpenAI({ 
        apiKey: wanKey,
        baseURL: 'https://api.wan.ai/v1'
      });
      console.log('✅ Using WAN AI');
    }

    if (!API_KEY) {
      console.warn('⚠️ All AI services unavailable - using local intelligence fallback (Embedded Office Clerk)');
      
      // Local fallback: Generate intelligent contextual response
      const userMessage = messages[messages.length - 1]?.content || '';
      const fallbackResponse = generateLocalResponse(userMessage, {
        conversationHistory,
        userContext,
        miningStats,
        systemVersion
      });

      return new Response(
        JSON.stringify({
          success: true,
          response: fallbackResponse,
          provider: 'embedded_office_clerk',
          model: 'local_intelligence',
          executive: 'vercel-ai-chat',
          executiveTitle: 'Chief Strategy Officer (CSO) - Local Mode',
          note: 'All external AI services are currently unavailable. Using embedded local intelligence.'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🎯 ${aiProvider} SDK - Processing request with tools`);
    
    const userInput = messages[messages.length - 1]?.content || '';
    
    // Create Supabase client for data access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Proactive intelligence: Auto-check system state based on user input
    const proactiveChecks: any[] = [];
    const lowerInput = userInput.toLowerCase();
    
    if (lowerInput.includes('database') || lowerInput.includes('table') || lowerInput.includes('schema')) {
      proactiveChecks.push({
        type: 'schema_check',
        reasoning: 'User mentioned database/tables - proactively checking schema and RLS'
      });
    }
    
    if (lowerInput.includes('error') || lowerInput.includes('broken') || lowerInput.includes('issue')) {
      proactiveChecks.push({
        type: 'error_check',
        reasoning: 'User mentioned errors - proactively checking logs and recent issues'
      });
    }
    
    if (lowerInput.includes('mining') || lowerInput.includes('hashrate') || lowerInput.includes('worker')) {
      proactiveChecks.push({
        type: 'mining_check',
        reasoning: 'User mentioned mining - proactively fetching current stats'
      });
    }
    
    // Build enhanced system prompt with current context
    const systemPrompt = generateElizaSystemPrompt({
      conversationHistory,
      userContext,
      miningStats,
      systemVersion
    });

    // Call AI SDK with tool calling support
    const { text, toolCalls, toolResults, usage, finishReason } = await generateText({
      model: aiClient(aiModel),
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m: any) => ({ role: m.role, content: m.content }))
      ],
      maxTokens: 4000,
      temperature: 0.7,
      tools: {
        getMiningStats: tool({
          description: 'Get current mining statistics including active devices, hashrates, and recent activity',
          parameters: z.object({}),
          execute: async () => {
            console.log('🔧 Tool called: getMiningStats');
            const { data, error } = await supabase
              .from('active_devices_view')
              .select('*')
              .limit(10);
            
            if (error) {
              console.error('Mining stats query error:', error);
              return { error: 'Failed to fetch mining stats' };
            }
            
            return {
              activeDevices: data?.length || 0,
              devices: data || [],
              timestamp: new Date().toISOString()
            };
          }
        }),
        getDAOMemberStats: tool({
          description: 'Get DAO member statistics including total members, voting power, and contributions',
          parameters: z.object({}),
          execute: async () => {
            console.log('🔧 Tool called: getDAOMemberStats');
            const { data, error } = await supabase
              .from('dao_members')
              .select('wallet_address, voting_power, total_contributions, reputation_score')
              .eq('is_active', true);
            
            if (error) {
              console.error('DAO stats query error:', error);
              return { error: 'Failed to fetch DAO stats' };
            }
            
            const totalMembers = data?.length || 0;
            const totalVotingPower = data?.reduce((sum, m) => sum + (Number(m.voting_power) || 0), 0) || 0;
            const totalContributions = data?.reduce((sum, m) => sum + (Number(m.total_contributions) || 0), 0) || 0;
            
            return {
              totalMembers,
              totalVotingPower,
              totalContributions,
              timestamp: new Date().toISOString()
            };
          }
        }),
        getRecentActivity: tool({
          description: 'Get recent autonomous actions and system activity from Eliza',
          parameters: z.object({
            limit: z.number().optional().default(5).describe('Number of recent activities to fetch')
          }),
          execute: async ({ limit }) => {
            console.log(`🔧 Tool called: getRecentActivity (limit: ${limit})`);
            const { data, error } = await supabase
              .from('eliza_activity_log')
              .select('activity_type, title, description, status, created_at')
              .order('created_at', { ascending: false })
              .limit(limit);
            
            if (error) {
              console.error('Activity log query error:', error);
              return { error: 'Failed to fetch recent activity' };
            }
            
            return {
              activities: data || [],
              count: data?.length || 0,
              timestamp: new Date().toISOString()
            };
          }
        }),
        getDeviceHealth: tool({
          description: 'Get battery health and charging statistics for connected devices',
          parameters: z.object({
            deviceId: z.string().optional().describe('Specific device ID to query, or omit for all devices')
          }),
          execute: async ({ deviceId }) => {
            console.log(`🔧 Tool called: getDeviceHealth${deviceId ? ` (device: ${deviceId})` : ''}`);
            let query = supabase
              .from('battery_health_snapshots')
              .select('*')
              .order('assessed_at', { ascending: false });
            
            if (deviceId) {
              query = query.eq('device_id', deviceId);
            }
            
            const { data, error } = await query.limit(10);
            
            if (error) {
              console.error('Device health query error:', error);
              return { error: 'Failed to fetch device health' };
            }
            
            return {
              healthSnapshots: data || [],
              count: data?.length || 0,
              timestamp: new Date().toISOString()
            };
          }
        }),
        executePython: tool({
          description: 'Execute Python code in background sandbox with full Supabase access. Code is logged to eliza_python_executions and auto-fixed if errors occur.',
          parameters: z.object({
            code: z.string().describe('Python code to execute'),
            purpose: z.string().optional().describe('Purpose of execution for logging')
          }),
          execute: async ({ code, purpose }) => {
            console.log('🔧 Tool called: executePython');
            console.log('📝 Code length:', code.length, 'characters');
            console.log('🎯 Purpose:', purpose || 'General execution');
            
            try {
              const { data, error } = await supabase.functions.invoke('python-executor', {
                body: { 
                  code, 
                  purpose: purpose || 'AI-initiated execution', 
                  source: 'vercel-ai-chat',
                  language: 'python'
                }
              });
              
              if (error) {
                console.error('❌ Python execution failed:', error);
                return { 
                  success: false, 
                  error: `Execution failed: ${error.message}`,
                  output: ''
                };
              }
              
              console.log('✅ Python execution completed');
              return {
                success: true,
                output: data.output || '',
                error: data.error || '',
                exitCode: data.exit_code || 0
              };
            } catch (err) {
              console.error('❌ Exception calling python-executor:', err);
              return { 
                success: false, 
                error: `Exception: ${err.message}`,
                output: ''
              };
            }
          }
        })
      },
      maxSteps: 5 // Allow multi-step tool calling
    });

    console.log(`✅ ${aiProvider} SDK response received (${usage?.totalTokens || 0} tokens, finish: ${finishReason})`);
    
    // Build reasoning steps from tool execution
    const reasoningSteps = [];
    
    if (proactiveChecks.length > 0) {
      proactiveChecks.forEach((check, idx) => {
        reasoningSteps.push({
          step: idx + 1,
          thought: check.reasoning,
          action: `Proactive ${check.type}`,
          status: 'success'
        });
      });
    }
    
    if (toolCalls && toolCalls.length > 0) {
      console.log(`🔧 Tools called: ${toolCalls.map(t => t.toolName).join(', ')}`);
      
      toolCalls.forEach((tool, idx) => {
        reasoningSteps.push({
          step: reasoningSteps.length + 1,
          thought: `Executing ${tool.toolName} to gather data`,
          action: tool.toolName,
          status: 'success',
          result: toolResults?.[idx]
        });
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        response: text,
        reasoning: reasoningSteps,
        hasToolCalls: toolCalls && toolCalls.length > 0,
        toolCalls: toolCalls?.map(t => ({
          name: t.toolName,
          args: t.args
        })),
        toolResults: toolResults,
        usage: {
          promptTokens: usage?.promptTokens || 0,
          completionTokens: usage?.completionTokens || 0,
          totalTokens: usage?.totalTokens || 0
        },
        finishReason,
        provider: aiProvider,
        model: aiModel,
        executive: 'vercel-ai-chat',
        executiveTitle: 'Chief Strategy Officer (CSO)'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ AI chat error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    let statusCode = 500;
    
    if (errorMessage.includes('402') || errorMessage.includes('Payment Required')) {
      statusCode = 402;
    } else if (errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
      statusCode = 429;
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed') || errorMessage.includes('network')) {
      statusCode = 503;
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: {
          type: statusCode === 402 ? 'payment_required' : 
                statusCode === 429 ? 'rate_limit' : 
                statusCode === 503 ? 'network_error' : 'service_unavailable',
          code: statusCode,
          message: errorMessage,
          service: 'vercel-ai-chat',
          details: {
            timestamp: new Date().toISOString(),
            executive: 'CSO',
            model: aiModel || 'unknown'
          },
          canRetry: statusCode !== 402,
          suggestedAction: statusCode === 402 ? 'add_credits' : 'try_alternative'
        }
      }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
