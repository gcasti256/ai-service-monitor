import { describe, it, expect } from 'vitest';
import { estimateCost, MODEL_PRICING } from '../cost.js';

describe('estimateCost', () => {
  it('calculates correct cost for gpt-4o', () => {
    // gpt-4o: $2.50/1M input, $10.00/1M output
    const result = estimateCost('gpt-4o', 1000, 500);

    expect(result.input).toBeCloseTo(0.0025, 6);   // 1000 / 1M * 2.50
    expect(result.output).toBeCloseTo(0.005, 6);    // 500 / 1M * 10.00
    expect(result.total).toBeCloseTo(0.0075, 6);
  });

  it('calculates correct cost for gpt-4o-mini', () => {
    // gpt-4o-mini: $0.15/1M input, $0.60/1M output
    const result = estimateCost('gpt-4o-mini', 10000, 5000);

    expect(result.input).toBeCloseTo(0.0015, 6);    // 10000 / 1M * 0.15
    expect(result.output).toBeCloseTo(0.003, 6);     // 5000 / 1M * 0.60
    expect(result.total).toBeCloseTo(0.0045, 6);
  });

  it('calculates correct cost for claude-sonnet-4-20250514', () => {
    // claude-sonnet-4: $3.00/1M input, $15.00/1M output
    const result = estimateCost('claude-sonnet-4-20250514', 2000, 1000);

    expect(result.input).toBeCloseTo(0.006, 6);     // 2000 / 1M * 3.00
    expect(result.output).toBeCloseTo(0.015, 6);     // 1000 / 1M * 15.00
    expect(result.total).toBeCloseTo(0.021, 6);
  });

  it('calculates correct cost for gpt-4', () => {
    // gpt-4: $30.00/1M input, $60.00/1M output
    const result = estimateCost('gpt-4', 1000000, 500000);

    expect(result.input).toBeCloseTo(30.0, 2);
    expect(result.output).toBeCloseTo(30.0, 2);
    expect(result.total).toBeCloseTo(60.0, 2);
  });

  it('returns zero cost for unknown models', () => {
    const result = estimateCost('some-unknown-model', 1000, 500);

    expect(result.input).toBe(0);
    expect(result.output).toBe(0);
    expect(result.total).toBe(0);
  });

  it('returns zero cost for zero tokens', () => {
    const result = estimateCost('gpt-4o', 0, 0);

    expect(result.input).toBe(0);
    expect(result.output).toBe(0);
    expect(result.total).toBe(0);
  });

  it('handles model name normalization — strips date suffix', () => {
    // "gpt-4o-2024-08-06" should normalize to "gpt-4o"
    const result = estimateCost('gpt-4o-2024-08-06', 1000, 500);

    expect(result.input).toBeCloseTo(0.0025, 6);
    expect(result.output).toBeCloseTo(0.005, 6);
    expect(result.total).toBeCloseTo(0.0075, 6);
  });

  it('handles model name normalization — strips short date suffix', () => {
    // "gpt-3.5-turbo-0125" should normalize to "gpt-3.5-turbo"
    const result = estimateCost('gpt-3.5-turbo-0125', 1000, 500);

    expect(result.input).toBeCloseTo(0.0005, 6);   // 1000 / 1M * 0.50
    expect(result.output).toBeCloseTo(0.00075, 6);  // 500 / 1M * 1.50
    expect(result.total).toBeCloseTo(0.00125, 6);
  });

  it('handles case-insensitive model names', () => {
    const result = estimateCost('GPT-4o', 1000, 500);

    expect(result.input).toBeCloseTo(0.0025, 6);
    expect(result.total).toBeGreaterThan(0);
  });

  it('has pricing data for all documented models', () => {
    const expectedModels = [
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4',
      'gpt-3.5-turbo', 'o1', 'o1-mini',
      'claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-3-5-20241022',
    ];

    for (const model of expectedModels) {
      expect(MODEL_PRICING[model]).toBeDefined();
      expect(MODEL_PRICING[model].input).toBeGreaterThan(0);
      expect(MODEL_PRICING[model].output).toBeGreaterThan(0);
    }
  });
});
