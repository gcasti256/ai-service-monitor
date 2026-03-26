/**
 * Alert system tests — exercises alert rule evaluation, condition operators,
 * metric calculations, window filtering, and webhook URL safety validation.
 */

vi.hoisted(() => {
  process.env.DATABASE_PATH = ':memory:';
});

import {
  createAlertRule,
  getAlertRules,
  updateAlertRule,
  deleteAlertRule,
  evaluateAlerts,
  getAlertEvents,
  isWebhookUrlSafe,
} from '../alerts.js';
import { insertTrace, insertTraceBatch } from '../traces.js';
import { db } from '../db.js';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrace(overrides: Record<string, unknown> = {}) {
  return {
    traceId: crypto.randomUUID(),
    spanId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    duration: 150,
    provider: 'openai',
    model: 'gpt-4o',
    endpoint: '/chat/completions',
    status: 'success' as const,
    tokens: { input: 100, output: 50, total: 150 },
    cost: { input: 0.005, output: 0.015, total: 0.02 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  db.exec('DELETE FROM alert_events');
  db.exec('DELETE FROM alert_rules');
  db.exec('DELETE FROM traces');
});

afterAll(() => {
  db.close();
});

// ===========================================================================
// Webhook URL Safety
// ===========================================================================

describe('isWebhookUrlSafe', () => {
  it('blocks localhost', () => {
    expect(isWebhookUrlSafe('http://localhost:8080/hook')).toBe(false);
    expect(isWebhookUrlSafe('http://localhost/hook')).toBe(false);
  });

  it('blocks 127.0.0.1', () => {
    expect(isWebhookUrlSafe('http://127.0.0.1:3000/hook')).toBe(false);
  });

  it('blocks ::1 (IPv6 loopback)', () => {
    expect(isWebhookUrlSafe('http://[::1]:3000/hook')).toBe(false);
  });

  it('blocks 0.0.0.0', () => {
    expect(isWebhookUrlSafe('http://0.0.0.0/hook')).toBe(false);
  });

  it('blocks private 10.x.x.x range', () => {
    expect(isWebhookUrlSafe('http://10.0.0.1/hook')).toBe(false);
    expect(isWebhookUrlSafe('http://10.255.255.255/hook')).toBe(false);
  });

  it('blocks private 172.16-31.x.x range', () => {
    expect(isWebhookUrlSafe('http://172.16.0.1/hook')).toBe(false);
    expect(isWebhookUrlSafe('http://172.31.255.255/hook')).toBe(false);
  });

  it('allows 172.32.x.x (not private)', () => {
    expect(isWebhookUrlSafe('http://172.32.0.1/hook')).toBe(true);
  });

  it('blocks private 192.168.x.x range', () => {
    expect(isWebhookUrlSafe('http://192.168.1.1/hook')).toBe(false);
  });

  it('blocks link-local 169.254.x.x', () => {
    expect(isWebhookUrlSafe('http://169.254.1.1/hook')).toBe(false);
  });

  it('blocks cloud metadata endpoint', () => {
    expect(isWebhookUrlSafe('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isWebhookUrlSafe('http://metadata.google.internal/computeMetadata/v1/')).toBe(false);
  });

  it('blocks non-http protocols', () => {
    expect(isWebhookUrlSafe('ftp://example.com/hook')).toBe(false);
    expect(isWebhookUrlSafe('file:///etc/passwd')).toBe(false);
  });

  it('blocks invalid URLs', () => {
    expect(isWebhookUrlSafe('not a url')).toBe(false);
  });

  it('allows valid public URLs', () => {
    expect(isWebhookUrlSafe('https://hooks.slack.com/services/T00/B00/xxx')).toBe(true);
    expect(isWebhookUrlSafe('https://api.pagerduty.com/webhooks')).toBe(true);
    expect(isWebhookUrlSafe('http://example.com/webhook')).toBe(true);
  });

  it('blocks IPv6 unique local addresses (fc/fd)', () => {
    expect(isWebhookUrlSafe('http://[fc00::1]/hook')).toBe(false);
    expect(isWebhookUrlSafe('http://[fd00::1]/hook')).toBe(false);
  });

  it('blocks IPv6 link-local (fe80::)', () => {
    expect(isWebhookUrlSafe('http://[fe80::1]/hook')).toBe(false);
  });
});

// ===========================================================================
// Alert Rule CRUD
// ===========================================================================

describe('Alert rule CRUD', () => {
  it('creates a rule with default values', () => {
    const rule = createAlertRule({
      name: 'High latency',
      metric: 'latency',
      operator: 'gt',
      threshold: 500,
    });
    expect(rule).toBeDefined();
    expect((rule as Record<string, unknown>).name).toBe('High latency');
    expect((rule as Record<string, unknown>).window_minutes).toBe(5);
    expect((rule as Record<string, unknown>).enabled).toBe(1);
  });

  it('creates a disabled rule', () => {
    const rule = createAlertRule({
      name: 'Disabled rule',
      metric: 'cost',
      operator: 'gt',
      threshold: 100,
      enabled: false,
    }) as Record<string, unknown>;
    expect(rule.enabled).toBe(0);
  });

  it('lists all rules', () => {
    createAlertRule({ name: 'A', metric: 'latency', operator: 'gt', threshold: 1 });
    createAlertRule({ name: 'B', metric: 'cost', operator: 'gt', threshold: 2 });
    const rules = getAlertRules();
    expect(rules).toHaveLength(2);
  });

  it('updates a rule', () => {
    const created = createAlertRule({
      name: 'Original',
      metric: 'latency',
      operator: 'gt',
      threshold: 500,
    }) as Record<string, unknown>;

    const updated = updateAlertRule(created.id as string, {
      name: 'Updated',
      threshold: 1000,
    }) as Record<string, unknown>;

    expect(updated.name).toBe('Updated');
    expect(updated.threshold).toBe(1000);
  });

  it('returns null when updating nonexistent rule', () => {
    const result = updateAlertRule('nonexistent', { name: 'Nope' });
    expect(result).toBeNull();
  });

  it('deletes a rule', () => {
    const rule = createAlertRule({
      name: 'Doomed',
      metric: 'latency',
      operator: 'gt',
      threshold: 1,
    }) as Record<string, unknown>;

    deleteAlertRule(rule.id as string);
    expect(getAlertRules()).toHaveLength(0);
  });
});

// ===========================================================================
// Alert Evaluation — Condition Operators
// ===========================================================================

describe('evaluateAlerts — condition operators', () => {
  it('gt triggers when value > threshold', () => {
    insertTrace(makeTrace({ duration: 600 }));
    createAlertRule({
      name: 'GT test',
      metric: 'latency',
      operator: 'gt',
      threshold: 500,
      windowMinutes: 60,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(1);
  });

  it('gt does NOT trigger when value = threshold', () => {
    insertTrace(makeTrace({ duration: 500 }));
    createAlertRule({
      name: 'GT equal',
      metric: 'latency',
      operator: 'gt',
      threshold: 500,
      windowMinutes: 60,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(0);
  });

  it('gte triggers when value = threshold', () => {
    insertTrace(makeTrace({ duration: 500 }));
    createAlertRule({
      name: 'GTE test',
      metric: 'latency',
      operator: 'gte',
      threshold: 500,
      windowMinutes: 60,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(1);
  });

  it('lt triggers when value < threshold', () => {
    insertTrace(makeTrace({ duration: 50 }));
    createAlertRule({
      name: 'LT test',
      metric: 'latency',
      operator: 'lt',
      threshold: 100,
      windowMinutes: 60,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(1);
  });

  it('lte triggers when value = threshold', () => {
    insertTrace(makeTrace({ duration: 100 }));
    createAlertRule({
      name: 'LTE test',
      metric: 'latency',
      operator: 'lte',
      threshold: 100,
      windowMinutes: 60,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(1);
  });
});

// ===========================================================================
// Alert Evaluation — Metric Types
// ===========================================================================

describe('evaluateAlerts — metric types', () => {
  it('evaluates error_rate metric', () => {
    // 2 out of 4 calls errored = 50% error rate
    insertTraceBatch([
      makeTrace({ status: 'success' }),
      makeTrace({ status: 'success' }),
      makeTrace({ status: 'error', error: { message: 'fail', type: 'Error' } }),
      makeTrace({ status: 'error', error: { message: 'fail', type: 'Error' } }),
    ]);

    createAlertRule({
      name: 'Error rate alert',
      metric: 'error_rate',
      operator: 'gt',
      threshold: 25, // 25%
      windowMinutes: 60,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(1);
    expect((triggered[0] as Record<string, unknown>).currentValue).toBeCloseTo(50, 0);
  });

  it('evaluates cost metric (total cost in window)', () => {
    insertTraceBatch([
      makeTrace({ cost: { input: 0.10, output: 0.20, total: 0.30 } }),
      makeTrace({ cost: { input: 0.10, output: 0.20, total: 0.30 } }),
    ]);

    createAlertRule({
      name: 'Cost alert',
      metric: 'cost',
      operator: 'gt',
      threshold: 0.50,
      windowMinutes: 60,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(1);
    expect((triggered[0] as Record<string, unknown>).currentValue).toBeCloseTo(0.60, 2);
  });

  it('evaluates token_usage metric (total tokens in window)', () => {
    insertTraceBatch([
      makeTrace({ tokens: { input: 500, output: 300, total: 800 } }),
      makeTrace({ tokens: { input: 400, output: 200, total: 600 } }),
    ]);

    createAlertRule({
      name: 'Token usage alert',
      metric: 'token_usage',
      operator: 'gt',
      threshold: 1000,
      windowMinutes: 60,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(1);
    expect((triggered[0] as Record<string, unknown>).currentValue).toBe(1400);
  });
});

// ===========================================================================
// Alert Evaluation — Edge Cases
// ===========================================================================

describe('evaluateAlerts — edge cases', () => {
  it('returns empty array when no rules exist', () => {
    const triggered = evaluateAlerts();
    expect(triggered).toEqual([]);
  });

  it('returns zero metric values when no traces exist in window', () => {
    createAlertRule({
      name: 'Empty window',
      metric: 'latency',
      operator: 'gt',
      threshold: 0.001,
      windowMinutes: 1,
    });

    // No traces at all — latency avg is 0
    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(0);
  });

  it('skips disabled rules', () => {
    insertTrace(makeTrace({ duration: 1000 }));

    createAlertRule({
      name: 'Disabled',
      metric: 'latency',
      operator: 'gt',
      threshold: 100,
      windowMinutes: 60,
      enabled: false,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(0);
  });

  it('records alert events in the database', () => {
    insertTrace(makeTrace({ duration: 1000 }));
    createAlertRule({
      name: 'DB event test',
      metric: 'latency',
      operator: 'gt',
      threshold: 100,
      windowMinutes: 60,
    });

    evaluateAlerts();

    const events = getAlertEvents();
    expect(events).toHaveLength(1);
    const event = events[0] as Record<string, unknown>;
    expect(event.rule_name).toBe('DB event test');
    expect(event.metric).toBe('latency');
    expect(Number(event.current_value)).toBeGreaterThan(100);
  });

  it('only considers traces within the time window', () => {
    // Insert an old trace outside the 5-minute window
    insertTrace(
      makeTrace({
        duration: 9999,
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
      }),
    );

    // Insert a recent trace within window
    insertTrace(makeTrace({ duration: 50 }));

    createAlertRule({
      name: 'Window test',
      metric: 'latency',
      operator: 'gt',
      threshold: 1000,
      windowMinutes: 5,
    });

    // Avg latency in the 5-min window should be ~50, not ~5024
    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(0);
  });

  it('handles multiple rules — some trigger, some do not', () => {
    insertTrace(makeTrace({ duration: 300 }));

    createAlertRule({
      name: 'Should trigger',
      metric: 'latency',
      operator: 'gt',
      threshold: 200,
      windowMinutes: 60,
    });

    createAlertRule({
      name: 'Should not trigger',
      metric: 'latency',
      operator: 'gt',
      threshold: 500,
      windowMinutes: 60,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(1);
    expect((triggered[0] as Record<string, unknown>).ruleName).toBe('Should trigger');
  });

  it('error_rate is 0 when all traces succeed', () => {
    insertTraceBatch([
      makeTrace({ status: 'success' }),
      makeTrace({ status: 'success' }),
    ]);

    createAlertRule({
      name: 'No errors',
      metric: 'error_rate',
      operator: 'gt',
      threshold: 0,
      windowMinutes: 60,
    });

    const triggered = evaluateAlerts();
    expect(triggered).toHaveLength(0);
  });
});
