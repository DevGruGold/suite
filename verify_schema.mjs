import fetch from 'node-fetch';

const PROJECT_REF = 'vawouugtzwmejxqkeqqj';
const TOKEN = 'sbp_02e7562153a72212965749d42b82419b91558022';
const SQL = `
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tasks';
`;

async function run() {
    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

    console.log(`Executing SQL on ${url}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: SQL })
        });

        const text = await response.text();
        console.log(`Status: ${response.status}`);
        console.log(`Response: ${text}`);

        if (!response.ok) process.exit(1);
    } catch (err) {
        console.error("Fetch error:", err);
        process.exit(1);
    }
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
