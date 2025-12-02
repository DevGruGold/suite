// Unified Health Scoring System
// Standardized across system-status, system-health, and prometheus-metrics

export interface HealthMetrics {
  apiKeysUnhealthy: number;
  pythonFailures24h: number;
  blockedTasks: number;
  failingCronJobs: number;
  stalledCronJobs: number;
  agentErrors: number;
  edgeFunctionErrorRate: number;
  devicesOffline: boolean; // true if total > 5 and active = 0
  lowChargingEfficiency: boolean; // true if avg < 70% and sessions > 10
  failedCommands: number;
}

export interface HealthResult {
  score: number;
  status: 'healthy' | 'warning' | 'degraded' | 'critical';
  issues: HealthIssue[];
}

export interface HealthIssue {
  severity: 'critical' | 'high' | 'warning' | 'info';
  message: string;
  deduction: number;
}

/**
 * Calculate unified health score using standardized deduction-based formula.
 * This function ensures all system scanners report consistent health scores.
 * 
 * Deduction weights:
 * - Critical: API keys unhealthy (-15 each)
 * - High: Failing cron jobs (-10 each), Agent errors (-5 each), Failed commands (-2 each, max 10)
 * - Medium: Stalled cron jobs (-5 each, max 25), Python failures > 10 (-10)
 * - Low: Blocked tasks > 3 (-3 each after threshold), Edge function error rate > 15% (-5)
 * - XMRTCharger: Devices offline (-5), Low charging efficiency (-5)
 */
export function calculateUnifiedHealthScore(metrics: HealthMetrics): HealthResult {
  let score = 100;
  const issues: HealthIssue[] = [];

  // CRITICAL: API Keys Unhealthy (-15 each)
  if (metrics.apiKeysUnhealthy > 0) {
    const deduction = metrics.apiKeysUnhealthy * 15;
    score -= deduction;
    issues.push({
      severity: 'critical',
      message: `${metrics.apiKeysUnhealthy} API key(s) unhealthy`,
      deduction
    });
  }

  // HIGH: Failing Cron Jobs (-10 each)
  if (metrics.failingCronJobs > 0) {
    const deduction = metrics.failingCronJobs * 10;
    score -= deduction;
    issues.push({
      severity: 'high',
      message: `${metrics.failingCronJobs} cron job(s) failing (<50% success rate)`,
      deduction
    });
  }

  // HIGH: Agent Errors (-5 each)
  if (metrics.agentErrors > 0) {
    const deduction = metrics.agentErrors * 5;
    score -= deduction;
    issues.push({
      severity: 'high',
      message: `${metrics.agentErrors} agent(s) in error state`,
      deduction
    });
  }

  // HIGH: Failed Commands (-2 each, max 10 deduction)
  if (metrics.failedCommands > 5) {
    const deduction = Math.min((metrics.failedCommands - 5) * 2, 10);
    score -= deduction;
    issues.push({
      severity: 'high',
      message: `${metrics.failedCommands} engagement commands failed`,
      deduction
    });
  }

  // MEDIUM: Stalled Cron Jobs (-5 each, max 25 deduction)
  if (metrics.stalledCronJobs > 2) {
    const deduction = Math.min((metrics.stalledCronJobs - 2) * 5, 25);
    score -= deduction;
    issues.push({
      severity: 'warning',
      message: `${metrics.stalledCronJobs} cron job(s) stalled (active but no runs in 24h)`,
      deduction
    });
  }

  // MEDIUM: Python Failures > 10 in 24h (-10)
  if (metrics.pythonFailures24h > 10) {
    const deduction = 10;
    score -= deduction;
    issues.push({
      severity: 'warning',
      message: `${metrics.pythonFailures24h} Python executions failed in last 24h`,
      deduction
    });
  }

  // LOW: Blocked Tasks > 3 (-3 each after threshold)
  if (metrics.blockedTasks > 3) {
    const deduction = (metrics.blockedTasks - 3) * 3;
    score -= deduction;
    issues.push({
      severity: 'warning',
      message: `${metrics.blockedTasks} blocked task(s) need attention`,
      deduction
    });
  }

  // LOW: High Edge Function Error Rate (-5 if > 15%)
  if (metrics.edgeFunctionErrorRate > 15) {
    const deduction = 5;
    score -= deduction;
    issues.push({
      severity: 'warning',
      message: `Edge function error rate ${metrics.edgeFunctionErrorRate.toFixed(1)}% exceeds 15% threshold`,
      deduction
    });
  }

  // XMRT: Devices Offline (-5)
  if (metrics.devicesOffline) {
    const deduction = 5;
    score -= deduction;
    issues.push({
      severity: 'warning',
      message: 'No active XMRTCharger devices connected',
      deduction
    });
  }

  // XMRT: Low Charging Efficiency (-5)
  if (metrics.lowChargingEfficiency) {
    const deduction = 5;
    score -= deduction;
    issues.push({
      severity: 'warning',
      message: 'Charging efficiency below 70% target',
      deduction
    });
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine status based on score thresholds
  let status: HealthResult['status'];
  if (score >= 90) {
    status = 'healthy';
  } else if (score >= 70) {
    status = 'warning';
  } else if (score >= 50) {
    status = 'degraded';
  } else {
    status = 'critical';
  }

  return { score, status, issues };
}

/**
 * Helper to extract cron job metrics from pg_cron data
 */
export function extractCronMetrics(cronJobs: any[]): { failing: number; stalled: number } {
  if (!cronJobs || !Array.isArray(cronJobs)) {
    return { failing: 0, stalled: 0 };
  }
  
  const failing = cronJobs.filter(j => 
    j.success_rate !== null && j.success_rate < 50
  ).length;
  
  const stalled = cronJobs.filter(j => 
    j.active && (!j.total_runs_24h || j.total_runs_24h === 0)
  ).length;
  
  return { failing, stalled };
}

/**
 * Helper to build HealthMetrics from various data sources
 */
export function buildHealthMetrics(params: {
  apiKeyHealth?: { unhealthy?: number };
  pythonExecStats?: { failed?: number };
  taskStats?: { BLOCKED?: number; blocked?: number };
  cronStats?: { failing?: number; stalled?: number };
  agentStats?: { ERROR?: number; error?: number };
  edgeFunctionStats?: { overall_error_rate?: number };
  deviceStats?: { total?: number; active?: number };
  chargingStats?: { avg_efficiency?: number; total?: number };
  commandStats?: { failed?: number };
}): HealthMetrics {
  const {
    apiKeyHealth = {},
    pythonExecStats = {},
    taskStats = {},
    cronStats = {},
    agentStats = {},
    edgeFunctionStats = {},
    deviceStats = {},
    chargingStats = {},
    commandStats = {}
  } = params;

  return {
    apiKeysUnhealthy: apiKeyHealth.unhealthy || 0,
    pythonFailures24h: pythonExecStats.failed || 0,
    blockedTasks: taskStats.BLOCKED || taskStats.blocked || 0,
    failingCronJobs: cronStats.failing || 0,
    stalledCronJobs: cronStats.stalled || 0,
    agentErrors: agentStats.ERROR || agentStats.error || 0,
    edgeFunctionErrorRate: edgeFunctionStats.overall_error_rate || 0,
    devicesOffline: (deviceStats.total || 0) > 5 && (deviceStats.active || 0) === 0,
    lowChargingEfficiency: (chargingStats.avg_efficiency || 100) < 70 && (chargingStats.total || 0) > 10,
    failedCommands: commandStats.failed || 0
  };
}
