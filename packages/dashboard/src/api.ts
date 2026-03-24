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
  fetchJson<any>(`/stats?${new URLSearchParams(params || {})}`);

export const getLatencyTimeseries = (params?: Record<string, string>) =>
  fetchJson<any[]>(`/stats/latency?${new URLSearchParams(params || {})}`);

export const getModelBreakdown = (params?: Record<string, string>) =>
  fetchJson<any[]>(`/stats/models?${new URLSearchParams(params || {})}`);

export const getCostTimeseries = (params?: Record<string, string>) =>
  fetchJson<any[]>(`/stats/cost?${new URLSearchParams(params || {})}`);

export const getErrorLog = (params?: Record<string, string>) =>
  fetchJson<any>(`/stats/errors?${new URLSearchParams(params || {})}`);

// Traces
export const getTraces = (params?: Record<string, string>) =>
  fetchJson<{ traces: any[]; total: number }>(`/traces?${new URLSearchParams(params || {})}`);

export const getTraceById = (id: string) =>
  fetchJson<any>(`/traces/${id}`);

export const getTraceGroup = (traceId: string) =>
  fetchJson<any[]>(`/traces/by-trace/${traceId}`);

// Alerts
export const getAlertRules = () => fetchJson<any[]>('/alerts/rules');
export const createAlertRule = (rule: any) =>
  fetchJson<any>('/alerts/rules', { method: 'POST', body: JSON.stringify(rule) });
export const updateAlertRule = (id: string, rule: any) =>
  fetchJson<any>(`/alerts/rules/${id}`, { method: 'PUT', body: JSON.stringify(rule) });
export const deleteAlertRule = (id: string) =>
  fetchJson<any>(`/alerts/rules/${id}`, { method: 'DELETE' });
export const getAlertEvents = (params?: Record<string, string>) =>
  fetchJson<any[]>(`/alerts/events?${new URLSearchParams(params || {})}`);

// Health
export const getHealth = () => fetchJson<{ status: string; timestamp: string }>('/health');
