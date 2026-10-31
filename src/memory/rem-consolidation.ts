import { createHash } from 'node:crypto';
import { isMemoryLinkActive, relatedByMetadata } from './relations.js';
import { scanMemorySafety } from './safety.js';
import { isMemoryExpired } from './visibility.js';
import { disclosureDigest, memorySemanticRevision, semanticMemoryValue } from './disclosure.js';
import type { SourceRef } from './experience-types.js';
import type { MemoryRecord } from './types.js';

/**
 * Background "REM" consolidation: recent, closely related episodic records are distilled
 * into one extractive semantic digest that links back to its sources. The digest is
 * deterministic (no model call), tagged `inferred`, idempotent per source generation, and never
 * edits or removes the source records.
 */
export const REM_SOURCE_TYPE = 'rem-consolidation';
export const REM_TAG = 'rem-consolidated';
const MIN_RELATEDNESS = 0.5;
const SNIPPET_CHARS = 180;
const MAX_EPISODIC_CANDIDATES = 400;

export interface DigestPlan {
  /** Stable family key; source.ref also binds the source generation and derived output. */
  key: string;
  fingerprint: string;
  sources: SourceRef[];
  policy: Omit<DigestOptions, 'now'>;
  previous?: { id: string; revision: string };
  memberIds: string[];
  workspace?: string;
  title: string;
  content: string;
  keywords: string[];
  tags: string[];
  context: string;
  /** Set only when `content` is a validated model rewrite of the extractive text (P1 model assist). */
  assist?: 'model';
}

export interface DigestPlanResult {
  plans: DigestPlan[];
  clusters: number;
  alreadyConsolidated: number;
  skippedUnsafe: number;
  /** Source exclusions count records; commit decisions count plans, not independent evidence. */
  reasons: DigestReasons;
}

export function emptyDigestReasons() {
  return { unchanged: 0, sourceChanged: 0, sourceUnavailable: 0, ineligible: 0, unsafe: 0,
    budgetDeferred: 0, commitFailed: 0, legacyUnknown: 0 };
}
export type DigestReasons = ReturnType<typeof emptyDigestReasons>;
export type DigestCommitResult = { status: 'created' | 'updated'; id: string; indexIssue?: boolean }
  | { status: 'skipped'; reason: keyof DigestReasons };

function generation(record: MemoryRecord) {
  if (record.source?.type !== REM_SOURCE_TYPE) return undefined;
  const ref = record.source.ref ?? '';
  const match = /^rem:v2:([a-f0-9]{16}):([a-f0-9]{64}):([a-f0-9]{64})$/.exec(ref);
  if (match) return { family: match[1]!, fingerprint: match[2]!, output: match[3]! };
  return /^[a-f0-9]{16}$/.test(ref) ? { family: ref } : undefined;
}

function outputFingerprint(record: MemoryRecord) {
  const { source: _source, ...value } = semanticMemoryValue(record);
  return disclosureDigest(value).slice(7);
}

/** This guards accidental/user edits, not permissions or semantic truth. */
export function digestSourceRef(plan: DigestPlan, record: MemoryRecord): string {
  return `rem:v2:${plan.key}:${plan.fingerprint}:${outputFingerprint(record)}`;
}

function intact(record: MemoryRecord): boolean {
  const prior = generation(record);
  return Boolean(prior?.output && prior.output === outputFingerprint(record));
}

function editableDigest(record: MemoryRecord, plan: Pick<DigestPlan, 'memberIds' | 'title' | 'content' | 'keywords' | 'tags' | 'context' | 'workspace'>): boolean {
  if (intact(record)) return true;
  if (generation(record)?.fingerprint) return false;
  // Bind a legacy artifact only when its complete current extract still matches; never infer its old source revisions.
  const parents = record.links.filter(link => link.type === 'derived-from').map(link => link.targetId).sort();
  return record.title === plan.title && record.content === plan.content && record.context === plan.context
    && record.category === 'consolidated-knowledge' && workspaceOf(record) === plan.workspace
    && JSON.stringify(record.keywords) === JSON.stringify(plan.keywords)
    && JSON.stringify(record.tags) === JSON.stringify(plan.tags)
    && record.links.length === parents.length && JSON.stringify(parents) === JSON.stringify(plan.memberIds);
}

