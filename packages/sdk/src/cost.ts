/**
 * Cost estimation for AI model API calls.
 *
 * Pricing is per 1 million tokens. Unknown models return zero cost
 * rather than throwing, so telemetry is never blocked by missing pricing data.
 */

/** Pricing per 1M tokens for known models. */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI — GPT series
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  // OpenAI — o-series reasoning models
  'o1': { input: 15.00, output: 60.00 },
  'o1-mini': { input: 3.00, output: 12.00 },
  'o1-pro': { input: 150.00, output: 600.00 },
  'o3': { input: 10.00, output: 40.00 },
  'o3-mini': { input: 1.10, output: 4.40 },
  'o4-mini': { input: 1.10, output: 4.40 },
  // Anthropic
  'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-3-5-20241022': { input: 0.80, output: 4.00 },
  // Anthropic — shorthand aliases for normalization
  'claude-opus-4': { input: 15.00, output: 75.00 },
  'claude-sonnet-4': { input: 3.00, output: 15.00 },
  'claude-haiku-3.5': { input: 0.80, output: 4.00 },
  'claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'claude-3-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
};

/**
 * Normalize a model name to match pricing table keys.
 *
 * Strips common suffixes like date stamps (e.g. "-20240101") and
 * snapshot identifiers, then checks for partial matches against
 * known model names.
 *
 * Examples:
 *   "gpt-4o-2024-08-06"       -> "gpt-4o"
 *   "gpt-4-turbo-2024-04-09"  -> "gpt-4-turbo"
 *   "gpt-3.5-turbo-0125"      -> "gpt-3.5-turbo"
 *   "claude-sonnet-4-20250514" -> "claude-sonnet-4-20250514" (exact match)
 */
function normalizeModelName(model: string): string {
  const lower = model.toLowerCase().trim();

  // Exact match first
  if (MODEL_PRICING[lower]) {
    return lower;
  }

  // Try stripping date suffixes: -YYYY-MM-DD or -YYYYMMDD or -MMDD
  const withoutDate = lower
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-\d{4}$/, '');

  if (MODEL_PRICING[withoutDate]) {
    return withoutDate;
  }

  // Try matching the longest known prefix
  const knownModels = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const known of knownModels) {
    if (lower.startsWith(known)) {
      return known;
    }
  }

  return lower;
}

/**
 * Estimate the cost of an API call based on the model and token counts.
 *
 * Returns `{ input: 0, output: 0, total: 0 }` for unknown models.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): { input: number; output: number; total: number } {
  const normalized = normalizeModelName(model);
  const pricing = MODEL_PRICING[normalized];

  if (!pricing) {
    return { input: 0, output: 0, total: 0 };
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return {
    input: roundToMicrodollar(inputCost),
    output: roundToMicrodollar(outputCost),
    total: roundToMicrodollar(inputCost + outputCost),
  };
}

/** Round to 8 decimal places to avoid floating point noise. */
function roundToMicrodollar(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}
