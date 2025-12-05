
-- ============================================
-- STEP 1: Expand category constraint to allow new categories
-- ============================================
ALTER TABLE workflow_templates DROP CONSTRAINT workflow_templates_category_check;

ALTER TABLE workflow_templates ADD CONSTRAINT workflow_templates_category_check 
CHECK (category = ANY (ARRAY[
  'revenue', 'marketing', 'financial', 'optimization',
  'ecosystem_evolution', 'community_growth', 'technical_excellence', 'knowledge_management'
]));

-- ============================================
-- STEP 2: Recategorize existing templates for balance
-- ============================================
UPDATE workflow_templates 
SET category = 'technical_excellence', tags = array_append(tags, 'technical_excellence')
WHERE template_name = 'auto_fix_codebase';

UPDATE workflow_templates 
SET category = 'optimization', tags = array_append(tags, 'optimization')
WHERE template_name = 'modify_edge_function';

-- ============================================
-- STEP 3: Add new workflow templates
-- ============================================

-- 1. performance_optimization_cycle
INSERT INTO workflow_templates (template_name, category, description, steps, tags, estimated_duration_seconds, is_active)
VALUES (
  'performance_optimization_cycle',
  'optimization',
  'Continuous performance improvement workflow that collects metrics, identifies bottlenecks, and generates optimization recommendations',
  '[
    {"step_type": "api_call", "step_name": "collect_diagnostics", "description": "Collect comprehensive performance metrics", "parameters": {"function": "system-diagnostics"}},
    {"step_type": "api_call", "step_name": "get_function_logs", "description": "Get recent error patterns", "parameters": {"function": "get-edge-function-logs"}},
    {"step_type": "api_call", "step_name": "analyze_usage", "description": "Analyze function performance", "parameters": {"function": "function-usage-analytics"}},
    {"step_type": "ai_analysis", "step_name": "identify_bottlenecks", "description": "AI identifies bottlenecks", "parameters": {"model": "deepseek"}},
    {"step_type": "ai_generation", "step_name": "generate_recommendations", "description": "Generate optimization recommendations", "parameters": {"model": "deepseek"}},
    {"step_type": "database", "step_name": "create_tasks", "description": "Create optimization tasks", "parameters": {"table": "tasks", "operation": "insert"}},
    {"step_type": "notification", "step_name": "report_findings", "description": "Report findings", "parameters": {"channel": "activity_feed"}}
  ]'::jsonb,
  ARRAY['optimization', 'performance', 'monitoring'],
  120,
  true
) ON CONFLICT (template_name) DO UPDATE SET category = EXCLUDED.category, steps = EXCLUDED.steps, tags = EXCLUDED.tags;

-- 2. code_quality_audit
INSERT INTO workflow_templates (template_name, category, description, steps, tags, estimated_duration_seconds, is_active)
VALUES (
  'code_quality_audit',
  'technical_excellence',
  'Automated code quality assurance with static analysis and technical debt assessment',
  '[
    {"step_type": "api_call", "step_name": "get_recent_activity", "description": "List recent commits", "parameters": {"function": "github-integration"}},
    {"step_type": "api_call", "step_name": "get_execution_lessons", "description": "Get failure patterns", "parameters": {"function": "get-code-execution-lessons"}},
    {"step_type": "api_call", "step_name": "consult_architect", "description": "Code review consultation", "parameters": {"function": "superduper-code-architect"}},
    {"step_type": "ai_analysis", "step_name": "analyze_quality", "description": "Analyze code quality patterns", "parameters": {"model": "deepseek"}},
    {"step_type": "scoring", "step_name": "calculate_debt", "description": "Calculate technical debt score", "parameters": {"criteria": ["complexity", "coverage", "security"]}},
    {"step_type": "reporting", "step_name": "generate_report", "description": "Generate quality report", "parameters": {"format": "markdown"}},
    {"step_type": "database", "step_name": "log_findings", "description": "Create remediation tasks", "parameters": {"table": "tasks"}}
  ]'::jsonb,
  ARRAY['technical_excellence', 'code_quality', 'security'],
  75,
  true
) ON CONFLICT (template_name) DO UPDATE SET category = EXCLUDED.category, steps = EXCLUDED.steps, tags = EXCLUDED.tags;

