
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function testAgent() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_KEY");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("🚀 Testing SuperDuper Social Agent...");

    const { data, error } = await supabase.functions.invoke('superduper-social-viral', {
        body: {
            action: 'find_trending_comments',
            params: {
                niche: 'monero',
                platform: 'twitter'
            }
        }
    });

    if (error) {
        console.error("❌ Error:", error);
    } else {
        console.log("✅ Success:", data);
    }
}

if (import.meta.main) {
    testAgent();
}
