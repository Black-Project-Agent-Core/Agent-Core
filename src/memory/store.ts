import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { bootstrapRecord, parseCanonicalNote, serializeCanonicalNote } from './note-format.js';
import { notePath, type MemoryPaths } from './paths.js';
import { buildRevisionMutation, readMemoryRevisions, type MemoryRevisionRead } from './revisions.js';
import { assertMemoryRecordSafe } from './safety.js';
import { memoryRetirementFingerprint } from './retirement.js';
import { fingerprintFile, MemoryTransactionCoordinator, type MemoryTransactionMutation } from './transaction.js';
import type { MemoryIssue, MemoryRecord } from './types.js';
import { withMemoryProcessLock } from './lock.js';

export interface LoadedMemories {
  records: MemoryRecord[];
  issues: MemoryIssue[];
  complete: boolean;
}

export interface MemoryBatchPlan<T> {
  records: MemoryRecord[];
  touchedIds: string[];
  result: T;
}

async function exists(filePath: string): Promise<boolean> {
  try { await readFile(filePath); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function atomicWrite(filePath: string, serialized: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(serialized, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export class FileMemoryStore {
  private readonly transactions: MemoryTransactionCoordinator;

  constructor(readonly paths: MemoryPaths) {
    this.transactions = new MemoryTransactionCoordinator(paths.state);
  }

  async initialize(): Promise<LoadedMemories> {
    await Promise.all([
      mkdir(this.paths.root, { recursive: true }),
      mkdir(this.paths.notes, { recursive: true }),
      mkdir(this.paths.index, { recursive: true }),
      mkdir(this.paths.state, { recursive: true }),
      mkdir(this.paths.revisions, { recursive: true }),
    ]);
    await this.transactions.initialize();
    return this.loadAll();
  }

  async loadAll(): Promise<LoadedMemories> {
    const records: MemoryRecord[] = [];
    const issues: MemoryIssue[] = [];
    let complete = true;

    if (!await exists(this.paths.bootstrap)) {
      complete = false;
      issues.push({ path: this.paths.bootstrap, message: 'Pinned bootstrap memory is missing', severity: 'error' });
    } else {
      try {
        records.push(bootstrapRecord(await readFile(this.paths.bootstrap, 'utf8'), this.paths.bootstrap));
      } catch (error) {
        complete = false;
        issues.push({ path: this.paths.bootstrap, message: error instanceof Error ? error.message : String(error), severity: 'error' });
      }
    }

    let entries: string[] = [];
    try { entries = await readdir(this.paths.notes); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    for (const name of entries.filter((value) => value.toLowerCase().endsWith('.md')).sort()) {
      const filePath = path.join(this.paths.notes, name);
      try {
        const record = parseCanonicalNote(await readFile(filePath, 'utf8'));
        if (`${record.id}.md` !== name) throw new Error(`Memory id/file mismatch: ${record.id}`);
        records.push(record);
      } catch (error) {
        complete = false;
        issues.push({ path: filePath, message: error instanceof Error ? error.message : String(error), severity: 'degraded' });
      }
    }

    const duplicates = new Map<string, number>();
    for (const record of records) duplicates.set(record.id, (duplicates.get(record.id) ?? 0) + 1);
    for (const [id, count] of duplicates) if (count > 1) {
      complete = false;
      issues.push({ path: this.paths.notes, message: `Duplicate memory id: ${id}`, severity: 'error' });
    }
    return { records, issues, complete };
  }

  async read(id: string): Promise<MemoryRecord | null> {
    if (id === 'agent-core-foundational') {
      if (!await exists(this.paths.bootstrap)) return null;
      return bootstrapRecord(await readFile(this.paths.bootstrap, 'utf8'), this.paths.bootstrap);
    }
    const filePath = notePath(this.paths, id);
    try { return parseCanonicalNote(await readFile(filePath, 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async revisions(id: string, limit = 5): Promise<MemoryRevisionRead> {
    if (id === 'agent-core-foundational') return { revisions: [] };
    return readMemoryRevisions(this.paths, id, limit);
  }


  private assertLinkTargets(record: MemoryRecord, records: MemoryRecord[]): void {
    const ids = new Set(records.map((item) => item.id));
    for (const link of record.links) {
      if (link.targetId === record.id) throw new Error('Memory cannot link to itself');
      if (!ids.has(link.targetId)) throw new Error(`Linked memory not found at commit time: ${link.targetId}`);
      for (const ref of link.evidenceRefs ?? []) {
        if (!ref.toLowerCase().startsWith('memory:')) continue;
        const evidenceId = ref.slice('memory:'.length);
        if (!ids.has(evidenceId)) throw new Error(`Linked memory evidence not found at commit time: ${evidenceId}`);
      }
    }
  }

  async mutate(id: string, mutation: (current: MemoryRecord, validIds: Set<string>) => MemoryRecord): Promise<MemoryRecord> {
    if (id === 'agent-core-foundational') throw new Error('Pinned foundational memory cannot be rewritten through ordinary store APIs');
    return withMemoryProcessLock(this.paths.lock, async () => {
      const targetPath = notePath(this.paths, id);
      const expectedFingerprint = await fingerprintFile(targetPath);
      const loaded = await this.loadAll();
      if (loaded.issues.some((issue) => issue.severity === 'error')) throw new Error('Canonical memory store contains blocking errors');
      const current = loaded.records.find((record) => record.id === id);
      if (!current) throw new Error(`Memory not found: ${id}`);
      if (current.pinned) throw new Error('Pinned foundational memory cannot be rewritten through ordinary store APIs');
      const validIds = new Set(loaded.records.map((record) => record.id));
      const next = mutation(current, validIds);
      if (next.id !== current.id || next.pinned) throw new Error('Memory mutation cannot change identity or pin state');
      this.assertLinkTargets(next, loaded.records);
      assertMemoryRecordSafe(next);
      if (await fingerprintFile(targetPath) !== expectedFingerprint) {
        throw new Error(`MEMORY_CANONICAL_DRIFT: ${targetPath}`);
      }
      const mutations: MemoryTransactionMutation[] = [];
      if (next.content !== current.content) {
        mutations.push(await buildRevisionMutation(this.paths, current));
      }
      mutations.push({
        targetPath,
        content: serializeCanonicalNote(next),
        expectedFingerprint,
      });
      await this.transactions.commit(mutations);
      return next;
    });
  }

  async create(record: MemoryRecord): Promise<void> {
    if (record.pinned) throw new Error('Pinned memories cannot be created through ordinary store APIs');
    await withMemoryProcessLock(this.paths.lock, async () => {
      const filePath = notePath(this.paths, record.id);
      const expectedFingerprint = await fingerprintFile(filePath);
      if (expectedFingerprint !== null) throw new Error(`Memory already exists: ${record.id}`);
      const loaded = await this.loadAll();
      if (loaded.issues.some((issue) => issue.severity === 'error')) throw new Error('Canonical memory store contains blocking errors');
      this.assertLinkTargets(record, [...loaded.records, record]);
      assertMemoryRecordSafe(record);
      if (await fingerprintFile(filePath) !== expectedFingerprint) {
        throw new Error(`MEMORY_CANONICAL_DRIFT: ${filePath}`);
      }
      await atomicWrite(filePath, serializeCanonicalNote(record));
    });
  }

  async batch<T>(
    planner: (records: MemoryRecord[]) => MemoryBatchPlan<T>,
  ): Promise<{ records: MemoryRecord[]; result: T }> {
    return withMemoryProcessLock(this.paths.lock, async () => {
      await this.transactions.recover();
      const loaded = await this.loadAll();
      if (loaded.issues.length) {
        throw new Error('Canonical memory store contains issues; batch mutation is blocked');
      }

      const currentById = new Map(loaded.records.map((record) => [record.id, record]));
      const plan = planner(loaded.records.map((record) => ({
        ...record,
        links: record.links.map((link) => ({ ...link })),
        evolutionHistory: record.evolutionHistory.map((item) => ({ ...item })),
      })));

      const finalById = new Map<string, MemoryRecord>();
      for (const record of plan.records) {
        if (finalById.has(record.id)) throw new Error(`Duplicate memory id in batch: ${record.id}`);
        finalById.set(record.id, record);
      }

      const pinned = currentById.get('agent-core-foundational');
      const finalPinned = finalById.get('agent-core-foundational');
      if (!pinned || !finalPinned || finalPinned.content !== pinned.content) {
        throw new Error('Pinned foundational memory cannot be altered through memory_batch');
      }

      const finalRecords = [...finalById.values()];
      for (const record of finalRecords) {
        if (record.pinned) continue;
        this.assertLinkTargets(record, finalRecords);
      }

      const touched = new Set(plan.touchedIds);
      for (const id of touched) {
        const record = finalById.get(id);
        if (record) assertMemoryRecordSafe(record);
      }

      const mutations: MemoryTransactionMutation[] = [];
      const ids = new Set([
        ...[...currentById.keys()].filter((id) => id !== 'agent-core-foundational'),
        ...[...finalById.keys()].filter((id) => id !== 'agent-core-foundational'),
      ]);

      for (const id of ids) {
        const before = currentById.get(id);
        const after = finalById.get(id);
        const targetPath = notePath(this.paths, id);
        const expectedFingerprint = await fingerprintFile(targetPath);
        if (!after) {
          if (before) mutations.push({ targetPath, content: null, expectedFingerprint });
          continue;
        }
        const serialized = serializeCanonicalNote(after);
        if (!before || serializeCanonicalNote(before) !== serialized) {
          if (before && before.content !== after.content) {
            mutations.push(await buildRevisionMutation(this.paths, before));
          }
          mutations.push({ targetPath, content: serialized, expectedFingerprint });
        }
      }

      await this.transactions.commit(mutations);
      return { records: finalRecords, result: plan.result };
    });
  }

  async deleteWithLinkRepair(id: string, expectedReviewFingerprint?: string): Promise<boolean> {
    if (id === 'agent-core-foundational') throw new Error('Pinned foundational memory cannot be deleted');
    const normalized = id.trim();
    const committed = await this.batch((records) => {
      const byId = new Map(records.map((record) => [record.id, record]));
      const target = byId.get(normalized);
      if (!target) return { records, touchedIds: [], result: false };
      if (target.pinned) throw new Error('Pinned foundational memory cannot be deleted');
      if (expectedReviewFingerprint) {
        const expected = expectedReviewFingerprint.trim().toLowerCase();
        if (!/^sha256:[0-9a-f]{64}$/.test(expected)) throw new Error('MEMORY_RETIREMENT_FINGERPRINT_INVALID');
        if (memoryRetirementFingerprint(target) !== expected) {
          throw new Error('MEMORY_RETIREMENT_REVIEW_STALE');
        }
      }

      byId.delete(normalized);
      const touched = new Set<string>([normalized]);
      const now = new Date().toISOString();
      for (const [recordId, record] of byId) {
        if (record.pinned) continue;
        const filtered = record.links.filter((link) => link.targetId !== normalized);
        if (filtered.length === record.links.length) continue;
        byId.set(recordId, {
          ...record,
          links: filtered,
          updatedAt: now,
          evolutionHistory: [...record.evolutionHistory, {
            kind: 'link_removed' as const,
            timestamp: now,
            source: 'system' as const,
            changedFields: ['links'],
            details: { removedTargetId: normalized, reason: 'target_deleted' },
          }].slice(-64),
        });
        touched.add(recordId);
      }
      return { records: [...byId.values()], touchedIds: [...touched], result: true };
    });
    return committed.result;
  }
}
