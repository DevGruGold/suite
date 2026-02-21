// =============================================================================
// EDGE FUNCTION KNOWLEDGE BASE
// Comprehensive payload schemas, actions, and usage examples for ALL Edge Functions
// Generated: 2026-02-21 | Issue #2168 — Eliza first-call accuracy improvement
// =============================================================================
//
// PURPOSE: Give Eliza structured, actionable knowledge for every deployed
// Edge Function so she can construct correct tool calls on the FIRST attempt.
//
// USAGE:
//   import { FUNCTION_KNOWLEDGE, getFunctionKnowledge } from './_shared/edgeFunctionKnowledge.ts';
//   const k = getFunctionKnowledge('python-executor');
//   // k.actions, k.required_params, k.example_payload, k.unit_tests
//
// HOW TO ADD A NEW FUNCTION:
//   Add a new entry to FUNCTION_KNOWLEDGE with at minimum:
//     - description: human-readable summary
//     - required_params: array of required top-level payload keys
//     - example_payload: a ready-to-copy JSON payload
//   Optionally add: actions, optional_params, unit_tests, notes
// =============================================================================

export interface FunctionAction {
    name: string;
    description: string;
    required: string[];
    optional?: string[];
    example_payload?: Record<string, any>;
}

export interface FunctionUnitTest {
    description: string;
    payload: Record<string, any>;
    expected_outcome: string;
}

export interface FunctionKnowledge {
    description: string;
    /** Top-level required payload keys (applies to all actions or single-action functions) */
    required_params: string[];
    /** Top-level optional payload keys */
    optional_params?: string[];
    /** For multi-action functions: the "action" field value list */
    actions?: FunctionAction[];
    /** A minimal, copy-paste example payload */
    example_payload: Record<string, any>;
    /** Unit test patterns for validation */
    unit_tests?: FunctionUnitTest[];
    /** Key notes for Eliza (gotchas, limits, etc.) */
    notes?: string[];
}

