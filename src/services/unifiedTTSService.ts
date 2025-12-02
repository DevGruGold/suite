import { speechLearningService } from './speechLearningService';

export interface UnifiedTTSOptions {
  text: string;
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number;
  language?: 'en' | 'es';
}

/**
 * Browser-Only TTS Service
 * 
 * Uses Web Speech API exclusively - works in all modern browsers, online and offline.
 * No external dependencies, no API calls, no costs, 100% reliable.
 */
export class UnifiedTTSService {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private onSpeechEnd: (() => void) | null = null;
  private audioContext: AudioContext | null = null;
  private isInitialized = false;
  private voicesLoaded = false;
  private speechQueue: Array<{ text: string; options: UnifiedTTSOptions; onEnd?: () => void }> = [];
  private isProcessingQueue = false;

  private sanitizeTextForSpeech(text: string): string {
    return text
      // Remove markdown formatting
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** → bold
      .replace(/\*([^*]+)\*/g, '$1')      // *italic* → italic
      .replace(/__([^_]+)__/g, '$1')      // __bold__ → bold
      .replace(/_([^_]+)_/g, '$1')        // _italic_ → italic
      .replace(/~~([^~]+)~~/g, '$1')      // ~~strike~~ → strike
      
      // Remove code blocks and inline code
      .replace(/```[\s\S]*?```/g, '')     // ```code blocks```
      .replace(/`([^`]+)`/g, '$1')        // `code` → code
      
      // Remove emojis and special unicode characters
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // Emojis
      .replace(/[\u{2600}-\u{26FF}]/gu, '')    // Misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '')    // Dingbats
      .replace(/✅|❌|⚠️|🔧|💡|📊|🔍|⛏️|🚀|🔔/g, '') // Common status symbols
      
      // Remove markdown lists and bullets
      .replace(/^\s*[-*+]\s+/gm, '')      // - list items
      .replace(/^\s*\d+\.\s+/gm, '')      // 1. numbered lists
      
      // Remove URLs
      .replace(/https?:\/\/[^\s]+/g, '')
      
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create audio context for mobile compatibility
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume audio context (required for mobile browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Load voices immediately
      await this.loadVoices();
      
      this.isInitialized = true;
      console.log('✅ Browser TTS initialized with', window.speechSynthesis.getVoices().length, 'voices');
    } catch (error) {
      console.warn('Failed to initialize audio context:', error);
      this.isInitialized = true;
    }
  }

  async speakText(options: UnifiedTTSOptions, onSpeechEnd?: () => void): Promise<{ success: boolean; method: string }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Ensure audio context is resumed
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Add to queue instead of interrupting
    return new Promise((resolve) => {
      this.speechQueue.push({
        text: options.text,
        options,
        onEnd: () => {
          onSpeechEnd?.();
          resolve({ success: true, method: 'Web Speech API' });
        }
      });
      
      // Start processing queue if not already processing
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.speechQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;
    const item = this.speechQueue.shift();
    
    if (!item) {
      this.isProcessingQueue = false;
      return;
    }

    try {
      await this.speakWithWebSpeech(item.options, item.onEnd);
    } catch (error) {
      console.error('❌ Web Speech API failed:', error);
      item.onEnd?.();
    }

    // Process next item in queue
    this.processQueue();
  }

  private async speakWithWebSpeech(options: UnifiedTTSOptions, onComplete?: () => void): Promise<void> {
    if (!('speechSynthesis' in window)) {
      throw new Error('Web Speech API not supported in this browser');
    }

    // Ensure voices are loaded
    if (!this.voicesLoaded) {
      await this.loadVoices();
    }

    // Apply learned preferences
    const { text: modifiedText, rate: learnedRate } = speechLearningService.applyPreferences(options.text);
    const sanitizedText = this.sanitizeTextForSpeech(modifiedText);

    // Check for empty text after sanitization
    if (!sanitizedText || sanitizedText.trim().length === 0) {
      console.warn('⚠️ Text empty after sanitization, skipping speech');
      onComplete?.();
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        const utterance = new SpeechSynthesisUtterance(sanitizedText);
        this.currentUtterance = utterance;
        
        // Configure voice settings with learned preferences
        utterance.rate = options.speed || learnedRate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Select best voice with improved fallback
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const lang = options.language || 'en';
          const langPrefix = lang === 'es' ? 'es' : 'en';
          
          const voicePreferences = this.getVoicePreferences(options.voice || 'nova', lang);
          
          // Find best matching voice
          let preferredVoice = voices.find(v => 
            v.lang.startsWith(langPrefix) && 
            voicePreferences.some(pref => v.name.toLowerCase().includes(pref))
          );
          
          // Fallback: any voice matching language prefix
          if (!preferredVoice) {
            preferredVoice = voices.find(v => v.lang.startsWith(langPrefix));
          }
          
          // Fallback: any English voice
          if (!preferredVoice) {
            preferredVoice = voices.find(v => v.lang.includes('en'));
          }
          
          // Final fallback: first available voice
          if (!preferredVoice && voices.length > 0) {
            preferredVoice = voices[0];
            console.warn('⚠️ Using first available voice as fallback:', preferredVoice.name);
          }
          
          if (preferredVoice) {
            utterance.voice = preferredVoice;
            utterance.lang = preferredVoice.lang;
            console.log(`🎤 Speaking with voice: ${preferredVoice.name} (${preferredVoice.lang})`);
          }
        } else {
          // No voices available - use default
          utterance.lang = options.language === 'es' ? 'es-ES' : 'en-US';
          console.log(`🎤 Speaking with default voice`);
        }

        utterance.onend = () => {
          this.currentUtterance = null;
          onComplete?.();
          resolve();
        };
        
        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event.error);
          this.currentUtterance = null;
          
          if (event.error === 'canceled' || event.error === 'interrupted') {
            onComplete?.();
            resolve(); // Not a real error - user stopped or new speech started
          } else if (event.error === 'synthesis-failed') {
            // Retry once with default voice
            console.warn('⚠️ Synthesis failed, retrying with default voice...');
            setTimeout(() => {
              try {
                const retryUtterance = new SpeechSynthesisUtterance(sanitizedText);
                retryUtterance.rate = options.speed || 1.0;
                retryUtterance.pitch = 1.0;
                retryUtterance.volume = 1.0;
                retryUtterance.onend = () => { 
                  onComplete?.(); 
                  resolve(); 
                };
                retryUtterance.onerror = (e) => { 
                  console.error('Retry also failed:', e.error);
                  onComplete?.(); 
                  resolve(); // Don't reject, just log and continue
                };
                window.speechSynthesis.speak(retryUtterance);
              } catch (e) {
                console.error('Retry exception:', e);
                onComplete?.();
                resolve();
              }
            }, 300);
          } else {
            onComplete?.();
            // Don't reject on errors, just resolve to prevent queue blocking
            console.warn(`Speech synthesis error (non-blocking): ${event.error}`);
            resolve();
          }
        };
        
        // Cancel any ongoing speech first
        window.speechSynthesis.cancel();
        
        // Increased delay for better browser compatibility
        setTimeout(() => {
          try {
            window.speechSynthesis.speak(utterance);
          } catch (speakError) {
            console.error('Error calling speak():', speakError);
            onComplete?.();
            resolve();
          }
        }, 250); // Increased from 100ms to 250ms
        
      } catch (error) {
        console.error('Error in speakWithWebSpeech:', error);
        onComplete?.();
        resolve();
      }
    });
  }

  private loadVoices(): Promise<void> {
    return new Promise((resolve) => {
      if (this.voicesLoaded) {
        resolve();
        return;
      }

      const voices = window.speechSynthesis.getVoices();
      
      if (voices.length > 0) {
        this.voicesLoaded = true;
        console.log(`✅ Loaded ${voices.length} voices`);
        resolve();
        return;
      }

      // Wait for voiceschanged event
      const handleVoicesChanged = () => {
        const newVoices = window.speechSynthesis.getVoices();
        if (newVoices.length > 0) {
          this.voicesLoaded = true;
          console.log(`✅ Loaded ${newVoices.length} voices via event`);
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
          resolve();
        }
      };

      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);

      // Timeout after 2 seconds
      setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        this.voicesLoaded = true;
        console.log('⏱️ Voice loading timeout - proceeding with default');
        resolve();
      }, 2000);
    });
  }

  /**
   * Map OpenAI voice names to Web Speech voice characteristics
   * Now with Spanish voice preferences
   */
  private getVoicePreferences(voice: string, language: 'en' | 'es' = 'en'): string[] {
    if (language === 'es') {
      // Spanish female voice preferences
      const spanishMapping: Record<string, string[]> = {
        alloy: ['monica', 'paulina', 'luciana', 'female'],
        echo: ['jorge', 'diego', 'male'],
        fable: ['monica', 'esperanza', 'female'],
        onyx: ['jorge', 'male'],
        nova: ['monica', 'paulina', 'female'],
        shimmer: ['luciana', 'penelope', 'female']
      };
      return spanishMapping[voice] || ['female', 'monica', 'paulina'];
    }
    
    // English female voice preferences (default)
    const englishMapping: Record<string, string[]> = {
      alloy: ['samantha', 'karen', 'victoria', 'female'],
      echo: ['alex', 'daniel', 'male'],
      fable: ['zira', 'hazel', 'female'],
      onyx: ['george', 'rishi', 'male'],
      nova: ['allison', 'tessa', 'female'],
      shimmer: ['nicky', 'amelie', 'female']
    };
    
    return englishMapping[voice] || ['female'];
  }

  stopSpeaking(): void {
    // Clear queue and stop current speech
    this.speechQueue = [];
    if (this.currentUtterance || window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      this.currentUtterance = null;
    }
  }

  isSpeaking(): boolean {
    return this.currentUtterance !== null || window.speechSynthesis.speaking;
  }

  getCapabilities(): {
    openAIAvailable: boolean;
    webSpeechAvailable: boolean;
  } {
    return {
      openAIAvailable: false, // No longer using OpenAI TTS
      webSpeechAvailable: 'speechSynthesis' in window
    };
  }
}

// Export singleton instance
export const unifiedTTSService = new UnifiedTTSService();
