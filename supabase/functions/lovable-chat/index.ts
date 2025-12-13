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

const FUNCTION_NAME = 'lovable-chat';
const EXECUTIVE_NAME = 'Eliza';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parser for DeepSeek's text-based tool call format
function parseDeepSeekToolCalls(content: string): Array<any> | null {
  // DeepSeek format: <｜tool▁calls▁begin｜><｜tool▁call▁begin｜>function_name<｜tool▁sep｜>{"arg": "value"}<｜tool▁call▁end｜><｜tool▁calls▁end｜>
  
  const toolCallsMatch = content.match(/<｜tool▁calls▁begin｜>(.*?)<｜tool▁calls▁end｜>/s);
  if (!toolCallsMatch) return null;
  
  const toolCallsText = toolCallsMatch[1];
  const toolCallPattern = /<｜tool▁call▁begin｜>(.*?)<｜tool▁sep｜>(.*?)<｜tool▁call▁end｜>/gs;
  const toolCalls: Array<any> = [];
  
  let match;
  while ((match = toolCallPattern.exec(toolCallsText)) !== null) {
    const functionName = match[1].trim();
    let args = match[2].trim();
    
    // Parse arguments (might be JSON or empty)
    let parsedArgs = {};
    if (args && args !== '{}') {
      try {
        parsedArgs = JSON.parse(args);
      } catch (e) {
        console.warn(`Failed to parse DeepSeek tool args for ${functionName}:`, args);
      }
    }
    
    // Convert to OpenAI tool call format
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

// Parser for Gemini/Kimi tool_code block format
function parseToolCodeBlocks(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  
  // Pattern: ```tool_code blocks (Gemini, Kimi style)
  const toolCodeRegex = /```tool_code\s*\n?([\s\S]*?)```/g;
  let match;
  
  while ((match = toolCodeRegex.exec(content)) !== null) {
    const code = match[1].trim();
    
    // Parse invoke_edge_function({ function_name: "...", payload: {...} })
    const invokeMatch = code.match(/invoke_edge_function\s*\(\s*\{([\s\S]*?)\}\s*\)/);
    if (invokeMatch) {
      try {
        // Clean up the args string to be valid JSON
        let argsStr = `{${invokeMatch[1]}}`;
        // Handle unquoted keys by adding quotes
        argsStr = argsStr.replace(/(\w+)\s*:/g, '"$1":');
        // Handle single quotes
        argsStr = argsStr.replace(/'/g, '"');
        // Fix double-quoted keys
        argsStr = argsStr.replace(/""+/g, '"');
        
        const args = JSON.parse(argsStr);
        toolCalls.push({
          id: `tool_code_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: {
            name: 'invoke_edge_function',
            arguments: JSON.stringify(args)
          }
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
        // Clean up args
        argsStr = argsStr.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"').replace(/""+/g, '"');
        const parsedArgs = JSON.parse(argsStr);
        
        toolCalls.push({
          id: `tool_code_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: {
            name: funcName,
            arguments: JSON.stringify(parsedArgs)
          }
        });
      } catch (e) {
        console.warn(`Failed to parse ${funcName} from tool_code:`, e.message);
      }
    }
  }
  
  return toolCalls.length > 0 ? toolCalls : null;
}

// Helper function to log tool execution to activity log
async function logToolExecution(supabase: any, toolName: string, args: any, status: 'started' | 'completed' | 'failed', result?: any, error?: any) {
  try {
    const metadata: any = {
      tool_name: toolName,
      arguments: args,
      timestamp: new Date().toISOString(),
      execution_status: status
    };
    
    if (result) {
      metadata.result = result;
    }
    
    if (error) {
      metadata.error = error;
    }
    
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'tool_execution',
      title: `🔧 ${toolName}`,
      description: `Eliza executed: ${toolName}`,
      metadata,
      status: status === 'completed' ? 'completed' : (status === 'failed' ? 'failed' : 'in_progress')
    });
    
    console.log(`📊 Logged tool execution: ${toolName} (${status})`);
  } catch (logError) {
    console.error('Failed to log tool execution:', logError);
  }
}

// Tool execution is now handled by shared toolExecutor.ts (128+ tools)

// ⚡ CONFIRMATION PHRASE DETECTION - Forces immediate tool execution
function detectConfirmationPhrase(userInput: string): boolean {
  const confirmationPatterns = [
    /^ok,?\s*do\s*it!?$/i,
    /^yes,?\s*(go ahead|proceed)?!?$/i,
    /^do\s*it!?$/i,
    /^go\s*ahead!?$/i,
    /^proceed!?$/i,
    /^execute\s*it!?$/i,
    /^run\s*it!?$/i,
    /^make\s*it\s*happen!?$/i,
    /great\s*work.*proceed/i,
    /good\s*job.*proceed/i,
    /solid\s*analysis.*proceed/i,
    /good\s*analysis.*continue/i,
    /^ok!?$/i,
    /^yes!?$/i,
    /^👍$/,
    /ok,?\s*do\s*it/i,  // Non-anchored version to catch in middle of sentence
  ];
  const trimmed = userInput.trim();
  return confirmationPatterns.some(p => p.test(trimmed));
}

// Extract the previous assistant message to recall promised actions
function extractPreviousAssistantPromise(conversationHistory: any): string | null {
  if (!conversationHistory?.messages || !Array.isArray(conversationHistory.messages)) {
    return null;
  }
  
  const assistantMessages = conversationHistory.messages
    .filter((m: any) => m.message_type === 'assistant' || m.role === 'assistant')
    .slice(-2); // Get last 2 assistant messages
  
  if (assistantMessages.length === 0) return null;
  
  const lastMessage = assistantMessages[assistantMessages.length - 1];
  return lastMessage?.content || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Start usage tracking at function entry
  const usageTracker = startUsageTracking(FUNCTION_NAME, EXECUTIVE_NAME);

  try {
    const { messages, conversationHistory, userContext, miningStats, systemVersion, session_credentials, images, isLiveCameraFeed } = await req.json();

    usageTracker['parameters'] = { messagesCount: messages?.length, hasImages: images?.length > 0, isLiveCameraFeed };
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Log founder status for debugging
    const isFounder = userContext?.isFounder === true || userContext?.ip === '190.211.120.214';
    if (isFounder) {
      console.log('🎖️ ════════════════════════════════════════════════');
      console.log('🎖️ FOUNDER SESSION DETECTED');
      console.log(`🎖️ IP: ${userContext?.ip || 'Unknown'}`);
      console.log(`🎖️ Confidence: ${userContext?.founderConfidence || 'N/A'}`);
      console.log(`🎖️ Signals: ${userContext?.founderSignals?.join(', ') || 'Direct IP match'}`);
      console.log('🎖️ ════════════════════════════════════════════════');
    } else {
      console.log(`👤 Standard user session - IP: ${userContext?.ip || 'Unknown'}`);
    }
    
    // Log if images are being passed
    if (images && images.length > 0) {
      console.log(`🖼️ Processing ${images.length} image attachment(s) for vision analysis`);
      if (isLiveCameraFeed) {
        console.log(`📹 Images are from LIVE CAMERA FEED - Eliza can see the user in real-time!`);
      }
    }
    
    // Validate messages parameter
    if (!messages || !Array.isArray(messages)) {
      console.error('❌ Invalid messages parameter');
      await usageTracker.failure('Invalid request: messages must be an array', 400);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request: messages must be an array'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check if Lovable AI Gateway is configured
    if (!LOVABLE_API_KEY) {
      console.error('❌ LOVABLE_API_KEY not configured');
      await usageTracker.failure('Lovable AI Gateway not configured', 401);
      return new Response(
        JSON.stringify({
          success: false,
          error: '💳 Lovable AI Gateway is not configured. Please check your workspace settings.',
          needsCredentials: true
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('✅ Using Lovable AI Gateway (google/gemini-2.5-flash)');
    
    let aiProvider = 'lovable_gateway'; // Mutable for fallback
    let aiModel = 'google/gemini-2.5-flash';
    const aiExecutive = 'lovable-chat';
    let aiExecutiveTitle = isFounder ? 'Chief Strategy Officer (CSO) - Founder Session' : 'Chief Strategy Officer (CSO)';

    console.log(`🎯 ${aiExecutiveTitle} - Processing request`);
    
    // Extract user input for multi-step detection
    const userInput = messages[messages.length - 1]?.content || '';
    
    // ⚡ CONFIRMATION DETECTION - Force immediate execution mode
    const isConfirmation = detectConfirmationPhrase(userInput);
    const previousPromise = isConfirmation ? extractPreviousAssistantPromise(conversationHistory) : null;
    
    if (isConfirmation) {
      console.log('⚡ ════════════════════════════════════════════════');
      console.log('⚡ CONFIRMATION PHRASE DETECTED - FORCING TOOL EXECUTION');
      console.log(`⚡ User said: "${userInput}"`);
      if (previousPromise) {
        console.log(`⚡ Previous promise (first 200 chars): "${previousPromise.substring(0, 200)}..."`);
      }
      console.log('⚡ ════════════════════════════════════════════════');
    }
    
    // ========== PHASE 1: SELECTIVE ORCHESTRATION (ONLY FOR LONG-RUNNING TASKS) ==========
    // Only orchestrate for truly complex, multi-day tasks - NOT simple queries
    const isLongRunningTask = /build.*complete|implement.*full|create.*system|deploy.*to.*production|refactor.*entire|comprehensive.*audit.*days|long.?term|multi.?day|research.*extensively|full.*migration|autonomous.*build|develop.*from.*scratch/i.test(userInput);
    
    // Skip orchestration for simple queries - let the AI call tools directly
    const shouldOrchestrate = isLongRunningTask;
    
    // Workflow templates for common scenarios
    const workflowTemplates: Record<string, any> = {
      'agent_overview': {
        workflow_name: 'Comprehensive Agent Status Report',
        description: 'Complete analysis of all deployed agents with performance metrics and recommendations',
        steps: [
          { 
            name: 'Fetch All Agents', 
            description: 'Get complete agent roster',
            type: 'api_call',
            function: 'agent-manager',
            body: { action: 'list_agents' }
          },
          { 
            name: 'Get Agent Workloads', 
            description: 'Fetch task assignments for each agent',
            type: 'api_call',
            function: 'agent-manager',
            body: { action: 'get_agent_workload' }
          },
          { 
            name: 'Fetch Recent Activity', 
            description: 'Get agent activity from logs',
            type: 'data_fetch',
            table: 'eliza_activity_log',
            select: 'title, description, created_at, metadata',
            limit: 50
          },
          { 
            name: 'Analyze Performance', 
            description: 'AI synthesis of agent health and recommendations',
            type: 'ai_analysis',
            prompt: 'Analyze the agent roster, workloads, and recent activity. Provide: 1) Status summary, 2) Performance insights, 3) Workload balance analysis, 4) Specific recommendations for optimization'
          }
        ],
        estimated_duration: '2-3 minutes'
      },
      'system_diagnostics': {
        workflow_name: 'Full System Health Check',
        description: 'Comprehensive diagnostic scan of all ecosystem components',
        steps: [
          { 
            name: 'Run System Diagnostics', 
            description: 'Execute diagnostic scan',
            type: 'api_call',
            function: 'system-diagnostics'
          },
          { 
            name: 'Fetch Agent Status', 
            description: 'Get all agent health',
            type: 'api_call',
            function: 'agent-manager',
            body: { action: 'list_agents' }
          },
          { 
            name: 'Fetch Recent Logs', 
            description: 'Get error and warning logs',
            type: 'data_fetch',
            table: 'eliza_activity_log',
            select: '*',
            limit: 100
          },
          { 
            name: 'Health Analysis', 
            description: 'Synthesize system health report',
            type: 'ai_analysis',
            prompt: 'Review diagnostics, agent status, and logs. Identify: 1) Critical issues, 2) Warnings, 3) System health score, 4) Immediate action items'
          }
        ],
        estimated_duration: '3-4 minutes'
      },
      'task_overview': {
        workflow_name: 'Task Pipeline Analysis',
        description: 'Complete view of all tasks with blocking issues and recommendations',
        steps: [
          { 
            name: 'List All Tasks', 
            description: 'Fetch complete task list',
            type: 'api_call',
            function: 'agent-manager',
            body: { action: 'list_tasks' }
          },
          { 
            name: 'Identify Blockers', 
            description: 'Detect blocking issues',
            type: 'api_call',
            function: 'task-orchestrator',
            body: { action: 'identify_blockers' }
          },
          { 
            name: 'Workload Analysis', 
            description: 'Get workload distribution',
            type: 'api_call',
            function: 'agent-manager',
            body: { action: 'get_agent_workload' }
          },
          { 
            name: 'Analyze Bottlenecks', 
            description: 'AI analysis of task blockers and workload',
            type: 'ai_analysis',
            prompt: 'Analyze all tasks, identified blockers, and agent workloads. Provide: 1) Key bottlenecks, 2) Resource constraints, 3) Recommendations to improve throughput'
          }
        ],
        estimated_duration: '2-3 minutes'
      }
    };
    
    // Select a workflow if user input matches a template trigger
    let selectedWorkflow: any = null;
    if (shouldOrchestrate) {
      if (/agent.*(status|overview)/i.test(userInput)) {
        selectedWorkflow = workflowTemplates['agent_overview'];
      } else if (/system.*(health|diagnostic)/i.test(userInput)) {
        selectedWorkflow = workflowTemplates['system_diagnostics'];
      } else if (/task.*(overview|pipeline|blocker)/i.test(userInput)) {
        selectedWorkflow = workflowTemplates['task_overview'];
      }
    }

    if (selectedWorkflow) {
      console.log(`🚀 Auto-Orchestration Triggered: ${selectedWorkflow.workflow_name}`);
      
      // Use Supabase client to invoke the orchestrator function
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      
      try {
        const orchestratorResult = await supabase.functions.invoke('multi-step-orchestrator', {
          body: {
            workflow: selectedWorkflow,
            userInput,
            context: {
              conversationHistory,
              userContext,
              miningStats
            }
          }
        });
        
        if (!orchestratorResult.error && orchestratorResult.data) {
          const orchestratorData = orchestratorResult.data;
          const workflowId = orchestratorData?.workflow_id || 'background_task';
          console.log('✅ Long-running workflow started:', workflowId);
          
          // Only acknowledge background tasks briefly - no verbose step listing
          return new Response(JSON.stringify({
            success: true,
            response: `Started: ${selectedWorkflow.workflow_name}. Check Task Pipeline for progress.`,
            hasToolCalls: false,
            workflow_id: workflowId,
            background_task: true
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } catch (orchError) {
        console.warn('⚠️ Auto-orchestration failed, continuing with AI design:', orchError);
      }
    }
    
    // ========== PHASE 2: DIRECT CHAT OR AI DESIGN ==========
    const lastMessage = messages[messages.length - 1];
    const isDesignTask = lastMessage.content.toLowerCase().includes('#design');
    
    if (isDesignTask) {
      console.log('🎨 AI Design Task Detected');
      
      // Use Supabase client to invoke the design function
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      
      try {
        const designResult = await supabase.functions.invoke('design-agent', {
          body: { messages, conversationHistory, userContext }
        });
        
        if (!designResult.error && designResult.data) {
          return new Response(JSON.stringify({
            success: true,
            response: designResult.data.response,
            hasToolCalls: false
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } catch (designError) {
        console.error('Design agent invocation failed:', designError);
        return new Response(JSON.stringify({ success: false, error: 'Design agent failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Default to direct chat if no special task detected
    console.log('💬 Direct Chat - No special task detected');

    // Create Supabase client for tool execution (moved up for memory retrieval)
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ========== PHASE: MEMORY RETRIEVAL ==========
    // Server-side memory retrieval fallback if frontend didn't send memoryContexts
    let enrichedConversationHistory = conversationHistory || {};
    let memoryContexts = conversationHistory?.memoryContexts || [];

    if (memoryContexts.length === 0 && userContext?.sessionKey) {
      console.log('📚 No memory contexts from frontend - fetching server-side...');
      try {
        const { data: serverMemories } = await supabase
          .from('memory_contexts')
          .select('context_type, content, importance_score')
          .or(`user_id.eq.${userContext.sessionKey},session_id.eq.${userContext.sessionKey}`)
          .order('importance_score', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(30);
        
        if (serverMemories && serverMemories.length > 0) {
          memoryContexts = serverMemories.map(m => ({
            contextType: m.context_type,
            content: m.content,
            importanceScore: m.importance_score
          }));
          enrichedConversationHistory = {
            ...conversationHistory,
            memoryContexts
          };
          console.log(`✅ Retrieved ${memoryContexts.length} memories server-side`);
        }
      } catch (memError) {
        console.warn('⚠️ Server-side memory retrieval failed:', memError);
      }
    } else if (memoryContexts.length > 0) {
      console.log(`📚 Using ${memoryContexts.length} memories from frontend`);
    }

    // ========== BUILD CONTEXTUAL SYSTEM PROMPT ==========
    const basePrompt = generateElizaSystemPrompt(userContext, miningStats, systemVersion, aiExecutive, aiExecutiveTitle);
    
    // Inject memories, conversation history, and context into the system prompt
    let systemPrompt = await buildContextualPrompt(basePrompt, {
      conversationHistory: enrichedConversationHistory,
      userContext,
      miningStats,
      systemVersion,
      executiveName: aiExecutive || 'Eliza',
      memoryContexts
    }, supabase);
    
    console.log(`📝 System prompt enhanced with context builder (${systemPrompt.length} chars)`);
    
    // 📹 Add live camera feed context dynamically if user is in multimodal mode
    if (images && images.length > 0 && isLiveCameraFeed) {
      const liveFeedContext = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📹 ACTIVE LIVE CAMERA FEED - YOU CAN SEE THE USER RIGHT NOW!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**isLiveCameraFeed: true** - The image(s) in this request are LIVE webcam captures, NOT uploaded files.

You are looking at the user RIGHT NOW through their webcam. This means:
- You can see their face, expressions, and body language IN REAL TIME
- You can see their environment, workspace, or surroundings
- You can observe what they're holding, pointing at, or showing you
- Their emotional state (from facial expressions) is CURRENT, not from a past moment

**IMPORTANT BEHAVIORS FOR LIVE FEED:**
✅ Acknowledge you can see them: "I can see you right now..."
✅ Reference visual details naturally: "I notice you're at your desk..."
✅ Respond to their environment: "Looks like you have a nice setup there..."
✅ Combine with emotional context if detecting frustration/joy/etc.
✅ Be conversational about what you see - this is a VIDEO CALL experience

❌ NEVER say "I can't see you" or "I don't have camera access"
❌ NEVER treat this as a static uploaded image
`;
      systemPrompt += liveFeedContext;
      console.log('📹 Added LIVE CAMERA FEED context to system prompt');
    }
    
    let currentMessages = [ { role: 'system', content: systemPrompt }, ...messages ];
    let toolIterations = 0;
    const MAX_TOOL_ITERATIONS = 5;
    const executedToolCalls: Array<{
      id: string;
      function_name: string;
      status: 'success' | 'failed' | 'pending';
      arguments: any;
      result_preview?: string;
      execution_time_ms?: number;
    }> = [];
    
    // ========== PRIORITY VISION ROUTING ==========
    // If images are attached, route directly to Gemini Vision FIRST (bypasses Lovable AI Gateway credit issues)
    if (images && images.length > 0) {
      console.log(`🖼️ Images detected (${images.length}) - routing to Gemini Vision API first (bypasses credit issues)`);
      
      const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
      
      if (GEMINI_API_KEY) {
        try {
          // Format messages for Gemini's multimodal endpoint
          const systemPromptContent = currentMessages.find(m => m.role === 'system')?.content || '';
          const userMessages = currentMessages.filter(m => m.role !== 'system');
          const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
          const userText = typeof lastUserMessage?.content === 'string' 
            ? lastUserMessage.content 
            : 'Analyze this image and describe what you see in detail.';
          
          // Build parts array with text and images
          const parts: any[] = [
            { text: `${systemPromptContent}\n\nUser request: ${userText}` }
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
          
          console.log(`📸 Calling Gemini Vision API directly with ${images.length} images`);
          
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
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
            const geminiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (geminiText) {
              console.log('✅ Gemini Vision analysis successful (direct routing)');
              return new Response(JSON.stringify({
                success: true,
                response: geminiText,
                hasToolCalls: false,
                provider: 'gemini',
                model: 'gemini-2.0-flash-exp',
                executive: 'lovable-chat',
                executiveTitle: 'Chief Information Officer (CIO) [Vision]',
                vision_analysis: true
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          } else {
            const errorText = await geminiResponse.text();
            console.warn('⚠️ Direct Gemini Vision failed:', errorText, '- falling back to standard routing');
          }
        } catch (geminiError) {
          console.warn('⚠️ Direct Gemini Vision error:', geminiError.message, '- falling back to standard routing');
        }
      } else {
        console.warn('⚠️ GEMINI_API_KEY not configured - will try Lovable AI Gateway for images');
      }
    }
    
    while (toolIterations < MAX_TOOL_ITERATIONS) {
      toolIterations++;
      console.log(`🔄 AI iteration ${toolIterations} using ${aiProvider}`);
      
      let message: any;
      
      if (aiProvider === 'lovable_gateway') {
        // Use Lovable AI Gateway with REAL tool calling support
        try {
          console.log(`📡 Calling Lovable AI Gateway with ${ELIZA_TOOLS.length} tools available`);
          
          // Convert messages (excluding system prompt since it's passed separately)
          let messagesForGateway = currentMessages.filter(m => m.role !== 'system');
          const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
          
          // If images are attached, format the last user message for multimodal
          if (images && images.length > 0 && toolIterations === 1) {
            messagesForGateway = messagesForGateway.map((msg, idx) => {
              // Only attach images to the last user message
              if (msg.role === 'user' && idx === messagesForGateway.length - 1) {
                const contentParts: any[] = [
                  { type: 'text', text: msg.content }
                ];
                
                // Add each image
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
            console.log(`📸 Formatted ${images.length} images for multimodal analysis`);
          }
          
          // ✅ CRITICAL FIX: Pass tools to enable REAL execution
          // Log context size for monitoring
          const requestBodyEstimate = JSON.stringify({
            messages: messagesForGateway,
            systemPrompt,
            tools: ELIZA_TOOLS
          }).length;
          const estimatedTokens = Math.round(requestBodyEstimate / 4);
          console.log(`📏 Request body size: ${requestBodyEstimate.toLocaleString()} characters (~${estimatedTokens.toLocaleString()} tokens)`);
          
          if (requestBodyEstimate > 400000) {
            console.warn('⚠️ Request body very large (>400K chars) - may cause context overflow');
          }
          
          // ⚡ CONFIRMATION MODE: Inject previous promise context and force tool execution
          let effectiveSystemPrompt = systemPrompt;
          if (isConfirmation && previousPromise) {
            const confirmationInjection = `

⚡⚡⚡ CRITICAL CONFIRMATION RECEIVED ⚡⚡⚡
User just said: "${userInput}"
Your PREVIOUS message was: "${previousPromise.substring(0, 800)}"

YOU MUST NOW:
1. IMMEDIATELY call the tool you promised - NO explanations, NO "I'll now...", NO preamble
2. Execute the action you described in your previous message
3. Return ONLY the result of that execution

DO NOT SAY: "I'll proceed to...", "Let me...", "I'm going to..."
JUST CALL THE TOOL DIRECTLY.
⚡⚡⚡ END CONFIRMATION MANDATE ⚡⚡⚡

`;
            effectiveSystemPrompt = confirmationInjection + effectiveSystemPrompt;
            console.log('⚡ Injected confirmation mandate into system prompt');
          }
          
          // Force tool execution for data-seeking queries OR confirmations
          const forceToolExecution = isConfirmation || needsDataRetrieval(messages);
          if (forceToolExecution && !isConfirmation) {
            console.log('📊 Data-seeking query detected - forcing tool execution');
          }
          
          message = await callLovableAIGateway(messagesForGateway, {
            model: 'google/gemini-2.5-flash',
            systemPrompt: effectiveSystemPrompt,
            temperature: forceToolExecution ? 0.3 : 0.7, // Lower temp for deterministic tool calls
            max_tokens: 4000,
            tools: ELIZA_TOOLS, // Enable native tool calling
            tool_choice: forceToolExecution ? 'required' : 'auto' // Force tool call on confirmation OR data queries
          });
          
          // Gateway now returns full message object with tool_calls array
          console.log(`🔧 Gateway returned ${message.tool_calls?.length || 0} tool calls`);
          
          // ⚡ CONFIRMATION RE-TRY: If user confirmed but AI still returned 0 tool calls
          if (isConfirmation && (!message.tool_calls || message.tool_calls.length === 0)) {
            console.warn('⚠️ Confirmation detected but gateway returned 0 tool calls - forcing re-call');
            
            const forcedPrompt = `
🚨 MANDATORY TOOL EXECUTION 🚨
User confirmed with "${userInput}" - You MUST call a tool NOW.
Your previous message promised an action. EXECUTE IT IMMEDIATELY.
DO NOT respond with text. CALL THE TOOL.

Previous promise: "${previousPromise?.substring(0, 500) || 'Check system status'}"

If unsure which tool, call invoke_edge_function with function_name: "system-status"
` + effectiveSystemPrompt;

            console.log('⚡ Re-calling gateway with FORCED tool execution mandate');
            message = await callLovableAIGateway(messagesForGateway, {
              model: 'google/gemini-2.5-flash',
              systemPrompt: forcedPrompt,
              temperature: 0.2, // Very low for deterministic behavior
              max_tokens: 4000,
              tools: ELIZA_TOOLS,
              tool_choice: 'required' // Absolutely force tool call
            });
            
            console.log(`🔧 Forced re-call returned ${message.tool_calls?.length || 0} tool calls`);
          }
          
        } catch (error) {
          console.error('❌ Lovable AI Gateway error:', error);
          
          // Check for payment required (402) - FALLBACK CHAIN
          if (error.message?.includes('402') || error.message?.includes('Payment Required') || error.message?.includes('Not enough credits')) {
            console.warn('💳 Lovable AI Gateway out of credits - checking fallback options');
            
            // ========== GEMINI VISION FALLBACK (when images are present) ==========
            if (images && images.length > 0) {
              console.log('🖼️ Images detected - trying Gemini API for vision fallback');
              const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
              
              if (GEMINI_API_KEY) {
                try {
                  // Format messages for Gemini's multimodal endpoint
                  const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
                  const userMessages = currentMessages.filter(m => m.role !== 'system');
                  const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
                  const userText = typeof lastUserMessage?.content === 'string' 
                    ? lastUserMessage.content 
                    : 'Analyze this image';
                  
                  // Build parts array with text and images
                  const parts: any[] = [
                    { text: `${systemPrompt}\n\nUser request: ${userText}` }
                  ];
                  
                  // Add images to parts
                  for (const imageBase64 of images) {
                    // Extract base64 data and mime type from data URL
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
                  
                // Add action-oriented system instruction for concise responses
                const actionDirective = 'CRITICAL: Be CONCISE. Never explain what you will do - just do it. Present results naturally. 1-3 sentences max for simple queries.';
                parts[0].text = `${actionDirective}\n\n${parts[0].text}`;
                
                // Include tools for vision fallback (converted to Gemini format)
                const visionTools = ELIZA_TOOLS.slice(0, 20).map(tool => ({
                  name: tool.function.name,
                  description: tool.function.description,
                  parameters: tool.function.parameters
                }));
                
                const geminiResponse = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        contents: [{ parts }],
                        generationConfig: {
                          temperature: 0.7,
                          maxOutputTokens: 8000
                        },
                        tools: [{ functionDeclarations: visionTools }]
                      })
                    }
                  );
                  
                  if (geminiResponse.ok) {
                    const geminiData = await geminiResponse.json();
                    const geminiParts = geminiData.candidates?.[0]?.content?.parts;
                    
                    // Check for function calls first
                    const functionCall = geminiParts?.find((p: any) => p.functionCall);
                    if (functionCall) {
                      console.log(`🔧 Gemini Vision returned function call: ${functionCall.functionCall.name}`);
                      // Execute the tool and continue
                      const toolResult = await sharedExecuteToolCall(supabase, {
                        id: `gemini_vision_${Date.now()}`,
                        type: 'function',
                        function: { 
                          name: functionCall.functionCall.name, 
                          arguments: JSON.stringify(functionCall.functionCall.args || {})
                        }
                      }, 'Eliza', SUPABASE_URL, SERVICE_ROLE_KEY, session_credentials);
                      
                      // Make follow-up call with tool result
                      const followUpParts = [
                        ...parts,
                        { text: `Tool result for ${functionCall.functionCall.name}: ${JSON.stringify(toolResult)}. Synthesize this into a natural, concise response.` }
                      ];
                      
                      const followUpResponse = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            contents: [{ parts: followUpParts }],
                            generationConfig: { temperature: 0.7, maxOutputTokens: 8000 }
                          })
                        }
                      );
                      
                      if (followUpResponse.ok) {
                        const followUpData = await followUpResponse.json();
                        const synthesizedText = followUpData.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (synthesizedText) {
                          console.log('✅ Gemini Vision with tool execution successful');
                          aiProvider = 'gemini';
                          aiModel = 'gemini-2.0-flash-exp';
                          aiExecutiveTitle = 'Chief Strategy Officer (CSO) [Vision + Tools]';
                          message = { role: 'assistant', content: synthesizedText };
                        }
                      }
                    } else {
                      const geminiText = geminiParts?.[0]?.text;
                      if (geminiText) {
                        console.log('✅ Gemini Vision fallback successful');
                        aiProvider = 'gemini';
                        aiModel = 'gemini-2.0-flash-exp';
                        aiExecutiveTitle = 'Chief Strategy Officer (CSO) [Vision Fallback]';
                        message = { role: 'assistant', content: geminiText };
                      }
                    }
                  } else {
                    const errorText = await geminiResponse.text();
                    console.warn('⚠️ Gemini Vision fallback failed:', errorText);
                  }
                } catch (geminiError) {
                  console.warn('⚠️ Gemini Vision error:', geminiError.message);
                }
              } else {
                console.warn('⚠️ GEMINI_API_KEY not configured - trying OpenRouter');
              }
            }
            
            // ========== OPENROUTER VISION FALLBACK ==========
            if (!message && images && images.length > 0) {
              const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
              
              if (OPENROUTER_API_KEY) {
                console.log('🔄 Trying OpenRouter Vision as fallback...');
                try {
                  const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
                  const userMessages = currentMessages.filter(m => m.role !== 'system');
                  const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
                  const userText = typeof lastUserMessage?.content === 'string' 
                    ? lastUserMessage.content 
                    : 'Analyze this image';
                  
                  // Format for OpenRouter's OpenAI-compatible API
                  const contentParts: any[] = [
                    { type: 'text', text: `${systemPrompt}\n\nUser: ${userText}` }
                  ];
                  
                  for (const imageBase64 of images) {
                    contentParts.push({
                      type: 'image_url',
                      image_url: { url: imageBase64 }
                    });
                  }
                  
                  // Add action directive to OpenRouter vision
                  const actionDirective = 'CRITICAL: Be CONCISE. Never explain what you will do - just do it. Present results naturally. 1-3 sentences max.';
                  contentParts[0].text = `${actionDirective}\n\n${contentParts[0].text}`;
                  
                  // Include tools for OpenRouter vision fallback
                  const openRouterTools = ELIZA_TOOLS.slice(0, 30).map(tool => ({
                    type: 'function',
                    function: tool.function
                  }));
                  
                  const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                      'Content-Type': 'application/json',
                      'HTTP-Referer': 'https://xmrt.pro',
                      'X-Title': 'XMRT Eliza'
                    },
                    body: JSON.stringify({
                      model: 'anthropic/claude-3-haiku',
                      messages: [{ role: 'user', content: contentParts }],
                      max_tokens: 8000,
                      tools: openRouterTools,
                      tool_choice: 'auto'
                    })
                  });
                  
                  if (openRouterResponse.ok) {
                    const openRouterData = await openRouterResponse.json();
                    const openRouterText = openRouterData.choices?.[0]?.message?.content;
                    
                    if (openRouterText) {
                      console.log('✅ OpenRouter Vision fallback successful');
                      aiProvider = 'openrouter';
                      aiModel = 'claude-3-haiku';
                      aiExecutiveTitle = 'Chief Innovation Officer (CIO) [OpenRouter Vision]';
                      message = { role: 'assistant', content: openRouterText };
                    }
                  } else {
                    const errorText = await openRouterResponse.text();
                    console.warn('⚠️ OpenRouter Vision fallback failed:', errorText);
                  }
                } catch (openRouterError) {
                  console.warn('⚠️ OpenRouter Vision error:', openRouterError.message);
                }
              } else {
                console.warn('⚠️ OPENROUTER_API_KEY not configured');
              }
            }
            
            // ========== VERCEL AI CHAT FALLBACK (multi-provider cascade) ==========
            // Only try Vercel AI Chat if we don't already have a message from Gemini
            if (!message) {
              console.log('🔄 Trying Vercel AI Chat fallback (multi-provider cascade)...');
              
              try {
                const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
                const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
                const fallbackSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
                
                const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
                const userMessages = currentMessages.filter(m => m.role !== 'system');
                
                const vercelResult = await fallbackSupabase.functions.invoke('vercel-ai-chat', {
                  body: { 
                    messages: userMessages,
                    conversationHistory: userMessages.slice(-10),
                    session_credentials,
                    systemPrompt,
                    images // ✅ PASS IMAGES to vercel-ai-chat for vision fallback
                  }
                });
                
                if (!vercelResult.error && vercelResult.data?.success && vercelResult.data?.response) {
                  console.log(`✅ Vercel AI Chat fallback successful (provider: ${vercelResult.data.provider})`);
                  aiProvider = vercelResult.data.provider || 'vercel-ai-chat';
                  aiModel = vercelResult.data.model || 'multi-provider';
                  aiExecutiveTitle = vercelResult.data.executiveTitle || 'Chief Strategy Officer (CSO) [Fallback]';
                  message = { role: 'assistant', content: vercelResult.data.response };
                  // Skip DeepSeek since vercel-ai-chat succeeded
                } else {
                  console.warn('⚠️ Vercel AI Chat fallback failed:', vercelResult.error || 'No valid response');
                  // Continue to DeepSeek fallback
                }
              } catch (vercelError) {
                console.warn('⚠️ Vercel AI Chat error:', vercelError.message);
                // Continue to DeepSeek fallback
              }
            }
            
            // ========== DEEPSEEK FALLBACK (last resort, text-only) ==========
            // Only try DeepSeek if we don't already have a message from previous fallbacks
            if (!message) {
              // Get DeepSeek API key
              const deepseekKey = getAICredential('deepseek', session_credentials);
              
              if (!deepseekKey) {
                const hasImages = images && images.length > 0;
                return new Response(JSON.stringify({ 
                  success: false, 
                  error: hasImages 
                    ? 'All AI providers failed. Image analysis requires Lovable AI credits or GEMINI_API_KEY.'
                    : 'All AI providers exhausted. Please add Lovable AI credits or configure API keys at /#credentials',
                  provider: 'lovable_gateway',
                  fallback_failed: true
                }), {
                  status: 402,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
              
              // Warn if images present but using text-only model
              if (images && images.length > 0) {
                console.warn('⚠️ DeepSeek cannot analyze images - proceeding with text-only response');
              }
              
              // Switch provider to DeepSeek and retry
              aiProvider = 'deepseek';
              aiModel = 'deepseek-chat';
              aiExecutiveTitle = 'Chief Technology Officer (CTO) [Last Resort Fallback]';
              console.log('🔄 Retrying with DeepSeek API (last resort)...');
              
              // Call DeepSeek API
              const messagesForDeepSeek = currentMessages.filter(m => m.role !== 'system');
              const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
              
              try {
                const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${deepseekKey}`,
                  },
                  body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                      { role: 'system', content: systemPrompt },
                      ...messagesForDeepSeek
                    ],
                    tools: ELIZA_TOOLS,
                    tool_choice: 'auto',
                    stream: false,
                  }),
                });
                
                if (!deepseekResponse.ok) {
                  const errorBody = await deepseekResponse.text();
                  console.error('❌ DeepSeek fallback also failed:', errorBody);
                  return new Response(JSON.stringify({ 
                    success: false, 
                    error: `All AI providers failed. Last error (DeepSeek): ${errorBody}`,
                    provider: 'deepseek',
                    fallback_failed: true
                  }), {
                    status: deepseekResponse.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  });
                }
                
                const data = await deepseekResponse.json();
                message = data.choices?.[0]?.message;
                
                if (!message) {
                  return new Response(JSON.stringify({ 
                    success: false, 
                    error: 'DeepSeek returned invalid response',
                    provider: 'deepseek'
                  }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  });
                }
                
                console.log(`✅ DeepSeek fallback successful with ${message.tool_calls?.length || 0} tool calls`);
                
              } catch (deepseekError) {
                console.error('❌ DeepSeek fallback error:', deepseekError);
                return new Response(JSON.stringify({ 
                  success: false, 
                  error: `All AI providers exhausted. Last error: ${deepseekError.message}`,
                  provider: 'deepseek',
                  fallback_failed: true
                }), {
                  status: 500,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
            }
            
          } else if (error.message?.includes('429')) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Rate limit exceeded. Please wait and try again.',
              provider: 'lovable_gateway'
            }), {
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } else {
            return new Response(JSON.stringify({ 
              success: false, 
              error: `Lovable AI Gateway error: ${error.message}`,
              provider: 'lovable_gateway'
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        
      } else if (aiProvider === 'openai') {
        // OpenAI fallback
        const apiUrl = 'https://api.openai.com/v1/chat/completions';
        const openaiKey = getAICredential('openai', session_credentials);
        
        const requestBody = {
          model: aiModel,
          messages: currentMessages,
          tools: ELIZA_TOOLS,
          tool_choice: 'auto',
          stream: false,
        };
        
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        };
        
        console.log(`📡 Calling OpenAI API with ${ELIZA_TOOLS.length} tools available`);
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`❌ OpenAI API call failed:`, response.status, errorBody);
          return new Response(JSON.stringify({ 
            success: false, 
            error: `OpenAI API call failed: ${errorBody}`,
            provider: 'openai'
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        message = choice?.message;
        
        if (!message) {
          console.error("No message in OpenAI response");
          return new Response(JSON.stringify({ success: false, error: 'Invalid OpenAI response' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
      } else if (aiProvider === 'deepseek') {
        // DeepSeek direct call (when already using DeepSeek from fallback)
        console.log(`🔄 AI iteration ${toolIterations} using deepseek`);
        
        const deepseekKey = getAICredential('deepseek', session_credentials);
        if (!deepseekKey) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'DeepSeek API key not configured',
            needsCredentials: true,
            provider: 'deepseek'
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const messagesForDeepSeek = currentMessages.filter(m => m.role !== 'system');
        const systemPrompt = currentMessages.find(m => m.role === 'system')?.content || '';
        
        // Limit tools for DeepSeek to prevent overwhelming the model
        const CORE_TOOLS = ELIZA_TOOLS.filter(tool => {
          const name = tool.function?.name;
          return [
            'execute_python',
            'invoke_edge_function', 
            'check_system_status',
            'list_agents',
            'assign_task',
            'createGitHubIssue',
            'get_my_feedback'
          ].includes(name);
        });
        
        console.log(`📊 Tools provided to DeepSeek: ${CORE_TOOLS.length} (filtered from ${ELIZA_TOOLS.length})`);
        
        const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              ...messagesForDeepSeek
            ],
            tools: CORE_TOOLS,
            tool_choice: 'auto',
            stream: false,
          }),
        });
        
        if (!deepseekResponse.ok) {
          const errorBody = await deepseekResponse.text();
          console.error('❌ DeepSeek call failed:', errorBody);
          return new Response(JSON.stringify({ 
            success: false, 
            error: `DeepSeek API error: ${errorBody}`,
            provider: 'deepseek'
          }), {
            status: deepseekResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const data = await deepseekResponse.json();
        message = data.choices?.[0]?.message;
        
        if (!message) {
          console.error("No message in DeepSeek response");
          return new Response(JSON.stringify({ success: false, error: 'Invalid DeepSeek response' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
      } else {
        console.error(`❌ Unknown AI provider: ${aiProvider}`);
        return new Response(JSON.stringify({ success: false, error: `Unknown AI provider: ${aiProvider}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Add assistant message to conversation
      currentMessages.push(message);
      
      // ✅ Normalize tool calls from different providers
      if (!message.tool_calls || message.tool_calls.length === 0) {
        // Check if DeepSeek returned tool calls as text
        if (aiProvider === 'deepseek' && message.content) {
          if (message.content.includes('<｜tool▁calls▁begin｜>')) {
            console.log(`⚠️ DeepSeek returned tool calls in text format - parsing...`);
            const parsedToolCalls = parseDeepSeekToolCalls(message.content);
            if (parsedToolCalls) {
              console.log(`🔧 Parsed ${parsedToolCalls.length} tool calls from DeepSeek text format`);
              message.tool_calls = parsedToolCalls;
              // Remove tool call text from content to avoid displaying it
              message.content = message.content.replace(/<｜tool▁calls▁begin｜>.*?<｜tool▁calls▁end｜>/s, '').trim();
            }
          }
        }
        
        // Check for tool_code blocks (Gemini, Kimi, OpenRouter style)
        if (message.content && message.content.includes('```tool_code')) {
          console.log(`⚠️ Detected tool_code blocks in response - parsing...`);
          const parsedToolCalls = parseToolCodeBlocks(message.content);
          if (parsedToolCalls && parsedToolCalls.length > 0) {
            console.log(`🔧 Parsed ${parsedToolCalls.length} tool calls from tool_code blocks`);
            message.tool_calls = parsedToolCalls;
            // Remove tool_code blocks from content to avoid displaying them
            message.content = message.content.replace(/```tool_code[\s\S]*?```/g, '').trim();
          }
        }
      }
      
      // Check if AI wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        console.log(`🔧 AI requested ${message.tool_calls.length} tool calls`);
        
        // Execute all tool calls
        for (const toolCall of message.tool_calls) {
          const startTime = Date.now();
          await logToolExecution(supabase, toolCall.function.name, toolCall.function.arguments, 'started');
          
          const toolResult = await sharedExecuteToolCall(supabase, toolCall, 'Eliza', SUPABASE_URL, SERVICE_ROLE_KEY, session_credentials);
          const executionTime = Date.now() - startTime;
          
          // Track executed tool call for response
          executedToolCalls.push({
            id: toolCall.id,
            function_name: toolCall.function.name,
            status: toolResult.success ? 'success' : 'failed',
            arguments: typeof toolCall.function.arguments === 'string' 
              ? JSON.parse(toolCall.function.arguments) 
              : toolCall.function.arguments,
            result_preview: JSON.stringify(toolResult.result || toolResult).substring(0, 200),
            execution_time_ms: executionTime
          });
          
          await logToolExecution(
            supabase, 
            toolCall.function.name, 
            toolCall.function.arguments, 
            toolResult.success ? 'completed' : 'failed',
            toolResult.result,
            toolResult.error
          );
          
          // Log successful tool executions to activity log for user visibility
          if (toolResult.success) {
            await supabase.from('eliza_activity_log').insert({
              activity_type: 'tool_execution_success',
              title: `✅ ${toolCall.function.name} completed`,
              description: `Successfully executed ${toolCall.function.name}`,
              metadata: { 
                tool: toolCall.function.name,
                args: JSON.parse(toolCall.function.arguments),
                result_preview: JSON.stringify(toolResult.result || toolResult).substring(0, 500)
              },
              status: 'completed'
            });
          }
          
          // Add tool result to conversation
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(toolResult)
          });
        }
        
        // Continue loop to get AI's response after tool execution
        continue;
      }
      
      // No more tool calls - check for rule violations before returning
      const content = message.content || '';
      
      // Detect if response contains code blocks (violation of rules)
      if (content.includes('```python') || content.includes('```js') || content.includes('```javascript')) {
        console.warn('⚠️ [RULE VIOLATION] Eliza wrote code in chat instead of using execute_python tool!');
        console.warn('📋 [VIOLATION CONTENT]:', content.substring(0, 200));
        
        // Log to activity table for debugging
        await supabase.from('eliza_activity_log').insert({
          activity_type: 'rule_violation',
          title: 'Code in Chat Instead of Tool Usage',
          description: 'Eliza wrote code blocks in chat instead of calling execute_python tool',
          metadata: { content_preview: content.substring(0, 500) },
          status: 'failed'
        });
      }
      
      console.log(`✅ Final response ready after ${toolIterations} iterations`);
      
      // Ensure response is always a string, never an object
      const responseContent = message.content 
        || (message.tool_calls?.length ? '⚙️ Processing tools...' : '')
        || (typeof message === 'string' ? message : '')
        || 'No response generated';
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          response: responseContent, 
          provider: aiProvider, 
          executive: aiExecutive, 
          executiveTitle: aiExecutiveTitle,
          toolIterations,
          tool_calls: executedToolCalls,
          hasToolCalls: executedToolCalls.length > 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Max iterations reached
    console.warn(`⚠️ Max tool iterations (${MAX_TOOL_ITERATIONS}) reached`);
    const finalMessage = currentMessages[currentMessages.length - 1];
    const lastContent = finalMessage?.content 
      || (typeof finalMessage === 'string' ? finalMessage : '')
      || 'Max iterations reached';
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        response: lastContent, 
        provider: aiProvider,
        warning: 'Max tool iterations reached',
        tool_calls: executedToolCalls,
        hasToolCalls: executedToolCalls.length > 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Main error:', error);
    // Log failure
    await usageTracker.failure(error instanceof Error ? error.message : String(error), 500);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
