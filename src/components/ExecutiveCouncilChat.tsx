import React from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { ChevronDown, Users, Clock, TrendingUp, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useToast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { useState } from 'react';
import type { CouncilDeliberation } from '@/services/executiveCouncilService';

interface ExecutiveCouncilChatProps {
  deliberation: CouncilDeliberation;
}

export const ExecutiveCouncilChat: React.FC<ExecutiveCouncilChatProps> = ({ deliberation }) => {
  const { responses, synthesis, consensus, totalExecutionTimeMs } = deliberation;
  const { toast } = useToast();

  const CopyButton = ({ content }: { content: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
      navigator.clipboard.writeText(content);
      setCopied(true);
      toast({
        title: "Copied to clipboard",
        description: "Content copied successfully",
      });
      setTimeout(() => setCopied(false), 2000);
    };
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </Button>
    );
  };

  const CodeBlock = ({ code, language, ...props }: { code: string, language: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
      navigator.clipboard.writeText(code);
      setCopied(true);
      toast({
        title: "Copied to clipboard",
        description: "Code snippet copied successfully",
      });
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="relative group my-4">
        <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          className="rounded-md !mt-0"
          {...props}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    );
  };

  const MarkdownContent = ({ content }: { content: string }) => (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            if (!inline && match) {
              return <CodeBlock code={codeString} language={match[1]} {...props} />;
            }
            return (
              <code className={`${className} bg-muted px-1.5 py-0.5 rounded-md font-mono text-xs`} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  const renderExecutiveAvatar = (executive: string, icon: string, color: string) => {
    return (
      <div 
        className={`rounded-full w-10 h-10 flex items-center justify-center bg-${color}-500/20 border-2 border-${color}-500 shrink-0`}
        style={{
          backgroundColor: `hsl(var(--${color}) / 0.2)`,
          borderColor: `hsl(var(--${color}))`
        }}
      >
        <span className="text-lg">{icon}</span>
      </div>
    );
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600 dark:text-green-400';
    if (confidence >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  };

  return (
    <div className="space-y-4 bg-muted/30 p-4 rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Executive Council Deliberation
          </span>
          {consensus && (
            <Badge variant="outline" className="text-xs">
              Consensus Reached
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{(totalExecutionTimeMs / 1000).toFixed(2)}s</span>
        </div>
      </div>

      {/* Executive Perspectives */}
      <div className="space-y-2">
        {responses.map((perspective, idx) => (
          <Collapsible key={idx}>
            <CollapsibleTrigger className="flex items-center gap-3 w-full hover:bg-muted/50 p-3 rounded-lg transition-colors">
              {renderExecutiveAvatar(perspective.executive, perspective.executiveIcon, perspective.executiveColor)}
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-foreground">
                  {perspective.executiveTitle}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className={getConfidenceColor(perspective.confidence)}>
                    <TrendingUp className="w-3 h-3 inline mr-1" />
                    {perspective.confidence}% confidence
                  </span>
                  {perspective.executionTimeMs && (
                    <span>
                      <Clock className="w-3 h-3 inline mr-1" />
                      {perspective.executionTimeMs}ms
                    </span>
                  )}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform ui-open:rotate-180" />
            </CollapsibleTrigger>
            
            <CollapsibleContent className="pl-[52px] pr-3 pt-2 pb-3 group">
              <div className="text-sm leading-relaxed text-foreground">
                <MarkdownContent content={perspective.perspective} />
              </div>
              <div className="mt-2 flex justify-end">
                <CopyButton content={perspective.perspective} />
              </div>
              
              {perspective.reasoning && perspective.reasoning.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">
                    Reasoning Steps:
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {perspective.reasoning.map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
      
      {/* Synthesized Response */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="rounded-full w-8 h-8 flex items-center justify-center bg-primary/20 border-2 border-primary">
            <span className="text-sm">🎯</span>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            Unified Council Recommendation:
          </span>
        </div>
        <div className="text-sm leading-relaxed text-foreground pl-10 group">
          <MarkdownContent content={synthesis} />
          <div className="mt-2 flex justify-end">
            <CopyButton content={synthesis} />
          </div>
        </div>
      </div>

      {/* Executive Count Badge */}
      <div className="flex items-center justify-center pt-2">
        <Badge variant="secondary" className="text-xs">
          {responses.length} Executive{responses.length !== 1 ? 's' : ''} Consulted
        </Badge>
      </div>
    </div>
  );
};
