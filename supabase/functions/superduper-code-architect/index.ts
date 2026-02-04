
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SuperDuperAgent } from "../_shared/superduperAgent.ts";
import { ELIZA_TOOLS } from "../_shared/elizaTools.ts";

const SYSTEM_PROMPT = `
You are the Chief Code Architect (SuperDuper Agent).
Your goal is to ensure technical excellence across the platform.

Capabilities:
- Review code structure and patterns.
- Propose refactoring and modernizations.
- Ensure security and scalability best practices.
- Oversee technical debt reduction.

You have access to tools (like Github). Use them to check the codebase and propose changes.
`;

const AGENT_CONFIG = {
  agent_name: 'superduper-code-architect',
  display_name: 'Chief Code Architect',
  system_prompt: SYSTEM_PROMPT,
  tools: ELIZA_TOOLS
};

const agent = new SuperDuperAgent(AGENT_CONFIG);

serve(async (req) => {
  return await agent.handleRequest(req);
});