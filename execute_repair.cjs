const https = require('https');

const PROJECT_REF = 'vawouugtzwmejxqkeqqj';
const SUPABASE_ACCESS_TOKEN = 'sbp_02e7562153a72212965749d42b82419b91558022';
const HOSTNAME = 'api.supabase.com';
const PATH = `/v1/projects/${PROJECT_REF}/database/query`;

const AGENTS_SQL = `SELECT count(*) FROM agents`;

const CRON_SQL = `
SELECT cron.schedule(
  'github-issue-scanner-trigger',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/github-issue-scanner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{"action": "trigger_scan"}'::jsonb
  );
  $$
);
`;

async function executeSql(title, sql) {
  console.log(`\nExecuting: ${title}...`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOSTNAME,
      path: PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Success.`);
          resolve(data);
        } else {
          console.error(`❌ Failed: HTTP ${res.statusCode} - ${data}`);
          resolve(null); // Resolve to continue despite error
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ Request Error: ${e.message}`);
      reject(e);
    });

    req.write(JSON.stringify({ query: sql }));
    req.end();
  });
}

async function run() {
  await executeSql('Restore Missing Agents', AGENTS_SQL);
  await executeSql('Enable Agent Execution Cron', CRON_SQL);
}

run();
