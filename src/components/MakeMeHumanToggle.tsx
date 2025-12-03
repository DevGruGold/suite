import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Mic, Volume2, Camera, 
  Settings, Loader2, CheckCircle2 
} from 'lucide-react';
import { humanizedTTS } from '@/services/humanizedTTSService';
import { useToast } from '@/hooks/use-toast';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import useHumePermissions from '@/hooks/useHumePermissions';
import PermissionRequestDialog from './PermissionRequestDialog';

export type HumeMode = 'tts' | 'voice' | 'multimodal';

export interface HumeState {
  mode: HumeMode;
  isEnabled: boolean;
  audioStream?: MediaStream | null;
  videoStream?: MediaStream | null;
}

interface MakeMeHumanToggleProps {
  onModeChange?: (mode: HumeMode, enabled: boolean, streams?: { audio?: MediaStream; video?: MediaStream }) => void;
  onStateChange?: (state: HumeState) => void;
  className?: string;
}

interface HumeSettings {
  autoConnect: boolean;
  emotionSensitivity: number;
  showEmotions: boolean;
  captureInterval: number;
}

const DEFAULT_SETTINGS: HumeSettings = {
  autoConnect: false,
  emotionSensitivity: 0.5,
  showEmotions: true,
  captureInterval: 1500,
};

