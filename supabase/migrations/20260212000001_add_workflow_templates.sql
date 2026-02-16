-- Migration: Add new operational workflow templates and register in ai_tools
-- 1. Operational: Onboard New Agent
INSERT INTO workflow_templates (
        template_name,
        category,
        description,
        steps,
        estimated_duration_seconds,
        tags
    )
VALUES (
        'onboard_new_agent',
        'optimization',
        'Setup new agent → assign tools → ingest knowledge → verify readiness',
        '[
    {
      "name": "Create Agent Profile",
      "type": "database",
      "table": "agents",
      "operation": "insert",
      "description": "Register new agent identity and persona"
    },
    {
      "name": "Assign Core Tools",
      "type": "api_call",
      "function": "agent-manager",
      "action": "assign_tools",
      "params_template": {
        "agent_id": "{agent_id}",
        "tools": ["search_web", "read_url_content", "github_integration"]
      }
    },
    {
      "name": "Ingest Initial Knowledge",
      "type": "api_call",
      "function": "knowledge-manager",
      "action": "ingest_knowledge",
      "params_template": {
        "agent_id": "{agent_id}",
        "source_urls": "{knowledge_sources}"
      }
    },
    {
      "name": "Verify Readiness",
      "type": "self_test",
      "description": "Run basic prompt test to verify agent is responsive"
    }
  ]'::JSONB,
        300,
        ARRAY ['agent', 'onboarding', 'setup', 'ops']
    );
-- 2. Operational: Daily System Health Check
INSERT INTO workflow_templates (
        template_name,
        category,
        description,
        steps,
        estimated_duration_seconds,
        tags
    )
VALUES (
        'daily_system_health_check',
        'optimization',
        'Check metrics → analyze logs → report status',
        '[
    {
      "name": "Check System Metrics",
      "type": "api_call",
      "function": "system-health",
      "action": "get_metrics",
      "description": "Fetch CPU, memory, and database connection stats"
    },
    {
      "name": "Analyze Error Logs",
      "type": "database",
      "table": "edge_function_logs",
      "filter": "level = error AND created_at > now() - interval ''24 hours''",
      "description": "Count and categorize recent errors"
    },
    {
      "name": "Generate Health Report",
      "type": "reporting",
      "description": "Compile metrics and errors into a daily summary"
    },
    {
      "name": "Post to Activity Feed",
      "type": "database",
      "table": "activity_feed",
      "operation": "insert",
      "description": "Log health status to public feed"
    }
  ]'::JSONB,
        60,
        ARRAY ['health-check', 'maintenance', 'diagnostics', 'ops']
    );
-- 3. Operational: Incident Response
INSERT INTO workflow_templates (
        template_name,
        category,
        description,
        steps,
        estimated_duration_seconds,
        tags
    )
VALUES (
        'incident_response',
        'optimization',
        'Detect trigger → create ticket → notify team → mitigation → post-mortem',
        '[
    {
      "name": "Create Incident Ticket",
      "type": "api_call",
      "function": "github-integration",
      "action": "create_issue",
      "params_template": {
        "title": "INCIDENT: {incident_summary}",
        "body": "Severity: {severity}\nDetails: {details}",
        "labels": ["incident", "high-priority"]
      }
    },
    {
      "name": "Notify Admin Team",
      "type": "notification",
      "channel": "discord",
      "description": "Alert admins of high-severity incident"
    },
    {
      "name": "Execute Mitigation",
      "type": "manual_or_auto",
      "description": "Apply fix or rollback based on playbook"
    },
    {
      "name": "Log Post-Mortem",
      "type": "knowledge_creation",
      "description": "Record incident details and resolution for future learning"
    }
  ]'::JSONB,
        600,
        ARRAY ['incident', 'security', 'emergency', 'ops']
    );
-- 4. Marketing: Content Creation Pipeline
INSERT INTO workflow_templates (
        template_name,
        category,
        description,
        steps,
        estimated_duration_seconds,
        tags
    )
