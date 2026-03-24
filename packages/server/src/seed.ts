/**
 * Seed script — generates realistic demo data for the AI Service Monitor dashboard.
 *
 * Run with: tsx src/seed.ts
 *
 * Generates 500+ traces over the last 7 days with realistic distributions
 * across multiple models and providers.
 */

import { db } from './db.js';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOTAL_TRACES = 600;
const DAYS_BACK = 7;
const ERROR_RATE = 0.05; // 5% errors

interface ModelConfig {
  model: string;
  provider: string;
  endpoint: string;
  meanLatency: number;
  stdLatency: number;
  inputTokenRange: [number, number];
  outputTokenRange: [number, number];
  costPerInputToken: number;
  costPerOutputToken: number;
  weight: number; // relative frequency
}

const MODELS: ModelConfig[] = [
  {
    model: 'gpt-4o',
    provider: 'openai',
    endpoint: '/chat/completions',
    meanLatency: 800,
    stdLatency: 250,
    inputTokenRange: [200, 2000],
    outputTokenRange: [100, 1500],
    costPerInputToken: 0.000005, // $5/1M input
    costPerOutputToken: 0.000015, // $15/1M output
    weight: 3,
  },
  {
    model: 'gpt-4o-mini',
    provider: 'openai',
    endpoint: '/chat/completions',
    meanLatency: 200,
    stdLatency: 80,
    inputTokenRange: [100, 1500],
    outputTokenRange: [50, 800],
    costPerInputToken: 0.00000015, // $0.15/1M input
    costPerOutputToken: 0.0000006, // $0.60/1M output
    weight: 5,
  },
  {
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    endpoint: '/messages',
    meanLatency: 1200,
    stdLatency: 350,
    inputTokenRange: [300, 2000],
    outputTokenRange: [150, 1500],
    costPerInputToken: 0.000003, // $3/1M input
    costPerOutputToken: 0.000015, // $15/1M output
    weight: 4,
  },
  {
    model: 'claude-haiku-3-5-20241022',
    provider: 'anthropic',
    endpoint: '/messages',
    meanLatency: 400,
    stdLatency: 120,
    inputTokenRange: [100, 1200],
    outputTokenRange: [50, 600],
    costPerInputToken: 0.0000008, // $0.80/1M input
    costPerOutputToken: 0.000004, // $4/1M output
    weight: 4,
  },
];

const ERROR_TYPES = [
  { type: 'RateLimitError', message: 'Rate limit exceeded. Please retry after 30 seconds.' },
  { type: 'TimeoutError', message: 'Request timed out after 60000ms.' },
  { type: 'InvalidRequestError', message: 'Invalid model parameter: model not found.' },
  {
    type: 'AuthenticationError',
    message: 'Invalid API key provided. Check your credentials.',
  },
  {
    type: 'ServerError',
    message: 'Internal server error. The server had an error processing your request.',
  },
  {
    type: 'ContentFilterError',
    message: 'Content was blocked by the safety filter.',
  },
];

const FINISH_REASONS = ['stop', 'stop', 'stop', 'stop', 'length', 'stop'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Box-Muller transform for normally distributed random numbers. */
function normalRandom(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, mean + z * std);
}

/** Uniform random integer in [min, max]. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Select a model config based on weighted distribution. */
function pickModel(): ModelConfig {
  const totalWeight = MODELS.reduce((sum, m) => sum + m.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const model of MODELS) {
    roll -= model.weight;
    if (roll <= 0) return model;
  }
  return MODELS[MODELS.length - 1];
}

/** Generate a random timestamp within the last N days, with realistic daily patterns. */
function randomTimestamp(daysBack: number): Date {
  const now = Date.now();
  const start = now - daysBack * 24 * 60 * 60 * 1000;
  const ts = start + Math.random() * (now - start);
  const date = new Date(ts);

  // Bias toward working hours (8am-8pm UTC) — 70% of traffic in those hours
  if (Math.random() < 0.7) {
    const hour = 8 + Math.floor(Math.random() * 12);
    date.setUTCHours(hour, randInt(0, 59), randInt(0, 59), randInt(0, 999));
  }

  return date;
}

