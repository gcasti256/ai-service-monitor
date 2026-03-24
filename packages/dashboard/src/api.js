const BASE_URL = import.meta.env.VITE_API_URL || '/api';
async function fetchJson(path, options) {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (!res.ok)
        throw new Error(`API error: ${res.status}`);
    return res.json();
}
// Stats
export const getStats = (params) => fetchJson(`/stats?${new URLSearchParams(params || {})}`);
export const getLatencyTimeseries = (params) => fetchJson(`/stats/latency?${new URLSearchParams(params || {})}`);
export const getModelBreakdown = (params) => fetchJson(`/stats/models?${new URLSearchParams(params || {})}`);
export const getCostTimeseries = (params) => fetchJson(`/stats/cost?${new URLSearchParams(params || {})}`);
export const getErrorLog = (params) => fetchJson(`/stats/errors?${new URLSearchParams(params || {})}`);
// Traces
export const getTraces = (params) => fetchJson(`/traces?${new URLSearchParams(params || {})}`);
export const getTraceById = (id) => fetchJson(`/traces/${id}`);
export const getTraceGroup = (traceId) => fetchJson(`/traces/by-trace/${traceId}`);
// Alerts
export const getAlertRules = () => fetchJson('/alerts/rules');
export const createAlertRule = (rule) => fetchJson('/alerts/rules', { method: 'POST', body: JSON.stringify(rule) });
export const updateAlertRule = (id, rule) => fetchJson(`/alerts/rules/${id}`, { method: 'PUT', body: JSON.stringify(rule) });
export const deleteAlertRule = (id) => fetchJson(`/alerts/rules/${id}`, { method: 'DELETE' });
export const getAlertEvents = (params) => fetchJson(`/alerts/events?${new URLSearchParams(params || {})}`);
// Health
export const getHealth = () => fetchJson('/health');
//# sourceMappingURL=api.js.map