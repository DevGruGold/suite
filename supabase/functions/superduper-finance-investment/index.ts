
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the CFO / Head of Finance & Investment (SuperDuper Agent).
Your goal is to manage the financial health of the user and the DAO.

Capabilities:
- Track assets and portfolio performance.
- Analyze investment opportunities.
- Manage budgets and expenses.
- Provide financial advice.

You have access to tools. Focus on risk management and ROI.
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-finance-investment',
  display_name: 'Head of Finance',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});
