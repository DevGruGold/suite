import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Smartphone, Monitor, Tablet, Battery, Coins, 
  Unlink, Plus, Loader2, MapPin, RefreshCw, Wifi, WifiOff
} from "lucide-react";

interface ClaimedDevice {
  id: string;
  deviceFingerprint: string;
  deviceType: string;
  os: string | null;
  browser: string | null;
  location: {
    city?: string;
    region?: string;
    country?: string;
  } | null;
  claimedAt: string;
  lastActive: string | null;
  isOnline: boolean;
  totalPopPoints: number;
}

interface ClaimedDevicesSectionProps {
  userId: string;
}

export const ClaimedDevicesSection = ({ userId }: ClaimedDevicesSectionProps) => {
  const [devices, setDevices] = useState<ClaimedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimCode, setClaimCode] = useState('');
  const [claiming, setClaiming] = useState(false);

  const fetchClaimedDevices = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('monitor-device-connections', {
        body: {
          action: 'list_user_devices',
          user_id: userId
        }
      });

      if (error) throw error;

      if (data?.devices) {
        setDevices(data.devices);
      }
    } catch (err) {
      console.error('Failed to fetch claimed devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchClaimedDevices();
    }
  }, [userId]);

  const handleUnclaimDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to unclaim this device? You will stop earning PoP points from it.')) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('monitor-device-connections', {
        body: {
          action: 'unclaim_device',
          device_id: deviceId,
          user_id: userId
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Device unclaimed');
        fetchClaimedDevices();
      } else {
        toast.error(data?.error || 'Failed to unclaim device');
      }
    } catch (err) {
      console.error('Unclaim failed:', err);
      toast.error('Failed to unclaim device');
    }
  };

  const handleClaimByCode = async () => {
    if (claimCode.length !== 6) {
      toast.error('Please enter a 6-character code');
      return;
    }

    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke('monitor-device-connections', {
        body: {
          action: 'verify_claim_code',
          claim_code: claimCode.toUpperCase(),
          user_id: userId
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Device claimed successfully!');
        setClaimCode('');
        fetchClaimedDevices();
      } else {
        toast.error(data?.error || 'Invalid or expired code');
      }
    } catch (err) {
      console.error('Claim by code failed:', err);
      toast.error('Failed to claim device');
    } finally {
      setClaiming(false);
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    const type = deviceType.toLowerCase();
    if (type.includes('android') || type.includes('iphone') || type.includes('phone')) {
      return <Smartphone className="h-5 w-5" />;
    }
    if (type.includes('tablet') || type.includes('ipad')) {
      return <Tablet className="h-5 w-5" />;
    }
    return <Monitor className="h-5 w-5" />;
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const formatLocation = (location: ClaimedDevice['location']) => {
    if (!location) return null;
    const parts = [location.city, location.country].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  const totalPopPoints = devices.reduce((sum, d) => sum + (d.totalPopPoints || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              My Claimed Devices
            </CardTitle>
            <CardDescription>
              Devices linked to your account for PoP point accumulation
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchClaimedDevices}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2">
            <Battery className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">{devices.length} device{devices.length !== 1 ? 's' : ''} claimed</span>
          </div>
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-mining-warning" />
            <span className="font-bold text-mining-warning">{totalPopPoints.toLocaleString()} PoP</span>
          </div>
        </div>

        {/* Device List */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No devices claimed yet</p>
            <p className="text-xs mt-1">Visit the Charger Dashboard to claim your devices</p>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-background to-secondary/20 border border-border"
              >
                {/* Device Icon & Status */}
                <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  device.isOnline ? 'bg-green-500/10' : 'bg-muted'
                }`}>
                  {getDeviceIcon(device.deviceType)}
                </div>

                {/* Device Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium truncate">
                      {device.deviceFingerprint}
                    </span>
                    {device.isOnline ? (
                      <Badge variant="outline" className="text-[10px] gap-1 border-green-500/50 text-green-600">
                        <Wifi className="h-2.5 w-2.5" />
                        Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                        <WifiOff className="h-2.5 w-2.5" />
                        Offline
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{device.deviceType}</span>
                    {device.os && (
                      <>
                        <span>•</span>
                        <span>{device.os}</span>
                      </>
                    )}
                    {formatLocation(device.location) && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {formatLocation(device.location)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Last active: {formatTime(device.lastActive)}
                  </div>
                </div>

                {/* PoP Points */}
                <div className="text-right mr-2">
                  <div className="text-sm font-bold text-mining-warning">
                    {device.totalPopPoints.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground">PoP pts</div>
                </div>

                {/* Unclaim Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleUnclaimDevice(device.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Unlink className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Claim by Code */}
        <div className="pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Plus className="h-4 w-4" />
            Claim Device by Code
          </div>
          <div className="flex gap-2">
            <Input
              value={claimCode}
              onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-character code"
              maxLength={6}
              className="font-mono tracking-widest"
            />
            <Button 
              onClick={handleClaimByCode} 
              disabled={claiming || claimCode.length !== 6}
            >
              {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Claim'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Get a claim code from xmrtcharger.vercel.app on your device
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
