import { useState, useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import * as api from '../api';
import type { AlertRule, AlertEvent } from '../api';

export function AlertPanel() {
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    metric: 'latency',
    operator: 'gt',
    threshold: 0,
    windowMinutes: 5,
    webhookUrl: '',
  });

  const rulesFetcher = useCallback(async () => {
    const [r, e] = await Promise.all([api.getAlertRules(), api.getAlertEvents()]);
    return { rules: r, events: e };
  }, []);

  const { data, refresh } = usePolling(rulesFetcher, 15000);
  const rules: AlertRule[] = data?.rules ?? [];
  const events: AlertEvent[] = data?.events ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createAlertRule({
        ...formData,
        threshold: Number(formData.threshold),
        windowMinutes: Number(formData.windowMinutes),
        webhookUrl: formData.webhookUrl || undefined,
      });
      setShowForm(false);
      setFormData({ name: '', metric: 'latency', operator: 'gt', threshold: 0, windowMinutes: 5, webhookUrl: '' });
      void refresh();
    } catch {
      setError('Failed to create alert rule. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await api.deleteAlertRule(id);
      void refresh();
    } catch {
      setError('Failed to delete rule.');
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    setError(null);
    try {
      await api.updateAlertRule(id, { enabled: !enabled });
      void refresh();
    } catch {
      setError('Failed to update rule.');
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-error hover:text-error/80 ml-2">&times;</button>
        </div>
      )}

      <div className="bg-bg-surface border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-text-primary font-medium">Alert Rules</h3>
          <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors">
            {showForm ? 'Cancel' : 'New Rule'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-4 p-4 bg-bg-elevated rounded-lg space-y-3">
            <input type="text" placeholder="Rule name" value={formData.name} onChange={e => setFormData(d => ({ ...d, name: e.target.value }))} required className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select value={formData.metric} onChange={e => setFormData(d => ({ ...d, metric: e.target.value }))} className="px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm">
                <option value="latency">Latency (ms)</option>
                <option value="error_rate">Error Rate (%)</option>
                <option value="cost">Cost ($)</option>
                <option value="token_usage">Token Usage</option>
              </select>
              <select value={formData.operator} onChange={e => setFormData(d => ({ ...d, operator: e.target.value }))} className="px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm">
                <option value="gt">Greater than</option>
                <option value="gte">Greater or equal</option>
                <option value="lt">Less than</option>
                <option value="lte">Less or equal</option>
              </select>
              <input type="number" step="any" placeholder="Threshold" value={formData.threshold} onChange={e => setFormData(d => ({ ...d, threshold: parseFloat(e.target.value) }))} className="px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="number" placeholder="Window (minutes)" value={formData.windowMinutes} onChange={e => setFormData(d => ({ ...d, windowMinutes: parseInt(e.target.value) }))} className="px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm" />
              <input type="url" placeholder="Webhook URL (optional)" value={formData.webhookUrl} onChange={e => setFormData(d => ({ ...d, webhookUrl: e.target.value }))} className="px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm" />
            </div>
            <button type="submit" className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors">Create Rule</button>
          </form>
        )}

        <div className="space-y-2">
          {rules.length === 0 ? (
            <div className="text-text-muted text-sm py-4 text-center">No alert rules configured</div>
          ) : rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg">
              <div>
                <span className="text-text-primary text-sm">{rule.name}</span>
                <span className="text-text-muted text-xs ml-2">
                  {rule.metric} {rule.operator} {rule.threshold} (last {rule.window_minutes}m)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleToggle(rule.id, !!rule.enabled)} className={`px-2 py-1 rounded text-xs ${rule.enabled ? 'bg-success/20 text-success' : 'bg-bg-elevated text-text-muted'}`}>
                  {rule.enabled ? 'Active' : 'Disabled'}
                </button>
                <button onClick={() => handleDelete(rule.id)} className="px-2 py-1 rounded text-xs bg-error/20 text-error hover:bg-error/30 transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-5">
        <h3 className="text-text-primary font-medium mb-4">Alert History</h3>
        <div className="space-y-2">
          {events.length === 0 ? (
            <div className="text-text-muted text-sm py-4 text-center">No alerts triggered</div>
          ) : events.map((event) => (
            <div key={event.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-warning" />
                <span className="text-text-primary text-sm">{event.rule_name}</span>
                <span className="text-text-muted text-xs">
                  {event.metric}: {typeof event.current_value === 'number' ? event.current_value.toFixed(2) : event.current_value} (threshold: {event.threshold})
                </span>
              </div>
              <span className="text-text-muted text-xs">{new Date(event.triggered_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
