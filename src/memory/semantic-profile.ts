import { createHash } from 'node:crypto';
import { normalizeMemoryText } from './normalizer.js';
import { redactMemoryText } from './redaction.js';
import type { MemorySemanticProfile } from './types.js';

const STRING_FIELDS = ['title', 'summary', 'intent', 'outcome', 'failureMode', 'solution'] as const;
const ARRAY_FIELDS = ['concepts', 'entities', 'constraints', 'artifacts', 'futureRelevance'] as const;
const ALLOWED_FIELDS = new Set<string>([...STRING_FIELDS, ...ARRAY_FIELDS]);

const MAX_STRING_CHARS = 2_000;
const MAX_ARRAY_ITEMS = 32;
const MAX_ARRAY_ITEM_CHARS = 500;
const MAX_CANONICAL_BYTES = 16_000;

export interface NormalizedMemorySemanticProfile {
  profile: MemorySemanticProfile;
  canonicalJson: string;
  hash: string;
}

function binaryCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => binaryCompare(left, right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function normalizedString(value: string, maxChars: number): string | undefined {
  const safe = normalizeMemoryText(redactMemoryText(value).text).canonical;
  if (!safe) return undefined;
  if ([...safe].length > maxChars) throw new Error('MEMORY_SEMANTIC_PROFILE_TOO_LARGE');
  return safe;
}

export function normalizeMemorySemanticProfile(
  input: MemorySemanticProfile,
): NormalizedMemorySemanticProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('MEMORY_SEMANTIC_PROFILE_INVALID');
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(key)) throw new Error('MEMORY_SEMANTIC_PROFILE_INVALID');
  }

  const profile: MemorySemanticProfile = {};
  const record = input as Record<string, unknown>;

  for (const field of STRING_FIELDS) {
    const value = record[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') throw new Error('MEMORY_SEMANTIC_PROFILE_INVALID');
    const safe = normalizedString(value, MAX_STRING_CHARS);
    if (safe !== undefined) profile[field] = safe;
  }

  for (const field of ARRAY_FIELDS) {
    const value = record[field];
    if (value === undefined) continue;
    if (!Array.isArray(value)) throw new Error('MEMORY_SEMANTIC_PROFILE_INVALID');
    if (value.length > MAX_ARRAY_ITEMS) throw new Error('MEMORY_SEMANTIC_PROFILE_TOO_LARGE');
    const normalized: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') throw new Error('MEMORY_SEMANTIC_PROFILE_INVALID');
      const safe = normalizedString(item, MAX_ARRAY_ITEM_CHARS);
      if (safe !== undefined) normalized.push(safe);
    }
    const unique = [...new Set(normalized)].sort(binaryCompare);
    if (unique.length > 0) profile[field] = unique;
  }

  const canonicalJson = stableJson(profile);
  if (Buffer.byteLength(canonicalJson, 'utf8') > MAX_CANONICAL_BYTES) {
    throw new Error('MEMORY_SEMANTIC_PROFILE_TOO_LARGE');
  }
  return {
    profile,
    canonicalJson,
    hash: createHash('sha256').update(canonicalJson, 'utf8').digest('hex'),
  };
}
