const fs = require('fs');

try {
    const data = JSON.parse(fs.readFileSync('logs_dump.json', 'utf8'));
    console.log(`Analyzing ${data.length} logs...`);

    const errors = data.filter(r => {
        // Check top level status
        if (r.status_code >= 400) return true;
        // Check metadata response status
        if (r.metadata && Array.isArray(r.metadata)) {
            return r.metadata.some(m => m.response && m.response.some(res => res.status_code >= 400));
        }
        return false;
    });

    console.log(`Found ${errors.length} error logs.`);

    errors.forEach((err, i) => {
        if (err.event_message.includes('/tasks')) {
            console.log(`--- Error ${i + 1} (TASKS) ---`);
            console.log(`Timestamp: ${err.timestamp}`);
            console.log('Event Messages:', err.event_message);

            // Try to find the error details in metadata
            if (err.metadata && Array.isArray(err.metadata)) {
                err.metadata.forEach(m => {
                    if (m.response) {
                        console.log('Response:', JSON.stringify(m.response, null, 2));
                    }
                    if (m.error) {
                        console.log('Error Key:', JSON.stringify(m.error, null, 2));
                    }
                });
            }
        }
    });

} catch (e) {
    console.error(e);
}
