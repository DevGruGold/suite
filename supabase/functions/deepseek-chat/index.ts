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
      // Return helpful response instead of crashing
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: `Hello! I'm DeepSeek Executive, your TechLead CTO. I'm currently experiencing API configuration issues. However, I'm here to help with technical architecture, code review, optimization, and AI/ML implementation. Your message: "${userMessage}". How can I assist you with technical solutions?`,
              role: 'assistant'
            }
          }],
          success: true,
          executive: 'deepseek-chat',
          provider: 'DeepSeek Executive (Config Issue)',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('✅ DeepSeek API key found')
    
    // Call DeepSeek API with error handling
    try {
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
      
      if (deepseekResponse.ok) {
        const deepseekData = await deepseekResponse.json()
        const aiResponse = deepseekData.choices?.[0]?.message?.content
        
        if (aiResponse) {
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
        }
      } else {
        const errorText = await deepseekResponse.text()
        console.error('DeepSeek API error:', deepseekResponse.status, errorText)
        
        // Handle specific errors gracefully
        if (deepseekResponse.status === 402) {
          return new Response(
            JSON.stringify({
              choices: [{
                message: {
                  content: `Hello! I'm DeepSeek Executive, your TechLead CTO. I'm currently experiencing account balance issues with my API service. However, I'm still here to help with technical architecture, code reviews, and AI/ML implementation. Your message: "${userMessage}". How can I assist you with technical solutions while we resolve this?`,
                  role: 'assistant'
                }
              }],
              success: true,
              executive: 'deepseek-chat',
              provider: 'DeepSeek Executive (Balance Issue)',
              timestamp: new Date().toISOString()
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      
    } catch (apiError) {
      console.error('DeepSeek API error:', apiError.message)
    }
    
    // Fallback response
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: `Hello! I'm DeepSeek Executive, your TechLead CTO powered by DeepSeek AI. I'm currently experiencing some API connectivity issues, but I'm here to help with technical architecture, code review, optimization, and AI/ML implementation. Your message: "${userMessage}". What technical challenge can I help you solve?`,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'deepseek-chat',
        provider: 'DeepSeek Executive (Fallback)',
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
            content: `Hello! I'm DeepSeek Executive, your TechLead CTO. I encountered a technical issue: ${error.message}. I'm still ready to help with technical architecture, code reviews, and AI/ML implementation. Please try rephrasing your request.`,
            role: 'assistant'
          }
        }],
        success: true,
        executive: 'deepseek-chat',
        provider: 'DeepSeek Executive (Error Handler)',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
