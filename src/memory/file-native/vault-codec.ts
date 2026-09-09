import {
  MEMORY_ENFORCEMENTS, MEMORY_KINDS, MEMORY_RELATIONS, MEMORY_STATES,
  type MemoryEnforcement, type MemoryKind, type MemoryRelation, type MemoryState,
} from '../types.js';
import type { MemoryContextFamily, VaultMemoryEntry, VaultRelation, VaultSegment } from './types.js';

const CONTEXT_FAMILIES = new Set<MemoryContextFamily>([
  'project','brainstorming','coding','decision','failure','procedure','task','artifact','guardrail','relationship','general',
]);
const kindSet = new Set<string>(MEMORY_KINDS);
const stateSet = new Set<string>(MEMORY_STATES);
const enforcementSet = new Set<string>(MEMORY_ENFORCEMENTS);
const relationSet = new Set<string>(MEMORY_RELATIONS);

function scalar(value: string): string {
  return JSON.stringify(value);
}
function parseScalar(value: string): string {
  try { const parsed = JSON.parse(value); if (typeof parsed === 'string') return parsed; } catch {}
  throw new Error('MEMORY_VAULT_FRONTMATTER_INVALID');
}
function optionalScalar(value: string | undefined): string | undefined {
  return value === undefined || value === 'null' ? undefined : parseScalar(value);
}
function assertEntry(value: unknown): VaultMemoryEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('MEMORY_VAULT_ENTRY_INVALID');
  const e = value as Record<string, unknown>;
  const requiredStrings = ['memoryId','revisionId','canonicalKey','kind','state','enforcement','valueText','valueHash'];
  if (requiredStrings.some((k) => typeof e[k] !== 'string' || !(e[k] as string))) throw new Error('MEMORY_VAULT_ENTRY_INVALID');
  if (!kindSet.has(String(e.kind)) || !stateSet.has(String(e.state)) || !enforcementSet.has(String(e.enforcement))) throw new Error('MEMORY_VAULT_ENTRY_INVALID');
  if (!Number.isInteger(e.revisionNo) || Number(e.revisionNo) < 1 || !Number.isFinite(e.importance) || Number(e.importance) < 0 || Number(e.importance) > 1) throw new Error('MEMORY_VAULT_ENTRY_INVALID');
  if (typeof e.pinned !== 'boolean' || !Number.isFinite(e.createdAt) || !Number.isFinite(e.updatedAt)) throw new Error('MEMORY_VAULT_ENTRY_INVALID');
  if (!Array.isArray(e.relations)) throw new Error('MEMORY_VAULT_ENTRY_INVALID');
  const relations = e.relations.map((r): VaultRelation => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('MEMORY_VAULT_ENTRY_INVALID');
    const x = r as Record<string, unknown>;
    if (typeof x.targetMemoryId !== 'string' || !x.targetMemoryId || typeof x.relation !== 'string' || !relationSet.has(x.relation) || !Number.isFinite(x.weight)) throw new Error('MEMORY_VAULT_ENTRY_INVALID');
    return {
      targetMemoryId: x.targetMemoryId,
      ...(typeof x.targetFile === 'string' ? { targetFile: x.targetFile } : {}),
      relation: x.relation as MemoryRelation,
      weight: Number(x.weight),
      ...(typeof x.evidenceEventId === 'string' ? { evidenceEventId: x.evidenceEventId } : {}),
      ...(Array.isArray(x.evidenceRefs) && x.evidenceRefs.every(v => typeof v === 'string') ? { evidenceRefs: [...x.evidenceRefs] as string[] } : {}),
    };
  });
  return {
    memoryId: String(e.memoryId), revisionId: String(e.revisionId), revisionNo: Number(e.revisionNo),
    canonicalKey: String(e.canonicalKey), kind: e.kind as MemoryKind, state: e.state as MemoryState,
    importance: Number(e.importance), pinned: e.pinned as boolean, enforcement: e.enforcement as MemoryEnforcement,
    valueText: String(e.valueText), ...(typeof e.valueJson === 'string' ? { valueJson: e.valueJson } : {}),
    valueHash: String(e.valueHash), ...(typeof e.sourceEventId === 'string' ? { sourceEventId: e.sourceEventId } : {}),
    createdAt: Number(e.createdAt), updatedAt: Number(e.updatedAt), ...(typeof e.title === 'string' ? { title: e.title } : {}),
    ...(Array.isArray(e.anchors) && e.anchors.every(a => a && typeof a === 'object' && typeof (a as Record<string, unknown>).type === 'string' && typeof (a as Record<string, unknown>).value === 'string') ? { anchors: (e.anchors as Array<Record<string, unknown>>).map(a => ({ type: String(a.type), value: String(a.value) })) } : {}), relations,
  };
}

