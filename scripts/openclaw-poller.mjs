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
 *      that have status PENDING or IN_PROGRESS.
 *   2. For each new task, runs:
 *        openclaw agent --agent main --message "..." --json
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

import { execSync } from 'child_process';
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
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '30000');  // 30 seconds
const MAX_TASKS = parseInt(process.env.MAX_TASKS_PER_POLL || '3');

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check suite/.env');
    process.exit(1);
}

console.log('🦞 OpenClaw Poller starting');
console.log(`   Supabase: ${SUPABASE_URL}`);
console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
console.log('');

// Track tasks currently being processed to prevent double-dispatch
const processing = new Set();

// ── Supabase helpers ─────────────────────────────────────────────
async function supabaseGet(path, params = {}) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
        }
    });
    if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${await res.text()}`);
    return res.json();
}

async function supabasePatch(path, filter, body) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    for (const [k, v] of Object.entries(filter)) url.searchParams.set(k, v);
    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase PATCH ${path} → ${res.status}: ${await res.text()}`);
    return res.json();
}

async function supabaseInsert(path, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase INSERT ${path} → ${res.status}: ${await res.text()}`);
    return res.json();
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

function runOpenClaw(message, agentMeta) {
    const sessionKey = agentMeta?.session_key || 'main';
    // Extract just the agent name from session key like "agent:main:main" → "main"
    const agentName = sessionKey.split(':')[1] || 'main';

    const cmd = [
        'openclaw agent',
        `--agent ${agentName}`,
        `--message ${JSON.stringify(message)}`,
        '--json',
    ].join(' ');

    console.log(`  🏃 Running: openclaw agent --agent ${agentName} --message "..."`);

    try {
        const output = execSync(cmd, {
            encoding: 'utf8',
            timeout: 5 * 60 * 1000, // 5 minute timeout per task
            windowsHide: true,
        });

        // Try to parse JSON response
        try {
            const parsed = JSON.parse(output);
            // Extract the text reply from nested JSON structure
            const reply = parsed?.data?.agent?.reply
                || parsed?.reply
                || parsed?.content
                || parsed?.text
                || output.trim();
            return { success: true, reply: typeof reply === 'string' ? reply : JSON.stringify(reply), raw: parsed };
        } catch {
            // Output isn't JSON — use raw text (this is the text mode output)
            return { success: true, reply: output.trim(), raw: null };
        }
    } catch (err) {
        const stderr = err.stderr?.toString() || '';
        const stdout = err.stdout?.toString() || '';
        return {
            success: false,
            reply: null,
            error: err.message,
            stderr,
            stdout,
        };
    }
}

// ── Main poll loop ───────────────────────────────────────────────
async function fetchOpenClawAgents() {
    // Get all agents where metadata->>'agent_type' = 'openclaw'
    const agents = await supabaseGet('agents', {
        'select': 'id,name,metadata,status',
        'metadata->>agent_type': 'eq.openclaw',
    });
    return agents;
}

async function fetchPendingTasksForAgents(agentIds) {
    if (agentIds.length === 0) return [];

    // Get pending tasks assigned to openclaw agents
    const tasks = await supabaseGet('tasks', {
        'select': '*',
        'assignee_agent_id': `in.(${agentIds.join(',')})`,
        'status': 'eq.PENDING',
        'order': 'priority.desc,created_at.asc',
        'limit': String(MAX_TASKS),
    });
    return tasks;
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

        // 2. Build message and dispatch to OpenClaw
        const message = buildTaskMessage(task);
        const result = runOpenClaw(message, agentMeta);

        if (!result.success) {
            console.error(`  ❌ OpenClaw error: ${result.error}`);
            // Mark as BLOCKED with error info
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

        console.log(`  ✅ Task ${task.id} completed and written back to Suite AI`);

    } catch (err) {
        console.error(`  ❌ processTask error:`, err.message);
    } finally {
        processing.delete(task.id);
    }
}

async function poll() {
    try {
        const agents = await fetchOpenClawAgents();
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

        console.log(`\n🔍 Found ${tasks.length} pending task(s) for ${agents.length} OpenClaw agent(s)`);

        // Process tasks sequentially to avoid overloading OpenClaw
        for (const task of tasks) {
            const agentMeta = agentMetaMap[task.assignee_agent_id] || {};
            await processTask(task, agentMeta);
        }

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
    console.log('\n\n🛑 Poller stopped.');
    process.exit(0);
});