export const MakeMeHumanToggle: React.FC<MakeMeHumanToggleProps> = ({ 
  onModeChange,
  onStateChange,
  className = ''
}) => {
  const [mode, setMode] = useState<HumeMode>('tts');
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [settings, setSettings] = useState<HumeSettings>(DEFAULT_SETTINGS);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [pendingMode, setPendingMode] = useState<HumeMode | null>(null);
  const { toast } = useToast();
  
  const {
    micPermission,
    cameraPermission,
    isRequestingMic,
    isRequestingCamera,
    error: permissionError,
    audioStream,
    videoStream,
    requestPermissionsForMode,
    releaseStreams
  } = useHumePermissions();

  useEffect(() => {
    const savedMode = localStorage.getItem('humeMode') as HumeMode | null;
    const savedEnabled = localStorage.getItem('humeEnabled') === 'true';
    const savedSettings = localStorage.getItem('humeSettings');

    if (savedMode) setMode(savedMode);
    if (savedEnabled) {
      setIsEnabled(true);
      humanizedTTS.restoreMode();
    }
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('humeSettings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    onStateChange?.({
      mode,
      isEnabled,
      audioStream: audioStream || undefined,
      videoStream: videoStream || undefined
    });
  }, [audioStream, videoStream, mode, isEnabled, onStateChange]);

  const handleModeChange = async (newMode: HumeMode) => {
    if (newMode === 'voice' || newMode === 'multimodal') {
      const needsMic = newMode === 'voice' || newMode === 'multimodal';
      const needsCamera = newMode === 'multimodal';
      
      const hasMic = micPermission === 'granted';
      const hasCamera = cameraPermission === 'granted';
      
      if ((needsMic && !hasMic) || (needsCamera && !hasCamera)) {
        setPendingMode(newMode);
        setShowPermissionDialog(true);
        return;
      }
      
      const hasAudioStream = !!audioStream;
      const hasVideoStream = !!videoStream;
      
      if ((needsMic && !hasAudioStream) || (needsCamera && !hasVideoStream)) {
        await requestPermissionsForMode(newMode);
      }
    }
    
    completeModeSw(newMode);
  };

  const completeModeSw = (newMode: HumeMode) => {
    setMode(newMode);
    localStorage.setItem('humeMode', newMode);
    
    const streams = { audio: audioStream || undefined, video: videoStream || undefined };
    
    if (isEnabled) {
      onModeChange?.(newMode, true, streams);
    }
    
    onStateChange?.({
      mode: newMode,
      isEnabled,
      audioStream: audioStream || undefined,
      videoStream: videoStream || undefined
    });
  };

  const handlePermissionRequest = async () => {
    if (!pendingMode) return;
    
    const success = await requestPermissionsForMode(pendingMode);
    
    if (success) {
      setShowPermissionDialog(false);
      completeModeSw(pendingMode);
      setPendingMode(null);
      
      toast({
        title: "Permissions Granted",
        description: pendingMode === 'multimodal' 
          ? "Camera and microphone access enabled"
          : "Microphone access enabled"
      });
    }
  };

  const handleToggleEnabled = async () => {
    if (isEnabled) {
      setIsEnabled(false);
      localStorage.setItem('humeEnabled', 'false');
      humanizedTTS.disableHumanizedMode();
      onModeChange?.(mode, false);
      onStateChange?.({
        mode,
        isEnabled: false,
        audioStream: audioStream || undefined,
        videoStream: videoStream || undefined
      });
      toast({
        title: "Voice Intelligence Disabled",
        description: "Reverted to standard mode"
      });
    } else {
      setIsLoading(true);
      
      try {
        const success = await humanizedTTS.enableHumanizedMode();
        
        if (success) {
          setIsEnabled(true);
          localStorage.setItem('humeEnabled', 'true');
          onModeChange?.(mode, true);
          onStateChange?.({
            mode,
            isEnabled: true,
            audioStream: audioStream || undefined,
            videoStream: videoStream || undefined
          });
          toast({
            title: getModeTitle(mode),
            description: getModeDescription(mode)
          });
        } else {
          toast({
            title: "Connection Failed",
            description: "Could not connect. Check configuration.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Enable error:', error);
        toast({
          title: "Error",
          description: "Failed to activate voice intelligence",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const getModeTitle = (m: HumeMode): string => {
    switch (m) {
      case 'tts': return 'Voice Active';
      case 'voice': return 'Voice Chat Active';
      case 'multimodal': return 'Full Mode Active';
    }
  };

  const getModeDescription = (m: HumeMode): string => {
    switch (m) {
      case 'tts': return 'Empathic voice synthesis enabled';
      case 'voice': return 'Real-time voice conversation';
      case 'multimodal': return 'Voice + video with emotion tracking';
    }
  };

  const handleTestVoice = async () => {
    setIsTesting(true);
    try {
      const testMessage = isEnabled 
        ? "Voice intelligence is active. I can understand and respond with empathy."
        : "Standard voice mode active. Enable for enhanced voice.";
      
      await humanizedTTS.speak({ text: testMessage });
      toast({
        title: "Voice Test Complete",
        description: isEnabled ? "Enhanced voice working" : "Standard voice working"
      });
    } catch (error) {
      console.error('Voice test failed:', error);
      toast({
        title: "Voice Test Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <>
      <PermissionRequestDialog
        open={showPermissionDialog}
        onOpenChange={(open) => {
          setShowPermissionDialog(open);
          if (!open) setPendingMode(null);
        }}
        mode={pendingMode || 'voice'}
        onRequestPermissions={handlePermissionRequest}
        isRequesting={isRequestingMic || isRequestingCamera}
        micPermission={micPermission}
        cameraPermission={cameraPermission}
        error={permissionError}
      />
      
      <div className={`flex flex-col gap-2 px-4 py-3 bg-muted/30 border-b border-border/60 ${className}`}>
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-primary animate-pulse-subtle' : 'bg-muted-foreground/30'}`} />
            <span className="text-sm font-medium text-foreground">Voice Intelligence</span>
            {isEnabled && (
              <Badge variant="secondary" className="text-[10px]">
                {mode === 'multimodal' ? 'Full' : mode === 'voice' ? 'Voice' : 'TTS'}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Test button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTestVoice}
              disabled={isTesting || isLoading}
              className="h-7 w-7 p-0"
            >
              {isTesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
            </Button>

            {/* Settings popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Voice Settings</h4>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="auto-connect" className="text-xs">Auto-connect</Label>
                      <Switch
                        id="auto-connect"
                        checked={settings.autoConnect}
                        onCheckedChange={(v) => setSettings(s => ({ ...s, autoConnect: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="show-emotions" className="text-xs">Show emotions</Label>
                      <Switch
                        id="show-emotions"
                        checked={settings.showEmotions}
                        onCheckedChange={(v) => setSettings(s => ({ ...s, showEmotions: v }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Emotion sensitivity</Label>
                      <Slider
                        value={[settings.emotionSensitivity * 100]}
                        onValueChange={([v]) => setSettings(s => ({ ...s, emotionSensitivity: v / 100 }))}
                        max={100}
                        step={10}
                      />
                    </div>

                    {mode === 'multimodal' && (
                      <div className="space-y-2">
                        <Label className="text-xs">Capture interval</Label>
                        <Slider
                          value={[settings.captureInterval]}
                          onValueChange={([v]) => setSettings(s => ({ ...s, captureInterval: v }))}
                          min={500}
                          max={3000}
                          step={250}
                        />
                        <span className="text-[10px] text-muted-foreground">{settings.captureInterval}ms</span>
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Enable/Disable button */}
            <Button
              variant={isEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={handleToggleEnabled}
              disabled={isLoading}
              className="h-7 px-3 text-xs"
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              {isLoading ? 'Connecting...' : isEnabled ? 'Active' : 'Enable'}
            </Button>
          </div>
        </div>

        {/* Mode selector tabs */}
        <Tabs value={mode} onValueChange={(v) => handleModeChange(v as HumeMode)} className="w-full">
          <TabsList className="w-full h-8 bg-background/50">
            <TabsTrigger 
              value="tts" 
              className="flex-1 h-7 text-xs data-[state=active]:bg-primary/10"
            >
              <Volume2 className="h-3 w-3 mr-1" />
              TTS
            </TabsTrigger>
            <TabsTrigger 
              value="voice" 
              className="flex-1 h-7 text-xs data-[state=active]:bg-primary/10"
            >
              <Mic className="h-3 w-3 mr-1" />
              Voice
              {micPermission === 'granted' && <CheckCircle2 className="h-2.5 w-2.5 ml-1 text-suite-success" />}
            </TabsTrigger>
            <TabsTrigger 
              value="multimodal" 
              className="flex-1 h-7 text-xs data-[state=active]:bg-primary/10"
            >
              <Camera className="h-3 w-3 mr-1" />
              Full
              {micPermission === 'granted' && cameraPermission === 'granted' && (
                <CheckCircle2 className="h-2.5 w-2.5 ml-1 text-suite-success" />
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Mode description */}
        <p className="text-[11px] text-muted-foreground">
          {mode === 'tts' && 'Empathic voice synthesis for responses'}
          {mode === 'voice' && 'Real-time voice conversation'}
          {mode === 'multimodal' && 'Voice + camera with emotion tracking'}
        </p>
      </div>
    </>
  );
};

export default MakeMeHumanToggle;