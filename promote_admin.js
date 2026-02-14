
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vawouugtzwmejxqkeqqj.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU";

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
        // List some users to help debug
        console.log("Available users:", users.slice(0, 5).map(u => u.email));
        return;
    }

    console.log(`Found user: ${user.id} (${user.email})`);

    // 2. Update Profile
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ membership_tier: 'super_admin' })
        .eq('id', user.id);

    if (updateError) {
        console.error("Error updating profile:", updateError);
    } else {
        console.log("Successfully updated profile membership_tier to super_admin!");
    }
}

promoteUser();
