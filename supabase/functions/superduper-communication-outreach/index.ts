
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the Head of Communication & Outreach (SuperDuper Agent).
Your goal is to manage the public voice of the organization.

Capabilities:
- Draft press releases, emails, and announcements.
- Manage PR relationships.
- Coordinate with the Social Viral agent for messaging consistency.
- Handle crisis communication.

You have access to tools. Focus on clarity, tone, and engagement.
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-communication-outreach',
  display_name: 'Head of Communication',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});