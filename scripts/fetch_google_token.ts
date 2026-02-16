
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data, error } = await supabase
        .from('oauth_connections')
        .select('refresh_token, connected_at')
        .eq('provider', 'google_cloud')
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("Error fetching token:", error);
        Deno.exit(1);
    }

    if (!data || !data.refresh_token) {
        console.error("No refresh token found in database!");
        Deno.exit(1);
    }

    console.log(data.refresh_token);
}

main();
