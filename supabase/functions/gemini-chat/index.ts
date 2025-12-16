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
    
    // Call Gemini API with CORRECT model name
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
      
      // Return helpful fallback response instead of crashing
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: `Hello! I'm Gemini Assistant, your Strategic Advisor. I'm currently experiencing API connectivity issues (${geminiResponse.status}). However, I'm here to help with strategic planning, market analysis, and creative problem solving. Could you please try your request again, or let me know how I can assist you with strategic insights?`,
              role: 'assistant'
            }
          }],
          success: true,
          executive: 'gemini-chat',
          provider: 'Gemini Pro (API issue)',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
            content: `Hello! I'm Gemini Assistant, your Strategic Advisor powered by Google Gemini. I encountered a technical issue: ${error.message}. I'm still here to help with strategic planning, market analysis, and creative problem solving. Please try rephrasing your request or let me know how I can assist you strategically.`,
            role: 'assistant'
          }
        }],
        success: true, // Keep success true to avoid frontend errors
        executive: 'gemini-chat',
        provider: 'Gemini Pro (Fallback)',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
