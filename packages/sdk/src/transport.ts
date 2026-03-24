/**
 * Async transport layer for batching and sending trace events
 * to the telemetry collector.
 *
 * Design principles:
 * - Never blocks the caller — send() is fire-and-forget
 * - Batches events for efficiency
 * - Retries with exponential backoff on transient failures
 * - Drops events on persistent failure rather than growing unbounded
 */

import type { TraceEvent } from './types.js';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_QUEUE_SIZE = 1000;

export class Transport {
  private queue: TraceEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private shutdownRequested = false;

  constructor(
    private readonly collectorUrl: string,
    private readonly batchSize: number,
    private readonly flushInterval: number,
    private readonly apiKey?: string,
  ) {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushInterval);
  }

  /**
   * Enqueue a trace event for delivery. Non-blocking.
   * If the queue is full, the oldest events are dropped.
   */
  send(event: TraceEvent): void {
    if (this.shutdownRequested) {
      return;
    }

    this.queue.push(event);

    // Prevent unbounded memory growth
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }

    // Flush immediately if batch size is reached
    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }

  /**
   * Flush all queued events to the collector.
   * Safe to call concurrently — only one flush runs at a time.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) {
      return;
    }

    this.flushing = true;

    try {
      // Drain the queue into a local batch
      const batch = this.queue.splice(0, this.queue.length);

      await this.sendBatch(batch);
    } catch {
      // Events are dropped on persistent failure — this is intentional.
      // We never want telemetry to interfere with the host application.
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Gracefully shut down: flush remaining events and clear timers.
   */
  async shutdown(): Promise<void> {
    this.shutdownRequested = true;

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();
  }

  /**
   * Send a batch of events with retry + exponential backoff.
   */
  private async sendBatch(batch: TraceEvent[]): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const response = await fetch(`${this.collectorUrl}/v1/traces`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ events: batch }),
        });

        if (response.ok) {
          return; // Success
        }

        // 4xx errors are not retryable (bad request, auth failure, etc.)
        if (response.status >= 400 && response.status < 500) {
          return; // Drop the batch
        }

        // 5xx errors are retryable
        lastError = new Error(`Collector returned ${response.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    // All retries exhausted — drop the batch
    if (lastError) {
      // In a production SDK we might emit a debug event here.
      // For now, we silently drop to avoid interfering with the host app.
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
