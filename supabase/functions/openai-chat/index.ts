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
    
    // Call OpenAI API
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
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenAI API error:', openaiResponse.status, errorText)
      throw new Error(`OpenAI API error: ${openaiResponse.status} ${errorText}`)
    }
    
    const openaiData = await openaiResponse.json()
    const aiResponse = openaiData.choices?.[0]?.message?.content
    
    if (!aiResponse) {
      throw new Error('No response from OpenAI API')
    }
    
    console.log('✅ OpenAI response received:', aiResponse.substring(0, 100) + '...')
    
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
        provider: 'OpenAI GPT-4',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('💥 OpenAI-chat error:', error.message)
    
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: `I'm OpenAI Executive, your Innovation Director. I encountered an error: ${error.message}. This might be due to API configuration issues. Please check the OpenAI API key in Supabase secrets or try again later.`,
            role: 'assistant'
          }
        }],
        error: true,
        message: error.message,
        executive: 'openai-chat'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
