
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vawouugtzwmejxqkeqqj.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

const TIER_MAPPING = {
    'xmrtnet@gmail.com': 'super_admin',
    'xmrtsolutions@gmail.com': 'super_admin',
    'joeyleepcs@gmail.com': 'admin'
};

const DEFAULT_TIER = 'contributor';

async function migrateUsers() {
    console.log("Starting bulk user migration...");

    // 1. List all users
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    if (userError) {
        console.error("Error listing users:", userError);
        return;
    }

    console.log(`Found ${users.length} users to process.`);

    for (const user of users) {
        const email = user.email;
        const targetTier = TIER_MAPPING[email] || DEFAULT_TIER;

        console.log(`Processing ${email} -> ${targetTier}`);

        const { error: updateError } = await supabase
            .from('profiles')
            .update({ membership_tier: targetTier })
            .eq('id', user.id);

        if (updateError) {
            console.error(`❌ Failed to update ${email}:`, updateError.message);
            // Attempt insert if update fails (profile might not exist)
            const { error: insertError } = await supabase
                .from('profiles')
                .upsert({ id: user.id, membership_tier: targetTier });

            if (insertError) {
                console.error(`❌ Failed to upsert ${email}:`, insertError.message);
            } else {
                console.log(`✅ Upserted profile for ${email}`);
            }

        } else {
            console.log(`✅ Updated ${email}`);
        }
    }

    console.log("Migration complete!");
}

migrateUsers();
