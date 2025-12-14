import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';

interface AudioContextType {
  isPlaying: boolean;
  isMuted: boolean;
  playAudio: () => void;
  pauseAudio: () => void;
  toggleMute: () => void;
  initializeAudio: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize audio element once
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio('/audio/sweet.mp3');
      audio.loop = true;
      audio.volume = 0.3;
      audioRef.current = audio;

      audio.addEventListener('play', () => setIsPlaying(true));
      audio.addEventListener('pause', () => setIsPlaying(false));
      audio.addEventListener('ended', () => setIsPlaying(false));
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const initializeAudio = useCallback(() => {
    if (hasInitialized || !audioRef.current) return;
    
    const audio = audioRef.current;
    
    const tryPlay = () => {
      audio.play().then(() => {
        setHasInitialized(true);
        document.removeEventListener('click', tryPlay);
      }).catch(() => {
        // Will retry on click
      });
    };

    tryPlay();
    
    // Fallback: play on first user interaction
    if (!hasInitialized) {
      document.addEventListener('click', tryPlay, { once: true });
    }
  }, [hasInitialized]);

  const playAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(console.log);
    }
  }, []);

  const pauseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = !audioRef.current.muted;
      setIsMuted(audioRef.current.muted);
    }
  }, []);

  return (
    <AudioContext.Provider value={{ 
      isPlaying, 
      isMuted, 
      playAudio, 
      pauseAudio, 
      toggleMute,
      initializeAudio 
    }}>
      {children}
    </AudioContext.Provider>
  );
};