-- 3. documentation_generation_workflow
INSERT INTO workflow_templates (template_name, category, description, steps, tags, estimated_duration_seconds, is_active)
VALUES (
  'documentation_generation_workflow',
  'knowledge_management',
  'Automated documentation creation and maintenance for edge functions and APIs',
  '[
    {"step_type": "api_call", "step_name": "list_functions", "description": "Get all edge functions", "parameters": {"function": "list-available-functions"}},
    {"step_type": "api_call", "step_name": "get_function_details", "description": "Get function details", "parameters": {"function": "search-edge-functions"}},
    {"step_type": "ai_generation", "step_name": "generate_docs", "description": "Generate documentation", "parameters": {"model": "deepseek", "output_format": "markdown"}},
    {"step_type": "api_call", "step_name": "create_docs_pr", "description": "Create docs in repo", "parameters": {"function": "github-integration"}},
    {"step_type": "api_call", "step_name": "store_knowledge", "description": "Store in knowledge base", "parameters": {"function": "knowledge-manager"}},
    {"step_type": "notification", "step_name": "announce_updates", "description": "Announce updates", "parameters": {"channel": "activity_feed"}}
  ]'::jsonb,
  ARRAY['knowledge_management', 'documentation', 'api'],
  60,
  true
) ON CONFLICT (template_name) DO UPDATE SET category = EXCLUDED.category, steps = EXCLUDED.steps, tags = EXCLUDED.tags;

-- 4. dao_governance_cycle
INSERT INTO workflow_templates (template_name, category, description, steps, tags, estimated_duration_seconds, is_active)
VALUES (
  'dao_governance_cycle',
  'community_growth',
  'Complete DAO governance automation including proposal management, voting, and execution',
  '[
    {"step_type": "database", "step_name": "fetch_proposals", "description": "Fetch active proposals", "parameters": {"table": "edge_function_proposals"}},
    {"step_type": "api_call", "step_name": "check_phases", "description": "Check governance phases", "parameters": {"function": "governance-phase-manager"}},
    {"step_type": "api_call", "step_name": "trigger_voting", "description": "Trigger executive voting", "parameters": {"function": "request-executive-votes"}},
    {"step_type": "analytics", "step_name": "calculate_votes", "description": "Calculate vote tallies", "parameters": {"metrics": ["total_votes", "approval_rate"]}},
    {"step_type": "decision", "step_name": "determine_outcome", "description": "Determine proposal outcome", "parameters": {"threshold": 0.6}},
    {"step_type": "api_call", "step_name": "execute_result", "description": "Execute approved proposal", "parameters": {"function": "execute-approved-proposal"}},
    {"step_type": "reporting", "step_name": "generate_summary", "description": "Generate governance summary", "parameters": {"format": "markdown"}},
    {"step_type": "notification", "step_name": "post_results", "description": "Post results", "parameters": {"channels": ["github", "activity_feed"]}}
  ]'::jsonb,
  ARRAY['community_growth', 'governance', 'dao', 'voting'],
  240,
  true
) ON CONFLICT (template_name) DO UPDATE SET category = EXCLUDED.category, steps = EXCLUDED.steps, tags = EXCLUDED.tags;

-- 5. contributor_onboarding_workflow
INSERT INTO workflow_templates (template_name, category, description, steps, tags, estimated_duration_seconds, is_active)
VALUES (
  'contributor_onboarding_workflow',
  'community_growth',
  'Streamlined contributor onboarding with skills assessment and mentorship',
  '[
    {"step_type": "api_call", "step_name": "get_contributor_profile", "description": "Get GitHub profile", "parameters": {"function": "github-integration"}},
    {"step_type": "ai_analysis", "step_name": "assess_skills", "description": "Assess contributor skills", "parameters": {"model": "deepseek"}},
    {"step_type": "scoring", "step_name": "match_tasks", "description": "Match skills to tasks", "parameters": {"criteria": ["skill_match", "complexity_fit"]}},
    {"step_type": "api_call", "step_name": "assign_mentor", "description": "Assign mentor agent", "parameters": {"function": "agent-manager"}},
    {"step_type": "database", "step_name": "create_profile", "description": "Create contributor profile", "parameters": {"table": "developer_onboarding"}},
    {"step_type": "api_call", "step_name": "assign_task", "description": "Assign first task", "parameters": {"function": "task-orchestrator"}},
    {"step_type": "notification", "step_name": "send_welcome", "description": "Send welcome message", "parameters": {"channel": "github"}}
  ]'::jsonb,
  ARRAY['community_growth', 'onboarding', 'contributors'],
  90,
  true
) ON CONFLICT (template_name) DO UPDATE SET category = EXCLUDED.category, steps = EXCLUDED.steps, tags = EXCLUDED.tags;

