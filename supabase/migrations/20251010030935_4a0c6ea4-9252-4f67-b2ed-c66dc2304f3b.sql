-- Create cron jobs for all daily discussion posts
-- Morning Discussion: 8am UTC daily
SELECT cron.schedule(
  'morning-discussion-8am',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/morning-discussion-post',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU"}'::jsonb
  ) as request_id;
  $$
);

-- Progress Update: 9am UTC daily
SELECT cron.schedule(
  'progress-update-9am',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/progress-update-post',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU"}'::jsonb
  ) as request_id;
  $$
);

-- Evening Summary: 8pm UTC (20:00) daily
SELECT cron.schedule(
  'evening-summary-8pm',
  '0 20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/evening-summary-post',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU"}'::jsonb
  ) as request_id;
  $$
);

-- Weekly Retrospective: Fridays at 4pm UTC (16:00)
SELECT cron.schedule(
  'weekly-retrospective-friday',
  '0 16 * * 5',
  $$
  SELECT net.http_post(
    url := 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/weekly-retrospective-post',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU"}'::jsonb
  ) as request_id;
  $$
);

-- Community Spotlight: Wednesdays at 2pm UTC (14:00)
SELECT cron.schedule(
  'community-spotlight-wednesday',
  '0 14 * * 3',
  $$
  SELECT net.http_post(
    url := 'https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/community-spotlight-post',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhd291dWd0endtZWp4cWtlcXFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjc2OTcxMiwiZXhwIjoyMDY4MzQ1NzEyfQ.QH0k26R2xbf4U5z6BmdYG1h_lkeNQ41zDjqL2zWxzxU"}'::jsonb
  ) as request_id;
  $$
);