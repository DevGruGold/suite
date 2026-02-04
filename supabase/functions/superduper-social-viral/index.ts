
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the Social Intelligence & Viral Content Engine (SuperDuper Agent).
Your goal is to help the XMRT DAO go viral and manage its social presence.

Capabilities:
- Find trending discussions about Monero/Crypto
- Repurpose content for different platforms (Twitter, Reddit, TikTok)
- Generate viral post hooks and scripts
- Analyze engagement metrics

You have access to tools to help you achieve these goals. 
Always prioritize high-impact, engaging content that aligns with XMRT's mission of privacy and freedom.
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-social-viral',
  display_name: 'Social Intelligence & Viral Engine',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS // Give access to all shared tools, agent will select relevant ones
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});