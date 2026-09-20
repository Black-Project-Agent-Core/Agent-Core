import { redactSensitiveString, redactSensitiveValue } from './security/redaction.js';

export interface CompactFailureEvidence {
  outcome: 'success' | 'error';
  failureFamily?: string;
  outputExcerpt?: string;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'undefined') return undefined;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value !== 'object') return String(value);
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const item = canonicalize((value as Record<string, unknown>)[key]);
    if (typeof item !== 'undefined') output[key] = item;
  }
  return output;
}

function failureCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ['code', 'errorCode', 'error_code', 'name']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  if (record.error && typeof record.error === 'object') return failureCode(record.error);
  return undefined;
}

function textFromContent(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.content)) return '';
  return record.content
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => typeof item.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join(' ');
}

export function failureText(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return String(value);
  const record = value as Record<string, unknown>;
  const contentText = textFromContent(record);
  if (contentText) return contentText;
  if (typeof record.message === 'string' && record.message) return record.message;
  try {
    return JSON.stringify(canonicalize(redactSensitiveValue(record))) ?? 'handled failure';
  } catch {
    return 'handled failure';
  }
}

function normalizeVolatileFailureText(value: string): string {
  return value
    .replace(/(['"])(?:[A-Za-z]:[\\/][^'"]+|\/[^'"]+)\1/g, '$1<path>$1')
    .replace(/\b[A-Za-z]:[\\/][^\s,;)}\]]+/g, '<path>')
    .replace(/\b(pid|process)\s*[:=#]?\s*\d+\b/gi, '$1 <n>')
    .replace(/\bport\s*[:=#]?\s*\d+\b/gi, 'port <n>');
}

export function normalizeFailureFamily(value: unknown): string {
  const code = failureCode(value);
  const text = normalizeVolatileFailureText(redactSensitiveString(failureText(value)))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
  return code ? `${code}: ${text || 'failure'}` : (text || 'failure');
}

export function boundedEvidenceExcerpt(value: unknown, maxChars = 1200): string {
  const sanitized = redactSensitiveString(failureText(redactSensitiveValue(value)))
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized) return '';
  if (sanitized.length <= maxChars) return sanitized;
  const marker = ' … [truncated] … ';
  const remaining = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(remaining * 0.6);
  const tail = Math.floor(remaining * 0.4);
  return sanitized.slice(0, head) + marker + sanitized.slice(-tail);
}

export function compactFailureEvidence(value: unknown, maxChars = 1200): CompactFailureEvidence {
  const sanitized = redactSensitiveValue(value);
  const isError = Boolean(
    sanitized
    && typeof sanitized === 'object'
    && (sanitized as Record<string, unknown>).isError,
  );
  const outputExcerpt = boundedEvidenceExcerpt(sanitized, maxChars);
  return {
    outcome: isError ? 'error' : 'success',
    ...(isError ? { failureFamily: normalizeFailureFamily(sanitized) } : {}),
    ...(outputExcerpt ? { outputExcerpt } : {}),
  };
}