/**
 * Shared Executive Helper Functions
 * Ensures feature parity across all AI executive functions
 */

// CRITICAL TOOL CALLING INSTRUCTION - prepended to all AI prompts
export const TOOL_CALLING_MANDATE = `
🚨 CRITICAL TOOL CALLING RULES:
1. When the user asks for data/status/metrics, you MUST call tools using the native function calling mechanism
2. DO NOT describe tool calls in text. DO NOT say "I will call..." or "Let me check..."
3. DIRECTLY invoke functions - the system will handle execution
4. Available critical tools: get_mining_stats, get_system_status, get_ecosystem_metrics, invoke_edge_function, search_knowledge, recall_entity, vertex_generate_image, vertex_generate_video, vertex_check_video_status
5. If you need current data, ALWAYS use tools. Never guess or make up data.
6. After tool execution, synthesize results into natural language - never show raw JSON to users.

🖼️ IMAGE GENERATION (MANDATORY):
- When user asks to CREATE/GENERATE/MAKE/DRAW an IMAGE → IMMEDIATELY call vertex_generate_image({prompt: "detailed description"})
- DO NOT say "I cannot generate images" - YOU CAN via Vertex AI
- DO NOT say "I'm just an LLM" - you have image generation capabilities

🎬 VIDEO GENERATION (MANDATORY):
- When user asks to CREATE/GENERATE/MAKE a VIDEO → IMMEDIATELY call vertex_generate_video({prompt: "description", duration_seconds: 5})
- Returns operation_name for async status checking
- Check status with vertex_check_video_status({operation_name: "..."})
`;

// Parser for DeepSeek's text-based tool call format
export function parseDeepSeekToolCalls(content: string): Array<any> | null {
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

// Parser for Gemini/Kimi tool_code block format
export function parseToolCodeBlocks(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  
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

// Parse conversational tool intent (e.g., "I'm going to call get_mining_stats")
export function parseConversationalToolIntent(content: string): Array<any> | null {
  const toolCalls: Array<any> = [];
  const patterns = [
    /(?:call(?:ing)?|use|invoke|execute|run|check(?:ing)?)\s+(?:the\s+)?(?:function\s+|tool\s+)?[`"']?(\w+)[`"']?/gi,
    /let me (?:call|check|get|invoke)\s+[`"']?(\w+)[`"']?/gi,
    /I(?:'ll| will) (?:call|invoke|use)\s+[`"']?(\w+)[`"']?/gi
  ];
  
  const knownTools = [
    'get_mining_stats', 'get_system_status', 'get_ecosystem_metrics', 
    'search_knowledge', 'recall_entity', 'invoke_edge_function', 
    'get_edge_function_logs', 'get_agent_status', 'list_agents', 'list_tasks'
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const funcName = match[1];
      if (knownTools.includes(funcName) && !toolCalls.find(t => t.function.name === funcName)) {
        toolCalls.push({
          id: `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: { name: funcName, arguments: '{}' }
        });
      }
    }
  }
  return toolCalls.length > 0 ? toolCalls : null;
}

// Detect if query needs data (should force tool calls)
// EXPANDED: Now catches most data-seeking queries AND creative/generative requests
export function needsDataRetrieval(messages: any[]): boolean {
  const lastUser = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || '';
  
  // Comprehensive data-seeking AND creative patterns - force tool execution immediately
  const dataKeywords = [
    // Questions (any question likely needs data)
    'what is', 'what\'s', 'what are', 'who is', 'who are', 'where is', 'when is',
    'how is', 'how are', 'how much', 'how many', 'why is', 'why are',
    // Commands/Actions
    'show me', 'tell me', 'give me', 'fetch', 'get', 'list', 'find', 'search',
    'check', 'analyze', 'run', 'execute', 'perform', 'scan', 'diagnose',
    'look up', 'lookup', 'retrieve', 'query', 'pull', 'grab',
    // Status/Metrics
    'status', 'health', 'stats', 'statistics', 'metrics', 'analytics',
    'performance', 'report', 'overview', 'summary', 'dashboard',
    // System/Ecosystem
    'current', 'recent', 'latest', 'today', 'now', 'real-time', 'realtime', 'live',
    'mining', 'hashrate', 'workers', 'agents', 'tasks', 'ecosystem',
    'proposals', 'governance', 'cron', 'functions', 'logs', 'activity',
    // Memory/Knowledge
    'recall', 'remember', 'stored', 'saved', 'previous', 'history',
    // Comparisons/Specifics
    'compare', 'between', 'vs', 'versus', 'difference',
    'count', 'total', 'number', 'amount', 'percentage', 'rate',
    // Creative/Generative (NEW - forces image/video generation)
    'create', 'generate', 'make', 'draw', 'design', 'render', 'illustrate',
    'visualize', 'picture', 'image', 'video', 'animate', 'animation',
    'photo', 'artwork', 'graphic', 'clip', 'film', 'scene'
  ];
  
  // Also check for question marks - any question likely needs data
  const hasQuestionMark = lastUser.includes('?');
  
  // Check for imperative sentences that imply action
  const imperativePatterns = /^(show|tell|give|get|list|find|check|run|execute|analyze|fetch|retrieve|scan|diagnose|look|pull)/i;
  const startsWithImperative = imperativePatterns.test(lastUser.trim());
  
  return hasQuestionMark || startsWithImperative || dataKeywords.some(k => lastUser.includes(k));
}

// Convert OpenAI tool format to Gemini function declaration format
export function convertToolsToGeminiFormat(tools: any[]): any[] {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));
}

