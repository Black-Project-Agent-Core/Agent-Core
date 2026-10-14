import { createHash } from 'node:crypto';
import { normalizeMemoryProvenance, normalizeMemoryWorkspace } from './provenance.js';
import { normalizeLinks } from './relations.js';
import { validateMemoryId } from './note-format.js';
import { MEMORY_SCHEMA_VERSION, type MemoryLink, type MemoryProvenance, type MemoryRecord } from './types.js';

export const MEMORY_TRANSFER_VERSION = 'agent-core-memory-transfer/1' as const;
const MAX_TRANSFER_RECORDS = 500;

export interface MemoryTransferRecord {
  sourceId: string;
  importKey: string;
  title?: string;
  content: string;
  keywords: string[];
  context: string;
  tags: string[];
  category: string;
  expiresAt?: string;
  links: MemoryLink[];
  source?: MemoryRecord['source'];
  provenance?: MemoryProvenance;
}

export interface MemoryTransferPayload {
  version: typeof MEMORY_TRANSFER_VERSION;
  exportedAt: string;
  workspace?: string;
  records: MemoryTransferRecord[];
}

export interface MemoryImportOptions {
  allowedSourceWorkspaces?: string[];
  allowUnscoped?: boolean;
}

export interface MemoryImportPlan {
  version: 1;
  creates: Array<{ sourceId: string; targetId: string; importKey: string; remapped: boolean }>;
  duplicates: Array<{ sourceId: string; targetId: string; importKey: string }>;
  rejected: Array<{ sourceId: string; reason: string }>;
  idMap: Record<string, string>;
  recordsToCreate: MemoryRecord[];
}

function sha256(value: string): string {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}

function unique(values: unknown, max: number, field: string): string[] {
  if (!Array.isArray(values)) throw new Error(`MEMORY_TRANSFER_${field.toUpperCase()}_INVALID`);
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))].slice(0, max);
}

