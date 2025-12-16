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
    
    console.log(`📞 gemini-chat received:`, userMessage.substring(0, 50))
    
    // Generate executive response
    const executiveResponse = `Hello! I'm Gemini Assistant, your Strategic Advisor powered by Google Gemini. 

I received your message: "${userMessage}"

I'm your strategic thinking partner, great at analyzing multiple perspectives and providing comprehensive insights on complex decisions.

How can I help you today? I'm ready to assist with:
• Strategic Planning
• Market Analysis 
• Creative Problem Solving

What would you like to work on?`
    
    console.log(`✅ gemini-chat generated response`)
    
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
        executive: 'gemini-chat',
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
    
  } catch (error) {
    console.error(`💥 gemini-chat error:`, error.message)
    
    return new Response(
      JSON.stringify({
        error: 'Function error',
        message: error.message,
        executive: 'gemini-chat'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
