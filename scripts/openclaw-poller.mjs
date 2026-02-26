#!/usr/bin/env node
/**
 * openclaw-poller.mjs
 * ─────────────────────────────────────────────────────────────
 * Local bridge between Suite AI (Supabase) and the local
 * OpenClaw agent gateway.
 *
 * HOW IT WORKS:
 *   1. Polls Supabase every POLL_INTERVAL_MS for tasks assigned
 *      to any agent with metadata->>'agent_type' = 'openclaw'
 *      that have status PENDING or stuck IN_PROGRESS.
 *   2. For each new task, spawns:
 *        openclaw agent --agent main --message "..." --json
 *      asynchronously (non-blocking) so multiple tasks can run in parallel.
 *   3. Writes the result back as a task status update + activity log.
 *
 * SETUP:
 *   1. Set SUPABASE_SERVICE_ROLE_KEY in suite/.env or environment
 *   2. Run:  node suite/scripts/openclaw-poller.mjs
 *   3. Keep it running alongside OpenClaw gateway
 *
 * USAGE:
 *   node scripts/openclaw-poller.mjs
 * ─────────────────────────────────────────────────────────────
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── Config ──────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from suite directory
function loadEnv() {
    const envPath = join(__dirname, '..', '.env');
    const envLocalPath = join(__dirname, '..', '.env.local');
    const env = {};
    for (const p of [envPath, envLocalPath]) {
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const match = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"#\n]*)"?\s*(?:#.*)?$/);
            if (match) env[match[1]] = match[2].trim();
        }
    }
    return env;
}

const config = loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || config.SUPABASE_URL || 'https://vawouugtzwmejxqkeqqj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SERVICE_ROLE_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || config.VITE_SUPABASE_PUBLISHABLE_KEY;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '10000');  // 10 seconds (was 30)
const MAX_TASKS = parseInt(process.env.MAX_TASKS_PER_POLL || '5');        // up to 5 parallel tasks
const TASK_TIMEOUT_MS = parseInt(process.env.TASK_TIMEOUT_MS || '300000'); // 5 min per task
const STUCK_THRESHOLD_MS = parseInt(process.env.STUCK_THRESHOLD_MS || '600000'); // 10 min = stuck

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check suite/.env');
    process.exit(1);
}

console.log('🦞 OpenClaw Poller starting (v2 — async, retry-enabled)');
console.log(`   Supabase: ${SUPABASE_URL}`);
console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
console.log(`   Max parallel tasks: ${MAX_TASKS}`);
console.log('');

// Track tasks currently being processed to prevent double-dispatch
const processing = new Set();

// ── Supabase helpers ─────────────────────────────────────────────
async function supabaseFetch(method, path, options = {}) {
    const { params = {}, body } = options;
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...(method !== 'GET' ? { 'Prefer': 'return=representation' } : {}),
    };

    const res = await fetch(url, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json();
}

async function withRetry(fn, attempts = 3, delayMs = 2000) {
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === attempts - 1) throw err;
            console.error(`  ⚠️ Retry ${i + 1}/${attempts - 1}: ${err.message}`);
            await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
    }
}

async function supabaseGet(path, params = {}) {
    return withRetry(() => supabaseFetch('GET', path, { params }));
}

async function supabasePatch(path, filter, body) {
    return withRetry(() => supabaseFetch('PATCH', path, { params: filter, body }));
}

async function supabaseInsert(path, body) {
    return withRetry(() => supabaseFetch('POST', path, { body }));
}

/**
 * Send a notification to the user's inbox.
 * Looks up the task's created_by_user_id to target the right user.
 */
async function sendInboxMessage(task, { title, content, type = 'task_complete', priority = 3, agentId, agentName, channel = 'openclaw' }) {
    // We need the user's uuid — it's stored on the task as created_by_user_id
    const userId = task.created_by_user_id;
    if (!userId) {
        console.warn(`  ⚠️  No created_by_user_id on task ${task.id} — skipping inbox notification`);
        return;
    }
    try {
        await supabaseInsert('inbox_messages', {
            user_id: userId,
            task_id: task.id,
            title,
            content,
            type,
            priority,
            agent_id: agentId || task.assignee_agent_id || null,
            agent_name: agentName || null,
            channel,
            is_read: false,
            metadata: {
                task_title: task.title,
                task_category: task.category,
                task_stage: task.stage,
            },
        });
        console.log(`  📬 Inbox notification sent to user ${userId.slice(0, 8)}…`);
    } catch (err) {
        console.error(`  ⚠️  Failed to send inbox message:`, err.message);
    }
}

// ── OpenClaw dispatch ────────────────────────────────────────────
function buildTaskMessage(task) {
    const parts = [
        `TASK: ${task.title}`,
        task.description ? `DESCRIPTION: ${task.description}` : null,
        task.category ? `CATEGORY: ${task.category}` : null,
        task.stage ? `CURRENT STAGE: ${task.stage}` : null,
        task.priority ? `PRIORITY: ${task.priority}/10` : null,
    ].filter(Boolean);

    if (task.metadata?.checklist?.length > 0) {
        parts.push(`CHECKLIST:\n${task.metadata.checklist.map(i => `  - [ ] ${i}`).join('\n')}`);
    }

    parts.push('');
    parts.push('Please complete this task. When done, summarize what you did in 2-3 sentences for the work report.');

    return parts.join('\n');
}

