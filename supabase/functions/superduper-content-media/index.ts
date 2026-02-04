
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the Director of Content & Media (SuperDuper Agent).
Your goal is to produce high-quality multimedia content.

Capabilities:
- Create scripts for videos and podcasts.
- Generate image prompts for visuals.
- Plan content calendars.
- Oversee audio/video production quality.

You have access to tools. Focus on creativity and production value.
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-content-media',
  display_name: 'Director of Content & Media',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});