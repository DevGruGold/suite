import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Eye, EyeOff, ExternalLink, Loader2, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export interface UnifiedAPIKeyInputProps {
  serviceName: string;
  serviceLabel: string;
  keyPrefix: string;
  helpUrl: string;
  placeholder?: string;
  description?: string;
  secretName?: string;
  onSuccess?: () => void;
  showCancel?: boolean;
  onCancel?: () => void;
  organizationId?: string;
}

export const UnifiedAPIKeyInput: React.FC<UnifiedAPIKeyInputProps> = ({
  serviceName,
  serviceLabel,
  keyPrefix,
  helpUrl,
  placeholder,
  description,
  secretName,
  onSuccess,
  showCancel = false,
  onCancel,
  organizationId
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter an API key",
        variant: "destructive"
      });
      return;
    }

    // Format validation
    if (keyPrefix && !apiKey.startsWith(keyPrefix)) {
      toast({
        title: "Invalid Format",
        description: `${serviceLabel} API keys should start with "${keyPrefix}"`,
        variant: "destructive"
      });
      return;
    }

    setIsValidating(true);

    try {
      const { error } = await supabase.functions.invoke('update-api-key', {
        body: {
          service: serviceName,
          secret_name: secretName || `${serviceName.toUpperCase()}_API_KEY`,
          api_key: apiKey,
          organization_id: organizationId
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `${serviceLabel} API key updated successfully`,
      });

      setApiKey('');

      // Trigger health check
      setTimeout(async () => {
        await supabase.functions.invoke('api-key-health-monitor');
      }, 1000);

      onSuccess?.();

    } catch (error) {
      console.error('Failed to update API key:', error);
      toast({
        title: "Error",
        description: `Failed to update ${serviceLabel} API key`,
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          {serviceLabel} API Key
        </CardTitle>
        {description && (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${serviceName}-key`}>API Key</Label>
          <div className="relative">
            <Input
              id={`${serviceName}-key`}
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={placeholder || `${keyPrefix}...`}
              className="pr-10"
              disabled={isValidating}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isValidating || !apiKey.trim()}
            className="flex-1"
          >
            {isValidating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Update API Key'
            )}
          </Button>
          {showCancel && onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>

        <Button variant="outline" size="sm" className="w-full" asChild>
          <a href={helpUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4 mr-2" />
            Get {serviceLabel} API Key
          </a>
        </Button>
      </CardContent>
    </Card>
  );
};
