// Simplified Voice Service - Mobile-First Approach
import { mobilePermissionService } from './mobilePermissionService';

export interface VoiceRecognitionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
}

export interface VoiceServiceConfig {
  continuous?: boolean;
  interimResults?: boolean;
  language?: string;
}

export class SimplifiedVoiceService {
  private static recognition: SpeechRecognition | null = null;
  private static isListening = false;
  private static onResultCallback: ((result: VoiceRecognitionResult) => void) | null = null;
  private static onErrorCallback: ((error: string) => void) | null = null;
  private static config: VoiceServiceConfig = {};

  static isSupported(): boolean {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Synchronously creates and wires up a fresh SpeechRecognition instance.
   * Does NOT call .start() — no user gesture needed.
   * Safe to call at any time, including on component mount or after stopListening.
   */
  static prepareInstance(config: VoiceServiceConfig = {}): boolean {
    if (!this.isSupported()) return false;

    try {
      // Tear down any previous instance cleanly
      if (this.recognition) {
        try { this.recognition.abort(); } catch (_) { }
        this.recognition = null;
      }

      this.config = config;
      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new SpeechRecognitionCtor();

      r.continuous = config.continuous ?? false;
      r.interimResults = config.interimResults ?? true;
      r.lang = config.language ?? 'en-US';

      r.onstart = () => {
        console.log('🎤 Voice recognition started');
        this.isListening = true;
      };

      r.onresult = (event) => {
        if (!this.onResultCallback) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          this.onResultCallback({
            text: result[0].transcript,
            confidence: result[0].confidence || 0.8,
            isFinal: result.isFinal,
          });
        }
      };

      r.onerror = (event) => {
        console.error('Voice recognition error:', event.error);
        this.isListening = false;

        let errorMessage = 'Voice recognition error';
        switch (event.error) {
          case 'not-allowed': errorMessage = 'Microphone permission denied'; break;
          case 'no-speech': errorMessage = 'No speech detected'; break;
          case 'network': errorMessage = 'Network error - check internet connection'; break;
          case 'audio-capture': errorMessage = 'Audio capture failed'; break;
        }

        if (this.onErrorCallback) this.onErrorCallback(errorMessage);

        // After an error, pre-build the next instance so it's ready immediately
        this.recognition = null;
        setTimeout(() => this.prepareInstance(this.config), 100);
      };

      r.onend = () => {
        console.log('🎤 Voice recognition ended');
        this.isListening = false;
        // Pre-build the next instance right away so it's ready for the next click
        this.recognition = null;
        setTimeout(() => this.prepareInstance(this.config), 100);
      };

      this.recognition = r;
      console.log('🎤 SpeechRecognition instance ready');
      return true;
    } catch (err) {
      console.error('Failed to prepare SpeechRecognition instance:', err);
      return false;
    }
  }

  /**
   * Full async initialization — handles mobile permission requests.
   * Calls prepareInstance() internally after async work is done.
   * Use this on first mount; prepareInstance() is used for subsequent sessions.
   */
  static async initialize(config: VoiceServiceConfig = {}): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupported()) {
      return { success: false, error: 'Speech recognition not supported' };
    }

    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        const permissionResult = await mobilePermissionService.initializeMobileAudio();
        if (!permissionResult.success) {
          console.warn('Mobile audio init failed, attempting fallback...', permissionResult.error);
        }
      }

      const ready = this.prepareInstance(config);
      return ready
        ? { success: true }
        : { success: false, error: 'Failed to create SpeechRecognition instance' };
    } catch (error) {
      console.error('Failed to initialize voice service:', error);
      return { success: false, error: 'Failed to initialize voice recognition' };
    }
  }

  /**
   * Start listening.
   *
   * MOBILE KEY: If the recognition instance is already prepared (prepareInstance was
   * called ahead of time), we call recognition.start() SYNCHRONOUSLY — preserving the
   * user gesture context required by iOS Safari and Android Chrome.
   *
   * If the instance is not ready, we fall back to the async initialize() path.
   */
  static async startListening(
    onResult: (result: VoiceRecognitionResult) => void,
    onError?: (error: string) => void
  ): Promise<{ success: boolean; error?: string }> {

    // Fast path: instance is pre-built, start synchronously (preserves gesture context on mobile)
    if (this.recognition && !this.isListening) {
      this.onResultCallback = onResult;
      this.onErrorCallback = onError || null;
      try {
        this.recognition.start();
        return { success: true };
      } catch (error: any) {
        console.error('Failed to start (fast path):', error);
        this.recognition = null;
        // Fall through to async init below
      }
    }

    if (this.isListening) {
      return { success: false, error: 'Already listening' };
    }

    // Slow path: need to initialize first (first load, or fast path failed)
    const initResult = await this.initialize();
    if (!initResult.success) return initResult;

    try {
      this.onResultCallback = onResult;
      this.onErrorCallback = onError || null;
      this.recognition!.start();
      return { success: true };
    } catch (error: any) {
      console.error('Failed to start (slow path):', error);
      this.recognition = null;
      return { success: false, error: error?.message || 'Failed to start voice recognition' };
    }
  }

  static stopListening(): void {
    if (this.recognition) {
      try {
        if (this.isListening) this.recognition.stop();
      } catch (e) {
        console.warn('Error stopping recognition:', e);
      }
      // Null out immediately — onend handler will pre-build the next instance
      this.recognition = null;
    }
    this.isListening = false;
    this.onResultCallback = null;
    this.onErrorCallback = null;
  }

  static isCurrentlyListening(): boolean {
    return this.isListening;
  }

  static getStatus(): {
    supported: boolean;
    listening: boolean;
    mobile: boolean;
    permissionGranted: boolean;
  } {
    const permissionStatus = mobilePermissionService.getStatus();
    return {
      supported: this.isSupported(),
      listening: this.isListening,
      mobile: permissionStatus.isMobile,
      permissionGranted: permissionStatus.microphone === 'granted',
    };
  }

  static cleanup(): void {
    this.stopListening();
    this.recognition = null;
    mobilePermissionService.cleanup();
  }
}

// Global cleanup
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    SimplifiedVoiceService.cleanup();
  });
}