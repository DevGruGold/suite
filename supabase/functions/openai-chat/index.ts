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
    
    console.log('🤖 OpenAI-chat processing:', userMessage)
    
    // Get OpenAI API key from Supabase secrets
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not found in Supabase secrets')
    }
    
    console.log('✅ OpenAI API key found')
    
    // Try GPT-4, fallback to GPT-3.5 if quota exceeded
    let model = 'gpt-4'
    let provider = 'OpenAI GPT-4'
    
    try {
      // First try GPT-4
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: 'You are OpenAI Executive, an Innovation Director powered by OpenAI GPT. You help with innovation strategy, product development, and creative ideation. Be helpful, innovative, and professional.'
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
      
      if (openaiResponse.status === 429) {
        // Quota exceeded, try GPT-3.5 turbo
        console.log('🔄 GPT-4 quota exceeded, trying GPT-3.5...')
        model = 'gpt-3.5-turbo'
        provider = 'OpenAI GPT-3.5 Turbo'
        
        const fallbackResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are OpenAI Executive, an Innovation Director powered by OpenAI. You help with innovation strategy, product development, and creative ideation. Be helpful, innovative, and professional.'
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
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json()
          const aiResponse = fallbackData.choices?.[0]?.message?.content
          
          if (aiResponse) {
            console.log('✅ GPT-3.5 response received:', aiResponse.substring(0, 100) + '...')
            
            return new Response(
              JSON.stringify({
                choices: [{
                  message: {
                    content: aiResponse,
                    role: 'assistant'
                  }
                }],
                success: true,
                executive: 'openai-chat',
                provider: provider,
                timestamp: new Date().toISOString()
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
      } else if (openaiResponse.ok) {
        const openaiData = await openaiResponse.json()
        const aiResponse = openaiData.choices?.[0]?.message?.content
        
        if (aiResponse) {
          console.log('✅ GPT-4 response received:', aiResponse.substring(0, 100) + '...')
          
          return new Response(
            JSON.stringify({
              choices: [{
                message: {
                  content: aiResponse,
                  role: 'assistant'
                }
              }],
              success: true,
              executive: 'openai-chat',
              provider: provider,
              timestamp: new Date().toISOString()
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      
      // If we get here, both API calls failed
      throw new Error('OpenAI API calls failed')
      
    } catch (apiError) {
      console.error('OpenAI API error:', apiError.message)
      
      // Return helpful fallback response
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: `Hello! I'm OpenAI Executive, your Innovation Director. I'm currently experiencing API connectivity issues, but I'm here to help with innovation strategy, product development, and creative ideation. Your message: "${userMessage}". Could you please try again, or let me know how I can assist you with innovation and strategy?`,
              role: 'assistant'
            }
          }],
          success: true,
          executive: 'openai-chat',
          provider: 'OpenAI Executive (Fallback)',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
  } catch (error) {
    console.error('💥 OpenAI-chat error:', error.message)
    
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: `Hello! I'm OpenAI Executive, your Innovation Director. I encountered a technical issue: ${error.message}. I'm still ready to help with innovation strategy, product development, and creative ideation. Please try rephrasing your request.`,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'openai-chat',
        provider: 'OpenAI Executive (Error Handler)',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
