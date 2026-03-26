/**
 * Alert Setup Example
 *
 * Demonstrates how to configure alert rules on the monitoring server
 * using the REST API. Alerts fire when a metric crosses a threshold
 * within a configurable time window.
 *
 * Prerequisites:
 *   1. Start the collector: cd packages/server && npm run dev
 *   2. Seed demo data:      cd packages/server && npx tsx src/seed.ts
 *   3. Run this example:    npx tsx examples/alert-setup.ts
 */

const API_URL = process.env.API_URL || 'http://localhost:3100';

// ---------------------------------------------------------------------------
// Helper: typed fetch wrapper
// ---------------------------------------------------------------------------

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Alert rule types (matching the server's Zod schema)
// ---------------------------------------------------------------------------

interface AlertRule {
  id: string;
  name: string;
  metric: 'latency' | 'error_rate' | 'cost' | 'token_usage';
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  threshold: number;
  window_minutes: number;
  webhook_url: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface AlertEvent {
  id: string;
  rule_id: string;
  rule_name: string;
  metric: string;
  current_value: number;
  threshold: number;
  triggered_at: string;
}

// ---------------------------------------------------------------------------
// 1. Create alert rules for common scenarios
// ---------------------------------------------------------------------------

async function setupAlertRules() {
  console.log('--- Creating Alert Rules ---\n');

  // Rule 1: High latency — triggers when average response time exceeds 2 seconds
  const latencyRule = await api<AlertRule>('/alerts/rules', {
    method: 'POST',
    body: JSON.stringify({
      name: 'High Latency Warning',
      metric: 'latency',
      operator: 'gt',
      threshold: 2000,         // 2000ms = 2 seconds
      windowMinutes: 15,       // Check the last 15 minutes
      // Uncomment to send webhook notifications:
      // webhookUrl: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK',
    }),
  });
  console.log(`Created: "${latencyRule.name}" (${latencyRule.metric} > ${latencyRule.threshold}ms in ${latencyRule.window_minutes}min window)`);

  // Rule 2: Error rate spike — triggers when error rate exceeds 5%
  const errorRule = await api<AlertRule>('/alerts/rules', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Error Rate Spike',
      metric: 'error_rate',
      operator: 'gt',
      threshold: 5,            // 5% error rate
      windowMinutes: 10,       // Check the last 10 minutes
    }),
  });
  console.log(`Created: "${errorRule.name}" (${errorRule.metric} > ${errorRule.threshold}% in ${errorRule.window_minutes}min window)`);

  // Rule 3: Daily cost budget — triggers when total cost exceeds $50
  const costRule = await api<AlertRule>('/alerts/rules', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Daily Cost Budget',
      metric: 'cost',
      operator: 'gt',
      threshold: 50.0,         // $50 USD
      windowMinutes: 1440,     // 24 hours = 1440 minutes
    }),
  });
  console.log(`Created: "${costRule.name}" (${costRule.metric} > $${costRule.threshold} in ${costRule.window_minutes}min window)`);

  // Rule 4: Token usage cap — triggers when total tokens exceed 1M
  const tokenRule = await api<AlertRule>('/alerts/rules', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Token Usage Cap',
      metric: 'token_usage',
      operator: 'gte',
      threshold: 1_000_000,    // 1 million tokens
      windowMinutes: 1440,     // 24 hours
    }),
  });
  console.log(`Created: "${tokenRule.name}" (${tokenRule.metric} >= ${tokenRule.threshold.toLocaleString()} in ${tokenRule.window_minutes}min window)`);

  return [latencyRule, errorRule, costRule, tokenRule];
}

// ---------------------------------------------------------------------------
// 2. List all configured rules
// ---------------------------------------------------------------------------

