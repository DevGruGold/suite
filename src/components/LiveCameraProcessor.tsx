import React, { useRef, useEffect, useState } from 'react';
import { realTimeProcessingService } from '@/services/RealTimeProcessingService';
import { emotionalIntelligenceService } from '@/services/EmotionalIntelligenceService';
import { Camera, CameraOff, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LiveCameraProcessorProps {
  onEmotionDetected?: (emotion: string, confidence: number) => void;
  onVisualContextUpdate?: (context: string) => void;
  isEnabled?: boolean;
  processingInterval?: number;
  className?: string;
}

export const LiveCameraProcessor: React.FC<LiveCameraProcessorProps> = ({
  onEmotionDetected,
  onVisualContextUpdate,
  isEnabled = true,
  processingInterval = 2000, // Process every 2 seconds
  className = ''
}) => {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedEmotion, setDetectedEmotion] = useState<string>('');
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'processing' | 'analyzed'>('idle');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isEnabled && isActive) {
      startProcessing();
    } else {
      stopProcessing();
    }

    return () => {
      cleanup();
    };
  }, [isEnabled, isActive, processingInterval]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setIsActive(true);
      setError(null);
      
    } catch (err) {
      setError('Could not access camera');
      console.error('Camera access error:', err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsActive(false);
    setProcessingStatus('idle');
  };

  const startProcessing = () => {
    if (!isActive) return;

    intervalRef.current = setInterval(() => {
      processCurrentFrame();
    }, processingInterval);
  };

  const stopProcessing = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const processCurrentFrame = async () => {
    if (!videoRef.current || !canvasRef.current || !isActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) return;

    setProcessingStatus('processing');

    try {
      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get image data
      const imageData = canvas.toDataURL('image/jpeg', 0.8);

      // Analyze emotion from visual data
      const emotionData = emotionalIntelligenceService.analyzeVisualEmotion(imageData);
      
      setDetectedEmotion(emotionData.primary);
      onEmotionDetected?.(emotionData.primary, emotionData.confidence);

      // Generate visual context description
      const visualContext = generateVisualContext(imageData, emotionData);
      onVisualContextUpdate?.(visualContext);

      // Update real-time processing service
      realTimeProcessingService.updateVisualContext(visualContext);
      realTimeProcessingService.updateEmotionalContext(emotionData.primary, emotionData.confidence);

      setProcessingStatus('analyzed');

      // Reset status after short delay
      setTimeout(() => {
        setProcessingStatus('idle');
      }, 500);

    } catch (err) {
      console.error('Frame processing error:', err);
      setProcessingStatus('idle');
    }
  };

  const generateVisualContext = (imageData: string, emotionData: any): string => {
    // Simple visual context generation
    // In a real implementation, this would use computer vision APIs
    const contexts = [];
    
    contexts.push(`User emotion: ${emotionData.primary}`);
    
    if (emotionData.intensity > 0.7) {
      contexts.push('High emotional intensity detected');
    }
    
    // Simulate other visual cues
    const lightingConditions = Math.random() > 0.5 ? 'good lighting' : 'low lighting';
    contexts.push(`Lighting: ${lightingConditions}`);
    
    const attentionLevel = Math.random() > 0.3 ? 'focused on screen' : 'looking away';
    contexts.push(`Attention: ${attentionLevel}`);
    
    return contexts.join(', ');
  };

  const cleanup = () => {
    stopProcessing();
    stopCamera();
  };

  const toggleCamera = () => {
    if (isActive) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  return (
    <div className={`flex flex-col items-center space-y-3 ${className}`}>
      {/* Control Button */}
      <Button
        variant={isActive ? "destructive" : "default"}
        size="sm"
        onClick={toggleCamera}
        disabled={!isEnabled}
        className="w-full"
      >
        {isActive ? (
          <>
            <CameraOff className="w-4 h-4 mr-2" />
            Stop Camera
          </>
        ) : (
          <>
            <Camera className="w-4 h-4 mr-2" />
            Start Camera
          </>
        )}
      </Button>

      {/* Video Preview and Canvas */}
      <div className="relative">
        <video
          ref={videoRef}
          className={`w-48 h-36 rounded-lg border ${isActive ? 'block' : 'hidden'}`}
          style={{ transform: 'scaleX(-1)' }}
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          className="hidden" // Hidden canvas for processing
        />
        
        {/* Processing Status Overlay */}
        {isActive && (
          <div className="absolute top-2 right-2">
            <div className={`w-3 h-3 rounded-full ${
              processingStatus === 'processing' ? 'bg-yellow-500 animate-pulse' :
              processingStatus === 'analyzed' ? 'bg-green-500' :
              'bg-gray-400'
            }`} />
          </div>
        )}
      </div>

      {/* Detected Emotion Display */}
      {isActive && detectedEmotion && (
        <div className="w-full p-2 bg-secondary/50 rounded text-xs text-center">
          <div className="text-muted-foreground mb-1">Detected emotion:</div>
          <div className="text-foreground font-medium capitalize">{detectedEmotion}</div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="w-full p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Status Information */}
      <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}
          />
          <span>{isActive ? 'Camera active' : 'Camera off'}</span>
        </div>
        
        {isActive && (
          <div className="flex items-center space-x-1">
            <Eye className="w-3 h-3" />
            <span>Processing every {processingInterval / 1000}s</span>
          </div>
        )}
      </div>

      {/* Processing Interval Control */}
      {isActive && (
        <div className="w-full">
          <label className="text-xs text-muted-foreground mb-1 block">
            Processing Speed:
          </label>
          <select
            value={processingInterval}
            onChange={(e) => {
              const newInterval = parseInt(e.target.value);
              // This would need to be passed up to parent or handled differently
              // For now, just show the UI
            }}
            className="w-full text-xs p-1 rounded border bg-background"
          >
            <option value={1000}>Fast (1s)</option>
            <option value={2000}>Normal (2s)</option>
            <option value={5000}>Slow (5s)</option>
          </select>
        </div>
      )}
    </div>
  );
};