import { db } from './db.js';

const DEFAULT_RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '30', 10);

export function cleanupOldTraces(retentionDays: number = DEFAULT_RETENTION_DAYS): number {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM traces WHERE timestamp < ?').run(cutoff);
  return result.changes;
}

export function cleanupOldAlertEvents(retentionDays: number = DEFAULT_RETENTION_DAYS): number {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM alert_events WHERE triggered_at < ?').run(cutoff);
  return result.changes;
}

export function getDbStats() {
  const traceCount = (db.prepare('SELECT COUNT(*) as count FROM traces').get() as { count: number })
    .count;
  const alertRuleCount = (
    db.prepare('SELECT COUNT(*) as count FROM alert_rules').get() as { count: number }
  ).count;
  const alertEventCount = (
    db.prepare('SELECT COUNT(*) as count FROM alert_events').get() as { count: number }
  ).count;
  const oldestTrace = db.prepare('SELECT MIN(timestamp) as oldest FROM traces').get() as {
    oldest: string | null;
  };
  const newestTrace = db.prepare('SELECT MAX(timestamp) as newest FROM traces').get() as {
    newest: string | null;
  };

  return {
    traces: traceCount,
    alertRules: alertRuleCount,
    alertEvents: alertEventCount,
    oldestTrace: oldestTrace?.oldest || null,
    newestTrace: newestTrace?.newest || null,
  };
}
