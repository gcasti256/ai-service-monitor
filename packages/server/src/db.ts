import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'monitor.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db: DatabaseType = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS traces (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    parent_span_id TEXT,
    timestamp TEXT NOT NULL,
    duration REAL NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    status TEXT NOT NULL,
    status_code INTEGER,
    error_message TEXT,
    error_type TEXT,
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    tokens_total INTEGER NOT NULL DEFAULT 0,
    cost_input REAL NOT NULL DEFAULT 0,
    cost_output REAL NOT NULL DEFAULT 0,
    cost_total REAL NOT NULL DEFAULT 0,
    request_body TEXT,
    response_body TEXT,
    response_length INTEGER,
    finish_reason TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON traces(trace_id);
  CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces(timestamp);
  CREATE INDEX IF NOT EXISTS idx_traces_model ON traces(model);
  CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);
  CREATE INDEX IF NOT EXISTS idx_traces_provider ON traces(provider);

  CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    metric TEXT NOT NULL,
    operator TEXT NOT NULL,
    threshold REAL NOT NULL,
    window_minutes INTEGER NOT NULL DEFAULT 5,
    webhook_url TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alert_events (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    rule_name TEXT NOT NULL,
    metric TEXT NOT NULL,
    current_value REAL NOT NULL,
    threshold REAL NOT NULL,
    triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_alert_events_rule_id ON alert_events(rule_id);
  CREATE INDEX IF NOT EXISTS idx_alert_events_triggered_at ON alert_events(triggered_at);
`);

export { db };
export type { DatabaseType as Database };
