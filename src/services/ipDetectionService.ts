// Service for detecting user's IP address and geolocation

export interface IPLocation {
  ip: string;
  city: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}

// Detect user's current IP address
export const detectUserIP = async (): Promise<string> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error('Failed to detect IP:', error);
    return '0.0.0.0';
  }
};

// Get location data for an IP address
export const getIPLocation = async (ip: string): Promise<IPLocation | null> => {
  try {
    // Skip for localhost/private IPs
    if (ip === '0.0.0.0' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '127.0.0.1') {
      return null;
    }
    
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country,lat,lon`);
    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        ip,
        city: data.city || 'Unknown',
        region: data.regionName || '',
        country: data.country || 'Unknown',
        lat: data.lat || 0,
        lon: data.lon || 0
      };
    }
    return null;
  } catch (error) {
    console.error('Failed to get IP location:', error);
    return null;
  }
};

// Mask IP address for privacy (show first 2 octets only)
export const maskIP = (ip: string): string => {
  if (!ip || ip === '0.0.0.0') return 'Unknown';
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.x.x`;
};

// Format location for display
export const formatLocation = (location: IPLocation | null): string => {
  if (!location) return 'Unknown Location';
  const parts = [location.city, location.region, location.country].filter(Boolean);
  return parts.join(', ') || 'Unknown Location';
};

// Check if two IPs match (for auto-pairing)
export const doIPsMatch = (ip1: string, ip2: string): boolean => {
  if (!ip1 || !ip2) return false;
  // Exact match
  if (ip1 === ip2) return true;
  // Match first 3 octets (same subnet)
  const parts1 = ip1.split('.');
  const parts2 = ip2.split('.');
  if (parts1.length === 4 && parts2.length === 4) {
    return parts1[0] === parts2[0] && parts1[1] === parts2[1] && parts1[2] === parts2[2];
  }
  return false;
};
