
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Replace these with actual values from the command output
const SUPABASE_URL = "https://vawouugtzwmejxqkeqqj.supabase.co";
const SERVICE_ROLE_KEY = "REPLACE_ME_WITH_SERVICE_ROLE_KEY";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function promoteUser() {
    console.log("Promoting xmrtnet@gmail.com to super_admin...");

    // 1. Get User ID
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    if (userError) {
        console.error("Error listing users:", userError);
        return;
    }

    const user = users.find(u => u.email === 'xmrtnet@gmail.com');

    if (!user) {
        console.error("User xmrtnet@gmail.com not found!");
        return;
    }

    console.log(`Found user: ${user.id}`);

    // 2. Update Profile
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ membership_tier: 'super_admin' })
        .eq('id', user.id);

    if (updateError) {
        console.error("Error updating profile:", updateError);
        if (updateError.code === '42703') { // Undefined column
            console.error("CRITICAL: The 'membership_tier' column does not exist on 'profiles' table. You MUST run the SQL migration manually.");
        }
    } else {
        console.log("Successfully promoted user to super_admin!");
    }
}

promoteUser();