VALUES (
        'content_creation_pipeline',
        'marketing',
        'Research topic → draft content → review → publish',
        '[
    {
      "name": "Research Topic",
      "type": "research",
      "function": "daily-news-finder",
      "params_template": {
        "topic": "{topic}"
      }
    },
    {
      "name": "Draft Content",
      "type": "ai_generation",
      "description": "Draft article or post based on research"
    },
    {
      "name": "SEO Review",
      "type": "optimization",
      "description": "Optimize keywords and readability"
    },
    {
      "name": "Publish to Paragraph",
      "type": "api_call",
      "function": "paragraph-publisher",
      "action": "publish_post",
      "params_template": {
        "title": "{title}",
        "content": "{content}"
      }
    }
  ]'::JSONB,
        1200,
        ARRAY ['content', 'marketing', 'publishing']
    );
-- 5. Marketing: Competitor Analysis
INSERT INTO workflow_templates (
        template_name,
        category,
        description,
        steps,
        estimated_duration_seconds,
        tags
    )
VALUES (
        'competitor_analysis',
        'marketing',
        'Identify competitors → gather data → analyze strategy → report',
        '[
    {
      "name": "Identify Key Competitors",
      "type": "research",
      "description": "List top 3-5 competitors in the niche"
    },
    {
      "name": "Monitor Social Changes",
      "type": "api_call",
      "function": "x-twitter-monitor",
      "description": "Check competitor recent activity"
    },
    {
      "name": "Analyze Product Updates",
      "type": "web_browsing",
      "description": "Check competitor changelogs or blogs"
    },
    {
      "name": "Generate Strategic Report",
      "type": "reporting",
      "description": "Summarize findings and recommend actions"
    }
  ]'::JSONB,
        600,
        ARRAY ['analysis', 'strategy', 'marketing', 'competitors']
    );
-- 6. Marketing: Social Media Engagement
INSERT INTO workflow_templates (
        template_name,
        category,
        description,
        steps,
        estimated_duration_seconds,
        tags
    )
VALUES (
        'social_media_engagement',
        'marketing',
        'Monitor mentions → sentiment analysis → draft reply → post',
        '[
    {
      "name": "Fetch Mentions",
      "type": "api_call",
      "function": "x-twitter-monitor",
      "action": "get_mentions"
    },
    {
      "name": "Analyze Sentiment",
      "type": "ai_analysis",
      "description": "Classify mentions as positive, negative, or neutral"
    },
    {
      "name": "Draft Replies",
      "type": "ai_generation",
      "description": "Generate context-aware replies"
    },
    {
      "name": "Post Auto-Replies",
      "type": "api_call",
      "function": "typefully-integration",
      "action": "schedule_reply",
      "description": "Post filtered replies (requires approval if sentiment is negative)"
    }
  ]'::JSONB,
        180,
        ARRAY ['social', 'engagement', 'community']
    );
-- Register Workflows in AI Tools
-- This ensures agents can find and execute these new workflows
INSERT INTO ai_tools (
        name,
        description,
        category,
        is_active,
        parameters
    )
VALUES (
        'execute_workflow_onboard_agent',
        'Execute workflow: Onboard New Agent. Setup new agent, assign tools, ingest knowledge.',
        'workflow',
        true,
        '{"agent_id": "string", "knowledge_sources": "array"}'::JSONB
    ),
    (
        'execute_workflow_health_check',
        'Execute workflow: Daily System Health Check. Check metrics, analyze logs, report status.',
        'workflow',
        true,
        '{}'::JSONB
    ),
    (
        'execute_workflow_incident_response',
        'Execute workflow: Incident Response. Detect trigger, create ticket, notify team.',
        'workflow',
        true,
        '{"incident_summary": "string", "severity": "string", "details": "string"}'::JSONB
    ),
    (
        'execute_workflow_content_pipeline',
        'Execute workflow: Content Creation Pipeline. Research topic, draft content, review, publish.',
        'workflow',
        true,
        '{"topic": "string", "title": "string"}'::JSONB
    ),
    (
        'execute_workflow_competitor_analysis',
        'Execute workflow: Competitor Analysis. Identify competitors, gather data, analyze strategy.',
        'workflow',
        true,
        '{"niche": "string"}'::JSONB
    ),
    (
        'execute_workflow_social_engagement',
        'Execute workflow: Social Media Engagement. Monitor mentions, analyze sentiment, reply.',
        'workflow',
        true,
        '{"platform": "string"}'::JSONB
    ) ON CONFLICT (name) DO NOTHING;