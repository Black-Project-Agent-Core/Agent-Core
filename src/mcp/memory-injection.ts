import type { MemoryPreflightResult, MemorySearchHit } from '../memory/types.js';

export interface MemoryRoutingInjectionOptions {
  maxItems?: number;
  characterBudget?: number;
  canonicalMaxItems?: number;
  canonicalCharacterBudget?: number;
}

export interface MemoryRoutingInjection {
  context: string;
  applied: boolean;
  memoryIds: string[];
  canonicalMemoryIds?: string[];
  characterCount: number;
  omittedCount: number;
}

const DEFAULT_MAX_ITEMS = 6;
const DEFAULT_CHARACTER_BUDGET = 2_400;
const DEFAULT_CANONICAL_MAX_ITEMS = 8;
const DEFAULT_CANONICAL_CHARACTER_BUDGET = 6_000;

function normalizedText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function prioritizedRoutingHits(preflight: MemoryPreflightResult): MemorySearchHit[] {
  const canonicalIds = new Set(preflight.canonicalSubjectMemory.map((hit) => hit.memoryId));
  const ordered = [
    ...preflight.relatedDecisions,
    ...preflight.priorFailures,
    ...preflight.recalled.filter((hit) => hit.kind !== 'guardrail'),
  ].filter((hit) => !canonicalIds.has(hit.memoryId));
  const seen = new Set<string>();
  return ordered.filter((hit) => {
    if (seen.has(hit.memoryId)) return false;
    seen.add(hit.memoryId);
    return true;
  });
}

function renderHit(hit: MemorySearchHit): string {
  const key = normalizedText(hit.canonicalKey);
  const value = normalizedText(hit.valueText);
  return `[${hit.kind}:${key}] ${value}`;
}

function renderCanonicalHit(hit: MemorySearchHit): string {
  const key = normalizedText(hit.canonicalKey);
  const value = normalizedText(hit.valueText);
  return `[canonical:${key}] ${value}`;
}

/**
 * Project a bounded deterministic subset of recalled memory into capability-routing context.
 * Hard guardrails are intentionally excluded here because they are enforced separately by
 * RouteContextStore rather than being treated as capability-ranking hints.
 */
export function injectMemoryIntoRoutingContext(
  context: string | undefined,
  preflight: MemoryPreflightResult | null,
  options: MemoryRoutingInjectionOptions = {},
): MemoryRoutingInjection {
  const originalContext = context?.normalize('NFKC').trim() ?? '';
  if (!preflight) {
    return { context: originalContext, applied: false, memoryIds: [], characterCount: 0, omittedCount: 0 };
  }

  const canonicalMaxItems = Math.max(1, Math.min(options.canonicalMaxItems ?? DEFAULT_CANONICAL_MAX_ITEMS, 24));
  const canonicalCharacterBudget = Math.max(256, Math.min(
    options.canonicalCharacterBudget ?? DEFAULT_CANONICAL_CHARACTER_BUDGET,
    12_000,
  ));
  const canonicalCandidates = preflight.canonicalSubjectMemory;
  const canonicalLines: string[] = [];
  const canonicalMemoryIds: string[] = [];
  let canonicalCharacters = 0;
  for (const hit of canonicalCandidates) {
    if (canonicalLines.length >= canonicalMaxItems) break;
    let line = renderCanonicalHit(hit);
    const remaining = canonicalCharacterBudget - canonicalCharacters;
    if (remaining <= 0) break;
    if (line.length > remaining) line = `${line.slice(0, Math.max(0, remaining - 1)).trimEnd()}…`;
    if (!line) break;
    canonicalLines.push(line);
    canonicalMemoryIds.push(hit.memoryId);
    canonicalCharacters += line.length;
  }

  const maxItems = Math.max(1, Math.min(options.maxItems ?? DEFAULT_MAX_ITEMS, 24));
  const characterBudget = Math.max(256, Math.min(options.characterBudget ?? DEFAULT_CHARACTER_BUDGET, 12_000));
  const candidates = prioritizedRoutingHits(preflight);
  const ordinaryLines: string[] = [];
  const ordinaryMemoryIds: string[] = [];
  let ordinaryCharacters = 0;

  for (const hit of candidates) {
    if (ordinaryLines.length >= maxItems) break;
    let line = renderHit(hit);
    const remaining = characterBudget - ordinaryCharacters;
    if (remaining <= 0) break;
    if (line.length > remaining) line = `${line.slice(0, Math.max(0, remaining - 1)).trimEnd()}…`;
    if (!line) break;
    ordinaryLines.push(line);
    ordinaryMemoryIds.push(hit.memoryId);
    ordinaryCharacters += line.length;
  }

  const lines = [...canonicalLines, ...ordinaryLines];
  const memoryIds = [...canonicalMemoryIds, ...ordinaryMemoryIds];
  if (lines.length === 0) {
    return {
      context: originalContext,
      applied: false,
      memoryIds: [],
      characterCount: 0,
      omittedCount: canonicalCandidates.length + candidates.length,
    };
  }

  const recalledContext = lines.join('\n');
  return {
    context: [originalContext, recalledContext].filter(Boolean).join('\n'),
    applied: true,
    memoryIds,
    ...(canonicalMemoryIds.length > 0 ? { canonicalMemoryIds } : {}),
    characterCount: recalledContext.length,
    omittedCount: Math.max(0, canonicalCandidates.length - canonicalMemoryIds.length)
      + Math.max(0, candidates.length - ordinaryMemoryIds.length),
  };
}
