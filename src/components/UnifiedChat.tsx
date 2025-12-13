import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { AdaptiveAvatar } from './AdaptiveAvatar';
import { useLanguage } from '@/contexts/LanguageContext';
import { ReasoningSteps, type ReasoningStep } from './ReasoningSteps';
// 🎤 TTS is now language-aware: English (en) / Spanish (es)
import { GitHubPATInput } from './GitHubContributorRegistration';
import { GitHubTokenStatus } from './GitHubTokenStatus';
import { mobilePermissionService } from '@/services/mobilePermissionService';
import { formatTime } from '@/utils/dateFormatter';
import { Send, Volume2, VolumeX, Trash2, Key, Wifi, Users, Vote, Paperclip, X } from 'lucide-react';
import { AttachmentPreview, type AttachmentFile } from './AttachmentPreview';
import { QuickResponseButtons } from './QuickResponseButtons';
import { ExecutiveCouncilChat } from './ExecutiveCouncilChat';
import { GovernanceStatusBadge } from './GovernanceStatusBadge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { MakeMeHumanToggle, HumeState, HumeMode } from './MakeMeHumanToggle';
import { HumeChatControls } from './HumeChatControls';
import { enhancedTTS } from '@/services/enhancedTTSService';
import { humanizedTTS } from '@/services/humanizedTTSService';
import { speechLearningService } from '@/services/speechLearningService';
import { supabase } from '@/integrations/supabase/client';
// Toast removed for lighter UI
import type { RealtimeChannel } from '@supabase/supabase-js';

// Services
import { realtimeManager } from '@/services/realtimeSubscriptionManager';
import { UnifiedElizaService } from '@/services/unifiedElizaService';
import { unifiedDataService, type MiningStats, type UserContext } from '@/services/unifiedDataService';
import { unifiedFallbackService } from '@/services/unifiedFallbackService';
import { conversationPersistence } from '@/services/conversationPersistenceService';
import { quickGreetingService } from '@/services/quickGreetingService';
import { apiKeyManager } from '@/services/apiKeyManager';
import { memoryContextService } from '@/services/memoryContextService';
import { learningPatternsService } from '@/services/learningPatternsService';
import { knowledgeEntityService } from '@/services/knowledgeEntityService';

// Debug environment variables on component load
console.log('UnifiedChat Environment Check:', {
  VITE_GEMINI_API_KEY_exists: !!import.meta.env.VITE_GEMINI_API_KEY,
  VITE_GEMINI_API_KEY_length: import.meta.env.VITE_GEMINI_API_KEY?.length || 0,
  VITE_ELEVENLABS_API_KEY_exists: !!import.meta.env.VITE_ELEVENLABS_API_KEY,
  all_env_vars: Object.keys(import.meta.env).filter(key => key.startsWith('VITE_'))
});

interface UnifiedMessage {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  attachments?: {
    images?: string[];
    audio?: Blob;
    transcript?: string;
  };
  emotionalContext?: {
    voiceTone?: string;
    facialExpression?: string;
    confidenceLevel?: number;
  };
  emotion?: string;
  confidence?: number;
  tool_calls?: Array<{
    id: string;
    function_name: string;
    status: 'pending' | 'success' | 'failed';
    execution_time_ms?: number;
  }>;
  reasoning?: ReasoningStep[];
  executive?: 'vercel-ai-chat' | 'deepseek-chat' | 'gemini-chat' | 'openai-chat' | 'lovable-chat';
  executiveTitle?: string;
  providerUsed?: string; // AI provider that generated the response (e.g., 'Gemini', 'DeepSeek', 'Lovable AI')
  isCouncilDeliberation?: boolean;
  councilDeliberation?: any;
}

// MiningStats imported from unifiedDataService
import { ExecutiveName, EXECUTIVE_PROFILES } from './ExecutiveBio';

interface UnifiedChatProps {
  apiKey?: string;
  className?: string;
  miningStats?: MiningStats;
  selectedExecutive?: ExecutiveName; // Target specific executive (bypasses intelligent routing)
  defaultCouncilMode?: boolean; // Start in council mode
  onBack?: () => void; // Callback to return to directory view
}

// Internal component using ElevenLabs and Gemini

