import type { MonitorConfig, TraceEvent } from './types.js';
import { Transport } from './transport.js';
import { estimateCost } from './cost.js';
import { maskPii, maskMessages, maskObject } from './pii.js';
import {
  extractOpenAITokens,
  extractAnthropicTokens,
  extractOpenAIResponse,
  extractAnthropicResponse,
} from './extractors.js';

interface ResolvedConfig {
  collectorUrl: string;
  apiKey?: string;
  batchSize: number;
  flushInterval: number;
  enablePiiMasking: boolean;
  includeStackTraces: boolean;
  sampleRate: number;
  metadata: Record<string, unknown>;
}

export interface TraceOptions<T> {
  traceId?: string;
  parentSpanId?: string;
  metadata?: Record<string, unknown>;
  extractTokens?: (result: T) => { input: number; output: number };
  extractResponse?: (result: T) => { content?: string; finishReason?: string };
}

export class AIMonitor {
  private config: ResolvedConfig;
  private transport: Transport;

  constructor(config: MonitorConfig) {
    const batchSize = config.batchSize ?? 10;
    const flushInterval = config.flushInterval ?? 5000;

    if (batchSize < 1) throw new Error('batchSize must be >= 1');
    if (flushInterval < 100) throw new Error('flushInterval must be >= 100ms');

    this.config = {
      collectorUrl: config.collectorUrl.replace(/\/+$/, ''),
      apiKey: config.apiKey,
      batchSize,
      flushInterval,
      enablePiiMasking: config.enablePiiMasking ?? true,
      includeStackTraces: config.includeStackTraces ?? false,
      sampleRate: Math.min(1, Math.max(0, config.sampleRate ?? 1)),
      metadata: config.metadata ?? {},
    };

    this.transport = new Transport(
      this.config.collectorUrl,
      this.config.batchSize,
      this.config.flushInterval,
      this.config.apiKey,
    );
  }

  /**
   * Wrap an async AI call with monitoring. The wrapped function executes
   * normally and its result is returned unmodified. Telemetry is sent
   * asynchronously in the background.
   */
  async trace<T>(
    provider: TraceEvent['provider'],
    model: string,
    endpoint: string,
    fn: () => Promise<T>,
    options?: TraceOptions<T>,
  ): Promise<T> {
    if (!this.shouldSample()) {
      return fn();
    }

    const traceId = options?.traceId ?? crypto.randomUUID();
    const spanId = crypto.randomUUID();
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    let result: T;
    let error: { message: string; type: string; stack?: string } | undefined;
    let status: 'success' | 'error' = 'success';

    try {
      result = await fn();
    } catch (err) {
      status = 'error';
      error = {
        message: err instanceof Error ? err.message : String(err),
        type: err instanceof Error ? err.constructor.name : 'UnknownError',
        stack: this.config.includeStackTraces && err instanceof Error ? err.stack : undefined,
      };
      throw err;
    } finally {
      const duration = Math.round((performance.now() - startTime) * 100) / 100;

      const tokens = this.extractTokens(
        provider,
        status === 'success' ? result! : undefined,
        options,
      );

      const cost = estimateCost(model, tokens.input, tokens.output);

      const response = this.extractResponseContent(
        provider,
        status === 'success' ? result! : undefined,
        options,
      );

      const mergedMetadata = {
        ...this.config.metadata,
        ...options?.metadata,
      };

      const event: TraceEvent = {
        id: crypto.randomUUID(),
        traceId,
        spanId,
        parentSpanId: options?.parentSpanId,
        timestamp,
        duration,
        provider,
        model,
        endpoint,
        status,
        error,
        tokens: {
          input: tokens.input,
          output: tokens.output,
          total: tokens.input + tokens.output,
        },
        cost,
        metadata: this.config.enablePiiMasking ? maskObject(mergedMetadata) : mergedMetadata,
        response: response
          ? {
              content: this.config.enablePiiMasking && response.content
                ? maskPii(response.content)
                : response.content,
              finishReason: response.finishReason,
              responseLength: response.content?.length,
            }
          : undefined,
      };

      try {
        this.transport.send(event);
      } catch {
        // Silently swallow transport errors
      }
    }

    return result!;
  }

  async traceOpenAI<T>(
    model: string,
    fn: () => Promise<T>,
    options?: TraceOptions<T>,
  ): Promise<T> {
    return this.trace('openai', model, 'chat.completions', fn, options);
  }

  async traceAnthropic<T>(
    model: string,
    fn: () => Promise<T>,
    options?: TraceOptions<T>,
  ): Promise<T> {
    return this.trace('anthropic', model, 'messages.create', fn, options);
  }

  /**
   * Manually record a pre-built trace event.
   * Useful for integrating with custom providers or replay scenarios.
   */
  record(event: Omit<TraceEvent, 'id' | 'timestamp'>): void {
    if (!this.shouldSample()) return;

    const fullEvent: TraceEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    if (this.config.enablePiiMasking) {
      if (fullEvent.response?.content) {
        fullEvent.response.content = maskPii(fullEvent.response.content);
      }
      if (fullEvent.request?.messages) {
        fullEvent.request.messages = maskMessages(fullEvent.request.messages);
      }
      if (fullEvent.metadata) {
        fullEvent.metadata = maskObject(fullEvent.metadata);
      }
    }

    try {
      this.transport.send(fullEvent);
    } catch {
      // Silently swallow
    }
  }

  async shutdown(): Promise<void> {
    await this.transport.shutdown();
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate;
  }

  private extractTokens<T>(
    provider: TraceEvent['provider'],
    result: T | undefined,
    options?: TraceOptions<T>,
  ): { input: number; output: number } {
    if (result === undefined) {
      return { input: 0, output: 0 };
    }

    if (options?.extractTokens) {
      try {
        return options.extractTokens(result);
      } catch {
        return { input: 0, output: 0 };
      }
    }

    if (provider === 'openai') {
      return extractOpenAITokens(result) ?? { input: 0, output: 0 };
    }

    if (provider === 'anthropic') {
      return extractAnthropicTokens(result) ?? { input: 0, output: 0 };
    }

    return { input: 0, output: 0 };
  }

  private extractResponseContent<T>(
    provider: TraceEvent['provider'],
    result: T | undefined,
    options?: TraceOptions<T>,
  ): { content?: string; finishReason?: string } | null {
    if (result === undefined) {
      return null;
    }

    if (options?.extractResponse) {
      try {
        return options.extractResponse(result);
      } catch {
        return null;
      }
    }

    if (provider === 'openai') {
      return extractOpenAIResponse(result);
    }

    if (provider === 'anthropic') {
      return extractAnthropicResponse(result);
    }

    return null;
  }
}
