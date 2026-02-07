import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Embedded Python code for enhanced learning
const ENHANCED_LEARNING_PYTHON_CODE = `
#!/usr/bin/env python3
"""
Enhanced Autonomous Learning System for XMRT-Ecosystem
Advanced ML algorithms, neural networks, and predictive modeling
"""

import numpy as np
import json
import time
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from collections import deque, defaultdict
from abc import ABC, abstractmethod

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class LearningExperience:
    """Individual learning experience record"""
    timestamp: str
    context: Dict[str, Any]
    action_taken: str
    outcome: Dict[str, Any]
    reward: float
    confidence: float = 0.5
    metadata: Dict[str, Any] = field(default_factory=dict)

class OptimizationAlgorithm(ABC):
    """Abstract base class for optimization algorithms"""

    @abstractmethod
    def update(self, current_state: Dict[str, Any], feedback: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def get_next_parameters(self) -> Dict[str, Any]:
        pass

class AdaptiveGradientDescent(OptimizationAlgorithm):
    """Advanced gradient descent with adaptive learning rates"""

    def __init__(self, learning_rate: float = 0.01, momentum: float = 0.9, 
                 adaptive_factor: float = 1.1, decay_factor: float = 0.95):
        self.learning_rate = learning_rate
        self.base_learning_rate = learning_rate
        self.momentum = momentum
        self.adaptive_factor = adaptive_factor
        self.decay_factor = decay_factor
        self.velocity = {}
        self.performance_history = deque(maxlen=50)

    def update(self, current_state: Dict[str, Any], feedback: Dict[str, Any]) -> Dict[str, Any]:
        performance = feedback.get('performance', 0.0)
        gradients = feedback.get('gradients', {})

        self.performance_history.append(performance)
        if len(self.performance_history) >= 2:
            if self.performance_history[-1] > self.performance_history[-2]:
                self.learning_rate = min(self.learning_rate * self.adaptive_factor, 
                                       self.base_learning_rate * 2.0)
            else:
                self.learning_rate *= self.decay_factor

        for param_name, gradient in gradients.items():
            if param_name not in self.velocity:
                self.velocity[param_name] = 0
            self.velocity[param_name] = (self.momentum * self.velocity[param_name] + 
                                       self.learning_rate * gradient)

        return {
            'learning_rate': self.learning_rate,
            'velocity': dict(self.velocity),
            'momentum': self.momentum
        }

    def get_next_parameters(self) -> Dict[str, Any]:
        return {
            'learning_rate': self.learning_rate,
            'update_rule': 'momentum_gradient_descent',
            'velocity': dict(self.velocity)
        }

class EnhancedAutonomousLearningCore:
    """Enhanced autonomous learning system with advanced algorithms"""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.gradient_optimizer = AdaptiveGradientDescent(
            learning_rate=self.config.get('learning_rate', 0.01)
        )
        self.learning_experiences = deque(maxlen=10000)
        self.performance_metrics = defaultdict(list)
        self.current_optimizer = 'gradient'
        self.learning_iteration = 0
        self.last_performance = 0.0
        logger.info("Enhanced Autonomous Learning Core initialized")

    def learn_from_experience(self, experience_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process and learn from a new experience"""
        try:
            experience = LearningExperience(
                timestamp=experience_data.get('timestamp', datetime.now().isoformat()),
                context=experience_data.get('context', {}),
                action_taken=experience_data.get('action_taken', ''),
                outcome=experience_data.get('outcome', {}),
                reward=experience_data.get('reward', 0.0),
                confidence=experience_data.get('confidence', 0.5)
            )
            
            self.learning_experiences.append(experience)
            self._update_performance_metrics(experience)
            learning_result = self._apply_learning_updates(experience)

            result = {
                'learning_iteration': self.learning_iteration,
                'performance_improvement': learning_result.get('performance_improvement', 0.0),
                'current_optimizer': self.current_optimizer,
                'confidence': experience.confidence,
                'timestamp': experience.timestamp
            }

            self.learning_iteration += 1
            return result

        except Exception as e:
            logger.error(f"Learning from experience failed: {e}")
            return {'error': str(e), 'success': False}

    def _update_performance_metrics(self, experience: LearningExperience):
        performance = experience.outcome.get('performance', 0.0)
        self.performance_metrics['overall'].append({
            'value': performance,
            'timestamp': experience.timestamp
        })

    def _apply_learning_updates(self, experience: LearningExperience) -> Dict[str, Any]:
        current_state = {
            'parameters': experience.context.get('parameters', {}),
            'performance': experience.outcome.get('performance', 0.0)
        }

        feedback = {
            'performance': experience.outcome.get('performance', 0.0),
            'reward': experience.reward,
            'gradients': experience.outcome.get('gradients', {}),
            'confidence': experience.confidence
        }

        update_result = self.gradient_optimizer.update(current_state, feedback)
        current_performance = feedback['performance']
        performance_improvement = current_performance - self.last_performance
        self.last_performance = current_performance
        update_result['performance_improvement'] = performance_improvement
        return update_result

    def get_learning_analytics(self) -> Dict[str, Any]:
        recent_experiences = list(self.learning_experiences)[-100:]
        performance_values = [exp.outcome.get('performance', 0.0) for exp in recent_experiences]
        confidence_values = [exp.confidence for exp in recent_experiences]

        return {
            'total_experiences': len(self.learning_experiences),
            'learning_iteration': self.learning_iteration,
            'current_optimizer': self.current_optimizer,
            'performance_trend': {
                'mean': float(np.mean(performance_values)) if performance_values else 0.0,
                'std': float(np.std(performance_values)) if performance_values else 0.0
            }
        }

_learning_core = None

def get_learning_core(config: Optional[Dict[str, Any]] = None):
    global _learning_core
    if _learning_core is None:
        _learning_core = EnhancedAutonomousLearningCore(config)
    return _learning_core

def process_learning_request(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """Main entry point for learning requests"""
    action = request_data.get('action', 'learn')
    config = request_data.get('config', {})
    
    core = get_learning_core(config)
    
    if action == 'learn':
        experience_data = request_data.get('experience', {})
        result = core.learn_from_experience(experience_data)
        print(json.dumps(result))
        return result
    elif action == 'analytics':
        result = core.get_learning_analytics()
        print(json.dumps(result))
        return result
    else:
        return {'error': 'Unknown action', 'success': False}

# Execute the request
if __name__ == "__main__":
    import sys
    request_data = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    process_learning_request(request_data)
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestData = await req.json();
    const { action, experience, config } = requestData;

    console.log(`Enhanced learning request: ${action}`);

    // Execute Python learning core via python-executor
    const { data: pythonResult, error: pythonError } = await supabase.functions.invoke('python-executor', {
      body: {
        code: ENHANCED_LEARNING_PYTHON_CODE,
        purpose: 'Enhanced autonomous learning processing',
        args: JSON.stringify({
          action,
          experience,
          config
        })
      }
    });

    if (pythonError) {
      console.error('Python execution error:', pythonError);
      return new Response(
        JSON.stringify({ error: 'Python execution failed', details: pythonError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store learning result in database
    if (action === 'learn' && pythonResult?.learning_iteration) {
      await supabase.from('learning_patterns').insert({
        pattern_type: 'enhanced_ml',
        pattern_data: pythonResult,
        confidence_score: experience?.confidence || 0.5,
        usage_count: 1
      });
    }

    // Log activity
    await supabase.from('eliza_activity_log').insert({
      activity_type: 'enhanced_learning',
      description: `Enhanced learning: ${action}`,
      status: 'completed',
      metadata: {
        action,
        learning_iteration: pythonResult?.learning_iteration,
        optimizer: pythonResult?.current_optimizer
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        result: pythonResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Enhanced learning error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
