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
      title: 'Chief Strategy Officer (CSO)', 
      icon: '🎯', 
      color: 'blue',
      specialty: 'Strategy & Tools',
      model: 'Lovable AI Gateway (Gemini 2.5 Flash)'
    },
    'deepseek-chat': { 
      title: 'Chief Technology Officer (CTO)', 
      icon: '💻', 
      color: 'purple',
      specialty: 'Code & Architecture',
      model: 'Lovable AI Gateway (Gemini 2.5 Flash)'
    },
    'gemini-chat': { 
      title: 'Chief Information Officer (CIO)', 
      icon: '👁️', 
      color: 'green',
      specialty: 'Vision & Multimodal',
      model: 'Lovable AI Gateway (Gemini 2.5 Pro)'
    },
    'openai-chat': { 
      title: 'Chief Analytics Officer (CAO)', 
      icon: '📊', 
      color: 'orange',
      specialty: 'Complex Reasoning',
      model: 'Lovable AI Gateway (Gemini 2.5 Flash)'
    },
    'coo-chat': { 
      title: 'Chief Operations Officer (COO)', 
      icon: '⚙️', 
      color: 'red',
      specialty: 'Operations & Agent Orchestration',
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
          const { data, error } = await supabase.functions.invoke(executive, {
            body: {
              messages: [{ role: 'user', content: userInput }],
              conversationHistory: context.conversationContext,
              userContext: context.userContext,
              miningStats: context.miningStats,
              emotionalContext: context.emotionalContext, // Pass real-time emotional data from Hume
              councilMode: true // Signal that this is a council deliberation
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
          
          // Validate we have a response
          if (!data || (!data.response && !data.content)) {
            throw new Error(`${executive} returned no response content`);
          }
          
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
        perspective: result.response || result.content || result.answer || 'No response provided',
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
**USER EMOTIONAL STATE (Real-time Hume AI Detection):**
- Primary emotion: ${context.emotionalContext.currentEmotion || 'Unknown'} (${Math.round((context.emotionalContext.emotionConfidence || 0) * 100)}% confidence)
- Voice emotions: ${context.emotionalContext.voiceEmotions?.slice(0, 3).map((e: any) => `${e.name} (${Math.round(e.score * 100)}%)`).join(', ') || 'Not available'}
- Facial expressions: ${context.emotionalContext.facialEmotions?.slice(0, 3).map((e: any) => `${e.name} (${Math.round(e.score * 100)}%)`).join(', ') || 'Not available'}

Consider the user's emotional state when synthesizing the response. If they appear frustrated, be more solution-focused. If excited, match their energy.
` : '';

    const synthesisPrompt = `You are facilitating an AI Executive Council meeting for XMRT DAO. 

The user asked: "${originalQuestion}"
${emotionalSection}
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
      // Use lovable-chat edge function for synthesis
      const { data, error } = await supabase.functions.invoke('lovable-chat', {
        body: {
          messages: [{ role: 'user', content: synthesisPrompt }],
          miningStats: context.miningStats,
          userContext: context.userContext
        }
      });

      if (error || !data?.success) {
        throw new Error(error?.message || 'Failed to synthesize council responses');
      }

      const synthesis = data.response || 'Unable to synthesize executive perspectives at this time.';
      
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
    
    // Operations/tasks/agents → COO
    if (/task|pipeline|agent|workload|operations|progress|checklist|stae/i.test(q)) {
      const coo = responses.find(r => r.executive === 'coo-chat');
      if (coo) return coo.executiveTitle;
    }
    
    // Code/technical → CTO
    if (/code|debug|technical|architecture|bug|syntax/i.test(q)) {
      const cto = responses.find(r => r.executive === 'deepseek-chat');
      if (cto) return cto.executiveTitle;
    }
    
    // Vision/image → CIO
    if (/image|visual|photo|picture|diagram/i.test(q)) {
      const cio = responses.find(r => r.executive === 'gemini-chat');
      if (cio) return cio.executiveTitle;
    }
    
    // Complex reasoning → CAO
    if (/analyze|forecast|predict|strategic|complex/i.test(q)) {
      const cao = responses.find(r => r.executive === 'openai-chat');
      if (cao) return cao.executiveTitle;
    }
    
    // Default to CSO or highest confidence
    const cso = responses.find(r => r.executive === 'vercel-ai-chat');
    if (cso) return cso.executiveTitle;
    
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
    console.log('📡 Production Mode: Fetching healthy executives for council...');
    
    try {
      // Fetch agent status from Supabase
      const { data: agents, error } = await supabase
        .from('agents')
        .select('id, status')
        .in('id', ['vercel-ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'coo-chat']);

      if (error) {
        console.error('❌ Error fetching agent status for council:', error);
        // Fallback to default list if database check fails
        return ['vercel-ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'coo-chat'];
      }

      // Filter for agents that are not in ERROR or OFFLINE status
      const healthyExecutives = agents
        ?.filter(agent => agent.status !== 'ERROR' && agent.status !== 'OFFLINE')
        .map(agent => agent.id) || [];

      if (healthyExecutives.length === 0) {
        console.warn('⚠️ No healthy executives found in database for council, using defaults');
        return ['vercel-ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'coo-chat'];
      }

      console.log(`✅ Found ${healthyExecutives.length} healthy council members:`, healthyExecutives);
      return healthyExecutives;
    } catch (err) {
      console.error('💥 Critical error in getHealthyExecutives for council:', err);
      return ['vercel-ai-chat', 'deepseek-chat', 'gemini-chat', 'openai-chat', 'coo-chat'];
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
