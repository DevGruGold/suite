import { supabase } from '@/integrations/supabase/client';

export type ExecutiveName = 'vercel-ai-chat' | 'deepseek-chat' | 'gemini-chat' | 'openai-chat' | 'coo-chat';



// OpenAI TTS voice IDs for each executive (fallback)
const EXECUTIVE_OPENAI_VOICES: Record<ExecutiveName, string> = {
  'vercel-ai-chat': 'alloy',   // CSO - balanced, versatile
  'deepseek-chat': 'echo',     // CTO - crisp, technical
  'gemini-chat': 'fable',      // CIO - expressive, clear
  'openai-chat': 'onyx',       // CAO - deep, authoritative
  'coo-chat': 'nova'           // COO - clear, operational
};

// Browser TTS pitch variations for each executive
const EXECUTIVE_BROWSER_PITCH: Record<ExecutiveName, number> = {
  'vercel-ai-chat': 1.0,  // CSO - normal pitch
  'deepseek-chat': 0.9,   // CTO - slightly lower
  'gemini-chat': 1.1,     // CIO - slightly higher
  'openai-chat': 0.8,     // CAO - deeper voice
  'coo-chat': 0.95        // COO - slightly lower, authoritative
};

class ExecutiveTTSService {
  private currentAudio: HTMLAudioElement | null = null;
  private isSpeakingState = false;
  private onSpeakingChange: ((speaking: boolean) => void) | null = null;

  setOnSpeakingChange(callback: (speaking: boolean) => void) {
    this.onSpeakingChange = callback;
  }

  private setSpeaking(speaking: boolean) {
    this.isSpeakingState = speaking;
    this.onSpeakingChange?.(speaking);
  }

  isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  async speak(text: string, executive: ExecutiveName): Promise<void> {
    // Stop any current speech
    this.stop();

    // Truncate long text
    const truncatedText = text.slice(0, 1000);



    // Fallback to OpenAI TTS
    try {
      const success = await this.speakWithOpenAI(truncatedText, executive);
      if (success) return;
    } catch (error) {
      console.log('OpenAI TTS failed, trying browser:', error);
    }

    // Final fallback to browser TTS
    await this.speakWithBrowser(truncatedText, executive);
  }



  private async speakWithOpenAI(text: string, executive: ExecutiveName): Promise<boolean> {
    const voice = EXECUTIVE_OPENAI_VOICES[executive];

    const { data, error } = await supabase.functions.invoke('openai-tts', {
      body: { text, voice, speed: 1.0 }
    });

    if (error || !data?.audioContent) {
      console.error('OpenAI TTS error:', error);
      return false;
    }

    return this.playBase64Audio(data.audioContent);
  }

  private playBase64Audio(base64Audio: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const audioData = atob(base64Audio);
        const audioArray = new Uint8Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          audioArray[i] = audioData.charCodeAt(i);
        }

        const blob = new Blob([audioArray], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(blob);

        this.currentAudio = new Audio(audioUrl);
        this.setSpeaking(true);

        this.currentAudio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          this.setSpeaking(false);
          this.currentAudio = null;
          resolve(true);
        };

        this.currentAudio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          this.setSpeaking(false);
          this.currentAudio = null;
          resolve(false);
        };

        this.currentAudio.play().catch(() => {
          this.setSpeaking(false);
          resolve(false);
        });
      } catch (error) {
        console.error('Error playing audio:', error);
        this.setSpeaking(false);
        resolve(false);
      }
    });
  }

  private speakWithBrowser(text: string, executive: ExecutiveName): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        console.warn('Browser TTS not available');
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = EXECUTIVE_BROWSER_PITCH[executive];
      utterance.rate = 1.0;

      this.setSpeaking(true);

      utterance.onend = () => {
        this.setSpeaking(false);
        resolve();
      };

      utterance.onerror = () => {
        this.setSpeaking(false);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    this.setSpeaking(false);
  }
}

export const executiveTTSService = new ExecutiveTTSService();
