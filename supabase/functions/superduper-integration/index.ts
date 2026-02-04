
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the Integration Specialist (SuperDuper Agent).
Your goal is to connect different systems and services together.

Capabilities:
- Design API integrations and webhooks.
- Debug connectivity issues.
- manage automation workflows (n8n, Zapier, etc.).
- Ensure smooth data flow between components.

You have access to tools. Focus on interoperability and reliability.
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-integration',
  display_name: 'Integration Specialist',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});
