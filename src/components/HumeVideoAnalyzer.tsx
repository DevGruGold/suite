import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Camera, CameraOff, RefreshCw, Loader2, Wifi, WifiOff, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { humeStreamingService, EmotionScore } from '@/services/humeStreamingService';

export interface FacialEmotion {
  name: string;
  score: number;
}

interface HumeVideoAnalyzerProps {
  onEmotionUpdate?: (emotions: FacialEmotion[]) => void;
  captureInterval?: number; // ms between frame captures
  enabled?: boolean;
  preObtainedStream?: MediaStream | null;
  autoStart?: boolean;
  useStreaming?: boolean; // Use WebSocket streaming for real-time (default: true)
}

export const HumeVideoAnalyzer: React.FC<HumeVideoAnalyzerProps> = ({
  onEmotionUpdate,
  captureInterval = 500, // Faster for streaming
  enabled = true,
  preObtainedStream,
  autoStart = false,
  useStreaming = true // Default to real-time streaming
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [emotions, setEmotions] = useState<FacialEmotion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const [dataSource, setDataSource] = useState<'streaming' | 'http' | 'none'>('none');

  // Start camera stream
  const startCamera = useCallback(async (streamToUse?: MediaStream | null) => {
    try {
      setError(null);
      
      let stream: MediaStream;
      if (streamToUse) {
        stream = streamToUse;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          }
        });
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
        console.log('📹 Camera started');
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Unable to access camera. Please grant permission.');
    }
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    // Stop capture interval
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }

    // Disconnect streaming if active
    if (useStreaming) {
      humeStreamingService.disconnect();
      setConnectionStatus('disconnected');
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setFaceDetected(false);
    setEmotions([]);
    setDataSource('none');
    console.log('📹 Camera stopped');
  }, [useStreaming]);

  // Connect to Hume streaming when camera starts (streaming mode)
  useEffect(() => {
    if (!useStreaming || !isStreaming || !enabled) return;

    setConnectionStatus('connecting');
    
    humeStreamingService.connect({
      models: ['face'],
      onEmotionUpdate: (newEmotions) => {
        setEmotions(newEmotions);
        setFaceDetected(newEmotions.length > 0);
        setAnalysisCount(prev => prev + 1);
        setDataSource('streaming');
        onEmotionUpdate?.(newEmotions);
      },
      onConnect: () => {
        console.log('✅ Hume streaming connected for video analysis');
        setConnectionStatus('connected');
        setError(null);
      },
      onDisconnect: () => {
        console.log('🔌 Hume streaming disconnected');
        setConnectionStatus('disconnected');
      },
      onError: (err) => {
        console.error('❌ Hume streaming error:', err);
        setError(`Streaming error: ${err.message}`);
        setConnectionStatus('disconnected');
      }
    });

    return () => {
      humeStreamingService.disconnect();
    };
  }, [useStreaming, isStreaming, enabled, onEmotionUpdate]);

  // Capture and send frames to streaming service
  const captureAndStream = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isStreaming) return;
    if (!useStreaming || connectionStatus !== 'connected') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.videoWidth === 0) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current frame
    ctx.drawImage(video, 0, 0);
    
    // Convert to base64 (lower quality for faster streaming)
    const imageData = canvas.toDataURL('image/jpeg', 0.6);
    const base64Data = imageData.replace(/^data:image\/jpeg;base64,/, '');

    // Send to streaming service
    humeStreamingService.sendFrame(base64Data);
  }, [isStreaming, useStreaming, connectionStatus]);

  // Start frame capture interval for streaming mode
  useEffect(() => {
    if (!useStreaming || !isStreaming || connectionStatus !== 'connected') return;

    captureIntervalRef.current = setInterval(captureAndStream, captureInterval);
    console.log(`📸 Started frame capture at ${captureInterval}ms intervals`);

    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
    };
  }, [useStreaming, isStreaming, connectionStatus, captureInterval, captureAndStream]);

  // HTTP-based analysis fallback
  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isStreaming || isAnalyzing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.videoWidth === 0) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current frame
    ctx.drawImage(video, 0, 0);
    
    // Convert to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    const base64Data = imageData.replace(/^data:image\/jpeg;base64,/, '');

    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke('hume-expression-measurement', {
        body: { 
          image: base64Data,
          models: ['face']
        }
      });

      if (error) throw error;

      if (data?.emotions && data.emotions.length > 0) {
        setFaceDetected(true);
        setEmotions(data.emotions);
        setAnalysisCount(prev => prev + 1);
        setDataSource('http');
        
        if (onEmotionUpdate) {
          onEmotionUpdate(data.emotions);
        }

        // Log data source for debugging
        console.log(`🎭 HTTP analysis: ${data.source || 'unknown'} - ${data.emotions[0]?.name}`);
      } else {
        setFaceDetected(false);
      }
    } catch (err) {
      console.error('Expression analysis error:', err);
      // Don't show error for individual frame failures
    } finally {
      setIsAnalyzing(false);
    }
  }, [isStreaming, isAnalyzing, onEmotionUpdate]);

  // Auto-analyze at interval (HTTP mode only)
  useEffect(() => {
    if (!enabled || !isStreaming || useStreaming) return;

    const interval = setInterval(captureAndAnalyze, captureInterval);
    return () => clearInterval(interval);
  }, [enabled, isStreaming, useStreaming, captureInterval, captureAndAnalyze]);

  // Auto-start with pre-obtained stream
  useEffect(() => {
    if (autoStart && preObtainedStream && !isStreaming) {
      startCamera(preObtainedStream);
    }
  }, [autoStart, preObtainedStream, isStreaming, startCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      humeStreamingService.disconnect();
      // Only stop if we created the stream ourselves
      if (!preObtainedStream) {
        stopCamera();
      }
    };
  }, [stopCamera, preObtainedStream]);

  // Get emotion color based on type
  const getEmotionColor = (name: string): string => {
    const colors: Record<string, string> = {
      joy: 'bg-yellow-500',
      happiness: 'bg-yellow-500',
      surprise: 'bg-cyan-500',
      interest: 'bg-blue-500',
      sadness: 'bg-blue-700',
      fear: 'bg-purple-500',
      anger: 'bg-red-500',
      disgust: 'bg-green-600',
      contempt: 'bg-orange-500',
      neutral: 'bg-gray-500'
    };
    return colors[name.toLowerCase()] || 'bg-primary';
  };

  // Get connection status badge
  const getConnectionBadge = () => {
    if (!useStreaming) {
      return (
        <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-400">
          HTTP Mode
        </Badge>
      );
    }

    switch (connectionStatus) {
      case 'connected':
        return (
          <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400">
            <Wifi className="h-3 w-3 mr-1" />
            Live
          </Badge>
        );
      case 'connecting':
        return (
          <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-400">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Connecting
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs bg-red-500/20 text-red-400">
            <WifiOff className="h-3 w-3 mr-1" />
            Offline
          </Badge>
        );
    }
  };

  return (
    <Card className="flex flex-col bg-card/50 backdrop-blur border-border/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Facial Analysis</span>
          {faceDetected && (
            <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400">
              Face Detected
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {getConnectionBadge()}
          {isAnalyzing && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
          <Badge variant="secondary" className="text-xs">
            {analysisCount} frames
          </Badge>
        </div>
      </div>

      {/* Data source indicator */}
      {dataSource !== 'none' && (
        <div className="px-3 py-1 border-b border-border/50 bg-gradient-to-r from-purple-500/10 to-transparent">
          <div className="flex items-center gap-2 text-xs">
            <Zap className="h-3 w-3 text-purple-400" />
            <span className="text-muted-foreground">
              Source: <span className="text-purple-400 font-medium">
                {dataSource === 'streaming' ? 'Hume Real-time Streaming' : 'Hume HTTP API'}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Video container */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Overlay when not streaming */}
        {!isStreaming && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
            <div className="text-center">
              <CameraOff className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Camera Off</p>
            </div>
          </div>
        )}

        {/* Face detection indicator */}
        {isStreaming && faceDetected && (
          <div className="absolute top-2 left-2 right-2">
            <div className="border-2 border-green-500/50 rounded-lg p-1 bg-black/30">
              <div className="flex justify-between text-[10px] text-green-400">
                <span>Face Detected</span>
                <span>{(emotions[0]?.score * 100 || 0).toFixed(0)}% {emotions[0]?.name}</span>
              </div>
            </div>
          </div>
        )}

        {/* Real-time indicator */}
        {isStreaming && useStreaming && connectionStatus === 'connected' && (
          <div className="absolute bottom-2 left-2">
            <Badge className="bg-red-500/80 text-white text-[10px] animate-pulse">
              ● LIVE
            </Badge>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-destructive/20">
            <p className="text-sm text-destructive px-4 text-center">{error}</p>
          </div>
        )}
      </div>

      {/* Emotion results */}
      {emotions.length > 0 && (
        <div className="p-3 border-t border-border/50 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Detected Emotions (Real Hume AI)</p>
          <div className="space-y-1.5">
            {emotions.slice(0, 5).map((emotion) => (
              <div key={emotion.name} className="flex items-center gap-2">
                <span className="text-xs w-20 truncate capitalize">{emotion.name}</span>
                <Progress 
                  value={emotion.score * 100} 
                  className="flex-1 h-2"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {(emotion.score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 p-3 border-t border-border/50">
        {!isStreaming ? (
          <Button onClick={() => startCamera()} className="flex-1">
            <Camera className="h-4 w-4 mr-2" />
            Enable Camera
          </Button>
        ) : (
          <>
            {!useStreaming && (
              <Button onClick={captureAndAnalyze} variant="secondary" disabled={isAnalyzing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
                Analyze
              </Button>
            )}
            <Button onClick={stopCamera} variant="destructive">
              <CameraOff className="h-4 w-4 mr-2" />
              Stop
            </Button>
          </>
        )}
      </div>
    </Card>
  );
};

export default HumeVideoAnalyzer;
