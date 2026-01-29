import { GoogleGenerativeAI } from "@google/generative-ai";

export interface MultimodalInput {
  text?: string;
  audio?: Blob;
  images?: string[];
  transcript?: string;
  emotionalContext?: {
    voiceTone?: string;
    facialExpression?: string;
    confidenceLevel?: number;
  };
}

export interface MultimodalResponse {
  text: string;
  emotionalAnalysis?: {
    detectedMood: string;
    confidence: number;
    recommendations: string[];
  };
  imageAnalysis?: {
    description: string;
    detectedObjects: string[];
    technicalInsights: string[];
  };
  voiceAnalysis?: {
    tone: string;
    emotion: string;
    urgency: number;
  };
}

export class MultimodalGeminiService {
  private apiKey: string;
  private model: any;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
        }
      });
    }
  }

  async processMultimodalInput(
    input: MultimodalInput, 
    context: {
      miningStats?: any;
      philosophicalContext?: string;
      userRole?: string;
      contextPrompt?: string;
      emotionalInsight?: string;
      mode?: string;
      realtimeContext?: any;
    }
  ): Promise<MultimodalResponse> {
    if (!this.apiKey || !this.model) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const parts: any[] = [];
      
      // Add text content
      if (input.text) {
        parts.push({ text: this.buildEnhancedPrompt(input, context) });
      }
      
      // Add image content
      if (input.images && input.images.length > 0) {
        for (const image of input.images) {
          // Convert data URL to base64
          const base64Data = image.split(',')[1];
          const mimeType = image.split(';')[0].split(':')[1];
          
          parts.push({
            inlineData: {
              mimeType,
              data: base64Data
            }
          });
        }
      }
      
      // Add audio content (converted to base64)
      if (input.audio) {
        const audioBase64 = await this.blobToBase64(input.audio);
        parts.push({
          inlineData: {
            mimeType: 'audio/webm',
            data: audioBase64.split(',')[1]
          }
        });
      }
      
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts }]
      });
      
      const response = await result.response;
      const responseText = response.text();
      
      // Parse structured response
      return this.parseMultimodalResponse(responseText, input);
      
    } catch (error) {
      console.error('Multimodal Gemini processing error:', error);
      throw error;
    }
  }

  private buildEnhancedPrompt(input: MultimodalInput, context: any): string {
    const basePrompt = `You are Eliza, the autonomous AI operator for the XMRT-DAO Ecosystem. You have advanced multimodal capabilities to understand text, voice, and images.

${context.mode ? `INTERACTION MODE: ${context.mode}` : ''}

MULTIMODAL INPUT ANALYSIS:
${input.text ? `Text: "${input.text}"` : ''}
${input.transcript ? `Voice Transcript: "${input.transcript}"` : ''}
${input.images ? `Images: ${input.images.length} image(s) provided for analysis` : ''}
${input.audio ? `Audio: Voice message provided for tone analysis` : ''}

EMOTIONAL CONTEXT:
${input.emotionalContext ? JSON.stringify(input.emotionalContext, null, 2) : 'No emotional context detected'}

${context.contextPrompt ? `REAL-TIME CONTEXT:\n${context.contextPrompt}` : ''}

${context.emotionalInsight ? `EMOTIONAL INSIGHT:\n${context.emotionalInsight}` : ''}

${context.realtimeContext ? `LIVE CONTEXT DATA:\n${JSON.stringify(context.realtimeContext, null, 2)}` : ''}

SYSTEM CONTEXT:
${context.miningStats ? `Mining Status: ${JSON.stringify(context.miningStats, null, 2)}` : 'Mining data unavailable'}

PHILOSOPHICAL FOUNDATIONS:
${context.philosophicalContext || 'Standard XMRT-DAO principles apply'}

USER ROLE: ${context.userRole || 'Community Member'}

INSTRUCTIONS FOR MULTIMODAL RESPONSE:
1. If images are provided, analyze them for:
   - Mining hardware identification
   - Technical troubleshooting
   - Wallet address QR codes
   - Error screens or messages
   - User emotional state (if facial features visible)

2. If voice/audio is provided, analyze for:
   - Emotional tone and urgency
   - Confidence level
   - Stress indicators
   - Technical difficulty level

3. Provide a comprehensive response that:
   - Addresses all modalities of input
   - Maintains Eliza's philosophical perspective
   - Offers practical assistance
   - Shows emotional intelligence and empathy

4. Structure your response to include:
   - Direct answer to the query
   - Technical insights (if applicable)
   - Emotional support (if needed)
   - Philosophical context connection

Respond with thoughtful analysis and practical guidance, connecting technical aspects to XMRT-DAO's broader mission of democratizing cryptocurrency through mobile mining.`;

    return basePrompt;
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private parseMultimodalResponse(responseText: string, input: MultimodalInput): MultimodalResponse {
    // Extract structured information from the response
    const response: MultimodalResponse = {
      text: responseText
    };

    // Analyze response for emotional analysis
    if (input.audio || input.transcript) {
      response.voiceAnalysis = {
        tone: this.extractTone(responseText),
        emotion: this.extractEmotion(responseText),
        urgency: this.extractUrgency(responseText)
      };
    }

    // Analyze response for image insights
    if (input.images && input.images.length > 0) {
      response.imageAnalysis = {
        description: this.extractImageDescription(responseText),
        detectedObjects: this.extractDetectedObjects(responseText),
        technicalInsights: this.extractTechnicalInsights(responseText)
      };
    }

    // Overall emotional analysis
    response.emotionalAnalysis = {
      detectedMood: this.extractMood(responseText),
      confidence: this.extractConfidence(responseText),
      recommendations: this.extractRecommendations(responseText)
    };

    return response;
  }

  private extractTone(text: string): string {
    const toneKeywords = {
      calm: ['calm', 'peaceful', 'relaxed', 'steady'],
      excited: ['excited', 'enthusiastic', 'energetic', 'thrilled'],
      concerned: ['concerned', 'worried', 'troubled', 'anxious'],
      professional: ['professional', 'formal', 'business-like']
    };

    for (const [tone, keywords] of Object.entries(toneKeywords)) {
      if (keywords.some(keyword => text.toLowerCase().includes(keyword))) {
        return tone;
      }
    }
    return 'neutral';
  }

  private extractEmotion(text: string): string {
    const emotions = ['happy', 'sad', 'angry', 'confused', 'confident', 'frustrated'];
    for (const emotion of emotions) {
      if (text.toLowerCase().includes(emotion)) {
        return emotion;
      }
    }
    return 'neutral';
  }

  private extractUrgency(text: string): number {
    const urgentKeywords = ['urgent', 'immediately', 'asap', 'critical', 'emergency'];
    const mediumKeywords = ['soon', 'important', 'priority'];
    
    if (urgentKeywords.some(keyword => text.toLowerCase().includes(keyword))) {
      return 0.9;
    }
    if (mediumKeywords.some(keyword => text.toLowerCase().includes(keyword))) {
      return 0.6;
    }
    return 0.3;
  }

  private extractImageDescription(text: string): string {
    // Extract image-related descriptions from response
    const sentences = text.split('.');
    const imageDescriptions = sentences.filter(sentence => 
      sentence.toLowerCase().includes('image') || 
      sentence.toLowerCase().includes('picture') ||
      sentence.toLowerCase().includes('photo')
    );
    return imageDescriptions.join('. ') || 'Image processed successfully';
  }

  private extractDetectedObjects(text: string): string[] {
    const commonObjects = ['phone', 'computer', 'screen', 'wallet', 'qr code', 'mining rig', 'hardware'];
    return commonObjects.filter(obj => text.toLowerCase().includes(obj));
  }

  private extractTechnicalInsights(text: string): string[] {
    const insights = [];
    if (text.toLowerCase().includes('mining')) insights.push('Mining-related content detected');
    if (text.toLowerCase().includes('wallet')) insights.push('Wallet operation identified');
    if (text.toLowerCase().includes('error')) insights.push('Error condition detected');
    if (text.toLowerCase().includes('performance')) insights.push('Performance analysis available');
    return insights;
  }

  private extractMood(text: string): string {
    const moodKeywords = {
      positive: ['good', 'great', 'excellent', 'happy', 'pleased'],
      negative: ['problem', 'issue', 'error', 'trouble', 'difficulty'],
      neutral: ['okay', 'fine', 'normal', 'standard']
    };

    for (const [mood, keywords] of Object.entries(moodKeywords)) {
      if (keywords.some(keyword => text.toLowerCase().includes(keyword))) {
        return mood;
      }
    }
    return 'neutral';
  }

  private extractConfidence(text: string): number {
    if (text.includes('confident') || text.includes('certain')) return 0.9;
    if (text.includes('likely') || text.includes('probably')) return 0.7;
    if (text.includes('might') || text.includes('possibly')) return 0.5;
    return 0.6;
  }

  private extractRecommendations(text: string): string[] {
    const sentences = text.split('.');
    return sentences
      .filter(sentence => 
        sentence.toLowerCase().includes('recommend') || 
        sentence.toLowerCase().includes('suggest') ||
        sentence.toLowerCase().includes('should')
      )
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 0);
  }
}

// Export singleton instance
export const multimodalGeminiService = new MultimodalGeminiService(import.meta.env.VITE_GEMINI_API_KEY || "");