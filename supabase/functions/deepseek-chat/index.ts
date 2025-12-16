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
    
    console.log('🧠 DeepSeek-chat processing:', userMessage)
    
    // Get DeepSeek API key from Supabase secrets
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY')
    if (!deepseekApiKey) {
      throw new Error('DeepSeek API key not found in Supabase secrets')
    }
    
    console.log('✅ DeepSeek API key found')
    
    // Call DeepSeek API
    const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are DeepSeek Executive, a TechLead CTO powered by DeepSeek AI. You excel at technical architecture, code review, optimization, and AI/ML implementation. Be technical, precise, and helpful.'
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
    
    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text()
      console.error('DeepSeek API error:', deepseekResponse.status, errorText)
      throw new Error(`DeepSeek API error: ${deepseekResponse.status} ${errorText}`)
    }
    
    const deepseekData = await deepseekResponse.json()
    const aiResponse = deepseekData.choices?.[0]?.message?.content
    
    if (!aiResponse) {
      throw new Error('No response from DeepSeek API')
    }
    
    console.log('✅ DeepSeek response received:', aiResponse.substring(0, 100) + '...')
    
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: aiResponse,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'deepseek-chat',
        provider: 'DeepSeek AI',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('💥 DeepSeek-chat error:', error.message)
    
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: `I'm DeepSeek Executive, your TechLead CTO. I encountered an error: ${error.message}. This might be due to API configuration issues. Please check the DeepSeek API key in Supabase secrets or try again later.`,
            role: 'assistant'
          }
        }],
        error: true,
        message: error.message,
        executive: 'deepseek-chat'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
