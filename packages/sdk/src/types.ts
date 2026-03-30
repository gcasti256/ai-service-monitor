export interface TraceEvent {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  timestamp: string;
  duration: number;
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

export interface MonitorConfig {
  /** URL of the telemetry collector endpoint. */
  collectorUrl: string;
  /** API key for authenticating with the collector. */
  apiKey?: string;
  /** Number of events to accumulate before flushing. Default: 10. Must be >= 1. */
  batchSize?: number;
  /** Interval in ms between automatic flushes. Default: 5000. Must be >= 100. */
  flushInterval?: number;
  /** Mask PII in request/response content. Default: true. Covers US-format SSNs, NANPA phone numbers, emails, credit cards (Luhn-validated), and IPv4 addresses. */
  enablePiiMasking?: boolean;
  /** Include error stack traces in telemetry. Default: false. Stack traces may contain file paths and usernames — enable only in trusted collector environments. */
  includeStackTraces?: boolean;
  /** Sampling rate from 0 to 1. 1 = capture everything. Default: 1. */
  sampleRate?: number;
  /** Extra metadata attached to every trace event. */
  metadata?: Record<string, unknown>;
}