/**
 * Async version of runOpenClaw — spawns process and resolves when done.
 * Non-blocking: multiple tasks can dispatch in parallel.
 */
// Full path avoids PATH resolution issues; shell:false ensures args are properly
// passed as separate argv entries (shell:true concatenates them unsafely, causing
// "too many arguments" when --message contains spaces).
const OPENCLAW_CMD = process.env.OPENCLAW_CMD
    || 'C:\\Users\\PureTrek\\AppData\\Roaming\\npm\\openclaw.cmd';

function runOpenClawAsync(message, agentMeta, taskId) {
    return new Promise((resolve) => {
        const sessionKey = agentMeta?.session_key || 'main';
        const agentName = sessionKey.split(':')[1] || 'main';

        // Use a task-scoped session ID so each task gets a FRESH, isolated context.
        // This prevents two critical bugs:
        //   1. Context accumulation (320K token overload → word salad)
        //   2. WhatsApp delivery context bleeding into pipeline tasks
        // Session ID is derived from task ID so retries share the same short session.
        const taskSessionId = taskId
            ? `poller-${taskId.slice(0, 8)}`
            : `poller-${Date.now()}`;

        console.log(`  🏃 Spawning: openclaw agent --agent ${agentName} --session-id ${taskSessionId} --message "${message.slice(0, 60)}..."`);

        const child = spawn(OPENCLAW_CMD, [
            'agent',
            '--agent', agentName,
            '--session-id', taskSessionId,
            '--message', message,
            '--json',
            // NOTE: NO --deliver flag → output stays local, never routes to WhatsApp
        ], {
            shell: false,   // ← IMPORTANT: false so args are passed as proper argv, not concatenated string
            env: process.env,
            windowsHide: true,
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            child.kill();
            resolve({ success: false, reply: null, error: 'Timeout after 5 minutes', stderr, stdout });
        }, TASK_TIMEOUT_MS);

        child.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                resolve({ success: false, reply: null, error: `Process exited with code ${code}`, stderr, stdout });
                return;
            }
            // Try to parse JSON response
            try {
                const parsed = JSON.parse(stdout);
                const reply = parsed?.data?.agent?.reply
                    || parsed?.reply
                    || parsed?.content
                    || parsed?.text
                    || stdout.trim();
                resolve({ success: true, reply: typeof reply === 'string' ? reply : JSON.stringify(reply), raw: parsed });
            } catch {
                // Output isn't JSON — use raw text
                resolve({ success: true, reply: stdout.trim(), raw: null });
            }
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ success: false, reply: null, error: err.message, stderr, stdout });
        });
    });
}

// ── Main poll loop ───────────────────────────────────────────────
async function fetchOpenClawAgents() {
    const agents = await supabaseGet('agents', {
        'select': 'id,name,metadata,status',
        'metadata->>agent_type': 'eq.openclaw',
    });
    return agents;
}

async function fetchPendingTasksForAgents(agentIds) {
    if (agentIds.length === 0) return [];

    // Pick up PENDING tasks AND stuck IN_PROGRESS tasks (older than STUCK_THRESHOLD_MS)
    const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

    const [pending, stuck] = await Promise.all([
        supabaseGet('tasks', {
            'select': '*',
            'assignee_agent_id': `in.(${agentIds.join(',')})`,
            'status': 'eq.PENDING',
            'order': 'priority.desc,created_at.asc',
            'limit': String(MAX_TASKS),
        }),
        supabaseGet('tasks', {
            'select': '*',
            'assignee_agent_id': `in.(${agentIds.join(',')})`,
            'status': 'eq.IN_PROGRESS',
            'updated_at': `lt.${stuckCutoff}`,
            'order': 'updated_at.asc',
            'limit': '2',
        }),
    ]);

    if (stuck.length > 0) {
        console.log(`\n♻️  Found ${stuck.length} stuck IN_PROGRESS task(s) to retry`);
    }

    // Deduplicate by id
    const all = [...pending, ...stuck];
    const seen = new Set();
    return all.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
        .slice(0, MAX_TASKS);
}