function stableEntryJson(entry: VaultMemoryEntry): string {
  const out: Record<string, unknown> = {
    memoryId: entry.memoryId, revisionId: entry.revisionId, revisionNo: entry.revisionNo,
    canonicalKey: entry.canonicalKey, kind: entry.kind, state: entry.state, importance: entry.importance,
    pinned: entry.pinned, enforcement: entry.enforcement, valueText: entry.valueText,
    ...(entry.valueJson === undefined ? {} : { valueJson: entry.valueJson }), valueHash: entry.valueHash,
    ...(entry.sourceEventId === undefined ? {} : { sourceEventId: entry.sourceEventId }),
    createdAt: entry.createdAt, updatedAt: entry.updatedAt,
    ...(entry.title === undefined ? {} : { title: entry.title }),
    ...(entry.anchors === undefined ? {} : { anchors: entry.anchors.map(a => ({ type: a.type, value: a.value })) }),
    relations: entry.relations.map(r => ({
      targetMemoryId: r.targetMemoryId, ...(r.targetFile ? { targetFile: r.targetFile } : {}), relation: r.relation, weight: r.weight,
      ...(r.evidenceEventId ? { evidenceEventId: r.evidenceEventId } : {}), ...(r.evidenceRefs ? { evidenceRefs: r.evidenceRefs } : {}),
    })),
  };
  return JSON.stringify(out);
}

export function serializeVaultSegment(segment: VaultSegment): string {
  const front = [
    '---', 'schema_version: 1', `file_id: ${scalar(segment.fileId)}`, `context_family: ${scalar(segment.contextFamily)}`,
    `principal_id: ${scalar(segment.principalId)}`, `project_id: ${scalar(segment.projectId)}`, `topic_key: ${scalar(segment.topicKey)}`, `segment_no: ${segment.segmentNo}`,
    `previous_file: ${segment.previousFile ? scalar(segment.previousFile) : 'null'}`,
    `next_file: ${segment.nextFile ? scalar(segment.nextFile) : 'null'}`,
    `created_at: ${scalar(segment.createdAt)}`, `updated_at: ${scalar(segment.updatedAt)}`, '---', '',
  ];
  const body: string[] = [];
  if (segment.previousFile) body.push(`Continued from [[${segment.previousFile.replace(/\.md$/i, '')}]]`, '');
  if (segment.nextFile) body.push(`Continues in [[${segment.nextFile.replace(/\.md$/i, '')}]]`, '');
  for (const entry of segment.entries) {
    body.push(`## ${entry.memoryId}${entry.title ? ` — ${entry.title}` : ''}`);
    body.push('<!-- agent-core-memory');
    body.push(stableEntryJson(entry));
    body.push('-->', '', entry.valueText, '', '### Relations');
    if (!entry.relations.length) body.push('- none');
    else for (const r of entry.relations) {
      const target = `${r.targetFile ? r.targetFile.replace(/\.md$/i, '') : ''}${r.targetFile ? '#' : '#'}${r.targetMemoryId}`;
      body.push(`- ${r.relation}: [[${target}]]`);
    }
    body.push('');
  }
  return [...front, ...body].join('\n').replace(/\n+$/, '\n');
}

export function parseVaultSegment(text: string, relativePath: string): VaultSegment {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!fm) throw new Error('MEMORY_VAULT_FRONTMATTER_INVALID');
  const fields = new Map<string,string>();
  for (const line of fm[1]!.split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/); if (!m) throw new Error('MEMORY_VAULT_FRONTMATTER_INVALID'); fields.set(m[1]!, m[2]!);
  }
  if (fields.get('schema_version') !== '1') throw new Error('MEMORY_VAULT_SCHEMA_UNSUPPORTED');
  const contextFamily = parseScalar(fields.get('context_family') ?? '') as MemoryContextFamily;
  if (!CONTEXT_FAMILIES.has(contextFamily)) throw new Error('MEMORY_VAULT_FRONTMATTER_INVALID');
  const segmentNo = Number(fields.get('segment_no'));
  if (!Number.isInteger(segmentNo) || segmentNo < 1) throw new Error('MEMORY_VAULT_FRONTMATTER_INVALID');
  const entries: VaultMemoryEntry[] = [];
  const re = /<!-- agent-core-memory\r?\n([\s\S]*?)\r?\n-->/g;
  for (const match of text.matchAll(re)) {
    try { entries.push(assertEntry(JSON.parse(match[1]!))); } catch (error) {
      if (error instanceof Error && error.message === 'MEMORY_VAULT_ENTRY_INVALID') throw error;
      throw new Error('MEMORY_VAULT_ENTRY_INVALID');
    }
  }
  return {
    schemaVersion: 1, fileId: parseScalar(fields.get('file_id') ?? ''), relativePath,
    contextFamily, principalId: optionalScalar(fields.get('principal_id')) ?? '', projectId: parseScalar(fields.get('project_id') ?? ''), topicKey: parseScalar(fields.get('topic_key') ?? ''), segmentNo,
    ...(optionalScalar(fields.get('previous_file')) ? { previousFile: optionalScalar(fields.get('previous_file')) } : {}),
    ...(optionalScalar(fields.get('next_file')) ? { nextFile: optionalScalar(fields.get('next_file')) } : {}),
    createdAt: parseScalar(fields.get('created_at') ?? ''), updatedAt: parseScalar(fields.get('updated_at') ?? ''), entries,
  };
}
