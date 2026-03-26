/**
 * Server route tests — exercises every API endpoint with valid/invalid inputs,
 * error cases, and auth checks using Hono's built-in test client.
 */

vi.hoisted(() => {
  process.env.DATABASE_PATH = ':memory:';
  delete process.env.API_KEY;
});

import { app } from '../routes.js';
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
    status: 'success',
    tokens: { input: 100, output: 50, total: 150 },
    cost: { input: 0.005, output: 0.015, total: 0.02 },
    ...overrides,
  };
}

function makeAlertRule(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Rule',
    metric: 'latency',
    operator: 'gt',
    threshold: 500,
    windowMinutes: 5,
    ...overrides,
  };
}

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function putJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clean all tables between tests (order matters for FK constraints)
  db.exec('DELETE FROM alert_events');
  db.exec('DELETE FROM alert_rules');
  db.exec('DELETE FROM traces');
});

afterAll(() => {
  db.close();
});

// ===========================================================================
// Health
// ===========================================================================

describe('GET /health', () => {
  it('returns 200 with status and timestamp', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});

// ===========================================================================
// Traces
// ===========================================================================

describe('POST /traces', () => {
  it('ingests a single trace and returns 201', async () => {
    const trace = makeTrace();
    const res = await postJson('/traces', trace);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ingested).toBe(1);
  });

  it('ingests a batch of traces and returns count', async () => {
    const batch = [makeTrace(), makeTrace(), makeTrace()];
    const res = await postJson('/traces', batch);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ingested).toBe(3);
  });

  it('rejects invalid trace with 400 and validation details', async () => {
    const res = await postJson('/traces', { bad: 'data' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('rejects trace with missing required fields', async () => {
    const res = await postJson('/traces', {
      traceId: 'abc',
      // missing spanId, timestamp, duration, provider, model, endpoint, status, tokens, cost
    });
    expect(res.status).toBe(400);
  });

  it('rejects trace with negative duration', async () => {
    const res = await postJson('/traces', makeTrace({ duration: -1 }));
    expect(res.status).toBe(400);
  });

  it('rejects trace with invalid status value', async () => {
    const res = await postJson('/traces', makeTrace({ status: 'unknown' }));
    expect(res.status).toBe(400);
  });

  it('accepts trace with optional fields (error, metadata, response)', async () => {
    const trace = makeTrace({
      status: 'error',
      error: { message: 'Rate limited', type: 'RateLimitError' },
      metadata: { userId: 'u123', environment: 'staging' },
      response: { content: 'partial response', finishReason: 'stop', responseLength: 16 },
    });
    const res = await postJson('/traces', trace);
    expect(res.status).toBe(201);
  });
});

describe('GET /traces', () => {
  it('returns empty list when no traces exist', async () => {
    const res = await app.request('/traces');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.traces).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns ingested traces', async () => {
    await postJson('/traces', [makeTrace(), makeTrace()]);
    const res = await app.request('/traces');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.traces).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it('filters by model', async () => {
    await postJson('/traces', [
      makeTrace({ model: 'gpt-4o' }),
      makeTrace({ model: 'claude-sonnet-4' }),
    ]);
    const res = await app.request('/traces?model=gpt-4o');
    const body = await res.json();
    expect(body.traces).toHaveLength(1);
    expect(body.traces[0].model).toBe('gpt-4o');
  });

  it('filters by provider', async () => {
    await postJson('/traces', [
      makeTrace({ provider: 'openai' }),
      makeTrace({ provider: 'anthropic' }),
    ]);
    const res = await app.request('/traces?provider=anthropic');
    const body = await res.json();
    expect(body.traces).toHaveLength(1);
    expect(body.traces[0].provider).toBe('anthropic');
  });

  it('filters by status', async () => {
    await postJson('/traces', [
      makeTrace({ status: 'success' }),
      makeTrace({
        status: 'error',
        error: { message: 'fail', type: 'Error' },
      }),
    ]);
    const res = await app.request('/traces?status=error');
    const body = await res.json();
    expect(body.traces).toHaveLength(1);
    expect(body.traces[0].status).toBe('error');
  });

  it('supports limit and offset for pagination', async () => {
    const traces = Array.from({ length: 5 }, () => makeTrace());
    await postJson('/traces', traces);

    const page1 = await app.request('/traces?limit=2&offset=0');
    const body1 = await page1.json();
    expect(body1.traces).toHaveLength(2);
    expect(body1.total).toBe(5);

    const page2 = await app.request('/traces?limit=2&offset=2');
    const body2 = await page2.json();
    expect(body2.traces).toHaveLength(2);
  });
});

describe('GET /traces/:id', () => {
  it('returns a trace by its span ID', async () => {
    const trace = makeTrace({ id: 'test-span-id-123' });
    await postJson('/traces', trace);

    const res = await app.request('/traces/test-span-id-123');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('test-span-id-123');
    expect(body.model).toBe('gpt-4o');
  });

  it('returns 404 for nonexistent trace', async () => {
    const res = await app.request('/traces/nonexistent-id');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Trace not found');
  });
});

describe('GET /traces/by-trace/:traceId', () => {
  it('returns all spans grouped by trace ID', async () => {
    const traceId = crypto.randomUUID();
    const span1 = makeTrace({ traceId, spanId: 'span-1' });
    const span2 = makeTrace({ traceId, spanId: 'span-2', parentSpanId: 'span-1' });
    const unrelated = makeTrace(); // different traceId

    await postJson('/traces', [span1, span2, unrelated]);

    const res = await app.request(`/traces/by-trace/${traceId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body.every((t: { trace_id: string }) => t.trace_id === traceId)).toBe(true);
  });
});

// ===========================================================================
// Stats
// ===========================================================================

describe('GET /stats', () => {
  it('returns zeros when no traces exist', async () => {
    const res = await app.request('/stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_calls).toBe(0);
    expect(body.avg_latency).toBe(0);
    expect(body.error_rate).toBe(0);
    expect(body.total_cost).toBe(0);
  });

  it('returns aggregated stats for existing traces', async () => {
    await postJson('/traces', [
      makeTrace({ duration: 200, cost: { input: 0.01, output: 0.02, total: 0.03 } }),
      makeTrace({ duration: 400, cost: { input: 0.01, output: 0.02, total: 0.03 } }),
    ]);

    const res = await app.request('/stats');
    const body = await res.json();
    expect(body.total_calls).toBe(2);
    expect(body.avg_latency).toBe(300);
    expect(body.total_cost).toBeCloseTo(0.06, 5);
  });
});

describe('GET /stats/latency', () => {
  it('returns latency timeseries', async () => {
    await postJson('/traces', makeTrace({ duration: 250 }));
    const res = await app.request('/stats/latency');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]).toHaveProperty('timestamp');
    expect(body[0]).toHaveProperty('value');
    expect(body[0]).toHaveProperty('count');
  });
});

describe('GET /stats/models', () => {
  it('returns per-model breakdown', async () => {
    await postJson('/traces', [
      makeTrace({ model: 'gpt-4o', provider: 'openai' }),
      makeTrace({ model: 'gpt-4o', provider: 'openai' }),
      makeTrace({ model: 'claude-sonnet-4', provider: 'anthropic' }),
    ]);

    const res = await app.request('/stats/models');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    const gpt = body.find((m: { model: string }) => m.model === 'gpt-4o');
    expect(gpt.calls).toBe(2);
  });
});

describe('GET /stats/cost', () => {
  it('returns daily cost timeseries', async () => {
    await postJson('/traces', makeTrace());
    const res = await app.request('/stats/cost');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]).toHaveProperty('value');
    expect(body[0]).toHaveProperty('tokens');
  });
});

describe('GET /stats/errors', () => {
  it('returns only error traces', async () => {
    await postJson('/traces', [
      makeTrace({ status: 'success' }),
      makeTrace({
        status: 'error',
        error: { message: 'Timeout', type: 'TimeoutError' },
      }),
    ]);

    const res = await app.request('/stats/errors');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.errors[0].error_message).toBe('Timeout');
  });
});

// ===========================================================================
// Alert Rules
// ===========================================================================

describe('POST /alerts/rules', () => {
  it('creates a new alert rule and returns 201', async () => {
    const res = await postJson('/alerts/rules', makeAlertRule());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Test Rule');
    expect(body.metric).toBe('latency');
    expect(body.threshold).toBe(500);
  });

  it('rejects invalid rule with 400', async () => {
    const res = await postJson('/alerts/rules', { name: '' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('rejects rule with unsafe webhook URL (localhost)', async () => {
    const res = await postJson(
      '/alerts/rules',
      makeAlertRule({ webhookUrl: 'http://localhost:8080/webhook' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not allowed');
  });

  it('rejects rule with unsafe webhook URL (private IP)', async () => {
    const res = await postJson(
      '/alerts/rules',
      makeAlertRule({ webhookUrl: 'http://192.168.1.1/webhook' }),
    );
    expect(res.status).toBe(400);
  });

  it('accepts rule with valid public webhook URL', async () => {
    const res = await postJson(
      '/alerts/rules',
      makeAlertRule({ webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.webhook_url).toBe('https://hooks.slack.com/services/T00/B00/xxx');
  });
});

describe('GET /alerts/rules', () => {
  it('returns all alert rules', async () => {
    await postJson('/alerts/rules', makeAlertRule({ name: 'Rule A' }));
    await postJson('/alerts/rules', makeAlertRule({ name: 'Rule B' }));

    const res = await app.request('/alerts/rules');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});

describe('PUT /alerts/rules/:id', () => {
  it('updates an existing rule', async () => {
    const createRes = await postJson('/alerts/rules', makeAlertRule());
    const rule = await createRes.json();

    const res = await putJson(`/alerts/rules/${rule.id}`, {
      name: 'Updated Rule',
      threshold: 1000,
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.name).toBe('Updated Rule');
    expect(updated.threshold).toBe(1000);
  });

  it('returns 404 for nonexistent rule', async () => {
    const res = await putJson('/alerts/rules/nonexistent-id', { name: 'Nope' });
    expect(res.status).toBe(404);
  });

  it('rejects unsafe webhook URL on update', async () => {
    const createRes = await postJson('/alerts/rules', makeAlertRule());
    const rule = await createRes.json();

    const res = await putJson(`/alerts/rules/${rule.id}`, {
      webhookUrl: 'http://127.0.0.1/evil',
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /alerts/rules/:id', () => {
  it('deletes an existing rule', async () => {
    const createRes = await postJson('/alerts/rules', makeAlertRule());
    const rule = await createRes.json();

    const res = await app.request(`/alerts/rules/${rule.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);

    // Verify it's gone
    const listRes = await app.request('/alerts/rules');
    const rules = await listRes.json();
    expect(rules).toHaveLength(0);
  });
});

describe('POST /alerts/evaluate', () => {
  it('returns empty when no rules exist', async () => {
    const res = await postJson('/alerts/evaluate', {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.triggered).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('triggers an alert when threshold is breached', async () => {
    // Insert high-latency traces
    await postJson('/traces', [
      makeTrace({ duration: 800 }),
      makeTrace({ duration: 900 }),
    ]);

    // Create a latency > 500ms rule
    await postJson('/alerts/rules', makeAlertRule({
      name: 'High Latency',
      metric: 'latency',
      operator: 'gt',
      threshold: 500,
      windowMinutes: 60,
    }));

    const res = await postJson('/alerts/evaluate', {});
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.triggered[0].metric).toBe('latency');
    expect(body.triggered[0].currentValue).toBeGreaterThan(500);
  });
});

describe('GET /alerts/events', () => {
  it('returns alert event history', async () => {
    // Trigger an alert first
    await postJson('/traces', makeTrace({ duration: 1000 }));
    await postJson('/alerts/rules', makeAlertRule({
      metric: 'latency',
      operator: 'gt',
      threshold: 100,
      windowMinutes: 60,
    }));
    await postJson('/alerts/evaluate', {});

    const res = await app.request('/alerts/events');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]).toHaveProperty('rule_id');
    expect(body[0]).toHaveProperty('current_value');
    expect(body[0]).toHaveProperty('threshold');
  });
});

// ===========================================================================
// Admin
// ===========================================================================

describe('GET /admin/stats', () => {
  it('returns database statistics', async () => {
    await postJson('/traces', makeTrace());
    await postJson('/alerts/rules', makeAlertRule());

    const res = await app.request('/admin/stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.traces).toBe(1);
    expect(body.alertRules).toBe(1);
    expect(body.alertEvents).toBe(0);
    expect(body).toHaveProperty('oldestTrace');
    expect(body).toHaveProperty('newestTrace');
  });
});

describe('POST /admin/cleanup', () => {
  it('performs retention cleanup and reports deleted counts', async () => {
    // Insert a trace with a very old timestamp
    await postJson('/traces', makeTrace({
      timestamp: '2020-01-01T00:00:00.000Z',
    }));

    const res = await postJson('/admin/cleanup', { retentionDays: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tracesDeleted).toBe(1);
    expect(body.alertsDeleted).toBe(0);
  });

  it('works with no request body', async () => {
    const res = await app.request('/admin/cleanup', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('tracesDeleted');
    expect(body).toHaveProperty('alertsDeleted');
  });
});

// ===========================================================================
// Auth middleware
// ===========================================================================

describe('API key authentication', () => {
  // These tests temporarily set API_KEY in the env. Since the routes.ts reads
  // API_KEY at module-load time, we need a different approach — we test via
  // the auth middleware behavior that's already wired up.

  // The auth check reads process.env.API_KEY via the module-scoped `API_KEY` const.
  // Since we cleared it in vi.hoisted(), write endpoints should be open.

  it('allows POST /traces without auth when API_KEY is not set', async () => {
    const res = await postJson('/traces', makeTrace());
    expect(res.status).toBe(201);
  });

  it('allows POST /alerts/rules without auth when API_KEY is not set', async () => {
    const res = await postJson('/alerts/rules', makeAlertRule());
    expect(res.status).toBe(201);
  });
});
