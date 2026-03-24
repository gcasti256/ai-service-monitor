// Types matching the server/SDK shapes (DB column names use snake_case)

export interface DashboardStats {
  total_calls: number;
  avg_latency: number;
  error_rate: number;
  total_cost: number;
  total_tokens: number;
  period_start: string | null;
  period_end: string | null;
}

export interface TimeseriesPoint {
  timestamp: string;
  value: number;
  count: number;
}

export interface CostTimeseriesPoint {
  timestamp: string;
  value: number;
  tokens: number;
  count: number;
}

export interface ModelBreakdown {
  model: string;
  provider: string;
  calls: number;
  avg_latency: number;
  total_tokens: number;
  total_cost: number;
  error_rate: number;
}

export interface ErrorEntry {
  id: string;
  trace_id: string;
  timestamp: string;
  model: string;
  provider: string;
  endpoint: string;
  duration: number;
  error_message: string;
  error_type: string;
  tokens_input: number;
  tokens_output: number;
  cost_total: number;
  request_body: string | null;
  metadata: string | null;
}

export interface ErrorLogResponse {
  errors: ErrorEntry[];
  total: number;
}

export interface TraceRow {
  id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  timestamp: string;
  duration: number;
  provider: string;
  model: string;
  endpoint: string;
  status: string;
  status_code: number | null;
  error_message: string | null;
  error_type: string | null;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  cost_input: number;
  cost_output: number;
  cost_total: number;
  request_body: string | null;
  response_body: string | null;
  response_length: number | null;
  finish_reason: string | null;
  metadata: string | null;
}

export interface TraceListResponse {
  traces: TraceRow[];
  total: number;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  window_minutes: number;
  webhook_url: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface AlertRuleInput {
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  windowMinutes?: number;
  webhookUrl?: string;
  enabled?: boolean;
}

export interface AlertEvent {
  id: string;
  rule_id: string;
  rule_name: string;
  metric: string;
  current_value: number;
  threshold: number;
  triggered_at: string;
  resolved: number;
  resolved_at: string | null;
}

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Stats
export const getStats = (params?: Record<string, string>) =>
  fetchJson<DashboardStats>(`/stats?${new URLSearchParams(params || {})}`);

export const getLatencyTimeseries = (params?: Record<string, string>) =>
  fetchJson<TimeseriesPoint[]>(`/stats/latency?${new URLSearchParams(params || {})}`);

export const getModelBreakdown = (params?: Record<string, string>) =>
  fetchJson<ModelBreakdown[]>(`/stats/models?${new URLSearchParams(params || {})}`);

export const getCostTimeseries = (params?: Record<string, string>) =>
  fetchJson<CostTimeseriesPoint[]>(`/stats/cost?${new URLSearchParams(params || {})}`);

export const getErrorLog = (params?: Record<string, string>) =>
  fetchJson<ErrorLogResponse>(`/stats/errors?${new URLSearchParams(params || {})}`);

// Traces
export const getTraces = (params?: Record<string, string>) =>
  fetchJson<TraceListResponse>(`/traces?${new URLSearchParams(params || {})}`);

export const getTraceById = (id: string) =>
  fetchJson<TraceRow>(`/traces/${id}`);

export const getTraceGroup = (traceId: string) =>
  fetchJson<TraceRow[]>(`/traces/by-trace/${traceId}`);

// Alerts
export const getAlertRules = () => fetchJson<AlertRule[]>('/alerts/rules');
export const createAlertRule = (rule: AlertRuleInput) =>
  fetchJson<AlertRule>('/alerts/rules', { method: 'POST', body: JSON.stringify(rule) });
export const updateAlertRule = (id: string, rule: Partial<AlertRuleInput>) =>
  fetchJson<AlertRule>(`/alerts/rules/${id}`, { method: 'PUT', body: JSON.stringify(rule) });
export const deleteAlertRule = (id: string) =>
  fetchJson<{ deleted: boolean }>(`/alerts/rules/${id}`, { method: 'DELETE' });
export const getAlertEvents = (params?: Record<string, string>) =>
  fetchJson<AlertEvent[]>(`/alerts/events?${new URLSearchParams(params || {})}`);

// Health
export const getHealth = () => fetchJson<{ status: string; timestamp: string }>('/health');
