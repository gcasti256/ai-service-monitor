import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import {
  insertTrace,
  insertTraceBatch,
  getTraces,
  getTraceById,
  getTracesByTraceId,
} from './traces.js';
import {
  getDashboardStats,
  getLatencyTimeseries,
  getModelBreakdown,
  getCostTimeseries,
  getErrorLog,
} from './stats.js';
import {
  createAlertRule,
  getAlertRules,
  updateAlertRule,
  deleteAlertRule,
  evaluateAlerts,
  getAlertEvents,
} from './alerts.js';
import { cleanupOldTraces, cleanupOldAlertEvents, getDbStats } from './retention.js';

const app = new Hono();

// Middleware
app.use('*', cors());

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Trace Routes ---

const traceSchema = z.object({
  id: z.string().optional(),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  timestamp: z.string(),
  duration: z.number(),
  provider: z.string(),
  model: z.string(),
  endpoint: z.string(),
  status: z.enum(['success', 'error']),
  statusCode: z.number().optional(),
  error: z
    .object({
      message: z.string(),
      type: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
  metadata: z.record(z.unknown()).optional(),
  request: z.record(z.unknown()).optional(),
  response: z
    .object({
      content: z.string().optional(),
      finishReason: z.string().optional(),
      responseLength: z.number().optional(),
    })
    .optional(),
});

// POST /traces - single or batch
app.post('/traces', async (c) => {
  try {
    const body = await c.req.json();

    if (Array.isArray(body)) {
      const parsed = z.array(traceSchema).parse(body);
      insertTraceBatch(parsed);
      return c.json({ ingested: parsed.length }, 201);
    } else {
      const parsed = traceSchema.parse(body);
      insertTrace(parsed);
      return c.json({ ingested: 1 }, 201);
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: err.errors }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /traces
app.get('/traces', (c) => {
  const filters = {
    startDate: c.req.query('startDate'),
    endDate: c.req.query('endDate'),
    model: c.req.query('model'),
    provider: c.req.query('provider'),
    status: c.req.query('status'),
    traceId: c.req.query('traceId'),
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined,
    offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined,
  };

  return c.json(getTraces(filters));
});

// GET /traces/:id
app.get('/traces/:id', (c) => {
  const trace = getTraceById(c.req.param('id'));
  if (!trace) return c.json({ error: 'Trace not found' }, 404);
  return c.json(trace);
});

// GET /traces/by-trace/:traceId
app.get('/traces/by-trace/:traceId', (c) => {
  const traces = getTracesByTraceId(c.req.param('traceId'));
  return c.json(traces);
});

// --- Stats Routes ---

app.get('/stats', (c) => {
  const params = {
    startDate: c.req.query('startDate'),
    endDate: c.req.query('endDate'),
    model: c.req.query('model'),
    provider: c.req.query('provider'),
  };
  return c.json(getDashboardStats(params));
});

app.get('/stats/latency', (c) => {
  const params = {
    startDate: c.req.query('startDate'),
    endDate: c.req.query('endDate'),
  };
  return c.json(getLatencyTimeseries(params));
});

app.get('/stats/models', (c) => {
  const params = {
    startDate: c.req.query('startDate'),
    endDate: c.req.query('endDate'),
  };
  return c.json(getModelBreakdown(params));
});

app.get('/stats/cost', (c) => {
  const params = {
    startDate: c.req.query('startDate'),
    endDate: c.req.query('endDate'),
  };
  return c.json(getCostTimeseries(params));
});

app.get('/stats/errors', (c) => {
  const params = {
    startDate: c.req.query('startDate'),
    endDate: c.req.query('endDate'),
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined,
    offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined,
  };
  return c.json(getErrorLog(params));
});

// --- Alert Routes ---

const alertRuleSchema = z.object({
  name: z.string().min(1),
  metric: z.enum(['latency', 'error_rate', 'cost', 'token_usage']),
  operator: z.enum(['gt', 'lt', 'gte', 'lte']),
  threshold: z.number(),
  windowMinutes: z.number().min(1).optional(),
  webhookUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
});

app.get('/alerts/rules', (c) => {
  return c.json(getAlertRules());
});

app.post('/alerts/rules', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = alertRuleSchema.parse(body);
    const rule = createAlertRule(parsed);
    return c.json(rule, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: err.errors }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.put('/alerts/rules/:id', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = alertRuleSchema.partial().parse(body);
    const rule = updateAlertRule(c.req.param('id'), parsed);
    if (!rule) return c.json({ error: 'Rule not found' }, 404);
    return c.json(rule);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: err.errors }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.delete('/alerts/rules/:id', (c) => {
  deleteAlertRule(c.req.param('id'));
  return c.json({ deleted: true });
});

app.post('/alerts/evaluate', (c) => {
  const triggered = evaluateAlerts();
  return c.json({ triggered, count: triggered.length });
});

app.get('/alerts/events', (c) => {
  const params = {
    ruleId: c.req.query('ruleId'),
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined,
    offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined,
  };
  return c.json(getAlertEvents(params));
});

// --- Admin Routes ---

app.get('/admin/stats', (c) => {
  return c.json(getDbStats());
});

app.post('/admin/cleanup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const retentionDays = (body as { retentionDays?: number }).retentionDays;
  const tracesDeleted = cleanupOldTraces(retentionDays);
  const alertsDeleted = cleanupOldAlertEvents(retentionDays);
  return c.json({ tracesDeleted, alertsDeleted });
});

export { app };
