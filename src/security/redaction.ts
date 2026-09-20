const SENSITIVE_KEY = /(token|secret|password|passphrase|authorization|api.?key|credential|private.?key|client.?secret|access.?token|refresh.?token|code.?verifier|cookie|session.?id)/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

export function redactSensitiveString(value: string): string {
  let output = value;
  output = output.replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
  output = output.replace(/\bagent_core_(?:live|oauth|secret|code|refresh)_[A-Za-z0-9_-]+\b/gi, '[REDACTED]');
  output = output.replace(
    /((?:["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|passphrase|secret|token|code[_-]?verifier)["']?)\s*[:=]\s*)(["'])(.*?)\2/gi,
    '$1$2[REDACTED]$2',
  );
  output = output.replace(
    /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|passphrase|secret|token|code[_-]?verifier)\s*=\s*)([^\s&;,}\]"']+)/gi,
    '$1[REDACTED]',
  );
  output = output.replace(
    /((?:--?)(?:api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|authorization|password|passphrase|secret|token|code[-_]?verifier)\s+)(["']?)([^\s"']+)\2/gi,
    '$1[REDACTED]',
  );
  return output;
}

export function redactSensitiveValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 10) return '[TRUNCATED]';
  if (typeof value === 'string') return redactSensitiveString(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'undefined') return value;
  if (typeof value !== 'object') return redactSensitiveString(String(value));
  if (seen.has(value as object)) return '[CIRCULAR]';
  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactSensitiveValue(item, depth + 1, seen));
    }

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key)
        ? '[REDACTED]'
        : redactSensitiveValue(item, depth + 1, seen);
    }
    return output;
  } finally {
    seen.delete(value as object);
  }
}
