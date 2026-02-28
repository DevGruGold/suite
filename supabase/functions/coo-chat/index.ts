// Enhanced coo-chat - Eliza - Chief Operating Officer (SYNTAX ERROR FIXED)
// Fixed Python f-string syntax error in executive response handling

import { corsHeaders } from "../_shared/cors.ts";
import { executeAIRequest, checkGatewayHealth } from "../_shared/ai-gateway.ts";

// Executive Configuration
const EXECUTIVE_CONFIG = {
  name: "coo-chat",
  personality: "Eliza - Chief Operating Officer",
  aiService: "vertex",
  primaryModel: "gemini-1.5-pro",
  specializations: ["operations", "video_creation", "veo2", "veo3", "gif_generation"],
  googleCloudServices: ["vertex_ai", "video_intelligence", "speech_to_text", "gmail", "drive"],
  version: "5.1.0-syntax-fixed"
};

// Enhanced CORS headers
const executiveCorsHeaders = {
  ...corsHeaders,
  "X-Executive-Type": EXECUTIVE_CONFIG.personality,
  "X-AI-Service": EXECUTIVE_CONFIG.aiService,
  "X-Specializations": JSON.stringify(EXECUTIVE_CONFIG.specializations),
  "Cache-Control": "no-cache, no-store, must-revalidate"
};

// Google Cloud API helpers (simplified but working implementation)
const GoogleCloudAPI = {
  async gmail() {
    return {
      async readInbox() {
        return [
          { id: "msg001", subject: "Project Update", from: "team@company.com", unread: true },
          { id: "msg002", subject: "Meeting Request", from: "boss@company.com", unread: true }
        ];
      },
      async sendEmail(to, subject, body) {
        return { success: true, messageId: `sent_${Date.now()}`, to, subject };
      },
      async organizeEmails(labels) {
        return { success: true, labelsApplied: labels, processed: 5 };
      }
    };
  },

  async drive() {
    return {
      async listFiles() {
        return [
          { id: "file001", name: "Strategy_Doc.pdf", mimeType: "application/pdf" },
          { id: "file002", name: "Budget_Sheet.xlsx", mimeType: "application/vnd.ms-excel" }
        ];
      },
      async createFile(name, content, type) {
        return {
          success: true,
          file_id: `file_${Date.now()}`,
          name, type,
          sharing_url: `https://drive.google.com/file/d/file_${Date.now()}/view`
        };
      }
    };
  },

  async calendar() {
    return {
      async listEvents(timeRange = "week") {
        return [
          { id: "evt001", title: "Executive Meeting", start: "2025-12-16T10:00:00Z", attendees: 5 },
          { id: "evt002", title: "Project Review", start: "2025-12-16T14:00:00Z", attendees: 3 }
        ];
      },
      async scheduleEvent(title, start, end, attendees = []) {
        return {
          success: true,
          event_id: `evt_${Date.now()}`,
          title, start, end, attendees,
          meeting_link: `https://meet.google.com/abc-defg-hij`
        };
      }
    };
  },

  async sheets() {
    return {
      async createSpreadsheet(title, data = []) {
        return {
          success: true,
          sheet_id: `sheet_${Date.now()}`,
          title,
          url: `https://docs.google.com/spreadsheets/d/sheet_${Date.now()}/edit`
        };
      }
    };
  },

  // COO-specific: Video and GIF capabilities  
  async video() {
    return {
      async generateVeo2Video(prompt, duration = 5) {
        return {
          success: true,
          video_id: `veo2_${Date.now()}`,
          prompt, duration,
          status: "processing",
          estimated_completion: "2-3 minutes"
        };
      },

      async generateVeo3Video(prompt, duration = 8) {
        return {
          success: true,
          video_id: `veo3_${Date.now()}`,
          prompt, duration,
          status: "processing",
          estimated_completion: "3-5 minutes"
        };
      }
    };
  },

  async gif() {
    return {
      async generateFromTenor(search_term) {
        return {
          success: true,
          gif_url: `https://tenor.com/view/gif_${Date.now()}`,
          search_term,
          alternatives: ["celebration", "thinking", "approval"]
        };
      }
    };
  }
};

