// Mobile-First Permission Service with PWA Support
export interface MobilePermissionStatus {
  microphone: 'granted' | 'denied' | 'prompt' | 'unavailable';
  camera: 'granted' | 'denied' | 'prompt' | 'unavailable';
  hasInteracted: boolean;
  isSupported: boolean;
  browserType: 'safari' | 'chrome' | 'firefox' | 'edge' | 'other';
  isMobile: boolean;
  isPWA: boolean;
  isSecureContext: boolean;
  needsUserGesture: boolean;
  retryCount: number;
}

export interface MobileAudioConfig {
  sampleRate: number;
  channelCount: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

export class MobilePermissionService {
  private static instance: MobilePermissionService;
  private status: MobilePermissionStatus;
  private audioContext: AudioContext | null = null;
  private currentStream: MediaStream | null = null;

  private constructor() {
    this.status = this.detectMobileCapabilities();
  }

  static getInstance(): MobilePermissionService {
    if (!MobilePermissionService.instance) {
      MobilePermissionService.instance = new MobilePermissionService();
    }
    return MobilePermissionService.instance;
  }

  private detectMobileCapabilities(): MobilePermissionStatus {
    const userAgent = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    
    // Detect PWA/standalone mode
    const isPWA = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    // Check secure context
    const isSecureContext = window.isSecureContext ?? false;
    
    let browserType: 'safari' | 'chrome' | 'firefox' | 'edge' | 'other' = 'other';
    if (userAgent.includes('Edg')) {
      browserType = 'edge';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browserType = 'safari';
    } else if (userAgent.includes('Chrome')) {
      browserType = 'chrome';
    } else if (userAgent.includes('Firefox')) {
      browserType = 'firefox';
    }

    const isSupported = !!(navigator.mediaDevices?.getUserMedia);
    const needsUserGesture = browserType === 'safari' || browserType === 'chrome' || browserType === 'edge';

    return {
      microphone: 'prompt',
      camera: 'prompt',
      hasInteracted: false,
      isSupported,
      browserType,
      isMobile,
      isPWA,
      isSecureContext,
      needsUserGesture,
      retryCount: 0
    };
  }

  getMobileAudioConfig(): MobileAudioConfig {
    // Optimized settings for mobile devices
    return {
      sampleRate: this.status.isMobile ? 16000 : 44100, // Lower sample rate for mobile
      channelCount: 1, // Mono for better mobile performance
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
  }

  async requestMicrophonePermission(): Promise<{ success: boolean; stream?: MediaStream; error?: string; needsSettingsChange?: boolean }> {
    // Check secure context first
    if (!this.status.isSecureContext) {
      return { 
        success: false, 
        error: 'Camera/microphone requires HTTPS. Please use a secure connection.',
        needsSettingsChange: false 
      };
    }

    if (!this.status.isSupported) {
      return { success: false, error: 'Microphone not supported on this device' };
    }

    if (this.status.needsUserGesture && !this.status.hasInteracted) {
      return { success: false, error: 'Tap anywhere first to enable voice features' };
    }

    // Retry logic with exponential backoff
    const attemptRequest = async (attempt: number): Promise<{ success: boolean; stream?: MediaStream; error?: string; needsSettingsChange?: boolean }> => {
      try {
        // Stop any existing stream
        if (this.currentStream) {
          this.currentStream.getTracks().forEach(track => track.stop());
        }

        const config = this.getMobileAudioConfig();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: config.sampleRate,
            channelCount: config.channelCount,
            echoCancellation: config.echoCancellation,
            noiseSuppression: config.noiseSuppression,
            autoGainControl: config.autoGainControl
          }
        });

        this.currentStream = stream;
        this.status.microphone = 'granted';
        this.status.retryCount = 0;
        
        console.log('🎤 Mobile microphone permission granted', {
          sampleRate: config.sampleRate,
          browser: this.status.browserType,
          mobile: this.status.isMobile,
          isPWA: this.status.isPWA,
          attempt
        });

        return { success: true, stream };
      } catch (error) {
        console.error(`Mobile microphone permission failed (attempt ${attempt}):`, error);
        
        // Retry on transient errors
        if (attempt < MAX_RETRY_ATTEMPTS && error instanceof Error) {
          if (error.name === 'AbortError' || error.name === 'NotReadableError') {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
            return attemptRequest(attempt + 1);
          }
        }

        this.status.microphone = 'denied';
        this.status.retryCount = attempt;
        
        let errorMessage = 'Microphone access denied';
        let needsSettingsChange = false;

        if (error instanceof Error) {
          if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            needsSettingsChange = true;
            errorMessage = this.getPermissionDeniedMessage('microphone');
          } else if (error.name === 'NotFoundError') {
            errorMessage = 'No microphone found on this device';
          } else if (error.name === 'NotSupportedError') {
            errorMessage = 'Microphone not supported in this browser';
          } else if (error.name === 'NotReadableError') {
            errorMessage = 'Microphone is in use by another application';
          } else if (error.name === 'OverconstrainedError') {
            errorMessage = 'Microphone settings not supported';
          }
        }

