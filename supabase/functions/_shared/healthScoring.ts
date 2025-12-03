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
 * Parse cron schedule to determine expected frequency in hours.
 * Handles standard cron expressions and returns expected run frequency.
 */
export function parseScheduleFrequency(schedule: string): number {
  if (!schedule) return 24;
  
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return 24;
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  // Monthly (specific day of month like "1" or "15", not "*" or "*/N")
  if (dayOfMonth !== '*' && !dayOfMonth.includes('/') && !dayOfMonth.includes(',') && !dayOfMonth.includes('-')) {
    return 744; // ~31 days in hours
  }
  
  // Weekly (specific day of week like "0" for Sunday, "3" for Wednesday)
  if (dayOfWeek !== '*' && !dayOfWeek.includes('/') && !dayOfWeek.includes(',') && !dayOfWeek.includes('-')) {
    return 168; // 7 days in hours
  }
  
  // Every N days (e.g., "*/3" in day of month field)
  if (dayOfMonth.includes('/')) {
    const interval = parseInt(dayOfMonth.split('/')[1]) || 1;
    return interval * 24;
  }
  
  // Every N hours (e.g., "*/6" in hour field)
  if (hour.includes('/')) {
    const interval = parseInt(hour.split('/')[1]) || 1;
    return interval;
  }
  
  // Specific hour(s) each day = daily (e.g., "0 14 * * *" runs at 2pm daily)
  if (hour !== '*' && !hour.includes('/')) {
    return 24;
  }
  
  // Every N minutes (runs very frequently)
  if (minute.includes('/')) {
    const interval = parseInt(minute.split('/')[1]) || 1;
    return Math.max(1, interval / 60); // At least 1 hour buffer
  }
  
  // Default to daily for unrecognized patterns
  return 24;
}

/**
 * Detect one-time schedules (specific date and month).
 * These should be excluded from stalled detection.
 */
export function isOneTimeSchedule(schedule: string): boolean {
  if (!schedule) return false;
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return false;
  
  const [, , dayOfMonth, month] = parts;
  
  // If both month and day are specific numbers (not * or ranges), it's one-time
  const isSpecificMonth = month !== '*' && !month.includes('/') && !month.includes('-') && !month.includes(',');
  const isSpecificDay = dayOfMonth !== '*' && !dayOfMonth.includes('/') && !dayOfMonth.includes('-') && !dayOfMonth.includes(',');
  
  return isSpecificMonth && isSpecificDay;
}

/**
 * Helper to extract cron job metrics from pg_cron data.
 * Uses schedule-aware logic to detect stalled jobs correctly for weekly/monthly schedules.
 */
export function extractCronMetrics(cronJobs: any[]): { failing: number; stalled: number } {
  if (!cronJobs || !Array.isArray(cronJobs)) {
    return { failing: 0, stalled: 0 };
  }
  
  // Jobs with poor success rate (<50%)
  const failing = cronJobs.filter(j => 
    j.success_rate !== null && j.success_rate < 50
  ).length;
  
  // Schedule-aware stalled detection
  const stalled = cronJobs.filter(j => {
    // Skip inactive jobs
    if (!j.active) return false;
    
    // Skip one-time jobs
    if (isOneTimeSchedule(j.schedule)) return false;
    
    // Use pre-calculated is_overdue if available from DB function
    if (j.is_overdue !== undefined && j.is_overdue !== null) {
      return j.is_overdue;
    }
    
    // Parse schedule to determine expected frequency
    const expectedFrequencyHours = parseScheduleFrequency(j.schedule);
    
    // Add 50% buffer to expected frequency for grace period
    const windowHours = expectedFrequencyHours * 1.5;
    
    // If no last_run_time, check if job should have run by now
    if (!j.last_run_time) {
      // Active jobs that have never run are stalled (unless they're new)
      return true;
    }
    
    const lastRun = new Date(j.last_run_time);
    const hoursSinceLastRun = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
    
    // Job is stalled if it hasn't run within its expected window + buffer
    return hoursSinceLastRun > windowHours;
  }).length;
  
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