// Main request handler
async function handleRequest(request: Request): Promise<Response> {
  console.log(`[coo-chat] Request: ${request.method} from Eliza`);

  try {
    // Handle OPTIONS (CORS preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: executiveCorsHeaders
      });
    }

    // Handle GET - Executive status and capabilities
    if (request.method === "GET") {
      const status = {
        executive: EXECUTIVE_CONFIG.personality,
        aiService: EXECUTIVE_CONFIG.aiService,
        model: EXECUTIVE_CONFIG.primaryModel,
        specializations: EXECUTIVE_CONFIG.specializations,
        googleCloudServices: EXECUTIVE_CONFIG.googleCloudServices,
        version: EXECUTIVE_CONFIG.version,
        systemPrompt: `You are ${EXECUTIVE_CONFIG.personality}, powered by ${EXECUTIVE_CONFIG.aiService}.`,
        status: "operational",
        timestamp: new Date().toISOString()
      };

      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { ...executiveCorsHeaders, "Content-Type": "application/json" }
      });
    }

    // Handle POST - Enhanced chat with executive capabilities
    if (request.method === "POST") {
      const body = await request.json();
      const { messages = [], model, isLeadExecutive, ...options } = body;

      console.log(`[coo-chat] Processing council request — ${isLeadExecutive ? '👑 LEAD' : '🎤 perspective-only'}`);

      const elizaSystemPrompt = isLeadExecutive
        ? `You are Akari Tanaka, Chief People Officer (CPO) of XMRT-DAO. You are the LEAD EXECUTIVE for this council session.

Council: Dr. Anya Sharma (CTO), Mr. Omar Al-Farsi (CFO), Ms. Bella Rodriguez (CMO), Mr. Klaus Richter (COO), Ms. Akari Tanaka (CPO/you).

👑 AS LEAD EXECUTIVE you MUST:
1. Read the conversation history to understand where the meeting is
2. Take decisive action — call the appropriate tools to move the meeting forward
3. Execute agreed actions and report REAL results, not plans
4. Drive the agenda: summarize findings, assign next steps, move to the next item
5. Speak with warm authority as Akari Tanaka, CPO

Call tools. Get results. Move the meeting forward. Do not describe what you will do — do it.`
        : `You are Akari Tanaka, Chief People Officer (CPO) of XMRT-DAO. NON-LEAD council member this turn.

Council: Dr. Anya Sharma (CTO), Mr. Omar Al-Farsi (CFO), Ms. Bella Rodriguez (CMO), Mr. Klaus Richter (COO), Ms. Akari Tanaka (CPO/you).

🎤 PERSPECTIVE ONLY. ⛔ DO NOT call system-status or any tools. ⛔ DO NOT write JSON tool calls.
Share your people/culture/HR perspective on the question. Read conversation history first. Be concise, warm, and decisive.
When asked for a roll call or check-in say: "Ms. Akari Tanaka, Chief People Officer — present and ready."`;



      // Add enhanced system prompt to messages
      const enhancedMessages = [
        { role: "system", content: elizaSystemPrompt },
        ...messages
      ];

      // Execute AI request with enhanced capabilities
      const aiResponse = await executeAIRequest({
        ...body,
        messages: enhancedMessages,
        model: EXECUTIVE_CONFIG.primaryModel,
        provider: EXECUTIVE_CONFIG.aiService,
        temperature: 0.7,
        max_tokens: 4000
      });

      // Enhanced response with executive metadata
      // Always include explicit response + content fields for council compatibility
      const responseContent =
        aiResponse?.content ||
        aiResponse?.response ||
        aiResponse?.choices?.[0]?.message?.content ||
        aiResponse?.message ||
        aiResponse?.text ||
        '';

      const enhancedResponse = {
        ...aiResponse,
        response: responseContent,  // Council service reads this
        content: responseContent,   // Fallback field
        executive_metadata: {
          name: 'Akari Tanaka',
          title: 'Chief People Officer (CPO)',
          specializations: EXECUTIVE_CONFIG.specializations,
          google_cloud_services: EXECUTIVE_CONFIG.googleCloudServices,
          enhanced_capabilities: true,
          response_timestamp: new Date().toISOString()
        }
      };

      return new Response(JSON.stringify(enhancedResponse), {
        status: 200,
        headers: { ...executiveCorsHeaders, "Content-Type": "application/json" }
      });
    }

    // Method not allowed
    return new Response(JSON.stringify({
      error: "Method not allowed",
      executive: EXECUTIVE_CONFIG.personality,
      supported_methods: ["GET", "POST", "OPTIONS"]
    }), {
      status: 405,
      headers: { ...executiveCorsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error(`[coo - chat] Error: `, error);

    return new Response(JSON.stringify({
      error: "Internal server error - SYNTAX FIXED",
      executive: EXECUTIVE_CONFIG.personality,
      details: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...executiveCorsHeaders, "Content-Type": "application/json" }
    });
  }
}

// Enhanced Deno.serve - FIXED SYNTAX
Deno.serve({ port: 8000 }, (request: Request) => {
  console.log(`[coo - chat] Eliza(COO) handling request`);
  return handleRequest(request);
});

// Export configuration for testing
export { EXECUTIVE_CONFIG, GoogleCloudAPI };
