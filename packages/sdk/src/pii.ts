interface PiiPattern {
  regex: RegExp;
  replacement: string | ((match: string) => string);
}

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
  {
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[REDACTED_EMAIL]',
  },
  // SSN: xxx-xx-xxxx (matched before phone to avoid partial overlap)
  {
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED_SSN]',
  },
  // Credit card: 4 groups of 4 digits separated by spaces/dashes, Luhn-validated
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
  // Continuous CC digits (13-19), must start with known card prefix and pass Luhn
  {
    regex: /\b([3-6]\d{12,18})\b/g,
    replacement: (match: string) => {
      if (match.length >= 13 && match.length <= 19 && passesLuhn(match)) {
        return '[REDACTED_CC]';
      }
      return match;
    },
  },
  // US phone: area code [2-9]xx + 7 digits (NANPA-compliant)
  {
    regex: /(?:\+?1[-.\s]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  // IPv4
  {
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    replacement: '[REDACTED_IP]',
  },
];

export function maskPii(text: string): string {
  let masked = text;
  for (const pattern of PII_PATTERNS) {
    pattern.regex.lastIndex = 0;
    masked = masked.replace(pattern.regex, pattern.replacement as string);
  }
  return masked;
}

export function maskMessages(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  return messages.map((msg) => ({
    role: msg.role,
    content: maskPii(msg.content),
  }));
}

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
