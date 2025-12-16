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
    
    // Try Lovable API first, fallback to OpenAI
    let apiResponse
    let provider = 'Lovable AI'
    
    try {
      // Try Lovable API if key exists
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
      if (lovableApiKey) {
        console.log('🎯 Trying Lovable API...')
        
        const lovableResponse = await fetch('https://api.lovable.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: 'You are Lovable Agent, a Full-Stack Development Lead powered by Lovable AI. You specialize in full-stack development, UI/UX design, and rapid prototyping. Be development-focused, practical, and creative.'
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
        
        if (lovableResponse.ok) {
          const lovableData = await lovableResponse.json()
          apiResponse = lovableData.choices?.[0]?.message?.content
          if (apiResponse) {
            console.log('✅ Lovable API response received')
          }
        }
      }
    } catch (lovableError) {
      console.log('⚠️ Lovable API failed, trying OpenAI fallback...')
    }
    
    // Fallback to OpenAI if Lovable failed
    if (!apiResponse) {
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
      if (!openaiApiKey) {
        throw new Error('No API keys found (Lovable or OpenAI) in Supabase secrets')
      }
      
      console.log('🔄 Using OpenAI fallback...')
      provider = 'OpenAI GPT-4 (Lovable fallback)'
      
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are Lovable Agent, a Full-Stack Development Lead. You specialize in full-stack development, UI/UX design, and rapid prototyping. Be development-focused, practical, and creative.'
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
      
      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        throw new Error(`OpenAI fallback error: ${openaiResponse.status} ${errorText}`)
      }
      
      const openaiData = await openaiResponse.json()
      apiResponse = openaiData.choices?.[0]?.message?.content
    }
    
    if (!apiResponse) {
      throw new Error('No response from any AI API')
    }
    
    console.log('✅ AI response received:', apiResponse.substring(0, 100) + '...')
    
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: apiResponse,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'lovable-chat',
        provider: provider,
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
            content: `I'm Lovable Agent, your Development Lead. I encountered an error: ${error.message}. This might be due to API configuration issues. Please check the API keys in Supabase secrets or try again later.`,
            role: 'assistant'
          }
        }],
        error: true,
        message: error.message,
        executive: 'lovable-chat'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
