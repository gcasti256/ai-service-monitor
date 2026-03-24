/**
 * @ai-monitor/sdk — Lightweight monitoring SDK for AI/LLM service calls.
 *
 * Wraps OpenAI and Anthropic SDK calls to capture telemetry including
 * latency, token usage, cost estimation, and error tracking.
 *
 * @example
 * ```typescript
 * import { AIMonitor } from '@ai-monitor/sdk';
 *
 * const monitor = new AIMonitor({
 *   collectorUrl: 'http://localhost:3000',
 * });
 *
 * const result = await monitor.traceOpenAI('gpt-4o', () =>
 *   openai.chat.completions.create({ model: 'gpt-4o', messages: [...] })
 * );
 * ```
 */

// Main monitor class
export { AIMonitor } from './monitor.js';
export type { TraceOptions } from './monitor.js';

// Types
export type {
  MonitorConfig,
  TraceEvent,
  AlertRule,
  AlertEvent,
  DashboardStats,
  TimeseriesPoint,
  ModelBreakdown,
} from './types.js';

// PII masking utilities
export { maskPii, maskMessages, maskObject } from './pii.js';

// Cost estimation
export { estimateCost, MODEL_PRICING } from './cost.js';

// Response extractors (advanced usage)
export {
  extractOpenAITokens,
  extractAnthropicTokens,
  extractOpenAIResponse,
  extractAnthropicResponse,
} from './extractors.js';