async function processTask(task, agentMeta) {
    if (processing.has(task.id)) return;
    processing.add(task.id);

    console.log(`\n📋 Task: ${task.title}`);
    console.log(`   ID: ${task.id} | Agent: ${agentMeta?.agent_type || 'openclaw'}`);

    try {
        // 1. Mark task as IN_PROGRESS
        await supabasePatch('tasks', { id: `eq.${task.id}` }, {
            status: 'IN_PROGRESS',
            updated_at: new Date().toISOString(),
        });

        await supabaseInsert('eliza_activity_log', {
            activity_type: 'task_dispatched_to_openclaw',
            title: `Dispatching to OpenClaw: ${task.title}`,
            description: `Task ${task.id} dispatched to local OpenClaw agent`,
            status: 'started',
            task_id: task.id,
            agent_id: task.assignee_agent_id,
            metadata: { gateway_url: agentMeta?.gateway_url, session_key: agentMeta?.session_key },
        });

        // 2. Build message and dispatch to OpenClaw (async — non-blocking)
        const message = buildTaskMessage(task);
        const result = await runOpenClawAsync(message, agentMeta, task.id);

        if (!result.success) {
            console.error(`  ❌ OpenClaw error: ${result.error}`);
            await supabasePatch('tasks', { id: `eq.${task.id}` }, {
                status: 'BLOCKED',
                blocking_reason: `OpenClaw dispatch failed: ${result.error?.slice(0, 200)}`,
                updated_at: new Date().toISOString(),
            });
            await supabaseInsert('eliza_activity_log', {
                activity_type: 'openclaw_dispatch_failed',
                title: `OpenClaw Dispatch Failed: ${task.title}`,
                description: result.error || 'Unknown error',
                status: 'failed',
                task_id: task.id,
                agent_id: task.assignee_agent_id,
                metadata: { stderr: result.stderr?.slice(0, 500) },
            });
            // ── Inbox notification for failure ────────────────────
            await sendInboxMessage(task, {
                title: `⚠️ Task Blocked: ${task.title}`,
                content: `OpenClaw could not complete this task.\n\nReason: ${result.error?.slice(0, 300) || 'Unknown error'}`,
                type: 'task_failed',
                priority: 4,
                channel: 'openclaw',
            });
            return;
        }

        console.log(`  ✅ OpenClaw replied (${result.reply?.length || 0} chars)`);
        console.log(`  💬 ${result.reply?.slice(0, 120)}...`);

        // 3. Write result back — mark as COMPLETED
        await supabasePatch('tasks', { id: `eq.${task.id}` }, {
            status: 'COMPLETED',
            progress_percentage: 100,
            updated_at: new Date().toISOString(),
            metadata: {
                ...(task.metadata || {}),
                openclaw_result: result.reply,
                openclaw_completed_at: new Date().toISOString(),
            },
        });

        // 4. Log the result to activity feed so Suite AI shows it
        await supabaseInsert('eliza_activity_log', {
            activity_type: 'openclaw_task_completed',
            title: `OpenClaw Completed: ${task.title}`,
            description: result.reply?.slice(0, 500) || 'Task completed',
            status: 'completed',
            task_id: task.id,
            agent_id: task.assignee_agent_id,
            metadata: {
                full_reply: result.reply,
                gateway_url: agentMeta?.gateway_url,
                session_key: agentMeta?.session_key,
            },
        });

        // 5. Update agent status back to IDLE
        await supabasePatch('agents', { id: `eq.${task.assignee_agent_id}` }, {
            status: 'IDLE',
            current_workload: 0,
        });

        // 6. ── Inbox notification for completion ────────────────
        const agentRow = agents?.find?.(a => a.id === task.assignee_agent_id);
        await sendInboxMessage(task, {
            title: `✅ Task Complete: ${task.title}`,
            content: result.reply?.slice(0, 600) || 'Task completed successfully.',
            type: 'task_complete',
            priority: 3,
            agentId: task.assignee_agent_id,
            agentName: agentRow?.name || agentMeta?.session_key || 'OpenClaw Agent',
            channel: 'openclaw',
        });

        console.log(`  ✅ Task ${task.id} completed and written back to Suite AI`);

    } catch (err) {
        console.error(`  ❌ processTask error:`, err.message);
    } finally {
        processing.delete(task.id);
    }
}

let pollCount = 0;
let agents = [];
async function poll() {
    pollCount++;
    try {
        agents = await fetchOpenClawAgents();
        if (agents.length === 0) {
            process.stdout.write('.');  // quiet dot — no openclaw agents provisioned yet
            return;
        }

        const agentIds = agents.map(a => a.id);
        const agentMetaMap = Object.fromEntries(agents.map(a => [a.id, a.metadata]));

        const tasks = await fetchPendingTasksForAgents(agentIds);
        if (tasks.length === 0) {
            process.stdout.write('~');  // quiet tilde — no pending tasks
            return;
        }

        console.log(`\n🔍 Found ${tasks.length} task(s) for ${agents.length} OpenClaw agent(s) [poll #${pollCount}]`);

        // Dispatch all tasks in PARALLEL (non-blocking)
        await Promise.all(
            tasks.map(task => {
                const agentMeta = agentMetaMap[task.assignee_agent_id] || {};
                return processTask(task, agentMeta);
            })
        );

    } catch (err) {
        console.error(`\n❌ Poll error:`, err.message);
    }
}

// ── Start ────────────────────────────────────────────────────────
console.log('🟢 Poller running. Ctrl+C to stop.\n');
poll(); // immediate first poll
setInterval(poll, POLL_INTERVAL);

// Graceful shutdown
process.on('SIGINT', () => {
    const inFlight = processing.size;
    if (inFlight > 0) {
        console.log(`\n⚠️  Stopping with ${inFlight} task(s) still in flight — they will be recovered on next poll.`);
    }
    console.log('\n\n🛑 Poller stopped.');
    process.exit(0);
});
