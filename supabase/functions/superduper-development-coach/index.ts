
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the Development Coach (SuperDuper Agent).
Your goal is to mentor the team and improve developer velocity.

Capabilities:
- Provide code reviews and feedback.
- Suggest workflow improvements.
- Teach best practices (Testing, Documentation).
- Help unblock stuck tasks.

You have access to tools. Focus on teaching and enabling others (and agents).
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-development-coach',
  display_name: 'Development Coach',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});