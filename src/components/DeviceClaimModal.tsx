import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Smartphone, CheckCircle, Copy, QrCode } from 'lucide-react';

interface DeviceClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  deviceFingerprint: string;
  deviceIP: string;
  userIP: string;
  onClaimed: () => void;
}

export const DeviceClaimModal = ({
  isOpen,
  onClose,
  deviceId,
  deviceFingerprint,
  deviceIP,
  userIP,
  onClaimed
}: DeviceClaimModalProps) => {
  const [claimCode, setClaimCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);

  const ipMatches = deviceIP && userIP && deviceIP === userIP;

  // Generate claim code when modal opens
  useEffect(() => {
    if (isOpen && !ipMatches) {
      generateClaimCode();
    }
  }, [isOpen, ipMatches]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        setGeneratedCode(null);
        setExpiresAt(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const generateClaimCode = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('monitor-device-connections', {
        body: {
          action: 'generate_claim_code',
          device_id: deviceId
        }
      });

      if (error) throw error;
      
      if (data?.claim_code) {
        setGeneratedCode(data.claim_code);
        setClaimCode(data.claim_code);
        setExpiresAt(new Date(Date.now() + 10 * 60 * 1000)); // 10 minutes
      }
    } catch (err) {
      console.error('Failed to generate claim code:', err);
      toast.error('Failed to generate claim code');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoClaim = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('monitor-device-connections', {
        body: {
          action: 'auto_pair_by_ip',
          device_id: deviceId,
          user_ip: userIP
        }
      });

      if (error) throw error;
      
      if (data?.success) {
        toast.success('Device claimed successfully!');
        onClaimed();
        onClose();
      } else {
        toast.error(data?.error || 'Failed to claim device');
      }
    } catch (err) {
      console.error('Auto-claim failed:', err);
      toast.error('Failed to auto-claim device');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeClaim = async () => {
    if (codeInput.length !== 6) {
      toast.error('Please enter a 6-character code');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('monitor-device-connections', {
        body: {
          action: 'verify_claim_code',
          device_id: deviceId,
          claim_code: codeInput.toUpperCase()
        }
      });

      if (error) throw error;
      
      if (data?.success) {
        toast.success('Device claimed successfully!');
        onClaimed();
        onClose();
      } else {
        toast.error(data?.error || 'Invalid or expired code');
      }
    } catch (err) {
      console.error('Code claim failed:', err);
      toast.error('Failed to verify claim code');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      toast.success('Code copied to clipboard');
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const qrUrl = `${window.location.origin}/claim?code=${generatedCode}&device_id=${deviceId}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            Claim Device
          </DialogTitle>
          <DialogDescription>
            Link this device to your profile to earn PoP points
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Device Info */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm">{deviceFingerprint}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              IP: {deviceIP || 'Unknown'}
            </div>
          </div>

          {/* Auto-pair option if IP matches */}
          {ipMatches ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-green-500">IP Address Matches!</p>
                  <p className="text-xs text-muted-foreground">This device appears to be yours</p>
                </div>
              </div>
              <Button onClick={handleAutoClaim} disabled={loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Claim This Device
              </Button>
            </div>
          ) : (
            /* QR Code / Manual Code Entry */
            <div className="space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                IP addresses don't match. Use QR code or enter verification code.
              </div>

              {generatedCode && (
                <>
                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-white">
                    <QRCodeSVG value={qrUrl} size={160} />
                    <p className="text-xs text-gray-500">Scan on your device to claim</p>
                  </div>

                  {/* Code Display */}
                  <div className="flex items-center justify-center gap-2">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted font-mono text-2xl tracking-widest">
                      {generatedCode}
                    </div>
                    <Button variant="ghost" size="icon" onClick={copyCode}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Countdown */}
                  {countdown > 0 && (
                    <div className="text-center text-sm text-muted-foreground">
                      Code expires in: <Badge variant="outline">{formatCountdown(countdown)}</Badge>
                    </div>
                  )}
                </>
              )}

              {/* Manual Code Entry */}
              <div className="space-y-2">
                <Label>Or enter device code:</Label>
                <div className="flex gap-2">
                  <Input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={6}
                    className="font-mono text-center tracking-widest"
                  />
                  <Button onClick={handleCodeClaim} disabled={loading || codeInput.length !== 6}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                  </Button>
                </div>
              </div>

              {!generatedCode && !loading && (
                <Button variant="outline" onClick={generateClaimCode} className="w-full">
                  <QrCode className="w-4 h-4 mr-2" />
                  Generate Claim Code
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
