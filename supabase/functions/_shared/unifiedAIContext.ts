/**
 * Unified AI Context Provider
 * 
 * Ensures ALL AI fallback providers (DeepSeek, Kimi, Gemini) have access to
 * the same rich context, tools, and memory that lovable-chat Eliza has.
 * 
 * This is the SINGLE SOURCE OF TRUTH for Eliza's intelligence context.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { generateElizaSystemPrompt } from './elizaSystemPrompt.ts';
import { buildContextualPrompt } from './contextBuilder.ts';
import { ELIZA_TOOLS } from './elizaTools.ts';
import { EDGE_FUNCTIONS_REGISTRY } from './edgeFunctionRegistry.ts';

export interface EnrichedElizaContext {
  systemPrompt: string;
  tools: any[];
  memoryContexts: any[];
  conversationSummaries: any[];
  executiveFeedback: any[];
  knowledgeEntities: any[];
}

export interface ContextEnrichmentOptions {
  sessionKey?: string;
  userContext?: any;
  miningStats?: any;
  conversationHistory?: any;
  executiveName?: string;
  includeMemory?: boolean;
  includeKnowledge?: boolean;
  includeFeedback?: boolean;
}

/**
 * Retrieves the FULL Eliza context including:
 * - Complete 5800-line system prompt
 * - All 50+ tools from ELIZA_TOOLS
 * - Memory contexts from memory_contexts table
 * - Conversation summaries
 * - Executive feedback for learning
 * - Knowledge entities for domain expertise
 * 
 * This ensures fallback AI providers are equally intelligent as lovable-chat.
 */
export async function getEnrichedElizaContext(
  supabase: SupabaseClient,
  options: ContextEnrichmentOptions = {}
): Promise<EnrichedElizaContext> {
  const {
    sessionKey,
    userContext,
    miningStats,
    conversationHistory,
    executiveName = 'Chief Strategy Officer',
    includeMemory = true,
    includeKnowledge = true,
    includeFeedback = true
  } = options;

  // 1. Generate the FULL base Eliza system prompt
  const basePrompt = generateElizaSystemPrompt(
    userContext,
    miningStats,
    null, // version
    'eliza',
    executiveName
  );

  // 2. Retrieve memory contexts from database (top 15 by importance)
  let memoryContexts: any[] = [];
  if (includeMemory) {
    try {
      const { data: memories } = await supabase
        .from('memory_contexts')
        .select('*')
        .order('importance_score', { ascending: false })
        .limit(15);
      memoryContexts = memories || [];
      console.log(`📚 Retrieved ${memoryContexts.length} memory contexts for AI enrichment`);
    } catch (error) {
      console.warn('⚠️ Failed to retrieve memory contexts:', error);
    }
  }

  // 3. Retrieve conversation summaries (last 5)
  let conversationSummaries: any[] = [];
  if (sessionKey) {
    try {
      const { data: summaries } = await supabase
        .from('conversation_summaries')
        .select('*')
        .eq('session_id', sessionKey)
        .order('created_at', { ascending: false })
        .limit(5);
      conversationSummaries = summaries || [];
      console.log(`💬 Retrieved ${conversationSummaries.length} conversation summaries`);
    } catch (error) {
      console.warn('⚠️ Failed to retrieve conversation summaries:', error);
    }
  }

  // 4. Retrieve executive feedback for continuous learning
  let executiveFeedback: any[] = [];
  if (includeFeedback && executiveName) {
    try {
      const { data: feedback } = await supabase
        .from('executive_feedback')
        .select('*')
        .eq('executive_name', executiveName)
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(5);
      executiveFeedback = feedback || [];
      console.log(`📊 Retrieved ${executiveFeedback.length} pending feedback items`);
    } catch (error) {
      console.warn('⚠️ Failed to retrieve executive feedback:', error);
    }
  }

  // 5. Retrieve knowledge entities for domain expertise
  let knowledgeEntities: any[] = [];
  if (includeKnowledge) {
    try {
      const { data: entities } = await supabase
        .from('knowledge_entities')
        .select('*')
        .order('confidence_score', { ascending: false })
        .limit(20);
      knowledgeEntities = entities || [];
      console.log(`🧠 Retrieved ${knowledgeEntities.length} knowledge entities`);
    } catch (error) {
      console.warn('⚠️ Failed to retrieve knowledge entities:', error);
    }
  }

  // 6. Build the enriched contextual prompt
  const enrichedConversationHistory = {
    ...conversationHistory,
    summaries: conversationSummaries.map(s => ({
      summaryText: s.summary_text,
      messageCount: s.message_count
    })),
    memoryContexts: memoryContexts.map(m => ({
      contextType: m.context_type || 'general',
      content: m.content,
      importanceScore: m.importance_score || 0.5
    }))
  };

  let systemPrompt = await buildContextualPrompt(
    basePrompt,
    {
      conversationHistory: enrichedConversationHistory,
      userContext,
      miningStats,
      executiveName,
      memoryContexts: memoryContexts.map(m => ({
        contextType: m.context_type || 'general',
        content: m.content,
        importanceScore: m.importance_score || 0.5
      }))
    },
    supabase
  );

  // 7. Inject Edge Function Registry Awareness
  const functionSummary = EDGE_FUNCTIONS_REGISTRY.map(f => 
    `- ${f.name}: ${f.description.split(' - ')[0]} (Category: ${f.category})`
  ).join('\n');

  systemPrompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 ECOSYSTEM FUNCTION AWARENESS (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You have full awareness of all ${EDGE_FUNCTIONS_REGISTRY.length} Supabase Edge Functions in the XMRT ecosystem.
If a user request requires a capability not explicitly in your toolset, use 'call_edge_function' or 'invoke_edge_function' to call these:

${functionSummary}

To use any of these, call 'call_edge_function' with the function name and the required payload.
If you need more details on a function's schema, use 'search_edge_functions' or 'list_available_functions'.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  console.log(`✅ Built enriched Eliza context: ${systemPrompt.length} chars, ${ELIZA_TOOLS.length} tools`);

  return {
    systemPrompt,
    tools: ELIZA_TOOLS,
    memoryContexts,
    conversationSummaries,
    executiveFeedback,
    knowledgeEntities
  };
}

/**
 * Get just the essential context for lightweight operations
 * (system prompt + tools, no database queries)
 */
export function getBasicElizaContext(
  userContext?: any,
  miningStats?: any,
  executiveName: string = 'Chief Strategy Officer'
): { systemPrompt: string; tools: any[] } {
  const systemPrompt = generateElizaSystemPrompt(
    userContext,
    miningStats,
    null,
    'eliza',
    executiveName
  );

  return {
    systemPrompt,
    tools: ELIZA_TOOLS
  };
}

/**
 * Get the default Eliza tools (for fallback providers that don't pass tools)
 */
export function getElizaTools(): any[] {
  return ELIZA_TOOLS;
}

/**
 * Check if context is minimal (needs enrichment)
 */
export function isMinimalContext(systemPrompt?: string): boolean {
  if (!systemPrompt) return true;
  // The full Eliza prompt is ~5800 lines, if it's under 1000 chars it's minimal
  return systemPrompt.length < 1000;
}
