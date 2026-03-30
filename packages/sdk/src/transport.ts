import type { TraceEvent } from './types.js';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_QUEUE_SIZE = 1000;

export class Transport {
  private queue: TraceEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private flushPromise: Promise<void> | null = null;
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

  send(event: TraceEvent): void {
    if (this.shutdownRequested) {
      return;
    }

    this.queue.push(event);

    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }

    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      if (this.flushPromise) {
        await this.flushPromise;
      }
      if (this.queue.length > 0 && !this.flushing) {
        return this.flush();
      }
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    this.flushing = true;

    this.flushPromise = (async () => {
      try {
        const batch = this.queue.splice(0, this.queue.length);
        await this.sendBatch(batch);
      } catch {
        // Events are dropped on persistent failure — telemetry must never
        // interfere with the host application.
      } finally {
        this.flushing = false;
        this.flushPromise = null;
      }
    })();

    await this.flushPromise;
  }

  async shutdown(): Promise<void> {
    this.shutdownRequested = true;

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.flushPromise) {
      await this.flushPromise;
    }

    await this.flush();
  }

  private async sendBatch(batch: TraceEvent[]): Promise<void> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const response = await fetch(`${this.collectorUrl}/traces`, {
          method: 'POST',
          headers,
          body: JSON.stringify(batch),
        });

        if (response.ok) {
          return;
        }

        // 4xx errors are not retryable
        if (response.status >= 400 && response.status < 500) {
          return;
        }
      } catch {
        // Network error — retry
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
