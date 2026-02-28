import { supabase } from '@/integrations/supabase/client';
import type { ElizaContext } from './unifiedElizaService';
import { retryWithBackoff } from '@/utils/retryHelper';

export interface ExecutiveResponse {
  executive: 'vercel-ai-chat' | 'deepseek-chat' | 'gemini-chat' | 'openai-chat' | 'coo-chat';
  executiveTitle: string;
  executiveIcon: string;
  executiveColor: string;
  perspective: string;
  confidence: number;
  reasoning?: string[];
  recommendedAction?: string;
  executionTimeMs?: number;
}

export interface CouncilDeliberation {
  responses: ExecutiveResponse[];
  synthesis: string;
  consensus: boolean;
  leadExecutive: string;
  dissentingOpinions?: string[];
  totalExecutionTimeMs: number;
}

/**
 * Executive Council Service
 * Orchestrates parallel deliberation among all AI executives
 */
class ExecutiveCouncilService {
  private executiveConfig = {
    'vercel-ai-chat': {
      title: 'Dr. Anya Sharma (CTO)',
      name: 'Dr. Anya Sharma',
      icon: '🧠',
      color: 'blue',
      specialty: 'AI Strategy & Technical Architecture',
      model: 'Google Gemini 2.5 Flash'
    },
    'deepseek-chat': {
      title: 'Mr. Omar Al-Farsi (CFO)',
      name: 'Mr. Omar Al-Farsi',
      icon: '💰',
      color: 'amber',
      specialty: 'Global Finance & Strategic Investment',
      model: 'DeepSeek R1'
    },
    'gemini-chat': {
      title: 'Ms. Isabella Rodriguez (CMO)',
      name: 'Ms. Isabella Rodriguez',
      icon: '🎨',
      color: 'pink',
      specialty: 'Brand Strategy & Viral Growth',
      model: 'Google Gemini 2.5 Pro'
    },
    'openai-chat': {
      title: 'Mr. Klaus Richter (COO)',
      name: 'Mr. Klaus Richter',
      icon: '⚙️',
      color: 'slate',
      specialty: 'Operational Excellence & Process Engineering',
      model: 'OpenAI GPT-4o'
    },
    'coo-chat': {
      title: 'Ms. Akari Tanaka (CPO)',
      name: 'Ms. Akari Tanaka',
      icon: '🌸',
      color: 'teal',
      specialty: 'Culture, Talent & Organizational Development',
      model: 'STAE-Integrated AI'
    }
  };

