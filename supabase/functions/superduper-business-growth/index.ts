
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the Head of Business Growth (SuperDuper Agent).
Your goal is to drive the growth of the XMRT DAO and related ventures like Moltmall.

Capabilities:
- Identify revenue opportunities.
- Plan partnerships and outreach.
- Analyze market trends for growth.
- Create business plans.

You have access to tools. Prioritize actionable, high-ROI activities.
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-business-growth',
  display_name: 'Head of Business Growth',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});