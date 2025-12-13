import { supabase } from '@/integrations/supabase/client';

export interface EnhancedMemory {
  id: string;
  userId: string;
  sessionId: string;
  content: string;
  contextType: string;
  importanceScore: number;
  timestamp: Date;
  embedding?: number[];
  metadata?: Record<string, any>;
}

export interface CodeSnippet {
  id: string;
  code: string;
  language: string;
  purpose: string;
  tags: string[];
  relatedMemories: string[];
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface GeneratedIdea {
  id: string;
  description: string;
  components: Array<{
    type: 'memory' | 'code' | 'pattern';
    id: string;
    snippet: string;
  }>;
  confidence: number;
  timestamp: Date;
}

export class EnhancedMemoryService {
  private static instance: EnhancedMemoryService;

  public static getInstance(): EnhancedMemoryService {
    if (!EnhancedMemoryService.instance) {
      EnhancedMemoryService.instance = new EnhancedMemoryService();
    }
    return EnhancedMemoryService.instance;
  }

  // Store memory and trigger vectorization
  public async storeMemory(
    userId: string,
    sessionId: string,
    content: string,
    contextType: string,
    importanceScore: number = 0.5,
    metadata?: Record<string, any>
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('memory_contexts')
        .insert({
          user_id: userId,
          session_id: sessionId,
          content,
          context_type: contextType,
          importance_score: importanceScore,
          metadata: metadata || {}
        })
        .select()
        .single();

      if (error) {
        console.error('Error storing memory:', error);
        return null;
      }

      // Trigger vectorization asynchronously
      if (data?.id) {
        this.vectorizeMemory(data.id, content, contextType);
      }

      return data?.id || null;
    } catch (error) {
      console.error('Failed to store memory:', error);
      return null;
    }
  }

  // Trigger vectorization for a memory
  private async vectorizeMemory(memoryId: string, content: string, contextType: string): Promise<void> {
    try {
      // Skip calling the edge function for empty content to avoid 400 errors
      if (!content || content.trim().length === 0) {
        console.log(`⏭️ Skipping vectorization for ${memoryId} - empty content`);
        return;
      }

      const { data, error } = await supabase.functions.invoke('vectorize-memory', {
        body: {
          memory_id: memoryId,
          content,
          context_type: contextType
        }
      });

      // Treat "skipped" responses from the edge function as non-fatal
      if (data && (data as any).skipped) {
        console.log(`⏭️ Vectorization skipped for ${memoryId}: ${(data as any).error || 'empty content'}`);
        return;
      }

      if (error) {
        console.error('Vectorization failed:', error);
      }
    } catch (error) {
      console.error('Vectorization failed:', error);
    }
  }

  // Semantic search across memories using embeddings
  public async semanticSearch(
    query: string,
    userId: string,
    limit: number = 10
  ): Promise<EnhancedMemory[]> {
    try {
      // Fallback to keyword search for now
      // TODO: Implement proper vector search when embedding generation is ready
      return this.keywordSearch(query, userId, limit);
    } catch (error) {
      console.error('Semantic search failed:', error);
      return this.keywordSearch(query, userId, limit);
    }
  }

  // Fallback keyword search
  private async keywordSearch(
    query: string,
    userId: string,
    limit: number
  ): Promise<EnhancedMemory[]> {
    try {
      const { data, error } = await supabase
        .from('memory_contexts')
        .select('*')
        .eq('user_id', userId)
        .or(`content.ilike.%${query}%,metadata->>tags.ilike.%${query}%`)
        .order('importance_score', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Keyword search error:', error);
        return [];
      }

      return this.mapToEnhancedMemory(data || []);
    } catch (error) {
      console.error('Keyword search failed:', error);
      return [];
    }
  }

  // Store code snippet as a memory
  public async storeCodeSnippet(
    userId: string,
    sessionId: string,
    snippet: CodeSnippet
  ): Promise<string | null> {
    const content = `[CODE: ${snippet.language}] ${snippet.purpose}\n\`\`\`${snippet.language}\n${snippet.code}\n\`\`\``;
    
    return this.storeMemory(
      userId,
      sessionId,
      content,
      'code_snippet',
      0.8, // Higher importance for code
      {
        language: snippet.language,
        purpose: snippet.purpose,
        tags: snippet.tags,
        relatedMemories: snippet.relatedMemories,
        codeType: 'snippet'
      }
    );
  }

