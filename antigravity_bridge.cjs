
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
    const deviceType = 'pc' // Found valid type 'pc'

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
    const { data: agents } = await supabase
        .from('agents')
        .select('id, metadata')
        .ilike('name', '%Antigravity%')
        .single()

    if (agents) {
        console.log('Found Agent:', agents.id)
        // Update metadata with device_id
        const newMeta = { ...agents.metadata, device_id: deviceId, connected_via: 'antigravity_bridge' }
        await supabase.from('agents').update({ metadata: newMeta }).eq('id', agents.id)
        console.log('Agent metadata updated.')
    } else {
        console.log('Agent not found (exact match).')
    }
}

async function main() {
    const deviceId = await registerDevice()
    if (!deviceId) return

    await linkAgent(deviceId)

    console.log(`\n✅ BRIDGE ACTIVE. Listening for events on 'device_events' for device_id=${deviceId}`)
    console.log(`waiting... (Press Ctrl+C to stop)`)

    const channel = supabase
        .channel('device-bridge')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'device_events',
                filter: `device_id=eq.${deviceId}`
            },
            (payload) => {
                handleEvent(payload.new)
            }
        )
        .subscribe((status) => {
            console.log('Subscription status:', status)
        })
}

async function handleEvent(event) {
    console.log('\n📩 RECEIVED EVENT:', event.event_type)
    console.log('Payload:', event.payload)

    if (event.event_type === 'command' || event.event_type === 'EXECUTE_COMMAND') {
        const cmd = event.payload.command || event.payload.cmd
        if (cmd) {
            console.log(`> Executing: ${cmd}`)
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`)
                    reportResult(event.id, { error: error.message, stderr })
                    return
                }
                console.log(`stdout: ${stdout}`)
                if (stderr) console.error(`stderr: ${stderr}`)

                reportResult(event.id, { stdout, stderr, status: 'completed' })
            })
        }
    }
}

async function reportResult(eventId, result) {
    console.log('Reporting result...')
    await supabase.from('device_events').update({
        metadata: { result, processed_at: new Date().toISOString() }
    }).eq('id', eventId)
}

main()
