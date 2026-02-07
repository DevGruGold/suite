import fetch from 'node-fetch';
import fs from 'fs';

const PROJECT_REF = 'vawouugtzwmejxqkeqqj';
const TOKEN = 'sbp_02e7562153a72212965749d42b82419b91558022';

async function run() {
    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all`;

    const sql = `
    SELECT timestamp, event_message, metadata
    FROM edge_logs 
    ORDER BY timestamp DESC
    LIMIT 500
  `;

    const params = new URLSearchParams();
    params.append('sql', sql);

    // Pivot around the user reported failure time: 1770433156529
    const targetMark = 1770433156529;
    params.append('iso_timestamp_start', new Date(targetMark - 120000).toISOString()); // -2 mins
    params.append('iso_timestamp_end', new Date(targetMark + 120000).toISOString());   // +2 mins

    console.log(`Fetching logs from ${url}...`);

    try {
        const response = await fetch(`${url}?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.log(`Status: ${response.status}`);
            console.log(await response.text());
            process.exit(1);
        }

        const data = await response.json();
        console.log('API Response Keys:', Object.keys(data));

        if (data.result) {
            fs.writeFileSync('logs_dump.json', JSON.stringify(data.result, null, 2));
            console.log(`Dumped ${data.result.length} logs to logs_dump.json`);

            // Scan for target timestamp 1770433156529 (millis) -> 1770433156529000 (micros)
            const target = 1770433156529000;
            const found = data.result.find(r => Math.abs(r.timestamp - target) < 5000000); // 5 sec window
            if (found) {
                console.log('Found log near timestamp:', JSON.stringify(found, null, 2));
            } else {
                console.log('No log found near timestamp. Checking for ANY errors...');
                const errorLog = data.result.find(r =>
                    (r.metadata && r.metadata.some(m => m.response && m.response.some(re => re.status_code >= 400))) ||
                    (typeof r.event_message === 'string' && r.event_message.toLowerCase().includes('error'))
                );
                if (errorLog) console.log('Found recent error log:', JSON.stringify(errorLog, null, 2));
            }
        }

    } catch (err) {
        console.error("Fetch error:", err);
        process.exit(1);
    }
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
