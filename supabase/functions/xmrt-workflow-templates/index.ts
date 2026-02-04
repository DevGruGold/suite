console.info('xmrt-workflow-templates starting');
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import Hono from 'npm:hono@4.6.7'
import { cors } from 'npm:hono@4.6.7/cors'

// Use service role for server-side operations; RLS remains enabled on tables
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const app = new Hono()
app.use('*', cors())

// Types kept in-sync with public.workflow_templates and public.workflow_template_executions
// Table: public.workflow_templates
// - id: uuid (PK)
// - template_name: text (unique)
// - category: text CHECK in ['revenue','marketing','financial','optimization'] (we also allow other categories at runtime but default schema expects these)
// - description: text
// - steps: jsonb (ARRAY of TemplateStep below)
// - estimated_duration_seconds: int
// - success_rate: numeric
// - times_executed: int
// - is_active: boolean
// - tags: text[]
// - created_at, updated_at: timestamptz
// - metadata: jsonb
//
// Table: public.workflow_template_executions
// - id: uuid (PK)
// - template_id: uuid (FK -> workflow_templates.id)
// - template_name: text
// - execution_id: text (external tracking id)
// - status: text CHECK in ['running','completed','failed','cancelled']
// - started_at, completed_at: timestamptz
// - duration_ms: int
// - success: boolean
// - error_message: text
// - steps_completed: int
// - total_steps: int
// - execution_params: jsonb
// - execution_results: jsonb
// - created_at: timestamptz
// - metadata: jsonb

interface DecisionSpec { condition?: string; on_true?: string; on_false?: string }
interface ToolSpec { name?: string; version?: string; endpoint?: string; params?: Record<string, unknown> }
interface TemplateStep {
  id?: string
  name: string
  type: 'ai_analysis' | 'data_fetch' | 'api_call' | 'decision' | 'code_execution' | 'human_review' | 'store_knowledge' | 'task_update'
  description?: string
  tool?: ToolSpec
  params?: Record<string, unknown>
  decision?: DecisionSpec
  expected_outcome?: string
  // Optional schema-level alignment for existing orchestrators
  outputs_schema?: Record<string, string>
}

interface CreateTemplateBody {
  template_name: string
  description: string
  category: string
  steps: TemplateStep[]
  tags?: string[]
  estimated_duration_seconds?: number
  metadata?: Record<string, unknown>
}

// Validate step structure to ensure orchestration compatibility and DB schema alignment
function validateSteps(steps: TemplateStep[]): string[] {
  const errors: string[] = []
  if (!Array.isArray(steps) || steps.length === 0) errors.push('steps must be a non-empty array')
  steps.forEach((s, i) => {
    if (!s || typeof s !== 'object') errors.push(`steps[${i}] must be an object`)
    if (!s.name) errors.push(`steps[${i}].name is required`)
    if (!s.type) errors.push(`steps[${i}].type is required`)
    if (s.type === 'decision' && !s.decision) errors.push(`steps[${i}] decision step requires decision spec`)
    if (s.tool && (s.type !== 'api_call' && s.type !== 'code_execution' && s.type !== 'data_fetch' && s.type !== 'ai_analysis')) {
      errors.push(`steps[${i}] tool provided but step type ${s.type} may not use tools`)
    }
  })
  return errors
}

// Utility to parse JSON body
const parseJSON = async <T>(req: Request): Promise<T> => await req.json() as T

// Build canonical instructions payload kept inside steps JSON
// This ensures detailed guidance lives with the template record
function buildCanonicalInstructions(template: { template_name: string; description: string; steps: TemplateStep[] }) {
  return {
    name: template.template_name,
    description: template.description,
    guidance: 'Follow steps in order unless decision logic redirects flow. For each step, record result, error, timings. Use task-orchestrator to execute actions and update workflow_template_executions with progress.',
    steps: template.steps.map((s, idx) => ({
      index: idx,
      id: s.id ?? `step_${idx + 1}`,
      name: s.name,
      type: s.type,
      description: s.description ?? '',
      tool: s.tool ?? null,
      params: s.params ?? {},
      decision: s.decision ?? null,
      expected_outcome: s.expected_outcome ?? '',
      outputs_schema: s.outputs_schema ?? {},
      recording: {
        store_in: 'workflow_steps',
        fields: ['status','result','error','start_time','end_time','duration_ms','metadata']
      }
    }))
  }
}

// list_templates
app.get('/xmrt-workflow-templates/list', async (c) => {
  const category = c.req.query('category') || undefined
  const tags = c.req.queries('tags') || []
  let query = supabase.from('workflow_templates').select('*').eq('is_active', true)
  if (category) query = query.eq('category', category)
  if (tags.length) query = query.contains('tags', tags)
  const { data, error } = await query
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ templates: data })
})

// get_template
app.get('/xmrt-workflow-templates/get/:name', async (c) => {
  const name = c.req.param('name')
  const { data, error } = await supabase.from('workflow_templates').select('*').eq('template_name', name).maybeSingle()
  if (error) return c.json({ error: error.message }, 500)
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json({ template: data, canonical_instructions: buildCanonicalInstructions(data) })
})