function stableImportKey(record: MemoryRecord): string {
  if (record.provenance?.importKey && /^sha256:[0-9a-f]{64}$/i.test(record.provenance.importKey)) {
    return record.provenance.importKey.toLowerCase();
  }
  return sha256(JSON.stringify({
    id: record.id,
    title: record.title ?? '',
    content: record.content,
    keywords: [...record.keywords].sort(),
    context: record.context,
    tags: [...record.tags].sort(),
    category: record.category,
    expiresAt: record.expiresAt ?? '',
    links: record.links.map(link => ({
      targetId: link.targetId,
      type: link.type,
      strength: link.strength,
      reason: link.reason ?? '',
      validFrom: link.validFrom ?? '',
      validTo: link.validTo ?? '',
      referenceTime: link.referenceTime ?? '',
      evidenceRefs: [...(link.evidenceRefs ?? [])].sort(),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    source: record.source ?? null,
    provenance: record.provenance ? {
      workspace: record.provenance.workspace ?? '',
      repo: record.provenance.repo ?? '',
      files: [...record.provenance.files].sort(),
      gitCommit: record.provenance.gitCommit ?? '',
      gitRef: record.provenance.gitRef ?? '',
      identity: record.provenance.identity ?? null,
      ...(record.provenance.sourceSnapshot ? { sourceSnapshot: record.provenance.sourceSnapshot } : {}),
    } : null,
  }));
}

export function buildMemoryTransferPayload(records: MemoryRecord[], workspace?: string): MemoryTransferPayload {
  const normalizedWorkspace = workspace ? normalizeMemoryWorkspace(workspace) : undefined;
  const selected = records
    .filter(record => !record.pinned)
    .filter(record => !normalizedWorkspace
      || (record.provenance?.workspace && normalizeMemoryWorkspace(record.provenance.workspace) === normalizedWorkspace))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (selected.length > MAX_TRANSFER_RECORDS) {
    throw new Error(`MEMORY_EXPORT_TOO_LARGE: count=${selected.length} max=${MAX_TRANSFER_RECORDS}`);
  }
  return {
    version: MEMORY_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    ...(normalizedWorkspace ? { workspace: normalizedWorkspace } : {}),
    records: selected.map(record => ({
      sourceId: record.id,
      importKey: stableImportKey(record),
      ...(record.title ? { title: record.title } : {}),
      content: record.content,
      keywords: [...record.keywords],
      context: record.context,
      tags: [...record.tags],
      category: record.category,
      ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
      links: record.links.map(link => ({ ...link, ...(link.evidenceRefs ? { evidenceRefs: [...link.evidenceRefs] } : {}) })),
      ...(record.source ? { source: { ...record.source } } : {}),
      ...(record.provenance ? { provenance: structuredClone(record.provenance) } : {}),
    })),
  };
}

function parsePayload(raw: unknown): MemoryTransferPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('MEMORY_TRANSFER_PAYLOAD_INVALID');
  const input = raw as Partial<MemoryTransferPayload>;
  if (input.version !== MEMORY_TRANSFER_VERSION || !Array.isArray(input.records)) {
    throw new Error('MEMORY_TRANSFER_VERSION_INVALID');
  }
  if (input.records.length > MAX_TRANSFER_RECORDS) throw new Error('MEMORY_TRANSFER_TOO_MANY_RECORDS');
  const exportedAt = typeof input.exportedAt === 'string' && Number.isFinite(Date.parse(input.exportedAt))
    ? new Date(input.exportedAt).toISOString()
    : new Date(0).toISOString();
  const workspace = typeof input.workspace === 'string' && input.workspace.trim()
    ? normalizeMemoryWorkspace(input.workspace)
    : undefined;
  const records = input.records.map((rawRecord) => {
    if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) throw new Error('MEMORY_TRANSFER_RECORD_INVALID');
    const record = rawRecord as unknown as Record<string, unknown>;
    const sourceId = validateMemoryId(String(record.sourceId ?? ''));
    const importKey = String(record.importKey ?? '').trim().toLowerCase();
    if (!/^sha256:[0-9a-f]{64}$/.test(importKey)) throw new Error('MEMORY_TRANSFER_IMPORT_KEY_INVALID');
    const content = String(record.content ?? '').trim();
    if (!content || content.length > 200_000) throw new Error('MEMORY_TRANSFER_CONTENT_INVALID');
    const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim().slice(0, 200) : undefined;
    const context = typeof record.context === 'string' && record.context.trim() ? record.context.trim().slice(0, 2_000) : 'General';
    const category = typeof record.category === 'string' && record.category.trim() ? record.category.trim().slice(0, 200) : 'Uncategorized';
    const expiresAt = typeof record.expiresAt === 'string' && record.expiresAt.trim()
      ? (Number.isFinite(Date.parse(record.expiresAt)) ? new Date(record.expiresAt).toISOString() : (() => { throw new Error('MEMORY_TRANSFER_EXPIRES_AT_INVALID'); })())
      : undefined;
    const source = record.source && typeof record.source === 'object' && !Array.isArray(record.source)
      ? record.source as MemoryRecord['source']
      : undefined;
    const provenance = record.provenance && typeof record.provenance === 'object' && !Array.isArray(record.provenance)
      ? normalizeMemoryProvenance(record.provenance as MemoryProvenance)
      : undefined;
    const links = Array.isArray(record.links)
      ? (record.links as MemoryLink[]).map(link => ({ ...link, evidenceRefs: link.evidenceRefs ? [...link.evidenceRefs] : undefined }))
      : [];
    return {
      sourceId,
      importKey,
      ...(title ? { title } : {}),
      content,
      keywords: unique(record.keywords ?? [], 64, 'keywords'),
      context,
      tags: unique(record.tags ?? [], 64, 'tags'),
      category,
      ...(expiresAt ? { expiresAt } : {}),
      links,
      ...(source ? { source } : {}),
      ...(provenance ? { provenance } : {}),
    } satisfies MemoryTransferRecord;
  });
  return { version: MEMORY_TRANSFER_VERSION, exportedAt, ...(workspace ? { workspace } : {}), records };
}

function deterministicTargetId(importKey: string): string {
  return `import-${importKey.slice('sha256:'.length, 'sha256:'.length + 40)}`;
}

export function planMemoryImport(
  rawPayload: unknown,
  current: MemoryRecord[],
  options: MemoryImportOptions = {},
): MemoryImportPlan {
  const payload = parsePayload(rawPayload);
  const allowed = new Set((options.allowedSourceWorkspaces ?? ['agent-core']).map(value => normalizeMemoryWorkspace(value)));
  const currentById = new Map(current.map(record => [record.id, record]));
  const currentByImportKey = new Map(
    current.flatMap(record => record.provenance?.importKey ? [[record.provenance.importKey.toLowerCase(), record] as const] : []),
  );
  const idMap = new Map<string, string>();
  const creates: MemoryImportPlan['creates'] = [];
  const duplicates: MemoryImportPlan['duplicates'] = [];
  const rejected: MemoryImportPlan['rejected'] = [];
  const pending: MemoryTransferRecord[] = [];

  for (const record of payload.records) {
    const sourceWorkspace = record.provenance?.workspace;
    if (!sourceWorkspace && !options.allowUnscoped) {
      rejected.push({ sourceId: record.sourceId, reason: 'unscoped-source-requires-explicit-allowUnscoped' });
      continue;
    }
    if (sourceWorkspace && !allowed.has(normalizeMemoryWorkspace(sourceWorkspace))) {
      rejected.push({ sourceId: record.sourceId, reason: `unauthorized-source-workspace:${sourceWorkspace}` });
      continue;
    }
    const duplicate = currentByImportKey.get(record.importKey);
    if (duplicate) {
      idMap.set(record.sourceId, duplicate.id);
      duplicates.push({ sourceId: record.sourceId, targetId: duplicate.id, importKey: record.importKey });
      continue;
    }

    let targetId = record.sourceId;
    const occupied = currentById.get(targetId);
    if (occupied) targetId = deterministicTargetId(record.importKey);
    const alternate = currentById.get(targetId);
    if (alternate && alternate.provenance?.importKey?.toLowerCase() !== record.importKey) {
      rejected.push({ sourceId: record.sourceId, reason: 'deterministic-target-id-collision' });
      continue;
    }
    idMap.set(record.sourceId, targetId);
    pending.push(record);
    creates.push({ sourceId: record.sourceId, targetId, importKey: record.importKey, remapped: targetId !== record.sourceId });
  }

  const recordsToCreate: MemoryRecord[] = [];
  const currentIds = new Set(current.map(record => record.id));
  const allTargetIds = new Set([...currentIds, ...idMap.values()]);
  const now = new Date().toISOString();

  for (const record of pending) {
    const targetId = idMap.get(record.sourceId)!;
    try {
      const remappedLinks = record.links.map(link => {
        const mapped = idMap.get(link.targetId) ?? (currentIds.has(link.targetId) ? link.targetId : undefined);
        if (!mapped) throw new Error(`unresolved-link-target:${link.targetId}`);
        const evidenceRefs = link.evidenceRefs?.map(ref => {
          if (!ref.toLowerCase().startsWith('memory:')) return ref;
          const sourceEvidenceId = ref.slice('memory:'.length);
          const mappedEvidence = idMap.get(sourceEvidenceId) ?? (currentIds.has(sourceEvidenceId) ? sourceEvidenceId : undefined);
          if (!mappedEvidence) throw new Error(`unresolved-evidence-target:${sourceEvidenceId}`);
          return `memory:${mappedEvidence}`;
        });
        return { ...link, targetId: mapped, ...(evidenceRefs ? { evidenceRefs } : {}) };
      });
      const links = normalizeLinks(targetId, remappedLinks, allTargetIds);
      const provenance = normalizeMemoryProvenance({
        ...(record.provenance ?? { files: [] }),
        importKey: record.importKey,
      });
      recordsToCreate.push({
        version: MEMORY_SCHEMA_VERSION,
        id: targetId,
        ...(record.title ? { title: record.title } : {}),
        content: record.content,
        keywords: [...record.keywords],
        context: record.context,
        tags: [...record.tags],
        category: record.category,
        links,
        ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: null,
        retrievalCount: 0,
        evolutionHistory: [{
          kind: 'created',
          timestamp: now,
          source: 'controller',
          changedFields: ['content', 'metadata', 'provenance'],
          details: { imported: true, sourceId: record.sourceId, importKey: record.importKey },
        }],
        pinned: false,
        ...(record.source ? { source: { ...record.source } } : {}),
        provenance,
      });
    } catch (error) {
      rejected.push({ sourceId: record.sourceId, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const rejectedIds = new Set(rejected.map(item => item.sourceId));
  return {
    version: 1,
    creates: creates.filter(item => !rejectedIds.has(item.sourceId)),
    duplicates,
    rejected,
    idMap: Object.fromEntries([...idMap.entries()].filter(([sourceId]) => !rejectedIds.has(sourceId))),
    recordsToCreate: recordsToCreate.filter(record => !rejectedIds.has(
      creates.find(item => item.targetId === record.id)?.sourceId ?? '',
    )),
  };
}