-- 6. create_new_microservice
INSERT INTO workflow_templates (template_name, category, description, steps, tags, estimated_duration_seconds, is_active)
VALUES (
  'create_new_microservice',
  'ecosystem_evolution',
  'Automate creation of new microservices with boilerplate code and CI/CD setup',
  '[
    {"step_type": "ai_analysis", "step_name": "parse_requirements", "description": "Parse requirements", "parameters": {"model": "deepseek"}},
    {"step_type": "api_call", "step_name": "get_architecture_review", "description": "Get architecture review", "parameters": {"function": "superduper-code-architect"}},
    {"step_type": "ai_generation", "step_name": "generate_boilerplate", "description": "Generate edge function code", "parameters": {"model": "deepseek", "output_format": "typescript"}},
    {"step_type": "api_call", "step_name": "create_branch", "description": "Create branch in GitHub", "parameters": {"function": "github-integration"}},
    {"step_type": "api_call", "step_name": "submit_proposal", "description": "Submit for council approval", "parameters": {"function": "propose-new-edge-function"}},
    {"step_type": "database", "step_name": "create_deployment_task", "description": "Create deployment task", "parameters": {"table": "tasks"}},
    {"step_type": "notification", "step_name": "announce_proposal", "description": "Announce proposal", "parameters": {"channel": "activity_feed"}}
  ]'::jsonb,
  ARRAY['ecosystem_evolution', 'microservice', 'app_creation'],
  90,
  true
) ON CONFLICT (template_name) DO UPDATE SET category = EXCLUDED.category, steps = EXCLUDED.steps, tags = EXCLUDED.tags;

-- 7. feature_development_pipeline
INSERT INTO workflow_templates (template_name, category, description, steps, tags, estimated_duration_seconds, is_active)
VALUES (
  'feature_development_pipeline',
  'ecosystem_evolution',
  'End-to-end feature development from specification to production rollout',
  '[
    {"step_type": "ai_analysis", "step_name": "parse_requirements", "description": "Parse into user stories", "parameters": {"model": "deepseek"}},
    {"step_type": "api_call", "step_name": "technical_design", "description": "Technical design review", "parameters": {"function": "superduper-code-architect"}},
    {"step_type": "decision", "step_name": "architecture_gate", "description": "Architecture approval gate", "parameters": {"field": "design_approved"}},
    {"step_type": "ai_generation", "step_name": "generate_code", "description": "Generate implementation", "parameters": {"model": "deepseek", "output_format": "typescript"}},
    {"step_type": "api_call", "step_name": "create_pr", "description": "Create feature PR", "parameters": {"function": "github-integration"}},
    {"step_type": "api_call", "step_name": "trigger_ci", "description": "Run CI tests", "parameters": {"function": "github-integration"}},
    {"step_type": "monitoring", "step_name": "wait_for_ci", "description": "Wait for CI results", "parameters": {"timeout_seconds": 300}},
    {"step_type": "decision", "step_name": "test_gate", "description": "Tests pass gate", "parameters": {"field": "ci_status"}},
    {"step_type": "notification", "step_name": "report_status", "description": "Report feature status", "parameters": {"channel": "activity_feed"}}
  ]'::jsonb,
  ARRAY['ecosystem_evolution', 'feature_development', 'ci_cd'],
  180,
  true
) ON CONFLICT (template_name) DO UPDATE SET category = EXCLUDED.category, steps = EXCLUDED.steps, tags = EXCLUDED.tags;

-- 8. automated_testing_pipeline
INSERT INTO workflow_templates (template_name, category, description, steps, tags, estimated_duration_seconds, is_active)
VALUES (
  'automated_testing_pipeline',
  'technical_excellence',
  'Comprehensive testing automation with test generation and coverage analysis',
  '[
    {"step_type": "api_call", "step_name": "get_function_behavior", "description": "Get function behavior from logs", "parameters": {"function": "get-edge-function-logs"}},
    {"step_type": "ai_generation", "step_name": "generate_tests", "description": "Generate test cases", "parameters": {"model": "deepseek", "output_format": "typescript_tests"}},
    {"step_type": "api_call", "step_name": "create_test_pr", "description": "Create test file PR", "parameters": {"function": "github-integration"}},
    {"step_type": "api_call", "step_name": "run_tests", "description": "Run test suite", "parameters": {"function": "github-integration"}},
    {"step_type": "analytics", "step_name": "analyze_results", "description": "Analyze test coverage", "parameters": {"metrics": ["pass_rate", "coverage"]}},
    {"step_type": "reporting", "step_name": "generate_report", "description": "Generate coverage report", "parameters": {"format": "markdown"}},
    {"step_type": "database", "step_name": "update_metadata", "description": "Update function test status", "parameters": {"table": "edge_function_catalog"}}
  ]'::jsonb,
  ARRAY['technical_excellence', 'testing', 'automation'],
  180,
  true
) ON CONFLICT (template_name) DO UPDATE SET category = EXCLUDED.category, steps = EXCLUDED.steps, tags = EXCLUDED.tags;

