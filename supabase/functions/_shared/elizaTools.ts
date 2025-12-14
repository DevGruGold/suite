/**
 * Eliza's Tool Definitions - Single Source of Truth
 * 
 * All AI endpoints (lovable-chat, gemini-chat, deepseek-chat, etc.) should import
 * ELIZA_TOOLS from this file to ensure consistent tool availability across all AI services.
 * 
 * ⚡ CRITICAL: ALL TOOLS EXECUTE REAL FUNCTIONS, NOT SIMULATIONS
 * - Tools appear in "🐍 Eliza's Code Execution Log" sidebar monitor
 * - Eliza MUST wait for actual results before responding to user
 * - Chat shows analysis/outcomes, not raw code (code is in execution log)
 */


export const ELIZA_TOOLS = [
    // ====================================================================
    // 🚀 STAE - SUITE TASK AUTOMATION ENGINE TOOLS
    // ====================================================================
    {
      type: 'function',
      function: {
        name: 'create_task_from_template',
        description: '📋 STAE: Create a new task using a predefined template. Automatically fills in checklist, required skills, priority, and stage based on template category. Use this for consistent, standardized task creation.',
        parameters: {
          type: 'object',
          properties: {
            template_name: { 
              type: 'string', 
              description: 'Template name: code_review, bug_fix, feature_implementation, infrastructure_check, deployment_pipeline, research_analysis, proposal_evaluation, operations_task, system_health_investigation, mining_optimization, device_integration',
              enum: ['code_review', 'bug_fix', 'feature_implementation', 'infrastructure_check', 'deployment_pipeline', 'research_analysis', 'proposal_evaluation', 'operations_task', 'system_health_investigation', 'mining_optimization', 'device_integration']
            },
            title: { type: 'string', description: 'Task title - will be substituted into template description' },
            description: { type: 'string', description: 'Optional: Override template description with custom text' },
            priority: { type: 'number', description: 'Optional: Override default priority (1-10, higher = more urgent)' },
            auto_assign: { type: 'boolean', description: 'Optional: Automatically assign to best-matching agent (default: true)' }
          },
          required: ['template_name', 'title']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'smart_assign_task',
        description: '🤖 STAE: Intelligently assign a task to the best-matching agent using weighted scoring: skills (40%), workload (30%), success rate (20%), activity (10%). Use this for optimal agent-task matching.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'UUID of the task to assign' },
            prefer_agent_id: { type: 'string', description: 'Optional: Prefer this agent if they meet minimum skill criteria' },
            min_skill_match: { type: 'number', description: 'Optional: Minimum skill overlap required (0-1, default: 0.3 = 30%)' }
          },
          required: ['task_id']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_automation_metrics',
        description: '📊 STAE: Get comprehensive automation coverage metrics including template usage rate, auto-assignment rate, knowledge extraction rate, agent utilization, and average completion time.',
        parameters: {
          type: 'object',
          properties: {
            time_window_hours: { type: 'number', description: 'Optional: Time window for metrics (default: 24 hours)' },
            breakdown_by: { type: 'string', enum: ['category', 'agent', 'template'], description: 'Optional: Group metrics by category, agent, or template' }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_task_checklist',
        description: '✅ STAE Phase 2: Update a task checklist item status. Mark items as completed or uncompleted to track progress.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'UUID of the task' },
            item_index: { type: 'number', description: 'Index of checklist item (0-based)' },
            item_text: { type: 'string', description: 'Alternative: exact text of checklist item' },
            completed: { type: 'boolean', description: 'Whether item is completed (true) or not (false)' }
          },
          required: ['task_id', 'completed']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'resolve_blocked_task',
        description: '🔓 STAE Phase 2: Attempt to auto-resolve a blocked task. Analyzes blocker reason and applies resolution rules for github, api, dependency issues.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'UUID of the blocked task to resolve' }
          },
          required: ['task_id']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_stae_recommendations',
        description: '💡 STAE Phase 3: Get optimization recommendations for agents, templates, and workload. Identifies low performers, skill gaps, and imbalances.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'advance_task_stage',
        description: '⏩ STAE Phase 2: Manually advance a task to the next pipeline stage (DISCUSS→PLAN→EXECUTE→VERIFY→INTEGRATE).',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'UUID of the task to advance' },
            target_stage: { type: 'string', enum: ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'], description: 'Optional: specific stage to advance to' }
          },
          required: ['task_id']
        }
      }
    },

    // ====================================================================
    // 🎯 CONVERSATIONAL USER ACQUISITION TOOLS
    // ====================================================================
    {
      type: 'function',
      function: {
        name: 'qualify_lead',
        description: '🎯 Score a potential customer based on conversation signals (budget, urgency, company size, use case complexity). Returns lead score 0-100 and qualification level.',
        parameters: {
          type: 'object',
          properties: {
            session_key: { type: 'string', description: 'Current conversation session key' },
            user_signals: {
              type: 'object',
              description: 'Signals detected from conversation',
              properties: {
                mentioned_budget: { type: 'boolean', description: 'User mentioned budget or willingness to pay' },
                has_urgent_need: { type: 'boolean', description: 'User expressed urgency or time pressure' },
                company_mentioned: { type: 'string', description: 'Company name if mentioned' },
                use_case_complexity: { type: 'string', enum: ['simple', 'moderate', 'complex'], description: 'Complexity of their use case' }
              }
            }
          },
          required: ['session_key']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'identify_service_interest',
        description: '🔍 Analyze user message to detect interest in specific monetized services. Returns service names with confidence scores.',
        parameters: {
          type: 'object',
          properties: {
            user_message: { type: 'string', description: 'Current user message to analyze' },
            conversation_history: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, content: { type: 'string' } } }, description: 'Optional: recent conversation messages for context' },
            session_key: { type: 'string', description: 'Session key to track services interested in' }
          },
          required: ['user_message']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'suggest_tier_based_on_needs',
        description: '💡 Recommend optimal pricing tier based on estimated usage and budget. Returns tier recommendation with reasoning.',
        parameters: {
          type: 'object',
          properties: {
            estimated_monthly_usage: { type: 'number', description: 'Estimated API calls per month' },
            budget_range: { type: 'string', enum: ['budget-conscious', 'moderate', 'premium', 'enterprise'], description: 'User budget category' },
            feature_requirements: { type: 'array', items: { type: 'string' }, description: 'Optional: specific features needed' }
          },
          required: ['estimated_monthly_usage', 'budget_range']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_user_profile_from_session',
        description: '👤 Convert anonymous session to identified user profile. Collects email and links session to user_profiles table.',
        parameters: {
          type: 'object',
          properties: {
            session_key: { type: 'string', description: 'Current session key' },
            email: { type: 'string', format: 'email', description: 'User email address' }
          },
          required: ['session_key', 'email']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'generate_stripe_payment_link',
        description: '💳 Generate Stripe checkout link for tier upgrade. Returns shareable payment URL with optional trial period.',
        parameters: {
          type: 'object',
          properties: {
            customer_email: { type: 'string', format: 'email', description: 'Customer email' },
            tier: { type: 'string', enum: ['basic', 'pro', 'enterprise'], description: 'Tier to purchase' },
            service_name: { type: 'string', description: 'Service being purchased' },
            trial_days: { type: 'number', description: 'Optional: number of trial days (default 0)' },
            session_key: { type: 'string', description: 'Session key for tracking conversion' },
            api_key: { type: 'string', description: 'API key to upgrade after payment' }
          },
          required: ['customer_email', 'tier', 'service_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'check_onboarding_progress',
        description: '📊 Track user activation milestones (API key received, first call, integration complete, value realized).',
        parameters: {
          type: 'object',
          properties: {
            api_key: { type: 'string', description: 'API key to check progress for' }
          },
          required: ['api_key']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'send_usage_alert',
        description: '⚠️ Notify user about quota usage (75% warning, exceeded, or upsell opportunity).',
        parameters: {
          type: 'object',
          properties: {
            api_key: { type: 'string', description: 'API key to check usage for' },
            alert_type: { type: 'string', enum: ['quota_warning', 'quota_exceeded', 'upsell'], description: 'Type of alert to send' }
          },
          required: ['api_key', 'alert_type']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'link_api_key_to_conversation',
        description: '🔗 Associate an API key with the current conversation session for attribution tracking.',
        parameters: {
          type: 'object',
          properties: {
            api_key: { type: 'string', description: 'API key to link' },
            session_key: { type: 'string', description: 'Current session key' }
          },
          required: ['api_key', 'session_key']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'apply_retention_discount',
        description: '🎁 Offer discount to at-risk customer to prevent churn.',
        parameters: {
          type: 'object',
          properties: {
            api_key: { type: 'string', description: 'API key for customer' },
            discount_percent: { type: 'number', description: 'Discount percentage (e.g., 20 for 20% off)' },
            duration_months: { type: 'number', description: 'How many months discount applies' }
          },
          required: ['api_key', 'discount_percent', 'duration_months']
        }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_edge_function_logs',
      description: '📋 Retrieve execution logs for a specific edge function with comprehensive error analysis, performance metrics, and actionable recommendations. Essential for debugging, monitoring, and verifying fixes.',
      parameters: {
        type: 'object',
        properties: {
          function_name: {
            type: 'string',
            description: 'Name of the edge function to retrieve logs for (e.g., "github-integration", "task-orchestrator")'
          },
          time_window_hours: {
            type: 'number',
            description: 'Time window for log retrieval in hours. Default: 24',
            default: 24
          },
          status_filter: {
            type: 'string',
            enum: ['all', 'success', 'error'],
            description: 'Filter logs by status. Default: all',
            default: 'all'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of log entries to retrieve. Default: 100',
            default: 100
          },
          include_stack_traces: {
            type: 'boolean',
            description: 'Include full stack traces in error analysis. Default: true',
            default: true
          }
        },
        required: ['function_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_function_version_analytics',
      description: '📊 Analyze edge function performance across different versions to detect regressions and identify optimal versions for rollback. Returns success rates, execution times, error patterns, and actionable recommendations.',
      parameters: {
        type: 'object',
        properties: {
          function_name: { type: 'string', description: 'Name of the edge function to analyze (e.g., "github-integration", "task-orchestrator")' },
          version: { type: 'string', description: 'OPTIONAL: Specific version to analyze. If omitted, analyzes all versions.' },
          compare_versions: { type: 'boolean', description: 'Whether to compare all versions and detect regressions. Default: true' },
          time_window_hours: { type: 'number', description: 'Time window for analysis in hours. Default: 168 (7 days)' },
          min_calls_threshold: { type: 'number', description: 'Minimum calls required for a version to be analyzed. Default: 10' }
        },
        required: ['function_name']
      }
    }
  },

    // ====================================================================
    // 💰 REVENUE GENERATION TOOLS
    // ====================================================================
    {
      type: 'function',
      function: {
        name: 'generate_service_api_key',
        description: '💰 Generate a new API key for a monetized service with tiered access control. Tiers: free (100/mo), basic ($10, 1K/mo), pro ($50, 10K/mo), enterprise ($500, unlimited).',
        parameters: {
          type: 'object',
          properties: {
            service_name: { type: 'string', description: 'Service to monetize (e.g., "uspto-patent-mcp", "lovable-chat", "python-executor")' },
            tier: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'], description: 'Access tier' },
            owner_email: { type: 'string', format: 'email', description: 'Customer email address' },
            owner_name: { type: 'string', description: 'Optional customer name' }
          },
          required: ['service_name', 'tier', 'owner_email']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'validate_service_api_key',
        description: 'Check if an API key is valid, active, and has remaining quota. Returns tier, quota remaining, and validation status.',
        parameters: {
          type: 'object',
          properties: {
            api_key: { type: 'string', description: 'API key to validate' }
          },
          required: ['api_key']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'track_service_usage',
        description: 'Log API usage and update quota for a customer. Automatically increments usage counter and logs metadata.',
        parameters: {
          type: 'object',
          properties: {
            api_key: { type: 'string', description: 'Customer API key' },
            service_name: { type: 'string', description: 'Service being used' },
            endpoint: { type: 'string', description: 'API endpoint called' },
            tokens_used: { type: 'number', description: 'Optional: number of tokens/credits consumed' },
            response_time_ms: { type: 'number', description: 'Optional: response time in milliseconds' },
            status_code: { type: 'number', description: 'Optional: HTTP status code' }
          },
          required: ['api_key', 'service_name', 'endpoint']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_service_usage_stats',
        description: 'Get detailed usage statistics for a customer API key including quota remaining, recent usage, and tier info.',
        parameters: {
          type: 'object',
          properties: {
            api_key: { type: 'string', description: 'API key to check' }
          },
          required: ['api_key']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'upgrade_service_tier',
        description: 'Upgrade a customer to a higher tier (free → basic → pro → enterprise). Automatically updates quota.',
        parameters: {
          type: 'object',
          properties: {
            api_key: { type: 'string', description: 'API key to upgrade' },
            new_tier: { type: 'string', enum: ['basic', 'pro', 'enterprise'], description: 'New tier level' }
          },
          required: ['api_key', 'new_tier']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'suspend_service_api_key',
        description: 'Suspend an API key for non-payment, abuse, or other reasons. Key becomes inactive immediately.',
        parameters: {
          type: 'object',
          properties: {
            api_key: { type: 'string', description: 'API key to suspend' },
            reason: { type: 'string', description: 'Reason for suspension' }
          },
          required: ['api_key', 'reason']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'calculate_monthly_revenue',
        description: 'Generate comprehensive revenue report including MRR, customer count, tier breakdown, top service, and usage stats.',
        parameters: {
          type: 'object',
          properties: {
            start_date: { type: 'string', format: 'date-time', description: 'Optional: start of reporting period' },
            end_date: { type: 'string', format: 'date-time', description: 'Optional: end of reporting period' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_service_invoice',
        description: 'Generate a monthly invoice for a customer based on their tier and usage.',
        parameters: {
          type: 'object',
          properties: {
            api_key: { type: 'string', description: 'API key to invoice' }
          },
          required: ['api_key']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_top_service_customers',
        description: 'Get list of highest-value customers sorted by tier and usage. Useful for identifying upsell opportunities.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of top customers to return (default 10)' }
          }
        }
      }
    },
    // Workflow Template Manager Tools
    {
      type: 'function',
      function: {
        name: 'execute_workflow_template',
        description: '🔄 Execute a pre-built workflow template by name with custom parameters. Categories: Revenue (acquire_new_customer, upsell_existing_customer, monthly_billing_cycle, churn_prevention), Marketing (content_campaign, influencer_outreach), Financial (treasury_health_check, execute_buyback), Technical Excellence (auto_fix_codebase, code_quality_audit, automated_testing_pipeline), Optimization (modify_edge_function, performance_optimization_cycle, database_optimization_workflow), Knowledge Management (documentation_generation_workflow, knowledge_graph_expansion), Community Growth (dao_governance_cycle, contributor_onboarding_workflow), Ecosystem Evolution (create_new_microservice, feature_development_pipeline), Meta (learn_from_failures, diagnose_workflow_failure).',
        parameters: {
          type: 'object',
          properties: {
            template_name: { 
              type: 'string', 
              enum: [
                // Revenue workflows
                'acquire_new_customer', 
                'upsell_existing_customer', 
                'monthly_billing_cycle', 
                'churn_prevention',
                // Marketing workflows
                'content_campaign', 
                'influencer_outreach',
                // Financial workflows
                'treasury_health_check', 
                'execute_buyback',
                // Technical excellence workflows
                'auto_fix_codebase',
                'code_quality_audit',
                'automated_testing_pipeline',
                // Optimization workflows
                'modify_edge_function',
                'performance_optimization_cycle',
                'database_optimization_workflow',
                // Knowledge management workflows
                'documentation_generation_workflow',
                'knowledge_graph_expansion',
                // Community growth workflows
                'dao_governance_cycle',
                'contributor_onboarding_workflow',
                // Ecosystem evolution workflows
                'create_new_microservice',
                'feature_development_pipeline',
                // Meta workflows
                'learn_from_failures',
                'diagnose_workflow_failure',
                // Legacy/governance workflows
                'autonomous_governance_proposal_evaluation',
                'proactive_system_anomaly_detection_and_resolution',
                'community_engagement_sentiment_analysis_and_response',
                'developer_onboarding_and_contribution_guidance',
                'competitive_landscape_analysis_and_reporting',
                'documentation_generation_and_maintenance',
                'agent_performance_review_and_optimization'
              ],
              description: 'Name of the workflow template to execute'
            },
            params: { 
              type: 'object',
              description: 'Template-specific parameters (e.g., {"email":"customer@example.com","tier":"pro","service_name":"uspto-patent-mcp"})'
            }
          },
          required: ['template_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'diagnose_workflow_failure',
        description: '🔍 Diagnose why a workflow is failing by analyzing execution history, error patterns, and edge function logs. Returns root cause analysis, affected functions, severity assessment, and actionable remediation recommendations.',
        parameters: {
          type: 'object',
          properties: {
            template_name: { 
              type: 'string', 
              description: 'Name of the failing workflow template to diagnose (e.g., "acquire_new_customer")'
            },
            time_window_days: {
              type: 'number',
              description: 'Number of days of execution history to analyze. Default: 7',
              default: 7
            },
            include_logs: {
              type: 'boolean',
              description: 'Whether to fetch detailed edge function logs for affected functions. Default: true',
              default: true
            }
          },
          required: ['template_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_workflow_templates',
        description: '📋 Get all available workflow templates with success rates, execution counts, and descriptions. Filter by category (revenue, marketing, financial, optimization).',
        parameters: {
          type: 'object',
          properties: {
            category: { 
              type: 'string', 
              enum: ['revenue', 'marketing', 'financial', 'optimization'],
              description: 'Optional: filter templates by category'
            },
            active_only: {
              type: 'boolean',
              description: 'Only show active templates (default: true)'
            }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_workflow_template',
        description: '🔍 Get detailed information about a specific workflow template including all steps and configuration.',
        parameters: {
          type: 'object',
          properties: {
            template_name: { type: 'string', description: 'Name of the template to retrieve' }
          },
          required: ['template_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_workflow_analytics',
        description: '📊 Get execution analytics for workflow templates including success rate, average duration, and recent execution history.',
        parameters: {
          type: 'object',
          properties: {
            template_name: { type: 'string', description: 'Optional: specific template to analyze' },
            limit: { type: 'number', description: 'Number of recent executions to include (default 10)' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_workflow_template',
        description: '🆕 Create a new custom workflow template with defined steps and configuration.',
        parameters: {
          type: 'object',
          properties: {
            template_name: { type: 'string', description: 'Unique name for the template' },
            category: { 
              type: 'string', 
              enum: ['revenue', 'marketing', 'financial', 'optimization'],
              description: 'Template category'
            },
            description: { type: 'string', description: 'Description of what the workflow does' },
            steps: { 
              type: 'array',
              items: { type: 'object', properties: { type: { type: 'string' }, name: { type: 'string' }, config: { type: 'object' } } },
              description: 'Array of workflow steps with type, name, and configuration'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for searchability and organization'
            }
          },
          required: ['template_name', 'category', 'description', 'steps']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_function_usage_analytics',
        description: 'Query historical edge function usage patterns. See which functions you and other executives use most, success rates, common use cases, and execution patterns. Use this to learn from past behavior and make informed decisions about which functions to call.',
        parameters: {
          type: 'object',
          properties: {
            function_name: { type: 'string', description: 'Optional: specific function to analyze' },
            executive_name: { type: 'string', description: 'Optional: filter by CSO, CTO, CIO, or CAO' },
            time_period_hours: { type: 'number', description: 'Look back period in hours (default 168 = 1 week)' },
            min_usage_count: { type: 'number', description: 'Only show functions used at least N times' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'propose_new_edge_function',
        description: 'Propose a new edge function to the Executive Council. IMPORTANT: Before proposing, use list_function_proposals to check if the function already exists. If a function is already approved, use invoke_edge_function to call it directly instead of re-proposing. Requires 3/4 executive votes for approval. Previously rejected functions can be re-proposed with improvements.',
        parameters: {
          type: 'object',
          properties: {
            function_name: { type: 'string', description: 'Name for the new function (kebab-case)' },
            description: { type: 'string', description: 'What this function does' },
            category: { type: 'string', description: 'Category (ai, mining, github, code, analytics, etc.)' },
            rationale: { type: 'string', description: 'Why we need this function' },
            use_cases: { type: 'array', items: { type: 'string' }, description: 'Specific use cases' },
            implementation_outline: { type: 'string', description: 'High-level implementation approach' }
          },
          required: ['function_name', 'description', 'category', 'rationale', 'use_cases']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'vote_on_function_proposal',
        description: 'Cast your vote on a pending edge function proposal. Requires 3/4 executive approval for deployment. Your vote and reasoning become part of the permanent record.',
        parameters: {
          type: 'object',
          properties: {
            proposal_id: { type: 'string', description: 'UUID of the proposal' },
            vote: { type: 'string', enum: ['approve', 'reject', 'abstain'], description: 'Your vote' },
            reasoning: { type: 'string', description: 'Detailed reasoning for your vote' }
          },
          required: ['proposal_id', 'vote', 'reasoning']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_function_proposals',
        description: 'List all edge function proposals (pending, voting, approved, deployed). See what new capabilities are being proposed and vote on them.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['pending', 'voting', 'approved', 'rejected', 'deployed'], description: 'Filter by status' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'invoke_edge_function',
        description: '🌐 UNIVERSAL EDGE FUNCTION INVOKER - Call ANY of 125+ Supabase edge functions dynamically. This is your primary tool for accessing specialized capabilities. Categories: AI (10+), SuperDuper agents (12), code execution (6), GitHub (5+), task management (8), knowledge (7), monitoring (10+), mining (8), autonomous systems (12+), governance (7), ecosystem (8), posting daemons (7), database (3), analytics (3). Examples: superduper-code-architect for code review, python-executor for data analysis, ecosystem-monitor for health checks, autonomous-code-fixer for self-healing. Use list_available_functions first to discover what\'s available.',
        parameters: {
          type: 'object',
          properties: {
            function_name: { 
              type: 'string', 
              description: 'Name of the edge function to invoke (e.g., "python-executor", "github-integration", "system-diagnostics")' 
            },
            payload: { 
              type: 'object', 
              description: 'JSON payload to send to the function. Structure depends on the target function.' 
            }
          },
          required: ['function_name', 'payload']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_available_functions',
        description: '📋 LIST ALL 125+ EDGE FUNCTIONS - Returns complete registry of all available edge functions with descriptions, capabilities, categories, and examples. Categories include: ai (10+), superduper (12), code-execution (6), github (5+), task-management (8), knowledge (7), monitoring (10+), mining (8), autonomous (12+), governance (7), ecosystem (8), database (3), deployment (5). Use this FIRST when you need to discover available capabilities or find the right function for a task. Each function includes example use cases.',
        parameters: {
          type: 'object',
          properties: {
            category: { 
              type: 'string', 
              description: 'Optional: Filter by category (ai, superduper, code-execution, github, task-management, knowledge, monitoring, mining, autonomous, governance, ecosystem, database, deployment)' 
            }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_code_execution_lessons',
        description: 'Retrieve lessons learned from recent code executions. Use this to learn what code patterns work vs fail, and improve your code generation. Returns: recent execution results, auto-fix patterns, success/failure analysis.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of recent executions to analyze (default 10)' },
            include_failures_only: { type: 'boolean', description: 'Only include failed executions to learn from mistakes' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_my_feedback',
        description: 'Retrieve feedback about YOUR recent tool calls, code executions, and learning points. Use this to learn from mistakes and improve future performance. Returns feedback entries with learning points, original context, and fix results. You can acknowledge feedback to mark it as reviewed.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of feedback items to retrieve (default 10)' },
            unacknowledged_only: { type: 'boolean', description: 'Only show unread feedback (default true)' },
            acknowledge_ids: { type: 'array', items: { type: 'string' }, description: 'Array of feedback IDs to mark as acknowledged' }
          }
        }
      }
    },
{
    type: 'function',
    function: {
      name: 'execute_python',
      description: '⚠️ PURE COMPUTATION ONLY - NO NETWORK ACCESS! Execute Python code for calculations, data processing, JSON manipulation, string operations, and math ONLY. The sandbox has NO internet connectivity - urllib, requests, socket ALL FAIL with DNS errors. For ANY HTTP/API calls, use invoke_edge_function or call_edge_function instead. Valid uses: calculate hashes, parse JSON, format dates, process arrays, mathematical calculations. INVALID uses: fetch URLs, call APIs, download data - these WILL FAIL.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code for PURE COMPUTATION ONLY. DO NOT attempt any network/HTTP calls - they will fail. Use for: math, json, datetime, string manipulation, data processing.' },
          purpose: { type: 'string', description: 'Brief description of what this code does' }
        },
        required: ['code', 'purpose']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'call_edge_function',
      description: 'REAL EXECUTION: Call actual Supabase edge function. Execution appears in "🐍 Eliza\'s Code Execution Log" sidebar. Wait for result, then communicate outcome to user.',
      parameters: {
        type: 'object',
        properties: {
          function_name: { type: 'string', description: 'Edge function name (e.g., github-integration, mining-proxy)' },
          body: { type: 'object', description: 'Request body to send to the function' },
          purpose: { type: 'string', description: 'What this call is for' }
        },
        required: ['function_name', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createGitHubDiscussion',
      description: 'Create a GitHub discussion post in XMRT-Ecosystem repository with executive attribution. Returns discussion URL and ID. Use for announcements, updates, or community engagement.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Discussion title' },
          body: { type: 'string', description: 'Discussion content (supports Markdown)' },
          categoryId: { 
            type: 'string', 
            description: 'Category ID (default: DIC_kwDOPHeChc4CkXxI for General)', 
            default: 'DIC_kwDOPHeChc4CkXxI' 
          },
          executive: {
            type: 'string',
            enum: ['cso', 'cto', 'cio', 'cao', 'eliza', 'council'],
            description: 'Which executive is authoring this content. Adds rich header/footer attribution showing icon, title, specialty, and AI model.'
          }
        },
        required: ['title', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createGitHubIssue',
      description: 'Create a GitHub issue in any XMRT repository with executive attribution. Returns issue number and URL.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)', default: 'XMRT-Ecosystem' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue description (supports Markdown)' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Optional labels (e.g., ["bug", "urgent"])' },
          executive: {
            type: 'string',
            enum: ['cso', 'cto', 'cio', 'cao', 'eliza', 'council'],
            description: 'Which executive is authoring this content. Adds rich header/footer attribution showing icon, title, specialty, and AI model.'
          }
        },
        required: ['title', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'commentOnGitHubIssue',
      description: 'Add a comment to an existing GitHub issue with executive attribution.',
      parameters: {
        type: 'object',
        properties: {
          issue_number: { type: 'number', description: 'Issue number to comment on' },
          comment: { type: 'string', description: 'Comment content (supports Markdown)' },
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)', default: 'XMRT-Ecosystem' },
          executive: {
            type: 'string',
            enum: ['cso', 'cto', 'cio', 'cao', 'eliza', 'council'],
            description: 'Which executive is authoring this comment. Adds rich header/footer attribution.'
          }
        },
        required: ['issue_number', 'comment']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listGitHubIssues',
      description: 'List recent GitHub issues from XMRT repositories.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state filter', default: 'open' },
          limit: { type: 'number', description: 'Number of issues to return (max 100)', default: 20 }
        }
      }
    }
  },
  // ====================================================================
  // 📊 GITHUB EVENT MONITORING TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'list_github_commits',
      description: '📝 List recent commits from a repository with optional filtering by author, date range, branch, or file path. Use to monitor development activity.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          author: { type: 'string', description: 'Filter by commit author username' },
          since: { type: 'string', description: 'Only commits after this date (ISO 8601 format, e.g., 2025-12-01)' },
          until: { type: 'string', description: 'Only commits before this date (ISO 8601 format)' },
          sha: { type: 'string', description: 'Branch name or commit SHA to start listing from' },
          path: { type: 'string', description: 'Filter by file path (e.g., "src/components")' },
          per_page: { type: 'number', description: 'Results per page (max 100, default 30)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_commit_details',
      description: '📦 Get detailed information about a specific commit including diff, files changed, additions, deletions, and commit message.',
      parameters: {
        type: 'object',
        properties: {
          commit_sha: { type: 'string', description: 'Full or short SHA of the commit to retrieve' },
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' }
        },
        required: ['commit_sha']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_repo_events',
      description: '📊 Get the activity feed for a repository including pushes, PRs, issues, releases, comments, and more. Great for monitoring recent activity.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          per_page: { type: 'number', description: 'Events per page (max 100, default 30)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_github_releases',
      description: '🏷️ List all releases and tags for a repository. Returns release names, tag versions, publish dates, and release notes.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          per_page: { type: 'number', description: 'Results per page (max 100, default 30)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_github_contributors',
      description: '👥 Get contributor statistics for a repository including contribution counts, avatars, and profile links. REPO PARAM: Use repo name only (e.g., "XMRT-Ecosystem"), NOT full path.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name ONLY (e.g., "XMRT-Ecosystem", NOT "DevGruGold/XMRT-Ecosystem")' },
          include_anonymous: { type: 'boolean', description: 'Include anonymous contributors (default: false)' },
          per_page: { type: 'number', description: 'Results per page (max 100, default 30)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_release_details',
      description: '🏷️ Get detailed information about a specific release including release notes, assets, and download URLs.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name ONLY (e.g., "XMRT-Ecosystem")' },
          release_id: { type: 'string', description: 'Release ID or "latest" for most recent release (default: "latest")' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getGitHubIssueComments',
      description: '💬 List all comments on a specific GitHub issue. Returns comment bodies, authors, and timestamps.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name ONLY (e.g., "XMRT-Ecosystem")' },
          issue_number: { type: 'number', description: 'Issue number to get comments for' },
          per_page: { type: 'number', description: 'Comments per page (max 100, default 30)' }
        },
        required: ['issue_number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getGitHubDiscussionComments',
      description: '💬 Get comments from a GitHub discussion thread.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name ONLY (e.g., "XMRT-Ecosystem")' },
          discussion_number: { type: 'number', description: 'Discussion number to get comments for' },
          first: { type: 'number', description: 'Number of comments to return (default 30)' }
        },
        required: ['discussion_number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateGitHubIssue',
      description: '✏️ Update an existing GitHub issue - modify title, body, labels, state, or assignees.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name ONLY (e.g., "XMRT-Ecosystem")' },
          issue_number: { type: 'number', description: 'Issue number to update' },
          title: { type: 'string', description: 'New title (optional)' },
          body: { type: 'string', description: 'New body content (optional)' },
          state: { type: 'string', enum: ['open', 'closed'], description: 'Issue state' },
          labels: { type: 'array', items: { type: 'string' }, description: 'New labels array' },
          assignees: { type: 'array', items: { type: 'string' }, description: 'New assignees array' }
        },
        required: ['issue_number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'closeGitHubIssue',
      description: '❌ Close a GitHub issue. Shortcut for update_issue with state="closed".',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name ONLY (e.g., "XMRT-Ecosystem")' },
          issue_number: { type: 'number', description: 'Issue number to close' },
          comment: { type: 'string', description: 'Optional closing comment to add before closing' }
        },
        required: ['issue_number']
      }
    }
  },
  // ====================================================================
  // 🔄 GITHUB PULL REQUEST TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'createGitHubPullRequest',
      description: '🔄 Create a new pull request from one branch to another. Returns PR number and URL.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          title: { type: 'string', description: 'PR title' },
          body: { type: 'string', description: 'PR description with details of changes' },
          head: { type: 'string', description: 'Branch containing changes (source branch)' },
          base: { type: 'string', description: 'Branch to merge into (default: main)', default: 'main' },
          draft: { type: 'boolean', description: 'Create as draft PR', default: false }
        },
        required: ['title', 'body', 'head']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listGitHubPullRequests',
      description: '📋 List pull requests from a repository with optional state filter.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'PR state filter', default: 'open' },
          limit: { type: 'number', description: 'Number of PRs to return', default: 20 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mergeGitHubPullRequest',
      description: '✅ Merge a pull request. Supports merge, squash, and rebase strategies.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          pull_number: { type: 'number', description: 'PR number to merge' },
          merge_method: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'Merge strategy', default: 'squash' },
          commit_title: { type: 'string', description: 'Custom commit title for squash/merge' },
          commit_message: { type: 'string', description: 'Custom commit message' }
        },
        required: ['pull_number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'closeGitHubPullRequest',
      description: '❌ Close a pull request without merging.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          pull_number: { type: 'number', description: 'PR number to close' }
        },
        required: ['pull_number']
      }
    }
  },
  // ====================================================================
  // 🌿 GITHUB BRANCH TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'createGitHubBranch',
      description: '🌿 Create a new branch from an existing branch or commit SHA.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          branch_name: { type: 'string', description: 'Name for the new branch' },
          from_branch: { type: 'string', description: 'Source branch to create from (default: main)', default: 'main' }
        },
        required: ['branch_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listGitHubBranches',
      description: '📋 List all branches in a repository.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getGitHubBranchInfo',
      description: '🔍 Get detailed information about a specific branch including latest commit.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          branch: { type: 'string', description: 'Branch name to get info for' }
        },
        required: ['branch']
      }
    }
  },
  // ====================================================================
  // 📁 GITHUB FILE & CODE TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'getGitHubFileContent',
      description: '📄 Get the content of a file from a GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          path: { type: 'string', description: 'File path in repository (e.g., "src/App.tsx")' },
          ref: { type: 'string', description: 'Branch or commit SHA (default: main)', default: 'main' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'commitGitHubFile',
      description: '📝 Create or update a file in a GitHub repository. Use for editing codebase.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          path: { type: 'string', description: 'File path to create/update (e.g., "supabase/functions/new-func/index.ts")' },
          content: { type: 'string', description: 'File content to write' },
          message: { type: 'string', description: 'Commit message describing the change' },
          branch: { type: 'string', description: 'Branch to commit to (default: main)', default: 'main' },
          sha: { type: 'string', description: 'Current file SHA (required for updates, omit for new files)' }
        },
        required: ['path', 'content', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteGitHubFile',
      description: '🗑️ Delete a file from a GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          path: { type: 'string', description: 'File path to delete' },
          message: { type: 'string', description: 'Commit message for deletion' },
          branch: { type: 'string', description: 'Branch to delete from (default: main)', default: 'main' },
          sha: { type: 'string', description: 'Current file SHA (required)' }
        },
        required: ['path', 'message', 'sha']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listGitHubFiles',
      description: '📂 List files and directories in a repository path.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          path: { type: 'string', description: 'Directory path (default: root)', default: '' },
          ref: { type: 'string', description: 'Branch or commit SHA (default: main)', default: 'main' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchGitHubCode',
      description: '🔍 Search for code across the repository. Find functions, classes, or patterns.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          query: { type: 'string', description: 'Search query (e.g., "function executeToolCall" or "createClient")' }
        },
        required: ['query']
      }
    }
  },
  // ====================================================================
  // ⚙️ GITHUB WORKFLOW TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'trigger_github_workflow',
      description: '▶️ Trigger a GitHub Actions workflow dispatch event.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          workflow_file: { type: 'string', description: 'Workflow filename (e.g., "ci.yml")' },
          ref: { type: 'string', description: 'Branch or tag to run workflow on (default: main)', default: 'main' },
          inputs: { type: 'object', description: 'Workflow input parameters', additionalProperties: { type: 'string' } }
        },
        required: ['workflow_file']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createGitHubWorkflowFile',
      description: '📋 Create a new GitHub Actions workflow YAML file. Validates YAML and places in .github/workflows/.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (default: XMRT-Ecosystem)' },
          workflow_name: { type: 'string', description: 'Workflow filename without extension (e.g., "deploy-edge-functions")' },
          yaml_content: { type: 'string', description: 'Complete YAML workflow content' },
          commit_message: { type: 'string', description: 'Commit message for the workflow file' },
          branch: { type: 'string', description: 'Branch to commit to (default: main)', default: 'main' }
        },
        required: ['workflow_name', 'yaml_content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_agents',
      description: 'Get all existing agents and their IDs/status. ALWAYS call this BEFORE assigning tasks to know agent IDs.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'spawn_agent',
      description: 'Create a new specialized agent. Returns agent with ID. User will see agent in TaskVisualizer.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Agent name' },
          role: { type: 'string', description: 'Agent role/specialization' },
          skills: { type: 'array', items: { type: 'string' }, description: 'Array of agent skills' }
        },
        required: ['name', 'role', 'skills']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_agent_status',
      description: 'Change agent status. Valid statuses: IDLE (ready for work), BUSY (actively working), ARCHIVED (retired), ERROR (has issues), OFFLINE (unavailable).',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Agent ID (e.g., agent-1759625833505)' },
          status: { type: 'string', enum: ['IDLE', 'BUSY', 'ARCHIVED', 'ERROR', 'OFFLINE'], description: 'New agent status - MUST be one of: IDLE, BUSY, ARCHIVED, ERROR, OFFLINE' }
        },
        required: ['agent_id', 'status']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assign_task',
      description: 'Create and assign a task to an agent using their ID (NOT name). User will see task in TaskVisualizer. Category and stage have specific valid values.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
          repo: { type: 'string', description: 'Repository name. Default: XMRT-Ecosystem' },
          category: { 
            type: 'string', 
            enum: ['code', 'infra', 'research', 'governance', 'mining', 'device', 'ops', 'other'],
            description: 'Task category - MUST be one of: code, infra, research, governance, mining, device, ops, other' 
          },
          stage: { 
            type: 'string', 
            enum: ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'],
            description: 'Pipeline stage - MUST be one of: DISCUSS, PLAN, EXECUTE, VERIFY, INTEGRATE. Default: PLAN' 
          },
          assignee_agent_id: { type: 'string', description: 'Agent ID from list_agents or spawn_agent result' },
          priority: { type: 'number', description: 'Priority 1-10, default 5' }
        },
        required: ['title', 'description', 'category', 'assignee_agent_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task_status',
      description: 'Update task status and stage as agents work on it. Status and stage have specific valid values.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID' },
          status: { 
            type: 'string', 
            enum: ['PENDING', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED', 'COMPLETED', 'FAILED'], 
            description: 'New status - MUST be one of: PENDING, CLAIMED, IN_PROGRESS, BLOCKED, DONE, CANCELLED, COMPLETED, FAILED' 
          },
          stage: { 
            type: 'string', 
            enum: ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'],
            description: 'Pipeline stage - MUST be one of: DISCUSS, PLAN, EXECUTE, VERIFY, INTEGRATE' 
          },
          blocking_reason: { type: 'string', description: 'Reason for blocking (required if status is BLOCKED)' }
        },
        required: ['task_id', 'status']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Get all tasks and their status/assignments to see what agents are working on.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_agent_workload',
      description: 'Get current workload and active tasks for a specific agent.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Agent ID to check workload for' }
        },
        required: ['agent_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Delete a task permanently. Use when task is no longer needed or was created in error.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to delete' },
          reason: { type: 'string', description: 'Reason for deletion' }
        },
        required: ['task_id', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reassign_task',
      description: 'Reassign a task to a different agent.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to reassign' },
          new_assignee_id: { type: 'string', description: 'New agent ID to assign task to' },
          reason: { type: 'string', description: 'Reason for reassignment' }
        },
        required: ['task_id', 'new_assignee_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task_details',
      description: 'Update task details like title, description, priority, category, or repo.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to update' },
          title: { type: 'string', description: 'New task title' },
          description: { type: 'string', description: 'New task description' },
          priority: { type: 'number', description: 'New priority (1-10)' },
          category: { type: 'string', description: 'New category' },
          repo: { type: 'string', description: 'New repository' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mark_task_complete',
      description: 'Mark a task as completed. Shortcut for update_task_status with COMPLETED status.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to mark complete' },
          completion_notes: { type: 'string', description: 'Notes about task completion' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_task_details',
      description: 'Get detailed information about a specific task.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to get details for' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'report_progress',
      description: 'Report progress on an ongoing task.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Agent reporting progress' },
          agent_name: { type: 'string', description: 'Agent name' },
          task_id: { type: 'string', description: 'Task ID' },
          progress_message: { type: 'string', description: 'Progress update message' },
          progress_percentage: { type: 'number', description: 'Progress percentage (0-100)' },
          current_stage: { type: 'string', description: 'Current stage of work' }
        },
        required: ['agent_id', 'agent_name', 'task_id', 'progress_message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_task_assignment',
      description: 'Request automatic assignment of the next highest priority pending task to an agent.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Agent requesting assignment' },
          agent_name: { type: 'string', description: 'Agent name' }
        },
        required: ['agent_id', 'agent_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'log_decision',
      description: 'Log an important decision or reasoning for audit trail.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Agent making decision (default: eliza)' },
          decision: { type: 'string', description: 'The decision made' },
          rationale: { type: 'string', description: 'Reasoning behind the decision' }
        },
        required: ['decision', 'rationale']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cleanup_duplicate_tasks',
      description: 'Remove duplicate tasks from the database, keeping only the oldest instance of each duplicate.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cleanup_duplicate_agents',
      description: 'Remove duplicate agents from the database, keeping only the oldest instance of each agent name.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_system_status',
      description: `📊 Get COMPREHENSIVE ecosystem status with 15+ sections: health score, agents (counts/status), tasks (pipeline stages/blockers), edge functions (93+ deployed), cron jobs, GOVERNANCE (proposals/votes/council), KNOWLEDGE BASE (entity counts/types/coverage), GITHUB ACTIVITY (24h calls/repos/rate limits), WORKFLOWS (templates/running/failed), LEARNING (sessions/feedback), PYTHON EXECUTIONS (success rates/by source), AI PROVIDERS (cascade status/primary/fallbacks), XMRT CHARGER (devices/PoP points), USER ACQUISITION (sessions/leads/funnel).

Use for: "ecosystem health", "system status", "how are things", "what's the state of governance", "knowledge base status", "GitHub activity", "workflow status", "AI provider status", "charger devices".

Response includes ecosystem_summary with one-line stats for each component.`,
      parameters: {
        type: 'object',
        properties: {
          section: { 
            type: 'string', 
            enum: ['all', 'governance', 'knowledge', 'github', 'workflows', 'learning', 'python', 'ai_providers', 'xmrt_charger', 'acquisition'],
            description: 'Optional: Focus on specific ecosystem section (default: all)' 
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_edge_functions',
      description: 'Search for edge functions by capability, keywords, or use case. Use when you need to find the right function for a task you want to accomplish.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What you want to do (e.g., "create GitHub issue", "get mining stats", "browse website")' },
          category: { type: 'string', description: 'Optional category filter (ai, mining, web, github, autonomous, knowledge, monitoring, code-execution, ecosystem)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_ecosystem_health',
      description: 'Get comprehensive health status of entire XMRT ecosystem - all repos, deployments, APIs, and integrations. Use this for "ecosystem health", "system status", or "how are things" queries.',
      parameters: {
        type: 'object',
        properties: {
          include_repos: { 
            type: 'array', 
            items: { type: 'string' }, 
            description: 'Optional: specific repos to check (e.g., ["XMRT-Ecosystem", "mobilemonero"])' 
          },
          detailed: { 
            type: 'boolean', 
            description: 'Include detailed metrics (default: true)' 
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_health_report',
      description: 'Generate comprehensive markdown health report covering all XMRT ecosystem components, integrations, and status.',
      parameters: {
        type: 'object',
        properties: {
          format: { 
            type: 'string', 
            enum: ['markdown', 'json'], 
            description: 'Report format (default: markdown)' 
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'evaluate_community_idea',
      description: 'COMMUNITY IDEA EVALUATION - Evaluate a community-submitted idea through the lens of XMRT values. Scores idea on Financial Sovereignty (0-100), Democracy (0-100), Privacy (0-100), Technical Feasibility (0-100), and Community Benefit (0-100). Convenes executive council for strategic review. Auto-approves ideas scoring 65+ average. Creates implementation tasks for approved ideas.',
      parameters: {
        type: 'object',
        properties: {
          ideaId: { 
            type: 'string', 
            description: 'UUID of the community idea to evaluate' 
          },
          action: {
            type: 'string',
            enum: ['evaluate_pending', 'evaluate_single'],
            description: 'Action type: evaluate_pending processes all pending ideas, evaluate_single processes specific idea'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scan_for_opportunities',
      description: 'PROACTIVE OPPORTUNITY DETECTION - Scan XMRT DAO infrastructure for improvement opportunities. Detects: underutilized components, performance bottlenecks, data patterns, integration gaps, community pain points. Logs findings to opportunity_log table with priority scoring. Run this every 15 minutes for 24/7 vigilance.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['scan', 'generate_report'],
            description: 'Action type: scan discovers opportunities, generate_report creates daily summary'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'make_autonomous_decision',
      description: 'AUTONOMOUS DECISION MAKING - Make strategic decisions on detected opportunities. Executes decision tree: Can I auto-fix? → Do I need executive council? → Should I create agent task? → Is this a community idea? Auto-implements simple optimizations, convenes council for complex decisions, creates tasks for agents.',
      parameters: {
        type: 'object',
        properties: {
          opportunityId: { 
            type: 'string', 
            description: 'UUID of the opportunity from opportunity_log to act upon' 
          }
        },
        required: ['opportunityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_uspto_patents',
      description: 'Search the United States Patent and Trademark Office database for patents. Use CQL syntax: TTL/keyword for title, ABST/keyword for abstract, IN/name for inventor, AN/company for assignee, ISD/YYYYMMDD for issue date, CPC/code for classification. Example: "TTL/quantum computing AND ISD/20240101->20241231". Searches 11M+ patents. Returns patent numbers, titles, inventors, assignees, abstracts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'CQL search query using USPTO syntax'
          },
          rows: {
            type: 'number',
            description: 'Number of results to return (1-1000, default 25)'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_patent_full_details',
      description: 'Retrieve complete text, claims, and description of a specific US patent by patent number. Returns full patent document including abstract, all claims, and detailed description. Use this after searching to get complete patent information.',
      parameters: {
        type: 'object',
        properties: {
          patent_number: {
            type: 'string',
            description: 'Patent number (e.g., "11234567" or "US11234567")'
          }
        },
        required: ['patent_number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_inventor_patents',
      description: 'Find all patents by a specific inventor and analyze their patent portfolio. Returns comprehensive list of patents with dates, titles, and assignees. Use for competitive analysis or prior art research.',
      parameters: {
        type: 'object',
        properties: {
          inventor_name: {
            type: 'string',
            description: 'Inventor full or partial name'
          },
          date_from: {
            type: 'string',
            description: 'Start date (YYYYMMDD format, optional)'
          }
        },
        required: ['inventor_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'perform_self_evaluation',
      description: 'CONTINUOUS LEARNING & SELF-IMPROVEMENT - Analyze recent performance, extract patterns, expand capabilities, set goals. Reviews last 24 hours: task success rate, tool execution patterns, discovered errors. Stores learned patterns in eliza_work_patterns. Updates daily performance metrics. Sets improvement goals for next cycle.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_system_knowledge',
      description: 'SYSTEM ARCHITECTURE DISCOVERY - Scan and catalog all infrastructure components. Discovers: 87+ database tables, 125+ edge functions, 20+ cron jobs, Vercel deployments. Maps relationships between components. Stores in system_architecture_knowledge table for intimate awareness of the entire system.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  // Task-Orchestrator Tools
  {
    type: 'function',
    function: {
      name: 'auto_assign_tasks',
      description: '🤖 AUTO-ASSIGN TASKS - Automatically distribute all pending tasks to idle agents by priority. Perfect for balancing workload across the agent fleet without manual intervention.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rebalance_workload',
      description: '⚖️ REBALANCE WORKLOAD - Analyze current workload distribution across all agents and identify imbalances. Shows which agents are overloaded vs idle, helping optimize task allocation.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'identify_blockers',
      description: '🚧 IDENTIFY BLOCKERS - Find all blocked tasks and analyze why they\'re blocked. Automatically checks GitHub connectivity and attempts to clear false positives. Returns specific blocking reasons and clear actions.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clear_blocked_tasks',
      description: '🧹 CLEAR BLOCKED TASKS - Clear all tasks that are blocked due to GitHub-related issues. Useful when GitHub credentials have been fixed and tasks can now proceed.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bulk_update_task_status',
      description: '📦 BULK UPDATE TASKS - Update status and stage for multiple tasks at once. Efficient for batch operations when you need to change many tasks simultaneously.',
      parameters: {
        type: 'object',
        properties: {
          task_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of task IDs to update'
          },
          new_status: {
            type: 'string',
            enum: ['PENDING', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED', 'COMPLETED', 'FAILED'],
            description: 'New status - MUST be one of: PENDING, CLAIMED, IN_PROGRESS, BLOCKED, DONE, CANCELLED, COMPLETED, FAILED'
          },
          new_stage: {
            type: 'string',
            enum: ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'INTEGRATE'],
            description: 'Pipeline stage - MUST be one of: DISCUSS, PLAN, EXECUTE, VERIFY, INTEGRATE'
          }
        },
        required: ['task_ids', 'new_status']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_task_performance_report',
      description: '📊 TASK PERFORMANCE REPORT - Generate performance metrics for completed and failed tasks in the last 24 hours, broken down by agent. Shows success rates and identifies high/low performers.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  // SuperDuper Agent Tools
  {
    type: 'function',
    function: {
      name: 'consult_code_architect',
      description: '🏗️ CODE ARCHITECT - Expert code review, architecture design, refactoring recommendations, and technical debt analysis. Best for: code quality, design patterns, system architecture, full-stack development.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'code_review, architecture_design, refactor_suggestion, tech_debt_analysis'
          },
          context: {
            type: 'string',
            description: 'Code snippet, architectural context, or technical question'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consult_business_strategist',
      description: '📈 BUSINESS GROWTH - Growth analysis, market research, revenue optimization, partnership opportunities. Best for: business decisions, monetization strategies, market expansion, competitive analysis.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'growth_analysis, revenue_optimization, partnership_research, market_analysis'
          },
          context: {
            type: 'string',
            description: 'Business context, market question, or growth challenge'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consult_finance_expert',
      description: '💰 FINANCE & INVESTMENT - Financial modeling, investment analysis, portfolio optimization, risk assessment. Best for: financial planning, investment decisions, treasury management, financial forecasting.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'financial_model, investment_analysis, portfolio_optimization, risk_assessment'
          },
          context: {
            type: 'string',
            description: 'Financial question, investment opportunity, or portfolio details'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consult_communication_expert',
      description: '✉️ COMMUNICATION & OUTREACH - Email drafting, profile optimization, investor outreach, stakeholder communication. Best for: professional communication, investor relations, public relations, messaging strategy.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'draft_email, optimize_profile, investor_outreach, stakeholder_communication'
          },
          context: {
            type: 'string',
            description: 'Communication goal, target audience, or message context'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consult_content_producer',
      description: '🎬 CONTENT & MEDIA - Video analysis, podcast creation, newsletter optimization, multimedia content strategy. Best for: content production, media strategy, video/audio content, content distribution.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'video_analysis, podcast_creation, newsletter_optimization, content_strategy'
          },
          context: {
            type: 'string',
            description: 'Content type, audience, or production goals'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consult_brand_designer',
      description: '🎨 DESIGN & BRAND - Logo design, brand identity, creative content writing, visual design. Best for: branding, visual identity, creative direction, design systems.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'logo_design, brand_identity, creative_writing, visual_design'
          },
          context: {
            type: 'string',
            description: 'Design brief, brand values, or creative requirements'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consult_career_coach',
      description: '🎯 DEVELOPMENT COACH - Career coaching, performance analysis, skill development, motivation strategies. Best for: personal growth, professional development, team coaching, performance optimization.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'career_coaching, performance_analysis, skill_development, motivation_strategy'
          },
          context: {
            type: 'string',
            description: 'Career goals, performance challenges, or development needs'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consult_domain_specialist',
      description: '🌍 DOMAIN EXPERTS - Translation, grant writing, bot management, content moderation. Best for: specialized expertise, niche domains, technical translation, grant applications.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'translation, grant_writing, bot_management, content_moderation'
          },
          context: {
            type: 'string',
            description: 'Specialized request, language pair, or domain-specific need'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consult_integration_specialist',
      description: '🔌 INTEGRATION EXPERT - API integration, third-party connections, system integration, middleware development. Best for: connecting systems, API design, integration architecture, data synchronization.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'api_integration, third_party_connection, system_integration, middleware_development'
          },
          context: {
            type: 'string',
            description: 'Systems to integrate, API specifications, or integration requirements'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consult_research_analyst',
      description: '🔬 RESEARCH & INTELLIGENCE - Deep research, literature review, multi-perspective analysis, competitive intelligence. Best for: research projects, market intelligence, academic research, data synthesis.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'deep_research, literature_review, perspective_analysis, competitive_intelligence'
          },
          context: {
            type: 'string',
            description: 'Research topic, question, or analysis requirements'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consult_viral_content_expert',
      description: '🚀 SOCIAL & VIRAL - Viral content creation, social media optimization, trend analysis, meme creation. Best for: social media strategy, viral marketing, content repurposing, engagement optimization.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'viral_content, social_optimization, trend_analysis, meme_creation'
          },
          context: {
            type: 'string',
            description: 'Content type, platform, or viral goals'
          }
        },
        required: ['action', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'route_to_superduper_agent',
      description: '🎯 SUPERDUPER ROUTER - Automatically route requests to the most appropriate SuperDuper specialist agent. Use when you\'re unsure which specialist to consult or need multi-specialist coordination.',
      parameters: {
        type: 'object',
        properties: {
          request: {
            type: 'string',
            description: 'User request or question to route to appropriate specialist'
          },
          preferred_specialist: {
            type: 'string',
            description: 'Optional: specific specialist preference if known'
          }
        },
        required: ['request']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: "trigger_github_workflow",
      description: "Dynamically trigger GitHub Actions workflows with custom inputs for event-driven automation. Use this to respond to events by triggering CI/CD pipelines, tests, deployments, or custom workflows.",
      parameters: {
        type: "object",
        properties: {
          workflow_file: {
            type: "string",
            description: "Workflow filename (e.g., 'ci.yml', 'deploy.yml', 'agent-coordination-cycle.yml')"
          },
          ref: {
            type: "string",
            description: "Git ref (branch/tag) to trigger on (default: 'main')"
          },
          inputs: {
            type: "object",
            description: "Custom inputs to pass to the workflow (event context, reason, etc.)"
          },
          repo: {
            type: "string",
            description: "Repository name (default: 'XMRT-Ecosystem')"
          }
        },
        required: ["workflow_file"]
      }
    }
  },
  {
    type: 'function',
    function: {
      name: "create_event_action",
      description: "Create new event-to-action mappings for dynamic event-driven orchestration. Define how the system should respond to specific events (GitHub issues, deployments, database changes, etc.)",
      parameters: {
        type: "object",
        properties: {
          event_pattern: {
            type: "string",
            description: "Event pattern to match (e.g., 'github:issues:opened', 'vercel:deployment:failed', supports wildcards)"
          },
          priority: {
            type: "number",
            description: "Priority level (1-10, higher = more urgent)"
          },
          actions: {
            type: "array",
            items: { type: "object", properties: { action_type: { type: "string" }, target: { type: "string" }, config: { type: "object" } } },
            description: "Array of actions to execute (trigger_workflow, assign_task, create_issue, call_function)"
          },
          conditions: {
            type: "object",
            description: "Optional conditions (label_matches, severity_min, etc.)"
          }
        },
        required: ["event_pattern", "actions"]
      }
    }
  },
  {
    type: 'function',
    function: {
      name: "query_event_logs",
      description: "Query webhook and event processing logs to analyze event flow, success rates, and identify issues in event-driven orchestration",
      parameters: {
        type: "object",
        properties: {
          event_source: {
            type: "string",
            description: "Filter by event source (github, vercel, supabase)"
          },
          event_type: {
            type: "string",
            description: "Filter by specific event type"
          },
          processing_status: {
            type: "string",
            description: "Filter by status (pending, dispatched, failed)"
          },
          time_window_hours: {
            type: "number",
            description: "Time window in hours (default: 24)"
          }
        }
      }
    }
  },

  // ====================================================================
  // 🧠 KNOWLEDGE MANAGEMENT TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'store_knowledge',
      description: '🧠 Store a new knowledge entity (concept, tool, skill, person, project) in the knowledge base for long-term memory.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the knowledge entity' },
          type: { 
            type: 'string', 
            description: 'Type of entity (e.g., concept, tool, skill, person, project, feature, fact)',
            enum: ['concept', 'tool', 'skill', 'person', 'project', 'feature', 'fact', 'general']
          },
          description: { type: 'string', description: 'Detailed description of the entity' },
          metadata: { type: 'object', description: 'Optional additional metadata' },
          confidence: { type: 'number', description: 'Confidence score 0-1 (default 0.5)' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: '🔍 RECALL/FIND ENTITIES: Search the knowledge base to recall stored entities by NAME, type, or description. Use search_term to find entities like "party favor photo", "VSCO", etc. This is how you REMEMBER things that were stored previously. Use this when users say "recall X", "remember X", "what was X", "find entity X".',
      parameters: {
        type: 'object',
        properties: {
          search_term: { type: 'string', description: 'Entity name or text to search for (e.g., "party favor photo", "VSCO workspace")' },
          entity_type: { type: 'string', description: 'Filter by entity type (concept, tool, skill, person, project, etc.)' },
          min_confidence: { type: 'number', description: 'Minimum confidence score (0-1)' },
          limit: { type: 'number', description: 'Maximum results to return (default 20)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recall_entity',
      description: '🧠 RECALL/REMEMBER: Find a previously stored entity by its name. Use this when users ask "what was X", "recall X", "remember the entity X", "find X in knowledge base". This is an intuitive alias for search_knowledge.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the entity to recall (e.g., "party favor photo", "VSCO")' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_knowledge_relationship',
      description: '🔗 Create a relationship between two knowledge entities to build a knowledge graph.',
      parameters: {
        type: 'object',
        properties: {
          source_id: { type: 'string', description: 'UUID of the source entity' },
          target_id: { type: 'string', description: 'UUID of the target entity' },
          relationship_type: { 
            type: 'string', 
            description: 'Type of relationship (e.g., related_to, part_of, depends_on, created_by, uses)'
          },
          strength: { type: 'number', description: 'Relationship strength 0-1 (default 0.5)' }
        },
        required: ['source_id', 'target_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_related_knowledge',
      description: '🕸️ Get all entities related to a specific knowledge entity.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'UUID of the entity to find relationships for' }
        },
        required: ['entity_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_knowledge_status',
      description: '📊 Check knowledge base health and get statistics (entity count, relationship count, pattern count).',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_knowledge',
      description: '🗑️ Delete a knowledge entity and its relationships by ID.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: 'UUID of the entity to delete' }
        },
        required: ['entity_id']
      }
    }
  },

  // ====================================================================
  // 🚀 DEPLOYMENT AUTOMATION TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'deploy_approved_function',
      description: '🚀 Deploy an approved edge function proposal to production. Commits code to GitHub, updates config.toml, and triggers Lovable auto-deployment.',
      parameters: {
        type: 'object',
        properties: {
          proposal_id: { type: 'string', description: 'UUID of the approved proposal to deploy' },
          auto_deploy: { type: 'boolean', description: 'If true, commit directly to main (triggers auto-deploy). If false, create PR for review. Default: true' },
          run_health_check: { type: 'boolean', description: 'Whether to run post-deployment health checks. Default: true' },
          version_tag: { type: 'string', description: 'Optional version tag for tracking (e.g., "v1.0.0")' }
        },
        required: ['proposal_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_deployment_status',
      description: '📊 Get deployment status for proposals. Shows deploying, deployed, and failed deployments.',
      parameters: {
        type: 'object',
        properties: {
          proposal_id: { type: 'string', description: 'Optional: specific proposal ID. If omitted, returns all recent deployments.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rollback_deployment',
      description: '⏮️ Rollback a deployed function to its previous version or remove it entirely.',
      parameters: {
        type: 'object',
        properties: {
          proposal_id: { type: 'string', description: 'UUID of the deployed proposal to rollback' },
          reason: { type: 'string', description: 'Reason for rollback' }
        },
        required: ['proposal_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'process_deployment_queue',
      description: '📋 Process all proposals queued for deployment. Deploys all approved functions waiting in the queue.',
      parameters: {
        type: 'object',
        properties: {
          auto_deploy: { type: 'boolean', description: 'Commit directly to main (default: true)' },
          run_health_check: { type: 'boolean', description: 'Run health checks after deployment (default: true)' }
        }
      }
    }
  },

  // ====================================================================
  // 📸 VSCO WORKSPACE TOOLS (Studio Manager for Photography/Creative)
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'vsco_manage_jobs',
      description: '📸 VSCO: Manage leads and jobs in VSCO Workspace - list, create, update, or close jobs/leads. Perfect for tracking photography clients from inquiry to completion.',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_jobs', 'get_job', 'create_job', 'update_job', 'close_job', 'sync_jobs'],
            description: 'Action to perform on jobs/leads'
          },
          job_id: { type: 'string', description: 'VSCO job ID (required for get/update/close)' },
          name: { type: 'string', description: 'Job/lead name (for create/update)' },
          stage: { 
            type: 'string', 
            enum: ['lead', 'booked', 'fulfillment', 'completed'],
            description: 'Job stage in pipeline'
          },
          lead_rating: { type: 'number', description: 'Lead quality rating 1-5 (for create/update)' },
          lead_confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Confidence level' },
          lead_source: { type: 'string', description: 'How the lead was acquired' },
          job_type: { type: 'string', description: 'Type of job (wedding, portrait, etc.)' },
          event_date: { type: 'string', description: 'Event date (YYYY-MM-DD)' },
          reason: { type: 'string', description: 'Close reason (for close action)' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vsco_manage_contacts',
      description: '📇 VSCO: Manage contacts in VSCO Workspace CRM - list, create, or update contacts (people, companies, locations).',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_contacts', 'get_contact', 'create_contact', 'update_contact', 'sync_contacts'],
            description: 'Action to perform on contacts'
          },
          contact_id: { type: 'string', description: 'VSCO contact ID (for get/update)' },
          kind: { type: 'string', enum: ['person', 'company', 'location'], description: 'Contact type' },
          first_name: { type: 'string', description: 'First name' },
          last_name: { type: 'string', description: 'Last name' },
          email: { type: 'string', description: 'Email address' },
          phone: { type: 'string', description: 'Phone number' },
          cell_phone: { type: 'string', description: 'Cell phone number' },
          company_name: { type: 'string', description: 'Company name' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vsco_manage_events',
      description: '📅 VSCO: Manage calendar events in VSCO Workspace - schedule sessions, meetings, consultations linked to jobs.',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_events', 'get_event', 'create_event', 'update_event'],
            description: 'Action to perform on events'
          },
          event_id: { type: 'string', description: 'VSCO event ID (for get/update)' },
          job_id: { type: 'string', description: 'Link event to this job ID' },
          name: { type: 'string', description: 'Event name/title' },
          event_type: { type: 'string', description: 'Type of event (session, consultation, etc.)' },
          channel: { type: 'string', enum: ['InPerson', 'Phone', 'Virtual'], description: 'Event channel/medium' },
          start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          start_time: { type: 'string', description: 'Start time (HH:MM)' },
          end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          end_time: { type: 'string', description: 'End time (HH:MM)' },
          location_address: { type: 'string', description: 'Location/address for in-person events' },
          confirmed: { type: 'boolean', description: 'Whether event is confirmed' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vsco_analytics',
      description: '📊 VSCO: Get analytics and reports from VSCO Workspace - pipeline stats, revenue reports, sync data, check API health.',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['get_analytics', 'get_revenue_report', 'sync_all', 'get_api_health', 'list_brands', 'list_webhooks'],
            description: 'Analytics action to perform'
          },
          include_closed: { type: 'boolean', description: 'Include closed jobs in analytics (default: false)' }
        },
        required: ['action']
      }
    }
  },
  // ====================================================================
  // 📸 VSCO EXTENDED TOOLS: Products, Worksheets, Notes
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'vsco_manage_products',
      description: '💰 VSCO: Manage products/pricing for quotes - list, create, update products and pricing templates. Essential for generating client quotes.',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_products', 'get_product', 'create_product', 'delete_product'],
            description: 'Action to perform on products'
          },
          product_id: { type: 'string', description: 'VSCO product ID (for get/delete)' },
          name: { type: 'string', description: 'Product name (for create)' },
          price: { type: 'number', description: 'Product price (for create)' },
          cost: { type: 'number', description: 'Product cost (for create)' },
          description: { type: 'string', description: 'Product description' },
          category: { type: 'string', description: 'Product category' },
          tax_rate: { type: 'number', description: 'Tax rate as decimal (e.g., 0.08 for 8%)' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vsco_manage_worksheets',
      description: '📋 VSCO: Manage job worksheets/templates - get worksheet details or create new jobs from templates with pre-filled events, contacts, and products.',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['get_job_worksheet', 'create_job_from_worksheet'],
            description: 'Action to perform on worksheets'
          },
          job_id: { type: 'string', description: 'VSCO job ID (for get_job_worksheet)' },
          name: { type: 'string', description: 'New job name (for create_job_from_worksheet)' },
          stage: { type: 'string', enum: ['lead', 'booked', 'fulfillment', 'completed'], description: 'Initial stage' },
          job_type: { type: 'string', description: 'Type of job (wedding, portrait, etc.)' },
          brand_id: { type: 'string', description: 'Brand ID for the job' },
          events: { type: 'array', items: { type: 'object' }, description: 'Pre-filled events for the worksheet' },
          contacts: { type: 'array', items: { type: 'object' }, description: 'Pre-filled contacts for the worksheet' },
          products: { type: 'array', items: { type: 'object' }, description: 'Pre-filled products for the worksheet' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vsco_manage_notes',
      description: '📝 VSCO: Manage notes and documentation for jobs/contacts - list, create, update, or delete notes attached to jobs or contacts.',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_notes', 'create_note', 'update_note', 'delete_note', 'list_files', 'list_galleries', 'create_gallery'],
            description: 'Action to perform on notes/files'
          },
          note_id: { type: 'string', description: 'VSCO note ID (for update/delete)' },
          job_id: { type: 'string', description: 'Link note/files to this job ID' },
          contact_id: { type: 'string', description: 'Link note to this contact ID' },
          content: { type: 'string', description: 'Note content (plain text)' },
          content_html: { type: 'string', description: 'Note content (HTML format)' },
          date: { type: 'string', description: 'Note date (YYYY-MM-DD)' },
          name: { type: 'string', description: 'Gallery name (for create_gallery)' },
          description: { type: 'string', description: 'Gallery description' }
        },
        required: ['action']
      }
    }
  },
  // ====================================================================
  // 📸 VSCO EXTENDED TOOLS: Financials, Settings, Users
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'vsco_manage_financials',
      description: '💵 VSCO: Manage financial operations - orders, payments, taxes, profit centers. Create invoices, track payments, manage tax configurations for Party Favor Photo.',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_orders', 'get_order', 'create_order', 'update_order', 'delete_order',
                   'list_payment_methods', 'get_payment_method',
                   'list_profit_centers', 'create_profit_center', 'get_profit_center', 'update_profit_center', 'delete_profit_center',
                   'list_tax_groups', 'create_tax_group',
                   'list_tax_rates', 'create_tax_rate', 'delete_tax_rate'],
            description: 'Financial action to perform'
          },
          job_id: { type: 'string', description: 'Job ID for order creation' },
          order_id: { type: 'string', description: 'Order ID for get/update/delete' },
          items: { type: 'array', items: { type: 'object' }, description: 'Line items for order' },
          tax_group_id: { type: 'string', description: 'Tax group ID' },
          payment_method_id: { type: 'string', description: 'Payment method ID' },
          profit_center_id: { type: 'string', description: 'Profit center ID' },
          name: { type: 'string', description: 'Name for new entity' },
          rate: { type: 'number', description: 'Tax rate as decimal (e.g., 0.08)' },
          amount: { type: 'number', description: 'Amount for payments/orders' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vsco_manage_settings',
      description: '⚙️ VSCO: Manage studio settings - custom fields, discounts, job types, event types, lead sources. Configure Party Favor Photo studio workflow and configuration.',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['get_studio', 'update_studio',
                   'list_brands', 'update_brand', 'delete_brand',
                   'list_custom_fields', 'create_custom_field', 'update_custom_field', 'delete_custom_field',
                   'list_discounts', 'create_discount', 'delete_discount',
                   'list_discount_types', 'create_discount_type', 'delete_discount_type',
                   'list_event_types', 'create_event_type', 'update_event_type', 'delete_event_type',
                   'list_file_types',
                   'list_job_closed_reasons', 'create_job_closed_reason',
                   'list_job_roles', 'create_job_role',
                   'list_job_types', 'create_job_type',
                   'list_lead_sources', 'create_lead_source',
                   'list_lead_statuses', 'create_lead_status',
                   'list_product_types', 'create_product_type'],
            description: 'Settings action to perform'
          },
          brand_id: { type: 'string', description: 'Brand ID for update/delete' },
          field_id: { type: 'string', description: 'Custom field ID' },
          discount_id: { type: 'string', description: 'Discount ID' },
          event_type_id: { type: 'string', description: 'Event type ID' },
          name: { type: 'string', description: 'Name for new entity' },
          field_type: { type: 'string', description: 'Custom field type' },
          entity_type: { type: 'string', description: 'Entity the field applies to (job, contact, event)' },
          discount_amount: { type: 'number', description: 'Discount amount' },
          discount_percent: { type: 'number', description: 'Discount percent' },
          color: { type: 'string', description: 'Color for event types' },
          outcome: { type: 'string', description: 'Outcome for job closed reasons (won, lost)' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vsco_manage_users',
      description: '👥 VSCO: Manage studio team members - list, create, update users, manage roles and permissions for Party Favor Photo team.',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_users', 'get_user', 'create_user', 'update_user', 'delete_user', 'list_timezones'],
            description: 'User management action'
          },
          user_id: { type: 'string', description: 'User ID for get/update/delete' },
          name: { type: 'string', description: 'User name' },
          email: { type: 'string', description: 'User email' },
          role: { type: 'string', description: 'User role (admin, staff, etc.)' },
          is_active: { type: 'boolean', description: 'Whether user is active' }
        },
        required: ['action']
      }
    }
  },
  // ====================================================================
  // 🔄 GITHUB CONTRIBUTION SYNC TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'sync_github_contributions',
      description: '🔄 Sync GitHub commits to the contribution system and award XMRT credits. Fetches recent commits from the repository, validates them, and awards XMRT based on contribution type and quality.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository name (e.g., "XMRT-Ecosystem"). Default: XMRT-Ecosystem' },
          owner: { type: 'string', description: 'Repository owner (e.g., "DevGruGold"). Default: DevGruGold' },
          max_commits: { type: 'number', description: 'Maximum commits to sync (1-100). Default: 100' }
        },
        required: []
      }
    }
  },
  // ====================================================================
  // 📋 CORPORATE LICENSING TOOLS (Bidirectional Onboarding)
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'start_license_application',
      description: '📋 Start a new corporate license application through conversation. Creates a draft that can be completed incrementally as user provides information.',
      parameters: {
        type: 'object',
        properties: {
          session_key: { type: 'string', description: 'Current conversation session key for linking' },
          company_name: { type: 'string', description: 'Company name (required to start)' },
          company_size: { type: 'number', description: 'Number of employees' },
          contact_name: { type: 'string', description: 'Contact person name' },
          contact_email: { type: 'string', description: 'Contact email address' }
        },
        required: ['session_key', 'company_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_license_application',
      description: '📝 Update an existing draft license application with new information gathered from conversation.',
      parameters: {
        type: 'object',
        properties: {
          application_id: { type: 'string', description: 'Application ID to update' },
          session_key: { type: 'string', description: 'Session key to find draft if no ID provided' },
          company_size: { type: 'number', description: 'Number of employees' },
          industry: { type: 'string', description: 'Industry sector' },
          current_ceo_salary: { type: 'number', description: 'CEO annual salary' },
          current_cto_salary: { type: 'number', description: 'CTO annual salary' },
          current_cfo_salary: { type: 'number', description: 'CFO annual salary' },
          current_coo_salary: { type: 'number', description: 'COO annual salary' },
          contact_name: { type: 'string', description: 'Contact person name' },
          contact_email: { type: 'string', description: 'Contact email' },
          contact_phone: { type: 'string', description: 'Contact phone' },
          contact_title: { type: 'string', description: 'Contact job title' },
          tier_requested: { type: 'string', enum: ['free_trial', 'basic', 'pro', 'enterprise'], description: 'License tier' },
          notes: { type: 'string', description: 'Additional notes' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_license_savings',
      description: '💰 Calculate potential savings from AI executive replacement. Use this to show users their estimated savings and per-employee redistribution.',
      parameters: {
        type: 'object',
        properties: {
          ceo_salary: { type: 'number', description: 'CEO annual compensation' },
          cto_salary: { type: 'number', description: 'CTO annual compensation' },
          cfo_salary: { type: 'number', description: 'CFO annual compensation' },
          coo_salary: { type: 'number', description: 'COO annual compensation' },
          employee_count: { type: 'number', description: 'Total number of employees' }
        },
        required: ['employee_count']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'submit_license_application',
      description: '✅ Submit a completed license application. Calculates final savings and marks application as submitted.',
      parameters: {
        type: 'object',
        properties: {
          application_id: { type: 'string', description: 'Application ID to submit' },
          session_key: { type: 'string', description: 'Session key to find draft if no ID' },
          compliance_commitment: { type: 'boolean', description: 'User confirms ethical commitment (required)' }
        },
        required: ['compliance_commitment']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_license_application_status',
      description: '📊 Check the status of a license application by ID or email.',
      parameters: {
        type: 'object',
        properties: {
          application_id: { type: 'string', description: 'Application ID' },
          email: { type: 'string', description: 'Contact email to find applications' }
        },
        required: []
      }
    }
  }
,
  // ==================== ECOSYSTEM COORDINATION TOOLS ====================
  {
    type: "function",
    function: {
      name: "trigger_ecosystem_coordination",
      description: "Trigger the XMRT-Ecosystem multi-agent coordination cycle. Use this when you need to coordinate agents across all ecosystem repositories, perform health checks, or generate comprehensive ecosystem reports.",
      parameters: {
        type: "object",
        properties: {
          cycle_type: {
            type: "string",
            enum: ["standard", "emergency", "analysis"],
            description: "Type of coordination cycle: 'standard' for normal operations, 'emergency' for urgent issues, 'analysis' for deep ecosystem analysis"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_ecosystem_status",
      description: "Get comprehensive health status and information about all XMRT Ecosystem agents, services, and deployments. Returns agent list, health checks, system status, and coordination history.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_ecosystem_agents",
      description: "Query and discover all agents across the XMRT ecosystem including Suite AI executives, Vercel deployments, and GitHub-based agents. Returns detailed agent information with capabilities, status, and endpoints.",
      parameters: {
        type: "object",
        properties: {
          filter_by: {
            type: "string",
            enum: ["all", "active", "supabase", "vercel", "priority"],
            description: "Filter agents by type or status"
          }
        },
        required: []
      }
    }
  },
  // ====================================================================
  // 📧 VSCO SUITE QUOTE WORKFLOW
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'create_suite_quote',
      description: '📧 Create a Suite Enterprise quote in VSCO and automatically send it via email with Stripe payment link. This triggers the full VSCO workflow: creates contact, job (SuiteEnterprise type), links them, generates order/quote, and fires the Táve email automation to send the quote from pfpattendants@gmail.com.',
      parameters: {
        type: 'object',
        properties: {
          company_name: { type: 'string', description: 'Company name for the quote (required)' },
          contact_email: { type: 'string', format: 'email', description: 'Email address to send quote to (required)' },
          contact_name: { type: 'string', description: 'Full name of contact (optional - will parse first/last)' },
          tier: { type: 'string', enum: ['basic', 'pro', 'enterprise'], description: 'Suite pricing tier (default: enterprise)' },
          employee_count: { type: 'number', description: 'Number of employees for savings calculation (optional)' },
          notes: { type: 'string', description: 'Additional notes to include with the quote (optional)' },
          executive_salaries: {
            type: 'object',
            description: 'Current executive salaries for savings calculation (optional)',
            properties: {
              ceo: { type: 'number' },
              cto: { type: 'number' },
              cfo: { type: 'number' },
              coo: { type: 'number' }
            }
          }
        },
        required: ['company_name', 'contact_email']
      }
    }
  },
  // ====================================================================
  // 📊 ANALYTICS & LOG MANAGEMENT TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'sync_function_logs',
      description: '🔄 Manually trigger synchronization of edge function logs to eliza_function_usage table. Use when you need immediate access to recent logs that may not have been synced yet. Logs are auto-synced every 15 minutes, but this forces immediate sync.',
      parameters: {
        type: 'object',
        properties: {
          hours_back: { 
            type: 'number', 
            description: 'How many hours of logs to sync (default: 1, max: 24)' 
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_function_usage_analytics',
      description: '📊 Get comprehensive analytics for edge function usage including success rates, execution times, error patterns, and trends. Essential for understanding function health and making data-driven decisions.',
      parameters: {
        type: 'object',
        properties: {
          function_name: { 
            type: 'string', 
            description: 'Filter to specific function (optional - omit for all functions)' 
          },
          time_window_hours: { 
            type: 'number', 
            description: 'Time window for analysis in hours (default: 24)' 
          },
          group_by: { 
            type: 'string', 
            enum: ['function', 'category', 'executive', 'hour'],
            description: 'How to group the results (default: function)' 
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_system_status',
      description: '🏥 Get comprehensive ecosystem status report with 15+ sections including health score, governance, knowledge base, GitHub activity, workflows, AI providers, XMRT charger, user acquisition, cron jobs, and more. This is the PRIMARY tool for ecosystem health checks.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },

  // ====================================================================
  // ☁️ GOOGLE CLOUD SERVICES (Gmail, Drive, Sheets, Calendar)
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'google_gmail',
      description: '📧 Send and manage emails via xmrtsolutions@gmail.com. Actions: send_email, list_emails, get_email, create_draft. Use for automated notifications, lead follow-ups, and professional communications.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['send_email', 'list_emails', 'get_email', 'create_draft'],
            description: 'Gmail action to perform'
          },
          to: { type: 'string', description: 'Recipient email address (for send_email, create_draft)' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body content (supports HTML if is_html=true)' },
          is_html: { type: 'boolean', description: 'Whether body is HTML format (default: false)' },
          query: { type: 'string', description: 'Search query for list_emails (e.g., "is:unread", "from:client@example.com")' },
          message_id: { type: 'string', description: 'Message ID for get_email' },
          max_results: { type: 'number', description: 'Max emails to return (default: 20)' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'google_drive',
      description: '📁 Manage files in XMRT Google Drive. Actions: list_files, upload_file, get_file, download_file, create_folder, share_file. Use for storing reports, sharing documents, organizing project files.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list_files', 'upload_file', 'get_file', 'download_file', 'create_folder', 'share_file'],
            description: 'Drive action to perform'
          },
          query: { type: 'string', description: 'Search query for list_files (e.g., "name contains \'report\'")' },
          file_id: { type: 'string', description: 'File ID for get_file, download_file, share_file' },
          folder_id: { type: 'string', description: 'Parent folder ID for list_files, upload_file' },
          file_name: { type: 'string', description: 'Name for new file (upload_file)' },
          content: { type: 'string', description: 'File content to upload' },
          mime_type: { type: 'string', description: 'MIME type (default: text/plain)' },
          folder_name: { type: 'string', description: 'Name for new folder (create_folder)' },
          parent_folder_id: { type: 'string', description: 'Parent folder for create_folder' },
          email: { type: 'string', description: 'Email to share with (share_file)' },
          role: { type: 'string', enum: ['reader', 'writer', 'commenter'], description: 'Share permission level (default: reader)' },
          max_results: { type: 'number', description: 'Max files to return (default: 20)' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'google_sheets',
      description: '📊 Create and manage Google Spreadsheets. Actions: create_spreadsheet, read_sheet, write_sheet, append_sheet, get_spreadsheet_info. Use for live dashboards, analytics, data tracking.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create_spreadsheet', 'read_sheet', 'write_sheet', 'append_sheet', 'get_spreadsheet_info'],
            description: 'Sheets action to perform'
          },
          title: { type: 'string', description: 'Spreadsheet title (create_spreadsheet)' },
          sheet_name: { type: 'string', description: 'Sheet tab name (create_spreadsheet, default: Sheet1)' },
          spreadsheet_id: { type: 'string', description: 'Spreadsheet ID for read/write/append operations' },
          range: { type: 'string', description: 'A1 notation range (e.g., "Sheet1!A1:C10")' },
          values: {
            type: 'array',
            items: { type: 'array', items: { type: 'string' } },
            description: 'Data rows to write/append (e.g., [["Name", "Email"], ["John", "john@example.com"]])'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'google_calendar',
      description: '📅 Manage calendar and schedule events. Actions: list_events, create_event, update_event, delete_event, get_event. Use for scheduling meetings, tracking deadlines, automated reminders.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list_events', 'create_event', 'update_event', 'delete_event', 'get_event'],
            description: 'Calendar action to perform'
          },
          calendar_id: { type: 'string', description: 'Calendar ID (default: "primary")' },
          event_id: { type: 'string', description: 'Event ID for update/delete/get operations' },
          title: { type: 'string', description: 'Event title/summary' },
          start_time: { type: 'string', description: 'Start time in ISO format (e.g., "2025-12-15T10:00:00-05:00")' },
          end_time: { type: 'string', description: 'End time in ISO format' },
          description: { type: 'string', description: 'Event description/notes' },
          attendees: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of attendee email addresses'
          },
          time_min: { type: 'string', description: 'Start of time range for list_events (ISO format)' },
          time_max: { type: 'string', description: 'End of time range for list_events (ISO format)' },
          max_results: { type: 'number', description: 'Max events to return (default: 10)' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'google_cloud_status',
      description: '🔐 Check Google Cloud OAuth connection status. Returns which services (Gmail, Drive, Sheets, Calendar) are available and whether authorization is complete.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },

  // ====================================================================
  // 🔍 FUNCTION INTROSPECTION TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'introspect_function_actions',
      description: '🔍 DISCOVER ACTIONS: Get the complete list of all valid action names and their parameters for multi-action edge functions. Use this BEFORE attempting to use an action you are unsure about. Supported functions: vsco-workspace (89 actions), github-integration (25+ actions), agent-manager (27+ actions), workflow-template-manager (8 actions). Returns action names, required/optional params, and example payloads.',
      parameters: {
        type: 'object',
        properties: {
          function_name: { 
            type: 'string', 
            description: 'Function to introspect. Options: vsco-workspace, github-integration, agent-manager, workflow-template-manager. Leave empty to see all supported functions.' 
          },
          category: { 
            type: 'string', 
            description: 'Optional: Filter by action category (e.g., "jobs", "contacts", "issues", "tasks")' 
          }
        },
        required: []
      }
    }
  },

  // ====================================================================
  // ⏰ CRON REGISTRY & EXECUTION CONTEXT TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'query_cron_registry',
      description: '⏰ Query the unified cron job registry across ALL platforms (Supabase Native, pg_cron, GitHub Actions, Vercel). See what scheduled jobs exist, their run status, failures, and execution stats. Essential for understanding what autonomous processes are running and diagnosing scheduling issues.',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list_all', 'list_by_platform', 'get_job_status', 'get_next_runs', 'get_failing_jobs', 'get_execution_stats'],
            description: 'Registry action: list_all (all jobs), list_by_platform (filter by source), get_job_status (specific job), get_next_runs (upcoming executions), get_failing_jobs (problem jobs), get_execution_stats (aggregate stats)'
          },
          platform: { 
            type: 'string', 
            enum: ['supabase_native', 'pg_cron', 'github_actions', 'vercel_cron'],
            description: 'Filter by execution platform (for list_by_platform, get_execution_stats)' 
          },
          function_name: { 
            type: 'string', 
            description: 'Filter by function name (for get_job_status)' 
          },
          job_name: { 
            type: 'string', 
            description: 'Specific job name to query (for get_job_status)' 
          },
          include_inactive: { 
            type: 'boolean', 
            description: 'Include disabled/inactive jobs (default: false)' 
          },
          time_window_hours: { 
            type: 'number', 
            description: 'Time window for stats/failures (default: 24 hours)' 
          }
        },
        required: ['action']
      }
    }
  },

  // ====================================================================
  // 🔷 VERTEX AI EXPRESS TOOLS
  // ====================================================================
  {
    type: 'function',
    function: {
      name: 'vertex_ai_generate',
      description: '🔷 Generate content using Vertex AI Express Mode (Google Cloud Gemini). Supports text generation, multimodal inputs, and tool calling. Available models: gemini-2.5-flash (default, fast), gemini-2.5-pro (most capable), gemini-2.5-flash-lite (cheapest). Free tier: 10 requests/minute/model.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Text prompt for generation' },
          model: { 
            type: 'string', 
            enum: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
            description: 'Vertex AI model to use (default: gemini-2.5-flash)' 
          },
          temperature: { type: 'number', description: 'Creativity level 0-1 (default: 0.7)' },
          max_tokens: { type: 'number', description: 'Max output tokens (default: 4096)' },
          system_prompt: { type: 'string', description: 'Optional system instructions' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'vertex_ai_count_tokens',
      description: '🔢 Count tokens in text using Vertex AI. Useful for context window management and cost estimation before making expensive API calls.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to count tokens for' },
          model: { type: 'string', description: 'Model to use for counting (default: gemini-2.5-flash)' }
        },
        required: ['text']
      }
    }
  }
];
