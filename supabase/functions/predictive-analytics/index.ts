import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Fast boot: check content-length BEFORE parsing JSON
  const contentLength = parseInt(req.headers.get('content-length') || '0');
  if (contentLength === 0 || contentLength < 5) {
    console.log('📊 Empty body - cron trigger, returning fast');
    return new Response(JSON.stringify({ 
      success: true, 
      cron: true, 
      message: 'Cron trigger - no analytics action provided' 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, data_source, custom_data } = await req.json();

    console.log(`Predictive analytics: ${action} for ${data_source}`);

    // Fetch data from database based on source
    let sourceData = custom_data || [];
    
    if (!custom_data) {
      if (data_source === 'agents') {
        const { data, error } = await supabase
          .from('agents')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (error) throw error;
        sourceData = data || [];
      } else if (data_source === 'tasks') {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (error) throw error;
        sourceData = data || [];
      } else if (data_source === 'mining') {
        // Fetch from activity log or external API
        const { data, error } = await supabase
          .from('eliza_activity_log')
          .select('*')
          .eq('activity_type', 'mining')
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (error) throw error;
        sourceData = data || [];
      } else if (data_source === 'python_executions') {
        const { data, error } = await supabase
          .from('eliza_python_executions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (error) throw error;
        sourceData = data || [];
      }
    }

    // Read Python code with timeout guard
    let pythonCode: string;
    try {
      pythonCode = await Deno.readTextFile('./predictive_analytics_core.py');
    } catch (fileError) {
      console.error('Failed to read Python file:', fileError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Python analytics script not found',
          action,
          data_source 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute Python analytics with timeout guard (15 seconds)
    const PYTHON_TIMEOUT_MS = 15000;
    let pythonResult: any;
    
    try {
      const pythonPromise = supabase.functions.invoke('python-executor', {
        body: {
          code: pythonCode,
          language: 'python',
          stdin: JSON.stringify({
            data_source,
            data: sourceData,
            action
          }),
          purpose: 'predictive_analytics'
        }
      });
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Python execution timeout')), PYTHON_TIMEOUT_MS)
      );
      
      const { data, error: pythonError } = await Promise.race([pythonPromise, timeoutPromise]);
      
      if (pythonError) {
        console.error('Python execution error:', pythonError);
        throw new Error(`Python execution failed: ${pythonError.message}`);
      }
      
      pythonResult = data;
    } catch (timeoutError) {
      console.error('Python execution timeout or error:', timeoutError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: timeoutError.message,
          action,
          data_source,
          partial: true
        }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = pythonResult?.output ? JSON.parse(pythonResult.output) : {};

    // Store insights in database
    if (action === 'analyze_current' && result.anomalies && result.anomalies.length > 0) {
      for (const anomaly of result.anomalies) {
        await supabase.from('predictive_insights').insert({
          analysis_type: 'anomaly',
          data_source,
          insight_data: anomaly.data,
          confidence_score: anomaly.data?.confidence || 0.7,
          severity: anomaly.severity || 'info',
          metadata: {
            type: anomaly.type,
            description: anomaly.description
          }
        });
      }
    }

    // Store forecasts
    if ((action === 'forecast_24h' || action === 'forecast_72h') && result.forecasts) {
      await supabase.from('predictive_insights').insert({
        analysis_type: 'forecast',
        data_source,
        insight_data: {
          forecasts: result.forecasts,
          trend: result.trend
        },
        confidence_score: result.trend?.confidence || 0.6,
        severity: 'info',
        forecast_horizon: action === 'forecast_24h' ? '24h' : '72h',
        metadata: {
          horizon_hours: result.horizon_hours,
          generated_at: result.generated_at
        }
      });
    }

    // Log activity
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'predictive_analytics',
      title: `Predictive Analytics: ${action}`,
      description: `Analyzed ${data_source} data for ${action}`,
      status: 'completed',
      metadata: {
        action,
        data_source,
        data_points: sourceData.length,
        results_summary: {
          anomalies_found: result.anomalies?.length || 0,
          forecasts_generated: result.forecasts?.length || 0
        }
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        result,
        action,
        data_source
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Predictive analytics error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
