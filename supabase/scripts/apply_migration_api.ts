
const migrationPath = 'c:/Users/PureTrek/Desktop/DevGruGold/suite/supabase/migrations/20260207_fix_conversation_memory_timestamps.sql';
try {
    const sql = await Deno.readTextFile(migrationPath);
    console.log(`Reading migration from ${migrationPath}...`);
    console.log(`SQL Length: ${sql.length} chars`);

    const response = await fetch('https://api.supabase.com/v1/projects/vawouugtzwmejxqkeqqj/query', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer sbp_02e7562153a72212965749d42b82419b91558022',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });

    if (response.ok) {
        const result = await response.json();
        console.log('✅ Migration applied successfully!');
        console.log('Result:', JSON.stringify(result, null, 2));
    } else {
        console.error('❌ Failed to apply migration via Management API');
        console.error('Status:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error Body:', errorText);

        // If 404, maybe endpoint is wrong. If 401, token is wrong.
    }
} catch (error) {
    console.error('❌ Script execution error:', error);
}