-- 9. knowledge_graph_expansion
INSERT INTO workflow_templates (template_name, category, description, steps, tags, estimated_duration_seconds, is_active)
VALUES (
  'knowledge_graph_expansion',
  'knowledge_management',
  'Continuous knowledge base improvement through conversation analysis',
  '[
    {"step_type": "database", "step_name": "fetch_conversations", "description": "Fetch recent conversations", "parameters": {"table": "conversation_messages"}},
    {"step_type": "api_call", "step_name": "extract_knowledge", "description": "Extract entities", "parameters": {"function": "extract-knowledge"}},
    {"step_type": "api_call", "step_name": "search_related", "description": "Search related knowledge", "parameters": {"function": "knowledge-manager"}},
    {"step_type": "ai_analysis", "step_name": "discover_relationships", "description": "Discover entity relationships", "parameters": {"model": "deepseek"}},
    {"step_type": "api_call", "step_name": "vectorize", "description": "Create embeddings", "parameters": {"function": "vectorize-memory"}},
    {"step_type": "database", "step_name": "store_relationships", "description": "Store relationships", "parameters": {"table": "knowledge_entities"}},
    {"step_type": "analytics", "step_name": "calculate_health", "description": "Calculate graph health", "parameters": {"metrics": ["entity_count", "relationship_density"]}}
  ]'::jsonb,
  ARRAY['knowledge_management', 'learning', 'graph'],
  90,
  true
) ON CONFLICT (template_name) DO UPDATE SET category = EXCLUDED.category, steps = EXCLUDED.steps, tags = EXCLUDED.tags;

-- 10. database_optimization_workflow
INSERT INTO workflow_templates (template_name, category, description, steps, tags, estimated_duration_seconds, is_active)
VALUES (
  'database_optimization_workflow',
  'optimization',
  'Database performance and maintenance with query optimization',
  '[
    {"step_type": "api_call", "step_name": "get_query_patterns", "description": "Get slow query patterns", "parameters": {"function": "query-edge-analytics"}},
    {"step_type": "api_call", "step_name": "get_db_health", "description": "Get database health", "parameters": {"function": "system-diagnostics"}},
    {"step_type": "ai_analysis", "step_name": "identify_opportunities", "description": "Identify optimization opportunities", "parameters": {"model": "deepseek"}},
    {"step_type": "ai_generation", "step_name": "generate_optimizations", "description": "Generate optimized SQL", "parameters": {"model": "deepseek", "output_format": "sql"}},
    {"step_type": "decision", "step_name": "safety_check", "description": "Safe to auto-apply", "parameters": {"field": "impact_level"}},
    {"step_type": "database", "step_name": "apply_or_create_task", "description": "Apply or create review task", "parameters": {"operation": "conditional"}},
    {"step_type": "reporting", "step_name": "generate_report", "description": "Generate optimization report", "parameters": {"format": "markdown"}}
  ]'::jsonb,
  ARRAY['optimization', 'database', 'performance'],
  150,
  true
) ON CONFLICT (template_name) DO UPDATE SET category = EXCLUDED.category, steps = EXCLUDED.steps, tags = EXCLUDED.tags;

-- Log the rebalancing activity
INSERT INTO activity_feed (type, title, description, data)
VALUES (
  'workflow_portfolio_rebalanced',
  'Workflow Portfolio Rebalanced',
  'Added 10 new workflow templates and expanded categories for balanced ecosystem coverage',
  '{"new_templates": ["performance_optimization_cycle", "code_quality_audit", "documentation_generation_workflow", "dao_governance_cycle", "contributor_onboarding_workflow", "create_new_microservice", "feature_development_pipeline", "automated_testing_pipeline", "knowledge_graph_expansion", "database_optimization_workflow"], "new_categories": ["ecosystem_evolution", "community_growth", "technical_excellence", "knowledge_management"]}'::jsonb
);
