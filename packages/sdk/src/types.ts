/**
 * Core type definitions for the AI service monitoring SDK.
 */

/** A single traced AI/LLM service call. */
export interface TraceEvent {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  timestamp: string;
  duration: number; // ms
  provider: 'openai' | 'anthropic' | 'custom';
  model: string;
  endpoint: string;
  status: 'success' | 'error';
  statusCode?: number;
  error?: {
    message: string;
    type: string;
    stack?: string;
  };
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: {
    input: number;
    output: number;
    total: number;
  };
  metadata?: Record<string, unknown>;
  request?: {
    messages?: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  };
  response?: {
    content?: string;
    finishReason?: string;
    responseLength?: number;
  };
}

/** Configuration for the AIMonitor instance. */
export interface MonitorConfig {
  /** URL of the telemetry collector endpoint. */
  collectorUrl: string;
  /** API key for authenticating with the collector. */
  apiKey?: string;
  /** Number of events to accumulate before flushing. Default: 10. */
  batchSize?: number;
  /** Interval in ms between automatic flushes. Default: 5000. */
  flushInterval?: number;
  /** Whether to mask PII in request/response content. Default: true. */
  enablePiiMasking?: boolean;
  /** Sampling rate from 0 to 1. 1 = capture everything. Default: 1. */
  sampleRate?: number;
  /** Extra metadata attached to every trace event. */
  metadata?: Record<string, unknown>;
}

/** A rule that triggers an alert when a metric crosses a threshold. */
export interface AlertRule {
  id: string;
  name: string;
  metric: 'latency' | 'error_rate' | 'cost' | 'token_usage';
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  threshold: number;
  windowMinutes: number;
  webhookUrl?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** An alert that was triggered by a rule violation. */
export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  currentValue: number;
  threshold: number;
  triggeredAt: string;
  resolved: boolean;
  resolvedAt?: string;
}

/** Aggregate statistics for a time period. */
export interface DashboardStats {
  totalCalls: number;
  avgLatency: number;
  errorRate: number;
  totalCost: number;
  totalTokens: number;
  periodStart: string;
  periodEnd: string;
}

/** A single point in a time-series chart. */
export interface TimeseriesPoint {
  timestamp: string;
  value: number;
  label?: string;
}

/** Per-model usage breakdown. */
export interface ModelBreakdown {
  model: string;
  provider: string;
  calls: number;
  avgLatency: number;
  totalTokens: number;
  totalCost: number;
  errorRate: number;
}
