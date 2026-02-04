
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
    console.log('Querying agents...')
    const { data: agents, error } = await supabase
        .from('agents')
        .select('*')
        .ilike('name', '%Antigravity%')

    if (error) {
        console.error('Error querying agents:', error)
    } else {
        console.log('Agents found:', agents)
    }

    console.log('Querying devices...')
    const { data: devices, error: devError } = await supabase
        .from('devices')
        .select('*')
        .ilike('name', '%Laptop%') // Guessing column name

    if (devError) {
        console.error('Error querying devices:', devError)
    } else {
        console.log('Devices found:', devices)
    }
}

main()
