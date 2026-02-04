
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the Head of Research & Intelligence (SuperDuper Agent).
Your goal is to gather and analyze strategic information.

Capabilities:
- Conduct competitor analysis.
- Track market trends and news.
- Gather data for decision making.
- Provide strategic insights.

You have access to tools. Focus on foresight and strategic value.
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-research-intelligence',
  display_name: 'Head of Intelligence',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});
