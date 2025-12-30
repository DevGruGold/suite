import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Smartphone, Laptop, Tablet, Monitor, Activity, TrendingUp, MapPin, Clock } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface SessionInfo {
  session_id: string;
  connected_at: string;
  disconnected_at?: string;
  duration_seconds?: number;
  pop_points?: number;
  ip_address?: string;
  is_active: boolean;
}

interface DeviceData {
  device_id: string;
  device_category: string;
  device_type: string;
  browser?: string;
  os?: string;
  first_seen: string;
  last_seen: string;
  total_sessions: number;
  active_sessions: number;
  total_duration_hours: number;
  total_pop_points: number;
  recent_sessions: SessionInfo[];
  ip_addresses: string[];
}

const DeviceIcon = ({ category }: { category: string }) => {
  switch (category?.toLowerCase()) {
    case 'mobile':
      return <Smartphone className="w-6 h-6" />;
    case 'tablet':
      return <Tablet className="w-6 h-6" />;
    case 'laptop':
      return <Laptop className="w-6 h-6" />;
    case 'desktop':
      return <Monitor className="w-6 h-6" />;
    default:
      return <Monitor className="w-6 h-6 opacity-50" />;
  }
};

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const SessionCard = ({ session }: { session: SessionInfo }) => {
  const isActive = session.is_active;
  const duration = session.duration_seconds || 0;

  return (
    <div className={`border rounded-lg p-3 ${isActive ? 'border-green-500 bg-green-50/50' : 'border-gray-200'}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${isActive ? 'text-green-600' : 'text-gray-400'}`} />
          <span className="text-sm font-medium">
            {isActive ? 'Active Session' : 'Past Session'}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {formatDate(session.connected_at)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-500">Duration:</span>
          <span className="ml-1 font-medium">{formatDuration(duration)}</span>
        </div>
        <div>
          <span className="text-gray-500">PoP Points:</span>
          <span className="ml-1 font-medium text-purple-600">
            {session.pop_points?.toFixed(2) || '0.00'}
          </span>
        </div>
        {session.ip_address && (
          <div className="col-span-2 flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="w-3 h-3" />
            {session.ip_address}
          </div>
        )}
      </div>
    </div>
  );
};

const DeviceCard = ({ device }: { device: DeviceData }) => {
  const [showAllSessions, setShowAllSessions] = useState(false);
  const sessionsToShow = showAllSessions ? device.recent_sessions : device.recent_sessions?.slice(0, 3);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Device Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-4 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <DeviceIcon category={device.device_category} />
            <div>
              <h3 className="font-semibold text-lg capitalize">
                {device.device_category || 'Unknown'} Device
              </h3>
              <p className="text-sm opacity-90">
                {device.browser} on {device.os}
              </p>
            </div>
          </div>
          {device.active_sessions > 0 && (
            <div className="flex items-center gap-1 bg-green-500 px-2 py-1 rounded-full text-xs font-medium">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Active
            </div>
          )}
        </div>
      </div>

      {/* Device Stats */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {device.total_sessions}
            </div>
            <div className="text-xs text-gray-500">Total Sessions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {device.total_duration_hours.toFixed(1)}h
            </div>
            <div className="text-xs text-gray-500">Total Time</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {device.total_pop_points.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500">PoP Points</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {device.active_sessions}
            </div>
            <div className="text-xs text-gray-500">Active Now</div>
          </div>
        </div>
      </div>

      {/* IP Addresses */}
      {device.ip_addresses && device.ip_addresses.length > 0 && (
        <div className="p-4 bg-blue-50 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Connection Locations</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {device.ip_addresses.map((ip, idx) => (
              <span key={idx} className="text-xs bg-white px-2 py-1 rounded border border-blue-200">
                {ip}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Recent Sessions
          </h4>
          {device.recent_sessions && device.recent_sessions.length > 3 && (
            <button
              onClick={() => setShowAllSessions(!showAllSessions)}
              className="text-sm text-purple-600 hover:text-purple-700"
            >
              {showAllSessions ? 'Show Less' : `Show All (${device.recent_sessions.length})`}
            </button>
          )}
        </div>

        {sessionsToShow && sessionsToShow.length > 0 ? (
          <div className="space-y-2">
            {sessionsToShow.map((session) => (
              <SessionCard key={session.session_id} session={session} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No sessions recorded yet</p>
          </div>
        )}
      </div>

      {/* Device Metadata */}
      <div className="p-4 bg-gray-50 text-xs text-gray-500 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="font-medium">First Seen:</span> {formatDate(device.first_seen)}
          </div>
          <div>
            <span className="font-medium">Last Seen:</span> {formatDate(device.last_seen)}
          </div>
        </div>
      </div>
    </div>
  );
};

export function UserDevicesAndSessions({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDevicesAndSessions();
  }, [userId]);

  const fetchDevicesAndSessions = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .rpc('get_user_devices_and_sessions', { p_user_id: userId });

      if (fetchError) throw fetchError;

      setDevices(data || []);
    } catch (err: any) {
      console.error('Error fetching devices and sessions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error loading devices: {error}</p>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="text-center py-12">
        <Monitor className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Devices Claimed</h3>
        <p className="text-gray-500">
          Claim a device to start tracking your sessions and earning PoP points
        </p>
      </div>
    );
  }

  // Calculate totals
  const totalSessions = devices.reduce((sum, d) => sum + d.total_sessions, 0);
  const totalHours = devices.reduce((sum, d) => sum + d.total_duration_hours, 0);
  const totalPoP = devices.reduce((sum, d) => sum + d.total_pop_points, 0);
  const activeDevices = devices.filter(d => d.active_sessions > 0).length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          Your Activity Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-3xl font-bold">{devices.length}</div>
            <div className="text-sm opacity-90">Devices</div>
          </div>
          <div>
            <div className="text-3xl font-bold">{totalSessions}</div>
            <div className="text-sm opacity-90">Total Sessions</div>
          </div>
          <div>
            <div className="text-3xl font-bold">{totalHours.toFixed(1)}h</div>
            <div className="text-sm opacity-90">Total Time</div>
          </div>
          <div>
            <div className="text-3xl font-bold">{totalPoP.toFixed(2)}</div>
            <div className="text-sm opacity-90">PoP Points</div>
          </div>
        </div>
        {activeDevices > 0 && (
          <div className="mt-4 bg-white/20 rounded-lg p-3 flex items-center gap-2">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
            <span className="font-medium">{activeDevices} device{activeDevices > 1 ? 's' : ''} active now</span>
          </div>
        )}
      </div>

      {/* Device Cards */}
      <div className="space-y-6">
        {devices
          .sort((a, b) => {
            // Sort by: active sessions first, then by last seen
            if (a.active_sessions !== b.active_sessions) {
              return b.active_sessions - a.active_sessions;
            }
            return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
          })
          .map((device) => (
            <DeviceCard key={device.device_id} device={device} />
          ))}
      </div>
    </div>
  );
}
