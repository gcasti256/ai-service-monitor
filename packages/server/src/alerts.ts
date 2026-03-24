import { db } from './db.js';
import crypto from 'crypto';

interface AlertRuleInput {
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  windowMinutes?: number;
  webhookUrl?: string;
  enabled?: boolean;
}

export function createAlertRule(input: AlertRuleInput) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO alert_rules (id, name, metric, operator, threshold, window_minutes, webhook_url, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.metric,
    input.operator,
    input.threshold,
    input.windowMinutes || 5,
    input.webhookUrl || null,
    input.enabled !== false ? 1 : 0,
    now,
    now,
  );

  return getAlertRule(id);
}

export function getAlertRules() {
  return db.prepare('SELECT * FROM alert_rules ORDER BY created_at DESC').all();
}

export function getAlertRule(id: string) {
  return db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id);
}

export function updateAlertRule(id: string, input: Partial<AlertRuleInput>) {
  const existing = getAlertRule(id);
  if (!existing) return null;

  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];

  if (input.name !== undefined) {
    updates.push('name = ?');
    params.push(input.name);
  }
  if (input.metric !== undefined) {
    updates.push('metric = ?');
    params.push(input.metric);
  }
  if (input.operator !== undefined) {
    updates.push('operator = ?');
    params.push(input.operator);
  }
  if (input.threshold !== undefined) {
    updates.push('threshold = ?');
    params.push(input.threshold);
  }
  if (input.windowMinutes !== undefined) {
    updates.push('window_minutes = ?');
    params.push(input.windowMinutes);
  }
  if (input.webhookUrl !== undefined) {
    updates.push('webhook_url = ?');
    params.push(input.webhookUrl);
  }
  if (input.enabled !== undefined) {
    updates.push('enabled = ?');
    params.push(input.enabled ? 1 : 0);
  }

  params.push(id);
  db.prepare(`UPDATE alert_rules SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return getAlertRule(id);
}

export function deleteAlertRule(id: string) {
  return db.prepare('DELETE FROM alert_rules WHERE id = ?').run(id);
}

export function evaluateAlerts(): unknown[] {
  const rules = db.prepare('SELECT * FROM alert_rules WHERE enabled = 1').all() as Record<string, unknown>[];
  const triggered: unknown[] = [];

  for (const rule of rules) {
    const windowStart = new Date(
      Date.now() - (rule.window_minutes as number) * 60 * 1000,
    ).toISOString();

    let currentValue: number;

    switch (rule.metric) {
      case 'latency': {
        const result = db
          .prepare('SELECT AVG(duration) as value FROM traces WHERE timestamp >= ?')
          .get(windowStart) as { value: number | null };
        currentValue = result?.value || 0;
        break;
      }
      case 'error_rate': {
        const result = db
          .prepare(
            `SELECT COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0) as value
             FROM traces WHERE timestamp >= ?`,
          )
          .get(windowStart) as { value: number };
        currentValue = result?.value || 0;
        break;
      }
      case 'cost': {
        const result = db
          .prepare('SELECT COALESCE(SUM(cost_total), 0) as value FROM traces WHERE timestamp >= ?')
          .get(windowStart) as { value: number };
        currentValue = result?.value || 0;
        break;
      }
      case 'token_usage': {
        const result = db
          .prepare(
            'SELECT COALESCE(SUM(tokens_total), 0) as value FROM traces WHERE timestamp >= ?',
          )
          .get(windowStart) as { value: number };
        currentValue = result?.value || 0;
        break;
      }
      default:
        continue;
    }

    const shouldTrigger = evaluateCondition(
      currentValue,
      rule.operator as string,
      rule.threshold as number,
    );

    if (shouldTrigger) {
      const eventId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO alert_events (id, rule_id, rule_name, metric, current_value, threshold, triggered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        eventId,
        rule.id,
        rule.name,
        rule.metric,
        currentValue,
        rule.threshold,
        new Date().toISOString(),
      );

      const event = {
        id: eventId,
        ruleId: rule.id,
        ruleName: rule.name,
        metric: rule.metric,
        currentValue,
        threshold: rule.threshold,
        webhookUrl: rule.webhook_url,
      };

      triggered.push(event);

      // Fire webhook if configured
      if (rule.webhook_url) {
        fireWebhook(rule.webhook_url as string, event).catch(() => {});
      }
    }
  }

  return triggered;
}

function evaluateCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case 'gt':
      return value > threshold;
    case 'lt':
      return value < threshold;
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    default:
      return false;
  }
}

async function fireWebhook(url: string, payload: unknown): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort -- don't crash on webhook failure
  }
}

export function getAlertEvents(
  params: { ruleId?: string; limit?: number; offset?: number } = {},
) {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];

  if (params.ruleId) {
    conditions.push('rule_id = ?');
    queryParams.push(params.ruleId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  return db
    .prepare(`SELECT * FROM alert_events ${where} ORDER BY triggered_at DESC LIMIT ? OFFSET ?`)
    .all(...queryParams, limit, offset);
}

export type { AlertRuleInput };
