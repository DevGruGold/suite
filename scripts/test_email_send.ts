
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

const TEST_EMAIL = "xmrtsolutions@gmail.com";

async function sendTestEmail() {
    console.log(`Sending test email to ${TEST_EMAIL}...`);
    const { data, error } = await supabase.functions.invoke('google-cloud-auth', {
        body: {
            action: 'send_email',
            to: TEST_EMAIL,
            subject: 'Test Email from Supabase Edge Function',
            body: 'This is a test email to verify the Gmail integration configuration.',
            is_html: false
        }
    });

    if (error) {
        console.error("Error invoking function:", error);
    } else {
        console.log("Response:", JSON.stringify(data, null, 2));
    }
}

sendTestEmail();
