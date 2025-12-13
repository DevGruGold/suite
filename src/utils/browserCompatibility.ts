// Browser compatibility detection and logging utility
export interface BrowserCapabilities {
  speechRecognition: boolean;
  webAudio: boolean;
  mediaDevices: boolean;
  isMobile: boolean;
  browser: string;
  platform: string;
  userGestureRequired: boolean;
  isPWA: boolean;
  isSecureContext: boolean;
  isIOSSafari: boolean;
  isAndroidWebView: boolean;
}

export class BrowserCompatibilityService {
  static detectCapabilities(): BrowserCapabilities {
    const capabilities: BrowserCapabilities = {
      speechRecognition: false,
      webAudio: false,
      mediaDevices: false,
      isMobile: false,
      browser: 'unknown',
      platform: 'unknown',
      userGestureRequired: false,
      isPWA: false,
      isSecureContext: false,
      isIOSSafari: false,
      isAndroidWebView: false
    };

    // Secure context check (HTTPS required for media)
    capabilities.isSecureContext = window.isSecureContext ?? false;

    // PWA/Standalone mode detection
    capabilities.isPWA = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    // Browser detection
    const userAgent = navigator.userAgent;
    
    // iOS Safari detection (stricter permission handling)
    capabilities.isIOSSafari = 
      /iPad|iPhone|iPod/.test(userAgent) && 
      !userAgent.includes('CriOS') && 
      !userAgent.includes('FxiOS') &&
      userAgent.includes('Safari');

    // Android WebView detection
    capabilities.isAndroidWebView = 
      userAgent.includes('wv') || 
      (userAgent.includes('Android') && userAgent.includes('; wv)'));

    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      capabilities.browser = 'Chrome';
      capabilities.userGestureRequired = true;
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      capabilities.browser = 'Safari';
      capabilities.userGestureRequired = true;
    } else if (userAgent.includes('Firefox')) {
      capabilities.browser = 'Firefox';
      capabilities.userGestureRequired = false;
    } else if (userAgent.includes('Edg')) {
      capabilities.browser = 'Edge';
      capabilities.userGestureRequired = true;
    }

    // Platform detection
    if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
      capabilities.isMobile = true;
      capabilities.platform = 'mobile';
    } else {
      capabilities.platform = 'desktop';
    }

    // Speech Recognition API check
    capabilities.speechRecognition = !!(
      window.SpeechRecognition || 
      window.webkitSpeechRecognition
    );

    // Web Audio API check
    capabilities.webAudio = !!(
      window.AudioContext || 
      window.webkitAudioContext
    );

    // MediaDevices API check
    capabilities.mediaDevices = !!(
      navigator.mediaDevices && 
      navigator.mediaDevices.getUserMedia
    );

    return capabilities;
  }

  static logCapabilities(): void {
    const caps = this.detectCapabilities();
    
    console.group('🔍 Browser Compatibility Analysis');
    console.log('Browser:', caps.browser);
    console.log('Platform:', caps.platform);
    console.log('Is Mobile:', caps.isMobile);
    console.log('Is PWA:', caps.isPWA ? '✅' : '❌');
    console.log('Is Secure Context:', caps.isSecureContext ? '✅' : '❌');
    console.log('Is iOS Safari:', caps.isIOSSafari ? '⚠️' : '❌');
    console.log('Is Android WebView:', caps.isAndroidWebView ? '⚠️' : '❌');
    console.log('Speech Recognition:', caps.speechRecognition ? '✅' : '❌');
    console.log('Web Audio:', caps.webAudio ? '✅' : '❌');
    console.log('Media Devices:', caps.mediaDevices ? '✅' : '❌');
    console.log('User Gesture Required:', caps.userGestureRequired ? '⚠️' : '✅');
    console.groupEnd();

    // Specific warnings
    if (!caps.isSecureContext) {
      console.warn('❌ Not a secure context - camera/microphone will not work');
    }

    if (!caps.speechRecognition) {
      console.warn('❌ Speech Recognition not supported in this browser');
    }
    
    if (caps.isIOSSafari) {
      console.warn('⚠️ iOS Safari has stricter permission handling');
    }

    if (caps.isAndroidWebView) {
      console.warn('⚠️ Android WebView may have limited media access');
    }

    if (caps.isPWA) {
      console.info('ℹ️ Running as PWA - permissions may need to be granted in device settings');
    }

    if (caps.userGestureRequired) {
      console.info('ℹ️ User interaction required before starting voice features');
    }
  }

  static getRecommendations(): string[] {
    const caps = this.detectCapabilities();
    const recommendations: string[] = [];

    if (!caps.isSecureContext) {
      recommendations.push('⚠️ Camera/microphone requires HTTPS. Please use a secure connection.');
    }

    if (!caps.speechRecognition) {
      recommendations.push('Use Chrome, Edge, or Safari for voice recognition');
    }

    if (caps.isPWA && caps.isIOSSafari) {
      recommendations.push('If permissions are denied, go to Settings → Safari → Camera/Microphone');
    }

    if (caps.isPWA && caps.browser === 'Chrome' && caps.isMobile) {
      recommendations.push('If permissions fail, tap the lock icon in browser → Site settings');
    }

    if (caps.isMobile) {
      recommendations.push('Push-to-talk works better on mobile devices');
      recommendations.push('Ensure stable internet connection for mobile voice features');
    }

    if (caps.browser === 'Safari') {
      recommendations.push('Voice features may require user interaction in Safari');
    }

    if (!caps.webAudio || !caps.mediaDevices) {
      recommendations.push('Update your browser for full voice functionality');
    }

    return recommendations;
  }

  static getPWAPermissionInstructions(): string {
    const caps = this.detectCapabilities();

    if (caps.isIOSSafari && caps.isPWA) {
      return 'Go to Settings → Safari → Camera & Microphone Access → Enable for this site';
    }
    
    if (caps.browser === 'Chrome' && caps.isMobile && caps.isPWA) {
      return 'Tap the lock icon next to the URL → Site settings → Allow Camera and Microphone';
    }

    if (caps.browser === 'Chrome' && !caps.isMobile) {
      return 'Click the lock icon → Site settings → Camera/Microphone → Allow';
    }

    if (caps.browser === 'Safari' && !caps.isMobile) {
      return 'Safari → Settings for this Website → Allow Camera and Microphone';
    }

    return 'Enable camera and microphone in your browser or device settings';
  }
}