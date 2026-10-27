import { createHash } from 'node:crypto';
import { isMemoryLinkActive, relatedByMetadata } from './relations.js';
import { scanMemorySafety } from './safety.js';
import { isMemoryExpired } from './visibility.js';
import type { MemoryRecord } from './types.js';

/**
 * Background "REM" consolidation: recent, closely related episodic records are distilled
 * into one extractive semantic digest that links back to its sources. The digest is
 * deterministic (no model call), tagged `inferred`, idempotent per member set, and never
 * edits or removes the source records.
 */
export const REM_SOURCE_TYPE = 'rem-consolidation';
export const REM_TAG = 'rem-consolidated';
const MIN_RELATEDNESS = 0.5;
const SNIPPET_CHARS = 180;
const MAX_EPISODIC_CANDIDATES = 400;

export interface DigestPlan {
  /** Stable key of the sorted member set; stored as `source.ref` for idempotency. */
  key: string;
  memberIds: string[];
  workspace?: string;
  title: string;
  content: string;
  keywords: string[];
  tags: string[];
  context: string;
}

export interface DigestPlanResult {
  plans: DigestPlan[];
  clusters: number;
  alreadyConsolidated: number;
  skippedUnsafe: number;
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
  const superseded = new Set(records.flatMap((record) => record.links
    .filter((link) => link.type === 'supersedes' && isMemoryLinkActive(link, options.now))
    .map((link) => link.targetId)));
  const existingKeys = new Set(records
    .filter((record) => record.source?.type === REM_SOURCE_TYPE && record.source.ref)
    .map((record) => record.source!.ref!));

  const episodic = records.filter((record) => {
    if (record.pinned || isMemoryExpired(record, options.now) || superseded.has(record.id)) return false;
    if (record.source?.type === REM_SOURCE_TYPE || record.tags.includes(REM_TAG)) return false;
    if (record.version === 2 && record.experience.retention === 'archive') return false;
    const updated = Date.parse(record.updatedAt);
    return Number.isFinite(updated) && options.now - updated <= options.windowMs;
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

  const result: DigestPlanResult = { plans: [], clusters: 0, alreadyConsolidated: 0, skippedUnsafe: 0 };
  for (const group of groups.values()) {
    if (group.length < options.minClusterSize) continue;
    result.clusters += 1;
    const members = group
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
      .slice(0, options.maxClusterSize)
      .sort((a, b) => a.id.localeCompare(b.id));
    const memberIds = members.map((record) => record.id);
    const key = createHash('sha256').update(memberIds.join('\n')).digest('hex').slice(0, 16);
    if (existingKeys.has(key)) { result.alreadyConsolidated += 1; continue; }

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
    if (scanMemorySafety(`${title}\n${content}`).length) { result.skippedUnsafe += 1; continue; }

    const workspace = members[0]!.provenance?.workspace;
    result.plans.push({
      key,
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