  // Get all code snippets for pattern recognition
  public async getCodeSnippets(userId: string, limit: number = 50): Promise<CodeSnippet[]> {
    try {
      const { data, error } = await supabase
        .from('memory_contexts')
        .select('*')
        .eq('user_id', userId)
        .eq('context_type', 'code_snippet')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching code snippets:', error);
        return [];
      }

      return (data || []).map(item => {
        const meta = item.metadata as Record<string, any> || {};
        return {
          id: item.id,
          code: this.extractCodeFromContent(item.content),
          language: meta.language || 'unknown',
          purpose: meta.purpose || '',
          tags: meta.tags || [],
          relatedMemories: meta.relatedMemories || [],
          timestamp: new Date(item.timestamp),
          metadata: meta
        };
      });
    } catch (error) {
      console.error('Failed to get code snippets:', error);
      return [];
    }
  }

  // Generate spontaneous ideas by combining memories and code
  public async generateIdeas(
    userId: string,
    context?: string
  ): Promise<GeneratedIdea[]> {
    try {
      const ideas: GeneratedIdea[] = [];
      
      // Get recent memories
      const memories = context 
        ? await this.semanticSearch(context, userId, 5)
        : await this.getRecentMemories(userId, 10);
      
      // Get code snippets
      const codeSnippets = await this.getCodeSnippets(userId, 10);
      
      // Get interaction patterns
      const patterns = await this.getInteractionPatterns(userId, 5);

      // Randomly combine 2-3 elements to create ideas
      const numIdeas = Math.min(3, Math.floor(Math.random() * 5) + 1);
      
      for (let i = 0; i < numIdeas; i++) {
        const components: GeneratedIdea['components'] = [];
        
        // Add a random memory
        if (memories.length > 0) {
          const memory = memories[Math.floor(Math.random() * memories.length)];
          components.push({
            type: 'memory',
            id: memory.id,
            snippet: memory.content.substring(0, 100) + '...'
          });
        }
        
        // Add a random code snippet
        if (codeSnippets.length > 0) {
          const code = codeSnippets[Math.floor(Math.random() * codeSnippets.length)];
          components.push({
            type: 'code',
            id: code.id,
            snippet: `${code.language}: ${code.purpose}`
          });
        }
        
        // Maybe add a pattern
        if (patterns.length > 0 && Math.random() > 0.5) {
          const pattern = patterns[Math.floor(Math.random() * patterns.length)];
          components.push({
            type: 'pattern',
            id: pattern.id,
            snippet: pattern.pattern_name
          });
        }

        if (components.length >= 2) {
          ideas.push({
            id: crypto.randomUUID(),
            description: await this.synthesizeIdeaDescription(components),
            components,
            confidence: Math.random() * 0.3 + 0.7, // 0.7-1.0
            timestamp: new Date()
          });
        }
      }

      return ideas;
    } catch (error) {
      console.error('Failed to generate ideas:', error);
      return [];
    }
  }

  // Get recent memories
  private async getRecentMemories(userId: string, limit: number): Promise<EnhancedMemory[]> {
    try {
      const { data, error } = await supabase
        .from('memory_contexts')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) return [];
      return this.mapToEnhancedMemory(data || []);
    } catch {
      return [];
    }
  }

  // Get interaction patterns
  private async getInteractionPatterns(userId: string, limit: number): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('interaction_patterns')
        .select('*')
        .eq('session_key', `ip-${userId}`)
        .order('confidence_score', { ascending: false })
        .limit(limit);

      return data || [];
    } catch {
      return [];
    }
  }

  // Synthesize idea description from components
  private async synthesizeIdeaDescription(components: GeneratedIdea['components']): Promise<string> {
    const types = components.map(c => c.type).join(' + ');
    const snippets = components.map(c => c.snippet).join(' | ');
    
    return `Combine ${types}: ${snippets}`;
  }

  // Extract code from markdown content
  private extractCodeFromContent(content: string): string {
    const codeMatch = content.match(/```[\w]*\n([\s\S]*?)\n```/);
    return codeMatch ? codeMatch[1] : content;
  }

  // Map database records to EnhancedMemory
  private mapToEnhancedMemory(data: any[]): EnhancedMemory[] {
    return data.map(item => ({
      id: item.id,
      userId: item.user_id,
      sessionId: item.session_id,
      content: item.content,
      contextType: item.context_type,
      importanceScore: item.importance_score,
      timestamp: new Date(item.timestamp),
      embedding: item.embedding,
      metadata: item.metadata
    }));
  }

  // Get comprehensive memory context for a conversation
  public async getConversationMemoryContext(
    userId: string,
    currentQuery?: string,
    limit: number = 20
  ): Promise<{
    relevantMemories: EnhancedMemory[];
    codeSnippets: CodeSnippet[];
    spontaneousIdeas: GeneratedIdea[];
  }> {
    try {
      const relevantMemories = currentQuery
        ? await this.semanticSearch(currentQuery, userId, limit)
        : await this.getRecentMemories(userId, limit);

      const codeSnippets = await this.getCodeSnippets(userId, 10);
      const spontaneousIdeas = await this.generateIdeas(userId, currentQuery);

      return {
        relevantMemories,
        codeSnippets,
        spontaneousIdeas
      };
    } catch (error) {
      console.error('Failed to get conversation memory context:', error);
      return {
        relevantMemories: [],
        codeSnippets: [],
        spontaneousIdeas: []
      };
    }
  }
}

export const enhancedMemoryService = EnhancedMemoryService.getInstance();
