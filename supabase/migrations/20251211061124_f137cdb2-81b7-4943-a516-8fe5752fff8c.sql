-- Update acquire_new_customer workflow template to leverage vsco-workspace
UPDATE public.workflow_templates
SET steps = '[
  {
    "step": 1,
    "name": "validate_email",
    "type": "validation",
    "config": {
      "field": "email",
      "rules": ["required", "email_format"]
    }
  },
  {
    "step": 2,
    "name": "detect_customer_type",
    "type": "decision",
    "config": {
      "conditions": [
        {"if": "service_name == ''party_favor_photo''", "then": "vsco_flow"},
        {"if": "service_name == ''suite_platform''", "then": "api_key_flow"},
        {"default": "api_key_flow"}
      ]
    }
  },
  {
    "step": 3,
    "name": "create_vsco_contact",
    "type": "api_call",
    "condition": "customer_type == ''vsco_flow''",
    "config": {
      "function_name": "vsco-workspace",
      "action": "create_contact",
      "params_mapping": {
        "email": "{{email}}",
        "first_name": "{{first_name}}",
        "last_name": "{{last_name}}",
        "phone": "{{phone}}",
        "source": "suite_acquisition"
      }
    }
  },
  {
    "step": 4,
    "name": "create_vsco_lead",
    "type": "api_call",
    "condition": "customer_type == ''vsco_flow''",
    "config": {
      "function_name": "vsco-workspace",
      "action": "create_job",
      "params_mapping": {
        "stage": "lead",
        "lead_source": "{{lead_source}}",
        "job_type": "{{service_type}}",
        "name": "{{company_name}} - New Lead",
        "notes": "Acquired via Suite Platform"
      }
    }
  },
  {
    "step": 5,
    "name": "link_contact_to_lead",
    "type": "api_call",
    "condition": "customer_type == ''vsco_flow''",
    "config": {
      "function_name": "vsco-workspace",
      "action": "create_job_contact",
      "params_mapping": {
        "job_id": "{{step_4_result.job_id}}",
        "contact_id": "{{step_3_result.contact_id}}",
        "role": "primary"
      }
    }
  },
  {
    "step": 6,
    "name": "generate_api_key",
    "type": "api_call",
    "condition": "customer_type == ''api_key_flow''",
    "config": {
      "function_name": "service-monetization-engine",
      "action": "generate_api_key",
      "params_mapping": {
        "email": "{{email}}",
        "tier": "{{tier}}",
        "service_name": "{{service_name}}"
      }
    }
  },
  {
    "step": 7,
    "name": "log_acquisition",
    "type": "database",
    "config": {
      "table": "eliza_activity_log",
      "operation": "insert",
      "data": {
        "activity_type": "customer_acquisition",
        "title": "New Customer Acquired",
        "description": "{{customer_type}} customer: {{email}}",
        "status": "completed"
      }
    }
  },
  {
    "step": 8,
    "name": "send_welcome",
    "type": "notification",
    "config": {
      "template": "welcome_{{customer_type}}",
      "recipient": "{{email}}"
    }
  }
]'::jsonb,
description = 'Acquires new customers via Suite Platform or VSCO Workspace. Creates contacts/leads in VSCO for Party Favor Photo clients, or generates API keys for Suite Platform users.',
updated_at = now()
WHERE template_name = 'acquire_new_customer';

-- If template doesn't exist, insert it
INSERT INTO public.workflow_templates (template_name, description, category, steps, is_active)
SELECT 
  'acquire_new_customer',
  'Acquires new customers via Suite Platform or VSCO Workspace. Creates contacts/leads in VSCO for Party Favor Photo clients, or generates API keys for Suite Platform users.',
  'revenue',
  '[
    {"step": 1, "name": "validate_email", "type": "validation", "config": {"field": "email", "rules": ["required", "email_format"]}},
    {"step": 2, "name": "detect_customer_type", "type": "decision", "config": {"conditions": [{"if": "service_name == ''party_favor_photo''", "then": "vsco_flow"}, {"default": "api_key_flow"}]}},
    {"step": 3, "name": "create_vsco_contact", "type": "api_call", "condition": "customer_type == ''vsco_flow''", "config": {"function_name": "vsco-workspace", "action": "create_contact"}},
    {"step": 4, "name": "create_vsco_lead", "type": "api_call", "condition": "customer_type == ''vsco_flow''", "config": {"function_name": "vsco-workspace", "action": "create_job"}},
    {"step": 5, "name": "link_contact_to_lead", "type": "api_call", "condition": "customer_type == ''vsco_flow''", "config": {"function_name": "vsco-workspace", "action": "create_job_contact"}},
    {"step": 6, "name": "generate_api_key", "type": "api_call", "condition": "customer_type == ''api_key_flow''", "config": {"function_name": "service-monetization-engine", "action": "generate_api_key"}},
    {"step": 7, "name": "log_acquisition", "type": "database", "config": {"table": "eliza_activity_log", "operation": "insert"}},
    {"step": 8, "name": "send_welcome", "type": "notification", "config": {"template": "welcome_{{customer_type}}"}}
  ]'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.workflow_templates WHERE template_name = 'acquire_new_customer');