import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAPIKeyHealth, refreshAPIKeyHealth } from '@/services/credentialManager';
import {
  RefreshCw,
  CheckCircle,
  AlertCircle,
  XCircle,
  Bot,
  Code,
  Zap,
  Eye,
  MessageSquare,
  Github,
  Mic,
  Camera,
  ExternalLink
} from 'lucide-react';

// Map service names to display info
const SERVICE_INFO: Record<string, {
  displayName: string;
  description: string;
  powers: string;
  icon: React.ElementType;
  docsUrl?: string;
}> = {
  lovable_ai: {
    displayName: 'Lovable AI Gateway',
    description: 'Primary AI gateway',
    powers: 'All executives, tool calling, chat completions',
    icon: Zap,
  },
  vertex_ai: {
    displayName: 'Vertex AI (Gemini)',
    description: 'ai-chat primary',
    powers: 'ai-chat function, Gemini Express Mode access',
    icon: Bot,
    docsUrl: 'https://cloud.google.com/vertex-ai'
  },
  gemini: {
    displayName: 'Google Gemini',
    description: 'Vision & multimodal',
    powers: 'Image analysis, document processing, vision tasks',
    icon: Eye,
    docsUrl: 'https://ai.google.dev'
  },
  deepseek: {
    displayName: 'DeepSeek',
    description: 'CTO fallback AI',
    powers: 'CTO persona, code analysis, technical decisions',
    icon: Code,
    docsUrl: 'https://deepseek.com'
  },
  openrouter: {
    displayName: 'OpenRouter (Kimi K2)',
    description: 'Kimi K2 fallback',
    powers: 'Kimi K2 access, multi-model routing',
    icon: Zap,
    docsUrl: 'https://openrouter.ai'
  },
  openai: {
    displayName: 'OpenAI',
    description: 'GPT-5 & TTS',
    powers: 'Text-to-speech, complex reasoning, GPT models',
    icon: MessageSquare,
    docsUrl: 'https://platform.openai.com'
  },
  vercel_ai: {
    displayName: 'Vercel AI SDK',
    description: 'Streaming fallback',
    powers: 'AI streaming, model routing',
    icon: Zap,
    docsUrl: 'https://sdk.vercel.ai'
  },
  github: {
    displayName: 'GitHub',
    description: 'Repository access',
    powers: 'Code commits, PRs, issues, workflows',
    icon: Github,
    docsUrl: 'https://github.com/settings/tokens'
  },
  elevenlabs: {
    displayName: 'ElevenLabs',
    description: 'Voice synthesis',
    powers: 'Humanized TTS, voice cloning',
    icon: Mic,
    docsUrl: 'https://elevenlabs.io'
  },

  tave: {
    displayName: 'Táve/VSCO Workspace',
    description: 'Business CMS',
    powers: 'Party Favor Photo operations, quotes, jobs, contacts',
    icon: Camera,
    docsUrl: 'https://tave.com'
  }
};

export function CredentialsManager() {
  const { health, loading, refresh } = useAPIKeyHealth();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAPIKeyHealth();
    // Wait a moment for the health check to complete
    setTimeout(() => {
      refresh();
      setRefreshing(false);
    }, 2000);
  };

  const getStatusBadge = (isHealthy: boolean, errorMessage: string | null) => {
    if (isHealthy) {
      return (
        <Badge variant="outline" className="border-success text-success">
          <CheckCircle className="h-3 w-3 mr-1" />
          Healthy
        </Badge>
      );
    }
    if (errorMessage?.includes('depleted') || errorMessage?.includes('credits')) {
      return (
        <Badge variant="outline" className="border-warning text-warning">
          <AlertCircle className="h-3 w-3 mr-1" />
          Credits Low
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        <XCircle className="h-3 w-3 mr-1" />
        Error
      </Badge>
    );
  };

  // Group credentials by category
  const aiProviders = health.filter(h =>
    ['xai', 'lovable_ai', 'deepseek', 'vercel_ai', 'gemini', 'openai'].includes(h.service_name)
  );
  const integrations = health.filter(h =>
    ['github', 'elevenlabs', 'tave'].includes(h.service_name)
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const renderCredentialCard = (item: typeof health[0]) => {
    const info = SERVICE_INFO[item.service_name] || {
      displayName: item.service_name,
      description: 'Service',
      powers: 'Various features',
      icon: Zap,
      docsUrl: undefined
    };
    const Icon = info.icon;

    return (
      <Card key={item.service_name} className="transition-all hover:shadow-md">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-lg ${item.is_healthy ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                <Icon className={`h-5 w-5 ${item.is_healthy ? 'text-primary' : 'text-destructive'}`} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{info.displayName}</h4>
                  {info.docsUrl && (
                    <a
                      href={info.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{info.description}</p>
                <p className="text-xs text-muted-foreground/80">
                  <span className="font-medium">Powers:</span> {info.powers}
                </p>
                {item.error_message && !item.is_healthy && (
                  <p className="text-xs text-destructive mt-1">{item.error_message}</p>
                )}
                {item.last_checked && (
                  <p className="text-xs text-muted-foreground/60">
                    Last checked: {new Date(item.last_checked).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            {getStatusBadge(item.is_healthy, item.error_message)}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">API Credentials Status</h3>
          <p className="text-sm text-muted-foreground">
            Monitor which APIs power Eliza and the executives
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>

      {/* AI Providers Section */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Bot className="h-4 w-4" />
          AI Providers & Executives
        </h4>
        <div className="grid gap-3">
          {aiProviders.length > 0 ? (
            aiProviders.map(renderCredentialCard)
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No AI provider credentials found. Run a health check to detect configured APIs.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Integrations Section */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Service Integrations
        </h4>
        <div className="grid gap-3">
          {integrations.length > 0 ? (
            integrations.map(renderCredentialCard)
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No integration credentials found.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">
                {health.filter(h => h.is_healthy).length} / {health.length} credentials healthy
              </span>
            </div>
            <div className="flex items-center gap-2">
              {health.filter(h => h.is_healthy).length === health.length ? (
                <Badge variant="outline" className="border-success text-success">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  All Systems Go
                </Badge>
              ) : (
                <Badge variant="outline" className="border-warning text-warning">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Some Issues
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CredentialsManager;
