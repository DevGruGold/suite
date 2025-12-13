import { useEffect, useRef } from 'react';
import { BrowserCompatibilityService } from '@/utils/browserCompatibility';

// Enhanced mobile voice optimizations with PWA support
export const MobileVoiceEnhancer = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    const capabilities = BrowserCompatibilityService.detectCapabilities();
    
    // Log capabilities on mount
    BrowserCompatibilityService.logCapabilities();
    
    if (capabilities.isMobile || capabilities.isPWA) {
      console.log('🎤 Enhanced mobile/PWA voice optimizations initialized', {
        isPWA: capabilities.isPWA,
        isIOSSafari: capabilities.isIOSSafari,
        isSecureContext: capabilities.isSecureContext
      });

      // Check secure context first
      if (!capabilities.isSecureContext) {
        console.warn('⚠️ Not a secure context - voice features will not work');
        return;
      }
      
      // Enhanced audio unlock for mobile - only unlock AudioContext, don't request permissions yet
      const unlockAudioContext = async () => {
        if (audioContextRef.current?.state === 'running') {
          return; // Already unlocked
        }

        try {
          // Create or resume audio context
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
          }

          // Resume if suspended (required for iOS Safari)
          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
          }

          // Play silent sound to fully unlock on iOS
          const oscillator = audioContextRef.current.createOscillator();
          const gainNode = audioContextRef.current.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContextRef.current.destination);
          gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
          
          oscillator.frequency.setValueAtTime(440, audioContextRef.current.currentTime);
          oscillator.start(audioContextRef.current.currentTime);
          oscillator.stop(audioContextRef.current.currentTime + 0.05);
          
          console.log('🔓 Audio context unlocked for mobile/PWA');
        } catch (error) {
          console.warn('⚠️ Audio unlock failed:', error);
        }
      };

      // User interaction handler - only unlock audio, don't auto-request permissions
      const interactionHandler = () => {
        if (hasInitializedRef.current) return;
        hasInitializedRef.current = true;
        
        console.log('👆 User interaction detected, unlocking audio context...');
        unlockAudioContext();
        
        // Remove listeners after first interaction
        document.removeEventListener('touchstart', interactionHandler);
        document.removeEventListener('click', interactionHandler);
        document.removeEventListener('touchend', interactionHandler);
      };
      
      // Listen for user interactions (required for audio unlock)
      document.addEventListener('touchstart', interactionHandler, { passive: true, once: true });
      document.addEventListener('click', interactionHandler, { passive: true, once: true });
      document.addEventListener('touchend', interactionHandler, { passive: true, once: true });
      
      // Log PWA-specific info
      if (capabilities.isPWA) {
        console.log('📱 Running as PWA - permissions may require device settings');
        const instructions = BrowserCompatibilityService.getPWAPermissionInstructions();
        console.log('📋 Permission instructions:', instructions);
      }
      
      // Handle app resume - re-unlock audio context
      const handleVisibilityChange = () => {
        if (!document.hidden && hasInitializedRef.current) {
          console.log('📱 App resumed, re-checking audio context...');
          unlockAudioContext();
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        document.removeEventListener('touchstart', interactionHandler);
        document.removeEventListener('click', interactionHandler);
        document.removeEventListener('touchend', interactionHandler);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        
        // Clean up audio context
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      };
    }
  }, []);

  return null; // This is a utility component
};

export default MobileVoiceEnhancer;