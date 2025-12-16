// Enhanced CORS configuration for AI Gateway
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": 
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-auth, supabase-auth-token, x-requested-with, " +
    "accept, origin, referer, user-agent",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Expose-Headers": "x-supabase-auth-token",
  "Vary": "Origin"
};

export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY", 
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};

export const performanceHeaders = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0"
};

export const productionHeaders = {
  ...corsHeaders,
  ...securityHeaders,
  ...performanceHeaders
};
