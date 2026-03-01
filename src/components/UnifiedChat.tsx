import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { AdaptiveAvatar } from './AdaptiveAvatar';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ReasoningSteps, type ReasoningStep } from './ReasoningSteps';
// 🎤 TTS is now language-aware: English (en) / Spanish (es)
import { GitHubPATInput } from './GitHubContributorRegistration';
import { GitHubTokenStatus } from './GitHubTokenStatus';
import { mobilePermissionService } from '@/services/mobilePermissionService';
import { formatTime } from '@/utils/dateFormatter';
import { Send, Volume2, VolumeX, Trash2, Key, Wifi, Users, Vote, Paperclip, X, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { AttachmentPreview, type AttachmentFile } from './AttachmentPreview';
import { QuickResponseButtons } from './QuickResponseButtons';
import { ExecutiveCouncilChat } from './ExecutiveCouncilChat';
import { ImageResponsePreview, extractImagesFromResponse, isLargeResponse, sanitizeLargeResponse } from './ImageResponsePreview';
import { GovernanceStatusBadge } from './GovernanceStatusBadge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { enhancedTTS } from '@/services/enhancedTTSService';
import { SimplifiedVoiceService as simplifiedVoiceService } from '@/services/simplifiedVoiceService';
import { speechLearningService } from '@/services/speechLearningService';
import { supabase } from '@/integrations/supabase/client';
// Toast removed for lighter UI
import type { RealtimeChannel } from '@supabase/supabase-js';
import { LiveCameraProcessor } from './LiveCameraProcessor';

// Services
import { realtimeManager } from '@/services/realtimeSubscriptionManager';
import { UnifiedElizaService } from '@/services/unifiedElizaService';
import { unifiedDataService, type MiningStats, type UserContext } from '@/services/unifiedDataService';
import { unifiedFallbackService } from '@/services/unifiedFallbackService';
import { MLCLLMService } from '@/services/mlcLLMService';
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
  // Generated images extracted from AI response (separate from attachments for performance)
  generatedImages?: string[];
  // Generated video public URLs from Vertex AI Veo — rendered as playable <video> elements
  generatedVideos?: string[];
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
  executive?: 'vercel-ai-chat' | 'deepseek-chat' | 'gemini-chat' | 'openai-chat' | 'coo-chat' | 'lovable-chat';
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
  const { profile } = useAuth();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [conversationSummaries, setConversationSummaries] = useState<Array<{ summaryText: string; messageCount: number; createdAt: Date }>>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [totalMessageCount, setTotalMessageCount] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnected, setIsConnected] = useState(true); // Always connected for text/TTS mode
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [hasUserEngaged, setHasUserEngaged] = useState(false); // Track if user has sent first message

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
  const [interimTranscript, setInterimTranscript] = useState(''); // New state for real-time feedback
  const [currentAIMethod, setCurrentAIMethod] = useState<string>('');
  const [currentTTSMethod, setCurrentTTSMethod] = useState<string>('');

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
  const [organizationContext, setOrganizationContext] = useState<any>(null);
  const [lastElizaMessage, setLastElizaMessage] = useState<string>("");

  // Council mode state - initialize from prop
  const [councilMode, setCouncilMode] = useState<boolean>(defaultCouncilMode);

  // Auto-advance state — council meeting self-drives after each synthesis
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);
  const [autoAdvancePaused, setAutoAdvancePaused] = useState(false);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingAutoAdvanceText = useRef<string>('');
  // Ref to handleSendMessage — avoids stale closure in setInterval callbacks
  // Updated BEFORE the interval fires via assignment in component body below
  const handleSendMessageRef = useRef<((msg?: string) => void) | undefined>(undefined);

  /**
   * Parse the synthesis output to extract the lead executive's next steps.
   * Returns a structured prompt string the council can act on, or null if
   * the synthesis is asking the user a direct question (which pauses auto-advance).
   */
  const extractNextCouncilStep = (synthesis: string): string | null => {
    // If synthesis ends with a question directed at the user, let them answer
    const lastSentences = synthesis.split(/[.!]/).slice(-3).join(' ').toLowerCase();
    if (/\?/.test(lastSentences) && /(your|founder|you prefer|what is|which|shall we|do you)/.test(lastSentences)) {
      return null; // User input genuinely needed
    }

    // Extract Lead Executive
    const leadMatch = synthesis.match(/\*\*Lead Executive:\*\*\s*([^\n]+)/i);
    const leadName = leadMatch ? leadMatch[1].trim() : 'Lead Executive';

    // Extract the numbered next steps from "Unified Recommendation" or end of synthesis
    const recSection = synthesis.match(/(Unified Recommendation|next steps?|must now)[\s\S]*?(?=\*\*Lead Executive|$)/i)?.[0] || synthesis;
    const bullets = recSection
      .split('\n')
      .filter(line => /^[\d•*\-]/.test(line.trim()) && line.trim().length > 10)
      .slice(0, 3)
      .map(line => line.replace(/^[\d.•*\-]+\s*/, '').replace(/\*\*/g, '').trim())
      .filter(Boolean);

    if (bullets.length === 0) return null;

    return `${leadName}, please proceed: ${bullets.join(' | ')}. Move the meeting forward with decisive action.`;
  };


  // File attachment state
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const liveProcessorRef = useRef<any>(null);

  // Input Mode State
  const [inputMode, setInputMode] = useState<'text' | 'voice' | 'multimodal'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [liveVideoActive, setLiveVideoActive] = useState(false);

  // File handling functions
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const MAX_FILES = 5;
    const MAX_SIZE = 6 * 1024 * 1024; // 6MB (Safety limit for Edge Functions)

    const newAttachments: AttachmentFile[] = [];

    for (const file of files.slice(0, MAX_FILES - attachments.length)) {
      if (file.size > MAX_SIZE) {
        console.warn(`File ${file.name} exceeds 6MB limit`);
        // Optional: Add a toast notification here
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
          setAudioInitialized(true);
          console.log('✅ TTS pre-initialized and ready');
        } catch (error) {
          console.log('TTS pre-initialization failed, will retry on first message:', error);
        }
      }
    };

    initializeTTS();
  }, []);

  // Pre-build SpeechRecognition instance on mount so it's ready before the first
  // mic click — critical for iOS Safari / Android Chrome which require .start()
  // to be called synchronously within a user gesture (no async gaps allowed).
  useEffect(() => {
    if (simplifiedVoiceService.isSupported()) {
      simplifiedVoiceService.prepareInstance();
      console.log('🎤 SpeechRecognition pre-built and ready');
    }
  }, []);

  // Subscribe to Office Clerk (WebLLM) progress
  useEffect(() => {
    const unsubscribe = MLCLLMService.subscribeToProgress((progress) => {
      setOfficeClerkProgress(progress);
    });
    return () => unsubscribe();
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

  // Fetch organization context when profile changes
  useEffect(() => {
    const fetchOrgContext = async () => {
      if (profile?.selected_organization_id) {
        const { data, error } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profile.selected_organization_id)
          .single();

        if (!error && data) {
          setOrganizationContext(data);
          console.log('🏢 Organization context loaded:', data.name);
        }
      } else {
        setOrganizationContext(null);
      }
    };
    fetchOrgContext();
  }, [profile?.selected_organization_id]);

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
        return () => { };
      }
    };

    subscribeToOfficeClerk().then(unsub => {
      return () => unsub();
    });
  }, []);

  // Cleanup auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current) clearInterval(autoAdvanceTimerRef.current);
    };
  }, []);

  // Keep handleSendMessageRef always pointing to the latest closure (no stale captures in setInterval)
  // This runs after every render, so the ref is always fresh when the timer fires.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { handleSendMessageRef.current = handleSendMessage; });

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

        // Use normal TTS
        await enhancedTTS.speak(responseText, { language });

        setCurrentTTSMethod('Browser Web Speech');
        console.log('🎵 TTS Method: Browser');
        setIsSpeaking(false);

        // 🟢 Auto-resume listening after TTS finishes (Turn-taking)
        if (inputMode === 'voice' || inputMode === 'multimodal') {
          console.log('🎤 Auto-resuming listening after TTS');
          // Small delay to ensure state updates and audio clearance
          setTimeout(() => {
            toggleRecording();
          }, 500);
        }
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

  // Handle Mode Switching
  const handleModeChange = (mode: 'text' | 'voice' | 'multimodal') => {
    setInputMode(mode);

    // Auto-enable voice for voice/multimodal modes
    if (mode === 'voice' || mode === 'multimodal') {
      if (!voiceEnabled) {
        handleEnableAudio();
      }
    }

    // Toggle camera for multimodal
    if (mode === 'multimodal') {
      setLiveVideoActive(true);
    } else {
      setLiveVideoActive(false);
    }
  };

  // Toggle recording
  // Toggle recording
  const toggleRecording = async () => {
    // Mark interaction to satisfy mobile permission requirements (Safari/Chrome)
    mobilePermissionService.markUserInteraction();

    if (isRecording) {
      simplifiedVoiceService.stopListening();
      setIsRecording(false);
    } else {
      // Optimistically set recording state to show immediate feedback
      setIsRecording(true);

      try {
        const result = await simplifiedVoiceService.startListening((result) => {
          // Handle interim results for real-time feedback
          if (!result.isFinal) {
            setInterimTranscript(result.text);
          } else {
            setInterimTranscript(''); // Clear interim

            // ✅ STOP LISTENING specifically to avoid picking up TTS
            simplifiedVoiceService.stopListening();
            setIsRecording(false);

            handleVoiceInput(result.text);
          }
        }, (error) => {
          setIsRecording(false);

          let userMsg = `🎤 Voice input error: ${error}`;
          if (error.includes('not supported')) {
            userMsg = `❌ Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.`;
          } else if (error.includes('not-allowed') || error.includes('permission')) {
            userMsg = `🎤 Microphone access denied. Please allow microphone permissions in your browser settings.`;
          }

          const errorMessage: UnifiedMessage = {
            id: `voice-error-${Date.now()}`,
            content: userMsg,
            sender: 'assistant',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, errorMessage]);
        });

        // Check if initialization failed instantly (e.g. permission denied)
        if (!result.success) {
          console.error("Failed to start voice:", result.error);
          setIsRecording(false);

          let initMsg = `❌ Could not start voice input: ${result.error}`;
          if (result.error?.includes('not supported')) {
            initMsg = `❌ Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.`;
          }

          const errorMessage: UnifiedMessage = {
            id: `voice-init-error-${Date.now()}`,
            content: initMsg,
            sender: 'assistant',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, errorMessage]);
        }
      } catch (err) {
        console.error("Unexpected voice start error:", err);
        setIsRecording(false);
      }
    }
  };

  // Voice input handler - WITH smart TTS timing and speech recognition pausing
  const handleVoiceInput = async (transcript: string) => {
    if (!transcript?.trim() || isProcessing) return;

    // If Eliza is speaking, interrupt her
    if (isSpeaking) {
      enhancedTTS.stop();
      setIsSpeaking(false);
    }

    // 📹 Capture video frame in multimodal mode - Removed Hume support
    const imageBase64Array: string[] = [];

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
        organizationContext,
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
          enhancedTTS.stop();
          await enhancedTTS.speak(responseText, { language });
          setCurrentTTSMethod('Browser Web Speech');
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


    // Mark that user has engaged with the chat
    if (!hasUserEngaged) {
      setHasUserEngaged(true);
    }

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

    // Collect all file attachments
    const currentAttachments: File[] = attachments.map(a => a.file);
    console.log('📎 Preparing attachments:', currentAttachments.length, currentAttachments.map(f => f.name));

    // ✅ Capture video frame in multimodal mode - Removed Hume support
    let hasLiveVideo = false;

    // 🖼️ Convert attachments to Base64 for immediate UI display (Async ensure no race conditions with cleanup)
    const base64Attachments: string[] = [];

    try {
      // Process images for preview
      for (const attachment of attachments) {
        if (attachment.type === 'image') {
          // Convert to true Base64 Data URL to safely survive clearAttachments()
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(attachment.file);
          });
          base64Attachments.push(base64);
        }
      }
    } catch (e) {
      console.error('Error processing attachment previews:', e);
    }

    const userMessage: UnifiedMessage = {
      id: `user-${Date.now()}`,
      content: messageText,
      sender: 'user',
      timestamp: new Date(),
      // ✅ FIX: Add attachments to local message state for immediate display
      attachments: base64Attachments.length > 0 ? { images: base64Attachments } : undefined
    };

    console.log('📝 Adding user message to state:', userMessage);

    // Use functional update to ensure we have the latest state and log the result
    setMessages(prev => {
      console.log('Previous messages count:', prev.length);
      const newMessages = [...prev, userMessage];
      console.log('New messages count:', newMessages.length);
      return newMessages;
    });

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
        organizationContext,
        inputMode: currentAttachments.some(f => f.type.startsWith('image') || f.type.startsWith('video')) ? 'vision' : 'text',
        shouldSpeak: false,
        enableBrowsing: true,
        conversationContext: fullContext,
        emotionalContext: emotionalContext || undefined, // Pass real-time emotional context
        councilMode,
        attachments: currentAttachments, // ✅ Pass all file attachments (including converted camera frames)
        isLiveCameraFeed: hasLiveVideo,
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

        // 🚀 AUTO-ADVANCE: parse next steps from synthesis and re-submit automatically
        // This lets the lead executive drive the meeting without user having to say "proceed"
        if (councilMode && !autoAdvancePaused) {
          const nextStep = extractNextCouncilStep(deliberation.synthesis);
          if (nextStep) {
            pendingAutoAdvanceText.current = nextStep;
            let remaining = 10;
            setAutoAdvanceCountdown(remaining);

            if (autoAdvanceTimerRef.current) clearInterval(autoAdvanceTimerRef.current);
            autoAdvanceTimerRef.current = setInterval(() => {
              remaining -= 1;
              setAutoAdvanceCountdown(remaining);
              if (remaining <= 0) {
                clearInterval(autoAdvanceTimerRef.current!);
                autoAdvanceTimerRef.current = null;
                setAutoAdvanceCountdown(null);
                const text = pendingAutoAdvanceText.current;
                pendingAutoAdvanceText.current = '';
                // Use ref to avoid stale closure — always gets the latest handler
                if (text) handleSendMessageRef.current?.(text);
              }
            }, 1000);
          }
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

          // Use standard TTS for council responses now
          const combinedText = deliberation.responses.map(r => `${r.executiveTitle} says: ${r.perspective}`).join('. ') +
            (deliberation.synthesis ? `. Unified Recommendation: ${deliberation.synthesis}` : '');

          enhancedTTS.speak(combinedText, { language })
            .then(() => {
              setCurrentTTSMethod('Browser Web Speech');
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

      // Handle standard string or object response
      let responseText = '';
      let providerUsed = '';
      let confidence = 0.95;

      if (typeof response === 'object' && response !== null && 'text' in response) {
        // Handle object response from FallbackService (Office Clerk)
        const responseObj = response as { text: string, method?: string, confidence?: number };
        responseText = responseObj.text;
        providerUsed = responseObj.method || 'Office Clerk';
        confidence = responseObj.confidence || 0.85;
      } else {
        responseText = response as string;
        // Fallback to window hack if available, otherwise default
        providerUsed = (window as any).__lastElizaProvider || '';
      }

      console.log('✅ Response generated, length:', responseText.length);

      // Check if this is a workflow initiation message
      const isWorkflowInitiation = responseText.includes('🎬') && responseText.includes('background');

      // Remove tool_use tags from chat display
      let cleanResponse = responseText.replace(/<tool_use>[\s\S]*?<\/tool_use>/g, '').trim();

      // 🖼️ Extract base64 images from response to prevent UI freeze
      let generatedImages: string[] = [];
      let generatedVideos: string[] = [];
      if (isLargeResponse(cleanResponse)) {
        console.log('⚠️ Large response detected, extracting images to prevent freeze...');
        const extracted = extractImagesFromResponse(cleanResponse);
        if (extracted.hasImages) {
          generatedImages = extracted.images;
          cleanResponse = extracted.textContent;
          console.log(`📸 Extracted ${generatedImages.length} image(s) from response`);
        } else {
          // Truncate other large content
          cleanResponse = sanitizeLargeResponse(cleanResponse);
        }
      }

      // 📸 Extract Supabase Storage image URLs embedded in assistant text
      const imageUrlRegex = /https:[\/]{2}[\w.-]+\.supabase\.co\/storage\/v1\/object\/public\/generated-media\/images\/[^\s"')]+/g;
      const inlineImageUrls = cleanResponse.match(imageUrlRegex) || [];
      if (inlineImageUrls.length > 0) {
        generatedImages = [...generatedImages, ...inlineImageUrls];
        // Strip the raw URLs from the text so they don't appear as clutter
        cleanResponse = cleanResponse.replace(imageUrlRegex, '').trim();
      }

      // 🎬 Extract Supabase Storage video URLs embedded in assistant text
      const videoUrlRegex = /https:[\/]{2}[\w.-]+\.supabase\.co\/storage\/v1\/object\/public\/generated-media\/videos\/[^\s"')]+/g;
      const inlineVideoUrls = cleanResponse.match(videoUrlRegex) || [];
      if (inlineVideoUrls.length > 0) {
        generatedVideos = [...generatedVideos, ...inlineVideoUrls];
        cleanResponse = cleanResponse.replace(videoUrlRegex, '').trim();
      }

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

      // Extract tool calls from window if available (still relies on global state for now)
      const toolCalls = (window as any).__lastElizaToolCalls || [];
      const executiveTitle = (window as any).__lastElizaExecutiveTitle || '';

      const elizaMessage: UnifiedMessage = {
        id: `eliza-${Date.now()}`,
        content: typeof displayContent === 'string'
          ? displayContent
          : String(displayContent || 'No response'),
        sender: 'assistant',
        timestamp: new Date(),
        confidence,
        reasoning: reasoning.length > 0 ? reasoning : undefined,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        providerUsed: providerUsed || undefined,
        executiveTitle: executiveTitle || undefined,
        generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
        generatedVideos: generatedVideos.length > 0 ? generatedVideos : undefined
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
            enhancedTTS.stop();
            await enhancedTTS.speak(cleanResponse, { language });
            setCurrentTTSMethod('Browser Web Speech');
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
      {/* Voice Intelligence Toggle Removed */}

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

          {/* Mode Switcher */}
          <div className="flex bg-muted/30 rounded-lg p-1 gap-1">
            <Button
              variant={inputMode === 'text' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleModeChange('text')}
              className="h-6 px-2 text-[10px] sm:text-xs"
            >
              Text
            </Button>
            <Button
              variant={inputMode === 'voice' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleModeChange('voice')}
              className="h-6 px-2 text-[10px] sm:text-xs"
            >
              Voice
            </Button>
            <Button
              variant={inputMode === 'multimodal' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleModeChange('multimodal')}
              className="h-6 px-2 text-[10px] sm:text-xs"
            >
              Full
            </Button>
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
              className={`h-7 w-7 sm:h-8 sm:w-8 p-0 flex-shrink-0 ${voiceEnabled
                ? 'text-primary'
                : 'text-muted-foreground'
                }`}
              title={`${voiceEnabled ? 'Disable' : 'Enable'} voice`}
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
            {/* Live Camera for Multimodal Mode */}
            {inputMode === 'multimodal' && (
              <div className="mb-4">
                <LiveCameraProcessor
                  isEnabled={liveVideoActive}
                  onEmotionDetected={(emotion, confidence) => {
                    handleEmotionUpdate([{ name: emotion, score: confidence }], 'facial');
                  }}
                  onVisualContextUpdate={(context) => {
                    // Optionally store this context
                    console.log("Visual context:", context);
                  }}
                />
              </div>
            )}

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
                      className={`p-3 rounded-xl ${message.sender === 'user'
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

                      {/* Show AI-generated images with lazy loading to prevent freeze */}
                      {message.generatedImages && message.generatedImages.length > 0 && (
                        <div className="space-y-2 mb-2">
                          {message.generatedImages.map((img, idx) => (
                            <ImageResponsePreview
                              key={`gen-${idx}`}
                              imageData={img}
                              alt={`Generated Image ${idx + 1}`}
                              className="max-w-full"
                            />
                          ))}
                        </div>
                      )}

                      {/* 🎬 Show AI-generated videos as playable players */}
                      {message.generatedVideos && message.generatedVideos.length > 0 && (
                        <div className="space-y-3 mb-2">
                          {message.generatedVideos.map((url, idx) => {
                            const videoRef = React.createRef<HTMLVideoElement>();
                            return (
                              <div key={`vid-${idx}`} className="rounded-xl overflow-hidden border border-border/40 bg-black/20">
                                <video
                                  ref={videoRef}
                                  controls
                                  preload="metadata"
                                  className="w-full max-h-64 rounded-xl cursor-pointer"
                                  src={url}
                                  aria-label={`Generated Video ${idx + 1}`}
                                  onDoubleClick={() => {
                                    const el = videoRef.current;
                                    if (el) {
                                      if (el.requestFullscreen) el.requestFullscreen();
                                    }
                                  }}
                                  title="Double-click to enter fullscreen"
                                >
                                  <p className="text-xs text-muted-foreground p-2">
                                    Your browser doesn't support video playback.
                                    <a href={url} download className="underline ml-1">Download video</a>
                                  </p>
                                </video>
                                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30">
                                  <span className="text-xs text-muted-foreground">🎬 AI Generated Video</span>
                                  <div className="flex items-center gap-3">
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-primary hover:underline flex items-center gap-1"
                                    >
                                      ↗ Open in new tab
                                    </a>
                                    <a
                                      href={url}
                                      download
                                      className="text-xs text-primary hover:underline flex items-center gap-1"
                                    >
                                      ⬇ Download
                                    </a>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
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

            {/* 🚀 Auto-Advance Banner — shown during council countdown */}
            {councilMode && autoAdvanceCountdown !== null && (
              <div className="flex justify-center animate-fade-in">
                <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 max-w-[90%] w-full">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 text-xs text-primary font-medium">
                      <span>👑</span>
                      <span>Lead Executive advancing in {autoAdvanceCountdown}s…</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        if (autoAdvanceTimerRef.current) {
                          clearInterval(autoAdvanceTimerRef.current);
                          autoAdvanceTimerRef.current = null;
                        }
                        setAutoAdvanceCountdown(null);
                        setAutoAdvancePaused(true);
                      }}
                    >
                      ⏸ Pause
                    </Button>
                  </div>
                  <div className="w-full bg-primary/20 rounded-full h-1">
                    <div
                      className="bg-primary h-1 rounded-full transition-all duration-1000"
                      style={{ width: `${(1 - autoAdvanceCountdown / 10) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {councilMode && autoAdvancePaused && !isProcessing && (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1 border-primary/30 text-primary"
                  onClick={() => setAutoAdvancePaused(false)}
                >
                  ▶ Resume Auto-Advance
                </Button>
              </div>
            )}

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

            {/* Interim Transcript Feedback */}
            {interimTranscript && (
              <div className="absolute bottom-full left-0 right-0 p-2 bg-background/80 backdrop-blur-sm text-sm text-muted-foreground animate-pulse border-t border-border">
                Listening: "{interimTranscript}..."
              </div>
            )}

            {/* Microphone Button */}
            <Button
              variant={isRecording ? "destructive" : "ghost"}
              size="sm"
              onClick={toggleRecording}
              disabled={isProcessing}
              className={`rounded-full min-h-[48px] min-w-[48px] ${isRecording ? 'animate-pulse' : 'hover:bg-muted/50'}`}
              title={isRecording ? "Stop Listening" : "Start Listening"}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
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
            lastMessageRole={messages.length === 0 ? null : messages[messages.length - 1].sender === 'user' ? 'user' : 'assistant'}
            hasUserEngaged={hasUserEngaged}
            lastMessageContent={messages.length > 0 ? messages[messages.length - 1].content : undefined}
            lastExecutive={messages.length > 0 ? (messages[messages.length - 1] as any).executive : undefined}
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