/**
 * PII (Personally Identifiable Information) masking utilities.
 *
 * Detects and redacts common PII patterns in text content before
 * telemetry is sent to the collector.
 */

interface PiiPattern {
  regex: RegExp;
  replacement: string | ((match: string) => string);
}

/**
 * Luhn algorithm to validate potential credit card numbers.
 * Returns true if the digit string passes the Luhn check.
 */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
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
  // Credit card numbers: 4 groups of 4 digits separated by spaces or dashes
  // (with optional trailing group for Amex-style 4-6-5 via 4-4-4-4-3)
  // Only redact if the digits pass Luhn validation.
  {
    regex: /\b(\d{4})[- ](\d{4})[- ](\d{4})[- ](\d{4})(?:[- ](\d{1,3}))?\b/g,
    replacement: (match: string) => {
      const digits = match.replace(/[- ]/g, '');
      if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) {
        return '[REDACTED_CC]';
      }
      return match;
    },
  },
  // Continuous digit sequences that look like credit card numbers (13-19 digits).
  // Must pass Luhn validation and must start with a known card prefix
  // (4=Visa, 5[1-5]/2[2-7]=MC, 3[47]=Amex, 6=Discover).
  {
    regex: /\b([3-6]\d{12,18})\b/g,
    replacement: (match: string) => {
      if (match.length >= 13 && match.length <= 19 && passesLuhn(match)) {
        return '[REDACTED_CC]';
      }
      return match;
    },
  },
  // US phone numbers: require a 3-digit area code (optionally in parens) followed
  // by a 3-digit exchange and 4-digit subscriber number. The area code must start
  // with [2-9] per NANPA rules. This requires all 10 digits to be present, avoiding
  // false positives on bare 7-digit numbers, dates, and zip codes.
  {
    regex: /(?:\+?1[-.\s]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
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
    if (typeof pattern.replacement === 'string') {
      masked = masked.replace(pattern.regex, pattern.replacement);
    } else {
      masked = masked.replace(pattern.regex, pattern.replacement);
    }
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