// create_template
app.post('/xmrt-workflow-templates/create', async (c) => {
  const body = await parseJSON<CreateTemplateBody>(c.req.raw)
  const stepErrors = validateSteps(body.steps)
  if (stepErrors.length) return c.json({ error: 'Invalid steps', details: stepErrors }, 400)

  // Ensure tags array and default fields align with schema
  const payload = {
    template_name: body.template_name,
    description: body.description,
    category: body.category,
    steps: body.steps,
    tags: body.tags ?? [],
    is_active: true,
    estimated_duration_seconds: body.estimated_duration_seconds ?? 30,
    metadata: body.metadata ?? {},
  }

  const { data, error } = await supabase.from('workflow_templates').insert(payload).select('*').maybeSingle()
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ template: data, canonical_instructions: buildCanonicalInstructions(data) })
})

// update_template
app.post('/xmrt-workflow-templates/update/:name', async (c) => {
  const name = c.req.param('name')
  const updates = await parseJSON<Record<string, unknown>>(c.req.raw)
  if (updates.steps) {
    const errs = validateSteps(updates.steps as TemplateStep[])
    if (errs.length) return c.json({ error: 'Invalid steps', details: errs }, 400)
  }
  updates['updated_at'] = new Date().toISOString()
  const { data, error } = await supabase.from('workflow_templates').update(updates).eq('template_name', name).select('*').maybeSingle()
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ template: data, canonical_instructions: buildCanonicalInstructions(data) })
})

// delete_template (hard delete). If preferred, switch to { is_active: false }
app.delete('/xmrt-workflow-templates/delete/:name', async (c) => {
  const name = c.req.param('name')
  const { error } = await supabase.from('workflow_templates').delete().eq('template_name', name)
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ success: true })
})

// execute_template -> logs execution row and triggers task-orchestrator
app.post('/xmrt-workflow-templates/execute', async (c) => {
  const { template_name, task_id, params } = await parseJSON<{ template_name: string; task_id: string; params?: Record<string, unknown> }>(c.req.raw)

  const { data: tmpl, error: e1 } = await supabase.from('workflow_templates').select('*').eq('template_name', template_name).maybeSingle()
  if (e1) return c.json({ error: e1.message }, 400)
  if (!tmpl) return c.json({ error: 'Template not found' }, 404)

  const execId = crypto.randomUUID()
  const { data: exec, error: e2 } = await supabase.from('workflow_template_executions').insert({
    template_id: tmpl.id,
    template_name,
    execution_id: execId,
    status: 'running',
    steps_completed: 0,
    total_steps: Array.isArray(tmpl.steps) ? tmpl.steps.length : 0,
    execution_params: params ?? {},
  }).select('*').maybeSingle()
  if (e2) return c.json({ error: e2.message }, 400)

  // Compose instruction bundle to guide orchestrator
  const canonical = buildCanonicalInstructions({ template_name, description: tmpl.description, steps: tmpl.steps })

  const trigger = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/task-orchestrator/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      template: tmpl,
      canonical_instructions: canonical,
      task_id,
      execution_id: execId,
      params: params ?? {},
      // Alignment hints with existing schemas
      db_alignment: {
        workflow_execution_table: 'workflow_template_executions',
        workflow_steps_table: 'workflow_steps',
        tasks_table: 'tasks',
        decisions_table: 'decisions'
      },
      source: 'xmrt-workflow-templates'
    }),
  })
  // non-blocking
  // deno-lint-ignore no-explicit-any
  ;(globalThis as any).EdgeRuntime?.waitUntil?.(trigger)

  return c.json({ execution: exec })
})

// get_execution_status
app.get('/xmrt-workflow-templates/status/:executionId', async (c) => {
  const id = c.req.param('executionId')
  const { data, error } = await supabase.from('workflow_template_executions').select('*').or(`execution_id.eq.${id},id.eq.${id}`).maybeSingle()
  if (error) return c.json({ error: error.message }, 400)
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json({ execution: data })
})

// get_template_analytics
app.get('/xmrt-workflow-templates/analytics', async (c) => {
  const templateName = c.req.query('template_name')
  let q = supabase.from('workflow_template_executions').select('template_name,status,success,duration_ms')
  if (templateName) q = q.eq('template_name', templateName)
  const { data, error } = await q
  if (error) return c.json({ error: error.message }, 400)
  const total = data.length
  const successes = data.filter(d => d.success).length
  const avgDuration = Math.round(data.reduce((a, b) => a + (b.duration_ms || 0), 0) / Math.max(1, total))
  return c.json({ total_executions: total, success_count: successes, success_rate: total ? successes / total : 0, avg_duration_ms: avgDuration })
})

// Health
app.get('/xmrt-workflow-templates/health', (c) => c.json({ ok: true }))

Deno.serve(app.fetch)
