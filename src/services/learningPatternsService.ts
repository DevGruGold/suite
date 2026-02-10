import { supabase } from '@/integrations/supabase/client';
import { enhancedLearningService } from './enhancedLearningService';

export interface LearningPattern {
  id: string;
  patternType: string;
  patternData: Record<string, any>;
  confidenceScore: number;
  usageCount: number;
  lastUsed: Date;
}

export class LearningPatternsService {
  private static instance: LearningPatternsService;

  public static getInstance(): LearningPatternsService {
    if (!LearningPatternsService.instance) {
      LearningPatternsService.instance = new LearningPatternsService();
    }
    return LearningPatternsService.instance;
  }

  // Record a learning pattern
  public async recordPattern(
    patternType: string,
    patternData: Record<string, any>,
    confidenceScore: number = 0.5
  ): Promise<void> {
    try {
      // Check if pattern exists
      const { data: existing, error: fetchError } = await supabase
        .from('learning_patterns')
        .select('*')
        .eq('pattern_type', patternType)
        .maybeSingle();

      if (existing) {
        // Update existing pattern
        await supabase
          .from('learning_patterns')
          .update({
            pattern_data: patternData,
            usage_count: existing.usage_count + 1,
            confidence_score: Math.min(existing.confidence_score + 0.05, 1.0),
            last_used: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        // Create new pattern
        await supabase
          .from('learning_patterns')
          .insert({
            pattern_type: patternType,
            pattern_data: patternData,
            confidence_score: confidenceScore,
            usage_count: 1,
            last_used: new Date().toISOString()
          });
      }

      // Enhanced ML learning integration
      await enhancedLearningService.learnFromExperience({
        context: { pattern_type: patternType, pattern_data: patternData },
        action_taken: 'record_pattern',
        outcome: { success: true, performance: confidenceScore },
        reward: confidenceScore,
        confidence: confidenceScore
      }).catch(err => console.warn('Enhanced learning failed:', err));
    } catch (error) {
      console.error('Failed to record learning pattern:', error);
    }
  }

  // Get patterns by type
  public async getPatternsByType(patternType: string): Promise<LearningPattern[]> {
    try {
      const { data, error } = await supabase
        .from('learning_patterns')
        .select('*')
        .eq('pattern_type', patternType)
        .order('confidence_score', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching learning patterns:', error);
        return [];
      }

      return data?.map(pattern => ({
        id: pattern.id,
        patternType: pattern.pattern_type,
        patternData: pattern.pattern_data as Record<string, any>,
        confidenceScore: pattern.confidence_score,
        usageCount: pattern.usage_count,
        lastUsed: new Date(pattern.last_used)
      })) || [];
    } catch (error) {
      console.error('Failed to get patterns by type:', error);
      return [];
    }
  }

  // Get all high-confidence patterns
  public async getHighConfidencePatterns(minConfidence: number = 0.7): Promise<LearningPattern[]> {
    try {
      const { data, error } = await supabase
        .from('learning_patterns')
        .select('*')
        .gte('confidence_score', minConfidence)
        .order('confidence_score', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching high-confidence patterns:', error);
        return [];
      }

      return data?.map(pattern => ({
        id: pattern.id,
        patternType: pattern.pattern_type,
        patternData: pattern.pattern_data as Record<string, any>,
        confidenceScore: pattern.confidence_score,
        usageCount: pattern.usage_count,
        lastUsed: new Date(pattern.last_used)
      })) || [];
    } catch (error) {
      console.error('Failed to get high-confidence patterns:', error);
      return [];
    }
  }
}

export const learningPatternsService = LearningPatternsService.getInstance();
