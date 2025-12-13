import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'render-api';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function handleGetServiceStatus(renderApiKey: string, renderApiBase: string, headers: any) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
    const servicesResponse = await fetch(`${renderApiBase}/services`, {
      headers: {
        "Authorization": `Bearer ${renderApiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!servicesResponse.ok) {
      throw new Error(`Render API error: ${servicesResponse.status}`);
    }
    
    const services = await servicesResponse.json();
    const xmrtService = services.find((s: any) => 
      s.service?.name?.toLowerCase().includes('xmrt') ||
      s.service?.repo?.includes('XMRT-Ecosystem')
    );
    
    return new Response(
      JSON.stringify({
        success: true,
        service: xmrtService?.service || null
      }),
      { headers: { ...headers, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('Render API getServiceStatus error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error fetching service status'
      }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
}

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, limit } = await req.json();
    
    const RENDER_API_KEY = Deno.env.get("RENDER_API_KEY");
    if (!RENDER_API_KEY) {
      console.error("RENDER_API_KEY is not configured");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Render API key not configured" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RENDER_API_BASE = "https://api.render.com/v1";
    const FLASK_SERVICE_URL = "https://xmrt-ecosystem-iofw.onrender.com";
    
    console.log(`🔧 Render API - Action: ${action}`);

    // Handle different actions
    if (action === "get_deployment_info") {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        // Try Flask service first
        try {
          const versionResponse = await fetch(`${FLASK_SERVICE_URL}/version`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (versionResponse.ok) {
            const versionData = await versionResponse.json();
            
            return new Response(
              JSON.stringify({
                success: true,
                systemVersion: {
                  version: versionData.version || "unknown",
                  deploymentId: versionData.deployment_id || "unknown",
                  commitHash: versionData.commit_hash || "unknown",
                  commitMessage: versionData.commit_message || "No commit message",
                  deployedAt: versionData.deployed_at || new Date().toISOString(),
                  status: "active",
                  serviceUrl: FLASK_SERVICE_URL
                }
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch (flaskError) {
          clearTimeout(timeoutId);
          console.log("Flask version endpoint unavailable, falling back to Render API");
        }
        
        // Fallback to Render API with timeout
        const renderController = new AbortController();
        const renderTimeoutId = setTimeout(() => renderController.abort(), 10000);
        
        const servicesResponse = await fetch(`${RENDER_API_BASE}/services`, {
          headers: {
            "Authorization": `Bearer ${RENDER_API_KEY}`,
            "Content-Type": "application/json"
          },
          signal: renderController.signal
        });
        
        clearTimeout(renderTimeoutId);
        
        if (!servicesResponse.ok) {
          throw new Error(`Render API error: ${servicesResponse.status}`);
        }
        
        const services = await servicesResponse.json();
        const xmrtService = services.find((s: any) => 
          s.service?.name?.toLowerCase().includes('xmrt') ||
          s.service?.repo?.includes('XMRT-Ecosystem')
        );
        
        if (!xmrtService) {
          return new Response(
            JSON.stringify({
              success: true,
              systemVersion: {
                version: "unknown",
                deploymentId: "not-found",
                commitHash: "unknown",
                commitMessage: "Service not found in Render",
                deployedAt: new Date().toISOString(),
                status: "unknown",
                serviceUrl: FLASK_SERVICE_URL
              }
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const serviceId = xmrtService.service.id;
        
        const deployController = new AbortController();
        const deployTimeoutId = setTimeout(() => deployController.abort(), 10000);
        
        const deploysResponse = await fetch(`${RENDER_API_BASE}/services/${serviceId}/deploys?limit=1`, {
          headers: {
            "Authorization": `Bearer ${RENDER_API_KEY}`,
            "Content-Type": "application/json"
          },
          signal: deployController.signal
        });
        
        clearTimeout(deployTimeoutId);
        
        if (!deploysResponse.ok) {
          throw new Error(`Render API deploys error: ${deploysResponse.status}`);
        }
        
        const deploys = await deploysResponse.json();
        const latestDeploy = deploys[0]?.deploy;
        
        return new Response(
          JSON.stringify({
            success: true,
            systemVersion: {
              version: latestDeploy?.commit?.id?.substring(0, 7) || "unknown",
              deploymentId: latestDeploy?.id || "unknown",
              commitHash: latestDeploy?.commit?.id || "unknown",
              commitMessage: latestDeploy?.commit?.message || "No commit message",
              deployedAt: latestDeploy?.finishedAt || latestDeploy?.createdAt || new Date().toISOString(),
              status: latestDeploy?.status || "unknown",
              serviceUrl: FLASK_SERVICE_URL
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error('get_deployment_info error:', error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch deployment info'
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    if (action === "get_service_status") {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const servicesResponse = await fetch(`${RENDER_API_BASE}/services`, {
          headers: {
            "Authorization": `Bearer ${RENDER_API_KEY}`,
            "Content-Type": "application/json"
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!servicesResponse.ok) {
          throw new Error(`Render API error: ${servicesResponse.status}`);
        }
        
        const services = await servicesResponse.json();
        const xmrtService = services.find((s: any) => 
          s.service?.name?.toLowerCase().includes('xmrt') ||
          s.service?.repo?.includes('XMRT-Ecosystem')
        );
        
        return new Response(
          JSON.stringify({
            success: true,
            service: xmrtService?.service || null
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error('get_service_status error:', error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch service status'
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    if (action === "get_deployments") {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const servicesResponse = await fetch(`${RENDER_API_BASE}/services`, {
          headers: {
            "Authorization": `Bearer ${RENDER_API_KEY}`,
            "Content-Type": "application/json"
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!servicesResponse.ok) {
          throw new Error(`Render API error: ${servicesResponse.status}`);
        }
        
        const services = await servicesResponse.json();
        const xmrtService = services.find((s: any) => 
          s.service?.name?.toLowerCase().includes('xmrt') ||
          s.service?.repo?.includes('XMRT-Ecosystem')
        );
        
        if (!xmrtService) {
          return new Response(
            JSON.stringify({ success: true, deployments: [] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const serviceId = xmrtService.service.id;
        
        const deployController = new AbortController();
        const deployTimeoutId = setTimeout(() => deployController.abort(), 10000);
        
        const deploysResponse = await fetch(`${RENDER_API_BASE}/services/${serviceId}/deploys?limit=${limit || 5}`, {
          headers: {
            "Authorization": `Bearer ${RENDER_API_KEY}`,
            "Content-Type": "application/json"
          },
          signal: deployController.signal
        });
        
        clearTimeout(deployTimeoutId);
        
        if (!deploysResponse.ok) {
          throw new Error(`Render API deploys error: ${deploysResponse.status}`);
        }
        
        const deploys = await deploysResponse.json();
        
        return new Response(
          JSON.stringify({
            success: true,
            deployments: deploys.map((d: any) => d.deploy)
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error('get_deployments error:', error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch deployments'
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    // Handle getServiceStatus action (camelCase variant)
    if (action === "getServiceStatus") {
      return await handleGetServiceStatus(RENDER_API_KEY, RENDER_API_BASE, corsHeaders);
    }
    
    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    console.error("Render API error:", error);
    await usageTracker.failure(error instanceof Error ? error.message : "Unknown error", 500);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