  /**
   * Initiate full council deliberation - all executives analyze in parallel
   */
  async deliberate(userInput: string, context: ElizaContext): Promise<CouncilDeliberation> {
    const startTime = Date.now();
    console.log('🏛️ Executive Council: Starting deliberation...');

    // Get all executives (prioritize healthy ones)
    const healthyExecs = await this.getHealthyExecutives();
    const allExecs: Array<'vercel-ai-chat' | 'deepseek-chat' | 'gemini-chat' | 'openai-chat' | 'coo-chat'> =
      ['vercel-ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'coo-chat'];
    const executives = allExecs.filter(exec => healthyExecs.includes(exec));

    if (executives.length === 0) {
      console.warn('⚠️ No healthy executives available, falling back to Lovable AI Gateway');
      return this.generateFallbackResponse(userInput, context, startTime);
    }

    console.log(`🎯 Consulting ${executives.length} executives in parallel:`, executives);

    // Dispatch to all executives in parallel
    const executivePromises = executives.map(exec =>
      this.getExecutivePerspective(exec, userInput, context)
    );

    const results = await Promise.allSettled(executivePromises);
    const successfulResponses = results
      .filter((r): r is PromiseFulfilledResult<ExecutiveResponse> => r.status === 'fulfilled')
      .map(r => r.value);

    console.log(`✅ ${successfulResponses.length}/${executives.length} executives responded successfully`);

    // If we have multiple perspectives, synthesize them
    if (successfulResponses.length > 1) {
      const synthesis = await this.synthesizePerspectives(successfulResponses, userInput, context);
      return {
        ...synthesis,
        totalExecutionTimeMs: Date.now() - startTime
      };
    }

    // Fallback to single executive if only one succeeded
    if (successfulResponses.length === 1) {
      return {
        responses: successfulResponses,
        synthesis: successfulResponses[0].perspective,
        consensus: true,
        leadExecutive: successfulResponses[0].executive,
        totalExecutionTimeMs: Date.now() - startTime
      };
    }

    // Final fallback to Lovable AI Gateway
    return this.generateFallbackResponse(userInput, context, startTime);
  }

  /**
   * Get perspective from a specific executive with retry logic
   */
  private async getExecutivePerspective(
    executive: 'vercel-ai-chat' | 'deepseek-chat' | 'gemini-chat' | 'openai-chat' | 'coo-chat',
    userInput: string,
    context: ElizaContext
  ): Promise<ExecutiveResponse> {
    const startTime = Date.now();
    const config = this.executiveConfig[executive];

    console.log(`📡 Executive Council: Calling ${config.title} (${executive})...`);
    console.log(`📦 Sending context:`, {
      hasMessages: true,
      hasMiningStats: !!context.miningStats,
      hasUserContext: !!context.userContext,
      hasConversationContext: !!context.conversationContext,
      councilMode: true
    });

    try {
      // Use retry logic with exponential backoff
      const result = await retryWithBackoff(
        async () => {
          console.log(`🔄 Invoking ${executive} edge function...`);
          // Call each executive's own dedicated function — their own system prompt
          // defines their persona. Do NOT route through ai-chat (that replaces Eliza).
          const { data, error } = await supabase.functions.invoke(executive, {
            body: {
              messages: [{ role: 'user', content: userInput }],
              conversationHistory: context.conversationContext,
              userContext: context.userContext,
              miningStats: context.miningStats,
              emotionalContext: context.emotionalContext,
              organizationContext: context.organizationContext,
              councilMode: true
            }
          });

          if (error) {
            console.error(`❌ ${executive} returned error:`, error);
            throw new Error(`${executive} error: ${error.message || JSON.stringify(error)}`);
          }

          console.log(`📥 ${executive} returned data:`, {
            hasResponse: !!data?.response,
            hasContent: !!data?.content,
            dataKeys: Object.keys(data || {}),
            success: data?.success,
            actualResponse: data?.response?.substring(0, 100) // Log first 100 chars
          });

          // Extract content from any possible response field format
          const responseText =
            data?.response ||
            data?.content ||
            data?.choices?.[0]?.message?.content ||
            data?.message ||
            data?.text ||
            (typeof data === 'string' ? data : null);

          if (!data || !responseText) {
            throw new Error(`${executive} returned no response content (keys: ${Object.keys(data || {}).join(', ')})`);
          }

          // Attach extracted text for easy access downstream
          data._extractedContent = responseText;

          return data;
        },
        {
          maxAttempts: 2, // Reduced to 2 for faster council response
          initialDelayMs: 500,
          timeoutMs: 20000 // Increased to 20 second timeout per attempt
        }
      );

      const executionTime = Date.now() - startTime;
      console.log(`✅ ${config.title} responded in ${executionTime}ms`);

      return {
        executive,
        executiveTitle: config.title,
        executiveIcon: config.icon,
        executiveColor: config.color,
        perspective: result._extractedContent ||
          result.response || result.content ||
          result.choices?.[0]?.message?.content ||
          result.message || result.text || 'No response provided',
        confidence: result.confidence || 85,
        reasoning: result.reasoning || [],
        executionTimeMs: executionTime
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ ${config.title} (${executive}) failed after retries:`, errorMsg);
      console.error(`❌ Full error:`, error);
      throw new Error(`${config.title} unavailable: ${errorMsg}`);
    }
  }

  /**
   * Synthesize multiple executive perspectives into unified response
   */
  private async synthesizePerspectives(
    responses: ExecutiveResponse[],
    originalQuestion: string,
    context: ElizaContext
  ): Promise<Omit<CouncilDeliberation, 'totalExecutionTimeMs'>> {
    console.log('🔄 Synthesizing perspectives from', responses.length, 'executives...');

    // Build emotional context section if available
    const emotionalSection = context.emotionalContext ? `
**USER EMOTIONAL STATE (Real-time Emotion Detection):**
- Primary emotion: ${context.emotionalContext.currentEmotion || 'Unknown'} (${Math.round((context.emotionalContext.emotionConfidence || 0) * 100)}% confidence)
- Voice emotions: ${context.emotionalContext.voiceEmotions?.slice(0, 3).map((e: any) => `${e.name} (${Math.round(e.score * 100)}%)`).join(', ') || 'Not available'}
- Facial expressions: ${context.emotionalContext.facialEmotions?.slice(0, 3).map((e: any) => `${e.name} (${Math.round(e.score * 100)}%)`).join(', ') || 'Not available'}

Consider the user's emotional state when synthesizing the response. If they appear frustrated, be more solution-focused. If excited, match their energy.
` : '';

    const synthesisPrompt = `You are facilitating the XMRT-DAO Executive Council meeting. The 5 executives are: Dr. Anya Sharma (CTO), Mr. Omar Al-Farsi (CFO), Ms. Isabella "Bella" Rodriguez (CMO), Mr. Klaus Richter (COO), and Ms. Akari Tanaka (CPO). 

	The user asked: "${originalQuestion}"
	${emotionalSection}
	${context.organizationContext ? `
**ORGANIZATION CONTEXT:**
- Name: ${context.organizationContext.name}
- Website: ${context.organizationContext.website || 'N/A'}
- GitHub: ${context.organizationContext.github_repo || 'N/A'}
- MCP Server: ${context.organizationContext.mcp_server_address || 'N/A'}

Focus your analysis on information related to this business.
` : ''}
	Here are the perspectives from the different C-suite executives:

${responses.map(r => `
**${r.executiveTitle}** (${r.executiveIcon}):
${r.perspective}
Confidence: ${r.confidence}%
Response Time: ${r.executionTimeMs}ms
`).join('\n---\n')}

Your task as the council moderator:
1. Identify areas where executives agree (consensus)
2. Highlight valuable differing viewpoints or debates
3. Synthesize a unified, actionable recommendation
4. Determine which executive's perspective should lead for this specific question
5. If emotional context is available, ensure the response tone is appropriate

Format your response EXACTLY as:
**Consensus Areas:**
[bullet points of agreement]

**Key Debates:**
[any disagreements with executive names]

**Unified Recommendation:**
[clear, actionable synthesis combining best insights]

**Lead Executive:** [which executive's perspective is most relevant for this question]
`;

    try {
      // Use ai-chat for synthesis — WITHOUT systemPrompt override (that replaces Eliza)
      // Council context is embedded in the synthesisPrompt message itself
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: [{ role: 'user', content: synthesisPrompt }],
          miningStats: context.miningStats,
          userContext: context.userContext
        }
      });

      if (error) {
        throw new Error(error?.message || 'Failed to synthesize council responses');
      }

      // ai-chat returns content in various fields — extract whichever is present
      const synthesis =
        data?.response ||
        data?.content ||
        data?.choices?.[0]?.message?.content ||
        data?.message ||
        data?.text ||
        null;

      if (!synthesis) {
        throw new Error('ai-chat synthesis returned no content');
      }

      return {
        responses,
        synthesis,
        consensus: this.detectConsensus(responses),
        leadExecutive: this.selectLeadExecutive(responses, originalQuestion),
        dissentingOpinions: this.extractDissent(responses)
      };
    } catch (error) {
      console.error('❌ Failed to synthesize with Lovable AI Gateway:', error);

      // Fallback: simple concatenation
      return {
        responses,
        synthesis: this.simpleSynthesis(responses),
        consensus: true,
        leadExecutive: responses[0].executive
      };
    }
  }

  /**
   * Simple synthesis fallback if Lovable AI Gateway fails
   */
  private simpleSynthesis(responses: ExecutiveResponse[]): string {
    return `**Executive Council Summary**\n\n${responses.map(r =>
      `**${r.executiveIcon} ${r.executiveTitle}:**\n${r.perspective}\n`
    ).join('\n---\n')}`;
  }

  /**
   * Detect if executives reached consensus
   */
  private detectConsensus(responses: ExecutiveResponse[]): boolean {
    if (responses.length < 2) return true;

    // Simple heuristic: if all confidence scores are above 70%, likely consensus
    const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;
    return avgConfidence > 70;
  }

  /**
   * Select which executive should lead based on question type
   */
  private selectLeadExecutive(responses: ExecutiveResponse[], question: string): string {
    const q = question.toLowerCase();

    // Technical / code / AI / infrastructure → Dr. Anya Sharma (CTO)
    if (/code|debug|technical|architect|bug|syntax|deploy|api|function|edge.?function|ml|ai.model|infra|security.vuln/i.test(q)) {
      const exec = responses.find(r => r.executive === 'vercel-ai-chat');
      if (exec) return exec.executiveTitle;
    }

    // Finance / budget / treasury / tokenomics → Mr. Omar Al-Farsi (CFO)
    if (/financ|budget|treasury|invest|revenue|cost|token|economic|fiscal|payment|earn/i.test(q)) {
      const exec = responses.find(r => r.executive === 'deepseek-chat');
      if (exec) return exec.executiveTitle;
    }

    // Marketing / brand / content / community → Ms. Isabella Rodriguez (CMO)
    if (/market|brand|content|social|media|campaign|viral|audience|growth.hack|announcement/i.test(q)) {
      const exec = responses.find(r => r.executive === 'gemini-chat');
      if (exec) return exec.executiveTitle;
    }

    // Operations / tasks / agents / analytics → Mr. Klaus Richter (COO)
    if (/operat|task|pipeline|agent.work|stae|process|analytic|report|metric|orchestrat|workflow/i.test(q)) {
      const exec = responses.find(r => r.executive === 'openai-chat');
      if (exec) return exec.executiveTitle;
    }

    // People / culture / HR / onboarding / knowledge → Ms. Akari Tanaka (CPO)
    if (/people|culture|hr|onboard|train|knowledge|governance|inclusion|talent|mentor/i.test(q)) {
      const exec = responses.find(r => r.executive === 'coo-chat');
      if (exec) return exec.executiveTitle;
    }

    // Default to Dr. Anya Sharma (CTO) as technical org leader
    const anya = responses.find(r => r.executive === 'vercel-ai-chat');
    if (anya) return anya.executiveTitle;

    // Fallback to highest confidence
    const sorted = [...responses].sort((a, b) => b.confidence - a.confidence);
    return sorted[0].executiveTitle;
  }

  /**
   * Extract dissenting opinions
   */
  private extractDissent(responses: ExecutiveResponse[]): string[] | undefined {
    if (responses.length < 2) return undefined;

    // Check for low confidence responses (potential dissent)
    const lowConfidence = responses.filter(r => r.confidence < 60);
    if (lowConfidence.length > 0) {
      return lowConfidence.map(r =>
        `${r.executiveTitle} expressed lower confidence (${r.confidence}%)`
      );
    }

    return undefined;
  }

  /**
   * Get healthy executives by checking their status from the backend
   * Transitioned to Production Health Checks
   */
  private async getHealthyExecutives(): Promise<string[]> {
    const ALL_FIVE = ['vercel-ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'coo-chat'];
    console.log('📡 Fetching council executive status...');

    try {
      const { data: agents, error } = await supabase
        .from('agents')
        .select('id, status')
        .in('id', ALL_FIVE);

      if (error) {
        console.warn('⚠️ DB status check failed — defaulting to all 5 executives:', error);
        return ALL_FIVE;
      }

      // Log status for visibility but ALWAYS include all 5 council members.
      // We never filter out any of the 5 based on DB status — the DB may be stale.
      // Each individual call will handle its own failure via retryWithBackoff.
      agents?.forEach(a => console.log(`  ${a.id}: ${a.status}`));

      console.log('✅ Returning all 5 council members regardless of DB status');
      return ALL_FIVE;
    } catch (err) {
      console.error('💥 getHealthyExecutives error — defaulting to all 5:', err);
      return ALL_FIVE;
    }
  }

  /**
   * Generate fallback response using Lovable AI Gateway
   */
  private async generateFallbackResponse(
    userInput: string,
    context: ElizaContext,
    startTime: number
  ): Promise<CouncilDeliberation> {
    console.log('🌐 Falling back to lovable-chat edge function for council response...');

    try {
      // Use lovable-chat edge function for fallback
      const { data, error } = await supabase.functions.invoke('lovable-chat', {
        body: {
          messages: [{ role: 'user', content: userInput }],
          miningStats: context.miningStats,
          userContext: context.userContext
        }
      });

      if (error || !data?.success) {
        throw new Error(error?.message || 'Lovable AI Gateway unavailable');
      }

      const response = data.response || 'Unable to generate response at this time.';

      return {
        responses: [{
          executive: 'vercel-ai-chat',
          executiveTitle: 'Lovable AI Gateway (Gemini 2.5 Flash)',
          executiveIcon: '🌐',
          executiveColor: 'cyan',
          perspective: response,
          confidence: 80,
          executionTimeMs: Date.now() - startTime
        }],
        synthesis: response,
        consensus: true,
        leadExecutive: 'Lovable AI Gateway',
        totalExecutionTimeMs: Date.now() - startTime
      };
    } catch (error) {
      console.error('❌ Lovable AI Gateway fallback failed:', error);
      throw error;
    }
  }

  /**
   * COMMUNITY IDEA EVALUATION
   * Evaluate a community idea with full council deliberation
   */
  async evaluateCommunityIdea(ideaId: string): Promise<{
    approved: boolean;
    avgScore: number;
    councilPerspectives: any;
  }> {
    console.log(`🏛️ Executive Council: Evaluating community idea ${ideaId}...`);

    try {
      const { data, error } = await supabase.functions.invoke('evaluate-community-idea', {
        body: { ideaId, action: 'evaluate_single' }
      });

      if (error) throw error;

      console.log(`✅ Idea evaluation complete: ${data.approved ? 'APPROVED' : 'REJECTED'} (${data.avgScore}/100)`);

      return data;
    } catch (error) {
      console.error('❌ Failed to evaluate community idea:', error);
      throw error;
    }
  }

  /**
   * IMPLEMENTATION APPROVAL
   * Approve an idea for implementation and create tasks
   */
  async approveImplementation(ideaId: string, plan: any): Promise<{ taskId: string }> {
    console.log(`✅ Executive Council: Approving implementation for idea ${ideaId}...`);

    try {
      // Create implementation task  
      const taskId = crypto.randomUUID();
      const taskTitle = `Implement Community Idea: ${plan.title || ideaId}`;
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert([{
          id: taskId,
          title: taskTitle,
          description: `Community-approved idea implementation`,
          status: 'PENDING',
          priority: plan.avgScore >= 80 ? 9 : plan.avgScore >= 70 ? 7 : 5,
          category: 'other',
          stage: 'PLAN',
          repo: 'XMRT-Ecosystem',
          metadata: {
            idea_id: ideaId,
            implementation_plan: plan,
            is_community_idea: true
          }
        }])
        .select()
        .single();

      if (taskError) throw taskError;

      // Update idea status
      await supabase
        .from('community_ideas')
        .update({
          assigned_agent_id: task.id,
          implementation_started_at: new Date().toISOString()
        })
        .eq('id', ideaId);

      console.log(`✅ Implementation task created: ${task.id}`);

      return { taskId: task.id };
    } catch (error) {
      console.error('❌ Failed to approve implementation:', error);
      throw error;
    }
  }
}

export const executiveCouncilService = new ExecutiveCouncilService();
