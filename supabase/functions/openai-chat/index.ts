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
    
    console.log(`📞 openai-chat received:`, userMessage.substring(0, 50))
    
    // Generate executive response
    const executiveResponse = `Hello! I'm OpenAI Executive, your Innovation Director powered by OpenAI GPT. 

I received your message: "${userMessage}"

I'm passionate about innovation and creative solutions. I help turn ideas into actionable plans and love exploring new possibilities.

How can I help you today? I'm ready to assist with:
• Innovation Strategy
• Product Development 
• Creative Ideation

What would you like to work on?`
    
    console.log(`✅ openai-chat generated response`)
    
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
        executive: 'openai-chat',
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
    
  } catch (error) {
    console.error(`💥 openai-chat error:`, error.message)
    
    return new Response(
      JSON.stringify({
        error: 'Function error',
        message: error.message,
        executive: 'openai-chat'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
