-- Auto-generated migration to seed knowledge entities for edge functions

BEGIN;

TRUNCATE TABLE knowledge_entities CASCADE;

INSERT INTO knowledge_entities (name, entity_type, description, content, confidence_score, metadata)
VALUES
('service-monetization-engine', 'tool', '💰 REVENUE GENERATION - API key generation, usage tracking, tiered access control, billing, and revenue analytics for monetized services (Detailed Reference)', '# service-monetization-engine

**Description:** 💰 REVENUE GENERATION - API key generation, usage tracking, tiered access control, billing, and revenue analytics for monetized services
**Category:** revenue

**Example Use:**
```json
Generate API key: {
```

**Usage Analysis:**

**Available Actions:**
- `generate_api_key`
- `validate_api_key`
- `track_usage`
- `get_usage_stats`
- `upgrade_tier`
- `suspend_api_key`
- `calculate_revenue`
- `create_invoice`
- `get_top_customers`

**Detected Parameters:**
- `action`
- `data`


**Source Code Analysis:**
Scanned 15446 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Generate API key: {","detected_actions":["generate_api_key","validate_api_key","track_usage","get_usage_stats","upgrade_tier","suspend_api_key","calculate_revenue","create_invoice","get_top_customers"],"detected_params":["action","data"]}'::jsonb),
('workflow-template-manager', 'tool', '🔄 WORKFLOW AUTOMATION - Pre-built workflow templates for revenue generation, marketing automation, financial management, and self-optimization (Detailed Reference)', '# workflow-template-manager

**Description:** 🔄 WORKFLOW AUTOMATION - Pre-built workflow templates for revenue generation, marketing automation, financial management, and self-optimization
**Category:** automation

**Example Use:**
```json
Execute template: {
```

**Usage Analysis:**

**Available Actions:**
- `list_templates`
- `get_template`
- `execute_template`
- `create_template`
- `update_template`
- `get_template_analytics`
- `get_execution_status`
- `ai_analysis`
- `ai_generation`
- `reporting`
- `scoring`
- `decision`
- `analytics`
- `calculation`
- `log_retrieval`
- `failure_calculation`
- `severity_scoring`
- `diagnostic_reporting`
- `validation`
- `api_call`
- `database`
- `notification`
- `notification_batch`
- `multi_channel`

**Detected Parameters:**
- `action`
- `data`


**Source Code Analysis:**
Scanned 36625 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Execute template: {","detected_actions":["list_templates","get_template","execute_template","create_template","update_template","get_template_analytics","get_execution_status","ai_analysis","ai_generation","reporting","scoring","decision","analytics","calculation","log_retrieval","failure_calculation","severity_scoring","diagnostic_reporting","validation","api_call","database","notification","notification_batch","multi_channel"],"detected_params":["action","data"]}'::jsonb),
('lovable-chat', 'tool', '✅ PRIMARY AI - Model-agnostic chat via Lovable AI Gateway (Gemini 2.5 Flash default, supports OpenAI GPT-5) (Detailed Reference)', '# lovable-chat

**Description:** ✅ PRIMARY AI - Model-agnostic chat via Lovable AI Gateway (Gemini 2.5 Flash default, supports OpenAI GPT-5)
**Category:** ai

**Example Use:**
```json
Main intelligent chat endpoint with full context and memory - use this for all AI chat needs
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 6088 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Main intelligent chat endpoint with full context and memory - use this for all AI chat needs","detected_actions":[],"detected_params":[]}'::jsonb),
('github-integration', 'tool', 'Complete GitHub OAuth operations - create issues, PRs, comments, discussions (Detailed Reference)', '# github-integration

**Description:** Complete GitHub OAuth operations - create issues, PRs, comments, discussions
**Category:** github

**Example Use:**
```json
Create GitHub issue, list repository issues, manage pull requests
```

**Usage Analysis:**

**Available Actions:**
- `list_issues`
- `list_discussions`
- `get_repo_info`
- `list_pull_requests`
- `get_file_content`
- `search_code`
- `list_files`
- `get_branch_info`
- `list_branches`
- `get_issue_comments`
- `get_discussion_comments`
- `create_issue`
- `comment_on_issue`
- `comment_on_discussion`
- `trigger_workflow`
- `create_discussion`
- `create_pull_request`
- `commit_file`
- `update_issue`
- `close_issue`
- `add_comment`
- `merge_pull_request`
- `close_pull_request`
- `delete_file`
- `create_branch`
- `create_issue_comment_reply`
- `create_discussion_comment_reply`
- `reply_to_discussion_comment`
- `list_commits`
- `get_commit_details`
- `list_repo_events`
- `list_releases`
- `get_release_details`
- `list_contributors`
- `list_repositories`

**Detected Parameters:**
- `replace`


**Source Code Analysis:**
Scanned 54703 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Create GitHub issue, list repository issues, manage pull requests","detected_actions":["list_issues","list_discussions","get_repo_info","list_pull_requests","get_file_content","search_code","list_files","get_branch_info","list_branches","get_issue_comments","get_discussion_comments","create_issue","comment_on_issue","comment_on_discussion","trigger_workflow","create_discussion","create_pull_request","commit_file","update_issue","close_issue","add_comment","merge_pull_request","close_pull_request","delete_file","create_branch","create_issue_comment_reply","create_discussion_comment_reply","reply_to_discussion_comment","list_commits","get_commit_details","list_repo_events","list_releases","get_release_details","list_contributors","list_repositories"],"detected_params":["replace"]}'::jsonb),
('mining-proxy', 'tool', 'Unified mining statistics and worker management from SupportXMR (Detailed Reference)', '# mining-proxy

**Description:** Unified mining statistics and worker management from SupportXMR
**Category:** mining

**Example Use:**
```json
Get comprehensive mining data including pool stats and individual worker performance
```

**Usage Analysis:**

**Detected Parameters:**
- `worker_id`
- `wallet`
- `alias`
- `user_id`
- `session_key`
- `device_type`
- `registration_method`
- `timestamp`


**Source Code Analysis:**
Scanned 8187 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Get comprehensive mining data including pool stats and individual worker performance","detected_actions":[],"detected_params":["worker_id","wallet","alias","user_id","session_key","device_type","registration_method","timestamp"]}'::jsonb),
('agent-manager', 'tool', 'Primary agent orchestration - create, manage, and monitor AI agents (Detailed Reference)', '# agent-manager

**Description:** Primary agent orchestration - create, manage, and monitor AI agents
**Category:** task-management

**Example Use:**
```json
Create a new agent and assign them a task, monitor agent workloads
```

**Usage Analysis:**

**Available Actions:**
- `list_agents`
- `spawn_agent`
- `update_agent_status`
- `assign_task`
- `list_tasks`
- `update_task_status`
- `set_task_status`
- `report_progress`
- `request_assignment`
- `get_agent_workload`
- `log_decision`
- `update_agent_skills`
- `update_agent_role`
- `delete_agent`
- `search_agents`
- `update_task`
- `search_tasks`
- `bulk_update_tasks`
- `delete_task`
- `reassign_task`
- `update_task_details`
- `get_task_details`
- `cleanup_duplicate_agents`
- `execute_autonomous_workflow`
- `analyze`
- `execute_python`
- `github_operation`
- `create_subtask`
- `query_knowledge`
- `get_agent_by_name`
- `get_agent_stats`
- `batch_spawn_agents`
- `archive_agent`
- `provision_openclaw_agent`

**Detected Parameters:**
- `action`
- `autonomous`
- `...rest`
- `user_id`
- `context`


**Source Code Analysis:**
Scanned 54272 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Create a new agent and assign them a task, monitor agent workloads","detected_actions":["list_agents","spawn_agent","update_agent_status","assign_task","list_tasks","update_task_status","set_task_status","report_progress","request_assignment","get_agent_workload","log_decision","update_agent_skills","update_agent_role","delete_agent","search_agents","update_task","search_tasks","bulk_update_tasks","delete_task","reassign_task","update_task_details","get_task_details","cleanup_duplicate_agents","execute_autonomous_workflow","analyze","execute_python","github_operation","create_subtask","query_knowledge","get_agent_by_name","get_agent_stats","batch_spawn_agents","archive_agent","provision_openclaw_agent"],"detected_params":["action","autonomous","...rest","user_id","context"]}'::jsonb),
('python-executor', 'tool', 'Sandboxed Python execution via Piston API (stdlib only, no pip) (Detailed Reference)', '# python-executor

**Description:** Sandboxed Python execution via Piston API (stdlib only, no pip)
**Category:** code-execution

**Example Use:**
```json
Execute Python to analyze device connection patterns from the last 24 hours
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 10008 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Execute Python to analyze device connection patterns from the last 24 hours","detected_actions":[],"detected_params":[]}'::jsonb),
('playwright-browse', 'tool', 'Web browsing and scraping using Playwright automation (Detailed Reference)', '# playwright-browse

**Description:** Web browsing and scraping using Playwright automation
**Category:** web

**Example Use:**
```json
Browse websites, extract data, interact with web pages, research real-time information
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 13049 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Browse websites, extract data, interact with web pages, research real-time information","detected_actions":[],"detected_params":[]}'::jsonb),
('knowledge-manager', 'tool', 'Knowledge base CRUD operations - store, search, and link entities (Detailed Reference)', '# knowledge-manager

**Description:** Knowledge base CRUD operations - store, search, and link entities
**Category:** knowledge

**Example Use:**
```json
Store concepts, link entities, search knowledge graph
```

**Usage Analysis:**

**Available Actions:**
- `store_knowledge`
- `upsert_knowledge`
- `create_relationship`
- `search_knowledge`
- `get_related_entities`
- `update_entity_confidence`
- `store_learning_pattern`
- `get_patterns`
- `list_knowledge`
- `check_status`
- `delete_knowledge`


**Source Code Analysis:**
Scanned 18557 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Store concepts, link entities, search knowledge graph","detected_actions":["store_knowledge","upsert_knowledge","create_relationship","search_knowledge","get_related_entities","update_entity_confidence","store_learning_pattern","get_patterns","list_knowledge","check_status","delete_knowledge"],"detected_params":[]}'::jsonb),
('task-orchestrator', 'tool', 'Advanced task automation - auto-assign, rebalance, analyze bottlenecks (Detailed Reference)', '# task-orchestrator

**Description:** Advanced task automation - auto-assign, rebalance, analyze bottlenecks
**Category:** task-management

**Example Use:**
```json
Automatically distribute all pending tasks to idle agents by priority
```

**Usage Analysis:**

**Available Actions:**
- `run_orchestration_cycle`
- `auto_assign_tasks`
- `rebalance_workload`
- `identify_blockers`
- `performance_report`
- `clear_all_blocked_tasks`
- `bulk_update_task_status`
- `clear_all_workloads`

**Detected Parameters:**
- `action`
- `data`


**Source Code Analysis:**
Scanned 12866 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Automatically distribute all pending tasks to idle agents by priority","detected_actions":["run_orchestration_cycle","auto_assign_tasks","rebalance_workload","identify_blockers","performance_report","clear_all_blocked_tasks","bulk_update_task_status","clear_all_workloads"],"detected_params":["action","data"]}'::jsonb),
('system-status', 'tool', 'Quick health check - database, agents, tasks status (Detailed Reference)', '# system-status

**Description:** Quick health check - database, agents, tasks status
**Category:** monitoring

**Example Use:**
```json
Get comprehensive system health status
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 43882 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Get comprehensive system health status","detected_actions":[],"detected_params":[]}'::jsonb),
('system-diagnostics', 'tool', 'Detailed resource usage and performance metrics (Detailed Reference)', '# system-diagnostics

**Description:** Detailed resource usage and performance metrics
**Category:** monitoring

**Example Use:**
```json
Run detailed system diagnostics when system is slow
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 2432 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Run detailed system diagnostics when system is slow","detected_actions":[],"detected_params":[]}'::jsonb),
('autonomous-code-fixer', 'tool', 'Self-healing code execution - auto-fixes and re-executes failed Python (Detailed Reference)', '# autonomous-code-fixer

**Description:** Self-healing code execution - auto-fixes and re-executes failed Python
**Category:** autonomous

**Example Use:**
```json
Automatically fixes failed Python executions without human intervention
```

**Usage Analysis:**

**Detected Parameters:**
- `execution_id`


**Source Code Analysis:**
Scanned 9625 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Automatically fixes failed Python executions without human intervention","detected_actions":[],"detected_params":["execution_id"]}'::jsonb),
('multi-step-orchestrator', 'tool', 'Complex workflow engine for background processing with dependencies (Detailed Reference)', '# multi-step-orchestrator

**Description:** Complex workflow engine for background processing with dependencies
**Category:** autonomous

**Example Use:**
```json
Execute debugging workflow: scan logs → identify errors → fix code → verify
```

**Usage Analysis:**

**Available Actions:**
- `ai_analysis`
- `data_fetch`
- `api_call`
- `decision`
- `code_execution`


**Source Code Analysis:**
Scanned 25275 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Execute debugging workflow: scan logs → identify errors → fix code → verify","detected_actions":["ai_analysis","data_fetch","api_call","decision","code_execution"],"detected_params":[]}'::jsonb),
('search-edge-functions', 'tool', 'Semantic search for edge functions by capability, keywords, or use case (Detailed Reference)', '# search-edge-functions

**Description:** Semantic search for edge functions by capability, keywords, or use case
**Category:** ecosystem

**Example Use:**
```json
Find the right function when you don\
```

**Usage Analysis:**

**Detected Parameters:**
- `query`
- `category`


**Source Code Analysis:**
Scanned 3098 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Find the right function when you don\\","detected_actions":[],"detected_params":["query","category"]}'::jsonb),
('xmrt_integration', 'tool', 'Unified ecosystem health & integration hub - connects all XMRT repos (XMRT-Ecosystem, xmrt-wallet-public, mobilemonero, xmrtnet, xmrtdao) for comprehensive health reports and integration monitoring (Detailed Reference)', '# xmrt_integration

**Description:** Unified ecosystem health & integration hub - connects all XMRT repos (XMRT-Ecosystem, xmrt-wallet-public, mobilemonero, xmrtnet, xmrtdao) for comprehensive health reports and integration monitoring
**Category:** ecosystem

**Example Use:**
```json
Generate comprehensive ecosystem health report covering all repos, deployments, APIs, and community engagement. Check integration between services. Compare repository activity.
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 5125 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Generate comprehensive ecosystem health report covering all repos, deployments, APIs, and community engagement. Check integration between services. Compare repository activity.","detected_actions":[],"detected_params":[]}'::jsonb),
('aggregate-device-metrics', 'tool', 'Aggregate and analyze device mining metrics over time (Detailed Reference)', '# aggregate-device-metrics

**Description:** Aggregate and analyze device mining metrics over time
**Category:** mining

**Example Use:**
```json
Use aggregate device metrics for aggregate and analyze device mining metrics over time
```

**Usage Analysis:**

**Available Actions:**
- `aggregate`
- `metrics`
- `hourly`
- `daily`

**Detected Parameters:**
- `action`
- `...payload`


**Source Code Analysis:**
Scanned 10421 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use aggregate device metrics for aggregate and analyze device mining metrics over time","detected_actions":["aggregate","metrics","hourly","daily"],"detected_params":["action","...payload"]}'::jsonb),
('api-key-health-monitor', 'tool', 'Monitor health and usage of API keys across services (Detailed Reference)', '# api-key-health-monitor

**Description:** Monitor health and usage of API keys across services
**Category:** monitoring

**Example Use:**
```json
Use api key health monitor for monitor health and usage of api keys across services
```

**Usage Analysis:**

**Detected Parameters:**
- `session_credentials`


**Source Code Analysis:**
Scanned 18444 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use api key health monitor for monitor health and usage of api keys across services","detected_actions":[],"detected_params":["session_credentials"]}'::jsonb),
('check-frontend-health', 'tool', 'Health check for frontend application status (Detailed Reference)', '# check-frontend-health

**Description:** Health check for frontend application status
**Category:** monitoring

**Example Use:**
```json
Use check frontend health for health check for frontend application status
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 3152 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use check frontend health for health check for frontend application status","detected_actions":[],"detected_params":[]}'::jsonb),
('cleanup-duplicate-tasks', 'tool', 'Remove duplicate tasks from the task management system (Detailed Reference)', '# cleanup-duplicate-tasks

**Description:** Remove duplicate tasks from the task management system
**Category:** task-management

**Example Use:**
```json
Use cleanup duplicate tasks for remove duplicate tasks from the task management system
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 4259 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use cleanup duplicate tasks for remove duplicate tasks from the task management system","detected_actions":[],"detected_params":[]}'::jsonb),
('code-monitor-daemon', 'tool', 'Continuous monitoring daemon for code execution and errors (Detailed Reference)', '# code-monitor-daemon

**Description:** Continuous monitoring daemon for code execution and errors
**Category:** code-execution

**Example Use:**
```json
Use code monitor daemon for continuous monitoring daemon for code execution and errors
```

**Usage Analysis:**

**Available Actions:**
- `missing_module`
- `syntax_error`
- `undefined_variable`
- `network_access`
- `timeout`


**Source Code Analysis:**
Scanned 12663 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use code monitor daemon for continuous monitoring daemon for code execution and errors","detected_actions":["missing_module","syntax_error","undefined_variable","network_access","timeout"],"detected_params":[]}'::jsonb),
('community-spotlight-post', 'tool', 'Generate and post community spotlight content (Detailed Reference)', '# community-spotlight-post

**Description:** Generate and post community spotlight content
**Category:** autonomous

**Example Use:**
```json
Use community spotlight post for generate and post community spotlight content
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 6084 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use community spotlight post for generate and post community spotlight content","detected_actions":[],"detected_params":[]}'::jsonb),
('conversation-access', 'tool', 'Manage conversation access and permissions (Detailed Reference)', '# conversation-access

**Description:** Manage conversation access and permissions
**Category:** ecosystem

**Example Use:**
```json
Use conversation access for manage conversation access and permissions
```

**Usage Analysis:**

**Available Actions:**
- `get_session`
- `create_session`
- `get_messages`
- `get_summaries`
- `add_message`
- `update_session`


**Source Code Analysis:**
Scanned 11841 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use conversation access for manage conversation access and permissions","detected_actions":["get_session","create_session","get_messages","get_summaries","add_message","update_session"],"detected_params":[]}'::jsonb),
('daily-discussion-post', 'tool', 'Generate and post daily discussion topics (Detailed Reference)', '# daily-discussion-post

**Description:** Generate and post daily discussion topics
**Category:** autonomous

**Example Use:**
```json
Use daily discussion post for generate and post daily discussion topics
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 14697 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use daily discussion post for generate and post daily discussion topics","detected_actions":[],"detected_params":[]}'::jsonb),
('deepseek-chat', 'tool', 'AI chat via DeepSeek model (Detailed Reference)', '# deepseek-chat

**Description:** AI chat via DeepSeek model
**Category:** ai

**Example Use:**
```json
Use deepseek chat for ai chat via deepseek model
```

**Usage Analysis:**

**Detected Parameters:**
- `message`
- `messages`
- `conversationHistory`
- `userContext`
- `councilMode`


**Source Code Analysis:**
Scanned 4177 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use deepseek chat for ai chat via deepseek model","detected_actions":[],"detected_params":["message","messages","conversationHistory","userContext","councilMode"]}'::jsonb),
('ecosystem-monitor', 'tool', 'Monitor entire XMRT Vercel ecosystem health (xmrt-io, xmrt-ecosystem, xmrt-dao-ecosystem) (Detailed Reference)', '# ecosystem-monitor

**Description:** Monitor entire XMRT Vercel ecosystem health (xmrt-io, xmrt-ecosystem, xmrt-dao-ecosystem)
**Category:** monitoring

**Example Use:**
```json
Monitor all Vercel services health, check ecosystem performance, track deployment status
```

**Usage Analysis:**

**Detected Parameters:**
- `generate_tasks`


**Source Code Analysis:**
Scanned 21235 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Monitor all Vercel services health, check ecosystem performance, track deployment status","detected_actions":[],"detected_params":["generate_tasks"]}'::jsonb),
('eliza-python-runtime', 'tool', 'Python runtime environment for Eliza agent (Detailed Reference)', '# eliza-python-runtime

**Description:** Python runtime environment for Eliza agent
**Category:** code-execution

**Example Use:**
```json
Use eliza python runtime for python runtime environment for eliza agent
```

**Usage Analysis:**

**Detected Parameters:**
- `code`
- `purpose = ''''`
- `source = ''eliza''`
- `agent_id = null`
- `task_id = null`
- `timeout_ms = 30000`


**Source Code Analysis:**
Scanned 5049 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use eliza python runtime for python runtime environment for eliza agent","detected_actions":[],"detected_params":["code","purpose = ''''","source = ''eliza''","agent_id = null","task_id = null","timeout_ms = 30000"]}'::jsonb),
('enhanced-learning', 'tool', 'Advanced machine learning and pattern recognition (Detailed Reference)', '# enhanced-learning

**Description:** Advanced machine learning and pattern recognition
**Category:** knowledge

**Example Use:**
```json
Use enhanced learning for advanced machine learning and pattern recognition
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 10702 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use enhanced learning for advanced machine learning and pattern recognition","detected_actions":[],"detected_params":[]}'::jsonb),
('evening-summary-post', 'tool', 'Generate and post evening summary reports (Detailed Reference)', '# evening-summary-post

**Description:** Generate and post evening summary reports
**Category:** autonomous

**Example Use:**
```json
Use evening summary post for generate and post evening summary reports
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 12901 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use evening summary post for generate and post evening summary reports","detected_actions":[],"detected_params":[]}'::jsonb),
('execute-scheduled-actions', 'tool', 'Execute scheduled tasks and actions (Detailed Reference)', '# execute-scheduled-actions

**Description:** Execute scheduled tasks and actions
**Category:** ecosystem

**Example Use:**
```json
Use execute scheduled actions for execute scheduled tasks and actions
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 5055 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use execute scheduled actions for execute scheduled tasks and actions","detected_actions":[],"detected_params":[]}'::jsonb),
('extract-knowledge', 'tool', 'Extract and structure knowledge from conversations (Detailed Reference)', '# extract-knowledge

**Description:** Extract and structure knowledge from conversations
**Category:** knowledge

**Example Use:**
```json
Use extract knowledge for extract and structure knowledge from conversations
```

**Usage Analysis:**

**Detected Parameters:**
- `message_id`
- `content`
- `session_id`


**Source Code Analysis:**
Scanned 5911 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use extract knowledge for extract and structure knowledge from conversations","detected_actions":[],"detected_params":["message_id","content","session_id"]}'::jsonb),
('fetch-auto-fix-results', 'tool', 'Retrieve results from autonomous code fixing (Detailed Reference)', '# fetch-auto-fix-results

**Description:** Retrieve results from autonomous code fixing
**Category:** ecosystem

**Example Use:**
```json
Use fetch auto fix results for retrieve results from autonomous code fixing
```

**Usage Analysis:**

**Detected Parameters:**
- `original_execution_id`


**Source Code Analysis:**
Scanned 3491 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use fetch auto fix results for retrieve results from autonomous code fixing","detected_actions":[],"detected_params":["original_execution_id"]}'::jsonb),
('gemini-chat', 'tool', 'AI chat via Google Gemini model (Detailed Reference)', '# gemini-chat

**Description:** AI chat via Google Gemini model
**Category:** ai

**Example Use:**
```json
Use gemini chat for ai chat via google gemini model
```

**Usage Analysis:**

**Detected Parameters:**
- `message`
- `messages`
- `conversationHistory`
- `userContext`
- `councilMode`


**Source Code Analysis:**
Scanned 4083 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use gemini chat for ai chat via google gemini model","detected_actions":[],"detected_params":["message","messages","conversationHistory","userContext","councilMode"]}'::jsonb),
('get-code-execution-lessons', 'tool', 'Retrieve lessons learned from code executions (Detailed Reference)', '# get-code-execution-lessons

**Description:** Retrieve lessons learned from code executions
**Category:** code-execution

**Example Use:**
```json
Use get code execution lessons for retrieve lessons learned from code executions
```

**Usage Analysis:**

**Detected Parameters:**
- `limit = 20`
- `include_all_functions = false`
- `hours_back = 168`


**Source Code Analysis:**
Scanned 9284 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use get code execution lessons for retrieve lessons learned from code executions","detected_actions":[],"detected_params":["limit = 20","include_all_functions = false","hours_back = 168"]}'::jsonb),
('get-embedding', 'tool', 'Generate vector embeddings for text (Detailed Reference)', '# get-embedding

**Description:** Generate vector embeddings for text
**Category:** knowledge

**Example Use:**
```json
Use get embedding for generate vector embeddings for text
```

**Usage Analysis:**

**Detected Parameters:**
- `content`


**Source Code Analysis:**
Scanned 5560 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use get embedding for generate vector embeddings for text","detected_actions":[],"detected_params":["content"]}'::jsonb),
('get-lovable-key', 'tool', 'Retrieve Lovable API key (Detailed Reference)', '# get-lovable-key

**Description:** Retrieve Lovable API key
**Category:** ai

**Example Use:**
```json
Use get lovable key for retrieve lovable api key
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 1245 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use get lovable key for retrieve lovable api key","detected_actions":[],"detected_params":[]}'::jsonb),
('issue-engagement-command', 'tool', 'Engage with GitHub issues via commands (Detailed Reference)', '# issue-engagement-command

**Description:** Engage with GitHub issues via commands
**Category:** ecosystem

**Example Use:**
```json
Use issue engagement command for engage with github issues via commands
```

**Usage Analysis:**

**Available Actions:**
- `command`
- `pending`
- `acknowledge`
- `complete`

**Detected Parameters:**
- `action`
- `...payload`


**Source Code Analysis:**
Scanned 5658 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use issue engagement command for engage with github issues via commands","detected_actions":["command","pending","acknowledge","complete"],"detected_params":["action","...payload"]}'::jsonb),
('kimi-chat', 'tool', 'AI chat via Kimi model (Detailed Reference)', '# kimi-chat

**Description:** AI chat via Kimi model
**Category:** ai

**Example Use:**
```json
Use kimi chat for ai chat via kimi model
```

**Usage Analysis:**

**Detected Parameters:**
- `messages`
- `options`
- `googleCloudOperation`
- `service`
- `operation`
- `params`
- `videoGeneration`
- `prompt`
- `model`
- `gifSearch`
- `query`


**Source Code Analysis:**
Scanned 16657 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use kimi chat for ai chat via kimi model","detected_actions":[],"detected_params":["messages","options","googleCloudOperation","service","operation","params","videoGeneration","prompt","model","gifSearch","query"]}'::jsonb),
('list-available-functions', 'tool', 'List all available edge functions (Detailed Reference)', '# list-available-functions

**Description:** List all available edge functions
**Category:** ecosystem

**Example Use:**
```json
Use list available functions for list all available edge functions
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 1907 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use list available functions for list all available edge functions","detected_actions":[],"detected_params":[]}'::jsonb),
('monitor-device-connections', 'tool', 'Monitor mining device connections and status (Detailed Reference)', '# monitor-device-connections

**Description:** Monitor mining device connections and status
**Category:** mining

**Example Use:**
```json
Use monitor device connections for monitor mining device connections and status
```

**Usage Analysis:**

**Available Actions:**
- `connect`
- `disconnect`
- `heartbeat`
- `status`
- `list_active`
- `generate_claim_code`
- `verify_claim_code`
- `auto_pair_by_ip`
- `list_user_devices`
- `unclaim_device`

**Detected Parameters:**
- `data`


**Source Code Analysis:**
Scanned 27517 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use monitor device connections for monitor mining device connections and status","detected_actions":["connect","disconnect","heartbeat","status","list_active","generate_claim_code","verify_claim_code","auto_pair_by_ip","list_user_devices","unclaim_device"],"detected_params":["data"]}'::jsonb),
('morning-discussion-post', 'tool', 'Generate and post morning discussion topics (Detailed Reference)', '# morning-discussion-post

**Description:** Generate and post morning discussion topics
**Category:** autonomous

**Example Use:**
```json
Use morning discussion post for generate and post morning discussion topics
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 12042 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use morning discussion post for generate and post morning discussion topics","detected_actions":[],"detected_params":[]}'::jsonb),
('nlg-generator', 'tool', 'Natural language generation for reports and content (Detailed Reference)', '# nlg-generator

**Description:** Natural language generation for reports and content
**Category:** ecosystem

**Example Use:**
```json
Use nlg generator for natural language generation for reports and content
```

**Usage Analysis:**

**Detected Parameters:**
- `content_type`
- `audience_type = ''community''`
- `source_data`
- `format = ''markdown''`
- `title`
- `additional_context`


**Source Code Analysis:**
Scanned 5439 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use nlg generator for natural language generation for reports and content","detected_actions":[],"detected_params":["content_type","audience_type = ''community''","source_data","format = ''markdown''","title","additional_context"]}'::jsonb),
('openai-chat', 'tool', 'AI chat via OpenAI models (Detailed Reference)', '# openai-chat

**Description:** AI chat via OpenAI models
**Category:** ai

**Example Use:**
```json
Use openai chat for ai chat via openai models
```

**Usage Analysis:**

**Detected Parameters:**
- `message`
- `messages`
- `conversationHistory`
- `userContext`
- `councilMode`


**Source Code Analysis:**
Scanned 4122 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use openai chat for ai chat via openai models","detected_actions":[],"detected_params":["message","messages","conversationHistory","userContext","councilMode"]}'::jsonb),
('openai-tts', 'tool', 'Text-to-speech via OpenAI (Detailed Reference)', '# openai-tts

**Description:** Text-to-speech via OpenAI
**Category:** ai

**Example Use:**
```json
Use openai tts for text-to-speech via openai
```

**Usage Analysis:**

**Detected Parameters:**
- `text`
- `voice = ''alloy''`
- `speed = 1.0`


**Source Code Analysis:**
Scanned 3116 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use openai tts for text-to-speech via openai","detected_actions":[],"detected_params":["text","voice = ''alloy''","speed = 1.0"]}'::jsonb),
('uspto-patent-mcp', 'tool', 'MCP server for USPTO patent and trademark database access. Search 11M+ patents, retrieve full text, download PDFs, analyze portfolios using advanced CQL queries (Detailed Reference)', '# uspto-patent-mcp

**Description:** MCP server for USPTO patent and trademark database access. Search 11M+ patents, retrieve full text, download PDFs, analyze portfolios using advanced CQL queries
**Category:** research

**Example Use:**
```json
Search patents: {
```

**Usage Analysis:**

**Available Actions:**
- `initialize`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/read`
- `prompts/list`
- `prompts/get`
- `ping`
- `search_patents`
- `get_patent_fulltext`
- `download_patent_pdf`
- `search_by_inventor`
- `search_by_assignee`
- `search_by_classification`
- `patent_search_assistant`
- `prior_art_search`
- `competitive_analysis`
- `technology_landscape`

**Detected Parameters:**
- `method`
- `params`


**Source Code Analysis:**
Scanned 18164 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Search patents: {","detected_actions":["initialize","tools/list","tools/call","resources/list","resources/read","prompts/list","prompts/get","ping","search_patents","get_patent_fulltext","download_patent_pdf","search_by_inventor","search_by_assignee","search_by_classification","patent_search_assistant","prior_art_search","competitive_analysis","technology_landscape"],"detected_params":["method","params"]}'::jsonb),
('predictive-analytics', 'tool', 'Predictive analytics for mining and system metrics (Detailed Reference)', '# predictive-analytics

**Description:** Predictive analytics for mining and system metrics
**Category:** ecosystem

**Example Use:**
```json
Use predictive analytics for predictive analytics for mining and system metrics
```

**Usage Analysis:**

**Detected Parameters:**
- `action`
- `data_source`
- `custom_data`


**Source Code Analysis:**
Scanned 15974 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use predictive analytics for predictive analytics for mining and system metrics","detected_actions":[],"detected_params":["action","data_source","custom_data"]}'::jsonb),
('process-contributor-reward', 'tool', 'Process and distribute contributor rewards (Detailed Reference)', '# process-contributor-reward

**Description:** Process and distribute contributor rewards
**Category:** ecosystem

**Example Use:**
```json
Use process contributor reward for process and distribute contributor rewards
```

**Usage Analysis:**

**Detected Parameters:**
- `contribution_id`


**Source Code Analysis:**
Scanned 3865 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use process contributor reward for process and distribute contributor rewards","detected_actions":[],"detected_params":["contribution_id"]}'::jsonb),
('progress-update-post', 'tool', 'Generate and post progress updates (Detailed Reference)', '# progress-update-post

**Description:** Generate and post progress updates
**Category:** autonomous

**Example Use:**
```json
Use progress update post for generate and post progress updates
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 11237 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use progress update post for generate and post progress updates","detected_actions":[],"detected_params":[]}'::jsonb),
('prometheus-metrics', 'tool', 'Export Prometheus-compatible metrics (Detailed Reference)', '# prometheus-metrics

**Description:** Export Prometheus-compatible metrics
**Category:** mining

**Example Use:**
```json
Use prometheus metrics for export prometheus-compatible metrics
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 11100 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use prometheus metrics for export prometheus-compatible metrics","detected_actions":[],"detected_params":[]}'::jsonb),
('python-db-bridge', 'tool', 'Bridge for Python code to access database (Detailed Reference)', '# python-db-bridge

**Description:** Bridge for Python code to access database
**Category:** code-execution

**Example Use:**
```json
Use python db bridge for bridge for python code to access database
```

**Usage Analysis:**

**Available Actions:**
- `select`
- `insert`
- `update`
- `upsert`
- `delete`
- `count`
- `gt`
- `gte`
- `lt`
- `lte`
- `neq`
- `in`
- `like`
- `ilike`
- `is`
- `contains`
- `containedBy`
- `overlaps`
- `textSearch`
- `system_info`
- `list_cron_jobs`
- `get_cron_status`
- `list_edge_functions`
- `get_function_logs`
- `call_rpc`
- `get_schema`

**Detected Parameters:**
- `table`
- `operation`
- `filters`
- `data`
- `limit`
- `order`
- `columns`
- `function_name`
- `args`


**Source Code Analysis:**
Scanned 18419 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use python db bridge for bridge for python code to access database","detected_actions":["select","insert","update","upsert","delete","count","gt","gte","lt","lte","neq","in","like","ilike","is","contains","containedBy","overlaps","textSearch","system_info","list_cron_jobs","get_cron_status","list_edge_functions","get_function_logs","call_rpc","get_schema"],"detected_params":["table","operation","filters","data","limit","order","columns","function_name","args"]}'::jsonb),
('python-network-proxy', 'tool', 'Network proxy for Python code execution (Detailed Reference)', '# python-network-proxy

**Description:** Network proxy for Python code execution
**Category:** code-execution

**Example Use:**
```json
Use python network proxy for network proxy for python code execution
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 2826 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use python network proxy for network proxy for python code execution","detected_actions":[],"detected_params":[]}'::jsonb),
('vercel-ecosystem-api', 'tool', 'Vercel multi-service management for xmrt-io, xmrt-ecosystem, and xmrt-dao-ecosystem deployments (Detailed Reference)', '# vercel-ecosystem-api

**Description:** Vercel multi-service management for xmrt-io, xmrt-ecosystem, and xmrt-dao-ecosystem deployments
**Category:** deployment

**Example Use:**
```json
Check health of all Vercel services, get deployment info, monitor service status
```

**Usage Analysis:**

**Available Actions:**
- `get_deployment_info`
- `get_service_status`
- `get_deployments`

**Detected Parameters:**
- `action`


**Source Code Analysis:**
Scanned 4621 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Check health of all Vercel services, get deployment info, monitor service status","detected_actions":["get_deployment_info","get_service_status","get_deployments"],"detected_params":["action"]}'::jsonb),
('redis-cache', 'tool', 'Upstash Redis caching service for API responses, sessions, and rate limiting (Detailed Reference)', '# redis-cache

**Description:** Upstash Redis caching service for API responses, sessions, and rate limiting
**Category:** database

**Example Use:**
```json
Cache ecosystem health for 5 minutes, store session data, implement rate limiting
```

**Usage Analysis:**

**Available Actions:**
- `get`
- `set`
- `delete`
- `health`

**Detected Parameters:**
- `action`
- `key`
- `value`
- `ttl`


**Source Code Analysis:**
Scanned 3010 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Cache ecosystem health for 5 minutes, store session data, implement rate limiting","detected_actions":["get","set","delete","health"],"detected_params":["action","key","value","ttl"]}'::jsonb),
('schedule-reminder', 'tool', 'Schedule and send reminders (Detailed Reference)', '# schedule-reminder

**Description:** Schedule and send reminders
**Category:** ecosystem

**Example Use:**
```json
Use schedule reminder for schedule and send reminders
```

**Usage Analysis:**

**Detected Parameters:**
- `action_type`
- `action_data`
- `execute_at`
- `session_key`


**Source Code Analysis:**
Scanned 4258 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use schedule reminder for schedule and send reminders","detected_actions":[],"detected_params":["action_type","action_data","execute_at","session_key"]}'::jsonb),
('schema-manager', 'tool', 'Manage database schema and migrations (Detailed Reference)', '# schema-manager

**Description:** Manage database schema and migrations
**Category:** database

**Example Use:**
```json
Use schema manager for manage database schema and migrations
```

**Usage Analysis:**

**Available Actions:**
- `view_schema`
- `view_table_details`
- `analyze_performance`
- `view_table_sizes`
- `suggest_optimizations`
- `create_index`
- `vacuum_analyze`
- `audit_migrations`
- `list_tables`


**Source Code Analysis:**
Scanned 10924 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use schema manager for manage database schema and migrations","detected_actions":["view_schema","view_table_details","analyze_performance","view_table_sizes","suggest_optimizations","create_index","vacuum_analyze","audit_migrations","list_tables"],"detected_params":[]}'::jsonb),
('self-optimizing-agent-architecture', 'tool', 'Self-optimizing agent system architecture (Detailed Reference)', '# self-optimizing-agent-architecture

**Description:** Self-optimizing agent system architecture
**Category:** task-management

**Example Use:**
```json
Use self optimizing agent architecture for self-optimizing agent system architecture
```

**Usage Analysis:**

**Available Actions:**
- `analyze_skill_gaps`
- `optimize_task_routing`
- `detect_specializations`
- `forecast_workload`
- `autonomous_debugging`
- `run_full_optimization`

**Detected Parameters:**
- `action`


**Source Code Analysis:**
Scanned 19193 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use self optimizing agent architecture for self-optimizing agent system architecture","detected_actions":["analyze_skill_gaps","optimize_task_routing","detect_specializations","forecast_workload","autonomous_debugging","run_full_optimization"],"detected_params":["action"]}'::jsonb),
('summarize-conversation', 'tool', 'Generate conversation summaries (Detailed Reference)', '# summarize-conversation

**Description:** Generate conversation summaries
**Category:** ecosystem

**Example Use:**
```json
Use summarize conversation for generate conversation summaries
```

**Usage Analysis:**

**Detected Parameters:**
- `session_id`
- `messages`


**Source Code Analysis:**
Scanned 5216 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use summarize conversation for generate conversation summaries","detected_actions":[],"detected_params":["session_id","messages"]}'::jsonb),
('system-health', 'tool', 'Comprehensive system health monitoring (Detailed Reference)', '# system-health

**Description:** Comprehensive system health monitoring
**Category:** monitoring

**Example Use:**
```json
Use system health for comprehensive system health monitoring
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 23137 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use system health for comprehensive system health monitoring","detected_actions":[],"detected_params":[]}'::jsonb),
('universal-edge-invoker', 'tool', 'Universal invoker for all edge functions (Detailed Reference)', '# universal-edge-invoker

**Description:** Universal invoker for all edge functions
**Category:** ecosystem

**Example Use:**
```json
Use universal edge invoker for universal invoker for all edge functions
```

**Usage Analysis:**

**Detected Parameters:**
- `function_name`
- `payload`


**Source Code Analysis:**
Scanned 2811 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use universal edge invoker for universal invoker for all edge functions","detected_actions":[],"detected_params":["function_name","payload"]}'::jsonb),
('update-api-key', 'tool', 'Update API keys in the system (Detailed Reference)', '# update-api-key

**Description:** Update API keys in the system
**Category:** ecosystem

**Example Use:**
```json
Use update api key for update api keys in the system
```

**Usage Analysis:**

**Detected Parameters:**
- `service`
- `secret_name`
- `api_key`
- `organization_id`


**Source Code Analysis:**
Scanned 6526 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use update api key for update api keys in the system","detected_actions":[],"detected_params":["service","secret_name","api_key","organization_id"]}'::jsonb),
('validate-github-contribution', 'tool', 'Validate GitHub contributions for rewards (Detailed Reference)', '# validate-github-contribution

**Description:** Validate GitHub contributions for rewards
**Category:** github

**Example Use:**
```json
Use validate github contribution for validate github contributions for rewards
```

**Usage Analysis:**

**Detected Parameters:**
- `contribution_id`


**Source Code Analysis:**
Scanned 9306 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use validate github contribution for validate github contributions for rewards","detected_actions":[],"detected_params":["contribution_id"]}'::jsonb),
('validate-pop-event', 'tool', 'Validate proof-of-participation events (Detailed Reference)', '# validate-pop-event

**Description:** Validate proof-of-participation events
**Category:** ecosystem

**Example Use:**
```json
Use validate pop event for validate proof-of-participation events
```

**Usage Analysis:**

**Available Actions:**
- `validate`
- `events`
- `leaderboard`
- `payout`
- `charging_session`
- `mining_session`
- `device_connection`
- `task_completion`

**Detected Parameters:**
- `action`
- `...payload`


**Source Code Analysis:**
Scanned 7242 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use validate pop event for validate proof-of-participation events","detected_actions":["validate","events","leaderboard","payout","charging_session","mining_session","device_connection","task_completion"],"detected_params":["action","...payload"]}'::jsonb),
('vectorize-memory', 'tool', 'Convert memories to vector embeddings (Detailed Reference)', '# vectorize-memory

**Description:** Convert memories to vector embeddings
**Category:** knowledge

**Example Use:**
```json
Use vectorize memory for convert memories to vector embeddings
```

**Usage Analysis:**

**Detected Parameters:**
- `memory_id`
- `content`
- `context_type`


**Source Code Analysis:**
Scanned 4458 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use vectorize memory for convert memories to vector embeddings","detected_actions":[],"detected_params":["memory_id","content","context_type"]}'::jsonb),
('vercel-ai-chat', 'tool', 'AI chat via Vercel AI SDK (Detailed Reference)', '# vercel-ai-chat

**Description:** AI chat via Vercel AI SDK
**Category:** ai

**Example Use:**
```json
Use vercel ai chat for ai chat via vercel ai sdk
```

**Usage Analysis:**

**Detected Parameters:**
- `message`
- `messages`
- `conversationHistory`
- `userContext`
- `councilMode`


**Source Code Analysis:**
Scanned 4122 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use vercel ai chat for ai chat via vercel ai sdk","detected_actions":[],"detected_params":["message","messages","conversationHistory","userContext","councilMode"]}'::jsonb),
('vercel-ai-chat-stream', 'tool', 'Streaming AI chat via Vercel AI SDK (Detailed Reference)', '# vercel-ai-chat-stream

**Description:** Streaming AI chat via Vercel AI SDK
**Category:** ai

**Example Use:**
```json
Use vercel ai chat stream for streaming ai chat via vercel ai sdk
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 5444 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use vercel ai chat stream for streaming ai chat via vercel ai sdk","detected_actions":[],"detected_params":[]}'::jsonb),
('vercel-manager', 'tool', 'Manage Vercel deployments (Detailed Reference)', '# vercel-manager

**Description:** Manage Vercel deployments
**Category:** deployment

**Example Use:**
```json
Use vercel manager for manage vercel deployments
```

**Usage Analysis:**

**Available Actions:**
- `send_webhook`
- `get_frontend_status`
- `log_function_invocation`
- `notify_deployment`
- `get_project_info`

**Detected Parameters:**
- `action`
- `data`


**Source Code Analysis:**
Scanned 7489 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use vercel manager for manage vercel deployments","detected_actions":["send_webhook","get_frontend_status","log_function_invocation","notify_deployment","get_project_info"],"detected_params":["action","data"]}'::jsonb),
('weekly-retrospective-post', 'tool', 'Generate and post weekly retrospective (Detailed Reference)', '# weekly-retrospective-post

**Description:** Generate and post weekly retrospective
**Category:** autonomous

**Example Use:**
```json
Use weekly retrospective post for generate and post weekly retrospective
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 16078 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use weekly retrospective post for generate and post weekly retrospective","detected_actions":[],"detected_params":[]}'::jsonb),
('xmrt-mcp-server', 'tool', 'XMRT Model Context Protocol server (Detailed Reference)', '# xmrt-mcp-server

**Description:** XMRT Model Context Protocol server
**Category:** ecosystem

**Example Use:**
```json
Use xmrt mcp server for xmrt model context protocol server
```

**Usage Analysis:**

**Available Actions:**
- `initialize`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/read`
- `resources/subscribe`
- `prompts/list`
- `prompts/get`
- `ping`
- `xmrt_chat`
- `xmrt_deepseek_chat`
- `xmrt_openai_chat`
- `xmrt_github_list_repos`
- `xmrt_github_create_issue`
- `xmrt_github_search_code`
- `xmrt_store_knowledge`
- `xmrt_search_knowledge`
- `xmrt_execute_python`
- `xmrt_analyze_skill_gaps`
- `xmrt_optimize_task_routing`
- `xmrt_detect_specializations`
- `xmrt_forecast_workload`
- `xmrt_autonomous_debugging`
- `xmrt_run_full_optimization`
- `xmrt_charger_connect_device`
- `xmrt_charger_issue_command`
- `xmrt_charger_validate_pop`
- `xmrt_charger_get_metrics`
- `search_uspto_patents`
- `get_patent_details`
- `download_patent_pdf`
- `analyze_inventor_patents`
- `mining`
- `dao`
- `knowledge`
- `github`
- `xmrt_create_proposal`
- `xmrt_code_review`
- `xmrt_debug_issue`
- `xmrt_mining_analysis`
- `xmrt_ecosystem_health`

**Detected Parameters:**
- `method`
- `params`


**Source Code Analysis:**
Scanned 15894 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Use xmrt mcp server for xmrt model context protocol server","detected_actions":["initialize","tools/list","tools/call","resources/list","resources/read","resources/subscribe","prompts/list","prompts/get","ping","xmrt_chat","xmrt_deepseek_chat","xmrt_openai_chat","xmrt_github_list_repos","xmrt_github_create_issue","xmrt_github_search_code","xmrt_store_knowledge","xmrt_search_knowledge","xmrt_execute_python","xmrt_analyze_skill_gaps","xmrt_optimize_task_routing","xmrt_detect_specializations","xmrt_forecast_workload","xmrt_autonomous_debugging","xmrt_run_full_optimization","xmrt_charger_connect_device","xmrt_charger_issue_command","xmrt_charger_validate_pop","xmrt_charger_get_metrics","search_uspto_patents","get_patent_details","download_patent_pdf","analyze_inventor_patents","mining","dao","knowledge","github","xmrt_create_proposal","xmrt_code_review","xmrt_debug_issue","xmrt_mining_analysis","xmrt_ecosystem_health"],"detected_params":["method","params"]}'::jsonb),
('superduper-business-growth', 'tool', 'SuperDuper Agent: Business growth strategy and market expansion (Detailed Reference)', '# superduper-business-growth

**Description:** SuperDuper Agent: Business growth strategy and market expansion
**Category:** superduper

**Example Use:**
```json
Analyze market opportunities, develop growth strategies, revenue optimization
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 861 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Analyze market opportunities, develop growth strategies, revenue optimization","detected_actions":[],"detected_params":[]}'::jsonb),
('superduper-code-architect', 'tool', 'SuperDuper Agent: Software architecture and system design (Detailed Reference)', '# superduper-code-architect

**Description:** SuperDuper Agent: Software architecture and system design
**Category:** superduper

**Example Use:**
```json
Design system architecture, review code quality, optimize performance
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 893 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Design system architecture, review code quality, optimize performance","detected_actions":[],"detected_params":[]}'::jsonb),
('superduper-communication-outreach', 'tool', 'SuperDuper Agent: Community communication and outreach (Detailed Reference)', '# superduper-communication-outreach

**Description:** SuperDuper Agent: Community communication and outreach
**Category:** superduper

**Example Use:**
```json
Manage community outreach, stakeholder communications, engagement campaigns
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 895 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Manage community outreach, stakeholder communications, engagement campaigns","detected_actions":[],"detected_params":[]}'::jsonb),
('superduper-content-media', 'tool', 'SuperDuper Agent: Content creation and media strategy (Detailed Reference)', '# superduper-content-media

**Description:** SuperDuper Agent: Content creation and media strategy
**Category:** superduper

**Example Use:**
```json
Create marketing content, develop media strategy, social media management
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 856 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Create marketing content, develop media strategy, social media management","detected_actions":[],"detected_params":[]}'::jsonb),
('superduper-design-brand', 'tool', 'SuperDuper Agent: Brand identity and visual design (Detailed Reference)', '# superduper-design-brand

**Description:** SuperDuper Agent: Brand identity and visual design
**Category:** superduper

**Example Use:**
```json
Develop brand identity, create design systems, UI/UX improvements
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 903 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Develop brand identity, create design systems, UI/UX improvements","detected_actions":[],"detected_params":[]}'::jsonb),
('superduper-development-coach', 'tool', 'SuperDuper Agent: Developer mentoring and coaching (Detailed Reference)', '# superduper-development-coach

**Description:** SuperDuper Agent: Developer mentoring and coaching
**Category:** superduper

**Example Use:**
```json
Mentor developers, teach best practices, provide career guidance
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 856 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Mentor developers, teach best practices, provide career guidance","detected_actions":[],"detected_params":[]}'::jsonb),
('superduper-domain-experts', 'tool', 'SuperDuper Agent: Domain-specific expertise and consulting (Detailed Reference)', '# superduper-domain-experts

**Description:** SuperDuper Agent: Domain-specific expertise and consulting
**Category:** superduper

**Example Use:**
```json
Provide domain expertise, technical consulting, specialized guidance
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 898 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Provide domain expertise, technical consulting, specialized guidance","detected_actions":[],"detected_params":[]}'::jsonb),
('superduper-finance-investment', 'tool', 'SuperDuper Agent: Financial planning and investment strategy (Detailed Reference)', '# superduper-finance-investment

**Description:** SuperDuper Agent: Financial planning and investment strategy
**Category:** superduper

**Example Use:**
```json
Analyze financial health, develop investment strategy, budget planning
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 850 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Analyze financial health, develop investment strategy, budget planning","detected_actions":[],"detected_params":[]}'::jsonb),
('superduper-integration', 'tool', 'SuperDuper Agent: System integration and orchestration (Detailed Reference)', '# superduper-integration

**Description:** SuperDuper Agent: System integration and orchestration
**Category:** superduper

**Example Use:**
```json
Integrate systems, orchestrate APIs, coordinate services
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 872 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Integrate systems, orchestrate APIs, coordinate services","detected_actions":[],"detected_params":[]}'::jsonb),
('superduper-research-intelligence', 'tool', 'SuperDuper Agent: Research and competitive intelligence (Detailed Reference)', '# superduper-research-intelligence

**Description:** SuperDuper Agent: Research and competitive intelligence
**Category:** superduper

**Example Use:**
```json
Conduct market research, analyze competitors, monitor trends
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 841 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Conduct market research, analyze competitors, monitor trends","detected_actions":[],"detected_params":[]}'::jsonb),
('superduper-social-viral', 'tool', 'SuperDuper Agent: Social media and viral marketing (Detailed Reference)', '# superduper-social-viral

**Description:** SuperDuper Agent: Social media and viral marketing
**Category:** superduper

**Example Use:**
```json
Create viral campaigns, optimize social engagement, influencer partnerships
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 1097 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Create viral campaigns, optimize social engagement, influencer partnerships","detected_actions":[],"detected_params":[]}'::jsonb),
('eliza-intelligence-coordinator', 'tool', 'Coordinates intelligence gathering and knowledge synthesis across all agents (Detailed Reference)', '# eliza-intelligence-coordinator

**Description:** Coordinates intelligence gathering and knowledge synthesis across all agents
**Category:** autonomous

**Example Use:**
```json
Coordinate intelligence across agents, synthesize knowledge, orchestrate workflows
```

**Usage Analysis:**

**Available Actions:**
- `build_context`
- `store_learning`
- `get_memory_context`
- `update_knowledge_entities`

**Detected Parameters:**
- `action`
- `payload`


**Source Code Analysis:**
Scanned 5116 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Coordinate intelligence across agents, synthesize knowledge, orchestrate workflows","detected_actions":["build_context","store_learning","get_memory_context","update_knowledge_entities"],"detected_params":["action","payload"]}'::jsonb),
('eliza-self-evaluation', 'tool', 'Self-evaluation and performance analysis for continuous improvement (Detailed Reference)', '# eliza-self-evaluation

**Description:** Self-evaluation and performance analysis for continuous improvement
**Category:** autonomous

**Example Use:**
```json
Analyze system performance, evaluate effectiveness, recommend improvements
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 6420 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Analyze system performance, evaluate effectiveness, recommend improvements","detected_actions":[],"detected_params":[]}'::jsonb),
('evaluate-community-idea', 'tool', 'Evaluate community-submitted ideas for feasibility and impact (Detailed Reference)', '# evaluate-community-idea

**Description:** Evaluate community-submitted ideas for feasibility and impact
**Category:** governance

**Example Use:**
```json
Evaluate community proposals, assess feasibility, determine impact
```

**Usage Analysis:**

**Detected Parameters:**
- `action`
- `ideaId`


**Source Code Analysis:**
Scanned 11253 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Evaluate community proposals, assess feasibility, determine impact","detected_actions":[],"detected_params":["action","ideaId"]}'::jsonb),
('function-usage-analytics', 'tool', 'Analytics for edge function usage patterns and performance (Detailed Reference)', '# function-usage-analytics

**Description:** Analytics for edge function usage patterns and performance
**Category:** monitoring

**Example Use:**
```json
Analyze function usage, track performance, identify patterns
```

**Usage Analysis:**

**Detected Parameters:**
- `function_name`
- `executive_name`
- `time_period_hours = 168`
- `// Default 1 week
      min_usage_count = 1`


**Source Code Analysis:**
Scanned 5375 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Analyze function usage, track performance, identify patterns","detected_actions":[],"detected_params":["function_name","executive_name","time_period_hours = 168","// Default 1 week\n      min_usage_count = 1"]}'::jsonb),
('list-function-proposals', 'tool', 'List all edge function proposals and their status (Detailed Reference)', '# list-function-proposals

**Description:** List all edge function proposals and their status
**Category:** governance

**Example Use:**
```json
List pending proposals, check proposal status, view voting history
```

**Usage Analysis:**

**Detected Parameters:**
- `status`


**Source Code Analysis:**
Scanned 2945 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"List pending proposals, check proposal status, view voting history","detected_actions":[],"detected_params":["status"]}'::jsonb),
('mobile-miner-config', 'tool', 'Configuration management for mobile mining devices (Detailed Reference)', '# mobile-miner-config

**Description:** Configuration management for mobile mining devices
**Category:** mining

**Example Use:**
```json
Configure mobile miners, optimize settings, manage device profiles
```

**Usage Analysis:**

**Detected Parameters:**
- `user_number`


**Source Code Analysis:**
Scanned 1661 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Configure mobile miners, optimize settings, manage device profiles","detected_actions":[],"detected_params":["user_number"]}'::jsonb),
('mobile-miner-register', 'tool', 'Registration system for mobile mining devices (Detailed Reference)', '# mobile-miner-register

**Description:** Registration system for mobile mining devices
**Category:** mining

**Example Use:**
```json
Register mobile miners, onboard new devices, manage identities
```

**Usage Analysis:**

**Detected Parameters:**
- `username`
- `device_info`


**Source Code Analysis:**
Scanned 3350 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Register mobile miners, onboard new devices, manage identities","detected_actions":[],"detected_params":["username","device_info"]}'::jsonb),
('mobile-miner-script', 'tool', 'Script distribution for mobile mining clients (Detailed Reference)', '# mobile-miner-script

**Description:** Script distribution for mobile mining clients
**Category:** mining

**Example Use:**
```json
Distribute mining scripts, push updates, manage versions
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 5482 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Distribute mining scripts, push updates, manage versions","detected_actions":[],"detected_params":[]}'::jsonb),
('opportunity-scanner', 'tool', 'Autonomous opportunity scanning and identification (Detailed Reference)', '# opportunity-scanner

**Description:** Autonomous opportunity scanning and identification
**Category:** autonomous

**Example Use:**
```json
Scan for opportunities, detect market trends, identify potential
```

**Usage Analysis:**

**Detected Parameters:**
- `action`


**Source Code Analysis:**
Scanned 7334 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Scan for opportunities, detect market trends, identify potential","detected_actions":[],"detected_params":["action"]}'::jsonb),
('propose-new-edge-function', 'tool', 'Submit new edge function proposals for council voting (Detailed Reference)', '# propose-new-edge-function

**Description:** Submit new edge function proposals for council voting
**Category:** governance

**Example Use:**
```json
Propose new functions, submit to council, initiate voting
```

**Usage Analysis:**

**Detected Parameters:**
- `function_name`
- `description`
- `proposed_by`
- `// CSO`
- `CTO`
- `CIO`
- `CAO`
- `or ''eliza''
      category`
- `rationale`
- `use_cases`
- `implementation_outline`
- `auto_vote // If true`
- `automatically trigger executive voting`


**Source Code Analysis:**
Scanned 6225 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Propose new functions, submit to council, initiate voting","detected_actions":[],"detected_params":["function_name","description","proposed_by","// CSO","CTO","CIO","CAO","or ''eliza''\n      category","rationale","use_cases","implementation_outline","auto_vote // If true","automatically trigger executive voting"]}'::jsonb),
('render-api', 'tool', 'Render.com deployment management and monitoring (Detailed Reference)', '# render-api

**Description:** Render.com deployment management and monitoring
**Category:** deployment

**Example Use:**
```json
Manage Render deployments, monitor services, check health
```

**Usage Analysis:**

**Detected Parameters:**
- `action`
- `limit`


**Source Code Analysis:**
Scanned 12184 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Manage Render deployments, monitor services, check health","detected_actions":[],"detected_params":["action","limit"]}'::jsonb),
('system-knowledge-builder', 'tool', 'Autonomous knowledge base construction and maintenance (Detailed Reference)', '# system-knowledge-builder

**Description:** Autonomous knowledge base construction and maintenance
**Category:** knowledge

**Example Use:**
```json
Build knowledge base, extract entities, create relationships
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 5660 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Build knowledge base, extract entities, create relationships","detected_actions":[],"detected_params":[]}'::jsonb),
('vote-on-proposal', 'tool', 'Cast votes on edge function and governance proposals (Detailed Reference)', '# vote-on-proposal

**Description:** Cast votes on edge function and governance proposals
**Category:** governance

**Example Use:**
```json
Vote on proposals, evaluate decisions, participate in governance
```

**Usage Analysis:**

**Detected Parameters:**
- `proposal_id`
- `executive_name`
- `// CSO`
- `CTO`
- `CIO`
- `CAO`
- `or COMMUNITY
      vote`
- `// approve`
- `reject`
- `or abstain
      reasoning`
- `session_key // Required for COMMUNITY votes`


**Source Code Analysis:**
Scanned 16561 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Vote on proposals, evaluate decisions, participate in governance","detected_actions":[],"detected_params":["proposal_id","executive_name","// CSO","CTO","CIO","CAO","or COMMUNITY\n      vote","// approve","reject","or abstain\n      reasoning","session_key // Required for COMMUNITY votes"]}'::jsonb),
('superduper-router', 'tool', 'Central router for all SuperDuper specialist agents (Detailed Reference)', '# superduper-router

**Description:** Central router for all SuperDuper specialist agents
**Category:** superduper

**Example Use:**
```json
Route to SuperDuper agents, orchestrate specialist requests
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 10584 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Route to SuperDuper agents, orchestrate specialist requests","detected_actions":[],"detected_params":[]}'::jsonb),
('hume-expression-measurement', 'tool', '🎭 Hume Expression Measurement - Analyze facial expressions and emotions (Detailed Reference)', '# hume-expression-measurement

**Description:** 🎭 Hume Expression Measurement - Analyze facial expressions and emotions
**Category:** hume

**Example Use:**
```json
{
```

**Usage Analysis:**

**Detected Parameters:**
- `models`
- `image`


**Source Code Analysis:**
Scanned 7641 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":[],"detected_params":["models","image"]}'::jsonb),
('hume-tts', 'tool', '🎭 Hume TTS - Empathic text-to-speech with emotional expression (Detailed Reference)', '# hume-tts

**Description:** 🎭 Hume TTS - Empathic text-to-speech with emotional expression
**Category:** hume

**Example Use:**
```json
{
```

**Usage Analysis:**

**Detected Parameters:**
- `text`
- `voiceId`


**Source Code Analysis:**
Scanned 5927 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":[],"detected_params":["text","voiceId"]}'::jsonb),
('identify-service-interest', 'tool', '🎯 Service Interest Detection - Identify services a lead wants (Detailed Reference)', '# identify-service-interest

**Description:** 🎯 Service Interest Detection - Identify services a lead wants
**Category:** acquisition

**Example Use:**
```json
{
```

**Usage Analysis:**

**Detected Parameters:**
- `user_message`
- `conversation_history = []`
- `session_key`


**Source Code Analysis:**
Scanned 5292 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":[],"detected_params":["user_message","conversation_history = []","session_key"]}'::jsonb),
('convert-session-to-user', 'tool', '👤 Session Conversion - Convert anonymous sessions to users (Detailed Reference)', '# convert-session-to-user

**Description:** 👤 Session Conversion - Convert anonymous sessions to users
**Category:** acquisition

**Example Use:**
```json
{
```

**Usage Analysis:**

**Available Actions:**
- `create_user_profile`
- `link_api_key_to_session`
- `enrich_user_profile`

**Detected Parameters:**
- `session_key`
- `email`
- `action = ''create_user_profile''`


**Source Code Analysis:**
Scanned 5563 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["create_user_profile","link_api_key_to_session","enrich_user_profile"],"detected_params":["session_key","email","action = ''create_user_profile''"]}'::jsonb),
('stripe-payment-webhook', 'tool', '💳 Stripe Webhook - Process payments and auto-upgrade keys (Detailed Reference)', '# stripe-payment-webhook

**Description:** 💳 Stripe Webhook - Process payments and auto-upgrade keys
**Category:** payments

**Example Use:**
```json
Webhook endpoint for Stripe events
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 9245 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Webhook endpoint for Stripe events","detected_actions":[],"detected_params":[]}'::jsonb),
('task-auto-advance', 'tool', '⏩ Task Auto-Advance - Auto-advance tasks through pipeline (Detailed Reference)', '# task-auto-advance

**Description:** ⏩ Task Auto-Advance - Auto-advance tasks through pipeline
**Category:** automation

**Example Use:**
```json
Runs on cron to advance eligible tasks
```

**Usage Analysis:**

**Detected Parameters:**
- `action = ''auto_advance''`
- `task_id`
- `force = false`


**Source Code Analysis:**
Scanned 13874 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Runs on cron to advance eligible tasks","detected_actions":[],"detected_params":["action = ''auto_advance''","task_id","force = false"]}'::jsonb),
('get-function-version-analytics', 'tool', '📈 Function Version Analytics - Compare versions (Detailed Reference)', '# get-function-version-analytics

**Description:** 📈 Function Version Analytics - Compare versions
**Category:** monitoring

**Example Use:**
```json
{
```

**Usage Analysis:**

**Detected Parameters:**
- `function_name`
- `// REQUIRED`
- `// OPTIONAL`
- `// Compare all versions
      time_window_hours = 168`
- `// Default`


**Source Code Analysis:**
Scanned 10538 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":[],"detected_params":["function_name","// REQUIRED","// OPTIONAL","// Compare all versions\n      time_window_hours = 168","// Default"]}'::jsonb),
('sync-function-logs', 'tool', '🔄 Sync Function Logs - Synchronize logs from Analytics (Detailed Reference)', '# sync-function-logs

**Description:** 🔄 Sync Function Logs - Synchronize logs from Analytics
**Category:** monitoring

**Example Use:**
```json
Runs on cron every 15 minutes
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 16586 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Runs on cron every 15 minutes","detected_actions":[],"detected_params":[]}'::jsonb),
('tool-usage-analytics', 'tool', '📊 Tool Usage Analytics - Comprehensive tool analytics (Detailed Reference)', '# tool-usage-analytics

**Description:** 📊 Tool Usage Analytics - Comprehensive tool analytics
**Category:** monitoring

**Example Use:**
```json
{
```

**Usage Analysis:**

**Available Actions:**
- `refresh_dashboard`
- `summary`
- `by_category`
- `by_tool`
- `errors`
- `performance`
- `trends`
- `executive_usage`

**Detected Parameters:**
- `action = ''summary''`
- `time_window_hours = 24`
- `category`
- `tool_name`
- `executive_name`
- `limit = 50`


**Source Code Analysis:**
Scanned 15708 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["refresh_dashboard","summary","by_category","by_tool","errors","performance","trends","executive_usage"],"detected_params":["action = ''summary''","time_window_hours = 24","category","tool_name","executive_name","limit = 50"]}'::jsonb),
('query-edge-analytics', 'tool', '🔍 Query Edge Analytics - Query Supabase Analytics (Detailed Reference)', '# query-edge-analytics

**Description:** 🔍 Query Edge Analytics - Query Supabase Analytics
**Category:** monitoring

**Example Use:**
```json
{
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 11267 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":[],"detected_params":[]}'::jsonb),
('debug-analytics-data-flow', 'tool', '🔍 Debug Analytics - Trace analytics data flow (Detailed Reference)', '# debug-analytics-data-flow

**Description:** 🔍 Debug Analytics - Trace analytics data flow
**Category:** monitoring

**Example Use:**
```json
Debug analytics pipeline issues
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 14841 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"Debug analytics pipeline issues","detected_actions":[],"detected_params":[]}'::jsonb),
('handle-rejected-proposal', 'tool', '❌ Handle Rejected Proposals - Generate improvement suggestions (Detailed Reference)', '# handle-rejected-proposal

**Description:** ❌ Handle Rejected Proposals - Generate improvement suggestions
**Category:** governance

**Example Use:**
```json
{
```

**Usage Analysis:**

**Detected Parameters:**
- `proposal_id`


**Source Code Analysis:**
Scanned 8240 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":[],"detected_params":["proposal_id"]}'::jsonb),
('execute-approved-proposal', 'tool', '✅ Execute Approved Proposals - Finalize with code generation (Detailed Reference)', '# execute-approved-proposal

**Description:** ✅ Execute Approved Proposals - Finalize with code generation
**Category:** governance

**Example Use:**
```json
{
```

**Usage Analysis:**

**Detected Parameters:**
- `proposal_id`


**Source Code Analysis:**
Scanned 18146 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":[],"detected_params":["proposal_id"]}'::jsonb),
('request-executive-votes', 'tool', '🗳️ Request Executive Votes - Trigger AI executives to vote (Detailed Reference)', '# request-executive-votes

**Description:** 🗳️ Request Executive Votes - Trigger AI executives to vote
**Category:** governance

**Example Use:**
```json
{
```

**Usage Analysis:**

**Detected Parameters:**
- `proposal_id`


**Source Code Analysis:**
Scanned 15548 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":[],"detected_params":["proposal_id"]}'::jsonb),
('deploy-approved-edge-function', 'tool', '🚀 Deploy Edge Function - Deploy approved functions (Detailed Reference)', '# deploy-approved-edge-function

**Description:** 🚀 Deploy Edge Function - Deploy approved functions
**Category:** deployment

**Example Use:**
```json
{
```

**Usage Analysis:**

**Available Actions:**
- `process_queue`
- `deploy_single`
- `get_deployment_status`
- `rollback`

**Detected Parameters:**
- `action = ''process_queue''`
- `proposal_id`
- `auto_deploy = true`
- `run_health_check = true`
- `version_tag`


**Source Code Analysis:**
Scanned 19408 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["process_queue","deploy_single","get_deployment_status","rollback"],"detected_params":["action = ''process_queue''","proposal_id","auto_deploy = true","run_health_check = true","version_tag"]}'::jsonb),
('event-dispatcher', 'tool', '🎯 Event Dispatcher - Intelligent event routing (Detailed Reference)', '# event-dispatcher

**Description:** 🎯 Event Dispatcher - Intelligent event routing
**Category:** ecosystem

**Example Use:**
```json
{
```

**Usage Analysis:**

**Available Actions:**
- `trigger_workflow`
- `assign_task`
- `create_issue`
- `call_function`

**Detected Parameters:**
- `event_id`
- `event_source`
- `event_type`
- `priority`
- `payload`
- `metadata`


**Source Code Analysis:**
Scanned 10804 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["trigger_workflow","assign_task","create_issue","call_function"],"detected_params":["event_id","event_source","event_type","priority","payload","metadata"]}'::jsonb),
('usage-monitor', 'tool', '📊 Usage Monitor - Track API usage and quotas (Detailed Reference)', '# usage-monitor

**Description:** 📊 Usage Monitor - Track API usage and quotas
**Category:** monitoring

**Example Use:**
```json
{
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 4808 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":[],"detected_params":[]}'::jsonb),
('vertex-ai-image-gen', 'tool', '🖼️ Vertex AI Image Gen - Generate high-quality images using Imagen (Detailed Reference)', '# vertex-ai-image-gen

**Description:** 🖼️ Vertex AI Image Gen - Generate high-quality images using Imagen
**Category:** ai

**Example Use:**
```json
{
```

**Usage Analysis:**

**Available Actions:**
- `generate_image`
- `analyze_image`
- `analyze_attachment`

**Detected Parameters:**
- `image`
- `features`
- `session_id`
- `sessionId`


**Source Code Analysis:**
Scanned 13024 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["generate_image","analyze_image","analyze_attachment"],"detected_params":["image","features","session_id","sessionId"]}'::jsonb),
('google-gmail', 'tool', '📧 Gmail Integration - Send emails, read threads, manage drafts (Detailed Reference)', '# google-gmail

**Description:** 📧 Gmail Integration - Send emails, read threads, manage drafts
**Category:** web

**Example Use:**
```json
{
```

**Usage Analysis:**

**Formal Actions Definition:**
```json
{
          service: ''google-gmail'',
          actions: [
            { name: ''send_email'', params: [''to'', ''subject'', ''body'', ''is_html?''], description: ''Send an email'' },
            { name: ''list_emails'', params: [''query?'', ''max_results?''], description: ''List emails with optional search'' },
            { name: ''get_email'', params: [''message_id''], description: ''Get full email content'' },
            { name: ''create_draft'', params: [''to'', ''subject'', ''body''], description: ''Create email draft'' }
          ]
        }
```

**Available Actions:**
- `send_email`
- `list_emails`
- `get_email`
- `create_draft`
- `list_actions`

**Detected Parameters:**
- `to`
- `subject`
- `body`
- `is_html`
- `query`
- `max_results`
- `message_id`


**Source Code Analysis:**
Scanned 6707 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["send_email","list_emails","get_email","create_draft","list_actions"],"detected_params":["to","subject","body","is_html","query","max_results","message_id"]}'::jsonb),
('google-calendar', 'tool', '📅 Google Calendar - Manage events and schedules (Detailed Reference)', '# google-calendar

**Description:** 📅 Google Calendar - Manage events and schedules
**Category:** web

**Example Use:**
```json
{
```

**Usage Analysis:**

**Formal Actions Definition:**
```json
{
          service: ''google-calendar'',
          actions: [
            { name: ''list_events'', params: [''calendar_id?'', ''time_min?'', ''time_max?'', ''max_results?''], description: ''List calendar events'' },
            { name: ''create_event'', params: [''title'', ''start_time'', ''end_time'', ''description?'', ''attendees?'', ''calendar_id?''], description: ''Create calendar event'' },
            { name: ''update_event'', params: [''event_id'', ''title?'', ''start_time?'', ''end_time?'', ''description?'', ''calendar_id?''], description: ''Update event'' },
            { name: ''delete_event'', params: [''event_id'', ''calendar_id?''], description: ''Delete event'' },
            { name: ''get_event'', params: [''event_id'', ''calendar_id?''], description: ''Get event details'' }
          ]
        }
```

**Available Actions:**
- `list_events`
- `create_event`
- `update_event`
- `delete_event`
- `get_event`
- `list_actions`

**Detected Parameters:**
- `calendar_id`
- `time_min`
- `time_max`
- `max_results`
- `title`
- `start_time`
- `end_time`
- `description`
- `attendees`
- `event_id`


**Source Code Analysis:**
Scanned 7271 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["list_events","create_event","update_event","delete_event","get_event","list_actions"],"detected_params":["calendar_id","time_min","time_max","max_results","title","start_time","end_time","description","attendees","event_id"]}'::jsonb),
('google-drive', 'tool', '📂 Google Drive - Manage files and folders (Detailed Reference)', '# google-drive

**Description:** 📂 Google Drive - Manage files and folders
**Category:** web

**Example Use:**
```json
{
```

**Usage Analysis:**

**Formal Actions Definition:**
```json
{
          service: ''google-drive'',
          actions: [
            { name: ''list_files'', params: [''query?'', ''max_results?'', ''folder_id?''], description: ''List files in Drive'' },
            { name: ''upload_file'', params: [''file_name'', ''content'', ''mime_type?'', ''folder_id?''], description: ''Upload a file'' },
            { name: ''get_file'', params: [''file_id''], description: ''Get file metadata'' },
            { name: ''download_file'', params: [''file_id''], description: ''Download file content'' },
            { name: ''create_folder'', params: [''folder_name'', ''parent_folder_id?''], description: ''Create a folder'' },
            { name: ''share_file'', params: [''file_id'', ''email'', ''role?''], description: ''Share file with user'' }
          ]
        }
```

**Available Actions:**
- `list_files`
- `upload_file`
- `get_file`
- `download_file`
- `create_folder`
- `share_file`
- `list_actions`

**Detected Parameters:**
- `query`
- `max_results`
- `folder_id`
- `file_name`
- `content`
- `mime_type`
- `file_id`
- `folder_name`
- `parent_folder_id`
- `email`
- `role`


**Source Code Analysis:**
Scanned 7028 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["list_files","upload_file","get_file","download_file","create_folder","share_file","list_actions"],"detected_params":["query","max_results","folder_id","file_name","content","mime_type","file_id","folder_name","parent_folder_id","email","role"]}'::jsonb),
('google-sheets', 'tool', '📊 Google Sheets - Read and write spreadsheet data (Detailed Reference)', '# google-sheets

**Description:** 📊 Google Sheets - Read and write spreadsheet data
**Category:** web

**Example Use:**
```json
{
```

**Usage Analysis:**

**Formal Actions Definition:**
```json
{
          service: ''google-sheets'',
          actions: [
            { name: ''create_spreadsheet'', params: [''title'', ''sheet_name?''], description: ''Create new spreadsheet'' },
            { name: ''read_sheet'', params: [''spreadsheet_id'', ''range''], description: ''Read data from sheet range'' },
            { name: ''write_sheet'', params: [''spreadsheet_id'', ''range'', ''values''], description: ''Write data to sheet range'' },
            { name: ''append_sheet'', params: [''spreadsheet_id'', ''range'', ''values''], description: ''Append rows to sheet'' },
            { name: ''get_spreadsheet_info'', params: [''spreadsheet_id''], description: ''Get spreadsheet metadata'' }
          ]
        }
```

**Available Actions:**
- `create_spreadsheet`
- `read_sheet`
- `write_sheet`
- `append_sheet`
- `get_spreadsheet_info`
- `list_actions`

**Detected Parameters:**
- `title`
- `sheet_name`
- `spreadsheet_id`
- `range`
- `values`


**Source Code Analysis:**
Scanned 5974 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["create_spreadsheet","read_sheet","write_sheet","append_sheet","get_spreadsheet_info","list_actions"],"detected_params":["title","sheet_name","spreadsheet_id","range","values"]}'::jsonb),
('typefully-integration', 'tool', '🐦 Typefully/Twitter - Schedule and publish tweets/threads (Detailed Reference)', '# typefully-integration

**Description:** 🐦 Typefully/Twitter - Schedule and publish tweets/threads
**Category:** web

**Example Use:**
```json
{
```

**Usage Analysis:**

**Available Actions:**
- `get-me`
- `list-social-sets`
- `create-draft`
- `list-drafts`
- `update-draft`

**Detected Parameters:**
- `action`
- `social_set_id`
- `...payload`


**Source Code Analysis:**
Scanned 3151 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["get-me","list-social-sets","create-draft","list-drafts","update-draft"],"detected_params":["action","social_set_id","...payload"]}'::jsonb),
('daily-news-finder', 'tool', '📰 Daily News Finder - Search and curate daily news topics (Detailed Reference)', '# daily-news-finder

**Description:** 📰 Daily News Finder - Search and curate daily news topics
**Category:** autonomous

**Example Use:**
```json
{
```

**Usage Analysis:**


**Source Code Analysis:**
Scanned 6767 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":[],"detected_params":[]}'::jsonb),
('agent-coordination-hub', 'tool', '🤝 Agent Coordination Hub - Central hub for multi-agent synchronization (Detailed Reference)', '# agent-coordination-hub

**Description:** 🤝 Agent Coordination Hub - Central hub for multi-agent synchronization
**Category:** task-management

**Example Use:**
```json
{
```

**Usage Analysis:**

**Available Actions:**
- `register_agent`
- `request_task`
- `report_completion`
- `check_conflicts`

**Detected Parameters:**
- `action`
- `agent_id`
- `task_data`


**Source Code Analysis:**
Scanned 3598 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["register_agent","request_task","report_completion","check_conflicts"],"detected_params":["action","agent_id","task_data"]}'::jsonb),
('agent-deployment-coordinator', 'tool', '🚀 Agent Deployment - Coordinate agent deployments and updates (Detailed Reference)', '# agent-deployment-coordinator

**Description:** 🚀 Agent Deployment - Coordinate agent deployments and updates
**Category:** deployment

**Example Use:**
```json
{
```

**Usage Analysis:**

**Available Actions:**
- `deploy`
- `undeploy`
- `status`
- `list`
- `update`
- `health_check`


**Source Code Analysis:**
Scanned 12426 bytes of code to extract usage patterns.', 0.95, '{"source":"auto_generated","registry_example":"{","detected_actions":["deploy","undeploy","status","list","update","health_check"],"detected_params":[]}'::jsonb)
ON CONFLICT (name, entity_type) DO UPDATE SET
content = EXCLUDED.content,
description = EXCLUDED.description,
metadata = EXCLUDED.metadata;

COMMIT;
