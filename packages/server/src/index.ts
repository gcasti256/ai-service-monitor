import { serve } from '@hono/node-server';
import { app } from './routes.js';

const port = parseInt(process.env.PORT || '3100', 10);
const host = process.env.HOST || '0.0.0.0';

console.info(`AI Service Monitor — Collector API`);
console.info(`Listening on ${host}:${port}`);

serve({ fetch: app.fetch, port, hostname: host });
