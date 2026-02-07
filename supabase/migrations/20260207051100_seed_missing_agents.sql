-- Seed essential agents if they don't exist to prevent Foreign Key violations in tasks table
-- Created by Antigravity on 2026-02-07

INSERT INTO public.agents (name, role, status, current_workload, max_concurrent_tasks)
SELECT 'Antigravity', 'system_admin', 'IDLE', 0, 10
WHERE NOT EXISTS (SELECT 1 FROM public.agents WHERE name = 'Antigravity');

INSERT INTO public.agents (name, role, status, current_workload, max_concurrent_tasks)
SELECT 'Eliza', 'orchestrator', 'IDLE', 0, 10
WHERE NOT EXISTS (SELECT 1 FROM public.agents WHERE name = 'Eliza');
