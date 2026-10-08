import type { MemoryLink, MemoryRecord } from './types.js';

const MAX_EVIDENCE_REFS = 16;

function normalizeIso(value: string | undefined, code: string): string | undefined {
  if (!value) return undefined;
  if (!Number.isFinite(Date.parse(value))) throw new Error(code);
  return new Date(value).toISOString();
}

function normalizeEvidenceRefs(values: string[] | undefined, validIds: Set<string>): string[] | undefined {
  if (!values?.length) return undefined;
  const output: string[] = [];
  for (const raw of values) {
    const value = String(raw).trim();
    if (!value || value.length > 500 || /[\0\r\n]/.test(value)) {
      throw new Error('MEMORY_LINK_EVIDENCE_REF_INVALID');
    }
    if (/^(?:chat|session):/i.test(value)) throw new Error('MEMORY_LINK_EVIDENCE_REF_RUNTIME_SCOPE_FORBIDDEN');
    if (value.toLowerCase().startsWith('memory:')) {
      const memoryId = value.slice('memory:'.length);
      if (!validIds.has(memoryId)) throw new Error(`Linked memory evidence not found: ${memoryId}`);
    }
    if (!output.includes(value)) output.push(value);
    if (output.length >= MAX_EVIDENCE_REFS) break;
  }
  return output.length ? output : undefined;
}

function normalizeLink(raw: MemoryLink, validIds: Set<string>): MemoryLink {
  const validFrom = normalizeIso(raw.validFrom, 'MEMORY_LINK_VALID_FROM_INVALID');
  const validTo = normalizeIso(raw.validTo, 'MEMORY_LINK_VALID_TO_INVALID');
  const referenceTime = normalizeIso(raw.referenceTime, 'MEMORY_LINK_REFERENCE_TIME_INVALID');
  if (validFrom && validTo && Date.parse(validTo) < Date.parse(validFrom)) {
    throw new Error('MEMORY_LINK_VALIDITY_RANGE_INVALID');
  }
  const createdAt = normalizeIso(raw.createdAt, 'MEMORY_LINK_CREATED_AT_INVALID');
  if (!createdAt) throw new Error('MEMORY_LINK_CREATED_AT_INVALID');
  const evidenceRefs = normalizeEvidenceRefs(raw.evidenceRefs, validIds);
  return {
    targetId: raw.targetId,
    type: raw.type,
    strength: Math.max(0, Math.min(1, raw.strength)),
    createdAt,
    ...(raw.reason?.trim() ? { reason: raw.reason.trim().slice(0, 500) } : {}),
    ...(validFrom ? { validFrom } : {}),
    ...(validTo ? { validTo } : {}),
    ...(referenceTime ? { referenceTime } : {}),
    ...(evidenceRefs ? { evidenceRefs } : {}),
  };
}

function earliestIso(left?: string, right?: string): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function mergeDuplicate(existing: MemoryLink, incoming: MemoryLink): MemoryLink {
  const evidenceRefs = [...new Set([...(existing.evidenceRefs ?? []), ...(incoming.evidenceRefs ?? [])])]
    .slice(0, MAX_EVIDENCE_REFS);
  const validFrom = earliestIso(existing.validFrom, incoming.validFrom);
  const validTo = existing.validTo && incoming.validTo
    ? earliestIso(existing.validTo, incoming.validTo)
    : existing.validTo ?? incoming.validTo;
  const temporalIsValid = !validFrom || !validTo || Date.parse(validTo) >= Date.parse(validFrom);
  return {
    ...existing,
    createdAt: earliestIso(existing.createdAt, incoming.createdAt)!,
    strength: Math.max(existing.strength, incoming.strength),
    ...(incoming.strength >= existing.strength && incoming.reason
      ? { reason: incoming.reason }
      : existing.reason ? { reason: existing.reason } : {}),
    ...(temporalIsValid && validFrom ? { validFrom } : existing.validFrom ? { validFrom: existing.validFrom } : {}),
    ...(temporalIsValid && validTo ? { validTo } : existing.validTo ? { validTo: existing.validTo } : {}),
    ...(existing.referenceTime || incoming.referenceTime
      ? { referenceTime: existing.referenceTime ?? incoming.referenceTime }
      : {}),
    ...(evidenceRefs.length ? { evidenceRefs } : {}),
  };
}

export function isMemoryLinkActive(link: MemoryLink, at = Date.now()): boolean {
  if (link.validFrom && Date.parse(link.validFrom) > at) return false;
  if (link.validTo && Date.parse(link.validTo) <= at) return false;
  return true;
}

export function normalizeLinks(ownerId: string, links: MemoryLink[], validIds: Set<string>): MemoryLink[] {
  const positions = new Map<string, number>();
  const output: MemoryLink[] = [];
  for (const raw of links) {
    if (raw.targetId === ownerId) throw new Error('Memory cannot link to itself');
    if (!validIds.has(raw.targetId)) throw new Error(`Linked memory not found: ${raw.targetId}`);
    const link = normalizeLink(raw, validIds);
    const key = `${link.targetId}\u0000${link.type}`;
    const position = positions.get(key);
    if (position !== undefined) {
      output[position] = mergeDuplicate(output[position]!, link);
      continue;
    }
    if (output.length >= 32) continue;
    positions.set(key, output.length);
    output.push(link);
  }
  return output;
}

export function relatedByMetadata(a: MemoryRecord, b: MemoryRecord): number {
  const aTerms = new Set([...a.keywords, ...a.tags, a.category].map((v) => v.toLowerCase()).filter(Boolean));
  const bTerms = new Set([...b.keywords, ...b.tags, b.category].map((v) => v.toLowerCase()).filter(Boolean));
  if (aTerms.size === 0 || bTerms.size === 0) return 0;
  let intersection = 0;
  for (const term of aTerms) if (bTerms.has(term)) intersection++;
  return intersection / Math.max(aTerms.size, bTerms.size);
}
