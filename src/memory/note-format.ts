import path from 'node:path';
import { z } from 'zod';
import { isoInstantSchema,recordExperienceSchema } from './experience-types.js';
import type { EvolutionEvent, MemoryLink, MemoryLinkType, MemoryRecord, MemoryProvenance } from './types.js';
import { MEMORY_SCHEMA_VERSION } from './types.js';
import { normalizeRepositoryIdentity } from './provenance.js';
import { normalizeMemorySourceSnapshot } from './source-snapshot.js';

const HEADER_RE = /^<!-- agent-core-memory\s*\n([\s\S]*?)\n-->\s*\n?/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const LINK_TYPES = new Set<MemoryLinkType>(['related', 'supports', 'supersedes', 'contradicts', 'derived-from']);
const MAX_HISTORY = 64;

function assertCanonicalText(value: string): void {
  if (!value.trim()) throw new Error('Canonical memory content is empty');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
    throw new Error('Canonical memory contains binary control characters');
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`Invalid memory ${name}`);
  return value.map((item) => item.trim()).filter(Boolean);
}

function iso(value: unknown, name: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid memory ${name}`);
  return new Date(value).toISOString();
}

export function validateMemoryId(id: string): string {
  const normalized = id.trim();
  if (!ID_RE.test(normalized)) throw new Error(`Invalid memory id: ${id}`);
  return normalized;
}

function links(value: unknown,preserveSegments=false): MemoryLink[] {
  if (!Array.isArray(value)) throw new Error('Invalid memory links');
  const output: MemoryLink[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('Invalid memory link');
    const raw = item as Record<string, unknown>;
    const targetId = validateMemoryId(String(raw.targetId ?? ''));
    const type = String(raw.type ?? 'related') as MemoryLinkType;
    if (!LINK_TYPES.has(type)) throw new Error(`Invalid memory link type: ${type}`);
    const strength = Number(raw.strength);
    if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error('Invalid memory link strength');
    const createdAt = iso(raw.createdAt, 'link createdAt') as string;
    const validFrom = raw.validFrom === undefined ? undefined : iso(raw.validFrom, 'link validFrom') as string;
    const validTo = raw.validTo === undefined ? undefined : iso(raw.validTo, 'link validTo') as string;
    const referenceTime = raw.referenceTime === undefined ? undefined : iso(raw.referenceTime, 'link referenceTime') as string;
    if (validFrom && validTo && Date.parse(validTo) < Date.parse(validFrom)) throw new Error('Invalid memory link validity range');
    const evidenceRefs = raw.evidenceRefs === undefined
      ? undefined
      : strings(raw.evidenceRefs, 'link evidenceRefs').map(item => item.trim()).filter(Boolean).slice(0, 16);
    if (evidenceRefs?.some(item => /^(?:chat|session):/i.test(item))) throw new Error('Invalid memory link runtime evidence ref');
    const key = `${targetId}\u0000${type}`+(preserveSegments?`\u0000${validFrom??''}\u0000${validTo??''}`:'');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      targetId,
      type,
      strength,
      createdAt,
      ...(typeof raw.reason === 'string' && raw.reason.trim() ? { reason: raw.reason.trim() } : {}),
      ...(validFrom ? { validFrom } : {}),
      ...(validTo ? { validTo } : {}),
      ...(referenceTime ? { referenceTime } : {}),
      ...(evidenceRefs?.length ? { evidenceRefs } : {}),
    });
  }
  return output;
}

function provenance(value: unknown): MemoryProvenance | undefined {
    if (value === undefined)
        return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid memory provenance');
    const raw = value as Record<string, unknown>;
    const files = strings(raw.files ?? [], 'provenance files').slice(0, 64).map((item) => {
        const normalized = item.replace(/\\/g, '/').replace(/^\.\//, '');
        if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
            throw new Error('Invalid memory provenance file');
        }
        const parts = normalized.split('/');
        if (parts.some((part) => part === '..'))
            throw new Error('Invalid memory provenance file');
        return normalized;
    });
    const gitCommit = typeof raw.gitCommit === 'string' && raw.gitCommit.trim() ? raw.gitCommit.trim() : undefined;
    if (gitCommit && !/^[0-9a-fA-F]{7,64}$/.test(gitCommit))
        throw new Error('Invalid memory provenance gitCommit');
    const identity = raw.identity && typeof raw.identity === 'object' && !Array.isArray(raw.identity)
        ? normalizeRepositoryIdentity(raw.identity as MemoryProvenance['identity'])
        : undefined;
    return {
        files: [...new Set(files)],
        ...(typeof raw.workspace === 'string' && raw.workspace.trim() ? { workspace: raw.workspace.trim().slice(0, 120) } : {}),
        ...(typeof raw.repo === 'string' && raw.repo.trim() ? { repo: raw.repo.trim().slice(0, 160) } : {}),
        ...(gitCommit ? { gitCommit } : {}),
        ...(typeof raw.gitRef === 'string' && raw.gitRef.trim() ? { gitRef: raw.gitRef.trim().slice(0, 240) } : {}),
        ...(typeof raw.importKey === 'string' && /^sha256:[0-9a-f]{64}$/i.test(raw.importKey) ? { importKey: raw.importKey.toLowerCase() } : {}),
        ...(typeof raw.importKey === 'string' && !/^sha256:[0-9a-f]{64}$/i.test(raw.importKey) ? (() => { throw new Error('Invalid memory provenance importKey'); })() : {}),
        ...(identity ? { identity } : {}),
        ...(raw.sourceSnapshot !== undefined ? { sourceSnapshot: normalizeMemorySourceSnapshot(raw.sourceSnapshot, [...new Set(files)]) } : {}),
    };
}

function history(value: unknown, preserve = false): EvolutionEvent[] {
  if (!Array.isArray(value)) throw new Error('Invalid memory evolutionHistory');
  return (preserve ? value : value.slice(-MAX_HISTORY)).map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid memory evolution event');
    const raw = item as Record<string, unknown>;
    const kind = String(raw.kind ?? '') as EvolutionEvent['kind'];
    const source = String(raw.source ?? '') as EvolutionEvent['source'];
    const allowedKinds = new Set(['metadata_enriched', 'link_added', 'link_strengthened', 'link_removed', 'context_changed', 'tags_changed', 'content_updated', 'superseded', 'retrieved', 'created', 'updated']);
    const allowedSources = new Set(['user', 'controller', 'deterministic', 'intelligence', 'system']);
    if (!allowedKinds.has(kind) || !allowedSources.has(source)) throw new Error('Invalid memory evolution event');
    const timestamp = iso(raw.timestamp, 'evolution timestamp') as string;
    const changedFields = raw.changedFields === undefined ? undefined : strings(raw.changedFields, 'changedFields');
    const details = raw.details && typeof raw.details === 'object' && !Array.isArray(raw.details) ? raw.details as Record<string, unknown> : undefined;
    return { kind, timestamp, source, ...(changedFields?.length ? { changedFields } : {}), ...(details ? { details } : {}) };
  });
}

const optionalText = z.string().optional();
const stringList = z.array(z.string());
export const v2MetadataSchema = z.strictObject({
  version:z.literal(2),id:z.string(),title:optionalText,content:optionalText,
  keywords:stringList,context:z.string(),tags:stringList,category:z.string(),
  // Legacy link fields cannot express uncertainty; v2 must reject ambiguous times.
  links:z.array(z.strictObject({targetId:z.string(),type:z.string(),strength:z.number(),createdAt:isoInstantSchema,reason:optionalText,
    validFrom:isoInstantSchema.optional(),validTo:isoInstantSchema.optional(),referenceTime:isoInstantSchema.optional(),evidenceRefs:stringList.max(16).optional()})),
  createdAt:z.string(),updatedAt:z.string(),expiresAt:optionalText,lastAccessedAt:z.string().nullable(),
  retrievalCount:z.number().int().nonnegative(),pinned:z.boolean(),
  source:z.strictObject({type:z.string(),ref:optionalText}).optional(),
  provenance:z.strictObject({workspace:optionalText,repo:optionalText,files:stringList.max(64),gitCommit:optionalText,gitRef:optionalText,importKey:optionalText,
    identity:z.strictObject({kind:z.enum(['git','directory']),repositoryId:z.string(),worktreeId:z.string(),
      checkpoint:z.strictObject({head:optionalText,ref:optionalText,statusDigest:optionalText,statusEntryCount:z.number().optional(),renamedCount:z.number().optional(),untrackedCount:z.number().optional(),renamedPathDigest:optionalText,untrackedPathDigest:optionalText}).optional()}).optional(),
    sourceSnapshot:z.strictObject({version:z.literal(1),observedAt:z.string(),files:z.array(z.union([
      z.strictObject({path:z.string(),status:z.literal('captured'),digest:z.string(),bytes:z.number()}),
      z.strictObject({path:z.string(),status:z.literal('unavailable'),reason:z.string()}),
    ]))}).optional(),
  }).optional(),
  evolutionHistory:z.array(z.strictObject({kind:z.string(),timestamp:z.string(),source:z.string(),changedFields:stringList.optional(),details:z.record(z.string(),z.unknown()).optional()})),
  experience:recordExperienceSchema,
});

export function normalizeRecord(raw: unknown, content: string): MemoryRecord {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid memory metadata');
  const meta = raw as Record<string, unknown>;
  if (meta.version === 2) v2MetadataSchema.parse(meta);
  if (meta.version !== 2 && meta.version !== MEMORY_SCHEMA_VERSION) throw new Error(`Unsupported memory version: ${String(meta.version)}`);
  const id = validateMemoryId(String(meta.id ?? ''));
  assertCanonicalText(content);
  const body = content.trim();
  if (!body) throw new Error('Memory content is empty');
  const createdAt = iso(meta.createdAt, 'createdAt') as string;
  const updatedAt = iso(meta.updatedAt, 'updatedAt') as string;
  const expiresAt = meta.expiresAt === undefined ? undefined : iso(meta.expiresAt, 'expiresAt') as string;
  const lastAccessedAt = iso(meta.lastAccessedAt ?? null, 'lastAccessedAt', true);
  const retrievalCount = Number(meta.retrievalCount ?? 0);
  if (!Number.isSafeInteger(retrievalCount) || retrievalCount < 0) throw new Error('Invalid memory retrievalCount');
  const pinned = Boolean(meta.pinned);
  const source = meta.source && typeof meta.source === 'object' && !Array.isArray(meta.source)
    ? meta.source as { type: string; ref?: string }
    : undefined;
  return {
    ...(meta.version === 2 ? {version:2 as const,experience:recordExperienceSchema.parse(meta.experience)} : {version:MEMORY_SCHEMA_VERSION}),
    id,
    ...(typeof meta.title === 'string' && meta.title.trim() ? { title: meta.title.trim() } : {}),
    content: body,
    keywords: strings(meta.keywords ?? [], 'keywords'),
    context: typeof meta.context === 'string' && meta.context.trim() ? meta.context.trim() : 'General',
    tags: strings(meta.tags ?? [], 'tags'),
    category: typeof meta.category === 'string' && meta.category.trim() ? meta.category.trim() : 'Uncategorized',
    links: links(meta.links ?? [],meta.version===2),
    createdAt,
    updatedAt,
    ...(expiresAt ? { expiresAt } : {}),
    lastAccessedAt,
    retrievalCount,
    evolutionHistory: history(meta.evolutionHistory ?? [], meta.version === 2),
    pinned,
    ...(source && typeof source.type === 'string' ? { source } : {}),
    ...(provenance(meta.provenance) ? { provenance: provenance(meta.provenance) } : {}),
  };
}

export function parseCanonicalNote(serialized: string): MemoryRecord {
  const normalized = serialized.replace(/^\uFEFF/, '');
  assertCanonicalText(normalized);
  const match = HEADER_RE.exec(normalized);
  if (!match) throw new Error('Missing agent-core-memory metadata block');
  let metadata: unknown;
  try { metadata = JSON.parse(match[1]); } catch { throw new Error('Invalid memory metadata JSON'); }
  return normalizeRecord(metadata, normalized.slice(match[0].length));
}

export function serializeCanonicalNote(record: MemoryRecord): string {
  if (record.version === 2) v2MetadataSchema.parse(record);
  const { content, ...metadata } = record;
  assertCanonicalText(content);
  return `<!-- agent-core-memory\n${JSON.stringify(metadata)}\n-->\n\n${content.trim()}\n`;
}

export function bootstrapRecord(serialized: string, filePath: string): MemoryRecord {
  const now = new Date(0).toISOString();
  const normalized = serialized.replace(/^\uFEFF/, '');
  assertCanonicalText(normalized);
  const firstHeading = normalized.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  if (!firstHeading || !/\bAgent[ -]Core\b/i.test(firstHeading))
    throw new Error('Invalid Agent Core foundation heading');
  return {
    version: MEMORY_SCHEMA_VERSION,
    id: 'agent-core-foundational',
    title: firstHeading?.replace(/^#\s+/, '').trim() || 'Agent Core Foundational Memory',
    content: normalized.trim(),
    keywords: ['agent-core', 'identity', 'protocol', 'architecture', 'memory'],
    context: 'Pinned foundational operating context for Agent Core controllers.',
    tags: ['agent-core', 'bootstrap', 'identity', 'protocol'],
    category: 'foundation',
    links: [],
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: null,
    retrievalCount: 0,
    evolutionHistory: [],
    pinned: true,
    source: { type: 'bootstrap-file', ref: path.basename(filePath) },
  };
}

export function boundedHistory(events: EvolutionEvent[], event: EvolutionEvent, max = MAX_HISTORY): EvolutionEvent[] {
  return [...events, event].slice(-max);
}