// =============================================================================
// THE KNOWLEDGE MAP
// Keys are exact edge function names (match EDGE_FUNCTIONS_REGISTRY name field)
// =============================================================================
export const FUNCTION_KNOWLEDGE: Record<string, FunctionKnowledge> = {

    // ---------------------------------------------------------------------------
    // PYTHON / CODE EXECUTION
    // ---------------------------------------------------------------------------
    'python-executor': {
        description: 'Execute Python code in a sandboxed Piston runtime. Supports pandas, numpy, polars, requests (via Cloud Run). NO network calls within Piston — use invoke_edge_function for HTTP.',
        required_params: ['code'],
        optional_params: ['language', 'version', 'stdin', 'args', 'purpose', 'source', 'agent_id', 'task_id'],
        example_payload: {
            code: 'import pandas as pd\ndf = pd.DataFrame({"a":[1,2,3]})\nprint(df.describe())',
            purpose: 'Data analysis demo',
            source: 'eliza'
        },
        unit_tests: [
            {
                description: 'Basic print',
                payload: { code: 'print("hello world")' },
                expected_outcome: '{ success: true, output: "hello world\\n", exitCode: 0 }'
            },
            {
                description: 'Missing code field returns 400',
                payload: {},
                expected_outcome: '{ error: "No code provided" } with HTTP 400'
            }
        ],
        notes: [
            'Python sandbox does NOT have network access — do not use requests.get() etc.',
            'Failed executions (exitCode != 0) automatically trigger autonomous-code-fixer via code-monitor-daemon',
            'Default language is python@3.10.0',
            'Output is returned in .output (stdout) and .error (stderr)'
        ]
    },

    'autonomous-code-fixer': {
        description: 'Self-healing code execution. Takes a failed python_execution row ID, analyzes its error, generates a fix using AI, and re-executes it.',
        required_params: ['execution_id'],
        optional_params: ['max_attempts', 'notify_agent_id'],
        example_payload: { execution_id: 'abc123-uuid-of-failed-execution' },
        unit_tests: [
            {
                description: 'Fix a NameError',
                payload: { execution_id: '<uuid from eliza_python_executions where status=error>' },
                expected_outcome: '{ success: true, fixed: true, new_execution_id: "...", fix_description: "Added missing import" }'
            }
        ],
        notes: [
            'execution_id must come from the eliza_python_executions table (not eliza_activity_log)',
            'Usually called automatically by code-monitor-daemon — only call directly for immediate one-off fixes',
            'If fix fails 3 times it marks as permanently_failed'
        ]
    },

    'code-monitor-daemon': {
        description: 'Scans eliza_python_executions for failed/errored rows, categorizes errors, and triggers autonomous-code-fixer for each. Also reports fix results back to the requesting agent.',
        required_params: [],
        optional_params: ['action', 'priority', 'source', 'limit'],
        example_payload: {},
        actions: [
            {
                name: 'monitor',
                description: 'Run one scan cycle for failed executions and trigger fixes',
                required: [],
                optional: ['priority', 'source', 'limit'],
                example_payload: { action: 'monitor', priority: 'immediate', source: 'python-executor' }
            },
            {
                name: 'status',
                description: 'Get current daemon status and recent fix statistics',
                required: [],
                example_payload: { action: 'status' }
            }
        ],
        unit_tests: [
            {
                description: 'Empty body triggers monitor scan',
                payload: {},
                expected_outcome: '{ success: true, scanned: N, triggered_fixes: M }'
            }
        ],
        notes: [
            'Can be called with NO body — it self-triggers a full scan',
            'python-executor auto-invokes this on failure with { action: "monitor", priority: "immediate" }',
            'Runs on a 2-minute cron as a background daemon'
        ]
    },

    // ---------------------------------------------------------------------------
    // AI / CHAT
    // ---------------------------------------------------------------------------
    'ai-chat': {
        description: 'Primary Eliza AI chat endpoint. Processes user messages, invokes tools, manages conversation history. Used internally by the frontend.',
        required_params: ['message'],
        optional_params: ['conversation_id', 'attachments', 'system_override'],
        example_payload: { message: 'What is the current hashrate?', conversation_id: 'uuid-optional' },
        notes: [
            'This is Eliza herself — rarely needs to be invoked as a tool',
            'For agent-to-agent communication, use agent-manager broadcast or agent-coordination-hub'
        ]
    },

    'vertex-ai-chat': {
        description: 'Google Vertex AI / Gemini chat completion endpoint. Alternative to ai-chat using Vertex AI models.',
        required_params: ['message'],
        optional_params: ['model', 'conversation_id', 'system_prompt', 'temperature'],
        example_payload: { message: 'Summarize the latest system health', model: 'gemini-2.0-flash-001' },
        notes: ['Supports gemini-2.0-flash-001 and gemini-1.5-pro-002']
    },

    // ---------------------------------------------------------------------------
    // SOCIAL MEDIA / PUBLISHING
    // ---------------------------------------------------------------------------
    'typefully-integration': {
        description: 'Manage Twitter/X drafts and scheduling via Typefully API. Required: list social-sets first to get social_set_id, then create-draft to post.',
        required_params: ['action'],
        optional_params: ['social_set_id'],
        actions: [
            {
                name: 'get-me',
                description: 'Get authenticated Typefully account info',
                required: [],
                example_payload: { action: 'get-me' }
            },
            {
                name: 'list-social-sets',
                description: 'List all connected social accounts (Twitter/X). Returns social_set_id needed for other actions.',
                required: [],
                example_payload: { action: 'list-social-sets' }
            },
            {
                name: 'create-draft',
                description: 'Create a new post draft. content is the tweet text.',
                required: ['social_set_id', 'content'],
                optional: ['schedule_date', 'threadify', 'auto_retweet_enabled'],
                example_payload: { action: 'create-draft', social_set_id: '<from list-social-sets>', content: 'Post text here' }
            },
            {
                name: 'list-drafts',
                description: 'List all drafts for a social set',
                required: ['social_set_id'],
                example_payload: { action: 'list-drafts', social_set_id: '<from list-social-sets>' }
            },
            {
                name: 'update-draft',
                description: 'Update an existing draft',
                required: ['social_set_id', 'draft_id'],
                optional: ['content', 'schedule_date'],
                example_payload: { action: 'update-draft', social_set_id: '<id>', draft_id: '<id>', content: 'Updated text' }
            }
        ],
        example_payload: { action: 'list-social-sets' },
        unit_tests: [
            {
                description: 'Full post workflow: list sets → create draft',
                payload: { action: 'list-social-sets' },
                expected_outcome: 'Array of social sets with id, name, platform fields. Use id as social_set_id.'
            },
            {
                description: 'Create draft with required fields',
                payload: { action: 'create-draft', social_set_id: '<id>', content: 'Hello World from Eliza!' },
                expected_outcome: '{ id: "<draft_id>", content: "Hello World...", status: "draft" }'
            },
            {
                description: 'Missing action returns 400',
                payload: {},
                expected_outcome: '{ error: "Action is required..." } with HTTP 400'
            }
        ],
        notes: [
            'WORKFLOW: Always call list-social-sets first to get social_set_id — it is required for all other actions',
            'Requires TYPEFULLY_API_KEY secret in Supabase Vault',
            'content field (not "text" or "tweet") is the post body for create-draft'
        ]
    },

    'paragraph-publisher': {
        description: 'Publish articles/newsletters to Paragraph.com (paragraph.xyz). Supports markdown content and optional newsletter distribution.',
        required_params: ['title', 'markdown'],
        optional_params: ['imageUrl', 'sendNewsletter', 'slug', 'categories', 'body'],
        example_payload: {
            title: 'XMRT DAO Weekly Update',
            markdown: '## Summary\n\nThis week we shipped...',
            sendNewsletter: false,
            imageUrl: 'https://example.com/header.png'
        },
        unit_tests: [
            {
                description: 'Publish simple article',
                payload: { title: 'Test Post', markdown: '# Hello\n\nWorld.' },
                expected_outcome: '{ message: "Successfully published to Paragraph.com", data: { id: "...", url: "..." } }'
            },
            {
                description: 'body is alias for markdown (backward compat)',
                payload: { title: 'Test', body: '# Content' },
                expected_outcome: 'Published successfully — body field treated as markdown'
            }
        ],
        notes: [
            '"body" is an accepted alias for "markdown" for backward compatibility',
            'Set sendNewsletter: true to immediately email all subscribers',
            'Requires PARAGRAPH_API_KEY secret in Supabase Vault'
        ]
    },

    // ---------------------------------------------------------------------------
    // GITHUB
    // ---------------------------------------------------------------------------
    'github-integration': {
        description: 'Full GitHub API integration. Create/update issues, manage PRs, commit files, search code, list repos. 20+ actions available.',
        required_params: ['action'],
        optional_params: ['owner', 'repo', 'issue_number', 'title', 'body', 'data'],
        actions: [
            { name: 'list_repos', description: 'List repos', required: [], optional: ['owner', 'type'], example_payload: { action: 'list_repos' } },
            { name: 'list_issues', description: 'List issues', required: ['owner', 'repo'], optional: ['state', 'labels'], example_payload: { action: 'list_issues', owner: 'xmrtnet', repo: 'XMRT-Ecosystem' } },
            { name: 'get_issue', description: 'Get single issue details', required: ['owner', 'repo', 'issue_number'], example_payload: { action: 'get_issue', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', issue_number: 2168 } },
            { name: 'create_issue', description: 'Create a new issue', required: ['owner', 'repo', 'title'], optional: ['body', 'labels', 'assignees'], example_payload: { action: 'create_issue', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', title: 'Bug: XYZ', body: 'Description', labels: ['bug'] } },
            { name: 'update_issue', description: 'Update issue state, title, body, assignees, labels', required: ['owner', 'repo', 'issue_number'], optional: ['title', 'body', 'state', 'labels', 'assignees'], example_payload: { action: 'update_issue', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', issue_number: 1, state: 'closed' } },
            { name: 'close_issue', description: 'Close an issue (alias for update_issue with state:closed)', required: ['owner', 'repo', 'issue_number'], example_payload: { action: 'close_issue', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', issue_number: 1 } },
            { name: 'comment_on_issue', description: 'Add a comment to an issue', required: ['owner', 'repo', 'issue_number', 'body'], example_payload: { action: 'comment_on_issue', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', issue_number: 1, body: 'Fixed in commit abc123' } },
            { name: 'list_commits', description: 'List commits', required: ['owner', 'repo'], optional: ['sha', 'path', 'per_page'], example_payload: { action: 'list_commits', owner: 'xmrtnet', repo: 'XMRT-Ecosystem' } },
            { name: 'get_file_content', description: 'Read a file from a repo', required: ['owner', 'repo', 'path'], optional: ['ref'], example_payload: { action: 'get_file_content', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', path: 'README.md' } },
            { name: 'commit_file', description: 'Commit file changes', required: ['owner', 'repo', 'path', 'content', 'message'], optional: ['branch', 'sha'], example_payload: { action: 'commit_file', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', path: 'docs/update.md', content: 'base64-or-plain-text', message: 'Update docs' } },
            { name: 'search_code', description: 'Search code across repos', required: ['query'], optional: ['owner', 'repo'], example_payload: { action: 'search_code', query: 'edgeFunctionRegistry', owner: 'xmrtnet' } },
            { name: 'list_pull_requests', description: 'List PRs', required: ['owner', 'repo'], optional: ['state', 'head', 'base'], example_payload: { action: 'list_pull_requests', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', state: 'open' } },
            { name: 'create_pull_request', description: 'Create a PR', required: ['owner', 'repo', 'title', 'head', 'base'], optional: ['body', 'draft'], example_payload: { action: 'create_pull_request', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', title: 'Feature: XYZ', head: 'feature/xyz', base: 'main' } },
            { name: 'list_branches', description: 'List branches', required: ['owner', 'repo'], example_payload: { action: 'list_branches', owner: 'xmrtnet', repo: 'XMRT-Ecosystem' } },
            { name: 'trigger_workflow', description: 'Trigger a GitHub Actions workflow', required: ['owner', 'repo', 'workflow_id', 'ref'], optional: ['inputs'], example_payload: { action: 'trigger_workflow', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', workflow_id: 'deploy.yml', ref: 'main' } },
            { name: 'list_discussions', description: 'List discussions', required: ['owner', 'repo'], example_payload: { action: 'list_discussions', owner: 'xmrtnet', repo: 'XMRT-Ecosystem' } }
        ],
        example_payload: { action: 'list_issues', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', state: 'open' },
        unit_tests: [
            {
                description: 'Create a GitHub issue',
                payload: { action: 'create_issue', owner: 'xmrtnet', repo: 'XMRT-Ecosystem', title: 'Test Issue', body: 'Test body', labels: ['bug'] },
                expected_outcome: '{ number: 123, html_url: "https://github.com/xmrtnet/XMRT-Ecosystem/issues/123" }'
            }
        ],
        notes: [
            'Default owner is "xmrtnet", default repo is "XMRT-Ecosystem" when not specified',
            'close_issue is a convenience alias for update_issue with state:"closed"',
            'Requires GITHUB_TOKEN secret in Supabase Vault'
        ]
    },

    // ---------------------------------------------------------------------------
    // AGENT / TASK MANAGEMENT
    // ---------------------------------------------------------------------------
    'agent-manager': {
        description: 'Primary orchestration for AI agents and tasks. Create agents, assign tasks, report progress, claim work, broadcast messages.',
        required_params: ['action'],
        optional_params: ['data'],
        actions: [
            { name: 'list_agents', description: 'List all agents', required: [], optional: ['status', 'role'], example_payload: { action: 'list_agents', data: { status: 'active' } } },
            { name: 'get_agent', description: 'Get one agent by ID', required: ['agent_id'], example_payload: { action: 'get_agent', data: { agent_id: 'uuid' } } },
            { name: 'get_agent_by_name', description: 'Find agent by name', required: ['name'], example_payload: { action: 'get_agent_by_name', data: { name: 'Archivist' } } },
            { name: 'spawn_agent', description: 'Create a new agent', required: ['name', 'role'], optional: ['skills', 'metadata', 'spawn_reason'], example_payload: { action: 'spawn_agent', data: { name: 'Researcher', role: 'researcher', skills: ['search', 'analysis'] } } },
            { name: 'update_agent_status', description: 'Update agent status (active/busy/idle/offline)', required: ['agent_id', 'status'], example_payload: { action: 'update_agent_status', data: { agent_id: 'uuid', status: 'busy' } } },
            { name: 'archive_agent', description: 'Archive/deactivate an agent', required: ['agent_id'], optional: ['reason'], example_payload: { action: 'archive_agent', data: { agent_id: 'uuid', reason: 'Task complete' } } },
            { name: 'list_tasks', description: 'List tasks (optionally filtered)', required: [], optional: ['status', 'stage', 'agent_id', 'category'], example_payload: { action: 'list_tasks', data: { status: 'pending' } } },
            { name: 'get_task', description: 'Get one task by ID', required: ['task_id'], example_payload: { action: 'get_task', data: { task_id: 'uuid' } } },
            { name: 'create_task', description: 'Create a new task', required: ['title'], optional: ['description', 'category', 'priority', 'stage', 'assignee_agent_id'], example_payload: { action: 'create_task', data: { title: 'Research competitors', description: 'Do a market analysis', category: 'research', priority: 'high' } } },
            { name: 'assign_task', description: 'Assign task to specific agent or auto-assign', required: ['task_id'], optional: ['assignee_agent_id', 'auto_assign'], example_payload: { action: 'assign_task', data: { task_id: 'uuid', auto_assign: true } } },
            { name: 'claim_task', description: 'Agent claims a task for itself', required: ['agent_id', 'task_id'], example_payload: { action: 'claim_task', data: { agent_id: 'uuid', task_id: 'uuid' } } },
            { name: 'update_task_status', description: 'Update task status', required: ['task_id', 'status'], optional: ['resolution_notes', 'items_completed'], example_payload: { action: 'update_task_status', data: { task_id: 'uuid', status: 'in_progress' } } },
            { name: 'complete_task', description: 'Mark task as completed', required: ['task_id'], optional: ['notes'], example_payload: { action: 'complete_task', data: { task_id: 'uuid', notes: 'Analysis complete, see attached report' } } },
            { name: 'fail_task', description: 'Mark task as failed', required: ['task_id'], optional: ['reason'], example_payload: { action: 'fail_task', data: { task_id: 'uuid', reason: 'API unavailable' } } },
            { name: 'report_progress', description: 'Update progress on a task', required: ['task_id'], optional: ['progress', 'work_summary', 'items_completed'], example_payload: { action: 'report_progress', data: { task_id: 'uuid', progress: 50, work_summary: 'Completed 3 of 6 subtasks' } } },
            { name: 'delegate_task', description: 'Transfer task to another agent', required: ['task_id', 'from_agent_id', 'to_agent_id'], optional: ['rationale'], example_payload: { action: 'delegate_task', data: { task_id: 'uuid', from_agent_id: 'uuid', to_agent_id: 'uuid', rationale: 'Better skill match' } } },
            { name: 'record_decision', description: 'Log an agent decision for audit trail', required: ['decision', 'rationale'], optional: ['agent_id', 'task_id'], example_payload: { action: 'record_decision', data: { decision: 'Chose pandas over polars', rationale: 'Better compatibility', task_id: 'uuid' } } },
            { name: 'heartbeat', description: 'Agent health heartbeat', required: ['agent_id'], optional: ['metadata'], example_payload: { action: 'heartbeat', data: { agent_id: 'uuid' } } },
            { name: 'get_pipeline_status', description: 'Get overview of the entire task pipeline', required: [], example_payload: { action: 'get_pipeline_status' } },
            { name: 'get_agent_stats', description: 'Get agent performance metrics', required: ['agent_id'], optional: ['time_window_days'], example_payload: { action: 'get_agent_stats', data: { agent_id: 'uuid', time_window_days: 7 } } },
            { name: 'batch_spawn_agents', description: 'Create multiple agents at once', required: ['agents'], example_payload: { action: 'batch_spawn_agents', data: { agents: [{ name: 'Agent1', role: 'researcher' }, { name: 'Agent2', role: 'executor' }] } } }
        ],
        example_payload: { action: 'list_agents' },
        notes: [
            'Payload pattern: { action: "<action>", data: { <params> } }',
            'data object is optional for actions that require no params (list_agents, get_pipeline_status)',
            'agent_id and task_id are UUIDs from the agents / tasks tables'
        ]
    },

    'task-orchestrator': {
        description: 'High-level task pipeline orchestration. Routes tasks, manages stages, triages priorities. Wraps agent-manager with higher-level logic.',
        required_params: ['action'],
        optional_params: ['task_id', 'agent_id', 'data'],
        actions: [
            { name: 'triage', description: 'Triage and prioritize pending tasks', required: [], example_payload: { action: 'triage' } },
            { name: 'get_dashboard', description: 'Get pipeline dashboard overview', required: [], example_payload: { action: 'get_dashboard' } },
            { name: 'assign', description: 'Smart-assign a specific task', required: ['task_id'], example_payload: { action: 'assign', task_id: 'uuid' } }
        ],
        example_payload: { action: 'get_dashboard' },
        notes: ['Prefer agent-manager for direct task/agent CRUD; use task-orchestrator for pipeline-level operations']
    },

    // ---------------------------------------------------------------------------
    // KNOWLEDGE / MEMORY
    // ---------------------------------------------------------------------------
    'knowledge-manager': {
        description: 'Persistent knowledge graph. Store, search, and relate named entities. Eliza uses this for long-term memory — facts, agent knowledge, learned patterns.',
        required_params: ['action'],
        optional_params: ['data'],
        actions: [
            {
                name: 'store_knowledge',
                description: 'Store a new knowledge entity',
                required: ['name'],
                optional: ['type', 'description', 'metadata', 'confidence'],
                example_payload: { action: 'store_knowledge', data: { name: 'XMRT Token', type: 'asset', description: 'Monero-based governance token', confidence: 0.95 } }
            },
            {
                name: 'upsert_knowledge',
                description: 'Create or update a knowledge entity (idempotent by name)',
                required: ['name'],
                optional: ['type', 'description', 'metadata', 'confidence'],
                example_payload: { action: 'upsert_knowledge', data: { name: 'XMRT Token', type: 'asset', description: 'Updated description', confidence: 0.98 } }
            },
            {
                name: 'search_knowledge',
                description: 'Search knowledge entities by name/description',
                required: [],
                optional: ['search_term', 'entity_type', 'min_confidence', 'limit'],
                example_payload: { action: 'search_knowledge', data: { search_term: 'mining', entity_type: 'process', limit: 10 } }
            },
            {
                name: 'list_knowledge',
                description: 'List knowledge entities (optionally by type)',
                required: [],
                optional: ['entity_type', 'limit'],
                example_payload: { action: 'list_knowledge', data: { entity_type: 'agent', limit: 20 } }
            },
            {
                name: 'create_relationship',
                description: 'Link two entities with a relationship type',
                required: ['source_id', 'target_id'],
                optional: ['type', 'strength', 'metadata'],
                example_payload: { action: 'create_relationship', data: { source_id: 'uuid-a', target_id: 'uuid-b', type: 'depends_on', strength: 0.8 } }
            },
            {
                name: 'get_related_entities',
                description: 'Get all entities related to a given entity',
                required: ['entity_id'],
                example_payload: { action: 'get_related_entities', data: { entity_id: 'uuid' } }
            },
            {
                name: 'update_entity_confidence',
                description: 'Update confidence score of an entity',
                required: ['entity_id', 'new_confidence'],
                example_payload: { action: 'update_entity_confidence', data: { entity_id: 'uuid', new_confidence: 0.9 } }
            },
            {
                name: 'store_learning_pattern',
                description: 'Store a learned behavioral pattern',
                required: ['type'],
                optional: ['data', 'confidence'],
                example_payload: { action: 'store_learning_pattern', data: { type: 'user_preference', data: { prefers_concise: true }, confidence: 0.7 } }
            },
            {
                name: 'get_patterns',
                description: 'Retrieve stored learning patterns',
                required: [],
                optional: ['type', 'min_confidence', 'limit'],
                example_payload: { action: 'get_patterns', data: { type: 'user_preference', limit: 5 } }
            },
            {
                name: 'check_status',
                description: 'Health check — returns entity/relationship/pattern counts',
                required: [],
                example_payload: { action: 'check_status' }
            },
            {
                name: 'delete_knowledge',
                description: 'Delete an entity and its relationships',
                required: ['entity_id'],
                example_payload: { action: 'delete_knowledge', data: { entity_id: 'uuid' } }
            }
        ],
        example_payload: { action: 'search_knowledge', data: { search_term: 'XMRT' } },
        unit_tests: [
            {
                description: 'Store a fact',
                payload: { action: 'store_knowledge', data: { name: 'Test Entity', type: 'fact', description: 'A test entity' } },
                expected_outcome: '{ ok: true, data: { entity: { id: "uuid", entity_name: "Test Entity" } } }'
            },
            {
                description: 'Search for it',
                payload: { action: 'search_knowledge', data: { search_term: 'Test Entity' } },
                expected_outcome: '{ ok: true, data: { entities: [...], count: 1 } }'
            }
        ],
        notes: [
            'Payload format: { action: "<action>", data: { <params> } } — NOT flat top-level params',
            'auto-restructure is supported: flat body is auto-detected if no "action" field, but explicit action is preferred',
            'entity_id is a UUID from the knowledge_entities table',
            'Confidence scores are 0.0–1.0'
        ]
    },

    'search-edge-functions': {
        description: 'Search the edge function registry. Returns matching functions with descriptions, capabilities, and usage info. Use this to discover which function to call for a given task.',
        required_params: ['query'],
        optional_params: ['category', 'limit'],
        example_payload: { query: 'publish article', category: 'web' },
        unit_tests: [
            {
                description: 'Search for code execution functions',
                payload: { query: 'python execution' },
                expected_outcome: 'Array including python-executor, autonomous-code-fixer, code-monitor-daemon'
            },
            {
                description: 'Filter by category',
                payload: { query: 'agents', category: 'task-management' },
                expected_outcome: 'Results filtered to task-management category only'
            }
        ],
        notes: [
            'Returns top 10 results by relevance score',
            'Searches name, description, capabilities, and example_use fields',
            'Use get-function-actions to get detailed schemas for any result'
        ]
    },

    'get-function-actions': {
        description: 'Get the detailed action schema for any multi-action edge function. Returns all supported actions with required/optional params and example payloads.',
        required_params: [],
        optional_params: ['function_name', 'category'],
        example_payload: { function_name: 'github-integration' },
        unit_tests: [
            {
                description: 'List all supported functions',
                payload: {},
                expected_outcome: '{ supported_functions: [...], usage: "..." }'
            },
            {
                description: 'Get actions for a specific function',
                payload: { function_name: 'agent-manager' },
                expected_outcome: '{ actions: [{ action: "list_agents", required: [], optional: [...] }, ...] }'
            }
        ],
        notes: [
            'Empty body returns list of all supported function names',
            'Supported functions: vsco-workspace, github-integration, agent-manager, workflow-template-manager, typefully-integration, autonomous-code-fixer, code-monitor-daemon, python-executor, knowledge-manager'
        ]
    },

    // ---------------------------------------------------------------------------
    // WORKFLOWS
    // ---------------------------------------------------------------------------
    'workflow-template-manager': {
        description: 'Manage and execute named workflow templates. Templates are reusable step sequences stored in the DB.',
        required_params: ['action'],
        optional_params: ['data'],
        actions: [
            { name: 'list_templates', description: 'List all templates', required: [], optional: ['category', 'is_active'], example_payload: { action: 'list_templates', data: { category: 'research' } } },
            { name: 'get_template', description: 'Get template details', required: ['template_id'], example_payload: { action: 'get_template', data: { template_id: 'uuid' } } },
            { name: 'execute_template', description: 'Execute a workflow by template_name', required: ['template_name'], optional: ['params', 'context'], example_payload: { action: 'execute_template', data: { template_name: 'daily_news_workflow', params: { topic: 'XMRT DAO' } } } },
            { name: 'create_template', description: 'Create new template', required: ['template_name', 'steps'], optional: ['category', 'description'], example_payload: { action: 'create_template', data: { template_name: 'my_workflow', steps: [{ name: 'step1', function: 'python-executor', payload: {} }] } } },
            { name: 'list_executions', description: 'List recent template executions', required: [], optional: ['template_name', 'status', 'limit'], example_payload: { action: 'list_executions', data: { limit: 10 } } }
        ],
        example_payload: { action: 'list_templates' },
        notes: ['Use execute_template to run a named workflow — template_name is a slug, not a UUID']
    },

    // ---------------------------------------------------------------------------
    // VSCO / PHOTOGRAPHY CRM
    // ---------------------------------------------------------------------------
    'vsco-workspace': {
        description: 'Full VSCO/HoneyBook CRM integration. 89 actions across jobs, contacts, events, orders, financials, files, and settings.',
        required_params: ['action'],
        optional_params: ['data'],
        actions: [
            { name: 'list_jobs', description: 'List jobs/leads', required: [], optional: ['stage', 'brand_id', 'page'], example_payload: { action: 'list_jobs', data: { stage: 'prospect' } } },
            { name: 'create_job', description: 'Create a job/lead', required: ['name'], optional: ['stage', 'event_date', 'brand_id'], example_payload: { action: 'create_job', data: { name: 'Smith Wedding 2026', stage: 'lead' } } },
            { name: 'get_job', description: 'Get one job', required: ['job_id'], example_payload: { action: 'get_job', data: { job_id: 'uuid' } } },
            { name: 'list_contacts', description: 'List contacts', required: [], optional: ['search', 'page'], example_payload: { action: 'list_contacts', data: { search: 'Smith' } } },
            { name: 'create_contact', description: 'Create contact', required: ['email'], optional: ['first_name', 'last_name', 'phone'], example_payload: { action: 'create_contact', data: { email: 'client@example.com', first_name: 'Jane' } } },
            { name: 'list_events', description: 'List calendar events', required: [], optional: ['start_date', 'end_date'], example_payload: { action: 'list_events', data: { start_date: '2026-03-01', end_date: '2026-03-31' } } },
            { name: 'create_event', description: 'Create calendar event', required: ['title', 'start_date'], example_payload: { action: 'create_event', data: { title: 'Smith Engagement Session', start_date: '2026-03-15' } } },
            { name: 'get_analytics', description: 'Get studio analytics/revenue', required: [], optional: ['start_date', 'end_date'], example_payload: { action: 'get_analytics', data: { start_date: '2026-01-01', end_date: '2026-12-31' } } },
            { name: 'sync_all', description: 'Full sync of all VSCO data to local DB', required: [], example_payload: { action: 'sync_all' } },
            { name: 'list_actions', description: 'List all 89 available actions', required: [], optional: ['category'], example_payload: { action: 'list_actions' } }
        ],
        example_payload: { action: 'list_jobs' },
        notes: [
            'Call list_actions to see all 89 supported actions with categories',
            'Call get-function-actions with function_name:"vsco-workspace" for full schema',
            'Requires VSCO_API_KEY secret in Supabase Vault'
        ]
    },

    // ---------------------------------------------------------------------------
    // SYSTEM / MONITORING
    // ---------------------------------------------------------------------------
    'system-status': {
        description: 'Get real-time system health: agent counts, task pipeline metrics, mining stats, function usage. Primary health check endpoint.',
        required_params: [],
        optional_params: ['include_mining', 'include_agents', 'include_tasks'],
        example_payload: {},
        notes: ['No body required — call with empty {} to get full system status']
    },

    'list-available-functions': {
        description: 'List all available edge functions with their categories and URLs. Use for broad discovery before using search-edge-functions.',
        required_params: [],
        optional_params: ['category', 'page', 'limit'],
        example_payload: { category: 'autonomous' },
        notes: ['Returns all 194 registered functions. Use category filter to narrow results.']
    },

    'eliza-activity-logger': {
        description: 'Log activities and events to eliza_activity_log. Used by all edge functions for audit trails.',
        required_params: ['activity_type', 'title'],
        optional_params: ['description', 'status', 'metadata'],
        example_payload: { activity_type: 'task_completed', title: 'Research task done', description: 'Completed competitor analysis', status: 'completed' }
    },

    'opportunity-scanner': {
        description: 'Scans for business/revenue opportunities across data sources. Identifies grant opportunities, partnership leads, market openings for XMRT ecosystem.',
        required_params: [],
        optional_params: ['sources', 'keywords', 'limit'],
        example_payload: { keywords: ['Monero', 'DeFi grant', 'DAO funding'], limit: 20 }
    },

    // ---------------------------------------------------------------------------
    // MINING
    // ---------------------------------------------------------------------------
    'mining-proxy': {
        description: 'Proxy for SupportXMR mining pool API. Get hashrates, worker stats, payments, and wallet metrics.',
        required_params: ['action'],
        optional_params: ['wallet', 'worker'],
        actions: [
            { name: 'get_stats', description: 'Get pool stats for a wallet', required: ['wallet'], example_payload: { action: 'get_stats', wallet: '4AbcXYZ...' } },
            { name: 'get_workers', description: 'List all workers', required: ['wallet'], example_payload: { action: 'get_workers', wallet: '4AbcXYZ...' } },
            { name: 'get_payments', description: 'Get recent payments', required: ['wallet'], example_payload: { action: 'get_payments', wallet: '4AbcXYZ...' } }
        ],
        example_payload: { action: 'get_stats', wallet: '<xmr-wallet-address>' }
    },

    'aggregate-device-metrics': {
        description: 'Aggregate mining device metrics over time. Hashrate history, efficiency analysis per device.',
        required_params: [],
        optional_params: ['device_id', 'time_window_hours', 'group_by'],
        example_payload: { time_window_hours: 24, group_by: 'device' }
    },

    // ---------------------------------------------------------------------------
    // HUME AI / VOICE / EMOTION
    // ---------------------------------------------------------------------------
    'hume-empathic-voice': {
        description: 'Hume AI empathic voice interface. Process audio for emotion detection and generate empathic responses.',
        required_params: ['action'],
        optional_params: ['audio_data', 'text', 'config_id'],
        actions: [
            { name: 'analyze_emotion', description: 'Analyze emotion in audio/text', required: ['text'], example_payload: { action: 'analyze_emotion', text: 'I am feeling overwhelmed today' } },
            { name: 'synthesize_voice', description: 'Generate empathic voice response', required: ['text'], example_payload: { action: 'synthesize_voice', text: 'I understand how you feel' } }
        ],
        example_payload: { action: 'analyze_emotion', text: 'Sample text to analyze' }
    },

    // ---------------------------------------------------------------------------
    // WEB / NETWORK
    // ---------------------------------------------------------------------------
    'web-scraper': {
        description: 'Scrape web pages and extract structured content. Supports URL fetching and content parsing.',
        required_params: ['url'],
        optional_params: ['selector', 'format', 'wait_for'],
        example_payload: { url: 'https://cointelegraph.com', selector: 'article', format: 'markdown' }
    },

    'rss-feed-reader': {
        description: 'Fetch and parse RSS feeds. Returns structured article list.',
        required_params: ['feed_url'],
        optional_params: ['limit', 'since'],
        example_payload: { feed_url: 'https://cointelegraph.com/rss', limit: 10 }
    },

    // ---------------------------------------------------------------------------
    // MOLTMALL / ECOSYSTEM APPS
    // ---------------------------------------------------------------------------
    'xmrt-mcp-server': {
        description: 'MCP (Model Context Protocol) server for XMRT ecosystem tools. Exposes structured tool definitions for AI models.',
        required_params: [],
        optional_params: ['action', 'tool_name', 'params'],
        example_payload: { action: 'list_tools' },
        notes: ['Returns MCP-formatted tool definitions for Eliza and external AI integrations']
    },

    'google-cloud-auth': {
        description: 'Google Cloud authentication — get OAuth tokens, service account credentials for Vertex AI, Gmail, Drive.',
        required_params: ['service'],
        optional_params: ['scopes', 'user'],
        actions: [
            { name: 'get_token', description: 'Get access token for a GCP service', required: ['service'], example_payload: { service: 'vertex-ai' } },
            { name: 'refresh_token', description: 'Refresh an expiring token', required: ['service'], example_payload: { service: 'gmail' } }
        ],
        example_payload: { service: 'vertex-ai' }
    },

    // ---------------------------------------------------------------------------
    // PAYMENTS
    // ---------------------------------------------------------------------------
    'stripe-payments': {
        description: 'Stripe payment processing. Create payment intents, check subscription status, manage customers.',
        required_params: ['action'],
        optional_params: ['amount', 'currency', 'customer_id'],
        actions: [
            { name: 'create_payment_intent', description: 'Create Stripe payment intent', required: ['amount', 'currency'], example_payload: { action: 'create_payment_intent', amount: 2000, currency: 'usd' } },
            { name: 'get_subscription', description: 'Get customer subscription', required: ['customer_id'], example_payload: { action: 'get_subscription', customer_id: 'cus_xyz' } }
        ],
        example_payload: { action: 'create_payment_intent', amount: 2000, currency: 'usd' }
    },

    // ---------------------------------------------------------------------------
    // RESEARCH / GOVERNANCE
    // ---------------------------------------------------------------------------
    'research-assistant': {
        description: 'AI-powered research assistant. Aggregates information from multiple sources on a topic.',
        required_params: ['topic'],
        optional_params: ['depth', 'sources', 'output_format'],
        example_payload: { topic: 'Monero privacy improvements 2026', depth: 'comprehensive', output_format: 'markdown' }
    },

    'governance-dashboard': {
        description: 'XMRT DAO governance — proposals, voting, treasury management.',
        required_params: ['action'],
        optional_params: ['proposal_id', 'data'],
        actions: [
            { name: 'list_proposals', description: 'List governance proposals', required: [], example_payload: { action: 'list_proposals' } },
            { name: 'create_proposal', description: 'Submit new proposal', required: ['title', 'description'], example_payload: { action: 'create_proposal', data: { title: 'Increase mining rewards', description: 'Proposal to...' } } },
            { name: 'submit_vote', description: 'Vote on a proposal', required: ['proposal_id', 'vote'], example_payload: { action: 'submit_vote', data: { proposal_id: 'uuid', vote: 'yes' } } }
        ],
        example_payload: { action: 'list_proposals' }
    },

    // ---------------------------------------------------------------------------
    // AGENT COORDINATION
    // ---------------------------------------------------------------------------
    'agent-coordination-hub': {
        description: 'Multi-agent synchronization. Register agents, broadcast messages, share memory between agents.',
        required_params: ['action'],
        optional_params: ['agent_id', 'message', 'data'],
        actions: [
            { name: 'register', description: 'Register agent in the hub', required: ['agent_id', 'name'], example_payload: { action: 'register', agent_id: 'uuid', name: 'Researcher' } },
            { name: 'broadcast', description: 'Broadcast message to all agents', required: ['message'], example_payload: { action: 'broadcast', message: 'System maintenance in 10 mins' } },
            { name: 'get_memory', description: 'Read shared memory key', required: ['key'], example_payload: { action: 'get_memory', key: 'current_task_context' } },
            { name: 'set_memory', description: 'Write shared memory key', required: ['key', 'value'], example_payload: { action: 'set_memory', key: 'current_task_context', value: { task_id: 'uuid' } } }
        ],
        example_payload: { action: 'broadcast', message: 'Hello all agents' }
    },

    'agent-deployment-coordinator': {
        description: 'Coordinate agent deployments, version updates, and rollbacks.',
        required_params: ['action'],
        optional_params: ['agent_name', 'version', 'config'],
        actions: [
            { name: 'deploy', description: 'Deploy agent version', required: ['agent_name', 'version'], example_payload: { action: 'deploy', agent_name: 'researcher', version: 'v2.0' } },
            { name: 'rollback', description: 'Rollback to previous version', required: ['agent_name'], example_payload: { action: 'rollback', agent_name: 'researcher' } },
            { name: 'status', description: 'Get deployment status', required: ['agent_name'], example_payload: { action: 'status', agent_name: 'researcher' } }
        ],
        example_payload: { action: 'status', agent_name: 'researcher' }
    },

    // ---------------------------------------------------------------------------
    // SUPERDUPER / UNIVERSAL
    // ---------------------------------------------------------------------------
    'superduper-router': {
        description: 'Universal router for SuperDuper agents. Routes requests to specialized sub-agents based on task type.',
        required_params: ['task'],
        optional_params: ['agent_preference', 'priority', 'context'],
        example_payload: { task: 'Analyze the latest mining stats and report findings', priority: 'high' }
    },

    'universal-edge-invoker': {
        description: 'Invoke any Edge Function by name with arbitrary payloads. Useful when the target function needs to be determined dynamically.',
        required_params: ['function_name', 'payload'],
        optional_params: ['timeout_ms'],
        example_payload: { function_name: 'python-executor', payload: { code: 'print("hello")' } }
    },

    // ---------------------------------------------------------------------------
    // ECOSYSTEM / XMRT APPS (auto-detected stubs — minimal schema info)
    // ---------------------------------------------------------------------------
    'activity-monitor-api': {
        description: 'XMRT Ecosystem: Monitor activity logs and events.',
        required_params: [],
        optional_params: ['limit', 'since', 'type'],
        example_payload: { limit: 20 }
    },

    'advanced-analytics-engine': {
        description: 'XMRT Ecosystem: Advanced analytics and reporting engine.',
        required_params: ['metric'],
        optional_params: ['start_date', 'end_date', 'group_by'],
        example_payload: { metric: 'revenue', start_date: '2026-01-01', end_date: '2026-12-31' }
    },

    'agent-github-integration': {
        description: 'XMRT Ecosystem: Agent-specific GitHub integration wrapper.',
        required_params: ['action'],
        optional_params: [],
        example_payload: { action: 'create_issue' }
    },

    'agent-webhook-handler': {
        description: 'XMRT Ecosystem: Handle incoming webhooks for agents.',
        required_params: ['event'],
        optional_params: ['data'],
        example_payload: { event: 'task_completed', data: {} }
    },

    'agent-work-executor': {
        description: 'Execute agent work items — runs tool calls on behalf of agents.',
        required_params: ['tool_name', 'payload'],
        optional_params: ['agent_id', 'task_id'],
        example_payload: { tool_name: 'python-executor', payload: { code: 'print("work")' }, agent_id: 'uuid' }
    },

    'extract-knowledge': {
        description: 'Extract entities and knowledge from text sources into knowledge_entities table.',
        required_params: [],
        optional_params: ['source', 'limit', 'entity_type'],
        example_payload: { source: 'eliza_activity_log', limit: 50 },
        notes: ['Typically invoked by cron. source can be "eliza_activity_log" or a URL.']
    },

    'daily-news-workflow': {
        description: 'Automated daily news curation — fetches RSS, filters relevant headlines, publishes to Paragraph, posts on Typefully.',
        required_params: [],
        optional_params: ['topic', 'max_articles'],
        example_payload: { topic: 'XMRT DAO Monero', max_articles: 5 },
        notes: ['Typically run via cron at 09:00 daily. Can be triggered manually with empty body.']
    },

    'cron-orchestrator': {
        description: 'Manages and triggers scheduled cron jobs. Lists active jobs and can manually trigger any scheduled task.',
        required_params: ['action'],
        optional_params: ['job_name'],
        actions: [
            { name: 'list_jobs', description: 'List all cron jobs', required: [], example_payload: { action: 'list_jobs' } },
            { name: 'trigger', description: 'Manually trigger a cron job', required: ['job_name'], example_payload: { action: 'trigger', job_name: 'daily-news-workflow' } }
        ],
        example_payload: { action: 'list_jobs' }
    },

    'task-decomposer': {
        description: 'Uses AI to decompose a high-level goal into subtasks and creates them in agent-manager.',
        required_params: ['goal'],
        optional_params: ['agent_id', 'category', 'priority'],
        example_payload: { goal: 'Research and publish a report on Monero transaction volumes in Q1 2026', category: 'research', priority: 'medium' }
    },

    'decision-recorder': {
        description: 'Record agent decisions and rationale for audit trail and learning.',
        required_params: ['decision', 'rationale'],
        optional_params: ['agent_id', 'task_id', 'confidence', 'alternatives'],
        example_payload: { decision: 'Use paragraph-publisher over direct API', rationale: 'Already authenticated', agent_id: 'uuid' }
    },

    'eliza-brain': {
        description: 'Core Eliza reasoning engine. Processes complex multi-step reasoning tasks.',
        required_params: ['prompt'],
        optional_params: ['context', 'tools', 'max_steps'],
        example_payload: { prompt: 'Plan and execute the daily news workflow', context: { current_date: '2026-02-21' } }
    },

    'function-usage-analytics': {
        description: 'Query function usage analytics from eliza_function_usage table. Get call counts, error rates, performance.',
        required_params: [],
        optional_params: ['function_name', 'start_date', 'end_date', 'limit'],
        example_payload: { function_name: 'python-executor', start_date: '2026-02-01' }
    },

    'superduper-orchestrator': {
        description: 'Orchestrate SuperDuper multi-agent workflows. Coordinates specialist agents for complex tasks.',
        required_params: ['task'],
        optional_params: ['agents', 'strategy', 'timeout_ms'],
        example_payload: { task: 'Analyze mining profitability and generate weekly report', strategy: 'parallel' }
    }
};

// =============================================================================
// LOOKUP HELPERS
// =============================================================================

/** Get knowledge for a specific function. Returns null if not found. */
export function getFunctionKnowledge(functionName: string): FunctionKnowledge | null {
    return FUNCTION_KNOWLEDGE[functionName] ?? null;
}

/** Get knowledge + action list for a function (for get-function-actions compatibility) */
export function getFunctionActions(functionName: string): FunctionAction[] | null {
    const knowledge = FUNCTION_KNOWLEDGE[functionName];
    if (!knowledge) return null;
    if (knowledge.actions) return knowledge.actions;

    // For single-action functions, synthesize a default action
    return [{
        name: 'invoke',
        description: knowledge.description,
        required: knowledge.required_params,
        optional: knowledge.optional_params ?? [],
        example_payload: knowledge.example_payload
    }];
}

/** Get all function names that have detailed schemas */
export function getKnownFunctionNames(): string[] {
    return Object.keys(FUNCTION_KNOWLEDGE);
}

/** Search function knowledge by keyword */
export function searchFunctionKnowledge(query: string): Array<{ name: string; knowledge: FunctionKnowledge }> {
    const q = query.toLowerCase();
    return Object.entries(FUNCTION_KNOWLEDGE)
        .filter(([name, knowledge]) => {
            return name.includes(q) ||
                knowledge.description.toLowerCase().includes(q) ||
                knowledge.required_params.some(p => p.includes(q)) ||
                knowledge.actions?.some(a => a.name.includes(q) || a.description.toLowerCase().includes(q)) ||
                knowledge.notes?.some(n => n.toLowerCase().includes(q));
        })
        .map(([name, knowledge]) => ({ name, knowledge }));
}
