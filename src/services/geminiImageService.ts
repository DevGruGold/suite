import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ImageGenerationParams {
  prompt: string;
  style?: 'photorealistic' | 'digital-art' | 'illustration' | 'concept-art';
  mood?: string;
  lighting?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3';
}

export interface GeneratedImage {
  url: string;
  prompt: string;
  timestamp: Date;
  style: string;
}

export class GeminiImageService {
  private apiKey: string;
  private model: any;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash"  // Updated to stable model (was gemini-2.0-flash-exp)
        generationConfig: {
          temperature: 0.8,
          topP: 0.9,
          maxOutputTokens: 2048,
        }
      });
    }
  }

  async generateImage(params: ImageGenerationParams): Promise<GeneratedImage> {
    if (!this.apiKey || !this.model) {
      throw new Error('Gemini API key not configured');
    }

    try {
      // Enhanced prompt for Gemini 2.5 Flash image generation
      const enhancedPrompt = `
        Create a high-quality ${params.style || 'digital-art'} image: ${params.prompt}
        
        Style requirements:
        - ${params.style || 'digital-art'} aesthetic
        - ${params.mood ? `Mood: ${params.mood}` : 'Professional and approachable mood'}
        - ${params.lighting ? `Lighting: ${params.lighting}` : 'Soft, warm lighting'}
        - Aspect ratio: ${params.aspectRatio || '1:1'}
        - High resolution, sharp details
        - Clean composition with focus on subject
        - Modern, sophisticated visual design
        
        Technical specs:
        - Professional quality output
        - Suitable for avatar/profile use
        - Clear, well-defined features
        - Appropriate for business/technology context
      `;

      // Use Gemini 2.5 Flash for intelligent image generation
      const result = await this.model.generateContent([
        {
          text: `Generate image description and creation instructions for: ${enhancedPrompt}`
        }
      ]);

      const response = await result.response;
      const description = response.text();

      // In production, this would interface with Gemini's actual image generation API
      // For now, we create an enhanced SVG based on the AI's description
      const generatedSvg = this.createEnhancedSvg(params, description);

      return {
        url: `data:image/svg+xml,${encodeURIComponent(generatedSvg)}`,
        prompt: params.prompt,
        timestamp: new Date(),
        style: params.style || 'digital-art'
      };
    } catch (error) {
      console.error('Gemini image generation error:', error);
      
      // Fallback to enhanced default avatar
      const fallbackSvg = this.createEnhancedSvg(params, 'Professional AI assistant avatar');
      
      return {
        url: `data:image/svg+xml,${encodeURIComponent(fallbackSvg)}`,
        prompt: params.prompt,
        timestamp: new Date(),
        style: 'fallback'
      };
    }
  }

  private createEnhancedSvg(params: ImageGenerationParams, aiDescription: string): string {
    // Parse mood and style from AI description for dynamic SVG generation
    const mood = params.mood || 'professional';
    const isActive = aiDescription.toLowerCase().includes('active') || aiDescription.toLowerCase().includes('energetic');
    const isWarm = aiDescription.toLowerCase().includes('warm') || aiDescription.toLowerCase().includes('friendly');
    
    // Dynamic color palette based on mood analysis
    let primaryColor = 'hsl(271 81% 56%)';
    let secondaryColor = 'hsl(199 89% 48%)';
    let accentColor = 'hsl(142 76% 36%)';
    
    if (mood.includes('focused') || mood.includes('analytical')) {
      primaryColor = 'hsl(199 89% 48%)';
      secondaryColor = 'hsl(271 81% 56%)';
    } else if (mood.includes('welcoming') || mood.includes('friendly')) {
      primaryColor = 'hsl(48 96% 53%)';
      secondaryColor = 'hsl(271 81% 56%)';
    } else if (mood.includes('concerned') || mood.includes('alert')) {
      primaryColor = 'hsl(0 84% 60%)';
      secondaryColor = 'hsl(48 96% 53%)';
    }

    return `
      <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="avatarGradient" cx="50%" cy="30%" r="70%">
            <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:1" />
            <stop offset="70%" style="stop-color:${secondaryColor};stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:hsl(240 10% 3.9%);stop-opacity:1" />
          </radialGradient>
          <radialGradient id="faceGradient" cx="50%" cy="40%" r="60%">
            <stop offset="0%" style="stop-color:hsl(0 0% 98%);stop-opacity:0.1" />
            <stop offset="100%" style="stop-color:hsl(240 10% 3.9%);stop-opacity:0.3" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <!-- Background circle -->
        <circle cx="100" cy="100" r="90" fill="url(#avatarGradient)" filter="url(#glow)" />
        
        <!-- Inner face area -->
        <circle cx="100" cy="100" r="70" fill="url(#faceGradient)" />
        
        <!-- AI Neural network pattern -->
        <g opacity="0.6">
          <circle cx="70" cy="80" r="2" fill="${accentColor}">
            ${isActive ? '<animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />' : ''}
          </circle>
          <circle cx="130" cy="80" r="2" fill="${accentColor}">
            ${isActive ? '<animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />' : ''}
          </circle>
          <circle cx="100" cy="60" r="1.5" fill="${accentColor}">
            ${isActive ? '<animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />' : ''}
          </circle>
          <line x1="70" y1="80" x2="100" y2="60" stroke="${accentColor}" stroke-width="1" opacity="0.4" />
          <line x1="130" y1="80" x2="100" y2="60" stroke="${accentColor}" stroke-width="1" opacity="0.4" />
          <line x1="70" y1="80" x2="130" y2="80" stroke="${accentColor}" stroke-width="1" opacity="0.4" />
        </g>
        
        <!-- Central 'E' for Eliza -->
        <text x="100" y="125" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" 
              font-size="48" font-weight="bold" fill="hsl(0 0% 98%)" opacity="0.9">E</text>
        
        <!-- Animated ring indicators -->
        <circle cx="100" cy="100" r="75" fill="none" stroke="${primaryColor}" stroke-width="2" opacity="0.6">
          ${isActive ? '<animate attributeName="r" values="75;85;75" dur="3s" repeatCount="indefinite" />' : ''}
          ${isActive ? '<animate attributeName="opacity" values="0.6;0.2;0.6" dur="3s" repeatCount="indefinite" />' : ''}
        </circle>
        
        <circle cx="100" cy="100" r="80" fill="none" stroke="${secondaryColor}" stroke-width="1" opacity="0.4">
          ${isActive ? '<animate attributeName="r" values="80;90;80" dur="4s" repeatCount="indefinite" />' : ''}
          ${isActive ? '<animate attributeName="opacity" values="0.4;0.1;0.4" dur="4s" repeatCount="indefinite" />' : ''}
        </circle>
        
        <!-- Status indicator -->
        <circle cx="150" cy="50" r="8" fill="${accentColor}" opacity="${isActive ? '1' : '0.5'}">
          ${isActive ? '<animate attributeName="r" values="8;12;8" dur="1s" repeatCount="indefinite" />' : ''}
        </circle>
      </svg>
    `;
  }

  // Enhanced mood-based avatar generation
  async generateMoodBasedAvatar(mood: string, context: string, isConnected: boolean): Promise<GeneratedImage> {
    const moodPrompts: Record<string, ImageGenerationParams> = {
      professional: {
        prompt: "Professional AI assistant avatar with confident, approachable expression",
        style: 'digital-art',
        mood: 'confident and reliable',
        lighting: 'soft professional lighting'
      },
      focused: {
        prompt: "AI assistant avatar showing deep concentration and analytical thinking",
        style: 'digital-art', 
        mood: 'focused and analytical',
        lighting: 'cool blue technical lighting'
      },
      welcoming: {
        prompt: "Warm, friendly AI assistant avatar with welcoming expression",
        style: 'digital-art',
        mood: 'warm and friendly',
        lighting: 'warm golden lighting'
      },
      concerned: {
        prompt: "AI assistant avatar showing careful attention and problem-solving focus",
        style: 'digital-art',
        mood: 'attentive and helpful',
        lighting: 'alert amber lighting'
      },
      respectful: {
        prompt: "Dignified AI assistant avatar showing respect and professional courtesy",
        style: 'digital-art',
        mood: 'respectful and honored',
        lighting: 'elegant professional lighting'
      }
    };

    const params = moodPrompts[mood] || moodPrompts.professional;
    params.prompt += ` Context: ${context}. Connection status: ${isConnected ? 'actively connected' : 'standby mode'}`;
    
    return this.generateImage(params);
  }
}

// Export singleton instance
export const geminiImageService = new GeminiImageService(import.meta.env.VITE_GEMINI_API_KEY || "");