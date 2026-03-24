/**
 * PII (Personally Identifiable Information) masking utilities.
 *
 * Detects and redacts common PII patterns in text content before
 * telemetry is sent to the collector.
 */

interface PiiPattern {
  regex: RegExp;
  replacement: string;
}

const PII_PATTERNS: PiiPattern[] = [
  // Email addresses
  {
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[REDACTED_EMAIL]',
  },
  // Social Security Numbers: xxx-xx-xxxx (before phone to avoid partial matches)
  {
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED_SSN]',
  },
  // Credit card numbers: groups of 4 digits separated by spaces/dashes, or 13-19 continuous digits
  // Must come before phone numbers to avoid partial matches on digit groups
  {
    regex: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}(?:[- ]\d{1,3})?\b/g,
    replacement: '[REDACTED_CC]',
  },
  {
    regex: /\b\d{13,19}\b/g,
    replacement: '[REDACTED_CC]',
  },
  // US phone numbers: (xxx) xxx-xxxx, xxx-xxx-xxxx, +1xxxxxxxxxx, etc.
  {
    regex: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  // IPv4 addresses
  {
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    replacement: '[REDACTED_IP]',
  },
];

/**
 * Mask PII in a single string by applying all known patterns.
 */
export function maskPii(text: string): string {
  let masked = text;
  for (const pattern of PII_PATTERNS) {
    // Reset lastIndex for global regexes since we reuse them
    pattern.regex.lastIndex = 0;
    masked = masked.replace(pattern.regex, pattern.replacement);
  }
  return masked;
}

/**
 * Mask PII in an array of chat messages.
 */
export function maskMessages(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  return messages.map((msg) => ({
    role: msg.role,
    content: maskPii(msg.content),
  }));
}

/**
 * Recursively mask PII in an object. Traverses all string values
 * in objects and arrays, applying PII masking to each.
 */
export function maskObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return maskPii(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => maskObject(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = maskObject(value);
    }
    return result as T;
  }

  return obj;
}
