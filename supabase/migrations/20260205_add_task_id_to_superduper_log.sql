
-- 20260205_add_task_id_to_superduper_log.sql
alter table if exists superduper_execution_log
add column if not exists task_id text references tasks(id);
