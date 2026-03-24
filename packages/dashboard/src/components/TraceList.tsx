import { useState, useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import * as api from '../api';
import { TraceDetail } from './TraceDetail';

export function TraceList() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const fetcher = useCallback(() => api.getTraces(filters), [filters]);
  const { data, loading } = usePolling(fetcher, 15000);

  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-text-primary font-medium">Recent Traces</h3>
        <div className="flex gap-2">
          <select
            value={filters.status || ''}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value || '' }))}
            className="px-2 py-1 bg-bg-elevated border border-border rounded text-text-secondary text-xs"
          >
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
          <select
            value={filters.provider || ''}
            onChange={e => setFilters(f => ({ ...f, provider: e.target.value || '' }))}
            className="px-2 py-1 bg-bg-elevated border border-border rounded text-text-secondary text-xs"
          >
            <option value="">All Providers</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-text-muted text-sm py-8 text-center">Loading traces...</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-text-secondary font-medium text-xs">Status</th>
                  <th className="text-left py-2 px-2 text-text-secondary font-medium text-xs">Model</th>
                  <th className="text-left py-2 px-2 text-text-secondary font-medium text-xs">Endpoint</th>
                  <th className="text-right py-2 px-2 text-text-secondary font-medium text-xs">Latency</th>
                  <th className="text-right py-2 px-2 text-text-secondary font-medium text-xs">Tokens</th>
                  <th className="text-right py-2 px-2 text-text-secondary font-medium text-xs">Cost</th>
                  <th className="text-right py-2 px-2 text-text-secondary font-medium text-xs">Time</th>
                </tr>
              </thead>
              <tbody>
                {(data?.traces || []).map((trace) => (
                  <tr
                    key={trace.id}
                    onClick={() => setSelectedTraceId(trace.trace_id)}
                    className="border-b border-border/30 hover:bg-bg-hover cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-2">
                      <span className={`w-2 h-2 rounded-full inline-block ${trace.status === 'success' ? 'bg-success' : 'bg-error'}`} />
                    </td>
                    <td className="py-2 px-2 text-text-primary font-mono text-xs">{trace.model}</td>
                    <td className="py-2 px-2 text-text-secondary text-xs">{trace.endpoint}</td>
                    <td className="py-2 px-2 text-right text-text-primary">{Math.round(trace.duration)}ms</td>
                    <td className="py-2 px-2 text-right text-text-secondary">{trace.tokens_total}</td>
                    <td className="py-2 px-2 text-right text-accent">${trace.cost_total.toFixed(4)}</td>
                    <td className="py-2 px-2 text-right text-text-muted text-xs">{new Date(trace.timestamp).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <div className="mt-3 text-text-muted text-xs text-right">
              Showing {data.traces.length} of {data.total} traces
            </div>
          )}
        </>
      )}

      {selectedTraceId && (
        <TraceDetail traceId={selectedTraceId} onClose={() => setSelectedTraceId(null)} />
      )}
    </div>
  );
}
