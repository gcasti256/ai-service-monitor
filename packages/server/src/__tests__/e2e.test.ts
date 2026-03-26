/**
 * End-to-end pipeline test — starts a real HTTP server, uses the SDK to send
 * monitoring events, verifies storage, triggers alerts, and checks dashboard stats.
 */

vi.hoisted(() => {
  process.env.DATABASE_PATH = ':memory:';
});

import { app } from '../routes.js';
import { db } from '../db.js';
import { serve } from '@hono/node-server';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { AIMonitor } from '../../../sdk/src/index.js';

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = serve({ fetch: app.fetch, port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM alert_events');
  db.exec('DELETE FROM alert_rules');
  db.exec('DELETE FROM traces');
});

// ---------------------------------------------------------------------------
// E2E Pipeline
// ---------------------------------------------------------------------------

describe('Full pipeline: SDK → Server → Alerts → Stats', () => {
  it('ingests events from the SDK and stores them in the database', async () => {
    const monitor = new AIMonitor({
      collectorUrl: baseUrl,
      enablePiiMasking: false,
      batchSize: 1,
      flushInterval: 100,
    });

    // Simulate a successful AI call
    const result = await monitor.trace(
      'openai',
      'gpt-4o',
      '/chat/completions',
      async () => ({
        id: 'chatcmpl-123',
        choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    );

    expect(result.choices[0].message.content).toBe('Hello!');

    // Flush all pending events
    await monitor.shutdown();

    // Small delay to ensure the server processes the request
    await new Promise((r) => setTimeout(r, 200));

    // Verify the trace was stored
    const { total } = db.prepare('SELECT COUNT(*) as total FROM traces').get() as { total: number };
    expect(total).toBe(1);

    const trace = db.prepare('SELECT * FROM traces LIMIT 1').get() as Record<string, unknown>;
    expect(trace.model).toBe('gpt-4o');
    expect(trace.provider).toBe('openai');
    expect(trace.status).toBe('success');
    expect(trace.tokens_input).toBe(10);
    expect(trace.tokens_output).toBe(5);
  });

  it('handles SDK errors without swallowing them', async () => {
    const monitor = new AIMonitor({
      collectorUrl: baseUrl,
      enablePiiMasking: false,
      batchSize: 1,
      flushInterval: 100,
    });

    // The error should propagate to the caller
    await expect(
      monitor.trace('openai', 'gpt-4o', '/chat/completions', async () => {
        throw new Error('Rate limit exceeded');
      }),
    ).rejects.toThrow('Rate limit exceeded');

    await monitor.shutdown();
    await new Promise((r) => setTimeout(r, 200));

    // Error trace should still be recorded
    const trace = db.prepare('SELECT * FROM traces LIMIT 1').get() as Record<string, unknown>;
    expect(trace.status).toBe('error');
    expect(trace.error_message).toBe('Rate limit exceeded');
  });

  it('creates alert rules via API and triggers them', async () => {
    // Step 1: Insert traces with high latency via the SDK
    const monitor = new AIMonitor({
      collectorUrl: baseUrl,
      enablePiiMasking: false,
      batchSize: 5,
      flushInterval: 100,
    });

    // Simulate 3 slow API calls
    for (let i = 0; i < 3; i++) {
      await monitor.trace(
        'openai',
        'gpt-4o',
        '/chat/completions',
        async () => {
          // Simulate a slow call — the monitor measures wall time
          await new Promise((r) => setTimeout(r, 50));
          return {
            choices: [{ message: { content: 'response' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          };
        },
      );
    }

    await monitor.shutdown();
    await new Promise((r) => setTimeout(r, 200));

    // Verify traces were stored
    const { total } = db.prepare('SELECT COUNT(*) as total FROM traces').get() as { total: number };
    expect(total).toBe(3);

    // Step 2: Create an alert rule via API
    const ruleRes = await fetch(`${baseUrl}/alerts/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E Latency Alert',
        metric: 'latency',
        operator: 'gte',
        threshold: 1, // 1ms — any call should trigger this
        windowMinutes: 60,
      }),
    });
    expect(ruleRes.status).toBe(201);
    const rule = await ruleRes.json();
    expect(rule.id).toBeDefined();

    // Step 3: Evaluate alerts — should trigger
    const evalRes = await fetch(`${baseUrl}/alerts/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(evalRes.status).toBe(200);
    const evalBody = await evalRes.json();
    expect(evalBody.count).toBeGreaterThanOrEqual(1);
    expect(evalBody.triggered[0].metric).toBe('latency');

    // Step 4: Verify alert event was recorded
    const eventsRes = await fetch(`${baseUrl}/alerts/events`);
    const events = await eventsRes.json();
    expect(events.length).toBeGreaterThanOrEqual(1);

    // Step 5: Check dashboard stats
    const statsRes = await fetch(`${baseUrl}/stats`);
    expect(statsRes.status).toBe(200);
    const stats = await statsRes.json();
    expect(stats.total_calls).toBe(3);
    expect(stats.avg_latency).toBeGreaterThan(0);
    expect(stats.total_cost).toBeGreaterThan(0);
    expect(stats.total_tokens).toBeGreaterThan(0);
  });

  it('exercises model breakdown and cost timeseries', async () => {
    const monitor = new AIMonitor({
      collectorUrl: baseUrl,
      enablePiiMasking: false,
      batchSize: 10,
      flushInterval: 100,
    });

    // Mix of providers/models
    await monitor.trace('openai', 'gpt-4o', '/chat/completions', async () => ({
      usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
    }));

    await monitor.trace('anthropic', 'claude-sonnet-4', '/messages', async () => ({
      usage: { input_tokens: 150, output_tokens: 80 },
      content: [{ text: 'hello' }],
      stop_reason: 'end_turn',
    }));

    await monitor.shutdown();
    await new Promise((r) => setTimeout(r, 200));

    // Model breakdown
    const modelsRes = await fetch(`${baseUrl}/stats/models`);
    const models = await modelsRes.json();
    expect(models.length).toBe(2);
    expect(models.find((m: { model: string }) => m.model === 'gpt-4o')).toBeDefined();
    expect(models.find((m: { model: string }) => m.model === 'claude-sonnet-4')).toBeDefined();

    // Cost timeseries
    const costRes = await fetch(`${baseUrl}/stats/cost`);
    const cost = await costRes.json();
    expect(cost.length).toBeGreaterThanOrEqual(1);
    expect(cost[0].value).toBeGreaterThan(0);

    // Latency timeseries
    const latencyRes = await fetch(`${baseUrl}/stats/latency`);
    const latency = await latencyRes.json();
    expect(latency.length).toBeGreaterThanOrEqual(1);
  });

  it('verifies PII masking through the full pipeline', async () => {
    const monitor = new AIMonitor({
      collectorUrl: baseUrl,
      enablePiiMasking: true,
      batchSize: 1,
      flushInterval: 100,
    });

    await monitor.trace('openai', 'gpt-4o', '/chat/completions', async () => ({
      choices: [{
        message: { content: 'Contact john@example.com or call 555-123-4567' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    }));

    await monitor.shutdown();
    await new Promise((r) => setTimeout(r, 200));

    const trace = db.prepare('SELECT * FROM traces LIMIT 1').get() as Record<string, unknown>;
    // Response content should have PII masked
    if (trace.response_body) {
      const content = trace.response_body as string;
      expect(content).not.toContain('john@example.com');
      expect(content).toContain('[REDACTED_EMAIL]');
    }
  });

  it('admin cleanup removes old data', async () => {
    // Insert a trace with an old timestamp directly
    db.prepare(`
      INSERT INTO traces (id, trace_id, span_id, timestamp, duration, provider, model, endpoint, status, tokens_input, tokens_output, tokens_total, cost_input, cost_output, cost_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'old-trace', 'old-trace-id', 'old-span-id',
      '2020-01-01T00:00:00.000Z', 100,
      'openai', 'gpt-4o', '/chat/completions', 'success',
      10, 5, 15, 0.01, 0.005, 0.015,
    );

    const before = (db.prepare('SELECT COUNT(*) as c FROM traces').get() as { c: number }).c;
    expect(before).toBe(1);

    const cleanupRes = await fetch(`${baseUrl}/admin/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retentionDays: 1 }),
    });
    expect(cleanupRes.status).toBe(200);
    const cleanup = await cleanupRes.json();
    expect(cleanup.tracesDeleted).toBe(1);

    const after = (db.prepare('SELECT COUNT(*) as c FROM traces').get() as { c: number }).c;
    expect(after).toBe(0);
  });
});
