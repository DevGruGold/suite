import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/integrations/supabase/client';

export interface ConversationSummary {
  id: string;
  sessionId: string;
  summaryText: string;
  messageCount: number;
  startMessageId?: string;
  endMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export class ConversationSummarizationService {
  private static instance: ConversationSummarizationService;
  private genAI: GoogleGenerativeAI;

  private constructor() {
    // Use the same API key as other Gemini services
    this.genAI = new GoogleGenerativeAI('AIzaSyB3jfxdMQzPpIb5MNfT8DtP5MOvT_Sp7qk');
  }

  public static getInstance(): ConversationSummarizationService {
    if (!ConversationSummarizationService.instance) {
      ConversationSummarizationService.instance = new ConversationSummarizationService();
    }
    return ConversationSummarizationService.instance;
  }

  // Generate summary of conversation messages using Gemini AI
  public async generateSummary(messages: Array<{
    content: string;
    sender: 'user' | 'assistant';
    timestamp: Date;
  }>): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      // Format messages for summarization
      const conversationText = messages.map(msg => 
        `${msg.sender === 'user' ? 'User' : 'Eliza'}: ${msg.content}`
      ).join('\n');

      const prompt = `Analyze this conversation between a user and Eliza (XMRT-DAO AI assistant) and provide a STRUCTURED, DETAILED summary.

Format your response as:

**Key Topics:**
- [List main discussion topics]

**Important Decisions & Actions:**
- [List any decisions made, action items, or commitments]

**User Preferences & Context:**
- [User's communication style, technical level, stated preferences]
- [Specific interests in XMRT mining, DAO governance, or technical features]

**Technical Details Discussed:**
- [Specific commands, configurations, or technical information shared]

**Ongoing Context to Remember:**
- [Unresolved issues, pending questions, or continued threads]

Conversation:
${conversationText}

Provide a comprehensive, structured summary:`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      return response.text() || 'Conversation summary unavailable';
    } catch (error) {
      console.error('Failed to generate conversation summary:', error);
      // Fallback to simple summary
      return `Conversation with ${messages.length} messages between user and Eliza about XMRT-DAO topics.`;
    }
  }

  // Store a conversation summary in the database
  public async storeSummary(
    sessionId: string,
    summaryText: string,
    messageCount: number,
    startMessageId?: string,
    endMessageId?: string,
    metadata?: Record<string, any>
  ): Promise<ConversationSummary | null> {
    try {
      const { data, error } = await supabase
        .from('conversation_summaries')
        .insert({
          session_id: sessionId,
          summary_text: summaryText,
          message_count: messageCount,
          start_message_id: startMessageId,
          end_message_id: endMessageId,
          metadata: metadata || {}
        })
        .select()
        .single();

      if (error) {
        console.error('Error storing conversation summary:', error);
        return null;
      }

      return {
        id: data.id,
        sessionId: data.session_id,
        summaryText: data.summary_text,
        messageCount: data.message_count,
        startMessageId: data.start_message_id,
        endMessageId: data.end_message_id,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        metadata: data.metadata as Record<string, any>
      };
    } catch (error) {
      console.error('Failed to store conversation summary:', error);
      return null;
    }
  }

  // Get the latest summary for a session
  public async getLatestSummary(sessionId: string): Promise<ConversationSummary | null> {
    try {
      const { data, error } = await supabase
        .from('conversation_summaries')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching latest summary:', error);
        return null;
      }

      if (!data) return null;

      return {
        id: data.id,
        sessionId: data.session_id,
        summaryText: data.summary_text,
        messageCount: data.message_count,
        startMessageId: data.start_message_id,
        endMessageId: data.end_message_id,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        metadata: data.metadata as Record<string, any>
      };
    } catch (error) {
      console.error('Failed to get latest summary:', error);
      return null;
    }
  }

  // Get all summaries for a session
  public async getSessionSummaries(sessionId: string): Promise<ConversationSummary[]> {
    try {
      const { data, error } = await supabase
        .from('conversation_summaries')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching session summaries:', error);
        return [];
      }

      return data?.map(summary => ({
        id: summary.id,
        sessionId: summary.session_id,
        summaryText: summary.summary_text,
        messageCount: summary.message_count,
        startMessageId: summary.start_message_id,
        endMessageId: summary.end_message_id,
        createdAt: new Date(summary.created_at),
        updatedAt: new Date(summary.updated_at),
        metadata: summary.metadata as Record<string, any>
      })) || [];
    } catch (error) {
      console.error('Failed to get session summaries:', error);
      return [];
    }
  }

  // Check if summarization is needed (every 15 messages)
  public shouldSummarize(messageCount: number, lastSummaryMessageCount: number = 0): boolean {
    const messagesSinceLastSummary = messageCount - lastSummaryMessageCount;
    return messagesSinceLastSummary >= 15;
  }
}

export const conversationSummarization = ConversationSummarizationService.getInstance();