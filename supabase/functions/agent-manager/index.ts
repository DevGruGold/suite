// agent-manager.ts
// Ultra-robust agent manager (DeepSeek AI backend)
// - Always returns { ok: boolean, data: <payload|null>, error?: string }
// - Uses Supabase service role key for backend operations
// - Auto-restructures flat request bodies into `data` if needed
// - Extensive activity logging to eliza_activity_log
// - Direct edge function calls for cross-function operations
// - Conservative defensive programming: checks, maybeSingle, single, head queries
// - No IIFEs, single mutable query builder pattern where appropriate
// - Lightweight debug logs throughout

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';
import { recordTaskCompletion, getAgentMetrics } from '../_shared/agentMetrics.ts';


const FUNCTION_NAME = 'agent-manager';

// ---------- Config / Env ----------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";

// ---------- Valid Enums (match database exactly) ----------
const VALID_AGENT_STATUSES = ["IDLE", "BUSY", "OFFLINE", "ARCHIVED", "BLOCKED", "PAUSED"] as const;
const VALID_TASK_STATUSES = ["PENDING", "CLAIMED", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED", "COMPLETED", "FAILED"] as const;
const VALID_AGENT_ROLES = ["manager", "planner", "analyst", "developer", "integrator", "validator", "miner", "device", "generic"] as const;
const VALID_TASK_CATEGORIES = ["code", "infra", "research", "governance", "mining", "device", "ops", "other"] as const;
const VALID_TASK_STAGES = ["DISCUSS", "PLAN", "EXECUTE", "VERIFY", "INTEGRATE"] as const;

// ---------- Utility Types ----------
type RequestPayload = {
  action?: string;
  data?: any;
  autonomous?: boolean;
  [k: string]: any;
};

type ResponseEnvelope = {
  ok: boolean;
  data: any | null;
  error?: string;
};

// ---------- Response Helpers (always include data key) ----------
function okResponse(payload: any) {
  const envelope: ResponseEnvelope = { ok: true, data: payload ?? null };
  return new Response(JSON.stringify(envelope), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  const envelope: ResponseEnvelope = { ok: false, error: message, data: null };
  return new Response(JSON.stringify(envelope), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Error Classes ----------
class ValidationError extends Error { }
class AppError extends Error { }

// ---------- Helper: Normalize category to valid enum ----------
function normalizeCategory(cat?: string): string {
  if (!cat) return "other";
  const lower = cat.toLowerCase();
  if ((VALID_TASK_CATEGORIES as readonly string[]).includes(lower)) return lower;
  // Map common aliases
  const mapping: Record<string, string> = {
    "onboarding": "ops",
    "autonomous": "ops",
    "development": "code",
    "infrastructure": "infra",
  };
  return mapping[lower] || "other";
}

// ---------- Helper: Normalize stage to valid enum ----------
function normalizeStage(stage?: string): string {
  if (!stage) return "PLAN";
  const upper = stage.toUpperCase();
  if ((VALID_TASK_STAGES as readonly string[]).includes(upper)) return upper;
  // Map common aliases
  const mapping: Record<string, string> = {
    "PLANNING": "PLAN",
    "IN_PROGRESS": "EXECUTE",
    "EXECUTION": "EXECUTE",
    "VERIFICATION": "VERIFY",
    "INTEGRATION": "INTEGRATE",
    "DISCUSSION": "DISCUSS",
  };
  return mapping[upper] || "PLAN";
}

// ---------- Create Supabase client factory ----------
function createSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------- AI Helper with Resilient Fallback Cascade ----------
import { callAIWithFallback } from '../_shared/unifiedAIFallback.ts';

async function callAIWithResilience(prompt: string, opts?: { temperature?: number; maxTokens?: number }) {
  try {
    const result = await callAIWithFallback(
      [{ role: 'user', content: prompt }],
      {
        systemPrompt: 'You are an AI agent coordinator for the XMRT ecosystem. Provide concise, actionable analysis for autonomous agent operations. Focus on practical decisions and next steps.',
        temperature: opts?.temperature ?? 0.2,
        max_tokens: opts?.maxTokens ?? 512,
        preferProvider: 'deepseek' // Keep DeepSeek preference for CTO consistency
      }
    );

    const text = typeof result === 'string' ? result : result?.content || '';
    return { text, raw: result };
  } catch (error) {
    throw new AppError(`AI analysis failed after all providers: ${error.message}`);
  }
}

// ---------- Direct Edge Function Call Helper ----------
async function callEdgeFunction(functionName: string, payload: any) {
  const endpoint = `${SUPABASE_URL}/functions/v1/${functionName}`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (!resp.ok) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text };
    }
    throw new AppError(`Edge function ${functionName} error: ${parsed?.error || resp.statusText}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------- Main Serve Handler ----------
serve(async (req) => {
  // handle CORS preflight quickly
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  // create a fresh supabase client per request (server-side)
  const supabase = createSupabase();

  try {
    // parse request body safely
    const body: RequestPayload = await req.json().catch(() => ({} as RequestPayload));
    let { action, data, autonomous = false } = body;

    // AUTO-RESTRUCTURE flat params: if data missing but body has other props -> pack them into data
    if ((data === undefined || data === null) && Object.keys(body).length > (autonomous ? 2 : 1)) {
      const { action: _, autonomous: __, ...rest } = body;
      if (Object.keys(rest).length > 0) {
        console.info("[agent-manager] Auto-restructuring flat params into data object");
        data = rest;
      }
    }

    console.info("[agent-manager] request", { action, autonomous, data });

    if (!action || typeof action !== "string") {
      throw new ValidationError("Missing or invalid `action` in request body");
    }

    // ---------- Local helper: safe DB query runner ----------
    async function runQuery<T = any>(query: Promise<{ data: T; error: any }>) {
      const { data: qdata, error } = await query;
      if (error) {
        console.error("[agent-manager] DB error:", error);
        throw new AppError(error.message || "Database query failed");
      }
      return qdata;
    }

    // ---------- Start switch-case action handling ----------
    let result: any = null;

    // ---------- Resolve Actor Context (User & Organization) ----------
    let actorUserId = body.user_id || body.context?.user_id;
    let actorOrgId = body.organization_id || body.context?.organization_id;

    if (!actorUserId) {
      const authHeader = req.headers.get("Authorization");
      // Don't try to parse if it's the service key itself (internal call default)
      if (authHeader && !authHeader.includes(SUPABASE_SERVICE_KEY)) {
        try {
          const token = authHeader.replace("Bearer ", "");
          const { data: { user }, error: uErr } = await supabase.auth.getUser(token);
          if (user && !uErr) {
            actorUserId = user.id;
            console.info(`[agent-manager] Resolved actorUserId from Auth header: ${actorUserId}`);

            // Attempt to resolve org from profile if not provided
            if (!actorOrgId) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("selected_organization_id")
                .eq("id", actorUserId)
                .single();
              if (profile?.selected_organization_id) {
                actorOrgId = profile.selected_organization_id;
                console.info(`[agent-manager] Resolved actorOrgId from profile: ${actorOrgId}`);
              } else {
                // If the user has access to exactly one org, maybe default to it?
                // For now, let's keep it scoped to what they explicitly selected or passed.
              }
            }
          }
        } catch (e) {
          console.warn("[agent-manager] Failed to resolve user from Auth header", e);
        }
      }
    }

    switch (action) {
      // ------------------------
      // LIST AGENTS (with filtering + paging)
      // ------------------------
      case "list_agents": {
        const {
          status,
          role,
          skill,
          limit = 50,
          offset = 0,
          order_by,
        } = data ?? {};

        // validations
        if (status && !(VALID_AGENT_STATUSES as readonly string[]).includes(String(status).toUpperCase())) {
          throw new ValidationError(`status must be one of: ${VALID_AGENT_STATUSES.join(", ")}`);
        }
        if (typeof limit !== "number" || limit < 1 || limit > 1000) throw new ValidationError("limit must be 1..1000");
        if (typeof offset !== "number" || offset < 0) throw new ValidationError("offset must be >= 0");

        console.info("[agent-manager] list_agents params:", { status, role, skill, limit, offset, order_by });

        let query = supabase.from("agents").select("*");

        if (status) query = query.eq("status", status);
        if (role) query = query.eq("role", role);
        if (skill) query = query.contains("skills", [skill]);

        if (order_by?.column) {
          query = query.order(order_by.column, { ascending: !!order_by.ascending });
        } else {
          query = query.order("created_at", { ascending: false });
        }

        const q = await query.range(offset, offset + limit - 1);
        const agents = q.data;
        if (q.error) throw new AppError(q.error.message || "DB error");
        result = agents ?? [];
        break;
      }

      // ------------------------
      // SPAWN AGENT
      // ------------------------
      case "spawn_agent": {
        const payload = data ?? {};
        const required = ["name", "role"];
        for (const f of required) {
          if (!payload[f]) throw new ValidationError(`spawn_agent requires ${f}`);
        }

        // role enum enforcement (case-insensitive) - matches database agent_role enum
        if (!(VALID_AGENT_ROLES as readonly string[]).includes(String(payload.role).toLowerCase())) {
          throw new ValidationError(`Invalid role "${payload.role}". Must be one of: ${VALID_AGENT_ROLES.join(", ")}`);
        }

        // capacity check
        const maxAgents = Number(payload.max_agents ?? 100);
        const countResp = await supabase.from("agents").select("*", { head: true, count: "exact" }).neq("status", "ARCHIVED");
        if (countResp.error) throw new AppError(countResp.error.message);
        const existingCount = typeof countResp.count === "number" ? countResp.count : 0;
        if (existingCount >= maxAgents) {
          throw new AppError(`Agent capacity reached (${existingCount}/${maxAgents})`);
        }

        // normalize skills (non-blocking warning for unknown skills)
        const validSkills = ["python", "javascript", "typescript", "github", "database", "testing", "documentation", "api-design", "deployment", "security", "ai", "mining", "analytics"];
        const skills = Array.isArray(payload.skills) ? payload.skills.map((s: string) => String(s)) : [];
        const invalidSkills = skills.filter((s: string) => !validSkills.includes(s.toLowerCase()));
        if (invalidSkills.length > 0) {
          console.warn("[agent-manager] spawn_agent unknown skills (allowed):", invalidSkills);
        }

        // check existing agent by name
        const check = await supabase.from("agents").select("*").eq("name", payload.name).maybeSingle();
        if (check.error) throw new AppError(check.error.message);
        if (check.data) {
          console.info("[agent-manager] spawn_agent - agent exists, returning existing");
          result = { ...check.data, message: "Agent already exists", wasExisting: true };
          break;
        }

        // create agent
        const agentId = payload.id ?? `agent-${Date.now()}`;
        const insertBody = {
          id: agentId,
          name: payload.name,
          role: String(payload.role).toLowerCase(),
          status: "IDLE",
          skills,
          metadata: {
            spawned_by: payload.spawned_by ?? "eliza",
            spawn_reason: payload.rationale ?? payload.spawn_reason ?? null,
            created_at: new Date().toISOString(),
            version: payload.version ?? "1.0",
            ...(payload.metadata || {}),
          },
          max_concurrent_tasks: payload.max_concurrent_tasks ?? 3,
          current_workload: 0,
        };

        const inserted = await supabase.from("agents").insert(insertBody).select().single();
        if (inserted.error) {
          console.error("[agent-manager] spawn_agent db error:", inserted.error);
          throw new AppError(inserted.error.message || "Agent insert failed");
        }

        // decision & activity logs
        await supabase.from("decisions").insert({
          id: `decision-${Date.now()}`,
          agent_id: "eliza",
          decision: `Spawned new agent: ${inserted.data.name}`,
          rationale: payload.rationale ?? "Spawned via spawn_agent",
        });
        await supabase.from("eliza_activity_log").insert({
          activity_type: "agent_spawned",
          title: `Spawned Agent: ${inserted.data.name}`,
          description: `role: ${inserted.data.role}`,
          metadata: { agent_id: inserted.data.id, skills: inserted.data.skills },
          status: "completed",
        });

        // optional initial calibration task
        if (payload.auto_assign_initial_task) {
          await supabase.from("tasks").insert({
            id: `task-${Date.now()}`,
            title: `${inserted.data.name} - Initial Calibration`,
            description: "Initial onboarding and calibration",
            repo: "XMRT-Ecosystem",
            category: "ops",
            stage: "PLAN",
            status: "PENDING",
            priority: 3,
            assignee_agent_id: inserted.data.id,
          });
        }

        result = inserted.data;
        break;
      }

      // ------------------------
      // UPDATE AGENT STATUS
      // ------------------------
      case "update_agent_status": {
        const { agent_id, status } = data ?? {};
        if (!agent_id || !status) throw new ValidationError("update_agent_status requires agent_id and status");

        // Validate status
        if (!(VALID_AGENT_STATUSES as readonly string[]).includes(String(status).toUpperCase())) {
          throw new ValidationError(`Invalid status "${status}". Must be one of: ${VALID_AGENT_STATUSES.join(", ")}`);
        }

        const updateResp = await supabase.from("agents").update({ status }).eq("id", agent_id).select().single();
        if (updateResp.error) throw new AppError(updateResp.error.message);
        result = updateResp.data;
        break;
      }

      // ------------------------
      // ASSIGN TASK
      // ------------------------
      case "assign_task": {
        let taskData = data ?? {};
        // support data in root fields by restructure
        if (!taskData || Object.keys(taskData).length === 0) {
          throw new ValidationError("assign_task requires a data object with title, description, category. Either provide assignee_agent_id OR set auto_assign: true");
        }

        const { auto_assign = false } = taskData;

        // Adjust required fields based on auto_assign
        const requiredFields = auto_assign
          ? ["title", "description", "category"]  // No agent required for auto-assign
          : ["title", "description", "category", "assignee_agent_id"];

        for (const f of requiredFields) {
          if (!taskData[f]) {
            throw new ValidationError(
              `assign_task missing required field: ${f}. ` +
              `Required fields: ${requiredFields.join(', ')}. ` +
              `Tip: Use auto_assign: true to automatically assign to least-loaded agent.`
            );
          }
        }

        // Handle auto-assignment if requested
        let assignedAgentId = taskData.assignee_agent_id;

        if (auto_assign && !assignedAgentId) {
          // Find best available agent using weighted scoring (least workload first)
          const { data: availableAgents, error: agentError } = await supabase
            .from("agents")
            .select("id, name, current_workload, max_concurrent_tasks, status")
            .in("status", ["IDLE", "BUSY"])
            .is("archived_at", null)
            .order("current_workload", { ascending: true })
            .limit(10);

          if (agentError) {
            console.error("[agent-manager] assign_task auto-assign agent lookup error:", agentError);
            throw new AppError(`Failed to find agents for auto-assignment: ${agentError.message}`);
          }

          if (!availableAgents || availableAgents.length === 0) {
            throw new AppError("No available agents for auto-assignment. All agents are ARCHIVED, ERROR, or OFFLINE.");
          }

          // Find agent with capacity (workload < max_concurrent_tasks)
          const agentWithCapacity = availableAgents.find(
            (a) => (a.current_workload ?? 0) < (a.max_concurrent_tasks ?? 3)
          );

          if (agentWithCapacity) {
            assignedAgentId = agentWithCapacity.id;
            console.info("[agent-manager] assign_task auto-assigned to:", agentWithCapacity.name, "workload:", agentWithCapacity.current_workload);
          } else {
            // Fall back to least-loaded agent even if at capacity
            assignedAgentId = availableAgents[0].id;
            console.warn("[agent-manager] assign_task all agents at capacity, assigning to least-loaded:", availableAgents[0].name);
          }
        }

        // Final validation
        if (!assignedAgentId) {
          throw new ValidationError("assign_task requires assignee_agent_id OR auto_assign: true");
        }

        // prevent duplicate pending tasks for same assignee + title
        const existing = await supabase
          .from("tasks")
          .select("*")
          .eq("title", taskData.title)
          .eq("assignee_agent_id", assignedAgentId)
          .in("status", ["PENDING", "IN_PROGRESS"])
          .maybeSingle();

        if (existing.error) throw new AppError(existing.error.message);
        if (existing.data) {
          result = { ...existing.data, message: "Task already exists", wasExisting: true };
          break;
        }

        const insertTask = {
          id: taskData.task_id ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          title: taskData.title,
          description: taskData.description,
          repo: taskData.repo ?? "XMRT-Ecosystem",
          category: normalizeCategory(taskData.category),
          stage: normalizeStage(taskData.stage),
          status: "PENDING",
          priority: taskData.priority ?? 5,
          assignee_agent_id: assignedAgentId,
          created_by_user_id: actorUserId || null, // Use resolved actor
          organization_id: actorOrgId || null, // Use resolved org
          metadata: {
            auto_assigned: auto_assign,
            ...(taskData.metadata || {}),
          },
        };

        const created = await supabase.from("tasks").insert(insertTask).select().single();
        if (created.error) {
          console.error("[agent-manager] assign_task insert error:", created.error);
          throw new AppError(created.error.message || "Task creation failed (possible RLS)");
        }
        if (!created.data) {
          throw new AppError("Task creation returned null (possible RLS)");
        }

        // update agent to BUSY and increment workload
        await supabase
          .from("agents")
          .update({
            status: "BUSY",
            current_workload: supabase.rpc ? undefined : undefined // Note: workload tracked by triggers
          })
          .eq("id", assignedAgentId);

        // activity log
        await supabase.from("eliza_activity_log").insert({
          activity_type: "task_created",
          title: `Created Task: ${created.data.title}`,
          description: created.data.description,
          metadata: {
            task_id: created.data.id,
            assignee: created.data.assignee_agent_id,
            category: created.data.category,
            auto_assigned: auto_assign,
          },
          status: "completed",
        });

        result = created.data;
        break;
      }

      // ------------------------
      // LIST TASKS (with ordering)
      // ------------------------
      case "list_tasks": {
        const { status, agent_id, limit = 50, offset = 0, order_by } = data ?? {};
        if (status && !(VALID_TASK_STATUSES as readonly string[]).includes(String(status).toUpperCase())) {
          throw new ValidationError(`status must be one of: ${VALID_TASK_STATUSES.join(", ")}`);
        }
        if (typeof limit !== "number" || limit < 1 || limit > 1000) throw new ValidationError("limit must be 1..1000");
        if (typeof offset !== "number" || offset < 0) throw new ValidationError("offset must be >= 0");

        let query = supabase.from("tasks").select("*");

        if (status) query = query.eq("status", status);
        if (agent_id) query = query.eq("assignee_agent_id", agent_id);

        if (order_by?.column) {
          query = query.order(order_by.column, { ascending: !!order_by.ascending });
        } else {
          query = query.order("created_at", { ascending: false });
        }

        const q = await query.range(offset, offset + limit - 1);
        const tasks = q.data;
        if (q.error) throw new AppError(q.error.message || "DB error");
        result = tasks ?? [];
        break;
      }

      // ------------------------
      // UPDATE TASK STATUS
      // ------------------------
      case "update_task_status":
      case "set_task_status": {
        const { task_id, status, completion_data, resolution_notes, items_completed = [] } = data ?? {};
        if (!task_id || !status) throw new ValidationError("update_task_status requires task_id and status");

        // Validate status
        if (!(VALID_TASK_STATUSES as readonly string[]).includes(String(status).toUpperCase())) {
          throw new ValidationError(`Invalid status "${status}". Must be one of: ${VALID_TASK_STATUSES.join(", ")}`);
        }

        const fetched = await supabase.from("tasks").select("*").eq("id", task_id).single();
        if (fetched.error) throw new AppError(fetched.error.message);
        const task = fetched.data;
        const oldStatus = task?.status;

        // Build update payload
        const updatePayload: any = {
          updated_at: new Date().toISOString(),
          // Safely merge completion_data into metadata to avoid PGRST204 (Column not found)
          metadata: {
            ...(task?.metadata ?? {}),
            ...(completion_data ?? {})
          }
        };

        // If completing, set progress to 100% and mark all checklist items complete
        const completionStatuses = ["COMPLETED", "DONE"];
        if (completionStatuses.includes(status.toUpperCase())) {
          updatePayload.progress_percentage = 100;
          updatePayload.completed_at = new Date().toISOString();

          // Mark all checklist items as completed
          const checklist = task?.metadata?.checklist || [];
          if (checklist.length > 0) {
            updatePayload.completed_checklist_items = checklist;
          }

          if (resolution_notes) {
            updatePayload.resolution_notes = resolution_notes;
          }
        }

        // If items_completed provided, merge with existing
        if (items_completed.length > 0) {
          const existing = task?.completed_checklist_items || [];
          const merged = [...new Set([...existing, ...items_completed])];
          updatePayload.completed_checklist_items = merged;

          const checklist = task?.metadata?.checklist || [];
          if (checklist.length > 0) {
            updatePayload.progress_percentage = Math.round((merged.length / checklist.length) * 100);
          }
        }

        const updated = await supabase.from("tasks").update(updatePayload).eq("id", task_id).select().single();
        if (updated.error) throw new AppError(updated.error.message);

        // Record metrics if task is finished
        if (["COMPLETED", "DONE", "FAILED"].includes(status.toUpperCase()) && task?.assignee_agent_id) {
          try {
            await recordTaskCompletion(
              task_id,
              task.assignee_agent_id,
              status.toUpperCase(),
              task.category || 'other',
              task.metadata
            );
          } catch (e) {
            console.error("[agent-manager] Failed to record task completion metric:", e);
          }
        }


        // free agent if COMPLETED/DONE/FAILED/CANCELLED
        const freeAgentStatuses = ["COMPLETED", "DONE", "FAILED", "CANCELLED"];
        if (freeAgentStatuses.includes(status.toUpperCase()) && task?.assignee_agent_id) {
          await supabase.from("agents").update({ status: "IDLE" }).eq("id", task.assignee_agent_id);
        }

        // activity log
        await supabase.from("eliza_activity_log").insert({
          activity_type: "task_status_updated",
          title: `Task Status Updated: ${task?.title ?? task_id}`,
          description: `Status changed from ${oldStatus} to ${status}${resolution_notes ? ` - ${resolution_notes}` : ''}`,
          task_id: task_id,
          agent_id: task?.assignee_agent_id,
          metadata: {
            task_id: updated.data.id,
            old_status: oldStatus,
            new_status: status,
            completion_data,
            resolution_notes,
            progress_percentage: updatePayload.progress_percentage
          },
          status: "completed",
        });

        result = updated.data;
        break;
      }

      // ------------------------
      // REPORT PROGRESS (enhanced to update task checklist)
      // ------------------------
      case "report_progress": {
        const { agent_id, task_id, progress, notes, items_completed = [], work_summary } = data ?? {};
        if (!agent_id || !task_id) throw new ValidationError("report_progress requires agent_id and task_id");

        // Log agent activity
        const inserted = await supabase.from("agent_activities").insert({
          agent_id,
          activity: `Progress: ${progress ?? "N/A"}. Notes: ${notes ?? "N/A"}`,
          level: "info",
        }).select().single();
        if (inserted.error) throw new AppError(inserted.error.message);

        // If items completed or work summary provided, update task progress via STAE
        if (items_completed.length > 0 || work_summary || notes) {
          try {
            const staeResponse = await callEdgeFunction('suite-task-automation-engine', {
              action: 'document_agent_progress',
              data: {
                task_id,
                agent_id,
                items_completed,
                work_summary: work_summary || notes,
                progress_note: notes
              }
            });

            if (staeResponse.success) {
              console.info("[agent-manager] report_progress updated task via STAE:", staeResponse);
            }
          } catch (staeError) {
            console.warn("[agent-manager] report_progress STAE update failed (non-blocking):", staeError);
          }
        }

        // Also update the task's progress_percentage if numeric progress provided
        if (typeof progress === 'number' && progress >= 0 && progress <= 100) {
          await supabase.from("tasks").update({
            progress_percentage: progress,
            updated_at: new Date().toISOString()
          }).eq("id", task_id);
        }

        result = { ...inserted.data, task_updated: true };
        break;
      }

      // ------------------------
      // REQUEST ASSIGNMENT
      // ------------------------
      case "request_assignment": {
        const { agent_id } = data ?? {};
        if (!agent_id) throw new ValidationError("request_assignment requires agent_id");

        // fetch oldest pending task
        const pendingTask = await supabase
          .from("tasks")
          .select("*")
          .eq("status", "PENDING")
          .is("assignee_agent_id", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (pendingTask.error) throw new AppError(pendingTask.error.message);
        if (!pendingTask.data) {
          result = { success: false, message: "No pending tasks available" };
          break;
        }

        // assign task
        const assignment = await supabase
          .from("tasks")
          .update({ assignee_agent_id: agent_id, status: "IN_PROGRESS" })
          .eq("id", pendingTask.data.id)
          .select()
          .single();
        if (assignment.error) throw new AppError(assignment.error.message);

        // mark agent busy
        await supabase.from("agents").update({ status: "BUSY" }).eq("id", agent_id);

        // activity log
        await supabase.from("eliza_activity_log").insert({
          activity_type: "task_assigned",
          title: `Auto-assigned Task: ${assignment.data.title}`,
          description: `Assigned to agent ${agent_id}`,
          metadata: { task_id: assignment.data.id, agent_id },
          status: "completed",
        });

        result = { success: true, task: assignment.data };
        break;
      }

      // ------------------------
      // GET AGENT WORKLOAD
      // ------------------------
      case "get_agent_workload": {
        const { agent_id } = data ?? {};
        if (!agent_id) throw new ValidationError("get_agent_workload requires agent_id");

        const tasksResp = await supabase.from("tasks").select("*").eq("assignee_agent_id", agent_id).in("status", ["PENDING", "IN_PROGRESS", "CLAIMED"]);
        if (tasksResp.error) throw new AppError(tasksResp.error.message);
        result = { success: true, active_tasks: tasksResp.data?.length ?? 0, tasks: tasksResp.data ?? [] };
        break;
      }

      // ------------------------
      // GET AGENT METRICS
      // ------------------------
      case "get_agent_metrics": {
        const { agent_id } = data ?? {};
        if (!agent_id) throw new ValidationError("get_agent_metrics requires agent_id");

        try {
          const metrics = await getAgentMetrics(agent_id);
          result = { success: true, ...metrics };
        } catch (e: any) {
          throw new AppError(`Failed to get metrics: ${e.message}`);
        }
        break;
      }


      // ------------------------
      // LOG DECISION
      // ------------------------
      case "log_decision": {
        const { agent_id, decision, rationale, task_id } = data ?? {};
        if (!agent_id || !decision || !rationale) throw new ValidationError("log_decision requires agent_id, decision, rationale");
        const inserted = await supabase.from("decisions").insert({
          id: `decision-${Date.now()}`,
          agent_id,
          decision,
          rationale,
          task_id: task_id ?? null,
        }).select().single();
        if (inserted.error) throw new AppError(inserted.error.message);
        result = inserted.data;
        break;
      }

      // ------------------------
      // UPDATE AGENT SKILLS
      // ------------------------
      case "update_agent_skills": {
        const { agent_id, skills } = data ?? {};
        if (!agent_id || !Array.isArray(skills)) throw new ValidationError("update_agent_skills requires agent_id and skills array");
        const updated = await supabase.from("agents").update({ skills }).eq("id", agent_id).select().single();
        if (updated.error) throw new AppError(updated.error.message);
        result = { success: true, agent: updated.data };
        break;
      }

      // ------------------------
      // UPDATE AGENT ROLE
      // ------------------------
      case "update_agent_role": {
        const { agent_id, role } = data ?? {};
        if (!agent_id || !role) throw new ValidationError("update_agent_role requires agent_id and role");

        // Validate role
        if (!(VALID_AGENT_ROLES as readonly string[]).includes(String(role).toLowerCase())) {
          throw new ValidationError(`Invalid role "${role}". Must be one of: ${VALID_AGENT_ROLES.join(", ")}`);
        }

        const updated = await supabase.from("agents").update({ role: role.toLowerCase() }).eq("id", agent_id).select().single();
        if (updated.error) throw new AppError(updated.error.message);
        result = { success: true, agent: updated.data };
        break;
      }

      // ------------------------
      // DELETE AGENT
      // ------------------------
      case "delete_agent": {
        const { agent_id } = data ?? {};
        if (!agent_id) throw new ValidationError("delete_agent requires agent_id");
        const del = await supabase.from("agents").delete().eq("id", agent_id);
        if (del.error) throw new AppError(del.error.message);
        result = { success: true, message: `Agent ${agent_id} deleted` };
        break;
      }

      // ------------------------
      // SEARCH AGENTS
      // ------------------------
      case "search_agents": {
        const { skills, role, status } = data ?? {};
        let agentQuery: any = supabase.from("agents").select("*");
        if (skills) agentQuery = agentQuery.contains("skills", Array.isArray(skills) ? skills : [skills]);
        if (role) agentQuery = agentQuery.ilike("role", `%${role}%`);
        if (status) agentQuery = agentQuery.eq("status", status);
        const q = await agentQuery;
        if (q.error) throw new AppError(q.error.message);
        result = { success: true, agents: q.data ?? [] };
        break;
      }

      // ------------------------
      // UPDATE TASK
      // ------------------------
      case "update_task": {
        const { task_id, updates } = data ?? {};
        if (!task_id || !updates) throw new ValidationError("update_task requires task_id and updates");

        // Normalize category and stage if present
        if (updates.category) updates.category = normalizeCategory(updates.category);
        if (updates.stage) updates.stage = normalizeStage(updates.stage);

        const updated = await supabase.from("tasks").update(updates).eq("id", task_id).select().single();
        if (updated.error) throw new AppError(updated.error.message);
        result = { success: true, task: updated.data };
        break;
      }

      // ------------------------
      // SEARCH TASKS
      // ------------------------
      case "search_tasks": {
        const { category, repo, stage, status, min_priority, max_priority } = data ?? {};
        let taskQuery: any = supabase.from("tasks").select("*");
        if (category) taskQuery = taskQuery.eq("category", normalizeCategory(category));
        if (repo) taskQuery = taskQuery.eq("repo", repo);
        if (stage) taskQuery = taskQuery.eq("stage", normalizeStage(stage));
        if (status) taskQuery = taskQuery.eq("status", status);
        if (min_priority !== undefined) taskQuery = taskQuery.gte("priority", min_priority);
        if (max_priority !== undefined) taskQuery = taskQuery.lte("priority", max_priority);
        const q = await taskQuery;
        if (q.error) throw new AppError(q.error.message);
        result = { success: true, tasks: q.data ?? [] };
        break;
      }

      // ------------------------
      // BULK UPDATE TASKS
      // ------------------------
      case "bulk_update_tasks": {
        const { task_ids, updates } = data ?? {};
        if (!Array.isArray(task_ids) || !updates) throw new ValidationError("bulk_update_tasks requires task_ids array and updates");

        // Normalize category and stage if present
        if (updates.category) updates.category = normalizeCategory(updates.category);
        if (updates.stage) updates.stage = normalizeStage(updates.stage);

        const q = await supabase.from("tasks").update(updates).in("id", task_ids).select();
        if (q.error) throw new AppError(q.error.message);
        result = { success: true, updated_count: q.data?.length ?? 0, tasks: q.data ?? [] };
        break;
      }

      // ------------------------
      // DELETE TASK
      // ------------------------
      case "delete_task": {
        const { task_id, reason } = data ?? {};
        if (!task_id) throw new ValidationError("delete_task requires task_id");
        const deleted = await supabase.from("tasks").delete().eq("id", task_id).select().single();
        if (deleted.error) throw new AppError(deleted.error.message);
        // log deletion
        await supabase.from("eliza_activity_log").insert({
          activity_type: "task_deleted",
          title: `Deleted Task: ${deleted.data.title}`,
          description: `Reason: ${reason ?? "Not provided"}`,
          metadata: { task_id: deleted.data.id, reason },
          status: "completed",
        });
        // free agent if assigned
        if (deleted.data.assignee_agent_id) {
          await supabase.from("agents").update({ status: "IDLE" }).eq("id", deleted.data.assignee_agent_id);
        }
        result = { success: true, deleted_task: deleted.data };
        break;
      }

      // ------------------------
      // REASSIGN TASK
      // ------------------------
      case "reassign_task": {
        const { task_id, new_assignee_id, reason } = data ?? {};
        if (!task_id || !new_assignee_id) throw new ValidationError("reassign_task requires task_id and new_assignee_id");

        const fetch = await supabase.from("tasks").select("*").eq("id", task_id).single();
        if (fetch.error) throw new AppError(fetch.error.message);
        const oldAssignee = fetch.data?.assignee_agent_id;

        const reassigned = await supabase.from("tasks").update({ assignee_agent_id: new_assignee_id }).eq("id", task_id).select().single();
        if (reassigned.error) throw new AppError(reassigned.error.message);

        if (oldAssignee) await supabase.from("agents").update({ status: "IDLE" }).eq("id", oldAssignee);
        await supabase.from("agents").update({ status: "BUSY" }).eq("id", new_assignee_id);

        await supabase.from("eliza_activity_log").insert({
          activity_type: "task_updated",
          title: `Reassigned Task: ${reassigned.data.title}`,
          description: `From ${oldAssignee ?? "unassigned"} to ${new_assignee_id}. ${reason ?? ""}`,
          metadata: { task_id: reassigned.data.id, old_assignee: oldAssignee, new_assignee: new_assignee_id, reason },
          status: "completed",
        });

        result = reassigned.data;
        break;
      }

      // ------------------------
      // UPDATE TASK DETAILS
      // ------------------------
      case "update_task_details": {
        const fieldsToUpdate: any = {};
        if (!data?.task_id) throw new ValidationError("update_task_details requires task_id");
        if (data.title) fieldsToUpdate.title = data.title;
        if (data.description) fieldsToUpdate.description = data.description;
        if (data.priority !== undefined) fieldsToUpdate.priority = data.priority;
        if (data.category) fieldsToUpdate.category = normalizeCategory(data.category);
        if (data.stage) fieldsToUpdate.stage = normalizeStage(data.stage);
        if (data.repo) fieldsToUpdate.repo = data.repo;

        const updated = await supabase.from("tasks").update(fieldsToUpdate).eq("id", data.task_id).select().single();
        if (updated.error) throw new AppError(updated.error.message);
        await supabase.from("eliza_activity_log").insert({
          activity_type: "task_updated",
          title: `Updated Task Details: ${updated.data.title}`,
          description: `Updated fields: ${Object.keys(fieldsToUpdate).join(", ")}`,
          metadata: { task_id: updated.data.id, updated_fields: fieldsToUpdate },
          status: "completed",
        });

        result = updated.data;
        break;
      }

      // ------------------------
      // GET TASK DETAILS
      // ------------------------
      case "get_task_details": {
        const { task_id } = data ?? {};
        if (!task_id) throw new ValidationError("get_task_details requires task_id");
        const fetched = await supabase.from("tasks").select("*").eq("id", task_id).single();
        if (fetched.error) throw new AppError(fetched.error.message);
        result = fetched.data;
        break;
      }

      // ------------------------
      // CLEANUP DUPLICATE AGENTS
      // ------------------------
      case "cleanup_duplicate_agents": {
        const allAgentsResp = await supabase.from("agents").select("*").order("created_at", { ascending: true });
        if (allAgentsResp.error) throw new AppError(allAgentsResp.error.message);

        const agentsByName = new Map<string, any>();
        const duplicatesToDelete: string[] = [];

        for (const a of allAgentsResp.data ?? []) {
          if (!agentsByName.has(a.name)) agentsByName.set(a.name, a);
          else duplicatesToDelete.push(a.id);
        }

        if (duplicatesToDelete.length > 0) {
          const del = await supabase.from("agents").delete().in("id", duplicatesToDelete);
          if (del.error) throw new AppError(del.error.message);
          await supabase.from("eliza_activity_log").insert({
            activity_type: "cleanup",
            title: "Cleaned up duplicate agents",
            description: `Removed ${duplicatesToDelete.length} duplicate agents`,
            metadata: { deleted_ids: duplicatesToDelete },
            status: "completed",
          });
        }

        result = { success: true, duplicatesRemoved: duplicatesToDelete.length, deletedIds: duplicatesToDelete };
        break;
      }

      // ------------------------
      // AUTONOMOUS WORKFLOW EXECUTION (simplified orchestrator with DeepSeek AI)
      // ------------------------
      case "execute_autonomous_workflow": {
        const { workflow_steps, agent_id, context } = data ?? {};
        if (!Array.isArray(workflow_steps) || workflow_steps.length === 0) throw new ValidationError("execute_autonomous_workflow requires workflow_steps array");
        console.info(`[agent-manager] Starting autonomous workflow for agent ${agent_id}`);
        const workflowResults: any[] = [];
        let currentContext = context ?? {};

        for (let i = 0; i < workflow_steps.length; i++) {
          const step = workflow_steps[i];
          try {
            console.info(`[agent-manager] workflow step ${i + 1}/${workflow_steps.length}:`, step.action);
            let stepResult: any = null;

            switch (step.action) {
              case "analyze": {
                // AI analysis via unified fallback cascade
                const prompt = `Analyze: ${JSON.stringify(step.data ?? {})}\nContext: ${JSON.stringify(currentContext ?? {})}\nProvide a short analysis and next decision.`;
                const gen = await callAIWithResilience(prompt, { temperature: 0.2, maxTokens: 512 });
                stepResult = { text: gen.text, raw: gen.raw };
                break;
              }

              case "execute_python": {
                // Direct call to python-executor edge function
                const resp = await callEdgeFunction("python-executor", { code: step.code, agent_id });
                stepResult = resp;
                break;
              }

              case "github_operation": {
                // Direct call to github-integration edge function
                const resp = await callEdgeFunction("github-integration", { action: step.github_action, ...step.github_data });
                stepResult = resp;
                break;
              }

              case "create_subtask": {
                const inserted = await supabase.from("tasks").insert({
                  id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                  title: step.task_title,
                  description: step.task_description,
                  repo: step.repo ?? "XMRT-Ecosystem",
                  category: normalizeCategory(step.category),
                  stage: "PLAN",
                  status: "PENDING",
                  priority: step.priority ?? 5,
                  assignee_agent_id: step.assigned_agent ?? null,
                }).select().single();
                if (inserted.error) throw new AppError(inserted.error.message);
                stepResult = { task: inserted.data, assigned: !!step.assigned_agent };
                break;
              }

              case "query_knowledge": {
                const queryFilters = step.query_filters ?? "";
                const kb = await supabase.from("knowledge_entities").select("*").or(queryFilters).limit(10);
                if (kb.error) throw new AppError(kb.error.message);
                stepResult = { knowledge_items: kb.data };
                break;
              }

              case "log_decision": {
                const dec = await supabase.from("decisions").insert({
                  id: `decision-${Date.now()}`,
                  agent_id,
                  decision: step.decision,
                  rationale: step.rationale,
                }).select().single();
                if (dec.error) throw new AppError(dec.error.message);
                stepResult = { decision: dec.data };
                break;
              }

              default: {
                stepResult = { status: "skipped", reason: "Unknown step action" };
              }
            }

            workflowResults.push({
              step: i + 1,
              action: step.action,
              result: stepResult,
              status: "completed",
              timestamp: new Date().toISOString(),
            });

            // update context
            currentContext = { ...currentContext, [`step_${i + 1}_result`]: stepResult };

            // log
            await supabase.from("eliza_activity_log").insert({
              activity_type: "autonomous_step",
              title: `Autonomous Step ${i + 1}: ${step.action}`,
              description: `Completed by agent ${agent_id}`,
              metadata: { step: i + 1, action: step.action, result: stepResult },
              status: "completed",
            });
          } catch (stepErr: any) {
            console.error(`[agent-manager] Error in workflow step ${i + 1}:`, stepErr);
            workflowResults.push({
              step: i + 1,
              action: step.action,
              error: stepErr?.message ?? String(stepErr),
              status: "failed",
              timestamp: new Date().toISOString(),
            });

            // log failure
            await supabase.from("eliza_activity_log").insert({
              activity_type: "autonomous_step",
              title: `Autonomous Step ${i + 1} Failed: ${step.action}`,
              description: String(stepErr?.message ?? stepErr),
              metadata: { step: i + 1, action: step.action, error: String(stepErr?.message ?? stepErr) },
              status: "failed",
            });

            if (step.critical) {
              break;
            }
          }
        }

        return new Response(JSON.stringify({ ok: true, data: { workflow_completed: true, steps_executed: workflowResults.length, results: workflowResults, final_context: currentContext } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ------------------------
      // GET AGENT BY NAME
      // ------------------------
      case "get_agent_by_name": {
        const { name } = data ?? {};
        if (!name) throw new ValidationError("get_agent_by_name requires name");

        const { data: foundAgent, error: findErr } = await supabase
          .from("agents")
          .select("*")
          .ilike("name", name)
          .maybeSingle();

        if (findErr) throw new AppError(findErr.message);
        result = foundAgent || { success: false, message: `No agent found with name: ${name}` };
        break;
      }

      // ------------------------
      // GET AGENT STATS
      // ------------------------
      case "get_agent_stats": {
        const { agent_id, time_window_days = 7 } = data ?? {};
        if (!agent_id) throw new ValidationError("get_agent_stats requires agent_id");

        const { data: statsData, error: statsErr } = await supabase.rpc("calculate_agent_performance", {
          p_agent_id: agent_id,
          p_time_window_days: time_window_days,
        });

        if (statsErr) throw new AppError(statsErr.message);
        result = { success: true, agent_id, time_window_days, stats: statsData };
        break;
      }

      // ------------------------
      // BATCH SPAWN AGENTS
      // ------------------------
      case "batch_spawn_agents": {
        const { agents: agentsConfig, spawned_by = "batch_operation" } = data ?? {};
        if (!Array.isArray(agentsConfig) || agentsConfig.length === 0) {
          throw new ValidationError("batch_spawn_agents requires non-empty agents array");
        }

        const spawnedAgents: any[] = [];
        const spawnErrors: any[] = [];

        for (const cfg of agentsConfig) {
          try {
            // Validate role
            const role = String(cfg.role || "developer").toLowerCase();
            if (!(VALID_AGENT_ROLES as readonly string[]).includes(role)) {
              spawnErrors.push({ name: cfg.name, error: `Invalid role: ${cfg.role}` });
              continue;
            }

            const agentId = cfg.id || `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const { data: newAgent, error: insertErr } = await supabase
              .from("agents")
              .insert({
                id: agentId,
                name: cfg.name,
                role,
                status: "IDLE",
                skills: cfg.skills || [],
                metadata: {
                  spawned_by,
                  spawn_reason: cfg.spawn_reason || "Batch spawn",
                  created_at: new Date().toISOString(),
                  version: cfg.version || "1.0",
                },
              })
              .select()
              .single();

            if (insertErr) {
              spawnErrors.push({ name: cfg.name, error: insertErr.message });
            } else {
              spawnedAgents.push(newAgent);
              // Log each agent spawn
              await supabase.from("agent_activities").insert({
                agent_id: newAgent.id,
                activity: `Agent spawned via batch operation by ${spawned_by}`,
                level: "info",
              });
            }
          } catch (err: any) {
            spawnErrors.push({ name: cfg.name, error: err?.message || String(err) });
          }
        }

        // Activity log for batch operation
        await supabase.from("eliza_activity_log").insert({
          activity_type: "batch_spawn",
          title: `Batch Spawned ${spawnedAgents.length} Agents`,
          description: `Spawned by ${spawned_by}. Failed: ${spawnErrors.length}`,
          metadata: { spawned_count: spawnedAgents.length, failed_count: spawnErrors.length, spawned_by },
          status: spawnErrors.length === 0 ? "completed" : "partial",
        });

        result = {
          success: true,
          spawned: spawnedAgents.length,
          failed: spawnErrors.length,
          agents: spawnedAgents,
          errors: spawnErrors,
        };
        break;
      }

      // ------------------------
      // ARCHIVE AGENT
      // ------------------------
      case "archive_agent": {
        const { agent_id, reason = "No reason provided" } = data ?? {};
        if (!agent_id) throw new ValidationError("archive_agent requires agent_id");

        const { data: archivedAgent, error: archiveErr } = await supabase
          .from("agents")
          .update({
            status: "ARCHIVED",
            archived_at: new Date().toISOString(),
            archived_reason: reason,
          })
          .eq("id", agent_id)
          .select()
          .single();

        if (archiveErr) throw new AppError(archiveErr.message);

        // Activity logs
        await supabase.from("agent_activities").insert({
          agent_id,
          activity: `Agent archived. Reason: ${reason}`,
          level: "warn",
        });

        await supabase.from("eliza_activity_log").insert({
          activity_type: "agent_archived",
          title: `Archived Agent: ${archivedAgent?.name || agent_id}`,
          description: `Reason: ${reason}`,
          metadata: { agent_id, reason },
          status: "completed",
        });

        result = { success: true, agent: archivedAgent };
        break;
      }

      // ------------------------
      // PROVISION OPENCLAW AGENT
      // ------------------------
      case "provision_openclaw_agent": {
        const payload = data ?? {};
        const required = ["name", "id", "role"];
        for (const f of required) {
          if (!payload[f]) throw new ValidationError(`provision_openclaw_agent requires ${f}`);
        }

        const agentId = payload.id;
        console.info(`[agent-manager] Provisioning OpenClaw agent: ${agentId}`);

        // Check if agent already exists
        const check = await supabase.from("agents").select("*").eq("id", agentId).maybeSingle();
        if (check.error) throw new AppError(check.error.message);
        if (check.data) {
          throw new AppError(`Agent with ID ${agentId} already exists.`);
        }

        // Validate role
        const role = String(payload.role).toLowerCase();
        if (!(VALID_AGENT_ROLES as readonly string[]).includes(role)) {
          throw new ValidationError(`Invalid role "${role}". Must be one of: ${VALID_AGENT_ROLES.join(", ")}`);
        }

        // Insert new agent
        const insertBody = {
          id: agentId,
          name: payload.name,
          role: role,
          status: "IDLE",
          metadata: {
            agent_type: 'openclaw',
            source: 'openclaw',
            provisioned_at: new Date().toISOString(),
            description: payload.description || null,
            priority: payload.priority || null,
            // Bridge connection details - used by openclaw-poller
            gateway_url: payload.gateway_url || 'http://localhost:18789',
            session_key: payload.session_key || 'agent:main:main',
            ...(payload.metadata || {}),
          },
          current_workload: 0,
          // Default max tasks if not provided
          max_concurrent_tasks: payload.max_concurrent_tasks ?? 3,
        };

        const inserted = await supabase.from("agents").insert(insertBody).select().single();
        if (inserted.error) {
          console.error("[agent-manager] provision_openclaw_agent insert error:", inserted.error);
          throw new AppError(inserted.error.message || "Agent provision failed");
        }

        // Activity log
        await supabase.from("eliza_activity_log").insert({
          activity_type: "agent_provisioned",
          title: `Provisioned OpenClaw Agent: ${inserted.data.name}`,
          description: `ID: ${inserted.data.id}, Role: ${inserted.data.role}`,
          metadata: { agent_id: inserted.data.id, source: 'openclaw' },
          status: "completed",
        });

        result = { success: true, agent: inserted.data };
        break;
      }

      // ------------------------
      // FALLTHROUGH: unknown action
      // ------------------------
      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }

    // final success envelope
    return okResponse(result);
  } catch (err: any) {
    console.error("[agent-manager] error:", err);
    if (err instanceof ValidationError) return errorResponse(err.message, 400);
    if (err instanceof AppError) return errorResponse(err.message, 500);
    // unknown/unhandled
    return errorResponse("internal error", 500);
  }
});
