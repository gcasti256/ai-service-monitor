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
  isWebhookUrlSafe,
} from './alerts.js';
import { cleanupOldTraces, cleanupOldAlertEvents, getDbStats } from './retention.js';

const app = new Hono();

// Middleware
app.use('*', cors());

// Global error handler — ensures consistent error responses
app.onError((err, c) => {
  console.error('Unhandled route error:', err.message);
  return c.json({ error: 'Internal server error' }, 500);
});

// Optional API key authentication for write endpoints.
// If API_KEY is set in the environment, require it in the Authorization header.
const API_KEY = process.env.API_KEY;

function requireAuth(authHeader: string | undefined): boolean {
  if (!API_KEY) return true;
  return authHeader === `Bearer ${API_KEY}`;
}

app.use('/traces', async (c, next) => {
  if (c.req.method === 'POST' && !requireAuth(c.req.header('Authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

app.use('/alerts/*', async (c, next) => {
  if (c.req.method !== 'GET' && !requireAuth(c.req.header('Authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

app.use('/admin/*', async (c, next) => {
  if (!requireAuth(c.req.header('Authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

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
  duration: z.number().nonnegative(),
  provider: z.string(),
  model: z.string(),
  endpoint: z.string(),
  status: z.enum(['success', 'error']),
  statusCode: z.number().int().optional(),
  error: z
    .object({
      message: z.string(),
      type: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
  tokens: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  cost: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    total: z.number().nonnegative(),
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
  try {
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
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /traces/:id
app.get('/traces/:id', (c) => {
  try {
    const trace = getTraceById(c.req.param('id'));
    if (!trace) return c.json({ error: 'Trace not found' }, 404);
    return c.json(trace);
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /traces/by-trace/:traceId
app.get('/traces/by-trace/:traceId', (c) => {
  try {
    const traces = getTracesByTraceId(c.req.param('traceId'));
    return c.json(traces);
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// --- Stats Routes ---

app.get('/stats', (c) => {
  try {
    const params = {
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
      model: c.req.query('model'),
      provider: c.req.query('provider'),
    };
    return c.json(getDashboardStats(params));
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get('/stats/latency', (c) => {
  try {
    const params = {
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
    };
    return c.json(getLatencyTimeseries(params));
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get('/stats/models', (c) => {
  try {
    const params = {
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
    };
    return c.json(getModelBreakdown(params));
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get('/stats/cost', (c) => {
  try {
    const params = {
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
    };
    return c.json(getCostTimeseries(params));
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get('/stats/errors', (c) => {
  try {
    const params = {
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined,
      offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined,
    };
    return c.json(getErrorLog(params));
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// --- Alert Routes ---

const alertRuleSchema = z.object({
  name: z.string().min(1).max(200),
  metric: z.enum(['latency', 'error_rate', 'cost', 'token_usage']),
  operator: z.enum(['gt', 'lt', 'gte', 'lte']),
  threshold: z.number(),
  windowMinutes: z.number().int().min(1).max(10080).optional(),
  webhookUrl: z.string().url().max(2048).optional(),
  enabled: z.boolean().optional(),
});

app.get('/alerts/rules', (c) => {
  try {
    return c.json(getAlertRules());
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post('/alerts/rules', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = alertRuleSchema.parse(body);
    if (parsed.webhookUrl && !isWebhookUrlSafe(parsed.webhookUrl)) {
      return c.json({ error: 'Webhook URL is not allowed (private/internal addresses are blocked)' }, 400);
    }
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
    if (parsed.webhookUrl && !isWebhookUrlSafe(parsed.webhookUrl)) {
      return c.json({ error: 'Webhook URL is not allowed (private/internal addresses are blocked)' }, 400);
    }
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
  try {
    deleteAlertRule(c.req.param('id'));
    return c.json({ deleted: true });
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post('/alerts/evaluate', (c) => {
  try {
    const triggered = evaluateAlerts();
    return c.json({ triggered, count: triggered.length });
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get('/alerts/events', (c) => {
  try {
    const params = {
      ruleId: c.req.query('ruleId'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined,
      offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined,
    };
    return c.json(getAlertEvents(params));
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// --- Admin Routes ---

app.get('/admin/stats', (c) => {
  try {
    return c.json(getDbStats());
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post('/admin/cleanup', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const retentionDays = (body as { retentionDays?: number }).retentionDays;
    const tracesDeleted = cleanupOldTraces(retentionDays);
    const alertsDeleted = cleanupOldAlertEvents(retentionDays);
    return c.json({ tracesDeleted, alertsDeleted });
  } catch {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export { app };
