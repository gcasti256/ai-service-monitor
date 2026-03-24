import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Transport } from '../transport.js';
import type { TraceEvent } from '../types.js';

function makeEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    id: crypto.randomUUID(),
    traceId: 'trace-1',
    spanId: 'span-1',
    timestamp: new Date().toISOString(),
    duration: 100,
    provider: 'openai',
    model: 'gpt-4o',
    endpoint: 'chat.completions',
    status: 'success',
    tokens: { input: 10, output: 5, total: 15 },
    cost: { input: 0.001, output: 0.002, total: 0.003 },
    ...overrides,
  };
}

let fetchCalls: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string);
    fetchCalls.push({ url: String(url), body });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Transport', () => {
  it('sends events to the correct URL', async () => {
    const transport = new Transport('http://localhost:3000', 1, 60000);
    transport.send(makeEvent());
    await transport.shutdown();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/traces');
  });

  it('batches events before sending', async () => {
    const transport = new Transport('http://localhost:3000', 3, 60000);
    transport.send(makeEvent());
    transport.send(makeEvent());
    // Not yet flushed (batch size 3)
    expect(fetchCalls.length).toBe(0);
    transport.send(makeEvent());
    // Now should flush
    await transport.shutdown();
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    expect((fetchCalls[0].body as TraceEvent[]).length).toBe(3);
  });

  it('includes Authorization header when apiKey is provided', async () => {
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-key');
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const transport = new Transport('http://localhost:3000', 1, 60000, 'test-key');
    transport.send(makeEvent());
    await transport.shutdown();
  });

  it('does not accept events after shutdown', async () => {
    const transport = new Transport('http://localhost:3000', 1, 60000);
    await transport.shutdown();
    transport.send(makeEvent());
    // Give time for any flush
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCalls.length).toBe(0);
  });

  it('flushes remaining events on shutdown', async () => {
    const transport = new Transport('http://localhost:3000', 100, 60000);
    transport.send(makeEvent());
    transport.send(makeEvent());
    // Batch size 100, so no auto-flush
    expect(fetchCalls.length).toBe(0);
    await transport.shutdown();
    // Should have flushed on shutdown
    expect(fetchCalls.length).toBe(1);
    expect((fetchCalls[0].body as TraceEvent[]).length).toBe(2);
  });

  it('drops events silently on persistent fetch failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('Server Error', { status: 500 });
    }) as unknown as typeof fetch;

    const transport = new Transport('http://localhost:3000', 1, 60000);
    transport.send(makeEvent());

    // Should not throw
    await expect(transport.shutdown()).resolves.not.toThrow();
  });

  it('does not retry on 4xx errors', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      return new Response('Bad Request', { status: 400 });
    }) as unknown as typeof fetch;

    const transport = new Transport('http://localhost:3000', 1, 60000);
    transport.send(makeEvent());
    await transport.shutdown();

    // Should only call fetch once — no retries for 4xx
    expect(callCount).toBe(1);
  });

  it('limits queue size to prevent unbounded memory growth', async () => {
    const transport = new Transport('http://localhost:3000', 2000, 60000);

    // Send more events than MAX_QUEUE_SIZE (1000)
    for (let i = 0; i < 1100; i++) {
      transport.send(makeEvent());
    }

    await transport.shutdown();

    // The total events sent should be at most MAX_QUEUE_SIZE
    const totalSent = fetchCalls.reduce(
      (sum, call) => sum + (call.body as TraceEvent[]).length,
      0,
    );
    expect(totalSent).toBeLessThanOrEqual(1000);
  });
});
