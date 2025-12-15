import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Battery, Zap, Award, Wifi, WifiOff, Monitor, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
}

const XMRTChargerLeaderboard = () => {
  const [chargers, setChargers] = useState<ChargerStats[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [loading, setLoading] = useState(true);

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
          devices (
            device_fingerprint,
            device_type,
            browser,
            os
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
    
    // Real-time subscription for device connections
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

  const getDeviceIcon = (deviceType: string | null) => {
    if (!deviceType) return <Monitor className="h-4 w-4" />;
    const type = deviceType.toLowerCase();
    if (type.includes('mobile') || type.includes('phone') || type.includes('android') || type.includes('ios')) {
      return <Smartphone className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  const activeDevices = connectedDevices.filter(d => d.isActive);

  return (
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
              {connectedDevices.slice(0, 5).map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-background to-secondary/20 border border-border hover:border-primary/30 transition-all"
                >
                  {/* Status indicator */}
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                    {device.isActive ? (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mining-active opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-mining-active"></span>
                      </span>
                    ) : (
                      <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50"></span>
                    )}
                  </div>

                  {/* Device info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {getDeviceIcon(device.deviceType)}
                      <span className="font-mono text-sm font-medium truncate">
                        {anonymizeFingerprint(device.deviceFingerprint)}
                      </span>
                      {device.isActive && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-mining-active/20 text-mining-active">
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {device.browser && <span>{device.browser}</span>}
                      {device.browser && device.os && <span>•</span>}
                      {device.os && <span>{device.os}</span>}
                      <span>•</span>
                      <span>{formatTime(device.connectedAt)}</span>
                    </div>
                  </div>

                  {/* Battery level */}
                  {device.batteryLevel !== null && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Battery className="h-3.5 w-3.5" />
                      <span>{device.batteryLevel}%</span>
                    </div>
                  )}
                </div>
              ))}
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
  );
};

export default XMRTChargerLeaderboard;
