// ⚠️ DEPRECATED: This file creates a duplicate Supabase client which causes "Multiple GoTrueClient instances" warnings.
// Use '@/integrations/supabase/client' instead for all Supabase operations.
// This file is kept for backward compatibility only but should not be imported in new code.

// Supabase Client Configuration
// This connects the frontend to your Supabase backend functions

import { createClient } from '@supabase/supabase-js'

// Supabase Configuration
const supabaseUrl = 'https://vawouugtzwmejxqkeqqj.supabase.co'
const supabaseKey = 'sb_publishable_yIaroctFhoYStx0f9XajBg_zhpuVulw'

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false, // Disable auth for chat functions
    detectSessionInUrl: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

// Chat Functions API
export const chatAPI = {
  // Base URL for edge functions
  baseUrl: `${supabaseUrl}/functions/v1`,
  
  // Headers for all requests
  headers: {
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  },
  
  // Call any chat function
  async callChatFunction(functionName: string, payload: any) {
    console.log(`🔧 Calling ${functionName} with payload:`, payload)
    
    try {
      const response = await fetch(`${this.baseUrl}/${functionName}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload)
      })
      
      console.log(`📊 ${functionName} response status:`, response.status)
      
      if (!response.ok) {
        throw new Error(`${functionName} returned ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      console.log(`✅ ${functionName} response received:`, data)
      
      return data
    } catch (error) {
      console.error(`❌ ${functionName} call failed:`, error)
      throw error
    }
  },
  
  // Call COO (Eliza) specifically
  async callEliza(messages: any[], options: any = {}) {
    return this.callChatFunction('coo-chat', {
      messages,
      model: 'gemini-1.5-pro',
      temperature: 0.7,
      ...options
    })
  },
  
  // Call CTO (DeepSeek) specifically  
  async callCTO(messages: any[], options: any = {}) {
    return this.callChatFunction('deepseek-chat', {
      messages,
      model: 'deepseek-chat',
      temperature: 0.7,
      ...options
    })
  },
  
  // Call CAO (Gemini) specifically
  async callCAO(messages: any[], options: any = {}) {
    return this.callChatFunction('gemini-chat', {
      messages,
      model: 'gemini-1.5-pro',
      temperature: 0.7,
      ...options
    })
  },
  
  // Call CFO (OpenAI) specifically
  async callCFO(messages: any[], options: any = {}) {
    return this.callChatFunction('openai-chat', {
      messages,
      model: 'gpt-4o-mini',
      temperature: 0.7,
      ...options
    })
  },
  
  // Call CMO (Lovable) specifically
  async callCMO(messages: any[], options: any = {}) {
    return this.callChatFunction('lovable-chat', {
      messages,
      model: 'claude-3.5-sonnet',
      temperature: 0.7,
      ...options
    })
  },
  
  // Executive Council (multiple executives)
  async callCouncil(messages: any[], options: any = {}) {
    // Call multiple executives and combine responses
    const executives = [
      { name: 'COO (Eliza)', func: 'coo-chat' },
      { name: 'CTO', func: 'deepseek-chat' },
      { name: 'CAO', func: 'gemini-chat' },
      { name: 'CFO', func: 'openai-chat' },
      { name: 'CMO', func: 'lovable-chat' }
    ]
    
    const responses = []
    
    for (const exec of executives) {
      try {
        const response = await this.callChatFunction(exec.func, {
          messages,
          model: options.model || 'auto',
          temperature: 0.7,
          ...options
        })
        
        responses.push({
          executive: exec.name,
          response: response
        })
      } catch (error) {
        console.warn(`⚠️ ${exec.name} unavailable:`, error.message)
        responses.push({
          executive: exec.name,
          error: error.message
        })
      }
    }
    
    return {
      type: 'council',
      responses: responses,
      timestamp: new Date().toISOString()
    }
  },
  
  // Smart routing (let backend choose best executive)
  async callSmart(messages: any[], options: any = {}) {
    // Try executives in order of availability
    const executiveOrder = ['coo-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'lovable-chat', 'ai-chat']
    
    for (const executive of executiveOrder) {
      try {
        return await this.callChatFunction(executive, {
          messages,
          model: options.model || 'auto',
          temperature: 0.7,
          ...options
        })
      } catch (error) {
        console.warn(`⚠️ ${executive} failed, trying next:`, error.message)
        continue
      }
    }
    
    throw new Error('All executives unavailable')
  }
}

// Export default client
export default supabase

// Health check function
export const checkSupabaseHealth = async () => {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`)
    return {
      status: response.status,
      healthy: response.ok,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    return {
      status: 0,
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }
  }
}
