import { describe, it, expect } from 'vitest';
import { maskPii, maskMessages, maskObject } from '../pii.js';

describe('maskPii', () => {
  it('masks email addresses', () => {
    const input = 'Contact me at john.doe@example.com for details';
    const result = maskPii(input);
    expect(result).toBe('Contact me at [REDACTED_EMAIL] for details');
    expect(result).not.toContain('john.doe@example.com');
  });

  it('masks multiple email addresses', () => {
    const input = 'From alice@test.org to bob@company.co.uk';
    const result = maskPii(input);
    expect(result).toBe('From [REDACTED_EMAIL] to [REDACTED_EMAIL]');
  });

  it('masks phone numbers', () => {
    const cases = [
      { input: 'Call me at (555) 123-4567', expected: 'Call me at [REDACTED_PHONE]' },
      { input: 'Phone: 555-123-4567', expected: 'Phone: [REDACTED_PHONE]' },
      { input: 'Mobile: +1 555 123 4567', expected: 'Mobile: [REDACTED_PHONE]' },
    ];

    for (const { input, expected } of cases) {
      expect(maskPii(input)).toBe(expected);
    }
  });

  it('masks Social Security Numbers', () => {
    const input = 'SSN: 123-45-6789';
    const result = maskPii(input);
    expect(result).toBe('SSN: [REDACTED_SSN]');
    expect(result).not.toContain('123-45-6789');
  });

  it('masks credit card numbers', () => {
    const input = 'Card: 4111 1111 1111 1111';
    const result = maskPii(input);
    expect(result).toContain('[REDACTED_CC]');
    expect(result).not.toContain('4111 1111 1111 1111');
  });

  it('masks IP addresses', () => {
    const input = 'Server at 192.168.1.100 is down';
    const result = maskPii(input);
    expect(result).toBe('Server at [REDACTED_IP] is down');
    expect(result).not.toContain('192.168.1.100');
  });

  it('preserves non-PII text', () => {
    const input = 'The weather today is sunny with a high of 75 degrees';
    const result = maskPii(input);
    expect(result).toBe(input);
  });

  it('handles empty strings', () => {
    expect(maskPii('')).toBe('');
  });

  it('handles text with no PII', () => {
    const input = 'Hello, world! This is a simple test message.';
    expect(maskPii(input)).toBe(input);
  });

  it('masks multiple PII types in one string', () => {
    const input = 'Email john@test.com, SSN 123-45-6789, IP 10.0.0.1';
    const result = maskPii(input);
    expect(result).toContain('[REDACTED_EMAIL]');
    expect(result).toContain('[REDACTED_SSN]');
    expect(result).toContain('[REDACTED_IP]');
    expect(result).not.toContain('john@test.com');
    expect(result).not.toContain('123-45-6789');
    expect(result).not.toContain('10.0.0.1');
  });
});

describe('maskMessages', () => {
  it('masks PII in message content', () => {
    const messages = [
      { role: 'user', content: 'My email is alice@example.com' },
      { role: 'assistant', content: 'I see your email alice@example.com' },
    ];

    const result = maskMessages(messages);

    expect(result[0].content).toBe('My email is [REDACTED_EMAIL]');
    expect(result[1].content).toBe('I see your email [REDACTED_EMAIL]');
  });

  it('preserves message roles', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Contact support@company.com' },
    ];

    const result = maskMessages(messages);

    expect(result[0].role).toBe('system');
    expect(result[1].role).toBe('user');
    expect(result[0].content).toBe('You are a helpful assistant');
    expect(result[1].content).toContain('[REDACTED_EMAIL]');
  });

  it('does not mutate the original array', () => {
    const original = [{ role: 'user', content: 'Email: test@test.com' }];
    const result = maskMessages(original);

    expect(original[0].content).toBe('Email: test@test.com');
    expect(result[0].content).toBe('Email: [REDACTED_EMAIL]');
  });

  it('handles empty arrays', () => {
    expect(maskMessages([])).toEqual([]);
  });
});

describe('maskObject', () => {
  it('masks strings in nested objects', () => {
    const obj = {
      name: 'test',
      contact: {
        email: 'user@example.com',
        phone: '555-123-4567',
      },
    };

    const result = maskObject(obj);
    expect(result.contact.email).toBe('[REDACTED_EMAIL]');
    expect(result.contact.phone).toBe('[REDACTED_PHONE]');
    expect(result.name).toBe('test');
  });

  it('masks strings in arrays', () => {
    const arr = ['user@test.com', 'plain text', '192.168.0.1'];
    const result = maskObject(arr);
    expect(result[0]).toBe('[REDACTED_EMAIL]');
    expect(result[1]).toBe('plain text');
    expect(result[2]).toBe('[REDACTED_IP]');
  });

  it('handles null and undefined', () => {
    expect(maskObject(null)).toBeNull();
    expect(maskObject(undefined)).toBeUndefined();
  });

  it('passes through numbers and booleans', () => {
    expect(maskObject(42)).toBe(42);
    expect(maskObject(true)).toBe(true);
  });
});
