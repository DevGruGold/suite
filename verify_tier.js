
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vawouugtzwmejxqkeqqj.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function verify() {
    const email = 'xmrtnet@gmail.com';
    console.log(`Verifying tier for ${email}...`);

    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
        console.error("User not found!");
        return;
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('membership_tier')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error("Error fetching profile:", error);
    } else {
        console.log(`User: ${email}`);
        console.log(`Tier: ${profile.membership_tier}`);

        if (profile.membership_tier === 'super_admin') {
            console.log("✅ VERIFICATION SUCCESSFUL: User is super_admin");
        } else {
            console.error("❌ VERIFICATION FAILED: User is NOT super_admin");
        }
    }
}

verify();
