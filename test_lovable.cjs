const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = 'c:\\Users\\PureTrek\\Desktop\\DevGruGold\\suite\\.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        let cleanValue = value.trim();
        if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
            cleanValue = cleanValue.slice(1, -1);
        }
        env[key.trim()] = cleanValue;
    }
});

const supabaseUrl = env['SUPABASE_URL'] || env['VITE_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['VITE_SUPABASE_PUBLISHABLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLovable() {
    console.log('Testing lovable-chat...');
    const { data, error } = await supabase.functions.invoke('lovable-chat', {
        body: { messages: [{ role: 'user', content: 'Hello, are you online?' }] }
    });

    if (error) {
        console.error('Error invoking lovable-chat:', error);
    } else {
        console.log('Success:', data);
    }
}

testLovable();