const UnifiedChatInner: React.FC<UnifiedChatProps> = ({
  apiKey = import.meta.env.VITE_GEMINI_API_KEY || "",
  className = '',
  miningStats: externalMiningStats,
  selectedExecutive,
  defaultCouncilMode = false,
  onBack
}) => {
  // Core state
  const { language } = useLanguage();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [conversationSummaries, setConversationSummaries] = useState<Array<{ summaryText: string; messageCount: number; createdAt: Date }>>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [totalMessageCount, setTotalMessageCount] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnected, setIsConnected] = useState(true); // Always connected for text/TTS mode
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  
  // Office Clerk loading progress
  const [officeClerkProgress, setOfficeClerkProgress] = useState<{
    status: string;
    progress: number;
    message: string;
    currentModel?: string;
    webGPUSupported?: boolean;
    error?: string;
  } | null>(null);

  // Voice/TTS state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    // Check if user previously enabled voice
    return localStorage.getItem('audioEnabled') === 'true';
  });
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [currentAIMethod, setCurrentAIMethod] = useState<string>('');
  const [currentTTSMethod, setCurrentTTSMethod] = useState<string>('');
  const [isHumanizedMode, setIsHumanizedMode] = useState(false);

  // Lazy TTS initialization - only when user enables voice
  // Removed auto-initialization to improve page load performance

  // API Key Management state
  const [showAPIKeyInput, setShowAPIKeyInput] = useState(false);
  const [needsAPIKey, setNeedsAPIKey] = useState(false);

  const [currentEmotion, setCurrentEmotion] = useState<string>('');
  const [emotionConfidence, setEmotionConfidence] = useState<number>(0);

  // Real-time emotional context - combines voice and facial emotions
  const [emotionalContext, setEmotionalContext] = useState<{
    currentEmotion: string;
    emotionConfidence: number;
    voiceEmotions?: Array<{ name: string; score: number }>;
    facialEmotions?: Array<{ name: string; score: number }>;
    lastUpdate: number;
  } | null>(null);

  // XMRT context state - using unified service
  const [miningStats, setMiningStats] = useState<MiningStats | null>(externalMiningStats || null);
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [lastElizaMessage, setLastElizaMessage] = useState<string>("");
  
  // Council mode state - initialize from prop
  const [councilMode, setCouncilMode] = useState<boolean>(defaultCouncilMode);

  // Hume controls state
  const [humeState, setHumeState] = useState<HumeState>({
    mode: 'tts',
    isEnabled: false,
    audioStream: null,
    videoStream: null
  });

  // File attachment state
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // File handling functions
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const MAX_FILES = 5;
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB

    const newAttachments: AttachmentFile[] = [];

    for (const file of files.slice(0, MAX_FILES - attachments.length)) {
      if (file.size > MAX_SIZE) {
        console.warn(`File ${file.name} exceeds 10MB limit`);
        continue;
      }

      const type: AttachmentFile['type'] = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
        ? 'audio'
        : file.type.startsWith('video/')
        ? 'video'
        : 'document';

      const url = URL.createObjectURL(file);
      newAttachments.push({ type, url, name: file.name, file });
    }

    setAttachments(prev => [...prev, ...newAttachments].slice(0, MAX_FILES));
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const removed = prev[index];
      if (removed) {
        URL.revokeObjectURL(removed.url);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearAttachments = () => {
    attachments.forEach(att => URL.revokeObjectURL(att.url));
    setAttachments([]);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Video frame capture for multimodal mode
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [latestVideoFrame, setLatestVideoFrame] = useState<string | null>(null);
  const continuousCaptureRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pre-initialize video element when multimodal mode activates
  useEffect(() => {
    if (humeState?.mode === 'multimodal' && humeState?.videoStream && !videoRef.current) {
      console.log('🎬 Pre-initializing video for multimodal mode...');
      const video = document.createElement('video');
      video.srcObject = humeState.videoStream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true; // Required for autoplay
      videoRef.current = video;
      
      video.onloadeddata = () => {
        console.log('🎬 Video data loaded, readyState:', video.readyState);
        setVideoReady(true);
      };
      
      video.play().then(() => {
        console.log('🎬 Video pre-initialized and playing for multimodal mode');
      }).catch(err => {
        console.error('Video pre-initialization failed:', err);
      });
    }
    
    // Cleanup when mode changes or stream ends
    if (humeState?.mode !== 'multimodal' || !humeState?.videoStream) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current = null;
        setVideoReady(false);
      }
    }
  }, [humeState?.mode, humeState?.videoStream]);

  // Continuous video frame capture every 3 seconds in multimodal mode
  useEffect(() => {
    if (humeState?.mode === 'multimodal' && humeState?.videoStream && videoReady) {
      console.log('👁️ Starting continuous video capture (every 3s)');
      
      const captureFrame = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        
        try {
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth || 640;
          canvas.height = videoRef.current.videoHeight || 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const frame = canvas.toDataURL('image/jpeg', 0.7);
            setLatestVideoFrame(frame);
            console.log('📸 Continuous capture: frame updated');
          }
        } catch (err) {
          console.error('Continuous capture error:', err);
        }
      };
      
      // Capture immediately, then every 3 seconds
      captureFrame();
      continuousCaptureRef.current = setInterval(captureFrame, 3000);
      
      return () => {
        if (continuousCaptureRef.current) {
          clearInterval(continuousCaptureRef.current);
          continuousCaptureRef.current = null;
        }
      };
    } else {
      // Clear capture when not in multimodal mode
      if (continuousCaptureRef.current) {
        clearInterval(continuousCaptureRef.current);
        continuousCaptureRef.current = null;
      }
      setLatestVideoFrame(null);
    }
  }, [humeState?.mode, humeState?.videoStream, videoReady]);
  
  const captureVideoFrame = useCallback(async (): Promise<string | null> => {
    // Use pre-captured frame if available (from continuous capture)
    if (latestVideoFrame) {
      console.log('📸 Using pre-captured continuous frame');
      return latestVideoFrame;
    }
    
    console.log('📹 Video capture attempt:', {
      mode: humeState?.mode,
      hasVideoStream: !!humeState?.videoStream,
      videoRefExists: !!videoRef.current,
      videoReady,
      readyState: videoRef.current?.readyState
    });
    
    if (!humeState?.videoStream) {
      console.log('⚠️ No video stream available');
      return null;
    }
    
    try {
      // Create video element if needed and wait for it to be ready
      if (!videoRef.current) {
        console.log('🎬 Creating video element on-demand...');
        const video = document.createElement('video');
        video.srcObject = humeState.videoStream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        videoRef.current = video;
        
        // Wait for video to be ready with timeout
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video load timeout')), 3000);
          video.onloadeddata = () => {
            clearTimeout(timeout);
            setVideoReady(true);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Video load failed'));
          };
          video.play().catch(reject);
        });
      }
      
      const video = videoRef.current;
      
      // Ensure video is ready
      if (video.readyState < 2) {
        console.log('⏳ Video not ready yet, waiting...', video.readyState);
        await new Promise<void>((resolve) => {
          const checkReady = () => {
            if (video.readyState >= 2) {
              resolve();
            } else {
              setTimeout(checkReady, 100);
            }
          };
          setTimeout(checkReady, 100);
          // Timeout after 2 seconds
          setTimeout(resolve, 2000);
        });
      }
      
      // Capture frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('Failed to get canvas context');
        return null;
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      console.log('📸 Successfully captured video frame:', canvas.width, 'x', canvas.height);
      return dataUrl;
    } catch (error) {
      console.error('Failed to capture video frame:', error);
      return null;
    }
  }, [humeState?.videoStream, humeState?.mode, videoReady, latestVideoFrame]);

  // Clean up video element on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }
    };
  }, []);

  // Enable audio after user interaction (required for mobile browsers)
  const handleEnableAudio = async () => {
    try {
      await enhancedTTS.initialize();
      setAudioInitialized(true);
      setVoiceEnabled(true);
      localStorage.setItem('audioEnabled', 'true');
      console.log('✅ Audio enabled by user with fallback TTS');
    } catch (error) {
      console.error('Failed to enable audio:', error);
    }
  };

  // Auto-initialize TTS on mount for immediate use
  useEffect(() => {
    const initializeTTS = async () => {
      const wasEnabled = localStorage.getItem('audioEnabled') === 'true';
      if (wasEnabled) {
        await handleEnableAudio();
      } else {
        // Initialize TTS silently so it's ready when user sends first message
        try {
          await enhancedTTS.initialize();
          await humanizedTTS.restoreMode();
          setIsHumanizedMode(humanizedTTS.isHumanized());
          setAudioInitialized(true);
          console.log('✅ TTS pre-initialized and ready');
        } catch (error) {
          console.log('TTS pre-initialization failed, will retry on first message:', error);
        }
      }
    };
    
    initializeTTS();
  }, []);

  // Auto-scroll within chat container only (no page-level scrolling)
  useEffect(() => {
    // Only scroll if there are messages and not just loading
    if (messages.length > 0 && !isProcessing) {
      // Use setTimeout to ensure DOM updates are complete
      setTimeout(() => {
        // Only scroll within the chat container itself
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
        // Removed scrollIntoView to prevent page-level scrolling
        // User stays at their current position on the page
      }, 100);
    }
  }, [messages, isProcessing]);

  // Initialize unified data service and conversation persistence with full Supabase integration
  useEffect(() => {
    const initialize = async () => {
      try {
        const [userCtx, miningData] = await Promise.all([
          unifiedDataService.getUserContext(),
          externalMiningStats || unifiedDataService.getMiningStats()
        ]);
        
        setUserContext(userCtx);
        if (!externalMiningStats) {
          setMiningStats(miningData);
        }

        // Initialize conversation session (creates or resumes from conversation_sessions)
        try {
          await conversationPersistence.initializeSession();
          
          // Load conversation context (summaries from conversation_summaries table)
          const context = await conversationPersistence.getConversationContext(0);
          
          if (context.summaries.length > 0 || context.totalMessageCount > 0) {
            setConversationSummaries(context.summaries);
            setHasMoreMessages(context.totalMessageCount > 0);
            setTotalMessageCount(context.totalMessageCount);
            
            console.log(`📚 Found ${context.summaries.length} summaries for ${context.totalMessageCount} total messages`);
          }

          // Load enhanced Supabase backend data
          if (userCtx?.ip) {
            // Load user preferences from user_preferences table
            const preferences = await conversationPersistence.getUserPreferences();
            console.log('⚙️ User preferences:', Object.keys(preferences).length, 'items');

            // Load memory contexts from memory_contexts table (semantic search)
            const memoryContexts = await memoryContextService.getRelevantContexts(userCtx.ip, 5);
            console.log('🧠 Memory contexts:', memoryContexts.length, 'items');

            // Load learning patterns from interaction_patterns table
            const learningPatterns = await learningPatternsService.getHighConfidencePatterns(0.7);
            console.log('📊 Learning patterns:', learningPatterns.length, 'patterns');

            // Load knowledge entities from knowledge_entities table
            const miningEntities = await knowledgeEntityService.getEntitiesByType('mining_concept');
            const daoEntities = await knowledgeEntityService.getEntitiesByType('dao_concept');
            console.log('🏷️ Knowledge entities:', miningEntities.length + daoEntities.length, 'entities');
          }
        } catch (error) {
          console.log('Conversation persistence error:', error);
        }

        // Periodic refresh for mining stats
        if (!externalMiningStats) {
          const interval = setInterval(async () => {
            const freshStats = await unifiedDataService.getMiningStats();
            setMiningStats(freshStats);
          }, 30000);
          return () => clearInterval(interval);
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };
    
    initialize();
  }, []);

  // Set up realtime subscriptions for live updates
  useEffect(() => {
    if (!userContext?.ip) return;

    console.log('🔴 Setting up realtime subscriptions');
    const unsubscribers: Array<() => void> = [];

    // Subscribe to conversation messages (broadcast channel for this session)
    const messagesUnsub = realtimeManager.subscribe(
      'conversation_messages',
      (payload) => {
        const msg = payload.new;
        if (msg && msg.message_type === 'assistant') {
          const newMessage: UnifiedMessage = {
            id: msg.id,
            content: msg.content,
            sender: 'assistant',
            timestamp: new Date(msg.timestamp)
          };
          setMessages(prev => [...prev, newMessage]);
        }
      },
      { event: 'INSERT', schema: 'public' }
    );
    unsubscribers.push(messagesUnsub);

    // Subscribe to workflow executions
    const workflowUnsub = realtimeManager.subscribe(
      'workflow_executions',
      (payload) => {
        const workflow = payload.new as Record<string, any>;
        if (workflow.status === 'completed' && workflow.final_result) {
          const synthesisPrompt = `Workflow "${workflow.name}" completed:\n${JSON.stringify(workflow.final_result, null, 2)}\n\nSynthesize this into a clear answer.`;
          handleSynthesizeWorkflowResult(synthesisPrompt, workflow);
        }
      },
      { event: '*', schema: 'public' }
    );
    unsubscribers.push(workflowUnsub);

    // Subscribe to activity log
    const activityUnsub = realtimeManager.subscribe(
      'eliza_activity_log',
      (payload) => {
        const activity = payload.new as Record<string, any>;
        if (activity.activity_type === 'agent_spawned') {
          console.log('🤖 Agent spawned:', activity.title);
        }
      },
      { event: 'INSERT', schema: 'public' }
    );
    unsubscribers.push(activityUnsub);

    setRealtimeConnected(true);
    return () => unsubscribers.forEach(unsub => unsub());
  }, [userContext?.ip]);

  // Subscribe to Office Clerk loading progress
  useEffect(() => {
    const subscribeToOfficeClerk = async () => {
      try {
        const { MLCLLMService } = await import('@/services/mlcLLMService');
        
        // Subscribe to progress updates
        const unsubscribe = MLCLLMService.subscribeToProgress((progress) => {
          setOfficeClerkProgress(progress);
          
          // Also expose to window for error handler
          (window as any).__mlcProgress = progress;
        });
        
        return unsubscribe;
      } catch (error) {
        console.log('Office Clerk not available:', error);
        return () => {};
      }
    };
    
    subscribeToOfficeClerk().then(unsub => {
      return () => unsub();
    });
  }, []);

  // Generate immediate greeting when user context is available
  useEffect(() => {
    if (userContext && messages.length === 0) {
      generateQuickGreeting();
    }
  }, [userContext, conversationSummaries]);

  const generateQuickGreeting = () => {
    // Show immediate greeting without waiting for AI
    const cachedSummary = quickGreetingService.getCachedConversationSummary();
    
    const quickGreeting = quickGreetingService.generateQuickGreeting({
      isFounder: userContext?.isFounder,
      conversationSummary: cachedSummary?.summary || (conversationSummaries.length > 0 ? conversationSummaries[conversationSummaries.length - 1].summaryText : undefined),
      totalMessageCount: cachedSummary?.messageCount || totalMessageCount,
      miningStats
    });
    
    const greeting: UnifiedMessage = {
      id: 'quick-greeting',
      content: quickGreeting,
      sender: 'assistant',
      timestamp: new Date()
    };
    
    setMessages([greeting]);
    setLastElizaMessage(quickGreeting);
    
    // Store greeting in persistent storage (non-blocking)
    conversationPersistence.storeMessage(quickGreeting, 'assistant', {
      type: 'quick-greeting',
      isReturnUser: conversationSummaries.length > 0,
      totalPreviousMessages: totalMessageCount
    }).catch(error => {
      console.log('Conversation persistence error:', error);
    });
  };

  // Clear conversation history
  const handleSynthesizeWorkflowResult = async (prompt: string, workflow: any) => {
    try {
      console.log('🔄 Synthesizing workflow result with Eliza...');
      
      // Get full conversation context
      const fullContext = await conversationPersistence.getFullConversationContext();
      
      const response = await UnifiedElizaService.generateResponse(prompt, {
        miningStats,
        userContext,
        inputMode: 'text',
        shouldSpeak: false,
        enableBrowsing: false,
        conversationContext: fullContext,
        councilMode: false
      }, language);
      
      const responseText = typeof response === 'string' ? response : response.deliberation.synthesis;
      
      // Display Eliza's synthesized answer
      const elizaMessage: UnifiedMessage = {
        id: `workflow-result-${workflow.id}`,
        content: responseText,
        sender: 'assistant',
        timestamp: new Date()
      };
      
      setMessages(prev => {
        if (prev.some(m => m.id === elizaMessage.id)) return prev;
        return [...prev, elizaMessage];
      });
      
      console.log('✅ Workflow result synthesized and displayed');
      
      // Store the synthesized result
      try {
        await conversationPersistence.storeMessage(responseText, 'assistant', {
          confidence: 0.95,
          method: 'Workflow Synthesis',
          workflow_id: workflow.id
        });
      } catch (error) {
        console.log('Failed to store workflow synthesis:', error);
      }
    } catch (error) {
      console.error('❌ Failed to synthesize workflow result:', error);
      // Fallback: show a simple message
      setMessages(prev => [...prev, {
        id: `workflow-fallback-${workflow.id}`,
        content: `✅ Background task "${workflow.name}" completed. Check the Task Visualizer for details.`,
        sender: 'assistant',
        timestamp: new Date()
      }]);
    }
  };

  const handleClearConversation = async () => {
    if (!confirm('Are you sure you want to clear the entire conversation history? This cannot be undone.')) {
      return;
    }

    try {
      await conversationPersistence.clearConversationHistory();
      
      // Reset local state
      setMessages([]);
      setConversationSummaries([]);
      setHasMoreMessages(false);
      setTotalMessageCount(0);
      setLastElizaMessage('');
      
      // Generate new greeting for fresh start
      if (userContext) {
        const greeting: UnifiedMessage = {
          id: 'fresh-greeting',
          content: "Hello! I'm Eliza, your XMRT assistant. How can I help you today?",
          sender: 'assistant',
          timestamp: new Date()
        };
        
        setMessages([greeting]);
        setLastElizaMessage(greeting.content);
        
        // Store new greeting
        await conversationPersistence.storeMessage(greeting.content, 'assistant', {
          type: 'fresh-start-greeting'
        });
      }
      
      console.log('✅ Conversation cleared and reset');
    } catch (error) {
      console.error('Failed to clear conversation:', error);
      // Show error to user
      const errorMessage: UnifiedMessage = {
        id: `error-${Date.now()}`,
        content: 'Failed to clear conversation history. Please try again.',
        sender: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Load more messages for pagination
  const loadMoreMessages = async () => {
    if (loadingMoreMessages || !hasMoreMessages) return;
    
    setLoadingMoreMessages(true);
    try {
      // Load recent messages from the database (this replaces the current empty state)
      const recentMessages = await conversationPersistence.getRecentConversationHistory(20);
      if (recentMessages.length > 0) {
        const convertedMessages: UnifiedMessage[] = recentMessages.map(msg => ({
          id: msg.id,
          content: msg.content,
          sender: msg.sender,
          timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
          ...msg.metadata
        }));
        
        // Replace the greeting with actual conversation history
        setMessages(prev => {
          // Keep the greeting if it exists, then add the history
          const greeting = prev.find(msg => msg.id === 'greeting');
          return greeting ? [greeting, ...convertedMessages] : convertedMessages;
        });
      }
      
      // After loading first batch, enable normal pagination
      setHasMoreMessages(recentMessages.length >= 20 && recentMessages.length < totalMessageCount);
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setLoadingMoreMessages(false);
    }
  };

  // XMRT Knowledge Base Integration Functions
  const fetchMiningStats = async () => {
    try {
      const response = await fetch(
        "https://www.supportxmr.com/api/miner/46UxNFuGM2E3UwmZWWJicaRPoRwqwW4byQkaTHkX8yPcVihp91qAVtSFipWUGJJUyTXgzSqxzDQtNLf2bsp2DX2qCCgC5mg/stats"
      );
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      
      setMiningStats({
        hashRate: data.hash || 0,
        validShares: data.validShares || 0,
        totalHashes: data.totalHashes || 0,
        amountDue: (data.amtDue || 0) / 1000000000000,
        amountPaid: (data.amtPaid || 0) / 1000000000000,
        isOnline: data.lastHash > (Date.now() / 1000) - 300,
        lastUpdate: new Date()
      });
    } catch (err) {
      console.error('Failed to fetch mining stats:', err);
      // Keep using unified service for consistency
    }
  };

  // Remove old IP function - using unified service
  // const fetchUserIP = async () => { ... removed ... };

  // Helper functions using unified service
  const isFounder = () => {
    return userContext?.isFounder || false;
  };

  const formatHashrate = (hashrate: number): string => {
    return unifiedDataService.formatMiningStats({ hashRate: hashrate } as MiningStats).split('\n')[1] || `${hashrate} H/s`;
  };

  // Unified response display with intelligent TTS control
  // 🔊 ALWAYS use TTS - Eliza ALWAYS speaks her responses in the selected language
  const displayResponse = async (responseText: string, shouldSpeak: boolean = false) => {
    const elizaMessage: UnifiedMessage = {
      id: `eliza-${Date.now()}`,
      content: responseText,
      sender: 'assistant',
      timestamp: new Date(),
      emotion: currentEmotion,
      confidence: emotionConfidence
    };

    setMessages(prev => [...prev, elizaMessage]);
    setLastElizaMessage(responseText);

    // Use TTS if requested and voice is enabled - auto-initialize if needed
    if (shouldSpeak && voiceEnabled) {
      try {
        // Ensure TTS is initialized
        if (!audioInitialized) {
          await enhancedTTS.initialize();
          setAudioInitialized(true);
        }
        
        setIsSpeaking(true);
        
        // Use humanized TTS if enabled
        await humanizedTTS.speak({
          text: responseText,
          emotion: currentEmotion,
          language
        });
        
        setCurrentTTSMethod(isHumanizedMode ? 'Hume AI EVI' : 'Browser Web Speech');
        console.log(`🎵 TTS Method: ${isHumanizedMode ? 'Humanized' : 'Browser'}`);
        setIsSpeaking(false);
      } catch (error) {
        console.error('❌ TTS error:', error, 'Audio unavailable. Check browser permissions.');
        setIsSpeaking(false);
      }
    }
  };

  // Handler to update emotional context from voice or video
  const handleEmotionUpdate = useCallback((emotions: { name: string; score: number }[], source: 'voice' | 'facial' = 'voice') => {
    const primaryEmotion = emotions[0];
    
    setEmotionalContext(prev => ({
      currentEmotion: primaryEmotion?.name || prev?.currentEmotion || '',
      emotionConfidence: primaryEmotion?.score || prev?.emotionConfidence || 0,
      voiceEmotions: source === 'voice' ? emotions : prev?.voiceEmotions,
      facialEmotions: source === 'facial' ? emotions : prev?.facialEmotions,
      lastUpdate: Date.now()
    }));
    
    // Also update legacy state for backward compatibility
    if (primaryEmotion) {
      setCurrentEmotion(primaryEmotion.name);
      setEmotionConfidence(primaryEmotion.score);
    }
    
    console.log(`🎭 ${source} emotions updated:`, emotions.slice(0, 3).map(e => e.name).join(', '));
  }, []);

  // Voice input handler - WITH smart TTS timing and speech recognition pausing
  const handleVoiceInput = async (transcript: string) => {
    if (!transcript?.trim() || isProcessing) return;

    // If Eliza is speaking, interrupt her
    if (isSpeaking) {
      humanizedTTS.stop();
      setIsSpeaking(false);
    }

    // 📹 Capture video frame in multimodal mode - Eliza can SEE the user!
    const imageBase64Array: string[] = [];
    if (humeState?.mode === 'multimodal' && humeState?.videoStream) {
      console.log('📹 Capturing live video frame for voice input in multimodal mode...');
      const videoFrame = await captureVideoFrame();
      if (videoFrame) {
        imageBase64Array.push(videoFrame);
        console.log('📹 Added LIVE video frame to voice message - Eliza can see you!');
      }
    }

    const userMessage: UnifiedMessage = {
      id: `voice-user-${Date.now()}`,
      content: transcript,
      sender: 'user',
      timestamp: new Date(),
      emotion: emotionalContext?.currentEmotion || currentEmotion,
      confidence: emotionalContext?.emotionConfidence || emotionConfidence,
      attachments: imageBase64Array.length > 0 ? { images: imageBase64Array } : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);

    // Store user message with enhanced data capture
    try {
      await conversationPersistence.storeMessage(transcript, 'user', {
        emotion: currentEmotion,
        confidence: emotionConfidence,
        inputType: 'voice',
        hasLiveVideo: imageBase64Array.length > 0
      });

      // Extract and store knowledge entities from user input
      await knowledgeEntityService.extractEntities(transcript);

      // Record interaction pattern
      await conversationPersistence.storeInteractionPattern(
        'voice_input',
        { transcript, emotion: currentEmotion, hasLiveVideo: imageBase64Array.length > 0 },
        emotionConfidence
      );

      // Store important context in memory
      if (userContext?.ip) {
        await memoryContextService.storeContext(
          userContext.ip,
          userContext.ip,
          transcript,
          'user_voice_input',
          0.7,
          { emotion: currentEmotion, confidence: emotionConfidence, hasLiveVideo: imageBase64Array.length > 0 }
        );
      }
    } catch (error) {
      console.log('Conversation persistence error:', error);
    }

    try {
      // Determine input mode - use 'vision' if we have live video frames
      const inputMode = imageBase64Array.length > 0 ? 'vision' : 'voice';
      
      const response = await UnifiedElizaService.generateResponse(transcript, {
        miningStats,
        userContext,
        inputMode,
        shouldSpeak: true,
        enableBrowsing: true,
        conversationContext: await conversationPersistence.getFullConversationContext(),
        councilMode: false,
        emotionalContext: emotionalContext || undefined,
        images: imageBase64Array.length > 0 ? imageBase64Array : undefined, // 📹 Pass live video frames!
        isLiveCameraFeed: imageBase64Array.length > 0 // Flag for system prompt context
      });

      const responseText = typeof response === 'string' ? response : response.deliberation.synthesis;

      const elizaMessage: UnifiedMessage = {
        id: `eliza-${Date.now()}`,
        content: responseText,
        sender: 'assistant',
        timestamp: new Date(),
        confidence: 0.95
      };

      setMessages(prev => [...prev, elizaMessage]);
      setLastElizaMessage(responseText);
      
      // Store Eliza's response with enhanced data
      try {
        await conversationPersistence.storeMessage(responseText, 'assistant', {
          confidence: 0.95,
          method: 'OpenAI via Edge Function',
          inputType: 'voice'
        });

        // Extract entities from response
        await knowledgeEntityService.extractEntities(responseText);

        // Record learning pattern for successful response
        await learningPatternsService.recordPattern(
          'voice_response_success',
          { inputLength: transcript.length, responseLength: responseText.length },
          0.9
        );

        // Store response context
        if (userContext?.ip) {
          await memoryContextService.storeContext(
            userContext.ip,
            userContext.ip,
            responseText,
            'assistant_voice_response',
            0.8,
            { method: 'OpenAI', confidence: 0.95 }
          );
        }
      } catch (error) {
        console.log('Conversation persistence error:', error);
      }

      // Speak response using Enhanced TTS with fallbacks - auto-initialize if needed
      if (voiceEnabled) {
        try {
          // Ensure TTS is initialized
          if (!audioInitialized) {
            await enhancedTTS.initialize();
            setAudioInitialized(true);
          }
          
          setIsSpeaking(true);
          
          // Add small delay in voice mode to let speech recognition settle
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Stop any previous speech before starting new one
          humanizedTTS.stop();
          await humanizedTTS.speak({ text: responseText, language });
          setCurrentTTSMethod(humanizedTTS.isHumanized() ? 'Hume AI EVI' : 'Browser Web Speech');
          setIsSpeaking(false);
        } catch (error) {
          console.error('TTS failed:', error);
          setCurrentTTSMethod('failed');
          setIsSpeaking(false);
        }
      }
      
    } catch (error) {
      console.error('Failed to process voice input:', error);
      const errorMessage: UnifiedMessage = {
        id: `error-${Date.now()}`,
        content: 'I apologize, but I\'m having trouble processing your voice input right now.',
        sender: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Text message handler
  const handleSendMessage = async (quickMessage?: string) => {
    const messageText = quickMessage || textInput.trim();
    if (!messageText || isProcessing) return;

    // Check if user pasted a Gemini API key (starts with "AIza")
    if (messageText.startsWith('AIza') && messageText.length > 30) {
      setIsProcessing(true);
      try {
        const apiKey = messageText;
        const result = await apiKeyManager.setUserApiKey(apiKey);
        
        if (result.success) {
          // Clear the API key from input and reset services
          setTextInput('');
          UnifiedElizaService.resetOpenAIInstance();
          setNeedsAPIKey(false);
          
          const successMessage: UnifiedMessage = {
            id: `api-success-${Date.now()}`,
            content: '🔑 Perfect! Your Gemini API key has been validated and saved securely. Full AI capabilities have been restored. What would you like to talk about?',
            sender: 'assistant',
            timestamp: new Date()
          };
          
          setMessages(prev => [...prev, successMessage]);
          setLastElizaMessage(successMessage.content);
        } else {
          const errorMessage: UnifiedMessage = {
            id: `api-error-${Date.now()}`,
            content: `❌ ${result.message}`,
            sender: 'assistant',
            timestamp: new Date()
          };
          
          setMessages(prev => [...prev, errorMessage]);
          setTextInput('');
        }
      } catch (error) {
        console.error('API key validation error:', error);
        const errorMessage: UnifiedMessage = {
          id: `api-error-${Date.now()}`,
          content: '❌ Failed to validate the API key. Please try again or use the 🔑 button above for the setup form.',
          sender: 'assistant',
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, errorMessage]);
        setTextInput('');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // If Eliza is speaking, interrupt her when user sends a message
    if (isSpeaking) {
      enhancedTTS.stop();
      setIsSpeaking(false);
    }

    // Convert image attachments to base64
    const imageBase64Array: string[] = [];
    console.log('📎 Current attachments:', attachments.length, attachments.map(a => ({ type: a.type, name: a.name })));
    
    const imageAttachments = attachments.filter(a => a.type === 'image');
    console.log('🖼️ Image attachments to convert:', imageAttachments.length);
    
    for (const att of imageAttachments) {
      try {
        const base64 = await fileToBase64(att.file);
        imageBase64Array.push(base64);
        console.log(`✅ Converted image ${att.name} to base64 (${base64.substring(0, 50)}...)`);
      } catch (err) {
        console.error('Failed to convert image to base64:', err);
      }
    }
    
    console.log('📸 Total images converted:', imageBase64Array.length);
    
    // ✅ Capture video frame in multimodal mode (if camera is active)
    if (humeState?.mode === 'multimodal' && humeState?.videoStream) {
      console.log('📹 Attempting to capture video frame for multimodal message...');
      const videoFrame = await captureVideoFrame();
      if (videoFrame) {
        imageBase64Array.push(videoFrame);
        console.log('📹 Added live video frame to message for visual analysis');
      } else {
        console.warn('⚠️ Could not capture video frame - video may not be ready');
      }
    }

    const userMessage: UnifiedMessage = {
      id: `user-${Date.now()}`,
      content: textInput,
      sender: 'user',
      timestamp: new Date(),
      attachments: imageBase64Array.length > 0 ? { images: imageBase64Array } : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setTextInput('');
    clearAttachments();
    setIsProcessing(true);

    // Store user message with comprehensive data capture
    try {
      await conversationPersistence.storeMessage(userMessage.content, 'user', {
        inputType: 'text'
      });

      // Extract and store knowledge entities
      await knowledgeEntityService.extractEntities(userMessage.content);

      // Record text interaction pattern
      await conversationPersistence.storeInteractionPattern(
        'text_input',
        { message: userMessage.content, length: userMessage.content.length },
        0.8
      );

      // Store in memory contexts
      if (userContext?.ip) {
        await memoryContextService.storeContext(
          userContext.ip,
          userContext.ip,
          userMessage.content,
          'user_text_input',
          0.6
        );
      }
    } catch (error) {
      console.log('Conversation persistence error:', error);
    }

    try {
      console.log('💬 Starting message processing:', messageText);
      console.log('🔧 Context:', { miningStats: !!miningStats, userContext: !!userContext });
      
      // Check if user is teaching pronunciation
      const learnedSpeech = speechLearningService.parseInstruction(messageText);
      if (learnedSpeech) {
        const confirmMessage: UnifiedMessage = {
          id: `eliza-${Date.now()}`,
          content: `✅ Got it! I've learned that preference and will apply it when I speak.`,
          sender: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, confirmMessage]);
        setIsProcessing(false);
        return;
      }
      
      console.log('💾 User message stored, generating response...');
      
      // Get full conversation context for better AI understanding
      const fullContext = await conversationPersistence.getFullConversationContext();
      
      // Process response using Gemini AI Gateway or Council
      const response = await UnifiedElizaService.generateResponse(messageText, {
        miningStats,
        userContext,
        inputMode: imageBase64Array.length > 0 ? 'vision' : 'text',
        shouldSpeak: false,
        enableBrowsing: true,
        conversationContext: fullContext,
        emotionalContext: emotionalContext || undefined, // Pass real-time emotional context
        councilMode,
        images: imageBase64Array.length > 0 ? imageBase64Array : undefined,
        targetExecutive: selectedExecutive // Route to specific executive if selected
      }, language);
      
      // Handle council deliberation response
      if (typeof response !== 'string' && response.type === 'council_deliberation') {
        const deliberation = response.deliberation;
        
        const elizaMessage: UnifiedMessage = {
          id: `eliza-${Date.now()}`,
          content: typeof deliberation.synthesis === 'string' 
            ? deliberation.synthesis 
            : String(deliberation.synthesis || 'No response'),
          sender: 'assistant',
          timestamp: new Date(),
          confidence: 0.95,
          isCouncilDeliberation: true,
          councilDeliberation: deliberation
        };
        
        setMessages(prev => [...prev, elizaMessage]);
        setLastElizaMessage(deliberation.synthesis);
        
        // Store council response
        try {
          await conversationPersistence.storeMessage(deliberation.synthesis, 'assistant', {
            confidence: 0.95,
            method: 'Executive Council',
            inputType: 'text',
            councilMode: true,
            executiveCount: deliberation.responses.length
          });
        } catch (error) {
          console.log('Conversation persistence error:', error);
        }
        
        // Speak council synthesis with TTS (even if partial responses) - auto-initialize if needed
        if (voiceEnabled) {
          // Ensure TTS is initialized
          if (!audioInitialized) {
            try {
              await enhancedTTS.initialize();
              setAudioInitialized(true);
            } catch (error) {
              console.error('Failed to initialize TTS for council speech:', error);
            }
          }
          
          setIsSpeaking(true);
          
          // Build spoken text based on what's available
          console.log('🎵 Speaking council deliberation with executive voices...');
          
          // Use the new council deliberation method with per-executive voices
          humanizedTTS.speakCouncilDeliberation(
            deliberation.responses.map(r => ({
              executive: r.executive,
              executiveTitle: r.executiveTitle,
              perspective: r.perspective
            })),
            deliberation.synthesis
          )
            .then(() => {
              setCurrentTTSMethod(humanizedTTS.isHumanized() ? 'Hume AI EVI' : 'Browser Web Speech');
              setIsSpeaking(false);
            })
            .catch((error) => {
              console.error('❌ Council TTS failed:', error);
              setCurrentTTSMethod('failed');
              setIsSpeaking(false);
            });
        }
        
        setIsProcessing(false);
        return;
      }
      
      // Handle standard string response
      const responseText = response as string;
      console.log('✅ Response generated:', responseText.substring(0, 100) + '...');

      // Check if this is a workflow initiation message
      const isWorkflowInitiation = responseText.includes('🎬') && responseText.includes('background');

      // Remove tool_use tags from chat display
      const cleanResponse = responseText.replace(/<tool_use>[\s\S]*?<\/tool_use>/g, '').trim();

      // If it's a workflow initiation, show a brief acknowledgment instead
      const displayContent = isWorkflowInitiation 
        ? '🔄 Processing your request in the background. I\'ll share the results shortly...'
        : cleanResponse;

      // Extract reasoning from response if available
      let reasoning: ReasoningStep[] = [];
      try {
        // Try to parse reasoning from response metadata
        const reasoningMatch = responseText.match(/<reasoning>(.*?)<\/reasoning>/s);
        if (reasoningMatch) {
          reasoning = JSON.parse(reasoningMatch[1]);
        }
      } catch (e) {
        console.log('No reasoning data in response');
      }

      // Extract tool calls and provider info from window if available
      const toolCalls = (window as any).__lastElizaToolCalls || [];
      const providerUsed = (window as any).__lastElizaProvider || '';
      const executiveTitle = (window as any).__lastElizaExecutiveTitle || '';
      
      const elizaMessage: UnifiedMessage = {
        id: `eliza-${Date.now()}`,
        content: typeof displayContent === 'string' 
          ? displayContent 
          : String(displayContent || 'No response'),
        sender: 'assistant',
        timestamp: new Date(),
        confidence: 0.95,
        reasoning: reasoning.length > 0 ? reasoning : undefined,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        providerUsed: providerUsed || undefined,
        executiveTitle: executiveTitle || undefined
      };

      setMessages(prev => [...prev, elizaMessage]);
      setLastElizaMessage(displayContent);
      
      // Store Eliza's response with full data integration
      try {
        await conversationPersistence.storeMessage(cleanResponse, 'assistant', {
          confidence: 0.95,
          method: 'OpenAI via Edge Function',
          inputType: 'text'
        });

        // Extract entities from response
        await knowledgeEntityService.extractEntities(cleanResponse);

        // Record successful text response pattern
        await learningPatternsService.recordPattern(
          'text_response_success',
          { 
            inputLength: userMessage.content.length, 
            responseLength: cleanResponse.length,
            method: 'OpenAI' 
          },
          0.85
        );

        // Store response in memory
        if (userContext?.ip) {
          await memoryContextService.storeContext(
            userContext.ip,
            userContext.ip,
            cleanResponse,
            'assistant_text_response',
            0.75,
            { method: 'OpenAI', confidence: 0.95 }
          );
        }
      } catch (error) {
        console.log('Conversation persistence error:', error);
      }

      // Speak response if voice is enabled (don't await - let it run in background) - auto-initialize if needed
      if (voiceEnabled && cleanResponse) {
        // Ensure TTS is initialized
        const initAndSpeak = async () => {
          try {
            if (!audioInitialized) {
              await enhancedTTS.initialize();
              setAudioInitialized(true);
            }
            
            setIsSpeaking(true);
            // Stop any previous speech before starting new one
            humanizedTTS.stop();
            await humanizedTTS.speak({ text: cleanResponse, language });
            setCurrentTTSMethod(humanizedTTS.isHumanized() ? 'Hume AI EVI' : 'Browser Web Speech');
            setIsSpeaking(false);
          } catch (error) {
            console.error('❌ TTS failed:', error, 'Check browser audio permissions');
            setCurrentTTSMethod('failed');
            setIsSpeaking(false);
          }
        };
        
        initAndSpeak();
      }
      
    } catch (error) {
      console.error('❌ Chat error:', error);
      
      // Import intelligent error handler
      const { IntelligentErrorHandler } = await import('@/services/intelligentErrorHandler');
      
      // Get error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if this is already a formatted diagnostic message
      let errorContent: string;
      
      if (errorMessage.startsWith('DIAGNOSTIC:')) {
        // This is already a formatted diagnostic message
        errorContent = errorMessage.replace('DIAGNOSTIC:', '').trim();
      } else {
        // Parse and diagnose the error
        const diagnosis = await IntelligentErrorHandler.diagnoseError(error, {
          userInput: messageText,
          attemptedExecutive: (window as any).__lastElizaExecutive
        });
        
        errorContent = IntelligentErrorHandler.generateExplanation(diagnosis);
      }
      
      const errorMessageObj: UnifiedMessage = {
        id: `error-${Date.now()}`,
        content: errorContent,
        sender: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessageObj]);
      
      // Log to Eliza activity log for autonomous monitoring
      try {
        await supabase.from('eliza_activity_log').insert({
          title: 'Chat Error Diagnosed',
          description: errorContent.substring(0, 200),
          activity_type: 'error_diagnostics',
          status: 'completed',
          metadata: { userInput: messageText } as any,
          mentioned_to_user: true
        });
      } catch (logError) {
        console.warn('Failed to log error:', logError);
      }
    } finally {
      console.log('🏁 Message processing complete, setting isProcessing to false');
      setIsProcessing(false);
    }
  };


  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };


  // Toggle voice synthesis
  const toggleVoiceSynthesis = async () => {
    if (!voiceEnabled && !audioInitialized) {
      // First time enabling - need to initialize
      await handleEnableAudio();
    } else {
      // Toggle on/off
      const newState = !voiceEnabled;
      setVoiceEnabled(newState);
      localStorage.setItem('audioEnabled', newState.toString());
      
      // If disabling, stop any ongoing speech
      if (!newState) {
        enhancedTTS.stop();
        setIsSpeaking(false);
      }
    }
  };

  const handleAPIKeyValidated = () => {
    console.log('✅ API key validated, resetting Gemini and hiding input');
    
    // Reset Gemini instance to use new API key
    UnifiedElizaService.resetOpenAIInstance();
    
    // Hide the API key input
    setShowAPIKeyInput(false);
    setNeedsAPIKey(false);
    
    // Add a success message to chat
    const successMessage: UnifiedMessage = {
      id: `success-${Date.now()}`,
      content: 'Great! Your API key has been validated and saved. Full AI capabilities have been restored. How can I help you?',
      sender: 'assistant',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, successMessage]);
  };

  return (
    <Card className={`bg-card border-border/60 flex flex-col h-[500px] sm:h-[600px] ${className}`}>
      {/* Voice Intelligence Toggle */}
      <MakeMeHumanToggle 
        onModeChange={(mode, enabled) => setIsHumanizedMode(enabled)}
        onStateChange={(state) => setHumeState(state)}
      />
      
      {/* Clean Header */}
      <div className="px-4 py-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Back button when in executive/council mode */}
            {onBack && (
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 mr-1"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <AdaptiveAvatar
              apiKey={apiKey}
              className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0"
              size="sm"
              enableVoice={voiceEnabled}
            />
            <div className="min-w-0">
              {/* Show selected executive or default title */}
              {selectedExecutive && EXECUTIVE_PROFILES[selectedExecutive] ? (
                <>
                  <h3 className="font-medium text-foreground text-sm sm:text-base truncate flex items-center gap-2">
                    <span>{EXECUTIVE_PROFILES[selectedExecutive].icon}</span>
                    {EXECUTIVE_PROFILES[selectedExecutive].fullTitle}
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate">{EXECUTIVE_PROFILES[selectedExecutive].model}</p>
                </>
              ) : councilMode ? (
                <>
                  <h3 className="font-medium text-foreground text-sm sm:text-base truncate flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Executive Council
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate">All 4 executives deliberating</p>
                </>
              ) : (
                <>
                  <h3 className="font-medium text-foreground text-sm sm:text-base truncate">Suite Assistant</h3>
                  <p className="text-[11px] text-muted-foreground truncate">Enterprise AI</p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Council Mode Toggle with Tooltip */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setCouncilMode(!councilMode)}
                    variant={councilMode ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7 px-1.5 sm:px-2 flex-shrink-0"
                  >
                    <Users className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">{councilMode ? 'Multi-AI' : 'Single'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium text-sm mb-1">
                    {councilMode ? 'Multi-AI Mode Active' : 'Single Executive Mode'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {councilMode 
                      ? 'Get perspectives from all 4 AI executives (CTO, CSO, CIO, CAO) before a unified response.'
                      : 'Chat with Eliza directly. Toggle to consult all executives.'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {/* Governance Status Badge */}
            <GovernanceStatusBadge />
            
            {/* Realtime Connection Indicator */}
            {realtimeConnected && (
              <Badge variant="outline" className="text-[10px] hidden sm:flex items-center gap-1 bg-suite-success/10 text-suite-success border-suite-success/30">
                <Wifi className="h-3 w-3" />
                <span>Live</span>
              </Badge>
            )}
            
            {/* GitHub Token Status Indicator */}
            <div className="hidden md:block">
              <GitHubTokenStatus onRequestPAT={() => setShowAPIKeyInput(true)} />
            </div>
            
            {/* API Key Button */}
            <Button
              onClick={() => setShowAPIKeyInput(true)}
              variant="ghost"
              size="sm"
              className={`hidden sm:flex h-7 w-7 sm:h-8 sm:w-8 p-0 ${needsAPIKey ? 'text-orange-500 animate-pulse' : 'text-muted-foreground'}`}
              title="Add or update Gemini API key"
            >
              <Key className="h-4 w-4" />
            </Button>
            
            {/* Clear Conversation Button */}
            {totalMessageCount > 0 && (
              <Button
                onClick={handleClearConversation}
                variant="ghost"
                size="sm"
                className="hidden sm:flex h-7 w-7 sm:h-8 sm:w-8 p-0 text-muted-foreground hover:text-destructive"
                title="Clear conversation history"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            
            {/* Voice Toggle */}
            <Button
              onClick={toggleVoiceSynthesis}
              variant="ghost"
              size="sm"
              className={`h-7 w-7 sm:h-8 sm:w-8 p-0 flex-shrink-0 ${
                voiceEnabled 
                  ? (isHumanizedMode ? 'text-purple-500' : 'text-primary')
                  : 'text-muted-foreground'
              }`}
              title={`${voiceEnabled ? 'Disable' : 'Enable'} voice${isHumanizedMode ? ' (Humanized)' : ''}`}
            >
              {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Clean Messages Area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {/* Office Clerk Loading Progress */}
            {officeClerkProgress && officeClerkProgress.status !== 'idle' && officeClerkProgress.status !== 'ready' && (
              <div className="bg-muted/50 border border-primary/30 rounded-lg p-4 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
                    <span className="text-sm font-medium">Office Clerk Initializing</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{officeClerkProgress.progress}%</span>
                </div>
                
                <div className="space-y-2">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${officeClerkProgress.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{officeClerkProgress.message}</p>
                  {officeClerkProgress.currentModel && (
                    <p className="text-xs text-muted-foreground">Model: {officeClerkProgress.currentModel}</p>
                  )}
                  {officeClerkProgress.webGPUSupported === false && (
                    <p className="text-xs text-orange-500">⚠️ WebGPU not supported - using CPU (slower)</p>
                  )}
                </div>

                {officeClerkProgress.status === 'failed' && officeClerkProgress.error && (
                  <div className="mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
                    {officeClerkProgress.error}
                  </div>
                )}
              </div>
            )}

            {/* Load Previous Conversation Button */}
            {hasMoreMessages && totalMessageCount > 0 && (
              <div className="flex justify-center">
                <Button
                  onClick={loadMoreMessages}
                  disabled={loadingMoreMessages}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  {loadingMoreMessages ? 'Loading...' : `View Previous Conversation (${totalMessageCount} messages)`}
                </Button>
              </div>
            )}
            
            {/* Conversation Summary Context (only show if user hasn't loaded messages) */}
            {conversationSummaries.length > 0 && !messages.some(m => m.id !== 'greeting') && (
              <div className="bg-muted/30 border border-border/30 rounded-lg p-3 mb-2">
                <div className="text-xs text-muted-foreground mb-1">Last conversation context:</div>
                <div className="text-xs leading-relaxed opacity-75">
                  {conversationSummaries[conversationSummaries.length - 1]?.summaryText}
                </div>
              </div>
            )}
            
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} flex-col gap-2 animate-fade-in`}
              >
                {/* Show Council Deliberation for council messages */}
                {message.sender === 'assistant' && message.isCouncilDeliberation && message.councilDeliberation && (
                  <div className="max-w-[95%]">
                    <ExecutiveCouncilChat deliberation={message.councilDeliberation} />
                  </div>
                )}
                
                {/* Show Reasoning Steps for assistant messages */}
                {message.sender === 'assistant' && message.reasoning && message.reasoning.length > 0 && (
                  <div className="max-w-[85%]">
                    <ReasoningSteps steps={message.reasoning} />
                  </div>
                )}
                
                {/* Standard message bubble (skip if council deliberation) */}
                {!(message.isCouncilDeliberation) && (
                  <div className="max-w-[80%] sm:max-w-[75%]">
                  <div
                      className={`p-3 rounded-xl ${
                        message.sender === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted/50 text-foreground rounded-bl-sm border border-border/40'
                    }`}
                    >
                      {/* Show attached images */}
                      {message.attachments?.images && message.attachments.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {message.attachments.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={img}
                              alt={`Attachment ${idx + 1}`}
                              className="max-w-[200px] max-h-[150px] rounded-lg object-cover border border-border/30"
                            />
                          ))}
                        </div>
                      )}
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
                    
                    {/* Tool Call Indicators */}
                    {message.tool_calls && message.tool_calls.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {message.tool_calls.map((tool) => (
                          <div key={tool.id} className="text-xs flex items-center gap-1.5 opacity-70">
                            <span className="text-muted-foreground">🔧</span>
                            <span className="font-medium">{tool.function_name}</span>
                            {tool.status === 'success' && <span className="text-green-600">✓</span>}
                            {tool.status === 'failed' && <span className="text-red-600">✗</span>}
                            {tool.status === 'pending' && <span className="animate-pulse">⋯</span>}
                            {tool.execution_time_ms && (
                              <span className="text-muted-foreground">({tool.execution_time_ms}ms)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                      <div className="text-xs opacity-60 mt-2 flex items-center justify-between gap-2">
                        <span>{formatTime(message.timestamp)}</span>
                        {message.sender === 'assistant' && message.providerUsed && (
                          <span className="text-[10px] text-muted-foreground/70 font-medium">
                            via {message.providerUsed}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isProcessing && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-muted/50 text-foreground p-3 rounded-xl rounded-bl-sm border border-border/40">
                  <div className="flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span className="text-xs text-muted-foreground">Processing...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* API Key Input Dialog - Show automatically when needed or manually requested */}
        {(showAPIKeyInput || needsAPIKey) && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <GitHubPATInput 
              onKeyValidated={() => {
                setShowAPIKeyInput(false);
                setNeedsAPIKey(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Text Input Area */}
      <div className="border-t border-border/60 bg-card/50">
        <div className="p-4">
          {/* Attachment Preview */}
          <AttachmentPreview
            attachments={attachments}
            onRemove={removeAttachment}
            onClear={clearAttachments}
          />
          
          <div className="flex gap-3 items-center">
            {/* Hume Voice/Video Controls */}
            <HumeChatControls
              mode={humeState.mode}
              isEnabled={humeState.isEnabled}
              audioStream={humeState.audioStream}
              videoStream={humeState.videoStream}
              onVoiceInput={handleVoiceInput}
              onEmotionUpdate={handleEmotionUpdate}
            />
            
            {/* Camera Active Indicator */}
            {humeState?.mode === 'multimodal' && humeState?.videoStream && (
              <Badge 
                variant="outline" 
                className={`text-[10px] flex items-center gap-1 ${videoReady ? 'bg-suite-success/10 text-suite-success border-suite-success/30' : 'bg-suite-warning/10 text-suite-warning border-suite-warning/30 animate-pulse-subtle'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${videoReady ? 'bg-suite-success animate-pulse-subtle' : 'bg-suite-warning'}`}></span>
                {videoReady ? 'Camera active' : 'Initializing...'}
              </Badge>
            )}
            
            {/* File Attachment Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
              multiple
              className="hidden"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing || attachments.length >= 5}
              className="rounded-full min-h-[48px] min-w-[48px] hover:bg-muted/50"
              title="Attach files (max 5)"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            
            <Input
              value={textInput}
              onChange={(e) => {
                setTextInput(e.target.value);
                // If user starts typing while assistant is speaking, interrupt
                if (isSpeaking && e.target.value.length > 0) {
                  enhancedTTS.stop();
                  setIsSpeaking(false);
                }
              }}
              onKeyPress={handleKeyPress}
              placeholder={
                needsAPIKey 
                  ? "Configure API key to continue..." 
                  : attachments.length > 0
                    ? `${attachments.length} file${attachments.length > 1 ? 's' : ''} attached`
                    : humeState.mode === 'voice' && humeState.isEnabled
                      ? "Speak or type..."
                      : isSpeaking 
                        ? "Type to interrupt..." 
                        : "Ask anything..."
              }
              className="flex-1 rounded-lg border-border/60 bg-background min-h-[44px] text-sm px-4"
              disabled={isProcessing}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={(!textInput.trim() && attachments.length === 0) || isProcessing}
              size="sm"
              className="rounded-lg min-h-[44px] min-w-[44px]"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Quick Response Buttons */}
          <QuickResponseButtons
            onQuickResponse={(message) => handleSendMessage(message)}
            disabled={isProcessing}
          />
        </div>
      </div>
    </Card>
  );
};

// External wrapper with credential awareness
import { CredentialAwareChat } from './CredentialAwareChat';

export const UnifiedChat: React.FC<UnifiedChatProps> = (props) => {
  return (
    <CredentialAwareChat>
      <UnifiedChatInner {...props} />
    </CredentialAwareChat>
  );
};

export default UnifiedChat;