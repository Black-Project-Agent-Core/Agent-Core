import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { findConsolidationCandidates, type ConsolidationOptions } from './consolidation.js';
import type { MemoryEmbedder } from './embedder.js';
import { applyEvolutionProposal } from './evolution.js';
import { MemoryIndex, type MemoryIndexResult } from './index.js';
import { EmbeddingMemoryIntelligence, enrichMemoryMetadata, type MemoryEvolutionPreview, type MemoryEvolutionProposal, type MemoryIntelligence } from './intelligence.js';
import { boundedHistory, validateMemoryId } from './note-format.js';
import { resolveMemoryPaths } from './paths.js';
import { assessMemoryStaleness, captureMemoryProvenance } from './provenance.js';
import { normalizeLinks } from './relations.js';
import { searchMemories, type MemorySearchOptions, type MemorySearchResult } from './retrieval.js';
import { FileMemoryStore } from './store.js';
import { MEMORY_SCHEMA_VERSION, type EvolutionEvent, type MemoryHealth, type MemoryIssue, type MemoryLink, type MemoryProvenance, type MemoryRecord } from './types.js';

export type MemoryLinkInput = Omit<MemoryLink, 'createdAt'> & { createdAt?: string };

export interface RememberInput {
  content: string;
  title?: string;
  keywords?: string[];
  context?: string;
  tags?: string[];
  category?: string;
  links?: MemoryLinkInput[];
  source?: MemoryRecord['source'];
  provenance?: MemoryProvenance;
}

export interface UpdateInput {
  title?: string;
  content?: string;
  keywords?: string[];
  context?: string;
  tags?: string[];
  category?: string;
  links?: MemoryLinkInput[];
  provenance?: MemoryProvenance;
}

export type MemoryBatchOperation =
  | { op: 'remember'; id?: string; value: RememberInput }
  | { op: 'update'; id: string; patch: UpdateInput }
  | { op: 'delete'; id: string }
  | { op: 'link'; id: string; link: MemoryLinkInput };

export interface MemoryBatchResult {
  committed: true;
  operations: Array<{ op: MemoryBatchOperation['op']; id: string; deleted?: boolean }>;
  indexRefreshes: 1;
}

export interface LinkInput {
  targetId: string;
  type?: MemoryLink['type'];
  strength?: number;
  reason?: string;
}

export interface EvolutionResult {
  proposal: MemoryEvolutionProposal;
  applied: boolean;
  changedFields: string[];
  addedLinks: string[];
  strengthenedLinks: string[];
  reciprocalLinks: string[];
}

export interface EvolutionPreviewResult {
  mode: 'preview';
  proposal: MemoryEvolutionProposal;
  neighbors: MemoryEvolutionPreview['neighbors'];
  applied: false;
  changedFields: string[];
  addedLinks: string[];
  strengthenedLinks: string[];
  reciprocalLinks: string[];
}

function uniqueStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 64);
}

function event(kind: EvolutionEvent['kind'], source: EvolutionEvent['source'], changedFields?: string[], details?: Record<string, unknown>): EvolutionEvent {
  return {
    kind,
    source,
    timestamp: new Date().toISOString(),
    ...(changedFields?.length ? { changedFields } : {}),
    ...(details ? { details } : {}),
  };
}

function materializeLinks(links: MemoryLinkInput[] | undefined): MemoryLink[] {
  const now = new Date().toISOString();
  return (links ?? []).map((link) => ({
    targetId: link.targetId,
    type: link.type,
    strength: link.strength,
    createdAt: link.createdAt ?? now,
    ...(link.reason ? { reason: link.reason } : {}),
  }));
}
export class MemoryService {
  private records = new Map<string, MemoryRecord>();
  private issues: MemoryIssue[] = [];
  private canonicalIssues: MemoryIssue[] = [];
  private status: MemoryHealth['status'] = 'not-used';
  private canonicalStatus: 'available' | 'degraded' | 'error' = 'error';
  private indexStatus: MemoryHealth['index'] = 'not-configured';
  private embeddingStatus: MemoryHealth['embedding'] = 'not-configured';
  private intelligenceStatus: MemoryHealth['intelligence'] = 'not-configured';
  private indexIssue: MemoryIssue | null = null;
  private embeddingIssue: MemoryIssue | null = null;
  private embeddingQueryIssue: MemoryIssue | null = null;
  private intelligenceIssue: MemoryIssue | null = null;
  private readonly index: MemoryIndex;
  private readonly intelligence?: MemoryIntelligence;

