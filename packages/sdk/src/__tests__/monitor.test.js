import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMonitor } from '../monitor.js';
// Capture events sent to the transport by intercepting fetch
let capturedRequests = [];
beforeEach(() => {
    capturedRequests = [];
    // Mock fetch to capture sent events
    globalThis.fetch = vi.fn(async (url, init) => {
        const body = JSON.parse(init?.body);
        capturedRequests.push({ url: String(url), body });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
});
function createMonitor(overrides = {}) {
    return new AIMonitor({
        collectorUrl: 'http://localhost:3000',
        batchSize: 1, // Flush every event for testing
        flushInterval: 60000, // High interval so only batch-size flushes trigger
        enablePiiMasking: true,
        sampleRate: 1,
        ...overrides,
    });
}
describe('AIMonitor', () => {
    describe('trace', () => {
        it('returns the original result unmodified', async () => {
            const monitor = createMonitor();
            const expectedResult = { id: 1, data: 'test' };
            const result = await monitor.trace('openai', 'gpt-4o', 'chat.completions', async () => {
                return expectedResult;
            });
            expect(result).toBe(expectedResult);
            await monitor.shutdown();
        });
        it('creates trace events with correct fields', async () => {
            const monitor = createMonitor();
            await monitor.trace('openai', 'gpt-4o', 'chat.completions', async () => {
                return {
                    usage: { prompt_tokens: 100, completion_tokens: 50 },
                    choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
                };
            });
            await monitor.shutdown();
            expect(capturedRequests.length).toBeGreaterThan(0);
            const events = capturedRequests[0].body.events;
            expect(events.length).toBe(1);
            const event = events[0];
            expect(event.provider).toBe('openai');
            expect(event.model).toBe('gpt-4o');
            expect(event.endpoint).toBe('chat.completions');
            expect(event.status).toBe('success');
            expect(event.duration).toBeGreaterThanOrEqual(0);
            expect(event.id).toBeDefined();
            expect(event.traceId).toBeDefined();
            expect(event.spanId).toBeDefined();
            expect(event.timestamp).toBeDefined();
        });
        it('extracts tokens from OpenAI-shaped responses', async () => {
            const monitor = createMonitor();
            await monitor.trace('openai', 'gpt-4o', 'chat.completions', async () => ({
                usage: { prompt_tokens: 150, completion_tokens: 75, total_tokens: 225 },
                choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
            }));
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.tokens.input).toBe(150);
            expect(event.tokens.output).toBe(75);
            expect(event.tokens.total).toBe(225);
        });
        it('extracts tokens from Anthropic-shaped responses', async () => {
            const monitor = createMonitor();
            await monitor.trace('anthropic', 'claude-sonnet-4-20250514', 'messages.create', async () => ({
                usage: { input_tokens: 200, output_tokens: 100 },
                content: [{ type: 'text', text: 'Hello from Claude' }],
                stop_reason: 'end_turn',
            }));
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.tokens.input).toBe(200);
            expect(event.tokens.output).toBe(100);
            expect(event.tokens.total).toBe(300);
        });
        it('extracts response content from OpenAI-shaped responses', async () => {
            const monitor = createMonitor({ enablePiiMasking: false });
            await monitor.trace('openai', 'gpt-4o', 'chat.completions', async () => ({
                usage: { prompt_tokens: 10, completion_tokens: 5 },
                choices: [{ message: { content: 'Test response' }, finish_reason: 'stop' }],
            }));
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.response?.content).toBe('Test response');
            expect(event.response?.finishReason).toBe('stop');
        });
        it('extracts response content from Anthropic-shaped responses', async () => {
            const monitor = createMonitor({ enablePiiMasking: false });
            await monitor.trace('anthropic', 'claude-sonnet-4-20250514', 'messages.create', async () => ({
                usage: { input_tokens: 10, output_tokens: 5 },
                content: [{ type: 'text', text: 'Claude response' }],
                stop_reason: 'end_turn',
            }));
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.response?.content).toBe('Claude response');
            expect(event.response?.finishReason).toBe('end_turn');
        });
        it('calculates cost based on model and tokens', async () => {
            const monitor = createMonitor();
            await monitor.trace('openai', 'gpt-4o', 'chat.completions', async () => ({
                usage: { prompt_tokens: 1000, completion_tokens: 500 },
                choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
            }));
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            // gpt-4o: $2.50/1M input, $10.00/1M output
            expect(event.cost.input).toBeCloseTo(0.0025, 6);
            expect(event.cost.output).toBeCloseTo(0.005, 6);
            expect(event.cost.total).toBeCloseTo(0.0075, 6);
        });
        it('records errors without swallowing them', async () => {
            const monitor = createMonitor();
            const testError = new Error('API rate limited');
            await expect(monitor.trace('openai', 'gpt-4o', 'chat.completions', async () => {
                throw testError;
            })).rejects.toThrow('API rate limited');
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.status).toBe('error');
            expect(event.error?.message).toBe('API rate limited');
            expect(event.error?.type).toBe('Error');
        });
        it('applies PII masking to response content when enabled', async () => {
            const monitor = createMonitor({ enablePiiMasking: true });
            await monitor.trace('openai', 'gpt-4o', 'chat.completions', async () => ({
                usage: { prompt_tokens: 10, completion_tokens: 5 },
                choices: [
                    {
                        message: { content: 'Contact user@example.com for details' },
                        finish_reason: 'stop',
                    },
                ],
            }));
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.response?.content).toBe('Contact [REDACTED_EMAIL] for details');
            expect(event.response?.content).not.toContain('user@example.com');
        });
        it('does not mask PII when disabled', async () => {
            const monitor = createMonitor({ enablePiiMasking: false });
            await monitor.trace('openai', 'gpt-4o', 'chat.completions', async () => ({
                usage: { prompt_tokens: 10, completion_tokens: 5 },
                choices: [
                    {
                        message: { content: 'Contact user@example.com for details' },
                        finish_reason: 'stop',
                    },
                ],
            }));
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.response?.content).toBe('Contact user@example.com for details');
        });
        it('includes custom metadata', async () => {
            const monitor = createMonitor({ metadata: { env: 'test' } });
            await monitor.trace('openai', 'gpt-4o', 'chat.completions', async () => ({ usage: { prompt_tokens: 1, completion_tokens: 1 } }), { metadata: { requestId: 'abc123' } });
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.metadata).toEqual({ env: 'test', requestId: 'abc123' });
        });
        it('uses custom token extractor when provided', async () => {
            const monitor = createMonitor();
            await monitor.trace('custom', 'my-model', 'generate', async () => ({ tokenCount: { in: 42, out: 17 } }), {
                extractTokens: (result) => ({
                    input: result.tokenCount.in,
                    output: result.tokenCount.out,
                }),
            });
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.tokens.input).toBe(42);
            expect(event.tokens.output).toBe(17);
            expect(event.tokens.total).toBe(59);
        });
    });
    describe('sample rate', () => {
        it('captures all events when sampleRate is 1', async () => {
            const monitor = createMonitor({ sampleRate: 1 });
            for (let i = 0; i < 5; i++) {
                await monitor.trace('openai', 'gpt-4o', 'test', async () => ({}));
            }
            await monitor.shutdown();
            const totalEvents = capturedRequests.reduce((sum, r) => sum + r.body.events.length, 0);
            expect(totalEvents).toBe(5);
        });
        it('captures no events when sampleRate is 0', async () => {
            const monitor = createMonitor({ sampleRate: 0 });
            for (let i = 0; i < 10; i++) {
                await monitor.trace('openai', 'gpt-4o', 'test', async () => ({}));
            }
            await monitor.shutdown();
            const totalEvents = capturedRequests.reduce((sum, r) => sum + r.body.events.length, 0);
            expect(totalEvents).toBe(0);
        });
        it('samples probabilistically between 0 and 1', async () => {
            // Use a fixed seed-like approach: mock Math.random
            let callCount = 0;
            const originalRandom = Math.random;
            Math.random = () => {
                callCount++;
                // Alternate: 0.1, 0.6, 0.1, 0.6, ... (50% below 0.5 threshold)
                return callCount % 2 === 1 ? 0.1 : 0.6;
            };
            try {
                const monitor = createMonitor({ sampleRate: 0.5 });
                for (let i = 0; i < 10; i++) {
                    await monitor.trace('openai', 'gpt-4o', 'test', async () => ({}));
                }
                await monitor.shutdown();
                const totalEvents = capturedRequests.reduce((sum, r) => sum + r.body.events.length, 0);
                // With our mock, exactly 5 out of 10 should be sampled
                expect(totalEvents).toBe(5);
            }
            finally {
                Math.random = originalRandom;
            }
        });
    });
    describe('convenience wrappers', () => {
        it('traceOpenAI sets provider and endpoint', async () => {
            const monitor = createMonitor();
            await monitor.traceOpenAI('gpt-4o', async () => ({
                usage: { prompt_tokens: 10, completion_tokens: 5 },
            }));
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.provider).toBe('openai');
            expect(event.endpoint).toBe('chat.completions');
        });
        it('traceAnthropic sets provider and endpoint', async () => {
            const monitor = createMonitor();
            await monitor.traceAnthropic('claude-sonnet-4-20250514', async () => ({
                usage: { input_tokens: 10, output_tokens: 5 },
            }));
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.provider).toBe('anthropic');
            expect(event.endpoint).toBe('messages.create');
        });
    });
    describe('resilience', () => {
        it('does not throw when transport fails', async () => {
            globalThis.fetch = vi.fn(async () => {
                throw new Error('Network error');
            });
            const monitor = createMonitor();
            // Should not throw despite transport failure
            const result = await monitor.trace('openai', 'gpt-4o', 'test', async () => {
                return { data: 'success' };
            });
            expect(result).toEqual({ data: 'success' });
            await monitor.shutdown();
        });
        it('sends to the correct collector URL', async () => {
            const monitor = createMonitor({ collectorUrl: 'https://telemetry.example.com' });
            await monitor.trace('openai', 'gpt-4o', 'test', async () => ({}));
            await monitor.shutdown();
            expect(capturedRequests[0].url).toBe('https://telemetry.example.com/v1/traces');
        });
        it('strips trailing slashes from collector URL', async () => {
            const monitor = createMonitor({ collectorUrl: 'https://telemetry.example.com/' });
            await monitor.trace('openai', 'gpt-4o', 'test', async () => ({}));
            await monitor.shutdown();
            expect(capturedRequests[0].url).toBe('https://telemetry.example.com/v1/traces');
        });
    });
    describe('record', () => {
        it('manually records a trace event', async () => {
            const monitor = createMonitor();
            monitor.record({
                traceId: 'trace-1',
                spanId: 'span-1',
                duration: 150,
                provider: 'custom',
                model: 'my-model',
                endpoint: 'generate',
                status: 'success',
                tokens: { input: 100, output: 50, total: 150 },
                cost: { input: 0.01, output: 0.02, total: 0.03 },
            });
            await monitor.shutdown();
            const event = capturedRequests[0].body.events[0];
            expect(event.provider).toBe('custom');
            expect(event.model).toBe('my-model');
            expect(event.tokens.total).toBe(150);
            expect(event.id).toBeDefined();
            expect(event.timestamp).toBeDefined();
        });
    });
});
//# sourceMappingURL=monitor.test.js.map