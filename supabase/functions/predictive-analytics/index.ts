import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startUsageTracking } from '../_shared/edgeFunctionUsageLogger.ts';

const FUNCTION_NAME = 'predictive-analytics';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Embedded Python code for predictive analytics
const PREDICTIVE_ANALYTICS_PYTHON = `
import numpy as np
import json
import sys
from typing import Dict, List, Any
from datetime import datetime, timedelta
from collections import deque
from dataclasses import dataclass

@dataclass
class DataPoint:
    timestamp: datetime
    value: float
    metadata: Dict[str, Any] = None

class TimeSeriesAnalyzer:
    def __init__(self, window_size: int = 100):
        self.window_size = window_size
        self.data_buffer = deque(maxlen=window_size)
        
    def add_datapoint(self, datapoint: DataPoint):
        self.data_buffer.append(datapoint)
    
    def calculate_statistics(self) -> Dict[str, float]:
        if not self.data_buffer:
            return {}
        values = [dp.value for dp in self.data_buffer]
        return {
            'mean': float(np.mean(values)),
            'std': float(np.std(values)),
            'min': float(np.min(values)),
            'max': float(np.max(values)),
            'median': float(np.median(values))
        }
    
    def detect_trend(self) -> Dict[str, Any]:
        if len(self.data_buffer) < 10:
            return {'trend': 'insufficient_data'}
        values = np.array([dp.value for dp in self.data_buffer])
        x = np.arange(len(values))
        coeffs = np.polyfit(x, values, 1)
        slope, intercept = coeffs
        y_pred = slope * x + intercept
        ss_res = np.sum((values - y_pred) ** 2)
        ss_tot = np.sum((values - np.mean(values)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        direction = 'increasing' if slope > 0 else 'decreasing' if slope < 0 else 'stable'
        return {
            'trend': direction,
            'slope': float(slope),
            'r_squared': float(r_squared),
            'confidence': float(r_squared)
        }
    
    def forecast_simple(self, horizon: int = 24) -> List[Dict[str, Any]]:
        if len(self.data_buffer) < 10:
            return []
        stats = self.calculate_statistics()
        trend = self.detect_trend()
        values = np.array([dp.value for dp in self.data_buffer])
        ema = values[-1]
        forecasts = []
        last_timestamp = self.data_buffer[-1].timestamp
        for i in range(1, horizon + 1):
            forecast_value = ema + (trend.get('slope', 0) * i)
            uncertainty = stats.get('std', 0) * np.sqrt(i) * 0.5
            forecasts.append({
                'timestamp': (last_timestamp + timedelta(hours=i)).isoformat(),
                'forecast': float(forecast_value),
                'lower_bound': float(forecast_value - uncertainty),
                'upper_bound': float(forecast_value + uncertainty),
                'confidence': max(0.3, 0.9 - (i * 0.02))
            })
        return forecasts

class AnomalyDetector:
    def __init__(self, sensitivity: float = 3.0):
        self.sensitivity = sensitivity
    
    def detect_zscore(self, current_value: float, historical_data: List[float]) -> Dict[str, Any]:
        if len(historical_data) < 10:
            return {'is_anomaly': False, 'reason': 'insufficient_data'}
        mean = np.mean(historical_data)
        std = np.std(historical_data)
        if std == 0:
            return {'is_anomaly': False, 'reason': 'zero_variance'}
        z_score = (current_value - mean) / std
        is_anomaly = abs(z_score) > self.sensitivity
        severity = 'critical' if abs(z_score) >= 4.0 else 'warning' if abs(z_score) >= 3.0 else 'info'
        return {
            'is_anomaly': is_anomaly,
            'z_score': float(z_score),
            'mean': float(mean),
            'std': float(std),
            'severity': severity
        }

class PatternRecognizer:
    def detect_workload_bottleneck(self, agent_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not agent_data:
            return {'bottleneck_detected': False}
        agent_loads = {}
        for agent in agent_data:
            agent_id = agent.get('id', 'unknown')
            status = agent.get('status', 'IDLE')
            assigned_tasks = agent.get('current_workload', 0)
            agent_loads[agent_id] = {'status': status, 'tasks': assigned_tasks}
        task_counts = [a['tasks'] for a in agent_loads.values()]
        if not task_counts:
            return {'bottleneck_detected': False}
        mean_load = np.mean(task_counts)
        max_load = np.max(task_counts)
        bottlenecks = []
        overloaded = [aid for aid, data in agent_loads.items() if data['tasks'] > mean_load * 2]
        if overloaded:
            bottlenecks.append({
                'type': 'overloaded_agents',
                'severity': 'warning',
                'affected_agents': overloaded,
                'description': f'{len(overloaded)} agents with >2x average load'
            })
        busy_count = sum(1 for data in agent_loads.values() if data['status'] != 'IDLE')
        if len(agent_loads) > 0 and busy_count / len(agent_loads) > 0.8:
            bottlenecks.append({
                'type': 'system_saturation',
                'severity': 'critical',
                'utilization': float(busy_count / len(agent_loads)),
                'description': f'{busy_count}/{len(agent_loads)} agents busy (>80%)'
            })
        return {
            'bottleneck_detected': len(bottlenecks) > 0,
            'bottlenecks': bottlenecks,
            'statistics': {
                'total_agents': len(agent_loads),
                'mean_load': float(mean_load),
                'max_load': float(max_load),
                'busy_agents': busy_count
            }
        }

def perform_anomaly_detection(data_source: str, data: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not data:
        return {'anomalies': [], 'message': 'No data to analyze'}
    detector = AnomalyDetector(sensitivity=3.0)
    anomalies = []
    if data_source == 'agents':
        active_count = sum(1 for d in data if d.get('status') != 'IDLE')
        historical = [len(data)] * 50
        result = detector.detect_zscore(active_count, historical)
        if result.get('is_anomaly'):
            anomalies.append({
                'type': 'agent_activity',
                'severity': result.get('severity', 'info'),
                'description': f'Unusual agent activity: {active_count} active agents',
                'data': result
            })
    elif data_source == 'tasks':
        pending_count = sum(1 for d in data if d.get('status') == 'PENDING')
        historical = [pending_count] * 50
        result = detector.detect_zscore(pending_count, historical)
        if result.get('is_anomaly'):
            anomalies.append({
                'type': 'task_queue',
                'severity': result.get('severity', 'info'),
                'description': f'Unusual task queue size: {pending_count} pending tasks',
                'data': result
            })
    return {
        'anomalies': anomalies,
        'analyzed_at': datetime.now().isoformat(),
        'data_source': data_source,
        'data_points': len(data)
    }

def generate_forecast(data_source: str, data: List[Dict[str, Any]], horizon: int) -> Dict[str, Any]:
    if not data:
        return {'forecasts': [], 'message': 'No data to forecast'}
    analyzer = TimeSeriesAnalyzer()
    for item in data:
        timestamp = item.get('created_at') or item.get('timestamp')
        if timestamp:
            value = 1.0
            try:
                ts = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                analyzer.add_datapoint(DataPoint(timestamp=ts, value=value))
            except:
                pass
    forecasts = analyzer.forecast_simple(horizon=horizon)
    trend = analyzer.detect_trend()
    return {
        'forecasts': forecasts,
        'trend': trend,
        'horizon_hours': horizon,
        'data_source': data_source,
        'generated_at': datetime.now().isoformat()
    }

def detect_patterns(data_source: str, data: List[Dict[str, Any]]) -> Dict[str, Any]:
    recognizer = PatternRecognizer()
    if data_source == 'agents':
        return recognizer.detect_workload_bottleneck(data)
    else:
        return {'patterns': [], 'message': f'Pattern detection not implemented for {data_source}'}

def analyze_data_source(data_source: str, data: List[Dict[str, Any]], action: str) -> Dict[str, Any]:
    try:
        if action == 'analyze_current':
            return perform_anomaly_detection(data_source, data)
        elif action == 'forecast_24h':
            return generate_forecast(data_source, data, horizon=24)
        elif action == 'forecast_72h':
            return generate_forecast(data_source, data, horizon=72)
        elif action == 'detect_patterns':
            return detect_patterns(data_source, data)
        else:
            return {'error': f'Unknown action: {action}'}
    except Exception as e:
        return {'error': str(e)}

# Main execution
if __name__ == '__main__':
    input_data = json.loads(sys.stdin.read())
    data_source = input_data.get('data_source', 'agents')
    data = input_data.get('data', [])
    action = input_data.get('action', 'analyze_current')
    result = analyze_data_source(data_source, data, action)
    print(json.dumps(result))
`;

serve(async (req) => {
  const usageTracker = startUsageTracking(FUNCTION_NAME, undefined, { method: req.method });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Fast boot: check content-length BEFORE parsing JSON
  const contentLength = parseInt(req.headers.get('content-length') || '0');
  if (contentLength === 0 || contentLength < 5) {
    console.log('📊 Empty body - cron trigger, returning fast');
    await usageTracker.success({ cron: true });
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

    // Use embedded Python code instead of reading from file
    const pythonCode = PREDICTIVE_ANALYTICS_PYTHON;

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

    await usageTracker.success({ action, data_source });

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
    await usageTracker.failure(error.message, 500);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
