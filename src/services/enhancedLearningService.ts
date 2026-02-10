import { supabase } from "@/integrations/supabase/client";

export interface LearningExperience {
  timestamp?: string;
  context: Record<string, any>;
  action_taken: string;
  outcome: Record<string, any>;
  reward: number;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface LearningAnalytics {
  total_experiences: number;
  learning_iteration: number;
  current_optimizer: string;
  performance_trend: {
    mean: number;
    std: number;
    min: number;
    max: number;
  };
  confidence_trend: {
    mean: number;
    std: number;
  };
  rl_agent_stats: {
    policy_strength: number;
    epsilon: number;
  };
}

class EnhancedLearningService {
  private static instance: EnhancedLearningService;

  private constructor() { }

  static getInstance(): EnhancedLearningService {
    if (!EnhancedLearningService.instance) {
      EnhancedLearningService.instance = new EnhancedLearningService();
    }
    return EnhancedLearningService.instance;
  }

  async learnFromExperience(experience: LearningExperience): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-learning', {
        body: {
          action: 'learn',
          experience: {
            ...experience,
            timestamp: (experience.timestamp && experience.timestamp !== 'undefined')
              ? experience.timestamp
              : new Date().toISOString()
          }
        }
      });

      if (error) throw error;

      console.log('Enhanced learning result:', data);
      return data?.result;
    } catch (error) {
      console.error('Enhanced learning failed:', error);
      throw error;
    }
  }

  async getAnalytics(): Promise<LearningAnalytics> {
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-learning', {
        body: {
          action: 'analytics'
        }
      });

      if (error) throw error;

      return data?.result as LearningAnalytics;
    } catch (error) {
      console.error('Failed to get learning analytics:', error);
      throw error;
    }
  }

  async recordInteractionExperience(
    userInput: string,
    response: string,
    context: Record<string, any>,
    success: boolean
  ): Promise<void> {
    const experience: LearningExperience = {
      context: {
        user_input: userInput,
        response_generated: response,
        ...context
      },
      action_taken: 'generate_response',
      outcome: {
        success,
        performance: success ? 1.0 : 0.5,
        response_length: response.length
      },
      reward: success ? 1.0 : 0.0,
      confidence: context.confidence || 0.7
    };

    await this.learnFromExperience(experience);
  }

  async recordTaskExperience(
    taskType: string,
    taskData: Record<string, any>,
    outcome: Record<string, any>,
    performance: number
  ): Promise<void> {
    const experience: LearningExperience = {
      context: {
        task_type: taskType,
        task_data: taskData
      },
      action_taken: taskType,
      outcome: {
        ...outcome,
        performance
      },
      reward: performance,
      confidence: outcome.confidence || 0.75
    };

    await this.learnFromExperience(experience);
  }
}

export const enhancedLearningService = EnhancedLearningService.getInstance();
