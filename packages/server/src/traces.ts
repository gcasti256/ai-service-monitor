import { db } from './db.js';
import crypto from 'crypto';

// Types matching the SDK TraceEvent shape but for DB storage
interface TraceInput {
  id?: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  timestamp: string;
  duration: number;
  provider: string;
  model: string;
  endpoint: string;
  status: string;
  statusCode?: number;
  error?: { message: string; type: string; stack?: string };
  tokens: { input: number; output: number; total: number };
  cost: { input: number; output: number; total: number };
  metadata?: Record<string, unknown>;
  request?: Record<string, unknown>;
  response?: { content?: string; finishReason?: string; responseLength?: number };
}

interface TraceFilters {
  startDate?: string;
  endDate?: string;
  model?: string;
  provider?: string;
  status?: string;
  traceId?: string;
  limit?: number;
  offset?: number;
}

export function insertTrace(trace: TraceInput): void {
  const stmt = db.prepare(`
    INSERT INTO traces (id, trace_id, span_id, parent_span_id, timestamp, duration,
      provider, model, endpoint, status, status_code, error_message, error_type,
      tokens_input, tokens_output, tokens_total, cost_input, cost_output, cost_total,
      request_body, response_body, response_length, finish_reason, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    trace.id || crypto.randomUUID(),
    trace.traceId,
    trace.spanId,
    trace.parentSpanId || null,
    trace.timestamp,
    trace.duration,
    trace.provider,
    trace.model,
    trace.endpoint,
    trace.status,
    trace.statusCode || null,
    trace.error?.message || null,
    trace.error?.type || null,
    trace.tokens.input,
    trace.tokens.output,
    trace.tokens.total,
    trace.cost.input,
    trace.cost.output,
    trace.cost.total,
    trace.request ? JSON.stringify(trace.request) : null,
    trace.response?.content || null,
    trace.response?.responseLength || null,
    trace.response?.finishReason || null,
    trace.metadata ? JSON.stringify(trace.metadata) : null,
  );
}

export function insertTraceBatch(traces: TraceInput[]): void {
  const insertMany = db.transaction((items: TraceInput[]) => {
    for (const trace of items) {
      insertTrace(trace);
    }
  });
  insertMany(traces);
}

export function getTraces(filters: TraceFilters = {}): { traces: unknown[]; total: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.startDate) {
    conditions.push('timestamp >= ?');
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push('timestamp <= ?');
    params.push(filters.endDate);
  }
  if (filters.model) {
    conditions.push('model = ?');
    params.push(filters.model);
  }
  if (filters.provider) {
    conditions.push('provider = ?');
    params.push(filters.provider);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.traceId) {
    conditions.push('trace_id = ?');
    params.push(filters.traceId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM traces ${where}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`SELECT * FROM traces ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`);
  const traces = stmt.all(...params, limit, offset);

  return { traces, total };
}

export function getTraceById(id: string) {
  return db.prepare('SELECT * FROM traces WHERE id = ?').get(id);
}

export function getTracesByTraceId(traceId: string) {
  return db.prepare('SELECT * FROM traces WHERE trace_id = ? ORDER BY timestamp ASC').all(traceId);
}

export type { TraceInput, TraceFilters };