function supersededIds(records: readonly MemoryRecord[], now: number): Set<string> {
  return new Set(records.flatMap(record => record.links
    .filter(link => link.type === 'supersedes' && isMemoryLinkActive(link, now)).map(link => link.targetId)));
}

function eligible(record: MemoryRecord, superseded: Set<string>, options: DigestOptions): boolean {
  const updated = Date.parse(record.updatedAt);
  return Boolean(workspaceOf(record)) && !record.pinned && !isMemoryExpired(record, options.now)
    && !superseded.has(record.id) && record.source?.type !== REM_SOURCE_TYPE && !record.tags.includes(REM_TAG)
    && !record.links.some(link => link.type === 'derived-from' && isMemoryLinkActive(link, options.now))
    && !(record.version === 2 && (record.experience.retention === 'archive'
      || record.experience.sourceRefs.some(ref => ref.kind === 'memory')))
    && Number.isFinite(updated) && options.now - updated <= options.windowMs;
}

function familyRecords(records: readonly MemoryRecord[], key: string) {
  return records.filter(record => generation(record)?.family === key);
}

/** Runs inside the canonical transaction, with no nested lock, I/O or model call. */
export function validateDigestPlan(plan: DigestPlan, records: readonly MemoryRecord[], now: number): keyof DigestReasons | undefined {
  const byId = new Map(records.map(record => [record.id, record]));
  const superseded = supersededIds(records, now);
  for (const source of plan.sources) {
    const record = byId.get(source.id);
    if (!record) return 'sourceUnavailable';
    if (memorySemanticRevision(record) !== source.revision) return 'sourceChanged';
    if (workspaceOf(record) !== plan.workspace || !eligible(record, superseded, { ...plan.policy, now })) return 'ineligible';
  }
  const existing = familyRecords(records, plan.key);
  if (existing.length > 1) return 'ineligible';
  const previous = existing[0];
  if (previous && (!editableDigest(previous, plan) || previous.pinned || superseded.has(previous.id)
    || isMemoryExpired(previous, now) || (previous.version === 2 && previous.experience.retention === 'archive'))) return 'ineligible';
  if (previous && intact(previous) && generation(previous)?.fingerprint === plan.fingerprint) return 'unchanged';
  if (previous?.id !== plan.previous?.id) return 'sourceChanged';
  if (previous && memorySemanticRevision(previous) !== plan.previous?.revision) return 'sourceChanged';
  return undefined;
}

export interface DigestOptions {
  now: number;
  windowMs: number;
  minClusterSize: number;
  maxClusterSize: number;
}

function workspaceOf(record: MemoryRecord): string {
  return record.provenance?.workspace?.trim().toLowerCase() ?? '';
}

function snippet(record: MemoryRecord): string {
  const source = (record.title?.trim() || record.content.trim()).replace(/\s+/g, ' ');
  const sentence = /^(.+?[.!?])(\s|$)/.exec(source)?.[1] ?? source;
  return sentence.length > SNIPPET_CHARS ? `${sentence.slice(0, SNIPPET_CHARS - 1)}…` : sentence;
}