        return { success: false, error: errorMessage, needsSettingsChange };
      }
    };

    return attemptRequest(1);
  }

  private getPermissionDeniedMessage(device: 'microphone' | 'camera'): string {
    const deviceName = device === 'microphone' ? 'Microphone' : 'Camera';
    
    if (this.status.isPWA) {
      if (this.status.browserType === 'safari' && this.status.isMobile) {
        return `${deviceName} blocked. Go to Settings → Safari → ${deviceName} → Allow for this site`;
      }
      if (this.status.browserType === 'chrome' && this.status.isMobile) {
        return `${deviceName} blocked. Tap ⋮ → Settings → Site settings → ${deviceName} → Allow`;
      }
      return `${deviceName} blocked in PWA. Enable in your device settings.`;
    }
    
    if (this.status.browserType === 'safari') {
      return `${deviceName} blocked. Click Safari → Settings for This Website → Allow ${deviceName}`;
    }
    
    if (this.status.browserType === 'chrome' || this.status.browserType === 'edge') {
      return `${deviceName} blocked. Click the lock icon → Site settings → Allow ${deviceName}`;
    }
    
    return `${deviceName} access denied. Please enable it in your browser settings.`;
  }

  async unlockAudioContext(): Promise<{ success: boolean; error?: string }> {
    if (this.audioContext && this.audioContext.state === 'running') {
      return { success: true };
    }

    try {
      // Create or resume audio context
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Play silent sound to fully unlock
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      
      oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.1);

      console.log('🔓 Mobile audio context unlocked');
      return { success: true };
    } catch (error) {
      console.error('Failed to unlock audio context:', error);
      return { success: false, error: 'Failed to unlock audio' };
    }
  }

  markUserInteraction(): void {
    this.status.hasInteracted = true;
    console.log('👆 User interaction detected - mobile permissions enabled');
  }

  async initializeMobileAudio(): Promise<{ success: boolean; stream?: MediaStream; error?: string }> {
    // Step 1: Unlock audio context
    const audioResult = await this.unlockAudioContext();
    if (!audioResult.success) {
      return { success: false, error: audioResult.error };
    }

    // Step 2: Request microphone permission
    return await this.requestMicrophonePermission();
  }

  getStatus(): MobilePermissionStatus {
    return { ...this.status };
  }

  getBrowserSpecificInstructions(): string[] {
    const instructions: string[] = [];

    if (!this.status.isSecureContext) {
      instructions.push('⚠️ Voice features require HTTPS');
      return instructions;
    }
    
    if (this.status.isPWA) {
      instructions.push('Running as installed app');
      if (this.status.microphone === 'denied' || this.status.camera === 'denied') {
        instructions.push('Permissions may need to be enabled in device settings');
      }
    }

    if (this.status.browserType === 'safari' && this.status.isMobile) {
      instructions.push('Tap the microphone button to enable voice');
      instructions.push('Safari may ask for permission multiple times');
      if (this.status.isPWA) {
        instructions.push('If denied, go to Settings → Safari → Microphone');
      }
    } else if (this.status.browserType === 'chrome' && this.status.isMobile) {
      instructions.push('Tap to allow microphone when prompted');
      instructions.push('Look for the microphone icon in the address bar');
      if (this.status.isPWA) {
        instructions.push('If denied, tap ⋮ → Settings → Site settings');
      }
    } else if (!this.status.isSupported) {
      instructions.push('Voice features not supported in this browser');
      instructions.push('Try Chrome, Safari, or Firefox for voice support');
    }

    return instructions;
  }

  async requestCameraPermission(): Promise<{ success: boolean; stream?: MediaStream; error?: string; needsSettingsChange?: boolean }> {
    if (!this.status.isSecureContext) {
      return { 
        success: false, 
        error: 'Camera requires HTTPS. Please use a secure connection.',
        needsSettingsChange: false 
      };
    }

    if (!this.status.isSupported) {
      return { success: false, error: 'Camera not supported on this device' };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      this.status.camera = 'granted';
      console.log('📷 Camera permission granted', {
        browser: this.status.browserType,
        isPWA: this.status.isPWA
      });

      return { success: true, stream };
    } catch (error) {
      console.error('Camera permission failed:', error);
      this.status.camera = 'denied';

      let errorMessage = 'Camera access denied';
      let needsSettingsChange = false;

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          needsSettingsChange = true;
          errorMessage = this.getPermissionDeniedMessage('camera');
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No camera found on this device';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Camera is in use by another application';
        }
      }

      return { success: false, error: errorMessage, needsSettingsChange };
    }
  }

  cleanup(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  // Reset for retry
  resetPermissions(): void {
    this.status.microphone = 'prompt';
    this.status.camera = 'prompt';
    this.status.retryCount = 0;
    this.cleanup();
  }
}

export const mobilePermissionService = MobilePermissionService.getInstance();