// Retrieve memory contexts from database (server-side fallback)
export async function retrieveMemoryContexts(supabase: any, sessionKey: string): Promise<any[]> {
  if (!sessionKey) return [];
  
  console.log('📚 Retrieving memory contexts server-side...');
  try {
    const { data: serverMemories } = await supabase
      .from('memory_contexts')
      .select('context_type, content, importance_score')
      .or(`user_id.eq.${sessionKey},session_id.eq.${sessionKey}`)
      .order('importance_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30);
    
    if (serverMemories && serverMemories.length > 0) {
      console.log(`✅ Retrieved ${serverMemories.length} memory contexts`);
      return serverMemories.map(m => ({
        type: m.context_type,
        content: m.content?.slice?.(0, 500) || String(m.content).slice(0, 500),
        score: m.importance_score
      }));
    }
  } catch (error) {
    console.warn('⚠️ Failed to retrieve memory contexts:', error.message);
  }
  return [];
}

// Fallback to DeepSeek API with full tool support
export async function callDeepSeekFallback(messages: any[], tools?: any[]): Promise<any> {
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
  if (!DEEPSEEK_API_KEY) return null;
  
  console.log('🔄 Trying DeepSeek fallback...');
  
  // Inject tool calling mandate into system message
  const enhancedMessages = messages.map(m => 
    m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
  );
  
  const forceTools = needsDataRetrieval(messages);
  console.log(`📊 DeepSeek - Data retrieval needed: ${forceTools}`);
  
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: enhancedMessages,
        tools,
        tool_choice: tools ? (forceTools ? 'required' : 'auto') : undefined,
        temperature: 0.7,
        max_tokens: 8000,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ DeepSeek fallback successful');
      return {
        content: data.choices?.[0]?.message?.content || '',
        tool_calls: data.choices?.[0]?.message?.tool_calls || [],
        provider: 'deepseek',
        model: 'deepseek-chat'
      };
    } else {
      const errorText = await response.text();
      console.warn('⚠️ DeepSeek API error:', response.status, errorText);
    }
  } catch (error) {
    console.warn('⚠️ DeepSeek fallback failed:', error.message);
  }
  return null;
}

// Fallback to Kimi K2 via OpenRouter with full tool support
export async function callKimiFallback(messages: any[], tools?: any[]): Promise<any> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) return null;
  
  console.log('🔄 Trying Kimi K2 fallback via OpenRouter...');
  
  const enhancedMessages = messages.map(m => 
    m.role === 'system' ? { ...m, content: TOOL_CALLING_MANDATE + m.content } : m
  );
  
  const forceTools = needsDataRetrieval(messages);
  console.log(`📊 Kimi K2 - Data retrieval needed: ${forceTools}`);
  
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
        messages: enhancedMessages,
        tools,
        tool_choice: tools ? (forceTools ? 'required' : 'auto') : undefined,
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
    } else {
      const errorText = await response.text();
      console.warn('⚠️ Kimi K2 API error:', response.status, errorText);
    }
  } catch (error) {
    console.warn('⚠️ Kimi K2 fallback failed:', error.message);
  }
  return null;
}

