import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      function_name, 
      executive_name, 
      time_period_hours = 168, // Default 1 week
      min_usage_count = 1 
    } = await req.json();

    // Calculate time threshold
    const timeThreshold = new Date();
    timeThreshold.setHours(timeThreshold.getHours() - time_period_hours);

    // Python function name aliases - all these refer to Python code execution
    const pythonAliases = ['python-executor', 'eliza-python-runtime', 'execute_python'];
    
    // Base query
    let query = supabase
      .from('eliza_function_usage')
      .select('*')
      .gte('invoked_at', timeThreshold.toISOString())
      .order('invoked_at', { ascending: false });

    // Apply filters with Python alias grouping
    if (function_name) {
      // If querying for any Python executor variant, include all aliases
      if (pythonAliases.includes(function_name)) {
        console.log(`🐍 Python alias detected: ${function_name} - querying all Python variants: ${pythonAliases.join(', ')}`);
        query = query.in('function_name', pythonAliases);
      } else {
        query = query.eq('function_name', function_name);
      }
    }
    if (executive_name) {
      query = query.eq('executive_name', executive_name);
    }

    const { data: rawData, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    // Aggregate analytics
    const functionStats = new Map();
    
    rawData?.forEach(record => {
      const key = `${record.function_name}|${record.executive_name || 'system'}`;
      
      if (!functionStats.has(key)) {
        functionStats.set(key, {
          function_name: record.function_name,
          executive_name: record.executive_name,
          total_calls: 0,
          successful_calls: 0,
          failed_calls: 0,
          avg_execution_ms: 0,
          total_execution_ms: 0,
          common_contexts: new Set(),
          last_used: record.invoked_at,
          error_messages: []
        });
      }

      const stats = functionStats.get(key);
      stats.total_calls++;
      
      if (record.success) {
        stats.successful_calls++;
      } else {
        stats.failed_calls++;
        if (record.error_message) {
          stats.error_messages.push(record.error_message);
        }
      }
      
      if (record.execution_time_ms) {
        stats.total_execution_ms += record.execution_time_ms;
      }
      
      if (record.user_context) {
        stats.common_contexts.add(record.user_context);
      }
      
      if (new Date(record.invoked_at) > new Date(stats.last_used)) {
        stats.last_used = record.invoked_at;
      }
    });

    // Format results
    const analytics = Array.from(functionStats.values())
      .filter(stat => stat.total_calls >= min_usage_count)
      .map(stat => ({
        function_name: stat.function_name,
        executive_name: stat.executive_name,
        total_calls: stat.total_calls,
        successful_calls: stat.successful_calls,
        failed_calls: stat.failed_calls,
        success_rate: Math.round((stat.successful_calls / stat.total_calls) * 100),
        avg_execution_ms: Math.round(stat.total_execution_ms / stat.total_calls),
        common_contexts: Array.from(stat.common_contexts).slice(0, 5),
        last_used: stat.last_used,
        recent_errors: stat.error_messages.slice(-3)
      }))
      .sort((a, b) => b.total_calls - a.total_calls);

    // Get view-based recommendations
    const { data: recommendations } = await supabase
      .from('function_recommendations')
      .select('*')
      .limit(10);

    return new Response(
      JSON.stringify({
        time_period_hours,
        total_functions_analyzed: analytics.length,
        analytics,
        recommendations: recommendations || [],
        summary: {
          total_calls: analytics.reduce((sum, a) => sum + a.total_calls, 0),
          avg_success_rate: Math.round(
            analytics.reduce((sum, a) => sum + a.success_rate, 0) / analytics.length
          )
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Analytics error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