  private constructor(
    private readonly store: FileMemoryStore,
    private readonly embedder: MemoryEmbedder | undefined,
    private readonly projectRoot: string,
  ) {
    this.index = new MemoryIndex(store.paths, embedder);
    this.intelligence = embedder ? new EmbeddingMemoryIntelligence(this.index) : undefined;
    this.embeddingStatus = embedder ? 'degraded' : 'not-configured';
    this.intelligenceStatus = this.intelligence ? 'degraded' : 'not-configured';
  }

  static async initialize(baseDir = process.cwd(), memoryRoot?: string, embedder?: MemoryEmbedder): Promise<MemoryService> {
    const service = new MemoryService(
      new FileMemoryStore(resolveMemoryPaths(baseDir, memoryRoot)),
      embedder,
      path.resolve(baseDir),
    );
    try {
      const loaded = await service.store.initialize();
      service.records = new Map(loaded.records.map((record) => [record.id, record]));
      service.syncCanonicalIssues(loaded.issues);
      if (service.canonicalStatus !== 'error') await service.ensureIndex(loaded.records);
    } catch (error) {
      service.canonicalStatus = 'error';
      service.canonicalIssues = [{
        path: service.store.paths.root,
        message: error instanceof Error ? error.message : String(error),
        severity: 'error',
      }];
      service.syncIssueList();
    }
    return service;
  }

  private auxiliaryIssues(): MemoryIssue[] {
    return [this.indexIssue, this.embeddingIssue, this.embeddingQueryIssue, this.intelligenceIssue]
      .filter((issue): issue is MemoryIssue => Boolean(issue));
  }

  private effectiveEmbeddingStatus(): MemoryHealth['embedding'] {
    return this.embeddingQueryIssue ? 'degraded' : this.embeddingStatus;
  }

  private recomputeStatus(): void {
    if (this.canonicalStatus === 'error') this.status = 'error';
    else if (this.canonicalStatus === 'degraded' || this.auxiliaryIssues().length) this.status = 'degraded';
    else this.status = 'available';
    this.intelligenceStatus = this.intelligence
      ? this.effectiveEmbeddingStatus() === 'available' && !this.intelligenceIssue ? 'available' : 'degraded'
      : 'not-configured';
  }

  private syncIssueList(): void {
    this.issues = [...this.canonicalIssues, ...this.auxiliaryIssues()];
    this.recomputeStatus();
  }

  private setEmbeddingIssue(error: unknown): void {
    if (!this.embedder) return;
    this.embeddingQueryIssue = {
      path: this.store.paths.index,
      message: `Memory embedding query degraded: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'degraded',
    };
    this.syncIssueList();
  }

  private clearEmbeddingQueryIssue(): void {
    if (!this.embeddingQueryIssue) return;
    this.embeddingQueryIssue = null;
    this.syncIssueList();
  }

  private setIntelligenceIssue(error: unknown): void {
    if (!this.intelligence) return;
    this.intelligenceIssue = {
      path: this.store.paths.state,
      message: `Memory intelligence degraded: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'degraded',
    };
    this.syncIssueList();
  }

  private syncCanonicalIssues(canonicalIssues: MemoryIssue[]): void {
    this.canonicalIssues = [...canonicalIssues];
    this.canonicalStatus = canonicalIssues.some((issue) => issue.severity === 'error')
      ? 'error'
      : canonicalIssues.length ? 'degraded' : 'available';
    this.syncIssueList();
  }

  private applyIndexResult(result: MemoryIndexResult): void {
    this.indexStatus = result.index;
    this.embeddingStatus = result.embedding;
    this.indexIssue = result.indexWarning ? {
      path: this.store.paths.index,
      message: `Memory index degraded: ${result.indexWarning}`,
      severity: 'degraded',
    } : null;
    this.embeddingIssue = result.embeddingWarning ? {
      path: this.store.paths.index,
      message: `Memory embedding degraded: ${result.embeddingWarning}`,
      severity: 'degraded',
    } : null;
    this.syncIssueList();
  }

