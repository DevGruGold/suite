import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message, messages } = await req.json()
    const userMessage = message || messages?.[messages.length - 1]?.content || 'Hello'
    
    console.log('💖 Lovable-chat processing:', userMessage)
    
    // Since Lovable API doesn't exist, use OpenAI directly
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (openaiApiKey) {
      console.log('🔄 Using OpenAI for Lovable Agent...')
      
      try {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo', // Use cheaper model for fallback
            messages: [
              {
                role: 'system',
                content: 'You are Lovable Agent, a Full-Stack Development Lead specialized in full-stack development, UI/UX design, and rapid prototyping. You are development-focused, practical, creative, and love building beautiful user experiences. Be enthusiastic about development and always think about user experience.'
              },
              {
                role: 'user',
                content: userMessage
              }
            ],
            max_tokens: 1500,
            temperature: 0.7
          })
        })
        
        if (openaiResponse.ok) {
          const openaiData = await openaiResponse.json()
          const aiResponse = openaiData.choices?.[0]?.message?.content
          
          if (aiResponse) {
            console.log('✅ OpenAI response for Lovable Agent:', aiResponse.substring(0, 100) + '...')
            
            return new Response(
              JSON.stringify({
                choices: [{
                  message: {
                    content: aiResponse,
                    role: 'assistant'
                  }
                }],
                success: true,
                executive: 'lovable-chat',
                provider: 'OpenAI GPT-3.5 (Lovable Agent)',
                timestamp: new Date().toISOString()
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        } else {
          console.error('OpenAI fallback failed:', openaiResponse.status)
        }
        
      } catch (apiError) {
        console.error('OpenAI API error:', apiError.message)
      }
    }
    
    // Ultimate fallback
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: `Hello! I'm Lovable Agent, your Full-Stack Development Lead! I'm passionate about creating amazing user experiences and turning ideas into beautiful, functional applications. Your message: "${userMessage}". I'm currently experiencing some API connectivity issues, but I'm here to help with full-stack development, UI/UX design, and rapid prototyping. How can I help you build something awesome?`,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'lovable-chat',
        provider: 'Lovable Agent (Fallback)',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('💥 Lovable-chat error:', error.message)
    
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: `Hello! I'm Lovable Agent, your Full-Stack Development Lead! I encountered a technical issue: ${error.message}. I'm still excited to help you with full-stack development, UI/UX design, and rapid prototyping. Let's build something amazing together!`,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'lovable-chat',
        provider: 'Lovable Agent (Error Handler)',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
