import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.12.0';

// Interfaces for Agent Loop
interface AgentRequest {
  computer_id: string;
  prompt: string;
  max_turns?: number;
}

interface AndroidControlResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// System prompts and configuration
const SYSTEM_PROMPT = `
You are controlling an Android/Linux virtual machine via Orgo.
You can see the screen via screenshots and control it via mouse/keyboard actions.

<CAPABILITIES>
* You can Click, Type, and Scroll.
* You can execute shell commands.
* You MUST double-click to open desktop icons.
* Single-click to select menu items.
</CAPABILITIES>

<RESPONSE_FORMAT>
You must respond with a JSON object containing a "thought" and a list of "actions".
Example:
{
  "thought": "I need to open the browser.",
  "actions": [
    { "tool": "click", "x": 500, "y": 500 },
    { "tool": "type", "text": "hello" }
  ]
}

Supported Tools:
- click: { "tool": "click", "x": number, "y": number, "type": "left_click" | "double_click" }
- type: { "tool": "type", "text": string }
- key: { "tool": "key", "key": string } (e.g., "Return", "Escape")
- scroll: { "tool": "scroll", "amount": number }
- execute: { "tool": "execute", "command": string }
</RESPONSE_FORMAT>

<SCREEN_RESOLUTION>
 Assume 1024x768 for coordinate normalization if needed, but try to use absolute pixels from the screenshot.
</SCREEN_RESOLUTION>
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-computer-use-preview-10-2025',
      generationConfig: { responseMimeType: "application/json" }
    });

    const { computer_id, prompt, max_turns = 10 } = await req.json() as AgentRequest;

    if (!computer_id || !prompt) {
      throw new Error('Missing computer_id or prompt');
    }

    const history: any[] = [];
    let turn = 0;
    const logs: string[] = [];

    // --- Helper to call android-control ---
    async function callAndroidControl(action: string, payload: any): Promise<AndroidControlResponse> {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/android-control`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, computer_id, ...payload })
      });
      return await res.json();
    }

    // --- AGENT LOOP ---
    logs.push(`Starting agent loop for task: "${prompt}"`);

    while (turn < max_turns) {
      turn++;
      console.log(`[Turn ${turn}] Getting screenshot...`);

      // 1. Get Screenshot
      const shotRes = await callAndroidControl('screenshot', {});
      if (!shotRes.success || !shotRes.data?.screenshot_base64) {
        throw new Error(`Failed to get screenshot: ${shotRes.error}`);
      }
      const base64Image = shotRes.data.screenshot_base64;

      // 2. Prepare Prompt
      // We send the history + current screenshot
      // Note: For simple implementation, we might just send the current state + prompt 
      // or maintain a chat session. `genAI.startChat` supports history.

      const chat = model.startChat({
        history: [
          { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
          ...history
        ]
      });

      console.log(`[Turn ${turn}] Thinking...`);
      const result = await chat.sendMessage([
        { text: `Current Task: ${prompt}\n(Turn ${turn}/${max_turns})` },
        { inlineData: { data: base64Image, mimeType: "image/png" } }
      ]);

      const responseText = result.response.text();
      console.log(`[Turn ${turn}] Response: ${responseText}`);

      // 3. Parse Action
      let plan;
      try {
        plan = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse JSON response", e);
        // Retry or break? Let's just continue and hope next turn works or break.
        logs.push(`Error parsing response: ${e}`);
        break;
      }

      history.push({ role: "model", parts: [{ text: responseText }] });
      logs.push(`Turn ${turn}: ${plan.thought || 'No thought'}`);

      if (!plan.actions || plan.actions.length === 0) {
        logs.push("No actions returned. Task might be complete?");
        break;
      }

      // 4. Execute Actions
      for (const action of plan.actions) {
        console.log(`[Turn ${turn}] Executing: ${JSON.stringify(action)}`);

        // Map agent action to android-control Request
        let controlPayload: any = {};
        let actionType = 'control';

        switch (action.tool) {
          case 'click':
            controlPayload = {
              type: action.type || 'left_click', // default to left
              x: action.x,
              y: action.y
            };
            break;
          case 'type':
            controlPayload = { type: 'type', text: action.text };
            break;
          case 'key':
            controlPayload = { type: 'key_press', key: action.key };
            break;
          case 'execute':
            actionType = 'execute';
            controlPayload = { command: action.command };
            break;
          case 'scroll':
            controlPayload = { type: 'scroll', amount: action.amount };
            break;
          default:
            console.warn("Unknown tool:", action.tool);
            continue;
        }

        const execRes = await callAndroidControl(actionType, controlPayload);
        if (!execRes.success) {
          logs.push(`Action failed: ${execRes.error}`);
          history.push({ role: "user", parts: [{ text: `Action ${action.tool} failed: ${execRes.error}` }] });
        } else {
          history.push({ role: "user", parts: [{ text: `Action ${action.tool} executed successfully.` }] });
        }

        // Small delay between actions if needed?
        // await new Promise(r => setTimeout(r, 1000));
      }

      // Check if we should stop?
      // Ideally the model says "I'm done".
      // For now, we loop until max_turns.
    }

    return new Response(JSON.stringify({
      success: true,
      logs,
      turns: turn
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ [GEMINI-COMPUTER] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