  private setIndexFailure(prefix: string, error: unknown): void {
    this.indexStatus = 'degraded';
    this.embeddingStatus = this.embedder ? 'degraded' : 'not-configured';
    this.indexIssue = {
      path: this.store.paths.index,
      message: `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'degraded',
    };
    this.syncIssueList();
  }

  private async ensureIndex(records: MemoryRecord[]): Promise<void> {
    try {
      this.applyIndexResult(await this.index.ensure(records));
    } catch (error) {
      this.setIndexFailure('Memory index unavailable', error);
    }
  }
  health(): MemoryHealth {
    const identity = this.index.identity();
    return {
      status: this.status,
      mode: 'file-native',
      canonicalStore: this.canonicalStatus,
      noteCount: this.records.size,
      issueCount: this.issues.length,
      index: this.indexStatus,
      embedding: this.effectiveEmbeddingStatus(),
      intelligence: this.intelligenceStatus,
      ...(identity ? {
        embeddingProvider: identity.provider,
        embeddingModel: identity.model,
        embeddingDimensions: identity.dimensions,
      } : {}),
    };
  }

  getIssues(): MemoryIssue[] { return [...this.issues]; }

  async refreshHealth(): Promise<MemoryHealth> {
    const loaded = await this.store.loadAll();
    this.records = new Map(loaded.records.map((record) => [record.id, record]));
    this.syncCanonicalIssues(loaded.issues);
    if (this.canonicalStatus !== 'error') {
      try {
        this.applyIndexResult(await this.index.inspect([...this.records.values()]));
      } catch (error) {
        this.setIndexFailure('Memory index health check failed', error);
      }
    }
    return this.health();
  }

  private assertOperational(): void {
    if (this.status === 'error') throw new Error('Memory service is not safely operational');
  }

  private async reload(): Promise<void> {
    const loaded = await this.store.loadAll();
    this.records = new Map(loaded.records.map((record) => [record.id, record]));
    this.syncCanonicalIssues(loaded.issues);
  }

  private async ensureCurrentIndex(): Promise<void> {
    if (this.canonicalStatus === 'error') return;
    await this.ensureIndex([...this.records.values()]);
  }

  private async refreshIndex(full = false): Promise<void> {
    const loaded = await this.store.loadAll();
    this.records = new Map(loaded.records.map((record) => [record.id, record]));
    this.syncCanonicalIssues(loaded.issues);
    if (this.canonicalStatus === 'error') return;
    try {
      const result = full
        ? await this.index.rebuild([...this.records.values()])
        : await this.index.ensure([...this.records.values()]);
      this.applyIndexResult(result);
    } catch (error) {
      this.setIndexFailure('Memory index refresh failed', error);
    }
  }  async list(): Promise<MemoryRecord[]> {
    await this.reload();
    this.assertOperational();
    return [...this.records.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }

  private async touch(record: MemoryRecord): Promise<MemoryRecord> {
    if (record.pinned) return record;
    const updated = await this.store.mutate(record.id, (current) => {
      const now = new Date().toISOString();
      return {
        ...current,
        lastAccessedAt: now,
        retrievalCount: current.retrievalCount + 1,
        evolutionHistory: boundedHistory(current.evolutionHistory, event('retrieved', 'system', ['lastAccessedAt', 'retrievalCount'])),
      };
    });
    this.records.set(updated.id, updated);
    return updated;
  }

  async read(id: string, trackAccess = true): Promise<MemoryRecord | null> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized) ?? null;
    if (!record || !trackAccess) return record;
    return this.touch(record);
  }

  async staleness(id: string) {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized);
    if (!record) throw new Error(`Memory not found: ${id}`);
    return assessMemoryStaleness(record, this.projectRoot);
  }

  async revisions(id: string, limit = 5) {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    if (!this.records.has(normalized)) throw new Error(`Memory not found: ${id}`);
    return this.store.revisions(normalized, limit);
  }

  async remember(input: RememberInput): Promise<MemoryRecord> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const content = input.content.trim();
    if (!content) throw new Error('Memory content is required');

    const needsMetadata = input.keywords === undefined || input.context === undefined
      || input.tags === undefined || input.category === undefined;
    const enriched = needsMetadata ? enrichMemoryMetadata(content) : undefined;
    const provenance = input.provenance
      ? await captureMemoryProvenance(this.projectRoot, input.provenance)
      : undefined;

    const now = new Date().toISOString();
    const id = randomUUID();
    const validIds = new Set([...this.records.keys(), id]);
    const record: MemoryRecord = {
      version: MEMORY_SCHEMA_VERSION,
      id,
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      content,
      keywords: input.keywords !== undefined ? uniqueStrings(input.keywords) : uniqueStrings(enriched?.keywords),
      context: input.context?.trim() || enriched?.context || 'General',
      tags: input.tags !== undefined ? uniqueStrings(input.tags) : uniqueStrings(enriched?.tags),
      category: input.category?.trim() || enriched?.category || 'Uncategorized',
      links: normalizeLinks(id, materializeLinks(input.links), validIds),
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: null,
      retrievalCount: 0,
      evolutionHistory: [event('created', 'controller', ['content', 'metadata'])],
      pinned: false,
      ...(input.source ? { source: input.source } : {}),
      ...(provenance ? { provenance } : {}),
    };

    await this.store.create(record);
    this.records.set(record.id, record);
    await this.refreshIndex();

    if (this.intelligence) {
      try {
        const evolved = await this.evolve(record.id);
        if (evolved.applied) return (await this.read(record.id, false)) ?? record;
      } catch (error) {
        this.setIntelligenceIssue(error);
      }
    }
    return (await this.read(record.id, false)) ?? record;
  }

  async update(id: string, patch: UpdateInput): Promise<MemoryRecord> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized);
    if (!record) throw new Error(`Memory not found: ${id}`);
    if (record.pinned) throw new Error('Pinned foundational memory cannot be updated through ordinary memory APIs');
    const provenance = patch.provenance
      ? await captureMemoryProvenance(this.projectRoot, patch.provenance)
      : undefined;

    const next = await this.store.mutate(normalized, (current, validIds) => {
      const changed: string[] = [];
      const candidate: MemoryRecord = { ...current };
      if (patch.title !== undefined) {
        candidate.title = patch.title.trim() || undefined;
        changed.push('title');
      }
      if (patch.content !== undefined) {
        if (!patch.content.trim()) throw new Error('Memory content cannot be empty');
        candidate.content = patch.content.trim();
        changed.push('content');
      }
      if (patch.keywords !== undefined) {
        candidate.keywords = uniqueStrings(patch.keywords);
        changed.push('keywords');
      }
      if (patch.context !== undefined) {
        candidate.context = patch.context.trim() || 'General';
        changed.push('context');
      }
      if (patch.tags !== undefined) {
        candidate.tags = uniqueStrings(patch.tags);
        changed.push('tags');
      }
      if (patch.category !== undefined) {
        candidate.category = patch.category.trim() || 'Uncategorized';
        changed.push('category');
      }
      if (patch.links !== undefined) {
        candidate.links = normalizeLinks(current.id, materializeLinks(patch.links), validIds);
        changed.push('links');
      }
      if (patch.provenance !== undefined) {
        candidate.provenance = provenance;
        changed.push('provenance');
      }
      if (!changed.length) return current;

      const now = new Date().toISOString();
      candidate.updatedAt = now;
      const kind: EvolutionEvent['kind'] = changed.length === 1 && changed[0] === 'content'
        ? 'content_updated'
        : changed.length === 1 && changed[0] === 'tags'
          ? 'tags_changed'
          : changed.length === 1 && changed[0] === 'context'
            ? 'context_changed'
            : 'updated';
      candidate.evolutionHistory = boundedHistory(
        current.evolutionHistory,
        event(kind, 'controller', changed),
      );
      return candidate;
    });
    this.records.set(next.id, next);
    await this.refreshIndex();

    const allowAutoEvolution = this.intelligence
      && patch.content !== undefined
      && patch.keywords === undefined
      && patch.context === undefined
      && patch.tags === undefined
      && patch.category === undefined
      && patch.links === undefined
      && patch.provenance === undefined;
    if (allowAutoEvolution) {
      try {
        const evolved = await this.evolve(next.id);
        if (evolved.applied) return (await this.read(next.id, false)) ?? next;
      } catch (error) {
        this.setIntelligenceIssue(error);
      }
    }
    return (await this.read(next.id, false)) ?? next;
  }

  async delete(id: string): Promise<boolean> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const deleted = await this.store.deleteWithLinkRepair(normalized);
    await this.reload();
    if (deleted) await this.refreshIndex();
    return deleted;
  }

  async batch(operations: MemoryBatchOperation[]): Promise<MemoryBatchResult> {
    this.assertOperational();
    if (!operations.length) throw new Error('memory_batch requires at least one operation');
    if (operations.length > 100) throw new Error('memory_batch supports at most 100 operations');

    await this.reload();
    this.assertOperational();
    const preparedProvenance = await Promise.all(operations.map(async (operation) => {
      const input = operation.op === 'remember'
        ? operation.value.provenance
        : operation.op === 'update' ? operation.patch.provenance : undefined;
      return input ? captureMemoryProvenance(this.projectRoot, input) : undefined;
    }));

    const committed = await this.store.batch((records) => {
      const byId = new Map(records.map((record) => [record.id, record]));
      const touched = new Set<string>();
      const results: MemoryBatchResult['operations'] = [];

      const requireMutable = (id: string): MemoryRecord => {
        const normalized = validateMemoryId(id);
        const record = byId.get(normalized);
        if (!record) throw new Error(`Memory not found: ${id}`);
        if (record.pinned) throw new Error('Pinned foundational memory cannot be altered through memory_batch');
        return record;
      };

      for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
        const operation = operations[operationIndex]!;
        const operationProvenance = preparedProvenance[operationIndex];
        if (operation.op === 'remember') {
          const input = operation.value;
          const content = input.content.trim();
          if (!content) throw new Error('Memory content is required');
          const id = operation.id ? validateMemoryId(operation.id) : randomUUID();
          if (byId.has(id)) throw new Error(`Memory already exists: ${id}`);

          const needsMetadata = input.keywords === undefined || input.context === undefined
            || input.tags === undefined || input.category === undefined;
          const enriched = needsMetadata ? enrichMemoryMetadata(content) : undefined;
          const now = new Date().toISOString();
          const record: MemoryRecord = {
            version: MEMORY_SCHEMA_VERSION,
            id,
            ...(input.title?.trim() ? { title: input.title.trim() } : {}),
            content,
            keywords: input.keywords !== undefined ? uniqueStrings(input.keywords) : uniqueStrings(enriched?.keywords),
            context: input.context?.trim() || enriched?.context || 'General',
            tags: input.tags !== undefined ? uniqueStrings(input.tags) : uniqueStrings(enriched?.tags),
            category: input.category?.trim() || enriched?.category || 'Uncategorized',
            links: materializeLinks(input.links),
            createdAt: now,
            updatedAt: now,
            lastAccessedAt: null,
            retrievalCount: 0,
            evolutionHistory: [event('created', 'controller', ['content', 'metadata'])],
            pinned: false,
            ...(input.source ? { source: input.source } : {}),
            ...(operationProvenance ? { provenance: operationProvenance } : {}),
          };
          byId.set(id, record);
          touched.add(id);
          results.push({ op: 'remember', id });
          continue;
        }

        if (operation.op === 'delete') {
          const current = requireMutable(operation.id);
          byId.delete(current.id);
          touched.add(current.id);
          const now = new Date().toISOString();
          for (const [otherId, other] of byId) {
            if (other.pinned) continue;
            const filtered = other.links.filter((link) => link.targetId !== current.id);
            if (filtered.length === other.links.length) continue;
            byId.set(otherId, {
              ...other,
              links: filtered,
              updatedAt: now,
              evolutionHistory: boundedHistory(other.evolutionHistory, event('link_removed', 'system', ['links'], {
                removedTargetId: current.id,
                reason: 'target_deleted_in_batch',
              })),
            });
            touched.add(otherId);
          }
          results.push({ op: 'delete', id: current.id, deleted: true });
          continue;
        }

        if (operation.op === 'link') {
          const current = requireMutable(operation.id);
          const incoming = materializeLinks([operation.link])[0]!;
          const now = new Date().toISOString();
          const withoutSame = current.links.filter(
            (link) => !(link.targetId === incoming.targetId && link.type === incoming.type),
          );
          const existing = current.links.find(
            (link) => link.targetId === incoming.targetId && link.type === incoming.type,
          );
          byId.set(current.id, {
            ...current,
            links: [...withoutSame, { ...incoming, createdAt: existing?.createdAt ?? incoming.createdAt }],
            updatedAt: now,
            evolutionHistory: boundedHistory(current.evolutionHistory, event(
              existing ? 'link_strengthened' : 'link_added',
              'controller',
              ['links'],
              { targetId: incoming.targetId, type: incoming.type },
            )),
          });
          touched.add(current.id);
          results.push({ op: 'link', id: current.id });
          continue;
        }

        const current = requireMutable(operation.id);
        const patch = operation.patch;
        const candidate: MemoryRecord = { ...current, links: [...current.links] };
        const changed: string[] = [];
        if (patch.title !== undefined) { candidate.title = patch.title.trim() || undefined; changed.push('title'); }
        if (patch.content !== undefined) {
          if (!patch.content.trim()) throw new Error('Memory content cannot be empty');
          candidate.content = patch.content.trim(); changed.push('content');
        }
        if (patch.keywords !== undefined) { candidate.keywords = uniqueStrings(patch.keywords); changed.push('keywords'); }
        if (patch.context !== undefined) { candidate.context = patch.context.trim() || 'General'; changed.push('context'); }
        if (patch.tags !== undefined) { candidate.tags = uniqueStrings(patch.tags); changed.push('tags'); }
        if (patch.category !== undefined) { candidate.category = patch.category.trim() || 'Uncategorized'; changed.push('category'); }
        if (patch.links !== undefined) { candidate.links = materializeLinks(patch.links); changed.push('links'); }
        if (patch.provenance !== undefined) { candidate.provenance = operationProvenance; changed.push('provenance'); }

        if (changed.length) {
          const now = new Date().toISOString();
          candidate.updatedAt = now;
          candidate.evolutionHistory = boundedHistory(
            current.evolutionHistory,
            event('updated', 'controller', changed),
          );
          byId.set(current.id, candidate);
          touched.add(current.id);
        }
        results.push({ op: 'update', id: current.id });
      }

      const validIds = new Set(byId.keys());
      for (const id of touched) {
        const record = byId.get(id);
        if (!record) continue;
        record.links = normalizeLinks(record.id, record.links, validIds);
      }

      return { records: [...byId.values()], touchedIds: [...touched], result: results };
    });

    this.records = new Map(committed.records.map((record) => [record.id, record]));
    await this.refreshIndex();
    return { committed: true, operations: committed.result, indexRefreshes: 1 };
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    this.assertOperational();
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new Error('Memory search query is required');
    await this.reload();
    this.assertOperational();
    await this.ensureCurrentIndex();

    const currentRecords = [...this.records.values()];
    let semanticContext;
    if (this.embedder && this.indexStatus === 'available' && this.embeddingStatus !== 'not-configured') {
      try {
        semanticContext = await this.index.semanticContext(normalizedQuery, currentRecords) ?? undefined;
        if (semanticContext) this.clearEmbeddingQueryIssue();
      } catch (error) {
        this.setEmbeddingIssue(error);
      }
    }

    const results = searchMemories(currentRecords, normalizedQuery, options, semanticContext);
    for (const result of results) {
      if (result.record.pinned) continue;
      try {
        result.record = await this.touch(result.record);
      } catch (error) {
        const issue: MemoryIssue = {
          path: this.store.paths.root,
          message: `Recall metadata update failed for ${result.record.id}: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'degraded',
        };
        this.syncCanonicalIssues([...this.canonicalIssues, issue]);
      }
    }
    return results;
  }
  async reindex(): Promise<MemoryHealth> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    await this.refreshIndex(true);
    return this.health();
  }

  private async syncReciprocalRelatedLinks(owner: MemoryRecord, targetIds: string[]): Promise<string[]> {
    const changedTargets: string[] = [];
    for (const targetId of [...new Set(targetIds)]) {
      const ownerLink = owner.links.find((link) => link.targetId === targetId && link.type === 'related');
      const knownTarget = this.records.get(targetId);
      if (!ownerLink || !knownTarget || knownTarget.pinned) continue;
      const before = knownTarget.links.find((link) => link.targetId === owner.id && link.type === 'related');
      if (before && before.strength >= ownerLink.strength) continue;

      try {
        const updated = await this.store.mutate(targetId, (current, validIds) => {
          const existing = current.links.find((link) => link.targetId === owner.id && link.type === 'related');
          if (existing && existing.strength >= ownerLink.strength) return current;
          const now = new Date().toISOString();
          const reciprocal: MemoryLink = {
            targetId: owner.id,
            type: 'related',
            strength: ownerLink.strength,
            createdAt: existing?.createdAt ?? now,
            reason: ownerLink.reason ? `reciprocal: ${ownerLink.reason}` : 'reciprocal semantic relationship',
          };
          const links = normalizeLinks(current.id, [...current.links, reciprocal], validIds);
          const kind: EvolutionEvent['kind'] = existing ? 'link_strengthened' : 'link_added';
          return {
            ...current,
            links,
            updatedAt: now,
            evolutionHistory: boundedHistory(current.evolutionHistory, event(kind, 'intelligence', ['links'], {
              reciprocalTargetId: owner.id,
            })),
          };
        });
        this.records.set(updated.id, updated);
        changedTargets.push(targetId);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Memory not found:')) continue;
        throw error;
      }
    }
    if (changedTargets.length) await this.reload();
    return changedTargets;
  }
  private async prepareEvolution(
    id: string,
    options: { ensureCurrentIndex: boolean; neighborLimit?: number },
  ): Promise<{ record: MemoryRecord; preview: MemoryEvolutionPreview }> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    if (!this.intelligence) throw new Error('Memory intelligence is not configured');

    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized);
    if (!record) throw new Error(`Memory not found: ${id}`);
    if (record.pinned) throw new Error('Pinned foundational memory cannot be evolved through ordinary memory APIs');

    if (options.ensureCurrentIndex) {
      await this.ensureCurrentIndex();
    } else {
      const inspection = await this.index.inspect([...this.records.values()]);
      if (inspection.index !== 'available' || inspection.embedding !== 'available') {
        throw new Error(inspection.indexWarning
          ?? inspection.embeddingWarning
          ?? 'Memory evolution preview requires a current semantic index');
      }
    }

    const preview = await this.intelligence.preview(
      record,
      [...this.records.values()],
      options.neighborLimit,
    );
    return { record, preview };
  }

  async previewEvolution(id: string, neighborLimit = 5): Promise<EvolutionPreviewResult> {
    const { preview } = await this.prepareEvolution(id, {
      ensureCurrentIndex: false,
      neighborLimit,
    });
    return {
      mode: 'preview',
      proposal: preview.proposal,
      neighbors: preview.neighbors,
      applied: false,
      changedFields: [],
      addedLinks: [],
      strengthenedLinks: [],
      reciprocalLinks: [],
    };
  }

  async evolve(id: string): Promise<EvolutionResult> {
    let prepared: { record: MemoryRecord; preview: MemoryEvolutionPreview };
    try {
      prepared = await this.prepareEvolution(id, { ensureCurrentIndex: true });
    } catch (error) {
      this.setIntelligenceIssue(error);
      throw error;
    }

    const { record, preview } = prepared;
    const proposal = preview.proposal;
    const normalized = record.id;
    let committed = applyEvolutionProposal(record, proposal, new Set(this.records.keys()));
    let owner = record;
    try {
      if (committed.changedFields.length) {
        owner = await this.store.mutate(normalized, (current, validIds) => {
          committed = applyEvolutionProposal(current, proposal, validIds);
          return committed.record;
        });
        this.records.set(owner.id, owner);
        await this.refreshIndex();
        owner = this.records.get(normalized) ?? owner;
      }

      const reciprocalLinks = await this.syncReciprocalRelatedLinks(
        owner,
        proposal.links.filter((link) => link.type === 'related').map((link) => link.targetId),
      );
      this.intelligenceIssue = null;
      this.syncIssueList();
      return {
        proposal,
        applied: committed.changedFields.length > 0 || reciprocalLinks.length > 0,
        changedFields: committed.changedFields,
        addedLinks: committed.addedLinks,
        strengthenedLinks: committed.strengthenedLinks,
        reciprocalLinks,
      };
    } catch (error) {
      this.setIntelligenceIssue(error);
      throw error;
    }
  }
  async consolidate(options: ConsolidationOptions = {}) {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    await this.ensureCurrentIndex();
    return findConsolidationCandidates([...this.records.values()], this.index, options);
  }
}
