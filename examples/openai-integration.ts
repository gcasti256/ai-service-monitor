/**
 * OpenAI Integration Example
 *
 * Shows how to wrap real OpenAI SDK calls with monitoring. The monitor
 * sits transparently around your existing code — no changes to your
 * AI logic, just wrap the call in monitor.traceOpenAI().
 *
 * Prerequisites:
 *   1. Start the collector: cd packages/server && npm run dev
 *   2. Set your API key: export OPENAI_API_KEY=sk-...
 *   3. Run: npx tsx examples/openai-integration.ts
 *
 * Note: This example uses a mock OpenAI client for demonstration.
 *       Replace MockOpenAI with the real `openai` package in production.
 */

import { AIMonitor } from '../packages/sdk/src/index.js';

// ---------------------------------------------------------------------------
// Mock OpenAI client (replace with `import OpenAI from 'openai'` in production)
// ---------------------------------------------------------------------------

class MockOpenAI {
  chat = {
    completions: {
      create: async (params: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        max_tokens?: number;
      }) => {
        // Simulate network latency (100-400ms)
        const latency = 100 + Math.random() * 300;
        await new Promise((r) => setTimeout(r, latency));

        // Simulate occasional errors (10% chance)
        if (Math.random() < 0.1) {
          const error = new Error('Rate limit exceeded') as Error & { status: number; type: string };
          error.status = 429;
          error.type = 'rate_limit_error';
          throw error;
        }

        const promptTokens = params.messages.reduce(
          (sum, m) => sum + Math.ceil(m.content.length / 4),
          0,
        );
        const completionTokens = 20 + Math.floor(Math.random() * 80);

        return {
          id: `chatcmpl-${crypto.randomUUID().slice(0, 8)}`,
          object: 'chat.completion' as const,
          created: Math.floor(Date.now() / 1000),
          model: params.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant' as const,
                content: `This is a simulated response to: "${params.messages.at(-1)?.content}"`,
              },
              finish_reason: 'stop' as const,
            },
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          },
        };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const openai = new MockOpenAI();
// In production: const openai = new OpenAI();

const monitor = new AIMonitor({
  collectorUrl: 'http://localhost:3100',
  enablePiiMasking: true,
  batchSize: 5,
  flushInterval: 3000,
  metadata: {
    service: 'openai-example',
    environment: 'development',
  },
});

// ---------------------------------------------------------------------------
// Pattern 1: Simple wrapper with traceOpenAI()
// ---------------------------------------------------------------------------

async function simpleChat(userMessage: string) {
  console.log(`\nUser: ${userMessage}`);

  const response = await monitor.traceOpenAI('gpt-4o', async () => {
    return openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
    });
  });

  console.log(`Assistant: ${response.choices[0].message.content}`);
  console.log(`Tokens: ${response.usage.total_tokens}`);

  return response;
}

// ---------------------------------------------------------------------------
// Pattern 2: With custom metadata per-call
// ---------------------------------------------------------------------------

async function chatWithMetadata(userMessage: string, userId: string) {
  console.log(`\n[User ${userId}]: ${userMessage}`);

  const response = await monitor.traceOpenAI(
    'gpt-4o-mini',
    async () => {
      return openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 100,
      });
    },
    {
      metadata: {
        userId,
        feature: 'chat',
        requestType: 'user-query',
      },
    },
  );

  console.log(`Assistant: ${response.choices[0].message.content}`);
  return response;
}

// ---------------------------------------------------------------------------
// Pattern 3: Multi-turn conversation with trace correlation
// ---------------------------------------------------------------------------

async function multiTurnConversation() {
  console.log('\n--- Multi-Turn Conversation ---');

  const traceId = crypto.randomUUID();
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: 'You are a knowledgeable travel advisor.' },
  ];

  const turns = [
    'What are the best places to visit in Japan?',
    'Tell me more about Kyoto.',
    'What is the best time of year to visit?',
  ];

  for (const userMessage of turns) {
    messages.push({ role: 'user', content: userMessage });
    console.log(`\nUser: ${userMessage}`);

    const response = await monitor.traceOpenAI(
      'gpt-4o',
      async () => {
        return openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [...messages],
          temperature: 0.8,
        });
      },
      { traceId },
    );

    const reply = response.choices[0].message.content;
    messages.push({ role: 'assistant', content: reply });
    console.log(`Assistant: ${reply}`);
  }

  console.log(`\nAll ${turns.length} turns linked under trace ID: ${traceId}`);
}

// ---------------------------------------------------------------------------
// Pattern 4: Error handling with monitoring
// ---------------------------------------------------------------------------

async function resilientCall(userMessage: string, maxRetries = 3) {
  console.log(`\n--- Resilient Call (max ${maxRetries} retries) ---`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await monitor.traceOpenAI(
        'gpt-4o',
        async () => {
          return openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: userMessage }],
          });
        },
        {
          metadata: { attempt, maxRetries },
        },
      );

      console.log(`Success on attempt ${attempt}`);
      return response;
    } catch (err) {
      // The error is recorded in the trace automatically.
      // Your retry logic is separate from monitoring.
      console.log(`Attempt ${attempt} failed: ${(err as Error).message}`);

      if (attempt === maxRetries) {
        console.log('All retries exhausted.');
        throw err;
      }

      // Exponential backoff
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ---------------------------------------------------------------------------
// Run all patterns
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== AI Service Monitor — OpenAI Integration Example ===');

  // Pattern 1: Simple wrapper
  await simpleChat('What is the capital of France?');

  // Pattern 2: With metadata
  await chatWithMetadata('Explain quantum computing in one sentence.', 'user-42');

  // Pattern 3: Multi-turn
  await multiTurnConversation();

  // Pattern 4: Resilient with retries
  try {
    await resilientCall('Tell me a joke.');
  } catch {
    console.log('(Expected: some calls may fail in the mock)');
  }

  // Flush all events
  await monitor.shutdown();
  console.log('\nAll telemetry flushed. View traces at http://localhost:5173');
}

main().catch(console.error);
