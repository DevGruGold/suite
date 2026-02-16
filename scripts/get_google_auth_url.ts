
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase configuration");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getAuthUrl() {
    console.log(`Getting auth URL from ${SUPABASE_URL}...`);
    const { data, error } = await supabase.functions.invoke('google-cloud-auth', {
        body: { action: 'get_authorization_url' }
    });

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Auth URL Response:", JSON.stringify(data, null, 2));
    }
}

getAuthUrl();