async function listRules() {
  console.log('\n--- All Alert Rules ---\n');

  const rules = await api<AlertRule[]>('/alerts/rules');

  console.log('┌────────────────────────────┬──────────────┬──────────┬────────────┬─────────┐');
  console.log('│ Name                       │ Metric       │ Operator │ Threshold  │ Window  │');
  console.log('├────────────────────────────┼──────────────┼──────────┼────────────┼─────────┤');
  for (const rule of rules) {
    const name = rule.name.padEnd(26).slice(0, 26);
    const metric = rule.metric.padEnd(12);
    const op = rule.operator.padEnd(8);
    const thresh = String(rule.threshold).padEnd(10);
    const window = `${rule.window_minutes}min`.padEnd(7);
    console.log(`│ ${name} │ ${metric} │ ${op} │ ${thresh} │ ${window} │`);
  }
  console.log('└────────────────────────────┴──────────────┴──────────┴────────────┴─────────┘');

  return rules;
}

// ---------------------------------------------------------------------------
// 3. Manually evaluate all rules
// ---------------------------------------------------------------------------

async function evaluateAlerts() {
  console.log('\n--- Evaluating Alert Rules ---\n');

  const result = await api<{ triggered: AlertEvent[]; count: number }>('/alerts/evaluate', {
    method: 'POST',
    body: '{}',
  });

  if (result.count === 0) {
    console.log('No alerts triggered. All metrics within thresholds.');
  } else {
    console.log(`${result.count} alert(s) triggered:\n`);
    for (const event of result.triggered) {
      console.log(`  [ALERT] ${event.rule_name}`);
      console.log(`          Metric: ${event.metric}`);
      console.log(`          Current: ${event.current_value.toFixed(4)} | Threshold: ${event.threshold}`);
      console.log('');
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 4. View alert history
// ---------------------------------------------------------------------------

async function viewAlertHistory() {
  console.log('\n--- Alert Event History ---\n');

  const events = await api<AlertEvent[]>('/alerts/events?limit=10');

  if (events.length === 0) {
    console.log('No alert events recorded yet.');
    return;
  }

  for (const event of events) {
    const time = new Date(event.triggered_at).toLocaleString();
    console.log(`  [${time}] ${event.rule_name} — ${event.metric}: ${event.current_value.toFixed(4)} (threshold: ${event.threshold})`);
  }
}

// ---------------------------------------------------------------------------
// 5. Update and disable a rule
// ---------------------------------------------------------------------------

async function demonstrateRuleManagement(rules: AlertRule[]) {
  console.log('\n--- Rule Management ---\n');

  if (rules.length === 0) return;

  const rule = rules[0];

  // Update threshold
  const updated = await api<AlertRule>(`/alerts/rules/${rule.id}`, {
    method: 'PUT',
    body: JSON.stringify({ threshold: 3000, windowMinutes: 30 }),
  });
  console.log(`Updated "${updated.name}": threshold ${rule.threshold} → ${updated.threshold}, window ${rule.window_minutes}min → ${updated.window_minutes}min`);

  // Disable a rule
  const disabled = await api<AlertRule>(`/alerts/rules/${rule.id}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: false }),
  });
  console.log(`Disabled "${disabled.name}" (enabled: ${disabled.enabled === 1})`);

  // Re-enable
  const reenabled = await api<AlertRule>(`/alerts/rules/${rule.id}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: true }),
  });
  console.log(`Re-enabled "${reenabled.name}" (enabled: ${reenabled.enabled === 1})`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== AI Service Monitor — Alert Setup Example ===\n');
  console.log(`Connecting to: ${API_URL}\n`);

  // Verify server is running
  try {
    await api('/health');
    console.log('Server is healthy.\n');
  } catch {
    console.error('Could not connect to the server. Is it running on', API_URL, '?');
    process.exit(1);
  }

  const rules = await setupAlertRules();
  await listRules();
  await evaluateAlerts();
  await viewAlertHistory();
  await demonstrateRuleManagement(rules);

  console.log('\nDone! View alerts in the dashboard at http://localhost:5173 (Alerts tab).');
}

main().catch(console.error);
