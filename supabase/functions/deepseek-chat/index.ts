import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    
    // Generate executive response
    const executiveResponse = `Hello! I'm DeepSeek Executive, your TechLead CTO powered by DeepSeek AI. 

I received your message: "${userMessage}"

I'm focused on deep technical analysis, code architecture, and innovative solutions. I excel at breaking down complex problems and finding efficient approaches.

How can I help you today? I'm ready to assist with:
• Technical Architecture
• Code Review & Optimization 
• AI/ML Implementation

What would you like to work on?`
    
    console.log(`✅ deepseek-chat generated response`)
    
    // Return in expected format
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: executiveResponse,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'deepseek-chat',
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
        error: 'Function error',
        message: error.message,
        executive: 'deepseek-chat'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