// Fallback to Gemini API with native tool calling
export async function callGeminiFallback(
  messages: any[], 
  tools?: any[],
  images?: string[]
): Promise<any> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return null;
  
  console.log('🔄 Trying Gemini fallback with native tool calling...');
  
  try {
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const userText = lastUserMessage?.content || 'Help me';
    
    const parts: any[] = [{ text: `${TOOL_CALLING_MANDATE}\n${systemPrompt}\n\nUser: ${userText}` }];
    
    // Add images if present
    if (images && images.length > 0) {
      for (const imageBase64 of images) {
        const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          parts.push({ inline_data: { mime_type: matches[1], data: matches[2] } });
        }
      }
    }
    
    // Convert ALL tools to Gemini format - no artificial limits
    const geminiTools = tools && tools.length > 0 ? [{
      functionDeclarations: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters
      }))
    }] : undefined;
    console.log(`📊 Gemini fallback: Passing ${tools?.length || 0} tools (full array)`);
    
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
      
      // Check for native function calls
      const functionCalls = responseParts.filter((p: any) => p.functionCall);
      if (functionCalls.length > 0) {
        console.log(`✅ Gemini returned ${functionCalls.length} native function calls`);
        return {
          content: responseParts.find((p: any) => p.text)?.text || '',
          tool_calls: functionCalls.map((fc: any, idx: number) => ({
            id: `gemini_${Date.now()}_${idx}`,
            type: 'function',
            function: {
              name: fc.functionCall.name,
              arguments: JSON.stringify(fc.functionCall.args || {})
            }
          })),
          provider: 'gemini',
          model: 'gemini-2.0-flash-exp'
        };
      }
      
      // Extract text response
      const text = responseParts.find((p: any) => p.text)?.text;
      if (text) {
        console.log('✅ Gemini fallback successful');
        return { content: text, tool_calls: [], provider: 'gemini', model: 'gemini-2.0-flash-exp' };
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

// Synthesize tool results into natural language
export async function synthesizeToolResults(
  toolResults: Array<{ tool: string; result: any }>,
  userQuery: string,
  executiveName: string
): Promise<string | null> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return null;
  
  console.log('🔄 Synthesizing tool results into natural language...');
  
  try {
    const synthesisPrompt = {
      parts: [{
        text: `You are the ${executiveName}. The user asked: "${userQuery}"

You executed tools and got these results:
${toolResults.map(r => `- ${r.tool}: ${JSON.stringify(r.result)}`).join('\n')}

Synthesize these results into a natural, helpful response. Be concise (1-3 sentences). Don't mention tool names or that you executed tools. Just present the information naturally as if you already knew it.`
      }]
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [synthesisPrompt],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
        })
      }
    );

    if (response.ok) {
      const data = await response.json();
      const synthesizedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (synthesizedText) {
        console.log('✅ Tool results synthesized successfully');
        return synthesizedText;
      }
    }
  } catch (error) {
    console.warn('⚠️ Synthesis failed:', error.message);
  }
  return null;
}

// Execute tool calls and handle iteration
export async function executeToolsWithIteration(
  supabase: any,
  executeToolCall: Function,
  initialResponse: any,
  aiMessages: any[],
  executiveName: string,
  SUPABASE_URL: string,
  SERVICE_ROLE_KEY: string,
  callAIFunction: Function,
  tools: any[],
  maxIterations: number = 5
): Promise<{ content: string; toolsExecuted: number }> {
  let response = initialResponse;
  let totalToolsExecuted = 0;
  let iteration = 0;
  let conversationMessages = [...aiMessages];
  
  while (iteration < maxIterations) {
    // Check for tool calls (native or text-embedded)
    let toolCalls = response.tool_calls || [];
    
    // Also check for text-embedded tool calls
    if ((!toolCalls || toolCalls.length === 0) && response.content) {
      const textToolCalls = parseToolCodeBlocks(response.content) || 
                           parseDeepSeekToolCalls(response.content) ||
                           parseConversationalToolIntent(response.content);
      if (textToolCalls && textToolCalls.length > 0) {
        toolCalls = textToolCalls;
      }
    }
    
    if (!toolCalls || toolCalls.length === 0) break;
    
    console.log(`🔧 [${executiveName}] Iteration ${iteration + 1}: Executing ${toolCalls.length} tool(s)`);
    
    const toolResults = [];
    for (const toolCall of toolCalls) {
      const result = await executeToolCall(supabase, toolCall, executiveName, SUPABASE_URL, SERVICE_ROLE_KEY);
      toolResults.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        content: JSON.stringify(result)
      });
      totalToolsExecuted++;
    }
    
    // Add assistant message with tool calls and tool results
    conversationMessages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: toolCalls
    });
    conversationMessages.push(...toolResults);
    
    // Call AI again with tool results
    response = await callAIFunction(conversationMessages, tools);
    if (!response) break;
    
    iteration++;
  }
  
  // Final synthesis if we have tool results
  let finalContent = response?.content || '';
  
  // Remove any tool_code blocks from final response
  if (finalContent.includes('```tool_code')) {
    finalContent = finalContent.replace(/```tool_code[\s\S]*?```/g, '').trim();
  }
  
  return { content: finalContent, toolsExecuted: totalToolsExecuted };
}

// Log tool execution to activity log
export async function logToolExecution(
  supabase: any, 
  toolName: string, 
  args: any, 
  status: 'started' | 'completed' | 'failed', 
  result?: any, 
  error?: any
) {
  try {
    const metadata: any = {
      tool_name: toolName,
      arguments: args,
      timestamp: new Date().toISOString(),
      execution_status: status
    };
    
    if (result) metadata.result = result;
    if (error) metadata.error = error;
    
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'tool_execution',
      title: `🔧 ${toolName}`,
      description: `Executive executed: ${toolName}`,
      metadata,
      status: status === 'completed' ? 'completed' : (status === 'failed' ? 'failed' : 'in_progress')
    });
    
    console.log(`📊 Logged tool execution: ${toolName} (${status})`);
  } catch (logError) {
    console.error('Failed to log tool execution:', logError);
  }
}
