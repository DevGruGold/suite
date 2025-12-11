import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Shield, Eye, Link2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PrivacyConsentBannerProps {
  sessionKey: string;
  onConsentChange?: (consent: ConsentSettings) => void;
}

interface ConsentSettings {
  ipCorrelation: boolean;
  deviceFingerprinting: boolean;
  crossPlatformLinking: boolean;
}

const CONSENT_STORAGE_KEY = 'xmrt_privacy_consent';

export const PrivacyConsentBanner: React.FC<PrivacyConsentBannerProps> = ({
  sessionKey,
  onConsentChange,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [consent, setConsent] = useState<ConsentSettings>({
    ipCorrelation: false,
    deviceFingerprinting: false,
    crossPlatformLinking: false,
  });
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    checkExistingConsent();
  }, [sessionKey]);

  const checkExistingConsent = () => {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setConsent(parsed);
        onConsentChange?.(parsed);
      } catch {
        setIsVisible(true);
      }
    } else {
      setIsVisible(true);
    }
  };

  const handleSaveConsent = async () => {
    // Store locally
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));

    // Store consent via edge function (handles IP server-side)
    try {
      await supabase.functions.invoke('correlate-user-identity', {
        body: {
          action: 'record_event',
          sessionKey,
          sourceType: 'consent_update',
          userAgent: navigator.userAgent,
          deviceFingerprint: '',
          metadata: {
            consent_given: consent.ipCorrelation || consent.crossPlatformLinking,
            consent_settings: consent,
          },
        },
      });
    } catch (err) {
      console.error('Failed to store consent:', err);
    }

    onConsentChange?.(consent);
    setIsVisible(false);
  };

  const handleDeclineAll = () => {
    const declined = {
      ipCorrelation: false,
      deviceFingerprinting: false,
      crossPlatformLinking: false,
    };
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(declined));
    setConsent(declined);
    onConsentChange?.(declined);
    setIsVisible(false);
  };

  const handleAcceptAll = () => {
    const accepted = {
      ipCorrelation: true,
      deviceFingerprinting: true,
      crossPlatformLinking: true,
    };
    setConsent(accepted);
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(accepted));
    onConsentChange?.(accepted);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[420px] z-50 animate-in slide-in-from-bottom-4">
      <Card className="bg-card border-border shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2 text-foreground">
              <Shield className="h-5 w-5 text-primary" />
              Privacy Settings
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setIsVisible(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            To provide personalized experience across chat and XMRT Charger, we can link your
            activity. You control what data is shared.
          </p>

          {showDetails ? (
            <div className="space-y-4">
              {/* IP Correlation */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Eye className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ip-consent" className="text-sm font-medium text-foreground">
                      Session Correlation
                    </Label>
                    <Switch
                      id="ip-consent"
                      checked={consent.ipCorrelation}
                      onCheckedChange={(checked) =>
                        setConsent((prev) => ({ ...prev, ipCorrelation: checked }))
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Link your chat sessions with device connections using IP address
                  </p>
                </div>
              </div>

              {/* Device Fingerprinting */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="fingerprint-consent" className="text-sm font-medium text-foreground">
                      Device Recognition
                    </Label>
                    <Switch
                      id="fingerprint-consent"
                      checked={consent.deviceFingerprinting}
                      onCheckedChange={(checked) =>
                        setConsent((prev) => ({ ...prev, deviceFingerprinting: checked }))
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Remember your device for seamless cross-session experience
                  </p>
                </div>
              </div>

              {/* Cross-Platform Linking */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Link2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="linking-consent" className="text-sm font-medium text-foreground">
                      Cross-Platform Linking
                    </Label>
                    <Switch
                      id="linking-consent"
                      checked={consent.crossPlatformLinking}
                      onCheckedChange={(checked) =>
                        setConsent((prev) => ({ ...prev, crossPlatformLinking: checked }))
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect chat, XMRT Charger, and mining data for unified rewards
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <Button
              variant="link"
              className="p-0 h-auto text-primary"
              onClick={() => setShowDetails(true)}
            >
              Customize settings →
            </Button>
          )}
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleDeclineAll}>
            Decline All
          </Button>
          {showDetails ? (
            <Button className="flex-1" onClick={handleSaveConsent}>
              Save Preferences
            </Button>
          ) : (
            <Button className="flex-1" onClick={handleAcceptAll}>
              Accept All
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default PrivacyConsentBanner;