// ---------------------------------------------------------------------------
// Seed Logic
// ---------------------------------------------------------------------------

function seed() {
  console.info('Seeding demo data...');

  // Clear existing data
  db.exec('DELETE FROM alert_events');
  db.exec('DELETE FROM alert_rules');
  db.exec('DELETE FROM traces');

  const insertStmt = db.prepare(`
    INSERT INTO traces (id, trace_id, span_id, parent_span_id, timestamp, duration,
      provider, model, endpoint, status, status_code, error_message, error_type,
      tokens_input, tokens_output, tokens_total, cost_input, cost_output, cost_total,
      request_body, response_body, response_length, finish_reason, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((traces: unknown[][]) => {
    for (const params of traces) {
      insertStmt.run(...params);
    }
  });

  const traceRows: unknown[][] = [];

  // Track how many we create as standalone vs multi-span
  let singleSpanCount = 0;
  let multiSpanGroupCount = 0;

  let i = 0;
  while (i < TOTAL_TRACES) {
    // 20% chance of a multi-span trace group (2-4 spans)
    const isMultiSpan = Math.random() < 0.2;

    if (isMultiSpan) {
      const spanCount = randInt(2, 4);
      const traceId = crypto.randomUUID();
      const baseTime = randomTimestamp(DAYS_BACK);
      const config = pickModel();
      let parentSpanId: string | null = null;

      for (let s = 0; s < spanCount && i < TOTAL_TRACES; s++) {
        const spanId = crypto.randomUUID();
        const isError = s === spanCount - 1 && Math.random() < ERROR_RATE;
        const duration = normalRandom(config.meanLatency / spanCount, config.stdLatency / 2);
        const spanTime = new Date(baseTime.getTime() + s * duration);

        const tokensInput = randInt(...config.inputTokenRange);
        const tokensOutput = isError ? 0 : randInt(...config.outputTokenRange);
        const tokensTotal = tokensInput + tokensOutput;
        const costInput = tokensInput * config.costPerInputToken;
        const costOutput = tokensOutput * config.costPerOutputToken;
        const costTotal = costInput + costOutput;

        const error = isError ? pick(ERROR_TYPES) : null;
        const statusCode = isError ? pick([429, 500, 503, 400, 401]) : 200;

        traceRows.push([
          crypto.randomUUID(),
          traceId,
          spanId,
          parentSpanId,
          spanTime.toISOString(),
          Math.round(duration * 100) / 100,
          config.provider,
          config.model,
          config.endpoint,
          isError ? 'error' : 'success',
          statusCode,
          error?.message || null,
          error?.type || null,
          tokensInput,
          tokensOutput,
          tokensTotal,
          Math.round(costInput * 1e8) / 1e8,
          Math.round(costOutput * 1e8) / 1e8,
          Math.round(costTotal * 1e8) / 1e8,
          JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: 'Sample prompt for seeding' }],
          }),
          isError ? null : 'Sample response content for seeding.',
          isError ? null : randInt(50, 2000),
          isError ? null : pick(FINISH_REASONS),
          JSON.stringify({
            service: 'demo-app',
            environment: pick(['production', 'staging']),
            spanIndex: s,
            spanCount,
          }),
        ]);

        parentSpanId = spanId;
        i++;
      }
      multiSpanGroupCount++;
    } else {
      // Single-span trace
      const config = pickModel();
      const traceId = crypto.randomUUID();
      const spanId = crypto.randomUUID();
      const timestamp = randomTimestamp(DAYS_BACK);
      const isError = Math.random() < ERROR_RATE;
      const duration = normalRandom(config.meanLatency, config.stdLatency);

      const tokensInput = randInt(...config.inputTokenRange);
      const tokensOutput = isError ? 0 : randInt(...config.outputTokenRange);
      const tokensTotal = tokensInput + tokensOutput;
      const costInput = tokensInput * config.costPerInputToken;
      const costOutput = tokensOutput * config.costPerOutputToken;
      const costTotal = costInput + costOutput;

      const error = isError ? pick(ERROR_TYPES) : null;
      const statusCode = isError ? pick([429, 500, 503, 400, 401]) : 200;

      traceRows.push([
        crypto.randomUUID(),
        traceId,
        spanId,
        null,
        timestamp.toISOString(),
        Math.round(duration * 100) / 100,
        config.provider,
        config.model,
        config.endpoint,
        isError ? 'error' : 'success',
        statusCode,
        error?.message || null,
        error?.type || null,
        tokensInput,
        tokensOutput,
        tokensTotal,
        Math.round(costInput * 1e8) / 1e8,
        Math.round(costOutput * 1e8) / 1e8,
        Math.round(costTotal * 1e8) / 1e8,
        JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Sample prompt for seeding' }],
        }),
        isError ? null : 'Sample response content for seeding.',
        isError ? null : randInt(50, 2000),
        isError ? null : pick(FINISH_REASONS),
        JSON.stringify({
          service: 'demo-app',
          environment: pick(['production', 'staging']),
        }),
      ]);

      singleSpanCount++;
      i++;
    }
  }

  // Insert all traces in a single transaction
  insertMany(traceRows);

  console.info(`  Inserted ${traceRows.length} trace spans`);
  console.info(`    - ${singleSpanCount} single-span traces`);
  console.info(`    - ${multiSpanGroupCount} multi-span trace groups`);

  // ---------------------------------------------------------------------------
  // Seed Alert Rules
  // ---------------------------------------------------------------------------

  const now = new Date().toISOString();

  const alertRules = [
    {
      id: crypto.randomUUID(),
      name: 'High Latency Alert',
      metric: 'latency',
      operator: 'gt',
      threshold: 2000,
      window_minutes: 5,
      webhook_url: null,
      enabled: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: crypto.randomUUID(),
      name: 'Error Rate Spike',
      metric: 'error_rate',
      operator: 'gt',
      threshold: 10,
      window_minutes: 10,
      webhook_url: null,
      enabled: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: crypto.randomUUID(),
      name: 'Daily Cost Cap',
      metric: 'cost',
      operator: 'gt',
      threshold: 50,
      window_minutes: 1440,
      webhook_url: null,
      enabled: 1,
      created_at: now,
      updated_at: now,
    },
  ];

  const insertRule = db.prepare(`
    INSERT INTO alert_rules (id, name, metric, operator, threshold, window_minutes, webhook_url, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const rule of alertRules) {
    insertRule.run(
      rule.id,
      rule.name,
      rule.metric,
      rule.operator,
      rule.threshold,
      rule.window_minutes,
      rule.webhook_url,
      rule.enabled,
      rule.created_at,
      rule.updated_at,
    );
  }

  console.info(`  Created ${alertRules.length} alert rules`);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  const stats = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
        ROUND(AVG(duration), 1) as avg_latency,
        ROUND(SUM(cost_total), 4) as total_cost,
        SUM(tokens_total) as total_tokens,
        COUNT(DISTINCT model) as models
      FROM traces`,
    )
    .get() as Record<string, unknown>;

  console.info('\nSeed summary:');
  console.info(`  Total traces:   ${stats.total}`);
  console.info(`  Errors:         ${stats.errors} (${(((stats.errors as number) / (stats.total as number)) * 100).toFixed(1)}%)`);
  console.info(`  Avg latency:    ${stats.avg_latency}ms`);
  console.info(`  Total cost:     $${stats.total_cost}`);
  console.info(`  Total tokens:   ${stats.total_tokens}`);
  console.info(`  Models used:    ${stats.models}`);
  console.info(`  Alert rules:    ${alertRules.length}`);
  console.info('\nDone.');
}

seed();
