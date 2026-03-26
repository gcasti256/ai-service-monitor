/**
 * Basic Monitoring Example
 *
 * Demonstrates how to use the @ai-monitor/sdk to instrument AI service calls
 * with automatic latency tracking, token counting, cost estimation, and PII masking.
 *
 * Prerequisites:
 *   1. Start the collector server: cd packages/server && npm run dev
 *   2. Run this example: npx tsx examples/basic-monitoring.ts
 */

import { AIMonitor, maskPii, estimateCost } from '../packages/sdk/src/index.js';

// ---------------------------------------------------------------------------
// 1. Initialize the monitor
// ---------------------------------------------------------------------------

const monitor = new AIMonitor({
  // Point to your running collector server
  collectorUrl: 'http://localhost:3100',

  // PII masking is enabled by default — emails, SSNs, credit cards, phones,
  // and IP addresses are redacted before telemetry leaves your application.
  enablePiiMasking: true,

  // Batching: accumulate up to 10 events before flushing to the collector.
  // Events are also flushed every 5 seconds automatically.
  batchSize: 10,
  flushInterval: 5000,

  // Capture 100% of calls. Set to 0.1 for 10% sampling in high-traffic services.
  sampleRate: 1.0,

  // Metadata attached to every trace — useful for filtering in the dashboard.
  metadata: {
    service: 'example-app',
    environment: 'development',
    version: '1.0.0',
  },
});

// ---------------------------------------------------------------------------
// 2. Trace a simulated AI call
// ---------------------------------------------------------------------------

async function simulateOpenAICall() {
  console.log('Tracing a simulated OpenAI call...');

  // monitor.trace() wraps your AI call and captures telemetry automatically.
  // The return value is the exact result of your function — unmodified.
  const result = await monitor.trace(
    'openai',          // provider
    'gpt-4o',          // model
    '/chat/completions', // endpoint
    async () => {
      // Simulate network latency
      await new Promise((r) => setTimeout(r, 150));

      // Return a mock OpenAI response shape — the SDK auto-extracts tokens
      return {
        id: 'chatcmpl-abc123',
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'The capital of France is Paris.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 8,
          total_tokens: 23,
        },
      };
    },
  );

  console.log('AI response:', result.choices[0].message.content);
  console.log('Tokens used:', result.usage.total_tokens);
}

// ---------------------------------------------------------------------------
// 3. Trace an Anthropic call using the convenience wrapper
// ---------------------------------------------------------------------------

async function simulateAnthropicCall() {
  console.log('\nTracing a simulated Anthropic call...');

  const result = await monitor.traceAnthropic(
    'claude-sonnet-4-20250514',
    async () => {
      await new Promise((r) => setTimeout(r, 200));

      // Mock Anthropic response shape — SDK auto-extracts tokens
      return {
        id: 'msg_abc123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 9 },
      };
    },
  );

  console.log('AI response:', result.content[0].text);
}

// ---------------------------------------------------------------------------
// 4. Trace an error scenario
// ---------------------------------------------------------------------------

async function simulateErrorCall() {
  console.log('\nTracing a call that will fail...');

  try {
    await monitor.trace('openai', 'gpt-4o', '/chat/completions', async () => {
      await new Promise((r) => setTimeout(r, 50));
      throw new Error('Rate limit exceeded: retry after 30s');
    });
  } catch (err) {
    // The error is re-thrown — your app handles it normally.
    // The SDK records the error details (message, type, stack) in the trace.
    console.log('Caught expected error:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// 5. Demonstrate PII masking utility
// ---------------------------------------------------------------------------

function demonstratePiiMasking() {
  console.log('\n--- PII Masking Demo ---');

  const text = 'Send invoice to john.doe@acme.com. CC: 4111-1111-1111-1111. SSN: 123-45-6789.';
  const masked = maskPii(text);

  console.log('Original:', text);
  console.log('Masked:  ', masked);
  // Output: Send invoice to [REDACTED_EMAIL]. CC: [REDACTED_CC]. SSN: [REDACTED_SSN].
}

// ---------------------------------------------------------------------------
// 6. Demonstrate cost estimation
// ---------------------------------------------------------------------------

function demonstrateCostEstimation() {
  console.log('\n--- Cost Estimation Demo ---');

  const models = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-20250514', 'claude-haiku-3-5-20241022'];

  for (const model of models) {
    const cost = estimateCost(model, 1000, 500); // 1000 input, 500 output tokens
    console.log(`${model}: $${cost.total.toFixed(6)} (in: $${cost.input.toFixed(6)}, out: $${cost.output.toFixed(6)})`);
  }
}

// ---------------------------------------------------------------------------
// 7. Multi-step trace propagation (agent flow)
// ---------------------------------------------------------------------------

async function simulateAgentFlow() {
  console.log('\n--- Multi-Step Agent Flow ---');

  const traceId = crypto.randomUUID();
  console.log('Trace ID:', traceId);

  // Step 1: Planning call
  const planResult = await monitor.trace(
    'openai',
    'gpt-4o',
    '/chat/completions',
    async () => {
      await new Promise((r) => setTimeout(r, 100));
      return {
        choices: [{ message: { content: 'Plan: search the web, then summarize.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        _spanId: 'step-1', // Not part of OpenAI response; just for demo
      };
    },
    { traceId },
  );
  console.log('Step 1 (plan):', planResult.choices[0].message.content);

  // Step 2: Execution call — linked to step 1 via parentSpanId
  const execResult = await monitor.trace(
    'anthropic',
    'claude-sonnet-4-20250514',
    '/messages',
    async () => {
      await new Promise((r) => setTimeout(r, 180));
      return {
        content: [{ type: 'text', text: 'Here is the summary of the search results...' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 200, output_tokens: 150 },
      };
    },
    { traceId, parentSpanId: 'step-1' },
  );
  console.log('Step 2 (execute):', execResult.content[0].text.slice(0, 50) + '...');

  console.log('Both steps are linked by trace ID — view them together in the dashboard.');
}

// ---------------------------------------------------------------------------
// Run everything
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== AI Service Monitor — Basic Monitoring Example ===\n');

  await simulateOpenAICall();
  await simulateAnthropicCall();
  await simulateErrorCall();
  demonstratePiiMasking();
  demonstrateCostEstimation();
  await simulateAgentFlow();

  // Gracefully shut down — flushes all pending events to the collector
  await monitor.shutdown();

  console.log('\nAll events flushed. Check the dashboard at http://localhost:5173');
}

main().catch(console.error);
