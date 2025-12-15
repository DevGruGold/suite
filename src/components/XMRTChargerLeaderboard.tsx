import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Battery, Zap, Award, Wifi, WifiOff, Monitor, Smartphone, Tablet, Globe, Link2, MapPin, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { detectUserIP, maskIP, doIPsMatch } from "@/services/ipDetectionService";
import { DeviceClaimModal } from "./DeviceClaimModal";
import { toast } from "sonner";

interface ChargerStats {
  deviceFingerprint: string;
  deviceType: string;
  totalPopPoints: number;
  totalChargingSessions: number;
  avgEfficiency: number;
  batteryHealth: number;
  lastActive: string;
}

interface ConnectedDevice {
  id: string;
  deviceId: string;
  deviceFingerprint: string;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  connectedAt: string;
  lastHeartbeat: string;
  batteryLevel: number | null;
  isActive: boolean;
  ipAddress: string | null;
  location: {
    city?: string;
    region?: string;
    country?: string;
  } | null;
  claimedBy: string | null;
}

const XMRTChargerLeaderboard = () => {
  const { user } = useAuth();
  const [chargers, setChargers] = useState<ChargerStats[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [userIP, setUserIP] = useState<string>('');
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<ConnectedDevice | null>(null);

  // Detect user's IP on mount
  useEffect(() => {
    detectUserIP().then(setUserIP);
  }, []);

  const fetchConnectedDevices = async () => {
    try {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('device_connection_sessions')
        .select(`
          id,
          device_id,
          connected_at,
          last_heartbeat,
          session_key,
          is_active,
          ip_address,
          location_data,
          devices (
            device_fingerprint,
            device_type,
            browser,
            os,
            claimed_by,
            last_known_location
          )
        `)
        .or(`is_active.eq.true,connected_at.gte.${fifteenMinAgo}`)
        .order('connected_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching connected devices:', error);
        return;
      }

      if (data) {
        const deviceMap = new Map<string, ConnectedDevice>();
        
        for (const session of data) {
          const deviceId = session.device_id;
          if (!deviceMap.has(deviceId) || new Date(session.connected_at) > new Date(deviceMap.get(deviceId)!.connectedAt)) {
            const device = session.devices as any;
            const locationData = session.location_data || device?.last_known_location || {};
            
            deviceMap.set(deviceId, {
              id: session.id,
              deviceId: deviceId,
              deviceFingerprint: device?.device_fingerprint || deviceId?.slice(0, 8) || 'Unknown',
              deviceType: device?.device_type || null,
              browser: device?.browser || null,
              os: device?.os || null,
              connectedAt: session.connected_at,
              lastHeartbeat: session.last_heartbeat || session.connected_at,
              batteryLevel: null,
              isActive: session.is_active || false,
              ipAddress: (session.ip_address as string) || null,
              location: locationData && Object.keys(locationData).length > 0 ? locationData : null,
              claimedBy: (device?.claimed_by as string) || null,
            });
          }
        }
        
        setConnectedDevices(Array.from(deviceMap.values()));
      }
    } catch (err) {
      console.error('Error fetching connected devices:', err);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase.rpc('get_xmrt_charger_leaderboard', {
        limit_count: 10
      });
      
      if (error) {
        console.error('Failed to fetch charger leaderboard:', error);
        return;
      }

      if (data && Array.isArray(data)) {
        setChargers(data.map(row => ({
          deviceFingerprint: row.device_fingerprint || 'Unknown',
          deviceType: row.device_type || 'Device',
          totalPopPoints: row.total_pop_points || 0,
          totalChargingSessions: row.total_charging_sessions || 0,
          avgEfficiency: row.avg_efficiency || 0,
          batteryHealth: row.battery_health || 0,
          lastActive: row.last_active || new Date().toISOString()
        })));
      }
    } catch (err) {
      console.error('Error fetching charger leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnectedDevices();
    fetchLeaderboard();
    
    const interval = setInterval(() => {
      fetchConnectedDevices();
      fetchLeaderboard();
    }, 30000);
    
    const channel = supabase
      .channel('device-connections-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'device_connection_sessions'
      }, () => {
        fetchConnectedDevices();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const anonymizeFingerprint = (fingerprint: string) => {
    if (!fingerprint || fingerprint.length < 8) return fingerprint || 'Unknown';
    return `${fingerprint.slice(0, 6)}...${fingerprint.slice(-4)}`;
  };

  const getDeviceIcon = (deviceType: string | null, os: string | null) => {
    const type = (deviceType || os || '').toLowerCase();
    if (type.includes('android')) return <Smartphone className="h-4 w-4 text-green-500" />;
    if (type.includes('iphone') || type.includes('ios')) return <Smartphone className="h-4 w-4 text-blue-500" />;
    if (type.includes('tablet') || type.includes('ipad')) return <Tablet className="h-4 w-4 text-purple-500" />;
    if (type.includes('mobile') || type.includes('phone')) return <Smartphone className="h-4 w-4" />;
    return <Monitor className="h-4 w-4 text-orange-500" />;
  };

  const getDeviceLabel = (deviceType: string | null, os: string | null) => {
    const type = (deviceType || '').toLowerCase();
    const osLower = (os || '').toLowerCase();
    
    if (type.includes('android') || osLower.includes('android')) return 'Android';
    if (type.includes('iphone') || osLower.includes('ios')) return 'iPhone';
    if (type.includes('ipad')) return 'iPad';
    if (type.includes('tablet')) return 'Tablet';
    if (osLower.includes('windows')) return 'Windows PC';
    if (osLower.includes('mac')) return 'Mac';
    if (osLower.includes('linux')) return 'Linux';
    return 'Device';
  };

  const formatLocation = (location: ConnectedDevice['location']) => {
    if (!location) return null;
    const parts = [location.city, location.region, location.country].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  const handleClaimDevice = (device: ConnectedDevice) => {
    if (!user) {
      toast.error('Please sign in to claim devices');
      return;
    }
    setSelectedDevice(device);
    setClaimModalOpen(true);
  };

  const activeDevices = connectedDevices.filter(d => d.isActive);

  return (
    <>
      <Card className="bg-card/50 border-border shadow-lg backdrop-blur-sm hover:shadow-xl transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <Battery className="h-6 w-6 text-mining-active" />
                XMRT Charger Dashboard
              </CardTitle>
              <CardDescription>
                Connected devices and PoP leaderboard
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mining-active opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-mining-active"></span>
              </span>
              <span>{activeDevices.length} Online</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connected Devices Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Wifi className="h-4 w-4 text-mining-active" />
              <span>Connected Devices</span>
              <span className="text-xs text-muted-foreground">({connectedDevices.length})</span>
            </div>
            
            {connectedDevices.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                <WifiOff className="h-5 w-5 mx-auto mb-2 opacity-50" />
                No devices connected
              </div>
            ) : (
              <div className="grid gap-2">
                {connectedDevices.slice(0, 5).map((device) => {
                  const ipMatches = userIP && device.ipAddress && doIPsMatch(userIP, device.ipAddress);
                  const isClaimable = !device.claimedBy && user;
                  const isOwnDevice = device.claimedBy === user?.id;
                  
                  return (
                    <div
                      key={device.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        ipMatches 
                          ? 'bg-gradient-to-r from-green-500/10 to-green-500/5 border-green-500/30 hover:border-green-500/50' 
                          : 'bg-gradient-to-r from-background to-secondary/20 border-border hover:border-primary/30'
                      }`}
                    >
                      {/* Status indicator */}
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                        {getDeviceIcon(device.deviceType, device.os)}
                      </div>

                      {/* Device info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-medium truncate">
                            {anonymizeFingerprint(device.deviceFingerprint)}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5">
                            {getDeviceLabel(device.deviceType, device.os)}
                          </Badge>
                          {device.isActive && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-mining-active/20 text-mining-active">
                              LIVE
                            </span>
                          )}
                          {isOwnDevice && (
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <CheckCircle className="h-2.5 w-2.5" />
                              Yours
                            </Badge>
                          )}
                          {ipMatches && !isOwnDevice && (
                            <Badge variant="outline" className="text-[10px] gap-1 border-green-500/50 text-green-600">
                              <Zap className="h-2.5 w-2.5" />
                              Your IP
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          {device.browser && <span>{device.browser}</span>}
                          {device.browser && device.os && <span>•</span>}
                          {device.os && <span>{device.os}</span>}
                        </div>
                        
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                          {/* Location */}
                          {formatLocation(device.location) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {formatLocation(device.location)}
                            </span>
                          )}
                          {/* Masked IP */}
                          {device.ipAddress && (
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {maskIP(device.ipAddress)}
                            </span>
                          )}
                          {/* Connection time */}
                          <span>{formatTime(device.connectedAt)}</span>
                        </div>
                      </div>

                      {/* Claim button */}
                      {isClaimable && (
                        <Button 
                          variant={ipMatches ? "default" : "outline"} 
                          size="sm"
                          onClick={() => handleClaimDevice(device)}
                          className="gap-1"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {ipMatches ? 'Claim' : 'Link'}
                        </Button>
                      )}

                      {/* Battery level */}
                      {device.batteryLevel !== null && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Battery className="h-3.5 w-3.5" />
                          <span>{device.batteryLevel}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {connectedDevices.length > 5 && (
                  <div className="text-center text-xs text-muted-foreground py-1">
                    +{connectedDevices.length - 5} more devices
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* PoP Leaderboard Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Award className="h-4 w-4 text-mining-warning" />
              <span>PoP Leaderboard</span>
              <span className="text-xs text-muted-foreground">(Top Earners)</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : chargers.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                No PoP data yet - start charging to earn points!
              </div>
            ) : (
              <div className="space-y-2">
                {chargers.map((charger, index) => (
                  <div
                    key={charger.deviceFingerprint}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-background to-secondary/20 border border-border hover:border-primary/30 transition-all"
                  >
                    {/* Rank */}
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {index === 0 ? (
                        <Award className="h-4 w-4 text-mining-warning" />
                      ) : (
                        index + 1
                      )}
                    </div>

                    {/* Charger Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium truncate">
                          {anonymizeFingerprint(charger.deviceFingerprint)}
                        </span>
                        {charger.deviceType && (
                          <span className="text-xs text-muted-foreground">
                            {charger.deviceType}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{charger.totalChargingSessions} sessions</span>
                        <span>•</span>
                        <span>{Math.round(charger.avgEfficiency)}% efficiency</span>
                      </div>
                    </div>

                    {/* PoP Points */}
                    <div className="text-right">
                      <div className="text-sm font-bold text-mining-warning">
                        {charger.totalPopPoints.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground">PoP pts</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-2 border-t border-border text-xs text-muted-foreground text-center">
            Updates every 30 seconds • Earn PoP points by charging your device
          </div>
        </CardContent>
      </Card>

      {/* Claim Modal */}
      {selectedDevice && (
        <DeviceClaimModal
          isOpen={claimModalOpen}
          onClose={() => {
            setClaimModalOpen(false);
            setSelectedDevice(null);
          }}
          deviceId={selectedDevice.deviceId}
          deviceFingerprint={anonymizeFingerprint(selectedDevice.deviceFingerprint)}
          deviceIP={selectedDevice.ipAddress || ''}
          userIP={userIP}
          userId={user?.id || ''}
          onClaimed={() => {
            fetchConnectedDevices();
            toast.success('Device claimed! PoP points will now be linked to your profile.');
          }}
        />
      )}
    </>
  );
};

export default XMRTChargerLeaderboard;
