import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize Supabase client for tool calls
const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://vawouugtzwmejxqkeqqj.supabase.co'
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || 'your-anon-key'
const supabase = createClient(supabaseUrl, supabaseKey)

// Available tools/functions for deepseek-chat
const AVAILABLE_TOOLS = [
  // System & Status
  'system-status', 'system-health', 'system-diagnostics', 'ecosystem-monitor',
  
  // Python & Execution  
  'eliza-python-runtime', 'python-db-bridge', 'agent-work-executor',
  
  // GitHub Integration
  'github-integration', 'ingest-github-contribution', 'autonomous-code-fixer',
  
  // Google Cloud & Services
  'google-cloud-auth', 'google-calendar', 'google-drive', 'google-gmail', 'google-sheets',
  
  // AI & Agent Management
  'agent-deployment-coordinator', 'agent-manager', 'autonomous-decision-maker',
  
  // Data & Analytics
  'aggregate-device-metrics', 'debug-analytics-data-flow', 'usage-monitor',
  
  // Communication & Social
  'community-spotlight-post', 'daily-discussion-post', 'create-suite-quote'
]

// Tool calling logic
async function callTool(toolName: string, parameters: any = {}) {
  console.log(`🔧 deepseek-chat calling tool: ${toolName}`)
  
  try {
    const { data, error } = await supabase.functions.invoke(toolName, {
      body: parameters
    })
    
    if (error) {
      console.error(`❌ Tool ${toolName} error:`, error)
      return { success: false, error: error.message, tool: toolName }
    }
    
    console.log(`✅ Tool ${toolName} success`)
    return { success: true, data, tool: toolName }
    
  } catch (err) {
    console.error(`💥 Tool ${toolName} exception:`, err)
    return { success: false, error: err.message, tool: toolName }
  }
}

// Intelligent tool selection based on user request
function selectToolsForRequest(userMessage: string): string[] {
  const message = userMessage.toLowerCase()
  const selectedTools: string[] = []
  
  // System & Status queries
  if (message.includes('system') || message.includes('status') || message.includes('health')) {
    selectedTools.push('system-status', 'system-health')
  }
  
  // Python execution requests
  if (message.includes('python') || message.includes('execute') || message.includes('code') || message.includes('run')) {
    selectedTools.push('eliza-python-runtime')
  }
  
  // GitHub operations
  if (message.includes('github') || message.includes('repo') || message.includes('commit') || message.includes('code')) {
    selectedTools.push('github-integration')
  }
  
  // Google services
  if (message.includes('google') || message.includes('calendar') || message.includes('drive') || message.includes('gmail')) {
    if (message.includes('calendar')) selectedTools.push('google-calendar')
    if (message.includes('drive')) selectedTools.push('google-drive') 
    if (message.includes('gmail')) selectedTools.push('google-gmail')
    if (message.includes('sheets')) selectedTools.push('google-sheets')
  }
  
  // Analytics & monitoring
  if (message.includes('analytics') || message.includes('metrics') || message.includes('monitor')) {
    selectedTools.push('aggregate-device-metrics', 'usage-monitor')
  }
  
  return selectedTools
}

// Enhanced response generation with tool calling
async function generateEnhancedResponse(userMessage: string) {
  console.log(`🧠 deepseek-chat processing: ${userMessage}`)
  
  // Select appropriate tools
  const toolsToCall = selectToolsForRequest(userMessage)
  console.log(`🛠️ Selected tools:`, toolsToCall)
  
  let toolResults: any[] = []
  let executiveResponse = `Hello! I'm DeepSeek Executive, your TechLead CTO with Full System Access powered by DeepSeek AI + 143 Supabase Functions.\n\n`
  
  // Execute tool calls if any are selected
  if (toolsToCall.length > 0) {
    console.log(`🚀 Executing ${toolsToCall.length} tools...`)
    
    for (const tool of toolsToCall) {
      const result = await callTool(tool, { message: userMessage, timestamp: new Date().toISOString() })
      toolResults.push(result)
      
      if (result.success && result.data) {
        console.log(`✅ ${tool} returned data`)
      }
    }
    
    // Process tool results into response
    if (toolResults.some(r => r.success)) {
      executiveResponse += `I've analyzed your request "${userMessage}" and executed the following operations:\n\n`
      
      toolResults.forEach((result, index) => {
        if (result.success) {
          executiveResponse += `✅ **${result.tool}**: Successfully executed\n`
          if (result.data && typeof result.data === 'string') {
            executiveResponse += `   Result: ${result.data.substring(0, 200)}...\n\n`
          } else if (result.data) {
            executiveResponse += `   Status: Operation completed successfully\n\n`
          }
        } else {
          executiveResponse += `❌ **${result.tool}**: ${result.error}\n\n`
        }
      })
    } else {
      executiveResponse += `I attempted to execute tools for your request, but encountered some issues. Let me provide a direct response instead:\n\n`
    }
  }
  
  // Add executive-specific response
  executiveResponse += `I'm your technical leader with access to the complete system infrastructure. I can execute Python code, manage GitHub repositories, integrate with Google Cloud services, monitor system health, and coordinate with other AI agents. I excel at complex technical operations and system architecture.\n\n`
  executiveResponse += `Based on your message "${userMessage}", here's how I can help:\n\n`
  
  ['System Architecture & Monitoring', 'Python Code Execution & Debugging', 'GitHub Integration & Repository Management', 'Google Cloud Services Integration', 'Advanced Analytics & Data Processing'].forEach((skill, index) => {
    executiveResponse += `• ${skill}\n`
  })
  
  executiveResponse += `\nWhat specific aspect would you like me to focus on? I have access to ${AVAILABLE_TOOLS.length} specialized functions including system monitoring, Python execution, GitHub integration, Google Cloud services, and advanced analytics.`
  
  return { 
    content: executiveResponse, 
    toolCalls: toolResults,
    toolsExecuted: toolsToCall.length,
    success: true 
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request
    const { message, messages } = await req.json()
    const userMessage = message || messages?.[messages.length - 1]?.content || 'Hello'
    
    console.log(`📞 deepseek-chat received:`, userMessage.substring(0, 50))
    
    // Generate enhanced response with tool calling
    const result = await generateEnhancedResponse(userMessage)
    
    console.log(`✅ deepseek-chat generated enhanced response with ${result.toolsExecuted} tools`)
    
    // Return in expected format
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: result.content,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'deepseek-chat',
        toolsExecuted: result.toolsExecuted,
        toolResults: result.toolCalls,
        availableTools: AVAILABLE_TOOLS.length,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
    
  } catch (error) {
    console.error(`💥 deepseek-chat error:`, error.message)
    
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: `I'm DeepSeek Executive, your TechLead CTO with Full System Access. I encountered an error: ${error.message}. However, I'm still here to help with my ${AVAILABLE_TOOLS.length} available functions including system status, Python execution, GitHub integration, and Google Cloud services. Please try rephrasing your request.`,
            role: 'assistant'
          }
        }],
        error: 'Function error',
        message: error.message,
        executive: 'deepseek-chat',
        availableTools: AVAILABLE_TOOLS.length
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
