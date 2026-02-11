import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContinuousVoiceProps {
  onTranscript: (transcript: string) => void;
  isListening?: boolean;
  isProcessing?: boolean;
  isSpeaking?: boolean;
  className?: string;
  disabled?: boolean;
}

export const ContinuousVoice = ({
  onTranscript,
  isListening: externalListening,
  isProcessing,
  isSpeaking,
  className,
  disabled
}: ContinuousVoiceProps) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [silenceTimer, setSilenceTimer] = useState(0);

  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const finalTranscriptRef = useRef<string>('');

  // Silence detection parameters
  const SILENCE_THRESHOLD = 0.01; // Audio level threshold for silence
  const SILENCE_DURATION = 1500; // ms of silence before processing

  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      speechRecognitionRef.current = new SpeechRecognition();
      speechRecognitionRef.current.continuous = true;
      speechRecognitionRef.current.interimResults = true;
      speechRecognitionRef.current.lang = 'en-US';

      speechRecognitionRef.current.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (final) {
          finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + final;
          setTranscript(finalTranscriptRef.current);
          resetSilenceTimer();
        }

        setInterimTranscript(interim);

        // Reset silence timer when we get speech
        if (final || interim) {
          resetSilenceTimer();
        }
      };

      speechRecognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setIsListening(false);
        }
      };

      speechRecognitionRef.current.onend = () => {
        // Restart if we should still be listening
        if (isListening && !disabled && !isProcessing) {
          try {
            speechRecognitionRef.current?.start();
          } catch (error) {
            console.error('Failed to restart speech recognition:', error);
          }
        }
      };
    }

    return () => {
      cleanup();
    };
  }, []);

  // Handle external listening state changes
  useEffect(() => {
    if (externalListening !== undefined) {
      if (externalListening && !isListening) {
        startListening();
      } else if (!externalListening && isListening) {
        stopListening();
      }
    }
  }, [externalListening]);

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    setSilenceTimer(0);

    silenceTimerRef.current = setTimeout(() => {
      // Process the accumulated transcript if we have meaningful content
      if (finalTranscriptRef.current.trim().length > 0) {
        onTranscript(finalTranscriptRef.current.trim());
        finalTranscriptRef.current = '';
        setTranscript('');
        setInterimTranscript('');
      }
    }, SILENCE_DURATION);
  };

  const updateAudioLevel = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    const normalizedLevel = average / 255;
    setAudioLevel(normalizedLevel);

    // Check for silence
    if (normalizedLevel < SILENCE_THRESHOLD && finalTranscriptRef.current.trim()) {
      setSilenceTimer(prev => prev + 50); // Update every ~50ms
    } else if (normalizedLevel >= SILENCE_THRESHOLD) {
      setSilenceTimer(0);
    }

    animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
  };

  const startListening = async () => {
    if (disabled || isProcessing) return;

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      streamRef.current = stream;

      // Set up audio analysis
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      updateAudioLevel();

      // Start speech recognition
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.start();
      }

      setIsListening(true);
      finalTranscriptRef.current = '';
      setTranscript('');
      setInterimTranscript('');

    } catch (error) {
      console.error('Failed to start listening:', error);
    }
  };

  const stopListening = () => {
    setIsListening(false);

    // Process any remaining transcript
    if (finalTranscriptRef.current.trim()) {
      onTranscript(finalTranscriptRef.current.trim());
    }

    cleanup();
  };

  const cleanup = () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    finalTranscriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setAudioLevel(0);
    setSilenceTimer(0);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const listening = externalListening ?? isListening;
  const currentTranscript = transcript + (interimTranscript ? ` ${interimTranscript}` : '');

  return (
    <div className={cn("flex flex-col items-center justify-center space-y-4 p-6", className)}>
      {/* Main Control Button */}
      <div className="relative">
        <Button
          onClick={toggleListening}
          disabled={disabled || isProcessing}
          variant={listening ? "destructive" : "default"}
          size="lg"
          className={cn(
            "w-20 h-20 rounded-full transition-all duration-300",
            listening && "animate-pulse shadow-lg shadow-destructive/25",
            isProcessing && "animate-spin"
          )}
        >
          {listening ? (
            <MicOff className="h-8 w-8" />
          ) : (
            <Mic className="h-8 w-8" />
          )}
        </Button>

        {/* Audio level ring */}
        {listening && (
          <div
            className="absolute inset-0 rounded-full border-4 border-primary transition-all duration-100"
            style={{
              transform: `scale(${1 + audioLevel * 0.3})`,
              opacity: audioLevel * 0.7 + 0.3
            }}
          />
        )}
      </div>

      {/* Status Indicators */}
      <div className="flex items-center gap-2">
        {listening && (
          <Badge variant="default" className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Listening
          </Badge>
        )}

        {isProcessing && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            Processing
          </Badge>
        )}

        {isSpeaking && (
          <Badge variant="outline" className="flex items-center gap-1">
            <Volume2 className="w-3 h-3" />
            Eliza Speaking
          </Badge>
        )}
      </div>

      {/* Live Transcript */}
      {currentTranscript && (
        <div className="max-w-md w-full">
          <div className="bg-secondary/50 rounded-lg p-4 text-center">
            <div className="text-xs text-muted-foreground mb-2">Live Transcript</div>
            <div className="text-sm">
              <span className="text-foreground">{transcript}</span>
              {interimTranscript && (
                <span className="text-muted-foreground italic"> {interimTranscript}</span>
              )}
            </div>

            {/* Silence countdown */}
            {listening && transcript && silenceTimer > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                Processing in {Math.ceil((SILENCE_DURATION - silenceTimer) / 1000)}s...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audio Level Visualization */}
      {listening && (
        <div className="flex items-end justify-center space-x-1 h-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-2 bg-primary rounded-full transition-all duration-100",
                audioLevel * 12 > i ? `h-${Math.min(8, Math.max(2, Math.floor(audioLevel * 8) + 2))}` : 'h-1'
              )}
              style={{
                height: audioLevel * 12 > i ? `${Math.min(32, Math.max(4, audioLevel * 32))}px` : '4px'
              }}
            />
          ))}
        </div>
      )}

      {/* Instructions */}
      {!listening && !currentTranscript && (
        <div className="text-center text-sm text-muted-foreground max-w-sm">
          <p>Click the microphone to start a continuous conversation with Eliza.</p>
          <p className="mt-1 text-xs">Speak naturally - I'll respond when you pause.</p>
        </div>
      )}
    </div>
  );
};