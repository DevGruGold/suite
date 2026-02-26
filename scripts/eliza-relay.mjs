#!/usr/bin/env node
/**
 * eliza-relay.mjs
 * Send a message to cloud Eliza (SuiteAI) via the eliza-relay Supabase edge function.
 * Returns her reply to stdout in a single HTTPS round-trip (no polling loop).
 *
 * Usage:
 *   node eliza-relay.mjs "Search for pork and pineapple recipes"
 *   SUPABASE_KEY=<key> node eliza-relay.mjs "Hello Eliza"
 *
 * Environment:
 *   SUPABASE_URL           (falls back to hardcoded project URL)
 *   SUPABASE_KEY           (service role key — preferred)
 *   SUPABASE_SERVICE_ROLE_KEY  (alternative name for service role key)
 *
 * Exit codes:
 *   0 — Eliza replied successfully (reply printed to stdout)
 *   1 — Error (details printed to stderr)
 */

import https from 'https';
import crypto from 'crypto';

const SUPABASE_URL =
    process.env.SUPABASE_URL || 'https://vawouugtzwmejxqkeqqj.supabase.co';
const SUPABASE_KEY =
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU';

// Edge function endpoint — single HTTPS call, synchronous reply
const ELIZA_RELAY_URL = `${SUPABASE_URL}/functions/v1/eliza-relay`;

const RELAY_TAG = `openclaw-relay-${crypto.randomUUID().slice(0, 8)}`;

const message = process.argv.slice(2).join(' ');
if (!message) {
    console.error('Usage: node eliza-relay.mjs <message to send to Eliza>');
    process.exit(1);
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpsPost(url, payload, headers) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const body = JSON.stringify(payload);
        const req = https.request(
            {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    ...headers,
                },
            },
            (res) => {
                let d = '';
                res.on('data', (c) => (d += c));
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(d) });
                    } catch {
                        resolve({ status: res.statusCode, body: d });
                    }
                });
            }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.error(`📡 eliza-relay → ${ELIZA_RELAY_URL}`);
    console.error(`   relay_tag : ${RELAY_TAG}`);
    console.error(`   message   : ${message.slice(0, 120)}${message.length > 120 ? '…' : ''}`);

    const { status, body } = await httpsPost(ELIZA_RELAY_URL, {
        action: 'send',
        message,
        relay_tag: RELAY_TAG,
        agent_name: 'OpenClaw',
    });

    if (status !== 200) {
        console.error(`❌ eliza-relay HTTP ${status}:`, JSON.stringify(body));
        process.exit(1);
    }

    if (body.error) {
        console.error('❌ eliza-relay error:', body.error);
        process.exit(1);
    }

    // The edge function returns the reply synchronously — no polling needed
    const reply = body.reply;
    if (!reply) {
        console.error('❌ eliza-relay returned no reply:', JSON.stringify(body));
        process.exit(1);
    }

    console.log('\n✅ Eliza replied:');
    console.log(reply);
    process.exit(0);
}

main().catch((e) => {
    console.error('eliza-relay fatal:', e.message || e);
    process.exit(1);
});
