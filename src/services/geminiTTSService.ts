import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeminiTTSOptions {
  text: string;
  voiceId?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export class GeminiTTSService {
  private genAI: GoogleGenerativeAI | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private onSpeechEnd: (() => void) | null = null;

  constructor(apiKey: string) {
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  // Gemini doesn't have native TTS, so we'll use it to enhance Web Speech API
  async speakText(options: GeminiTTSOptions, onSpeechEnd?: () => void): Promise<void> {
    this.onSpeechEnd = onSpeechEnd;
    if (!this.genAI) {
      throw new Error('Gemini API not initialized');
    }

    try {
      // Use Gemini to optimize the text for better speech synthesis
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const optimizationPrompt = `
        Optimize this text for natural speech synthesis. Make it more conversational and add appropriate pauses with commas and periods. Keep the meaning exactly the same but make it flow better when spoken aloud:

        "${options.text}"

        Return only the optimized text, nothing else.
      `;

      const result = await model.generateContent(optimizationPrompt);
      const optimizedText = result.response.text().trim();

      // Use Web Speech API with the optimized text
      return this.speakWithWebSpeech({
        ...options,
        text: optimizedText
      });

    } catch (error) {
      console.warn('Gemini text optimization failed, using original text:', error);
      // Fallback to original text if Gemini fails
      return this.speakWithWebSpeech(options);
    }
  }

  private async speakWithWebSpeech(options: GeminiTTSOptions): Promise<void> {
    if (!('speechSynthesis' in window)) {
      throw new Error('Web Speech API not supported');
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(options.text);
      this.currentUtterance = utterance;
      
      // Configure voice settings
      utterance.rate = options.rate || 0.9;
      utterance.pitch = options.pitch || 1.0;
      utterance.volume = options.volume || 0.8;

      // Try to find a good voice
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Prefer female voices for Eliza
        const preferredVoice = voices.find(voice => 
          voice.name.toLowerCase().includes('female') || 
          voice.name.toLowerCase().includes('samantha') ||
          voice.name.toLowerCase().includes('allison') ||
          voice.name.toLowerCase().includes('karen') ||
          voice.name.toLowerCase().includes('zira')
        ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0];
        
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => {
        this.currentUtterance = null;
        this.onSpeechEnd?.();
        resolve();
      };
      
      utterance.onerror = (event) => {
        this.currentUtterance = null;
        this.onSpeechEnd?.();
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };
      
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  stopSpeaking(): void {
    if (this.currentUtterance) {
      window.speechSynthesis.cancel();
      this.currentUtterance = null;
      this.onSpeechEnd?.();
    }
  }

  isSpeaking(): boolean {
    return this.currentUtterance !== null && window.speechSynthesis.speaking;
  }

  static async create(): Promise<GeminiTTSService | null> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('VITE_GEMINI_API_KEY not found');
      return null;
    }
    return new GeminiTTSService(apiKey);
  }
}