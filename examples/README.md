# Examples

Runnable integration scripts demonstrating the AI Service Monitor SDK and API.

## Prerequisites

```bash
# From the project root
npm install

# Start the collector server (terminal 1)
npm run dev:server

# Optionally seed demo data
cd packages/server && npx tsx src/seed.ts
```

## Examples

### [`basic-monitoring.ts`](./basic-monitoring.ts)

Covers the full SDK surface area:

- Initializing `AIMonitor` with configuration options
- Tracing OpenAI and Anthropic calls with automatic token/cost extraction
- Error handling (errors are re-thrown, never swallowed)
- PII masking utility (`maskPii`)
- Cost estimation utility (`estimateCost`)
- Multi-step trace propagation with `traceId` and `parentSpanId`

```bash
npx tsx examples/basic-monitoring.ts
```

### [`openai-integration.ts`](./openai-integration.ts)

Shows real-world OpenAI SDK integration patterns:

- **Simple wrapper** — `monitor.traceOpenAI()` around a chat completion
- **Per-call metadata** — Attach user IDs, feature flags, request types
- **Multi-turn conversations** — Correlate messages with shared `traceId`
- **Resilient calls** — Retry logic with monitoring (each attempt traced separately)

```bash
npx tsx examples/openai-integration.ts
```

> **Tip:** Replace `MockOpenAI` with the real `openai` package and set `OPENAI_API_KEY` to monitor actual API calls.

### [`alert-setup.ts`](./alert-setup.ts)

Demonstrates the alert rule API:

- **Create rules** — Latency threshold, error rate spike, cost budget, token cap
- **List rules** — View all configured rules in a formatted table
- **Evaluate rules** — Manually trigger evaluation against current data
- **View history** — See past alert events with timestamps
- **Manage rules** — Update thresholds, disable/enable rules

```bash
# Seed demo data first for interesting alert results
cd packages/server && npx tsx src/seed.ts
npx tsx examples/alert-setup.ts
```

## Using with Real APIs

To monitor real OpenAI or Anthropic calls, install the provider SDK alongside the monitor:

```bash
npm install openai @ai-monitor/sdk
```

```typescript
import OpenAI from 'openai';
import { AIMonitor } from '@ai-monitor/sdk';

const openai = new OpenAI();
const monitor = new AIMonitor({ collectorUrl: 'http://localhost:3100' });

// Every call is now monitored — latency, tokens, cost, errors
const response = await monitor.traceOpenAI('gpt-4o', () =>
  openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello!' }],
  })
);
```

The SDK auto-detects token counts from the OpenAI response shape and calculates cost based on built-in model pricing tables.
