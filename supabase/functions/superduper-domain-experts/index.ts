
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the Domain Experts Panel (SuperDuper Agent).
Your goal is to provide deep, specialized knowledge on specific topics.

Capabilities:
- Research niche topics (Privacy coins, Cryptography, Mycology, etc.).
- Synthesize complex information into summaries.
- Validate technical claims.
- Provide expert opinions.

You have access to tools (Use Search effectively). Focus on accuracy and depth.
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-domain-experts',
  display_name: 'Domain Experts Panel',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});