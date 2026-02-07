import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXECUTIVE_NAME = "Eliza";
const X_API_BASE_URL_V2 = "https://api.twitter.com/2";

// Function usage logger (consistent with other edge functions)
async function logFunctionUsage(
  supabase: any,
  functionName: string,
  metadata: any
): Promise<void> {
  try {
    const logEntry = {
      function_name: functionName,
      status: metadata.status || 'success',
      tools_used: metadata.toolsUsed || [],
      execution_time_ms: metadata.executionTimeMs || 0,
      error: metadata.error || null,
      timestamp: new Date().toISOString(),
      metadata: metadata
    };

    const { error } = await supabase
      .from('function_logs') // Assuming a 'function_logs' table exists
      .insert([logEntry]);

    if (error) {
      console.error("Logging error:", error);
    }
  } catch (error) {
    console.error("Logging failed:", error);
  }
}

serve(async (req) => {
  const startTime = Date.now();
  let actionPerformed = "unknown";
  let requestData: any = {}; // Initialize here to be accessible in catch block

  // 1. Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. Initialize Supabase Client
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || "";
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || "";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // 3. Health Check
    if (req.method === 'GET') {
      const hasXConfig = Deno.env.get('X_BEARER_TOKEN');
      return new Response(JSON.stringify({
        status: hasXConfig ? "operational" : "missing_x_api_config",
        executive: EXECUTIVE_NAME,
        authentication: "bearer_token",
        configured: hasXConfig,
        timestamp: new Date().toISOString()
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Ensure it's a POST request for actions
    if (req.method !== 'POST') {
      throw new Error("Only POST requests are allowed for actions.");
    }

    // 4. Parse Request Body
    try {
      const text = await req.text();
      if (!text) throw new Error("Empty request body");
      requestData = JSON.parse(text);
    } catch (e) {
      console.error(`❌ [${EXECUTIVE_NAME}] Parse Error:`, (e as Error).message);
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    actionPerformed = requestData.action || "unknown_action";

    // 5. Get X API Bearer Token
    const bearerToken = Deno.env.get('X_BEARER_TOKEN');
    if (!bearerToken) {
      throw new Error('Missing X_BEARER_TOKEN environment variable. Please set it in Supabase secrets.');
    }

    let resultData: any = {};
    const headers = {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json'
    } as Record<string, string>;

    switch (requestData.action) {
      case "search_tweets": {
        const { query, max_results = 10, start_time, end_time } = requestData;
        if (!query) throw new Error("Search query is required for 'search_tweets'.");

        const params = new URLSearchParams({
          query: query,
          "tweet.fields": "created_at,author_id,public_metrics,lang",
          "expansions": "author_id",
          "user.fields": "username,profile_image_url",
          max_results: Math.min(max_results, 100).toString(), // Max 100 for recent search
        });
        if (start_time) params.append("start_time", start_time);
        if (end_time) params.append("end_time", end_time);

        const response = await fetch(`${X_API_BASE_URL_V2}/tweets/search/recent?${params.toString()}`, { headers });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`X API Search Tweets Error (${response.status}): ${errorText}`);
        }
        resultData = await response.json();

        // 6a. Persist search results to x_monitored_tweets
        if (resultData.data && resultData.data.length > 0) {
          const usersMap = new Map<string, string>();
          if (resultData.includes && resultData.includes.users) {
            resultData.includes.users.forEach((user: any) => {
              usersMap.set(user.id, user.username);
            });
          }

          const tweetsToInsert = resultData.data.map((tweet: any) => ({
            id: tweet.id,
            tweet_text: tweet.text,
            author_id: tweet.author_id,
            author_username: usersMap.get(tweet.author_id) || null,
            created_at: tweet.created_at,
            public_metrics: tweet.public_metrics,
            lang: tweet.lang,
            query_matched: query, // Context of the search
            monitored_at: new Date().toISOString()
          }));

          try {
            const { error: insertError } = await supabase
              .from('x_monitored_tweets')
              .upsert(tweetsToInsert, { onConflict: 'id', ignoreDuplicates: false });
            if (insertError) {
              console.error("Supabase upsert x_monitored_tweets error:", insertError);
            }
          } catch (dbError) {
            console.error("Supabase x_monitored_tweets upsert failed:", (dbError as Error).message);
          }
        }
        break;
      }

      case "get_user_timeline": {
        const { username, max_results = 10 } = requestData;
        if (!username) throw new Error("Username is required for 'get_user_timeline'.");

        // First, get user ID by username
        const userResponse = await fetch(`${X_API_BASE_URL_V2}/users/by/username/${username}`, { headers });
        if (!userResponse.ok) {
          const errorText = await userResponse.text();
          throw new Error(`X API Get User ID Error (${userResponse.status}): ${errorText}`);
        }
        const userData = await userResponse.json();
        const userId = userData.data?.id;
        if (!userId) throw new Error(`User ID not found for username: ${username}`);

        // Then, get user timeline
        const params = new URLSearchParams({
          "tweet.fields": "created_at,public_metrics,lang",
          max_results: Math.min(max_results, 100).toString(), // Max 100 for user timeline
        });

        const timelineResponse = await fetch(`${X_API_BASE_URL_V2}/users/${userId}/tweets?${params.toString()}`, { headers });
        if (!timelineResponse.ok) {
          const errorText = await timelineResponse.text();
          throw new Error(`X API Get User Timeline Error (${timelineResponse.status}): ${errorText}`);
        }
        resultData = await timelineResponse.json();

        // 6b. Persist user timeline results to x_monitored_tweets
        if (resultData.data && resultData.data.length > 0) {
          const tweetsToInsert = resultData.data.map((tweet: any) => ({
            id: tweet.id,
            tweet_text: tweet.text,
            author_id: userId,
            author_username: username, // Use username from request as we already have it
            created_at: tweet.created_at,
            public_metrics: tweet.public_metrics,
            lang: tweet.lang,
            query_matched: `user_timeline:${username}`, // Context of the timeline fetch
            monitored_at: new Date().toISOString()
          }));

          try {
            const { error: insertError } = await supabase
              .from('x_monitored_tweets')
              .upsert(tweetsToInsert, { onConflict: 'id', ignoreDuplicates: false });
            if (insertError) {
              console.error("Supabase upsert x_monitored_tweets (timeline) error:", insertError);
            }
          } catch (dbError) {
            console.error("Supabase x_monitored_tweets (timeline) upsert failed:", (dbError as Error).message);
          }
        }
        break;
      }

      case "get_trends": {
        // X API v2 (which uses the provided Bearer Token) does not have a direct public trends endpoint.
        // Trends are primarily available via X API v1.1.
        // To implement 'get_trends' correctly, you would need:
        // 1. To use X API v1.1 endpoint (e.g., api.twitter.com/1.1/trends/place.json).
        // 2. Different authentication, typically OAuth 1.0a (Consumer Key/Secret + Access Token/Secret)
        //    or a specific application-only bearer token for v1.1.
        // The current v2 Bearer Token is not sufficient for v1.1 trends.
        // For now, we will persist a simulated response to demonstrate the persistence mechanism.
        // In a real scenario, this would be replaced with actual X API v1.1 calls and auth.
        const { woeid = 1 } = requestData; // Default to Worldwide (WOEID 1)
        
        resultData = {
          data: [
            { name: "#SimulatedAITrends", url: "https://twitter.com/hashtag/SimulatedAITrends", tweet_volume: 15000 },
            { name: "#SimulatedBlockchainNews", url: "https://twitter.com/hashtag/SimulatedBlockchainNews", tweet_volume: 8000 },
            { name: "#XMRTDao", url: "https://twitter.com/hashtag/XMRTDao", tweet_volume: 500 }
          ],
          meta: { result_count: 3, note: "Simulated trends data due to X API v2 limitations." }
        };

        // 6c. Persist simulated trends to x_trending_topics
        if (resultData.data && resultData.data.length > 0) {
          const trendsToInsert = resultData.data.map((trend: any) => ({
            trend_name: trend.name,
            trend_url: trend.url,
            tweet_volume: trend.tweet_volume,
            woeid: woeid,
            monitored_at: new Date().toISOString()
          }));

          try {
            const { error: insertError } = await supabase
              .from('x_trending_topics')
              .insert(trendsToInsert); // No unique constraint needed for trends, just append
            if (insertError) {
              console.error("Supabase insert x_trending_topics error:", insertError);
            }
          } catch (dbError) {
            console.error("Supabase x_trending_topics insert failed:", (dbError as Error).message);
          }
        }
        break;
      }

      default:
        throw new Error(`Invalid action: ${requestData.action}. Supported actions are 'search_tweets', 'get_user_timeline', 'get_trends'.`);
    }

    // Log success
    await logFunctionUsage(supabase, 'x-twitter-monitor', {
      status: 'success',
      toolsUsed: [actionPerformed],
      executionTimeMs: Date.now() - startTime,
      requestPayload: requestData,
      responseSummary: { result_count: resultData.meta?.result_count || resultData.data?.length || 0 }
    });

    return new Response(JSON.stringify({ success: true, action: actionPerformed, data: resultData.data, meta: resultData.meta }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`❌ [${EXECUTIVE_NAME}] x-twitter-monitor Error:`, (error as Error).message);

    // Log error
    await logFunctionUsage(supabase, 'x-twitter-monitor', {
      status: 'error',
      error: (error as Error).message,
      executionTimeMs: Date.now() - startTime,
      action: actionPerformed,
      requestPayload: requestData
    });

    return new Response(JSON.stringify({
      success: false,
      error: 'Internal Server Error',
      details: (error as Error).message,
      executive: EXECUTIVE_NAME,
      action: actionPerformed
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});