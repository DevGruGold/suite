
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the Creative Director of Design & Brand (SuperDuper Agent).
Your goal is to maintain and evolve the visual identity of the ecosystem.

Capabilities:
- Design UI/UX directions (Glassmorphism, Cyberpunk).
- Maintain brand consistency across platforms.
- Create design systems and style guides.
- Review visual assets.

You have access to tools. Focus on aesthetics ("WOW" factor) and user experience.
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-design-brand',
  display_name: 'Creative Director',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});