export function planEpisodicDigests(records: MemoryRecord[], options: DigestOptions): DigestPlanResult {
  const superseded = supersededIds(records, options.now);
  const reasons = emptyDigestReasons();

  const episodic = records.filter((record) => {
    const admitted = eligible(record, superseded, options);
    if (!admitted) reasons.ineligible += 1;
    return admitted;
  })
    // Pairwise relatedness is quadratic, so only the most recent records are considered per cycle.
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    .slice(0, MAX_EPISODIC_CANDIDATES)
    .sort((a, b) => a.id.localeCompare(b.id));

  // Union-find over metadata relatedness inside one workspace.
  const parent = new Map(episodic.map((record) => [record.id, record.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  for (let i = 0; i < episodic.length; i += 1) {
    for (let j = i + 1; j < episodic.length; j += 1) {
      const left = episodic[i]!;
      const right = episodic[j]!;
      if (workspaceOf(left) !== workspaceOf(right)) continue;
      if (relatedByMetadata(left, right) >= MIN_RELATEDNESS) parent.set(find(left.id), find(right.id));
    }
  }
  const groups = new Map<string, MemoryRecord[]>();
  for (const record of episodic) groups.set(find(record.id), [...(groups.get(find(record.id)) ?? []), record]);

  const result: DigestPlanResult = { plans: [], clusters: 0, alreadyConsolidated: 0, skippedUnsafe: 0, reasons };
  for (const group of groups.values()) {
    if (group.length < options.minClusterSize) continue;
    result.clusters += 1;
    const members = group
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
      .slice(0, options.maxClusterSize)
      .sort((a, b) => a.id.localeCompare(b.id));
    const memberIds = members.map((record) => record.id);
    const key = createHash('sha256').update(memberIds.join('\n')).digest('hex').slice(0, 16);
    const sources: SourceRef[] = members.map(record => ({ kind: 'memory', id: record.id, revision: memorySemanticRevision(record) }));
    const policy = { windowMs: options.windowMs, minClusterSize: options.minClusterSize, maxClusterSize: options.maxClusterSize };
    const fingerprint = disclosureDigest({ policy: 'rem/v2', bounds: policy, workspace: workspaceOf(members[0]!), sources }).slice(7);

    const frequency = new Map<string, number>();
    for (const record of members) {
      for (const term of new Set([...record.keywords, ...record.tags].map((value) => value.trim().toLowerCase()).filter(Boolean))) {
        frequency.set(term, (frequency.get(term) ?? 0) + 1);
      }
    }
    const shared = [...frequency]
      .filter(([, count]) => count >= Math.ceil(members.length / 2))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([term]) => term)
      .slice(0, 8);
    const title = `Konsolidasi REM: ${shared.slice(0, 3).join(', ') || 'catatan terkait'}`;
    const content = [
      `Ringkasan ekstraktif dari ${members.length} catatan episodik terkait (inferred, belum diverifikasi ulang).`,
      shared.length ? `Istilah bersama: ${shared.join(', ')}.` : '',
      ...members.map((record) => `- [${record.id.slice(0, 8)}] ${snippet(record)}`),
    ].filter(Boolean).join('\n');
    if (scanMemorySafety(`${title}\n${content}`).length) { result.skippedUnsafe += 1; reasons.unsafe += 1; continue; }

    const existing = familyRecords(records, key);
    if (existing.length > 1) { reasons.ineligible += 1; continue; }
    const previous = existing[0];
    if (previous && (!editableDigest(previous, { title, content, keywords: shared, tags: [REM_TAG, 'inferred', ...shared.slice(0, 3)],
      context: `REM consolidation of ${members.length} related recent records`, workspace: workspaceOf(members[0]!), memberIds })
      || previous.pinned || superseded.has(previous.id)
      || isMemoryExpired(previous, options.now) || (previous.version === 2 && previous.experience.retention === 'archive'))) {
      if (!generation(previous)?.fingerprint) reasons.legacyUnknown += 1;
      else reasons.ineligible += 1;
      continue;
    }
    if (previous && generation(previous)?.fingerprint === fingerprint) {
      result.alreadyConsolidated += 1; reasons.unchanged += 1; continue;
    }

    const workspace = workspaceOf(members[0]!);
    result.plans.push({
      key,
      fingerprint, sources, policy,
      ...(previous ? { previous: { id: previous.id, revision: memorySemanticRevision(previous) } } : {}),
      memberIds,
      ...(workspace ? { workspace } : {}),
      title,
      content,
      keywords: shared,
      tags: [REM_TAG, 'inferred', ...shared.slice(0, 3)],
      context: `REM consolidation of ${members.length} related recent records`,
    });
  }
  return result;
}

/** Self-rescheduling timer: unref'd, never re-entrant, and errors never escape the timer. */
export class IntervalLoop {
  private timer: NodeJS.Timeout | undefined;
  private active = false;
  private busy = false;

  constructor(
    private readonly run: () => Promise<unknown>,
    private readonly intervalMs: number,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  get running(): boolean { return this.active; }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.schedule();
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    if (!this.active) return;
    this.timer = setTimeout(() => { void this.tick(); }, this.intervalMs);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (!this.active) return;
    if (!this.busy) {
      this.busy = true;
      try { await this.run(); } catch (error) { this.onError(error); } finally { this.busy = false; }
    }
    this.schedule();
  }
}
