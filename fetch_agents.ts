
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { config } from "https://deno.land/x/dotenv/mod.ts";

const supabaseUrl = 'https://vawouugtzwmejxqkeqqj.supabase.co'
// Using the service role key from the viewed .env file or just trying anon if RLS permits reading.
// I'll try anon first, if that fails I might need to find the service key.
// Actually, I can just use the Service Key I saw in the .env file earlier? 
// Wait, I saw a placeholder in .env. Let's try to check the .env file again to be sure or use ANON key.
// I'll assume I can read agents with ANON key if RLS allows it.
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');

const supabase = createClient(supabaseUrl, supabaseKey!)

const { data, error } = await supabase
    .from('agents')
    .select('name, role, status')
    .order('name');

if (error) {
    console.error('Error fetching agents:', error);
} else {
    console.log(JSON.stringify(data, null, 2));
}
