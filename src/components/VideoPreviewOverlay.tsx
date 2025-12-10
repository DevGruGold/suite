import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Minimize2, Maximize2, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface VideoPreviewOverlayProps {
  videoStream: MediaStream;
  onClose: () => void;
  onEmotionDetected?: (emotions: { name: string; score: number }[]) => void;
  emotions?: { name: string; score: number }[];
  className?: string;
}

export const VideoPreviewOverlay: React.FC<VideoPreviewOverlayProps> = ({
  videoStream,
  onClose,
  onEmotionDetected,
  emotions = [],
  className
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const analysisIntervalRef = useRef<NodeJS.Timeout>();

  // Attach video stream to video element
  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream]);

  // Emotion analysis loop
  useEffect(() => {
    if (!onEmotionDetected) return;

    const analyzeFrame = async () => {
      if (!videoRef.current || !canvasRef.current || isAnalyzing) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx || video.readyState !== 4) return;

      setIsAnalyzing(true);

      try {
        // Capture frame
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        
        // Convert to base64
        const imageData = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];

        // Call emotion analysis
        const { data, error } = await supabase.functions.invoke('hume-expression-measurement', {
          body: { image: imageData }
        });

        if (!error && data?.emotions) {
          onEmotionDetected(data.emotions);
        }
      } catch (err) {
        console.error('Emotion analysis error:', err);
      } finally {
        setIsAnalyzing(false);
      }
    };

    // Analyze every 2 seconds
    analysisIntervalRef.current = setInterval(analyzeFrame, 2000);
    
    // Initial analysis
    setTimeout(analyzeFrame, 500);

    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
    };
  }, [onEmotionDetected, isAnalyzing]);

  // Get emotion emoji
  const getEmotionEmoji = (emotionName: string): string => {
    const emojiMap: Record<string, string> = {
      joy: '😊',
      happiness: '😊',
      sadness: '😢',
      anger: '😠',
      fear: '😨',
      surprise: '😮',
      disgust: '🤢',
      contempt: '😒',
      neutral: '😐',
      excitement: '🤩',
      interest: '🤔',
      confusion: '😕',
      concentration: '🧐',
      admiration: '🥰',
      amusement: '😄'
    };
    return emojiMap[emotionName.toLowerCase()] || '😐';
  };

  if (isMinimized) {
    return (
      <div 
        className={cn(
          "fixed bottom-24 right-4 z-50",
          "w-16 h-16 rounded-full overflow-hidden",
          "border-2 border-purple-500 shadow-lg cursor-pointer",
          "hover:scale-110 transition-transform",
          className
        )}
        onClick={() => setIsMinimized(false)}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        {emotions.length > 0 && (
          <div className="absolute bottom-0 right-0 bg-background/80 rounded-tl-lg px-1">
            <span className="text-xs">{getEmotionEmoji(emotions[0].name)}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-24 right-4 z-50",
      "w-64 bg-background/95 backdrop-blur-md rounded-xl overflow-hidden",
      "border border-purple-500/50 shadow-xl",
      "animate-in slide-in-from-right-4 duration-300",
      className
    )}>
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-purple-500/20 border-b border-purple-500/30">
        <div className="flex items-center gap-2">
          <Smile className="h-4 w-4 text-purple-400" />
          <span className="text-xs font-medium text-purple-300">Emotion Analysis</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMinimized(true)}
            className="h-6 w-6 hover:bg-purple-500/20"
          >
            <Minimize2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 hover:bg-destructive/20 text-destructive"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Video preview */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        
        {/* Analysis indicator */}
        {isAnalyzing && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/50 rounded-full px-2 py-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
            <span className="text-[10px] text-white">Analyzing</span>
          </div>
        )}
      </div>

      {/* Emotion display */}
      {emotions.length > 0 && (
        <div className="p-2 space-y-1">
          {emotions.slice(0, 3).map((emotion, index) => (
            <div key={emotion.name} className="flex items-center gap-2">
              <span className="text-base">{getEmotionEmoji(emotion.name)}</span>
              <span className="text-xs flex-1 capitalize">{emotion.name}</span>
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(emotion.score * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground w-8">
                {Math.round(emotion.score * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoPreviewOverlay;
