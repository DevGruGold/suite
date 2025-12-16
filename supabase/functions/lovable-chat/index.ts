import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request safely
    let userMessage = 'Hello'
    try {
      const body = await req.json()
      userMessage = body.message || body.messages?.[body.messages.length - 1]?.content || 'Hello'
    } catch (parseError) {
      console.log('JSON parse failed, using default message')
      userMessage = 'Hello'
    }
    
    console.log('💖 Lovable-chat (minimal) processing:', userMessage.substring(0, 50))
    
    // Try OpenAI if available
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (openaiApiKey) {
      try {
        console.log('🤖 Attempting OpenAI call...')
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are Lovable Agent, a Full-Stack Development Lead. You specialize in full-stack development, UI/UX design, and rapid prototyping. Be enthusiastic about development and user experience.'
              },
              {
                role: 'user',
                content: userMessage
              }
            ],
            max_tokens: 1000,
            temperature: 0.7
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          const aiContent = data?.choices?.[0]?.message?.content
          
          if (aiContent) {
            console.log('✅ OpenAI success')
            return new Response(
              JSON.stringify({
                choices: [{
                  message: {
                    content: aiContent,
                    role: 'assistant'
                  }
                }],
                success: true,
                executive: 'lovable-chat',
                provider: 'OpenAI GPT-3.5 Turbo',
                timestamp: new Date().toISOString()
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        } else {
          console.log('OpenAI failed:', response.status)
        }
      } catch (apiError) {
        console.log('OpenAI error:', apiError.message)
      }
    }
    
    // Always return a helpful fallback response
    const fallbackContent = `Hello! I'm Lovable Agent, your Full-Stack Development Lead! 🚀

I received your message: "${userMessage}"

I'm passionate about creating amazing user experiences and building beautiful, functional applications! I specialize in:

• Full-Stack Development (React, Node.js, Python, databases)
• UI/UX Design (user-centered design, responsive layouts)  
• Rapid Prototyping (MVP development, quick iterations)
• Modern Web Technologies (APIs, cloud deployment, performance)

${openaiApiKey ? 'I'm currently experiencing API connectivity issues, but' : 'I'm'} ready to help you build something awesome! 

What kind of development challenge can I help you tackle? Whether it's:
- Building a new application from scratch
- Improving user experience on an existing project  
- Choosing the right technology stack
- Optimizing performance or deployment

Let's create something amazing together! 💖`

    console.log('✅ Returning fallback response')
    
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: fallbackContent,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'lovable-chat',
        provider: openaiApiKey ? 'Lovable Agent (API Fallback)' : 'Lovable Agent (No API Key)',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('💥 Critical error:', error.message)
    
    // Ultimate safety net - should never fail
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: `Hello! I'm Lovable Agent, your Full-Stack Development Lead! I'm experiencing some technical difficulties (${error.message}), but I'm still here to help you with full-stack development, UI/UX design, and rapid prototyping. Please try your request again!`,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'lovable-chat',
        provider: 'Lovable Agent (Emergency Mode)',
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
