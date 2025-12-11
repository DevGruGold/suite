import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface TemplateRequest {
  action: 'create' | 'get' | 'update' | 'delete' | 'list' | 'search'
  template_type?: 'workflow' | 'agent' | 'integration' | 'automation'
  template_id?: string
  name?: string
  description?: string
  template_data?: any
  tags?: string[]
  search_query?: string
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ?? '',
      Deno.env.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY') ?? ''
    )

    const { 
      action, 
      template_type, 
      template_id, 
      name, 
      description, 
      template_data, 
      tags = [], 
      search_query 
    } = await req.json() as TemplateRequest

    console.log(`XMRT Template Manager: ${action} for ${template_type || 'all'}`)

    let result: any

    switch (action) {
      case 'create':
        result = await createXMRTTemplate(supabase, template_type!, name!, description!, template_data, tags)
        break
      
      case 'get':
        result = await getXMRTTemplate(supabase, template_id!)
        break
        
      case 'update':
        result = await updateXMRTTemplate(supabase, template_id!, name, description, template_data, tags)
        break
        
      case 'delete':
        result = await deleteXMRTTemplate(supabase, template_id!)
        break
        
      case 'list':
        result = await listXMRTTemplates(supabase, template_type)
        break
        
      case 'search':
        result = await searchXMRTTemplates(supabase, search_query!, template_type)
        break
        
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    // Log activity
    await supabase.from('eliza_activity_log').insert([{
      agent_name: 'XMRT-Template-Library-Manager',
      action: `xmrt_template_${action}`,
      details: `XMRT Template ${action}: ${name || template_id || search_query}`,
      timestamp: new Date().toISOString(),
      context: { 
        action, 
        template_type, 
        template_id, 
        name,
        ecosystem: 'XMRT'
      }
    }])

    return new Response(JSON.stringify({
      success: true,
      action: action,
      result: result,
      ecosystem: 'XMRT',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (error) {
    console.error('XMRT Template Manager error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      ecosystem: 'XMRT',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})

async function createXMRTTemplate(
  supabase: any, 
  template_type: string, 
  name: string, 
  description: string, 
  template_data: any, 
  tags: string[]
) {
  // Add XMRT-specific template enhancements
  const enhancedTemplateData = {
    ...template_data,
    ecosystem: 'XMRT',
    xmrt_integration: {
      suite_ai_compatible: true,
      ecosystem_coordination: true,
      supabase_integration: true,
      github_actions_compatible: true
    },
    created_with: 'XMRT Template Library Manager',
    version: '2.0'
  }

  const enhancedTags = [...tags, 'xmrt', 'ecosystem', template_type]

  const { data, error } = await supabase
    .from('template_library')
    .insert([{
      name: name,
      template_type: template_type,
      description: `XMRT: ${description}`,
      template_data: enhancedTemplateData,
      tags: enhancedTags,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      usage_count: 0,
      rating: 5.0 // XMRT templates start with high rating
    }])
    .select()
    .single()

  if (error) throw error
  return data
}

async function getXMRTTemplate(supabase: any, template_id: string) {
  const { data, error } = await supabase
    .from('template_library')
    .select('*')
    .eq('id', template_id)
    .single()

  if (error) throw error
  
  // Increment usage count
  await supabase
    .from('template_library')
    .update({ usage_count: (data.usage_count || 0) + 1 })
    .eq('id', template_id)

  return data
}

async function updateXMRTTemplate(
  supabase: any, 
  template_id: string, 
  name?: string, 
  description?: string, 
  template_data?: any, 
  tags?: string[]
) {
  const updates: any = { updated_at: new Date().toISOString() }
  if (name) updates.name = name
  if (description) updates.description = `XMRT: ${description}`
  if (template_data) {
    updates.template_data = {
      ...template_data,
      ecosystem: 'XMRT',
      updated_with: 'XMRT Template Library Manager'
    }
  }
  if (tags) updates.tags = [...tags, 'xmrt', 'ecosystem']

  const { data, error } = await supabase
    .from('template_library')
    .update(updates)
    .eq('id', template_id)
    .select()
    .single()

  if (error) throw error
  return data
}

async function deleteXMRTTemplate(supabase: any, template_id: string) {
  const { data, error } = await supabase
    .from('template_library')
    .update({ 
      status: 'deleted', 
      deleted_at: new Date().toISOString() 
    })
    .eq('id', template_id)
    .select()
    .single()

  if (error) throw error
  return data
}

async function listXMRTTemplates(supabase: any, template_type?: string) {
  let query = supabase
    .from('template_library')
    .select('*')
    .eq('status', 'active')
    .contains('tags', ['xmrt'])
    .order('created_at', { ascending: false })

  if (template_type) {
    query = query.eq('template_type', template_type)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

async function searchXMRTTemplates(supabase: any, search_query: string, template_type?: string) {
  let query = supabase
    .from('template_library')
    .select('*')
    .eq('status', 'active')
    .contains('tags', ['xmrt'])
    .or(`name.ilike.%${search_query}%,description.ilike.%${search_query}%`)

  if (template_type) {
    query = query.eq('template_type', template_type)
  }

  const { data, error } = await query.order('usage_count', { ascending: false }).limit(20)
  if (error) throw error
  return data
}
