
const { createClient } = require('@supabase/supabase-js')
const { exec } = require('child_process')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const DEVICE_FINGERPRINT = 'antigravity-laptop-01'
const AGENT_NAME = 'Antigravity-Laptop-Device'

async function registerDevice() {
    const deviceType = 'pc'
    console.log('Registering/Updating Device:', DEVICE_FINGERPRINT)

    let { data: existing } = await supabase
        .from('devices')
        .select('id')
        .eq('device_fingerprint', DEVICE_FINGERPRINT)
        .single()

    let deviceId

    if (existing) {
        deviceId = existing.id
        console.log('Device found with ID:', deviceId)
        await supabase.from('devices').update({
            last_seen_at: new Date().toISOString(),
            is_active: true
        }).eq('id', deviceId)
    } else {
        const { data: newDevice, error } = await supabase
            .from('devices')
            .insert({
                device_fingerprint: DEVICE_FINGERPRINT,
                device_type: deviceType,
                os: 'windows',
                first_seen_at: new Date().toISOString(),
                last_seen_at: new Date().toISOString(),
                is_active: true,
                metadata: { agent_name: AGENT_NAME, description: 'Antigravity Bridge Device' }
            })
            .select('id')
            .single()

        if (error) {
            console.error('Error creating device:', error)
            return null
        }
        deviceId = newDevice.id
        console.log('Created new Device ID:', deviceId)
    }
    return deviceId
}

async function linkAgent(deviceId) {
    console.log('Linking Agent to Device...')
    // Use .limit(1) + array — avoids .single() throwing when 0 rows found
    const { data: agentRows, error } = await supabase
        .from('agents')
        .select('id, metadata')
        .ilike('name', '%Antigravity%')
        .limit(1)

    if (error) {
        console.log('linkAgent query error (non-fatal):', error.message)
        return
    }

    const agent = agentRows?.[0]
    if (agent) {
        console.log('Found Agent:', agent.id)
        const newMeta = { ...agent.metadata, device_id: deviceId, connected_via: 'antigravity_bridge' }
        await supabase.from('agents').update({ metadata: newMeta }).eq('id', agent.id)
        console.log('Agent metadata updated.')
    } else {
        console.log('ℹ️  No Antigravity agent row found in DB — skipping link (harmless).')
        console.log('   To fix: add a row to the agents table with name containing "Antigravity".')
    }
}

// ── Polling ───────────────────────────────────────────────────────

const POLL_MS = 2000
const processedIds = new Set()

// Error-rate suppression: only log repeated errors once every 30s
let consecutiveFetchErrors = 0
let lastFetchErrorMsg = ''
let lastFetchErrorLog = 0

async function main() {
    const deviceId = await registerDevice()
    if (!deviceId) return

    await linkAgent(deviceId)

    console.log(`\n✅ BRIDGE ACTIVE. Polling 'device_events' for device_id=${deviceId}`)
    console.log(`Polling every ${POLL_MS}ms... (Press Ctrl+C to stop)\n`)

    setInterval(() => pollEvents(deviceId), POLL_MS)
}

async function pollEvents(deviceId) {
    const { data: events, error } = await supabase
        .from('device_events')
        .select('id, event_type, payload, created_at')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: true })
        .limit(10)

    if (error) {
        consecutiveFetchErrors++
        const now = Date.now()
        const isDuplicate = error.message === lastFetchErrorMsg
        const suppressedLongEnough = (now - lastFetchErrorLog) < 30000

        if (!isDuplicate || !suppressedLongEnough) {
            console.error(`❌ Poll error: ${error.message}`)
            lastFetchErrorMsg = error.message
            lastFetchErrorLog = now
        } else if (consecutiveFetchErrors % 30 === 0) {
            console.error(`❌ Poll still failing (${consecutiveFetchErrors}x): ${error.message}`)
        }
        return
    }

    if (consecutiveFetchErrors > 0) {
        console.log(`✅ Poll recovered after ${consecutiveFetchErrors} error(s)`)
        consecutiveFetchErrors = 0
        lastFetchErrorMsg = ''
    }

    for (const event of (events || [])) {
        if (processedIds.has(event.id)) continue
        processedIds.add(event.id)
        // Keep Set bounded — trim oldest 500 if over 1000
        if (processedIds.size > 1000) {
            const iter = processedIds.values()
            for (let i = 0; i < 500; i++) processedIds.delete(iter.next().value)
        }
        handleEvent(event)
    }
}

async function handleEvent(event) {
    console.log('\n📩 RECEIVED EVENT:', event.event_type)
    console.log('Payload:', JSON.stringify(event.payload))

    if (event.event_type === 'command' || event.event_type === 'EXECUTE_COMMAND') {
        const cmd = event.payload?.command || event.payload?.cmd
        if (cmd) {
            console.log(`> Executing: ${cmd}`)
            exec(cmd, async (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error.message}`)
                    await reportResult(event.id, { error: error.message, stderr, status: 'error' })
                    return
                }
                console.log(`stdout: ${stdout}`)
                if (stderr) console.error(`stderr: ${stderr}`)
                await reportResult(event.id, { stdout, stderr, status: 'completed' })
            })
        } else {
            console.log('⚠️  Command event has no command field in payload')
        }
    } else {
        console.log('ℹ️  Unknown event type, skipping:', event.event_type)
    }
}

async function reportResult(eventId, result) {
    console.log('Result for', eventId, '→', result.status)
    // Try to write result back — silently skip if columns don't exist
    const { error } = await supabase
        .from('device_events')
        .update({ status: result.status, result: result })
        .eq('id', eventId)
    if (error) {
        // Columns may not exist — log locally only
        console.log('📝 (Result logged locally):', JSON.stringify(result).substring(0, 200))
    }
}

main()
