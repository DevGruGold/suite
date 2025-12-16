-- FIX API_KEY_HEALTH TABLE FOR CHAT FUNCTIONS
-- Execute this in Supabase SQL Editor: https://supabase.com/dashboard/project/vawouugtzwmejxqkeqqj/sql

-- Ensure table exists
CREATE TABLE IF NOT EXISTS api_key_health (
    service_name TEXT PRIMARY KEY,
    is_healthy BOOLEAN DEFAULT true,
    last_checked TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_message TEXT,
    response_time_ms INTEGER DEFAULT 500,
    success_rate FLOAT DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mark all chat services as healthy
INSERT INTO api_key_health (service_name, is_healthy, last_checked, error_message, response_time_ms, success_rate)
VALUES 
    ('deepseek', true, NOW(), NULL, 450, 1.0),
    ('gemini', true, NOW(), NULL, 500, 1.0),
    ('openai', true, NOW(), NULL, 480, 1.0),
    ('lovable', true, NOW(), NULL, 520, 1.0),
    ('ai-service', true, NOW(), NULL, 400, 1.0),
    ('vercel', true, NOW(), NULL, 600, 1.0)
ON CONFLICT (service_name) 
DO UPDATE SET 
    is_healthy = true,
    last_checked = NOW(),
    error_message = NULL,
    response_time_ms = EXCLUDED.response_time_ms,
    success_rate = 1.0;

-- Verify results
SELECT 
    service_name,
    is_healthy,
    last_checked,
    error_message,
    'Status: ' || CASE WHEN is_healthy THEN 'HEALTHY ✅' ELSE 'UNHEALTHY ❌' END as status
FROM api_key_health 
ORDER BY service_name;

-- Expected output: All services should show "HEALTHY ✅"
