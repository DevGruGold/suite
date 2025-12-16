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
    
    console.log('💎 Gemini-chat processing:', userMessage)
    
    // Get Gemini API key from Supabase secrets
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY')
    if (!geminiApiKey) {
      throw new Error('Gemini API key not found in Supabase secrets')
    }
    
    console.log('✅ Gemini API key found')
    
    // Call Gemini API
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are Gemini Assistant, a Strategic Advisor powered by Google Gemini. You excel at strategic planning, market analysis, and creative problem solving. Be strategic, insightful, and comprehensive.

User message: ${userMessage}`
          }]
        }],
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.7
        }
      })
    })
    
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error('Gemini API error:', geminiResponse.status, errorText)
      throw new Error(`Gemini API error: ${geminiResponse.status} ${errorText}`)
    }
    
    const geminiData = await geminiResponse.json()
    const aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (!aiResponse) {
      throw new Error('No response from Gemini API')
    }
    
    console.log('✅ Gemini response received:', aiResponse.substring(0, 100) + '...')
    
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: aiResponse,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'gemini-chat',
        provider: 'Google Gemini Pro',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('💥 Gemini-chat error:', error.message)
    
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: `I'm Gemini Assistant, your Strategic Advisor. I encountered an error: ${error.message}. This might be due to API configuration issues. Please check the Gemini API key in Supabase secrets or try again later.`,
            role: 'assistant'
          }
        }],
        error: true,
        message: error.message,
        executive: 'gemini-chat'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
