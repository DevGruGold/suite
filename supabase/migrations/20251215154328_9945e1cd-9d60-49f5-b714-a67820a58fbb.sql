-- Delete recursive failure records from autonomous-code-fixer infinite loop
-- These contain repeated "# AUTO-FIX FALLBACK" patterns
DELETE FROM eliza_python_executions 
WHERE code LIKE '%# AUTO-FIX FALLBACK%# AUTO-FIX FALLBACK%'
  AND exit_code != 0
  AND created_at > NOW() - INTERVAL '7 days';