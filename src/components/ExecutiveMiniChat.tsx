import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2, Volume2, VolumeX, Square, Trash2 } from 'lucide-react';
import { ExecutiveName, EXECUTIVE_PROFILES } from '@/components/ExecutiveBio';
import { UnifiedElizaService } from '@/services/unifiedElizaService';
import { QuickResponseButtons } from './QuickResponseButtons';
import { executiveTTSService } from '@/services/executiveTTSService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ExecutiveMiniChatProps {
  executive: ExecutiveName;
  className?: string;
}

// Color accent map keyed on executive function key
const ACCENT_COLORS: Record<ExecutiveName, { ring: string; badge: string; bubble: string; dot: string }> = {
  'vercel-ai-chat': {
    ring: 'ring-blue-500/40',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    bubble: 'bg-blue-500/10 border border-blue-500/20',
    dot: 'bg-blue-400',
  },
  'deepseek-chat': {
    ring: 'ring-amber-500/40',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    bubble: 'bg-amber-500/10 border border-amber-500/20',
    dot: 'bg-amber-400',
  },
  'gemini-chat': {
    ring: 'ring-pink-500/40',
    badge: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    bubble: 'bg-pink-500/10 border border-pink-500/20',
    dot: 'bg-pink-400',
  },
  'openai-chat': {
    ring: 'ring-slate-500/40',
    badge: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    bubble: 'bg-slate-500/10 border border-slate-500/20',
    dot: 'bg-slate-400',
  },
  'coo-chat': {
    ring: 'ring-teal-500/40',
    badge: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    bubble: 'bg-teal-500/10 border border-teal-500/20',
    dot: 'bg-teal-400',
  },
};

export const ExecutiveMiniChat = ({ executive, className = '' }: ExecutiveMiniChatProps) => {
  const profile = EXECUTIVE_PROFILES[executive];
  const accent = ACCENT_COLORS[executive];
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() =>
    localStorage.getItem(`executive-voice-${executive}`) === 'true'
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    executiveTTSService.setOnSpeakingChange(setIsSpeaking);
    return () => executiveTTSService.setOnSpeakingChange(() => { });
  }, []);

  useEffect(() => {
    localStorage.setItem(`executive-voice-${executive}`, voiceEnabled.toString());
  }, [voiceEnabled, executive]);

  const toggleVoice = useCallback(() => {
    if (isSpeaking) executiveTTSService.stop();
    setVoiceEnabled(prev => !prev);
  }, [isSpeaking]);

  const stopSpeaking = useCallback(() => { executiveTTSService.stop(); }, []);

  // Persist messages
  useEffect(() => {
    const stored = localStorage.getItem(`executive-chat-${executive}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setMessages(parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
      } catch (e) { /* ignore */ }
    }
  }, [executive]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`executive-chat-${executive}`, JSON.stringify(messages));
    }
  }, [messages, executive]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (quickMessage?: string) => {
    const messageText = quickMessage || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await UnifiedElizaService.generateResponse(
        userMessage.content,
        { councilMode: false, targetExecutive: executive },
        'en'
      );

      const responseText = typeof result === 'string'
        ? result
        : (result as any)?.deliberation?.synthesis || 'Response received.';

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      if (voiceEnabled) executiveTTSService.speak(responseText, executive);
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(`executive-chat-${executive}`);
  };

  return (
    <Card className={`flex flex-col overflow-hidden border-border/60 bg-card ring-1 ${accent.ring} transition-shadow hover:shadow-lg hover:shadow-primary/5 ${className}`}>

      {/* ── Executive Identity Panel ── */}
      <div className="flex items-start gap-3 p-4 border-b border-border/50 bg-muted/20 flex-shrink-0">
        {/* Portrait */}
        <div className="relative flex-shrink-0">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/20 shadow-md">
            {!photoError ? (
              <img
                src={profile.photo}
                alt={profile.name}
                className="w-full h-full object-cover"
                onError={() => setPhotoError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted text-2xl">
                {profile.icon}
              </div>
            )}
          </div>
          {/* Online pulse */}
          <span className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-card ${isSpeaking ? 'bg-primary animate-pulse' : 'bg-green-500'}`} />
        </div>

        {/* Name & bio */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="font-bold text-sm text-foreground leading-tight">{profile.name}</h3>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${accent.badge}`}>
              {profile.abbreviation}
            </Badge>
          </div>
          <p className="text-xs text-primary font-medium mb-1">{profile.title}</p>
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{profile.bio}</p>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={toggleVoice} className="h-6 w-6 p-0" title={voiceEnabled ? 'Disable voice' : 'Enable voice'}>
            {voiceEnabled
              ? <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
              : <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
            }
          </Button>
          {isSpeaking && (
            <Button variant="ghost" size="sm" onClick={stopSpeaking} className="h-6 w-6 p-0" title="Stop speaking">
              <Square className="w-3 h-3 text-destructive" />
            </Button>
          )}
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} className="h-6 w-6 p-0 opacity-40 hover:opacity-100" title="Clear chat">
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Specialties chips ── */}
      <div className="px-4 py-2 flex gap-1.5 flex-wrap border-b border-border/30 flex-shrink-0">
        {profile.bestFor.slice(0, 3).map((item, i) => (
          <span key={i} className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">{item}</span>
        ))}
      </div>

      {/* ── Messages ── */}
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="space-y-3 py-3">
            {messages.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <div className="text-3xl">{profile.icon}</div>
                <p className="text-sm text-foreground font-medium">Chat with {profile.name}</p>
                <p className="text-xs text-muted-foreground max-w-[220px] mx-auto">{profile.specialty}</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mr-2 mt-0.5 border border-border/40">
                      {!photoError ? (
                        <img src={profile.photo} alt="" className="w-full h-full object-cover" onError={() => setPhotoError(true)} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted text-xs">{profile.icon}</div>
                      )}
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : `${accent.bubble} text-foreground rounded-bl-sm`
                    }`}>
                    <span className="whitespace-pre-wrap break-words">{message.content}</span>
                    <span className="block text-[9px] opacity-40 mt-1 text-right">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mr-2 border border-border/40">
                  {!photoError
                    ? <img src={profile.photo} alt="" className="w-full h-full object-cover" onError={() => setPhotoError(true)} />
                    : <div className="w-full h-full flex items-center justify-center bg-muted text-xs">{profile.icon}</div>
                  }
                </div>
                <div className={`${accent.bubble} rounded-xl rounded-bl-sm px-3 py-2 text-sm flex items-center gap-2`}>
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">{profile.shortName} is thinking…</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Input ── */}
        <div className="p-3 border-t border-border/50 flex-shrink-0 bg-muted/10">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Message ${profile.shortName}…`}
              disabled={isLoading}
              className="text-sm h-9"
            />
            <Button
              size="sm"
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="h-9 w-9 p-0"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <QuickResponseButtons
            onQuickResponse={(message) => handleSend(message)}
            disabled={isLoading}
            lastMessageRole={messages.length === 0 ? null : messages[messages.length - 1].role}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ExecutiveMiniChat;
