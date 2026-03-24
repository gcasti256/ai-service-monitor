import { db } from './db.js';

interface StatsParams {
  startDate?: string;
  endDate?: string;
  model?: string;
  provider?: string;
}

export function getDashboardStats(params: StatsParams = {}) {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];

  if (params.startDate) {
    conditions.push('timestamp >= ?');
    queryParams.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('timestamp <= ?');
    queryParams.push(params.endDate);
  }
  if (params.model) {
    conditions.push('model = ?');
    queryParams.push(params.model);
  }
  if (params.provider) {
    conditions.push('provider = ?');
    queryParams.push(params.provider);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total_calls,
      COALESCE(AVG(duration), 0) as avg_latency,
      COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0) as error_rate,
      COALESCE(SUM(cost_total), 0) as total_cost,
      COALESCE(SUM(tokens_total), 0) as total_tokens,
      MIN(timestamp) as period_start,
      MAX(timestamp) as period_end
    FROM traces ${where}
  `);

  return stmt.get(...queryParams);
}

export function getLatencyTimeseries(params: StatsParams & { interval?: string } = {}) {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];

  if (params.startDate) {
    conditions.push('timestamp >= ?');
    queryParams.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('timestamp <= ?');
    queryParams.push(params.endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Group by hour by default
  const stmt = db.prepare(`
    SELECT
      strftime('%Y-%m-%dT%H:00:00Z', timestamp) as timestamp,
      AVG(duration) as value,
      COUNT(*) as count
    FROM traces ${where}
    GROUP BY strftime('%Y-%m-%dT%H:00:00Z', timestamp)
    ORDER BY timestamp ASC
  `);

  return stmt.all(...queryParams);
}

export function getModelBreakdown(params: StatsParams = {}) {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];

  if (params.startDate) {
    conditions.push('timestamp >= ?');
    queryParams.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('timestamp <= ?');
    queryParams.push(params.endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const stmt = db.prepare(`
    SELECT
      model,
      provider,
      COUNT(*) as calls,
      AVG(duration) as avg_latency,
      SUM(tokens_total) as total_tokens,
      SUM(cost_total) as total_cost,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as error_rate
    FROM traces ${where}
    GROUP BY model, provider
    ORDER BY calls DESC
  `);

  return stmt.all(...queryParams);
}

export function getCostTimeseries(params: StatsParams = {}) {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];

  if (params.startDate) {
    conditions.push('timestamp >= ?');
    queryParams.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('timestamp <= ?');
    queryParams.push(params.endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const stmt = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', timestamp) as timestamp,
      SUM(cost_total) as value,
      SUM(tokens_total) as tokens,
      COUNT(*) as count
    FROM traces ${where}
    GROUP BY strftime('%Y-%m-%d', timestamp)
    ORDER BY timestamp ASC
  `);

  return stmt.all(...queryParams);
}

export function getErrorLog(params: StatsParams & { limit?: number; offset?: number } = {}) {
  const conditions: string[] = ["status = 'error'"];
  const queryParams: unknown[] = [];

  if (params.startDate) {
    conditions.push('timestamp >= ?');
    queryParams.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('timestamp <= ?');
    queryParams.push(params.endDate);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  const stmt = db.prepare(`
    SELECT id, trace_id, timestamp, model, provider, endpoint, duration,
           error_message, error_type, tokens_input, tokens_output,
           cost_total, request_body, metadata
    FROM traces ${where}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM traces ${where}`);
  const { total } = countStmt.get(...queryParams) as { total: number };

  return {
    errors: stmt.all(...queryParams, limit, offset),
    total,
  };
}

export type { StatsParams };
