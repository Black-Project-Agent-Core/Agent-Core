import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { cosineSimilarity, type MemoryEmbedder, type MemoryEmbedderIdentity } from './embedder.js';
import { buildSemanticDocument, SEMANTIC_DOCUMENT_VERSION } from './semantic-document.js';
import { QueryEmbeddingCache, type QueryCacheLimits } from './query-embedding-cache.js';
import { EmbeddingRepairStateStore } from './embedding-repair.js';
import type { MemoryPaths } from './paths.js';
import type { MemoryRecord } from './types.js';
import { memorySemanticRevision } from './disclosure.js';
import type { Digest } from './experience-types.js';
import { buildMemoryPassages, PASSAGE_VERSION, MAX_PASSAGE_INPUT_UNITS, type PassageDescriptor, type PassageProjection } from './passages.js';

export interface IndexedPassage extends PassageDescriptor {
  semanticText: string;
  embedding?: number[];
  unavailableReason?: 'passage-input-too-large';
}
export interface MemoryIndexOptions { granularity?: 'record' | 'passage'; queryCache?: QueryCacheLimits }
export interface PassageScore { score: number; passageId: string; start: number; end: number; parentRevision: Digest }


export interface IndexEntry {
  id: string;
  fingerprint: string;
  semanticText: string;
  embedding?: number[];
  passages?: IndexedPassage[];
  passageCoverage?: Omit<PassageProjection, 'passages'>;
}

export interface MemoryIndexFile {
  version: 3 | 4;
  granularity?: 'record' | 'passage';
  passageVersion?: typeof PASSAGE_VERSION;
  semanticDocumentVersion: typeof SEMANTIC_DOCUMENT_VERSION;
  builtAt: string;
  embedder: MemoryEmbedderIdentity | null;
  entries: IndexEntry[];
}

export interface MemoryIndexResult {
  index: 'available' | 'degraded';
  embedding: 'available' | 'degraded' | 'not-configured';
  indexWarning?: string;
  embeddingWarning?: string;
}

export interface SemanticSearchContext {
  queryVector: number[];
  vectors: Map<string, number[]>;
  /** Identity of the exact derived semantic snapshot used for this call. */
  revision: string;
  passageScores?: Map<string, PassageScore>;
}
function fingerprint(record: MemoryRecord): string {
  return createHash('sha256').update(JSON.stringify({
    id: record.id,
    title: record.title,
    semanticDocumentVersion: SEMANTIC_DOCUMENT_VERSION,
    semanticText: buildSemanticDocument(record),
    content: record.content,
    keywords: record.keywords,
    context: record.context,
    tags: record.tags,
    category: record.category,
    ...(record.version === 2 ? {experience:record.experience} : {}),
  })).digest('hex');
}

function sameEmbedder(
  a: MemoryEmbedderIdentity | null | undefined,
  b: MemoryEmbedderIdentity | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return a.provider === b.provider && a.model === b.model && a.dimensions === b.dimensions;
}

function embedderIdentityDigest(identity: MemoryEmbedderIdentity): string {
  return createHash('sha256').update(JSON.stringify([identity.provider, identity.model, identity.dimensions])).digest('hex');
}

function validIdentity(identity: MemoryEmbedderIdentity | null): boolean {
  return identity === null || (
    typeof identity.provider === 'string' && Boolean(identity.provider.trim())
    && typeof identity.model === 'string' && Boolean(identity.model.trim())
    && Number.isSafeInteger(identity.dimensions) && identity.dimensions > 0
  );
}

function validEmbedding(vector: unknown, dimensions: number): vector is number[] {
  if (!Array.isArray(vector) || !vector.length || vector.length !== dimensions) return false;
  // Array.every skips sparse slots; inspect every dimension before accepting or
  // persisting a provider vector, including the cache-disabled query path.
  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) return false;
  }
  return true;
}
function validateIndexFile(file: MemoryIndexFile, granularity: 'record' | 'passage'): MemoryIndexFile {
  const supported = file.version === 3 ? granularity === 'record'
    : file.version === 4 && file.granularity === granularity && file.passageVersion === PASSAGE_VERSION;
  if (!supported || file.semanticDocumentVersion !== SEMANTIC_DOCUMENT_VERSION
    || !Array.isArray(file.entries)) throw new Error('Unsupported memory index format');
  if (typeof file.builtAt !== 'string' || !Number.isFinite(Date.parse(file.builtAt))) throw new Error('Invalid memory index builtAt');
  if (!validIdentity(file.embedder)) throw new Error('Invalid memory index embedder identity');
  const dimensions = file.embedder?.dimensions;
  const ids = new Set<string>();
  for (const entry of file.entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || ids.has(entry.id)
      || typeof entry.fingerprint !== 'string' || typeof entry.semanticText !== 'string') throw new Error('Invalid memory index entry');
    ids.add(entry.id);
    if (entry.embedding !== undefined && (!dimensions || !validEmbedding(entry.embedding, dimensions))) throw new Error('Invalid memory index embedding');
    if (granularity === 'passage') {
      const coverage = entry.passageCoverage;
      if (!Array.isArray(entry.passages) || entry.passages.length > 128 || !coverage || coverage.version !== PASSAGE_VERSION
        || !['complete', 'partial'].includes(coverage.coverage) || !Number.isSafeInteger(coverage.totalCodePoints)
        || !Number.isSafeInteger(coverage.coveredThrough) || coverage.coveredThrough < 0 || coverage.coveredThrough > coverage.totalCodePoints) throw new Error('Invalid memory passage coverage');
      const children = new Set<string>();
      for (const child of entry.passages) {
        if (!child || typeof child.id !== 'string' || children.has(child.id) || child.parentId !== entry.id
          || !/^sha256:[0-9a-f]{64}$/.test(child.parentRevision) || !Number.isSafeInteger(child.start) || !Number.isSafeInteger(child.end)
          || child.start < 0 || child.end <= child.start || child.end - child.start > 600
          || typeof child.text !== 'string' || Array.from(child.text).length !== child.end - child.start
          || typeof child.semanticText !== 'string' || !/^[0-9a-f]{64}$/.test(child.fingerprint)
          || (child.unavailableReason !== undefined && child.unavailableReason !== 'passage-input-too-large')
          || (child.unavailableReason ? child.semanticText.length <= MAX_PASSAGE_INPUT_UNITS || child.embedding !== undefined : child.semanticText.length > MAX_PASSAGE_INPUT_UNITS)) throw new Error('Invalid memory passage entry');
        children.add(child.id);
        if (child.embedding !== undefined && (!dimensions || !validEmbedding(child.embedding, dimensions))) throw new Error('Invalid memory passage embedding');
      }
    }
  }
  return file;
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
function baseEntries(records: MemoryRecord[], granularity: 'record' | 'passage', identity: MemoryEmbedderIdentity | null): IndexEntry[] {
  return records.map(record => {
    const entry: IndexEntry = { id: record.id, fingerprint: fingerprint(record), semanticText: buildSemanticDocument(record) };
    if (granularity === 'passage') {
      const { passages, ...passageCoverage } = buildMemoryPassages(record);
      entry.fingerprint = createHash('sha256').update(JSON.stringify(['passage-index/v1', entry.fingerprint, memorySemanticRevision(record)])).digest('hex');
      entry.passageCoverage = passageCoverage;
      entry.passages = passages.map(child => {
        const semanticText = buildSemanticDocument({ ...record, content: child.text });
        return { ...child, semanticText,
          fingerprint: createHash('sha256').update(JSON.stringify([child.fingerprint, identity])).digest('hex'),
          ...(semanticText.length > MAX_PASSAGE_INPUT_UNITS ? { unavailableReason: 'passage-input-too-large' as const } : {}) };
      });
    }
    return entry;
  }).sort((a, b) => a.id.localeCompare(b.id));
}
function childIdentity(child: IndexedPassage): unknown {
  const { embedding: _embedding, ...identity } = child;
  return identity;
}
function fileMatchesRecords(file: MemoryIndexFile, records: MemoryRecord[], embedder: MemoryEmbedder | undefined,
  granularity: 'record' | 'passage'): boolean {
  const expected = baseEntries(records, granularity, embedder?.identity ?? null);
  return file.entries.length === expected.length && sameEmbedder(file.embedder, embedder?.identity ?? null)
    && expected.every((entry, index) => {
      const actual = file.entries[index];
      return actual?.id === entry.id && actual.fingerprint === entry.fingerprint && actual.semanticText === entry.semanticText
        && (granularity === 'record' || (JSON.stringify(actual.passageCoverage) === JSON.stringify(entry.passageCoverage)
          && JSON.stringify(actual.passages?.map(childIdentity)) === JSON.stringify(entry.passages?.map(childIdentity))));
    });
}
function normalizedMean(vectors: number[][], dimensions: number): number[] | undefined {
  if (!vectors.length) return undefined;
  const sum = Array<number>(dimensions).fill(0);
  for (const vector of vectors) for (let i = 0; i < dimensions; i++) sum[i] += vector[i];
  const norm = Math.sqrt(sum.reduce((total, value) => total + value * value, 0));
  return sum.map(value => norm > 0 ? value / norm : 0);
}

function queryAbortError(): Error {
  const error = new Error('Memory query embedding wait aborted');
  error.name = 'AbortError';
  return error;
}

/** Local cancellation for the uncached path; provider settlement is always handled. */
function waitForQuery(produce: () => Promise<number[]>, signal: AbortSignal): Promise<number[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(queryAbortError()); return; }
    let settled = false;
    const settle = (operation: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      operation();
    };
    const onAbort = () => settle(() => reject(queryAbortError()));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    try {
      void Promise.resolve(produce()).then(
        vector => settle(() => resolve(vector)),
        error => settle(() => reject(error)),
      );
    } catch (error) { settle(() => reject(error)); }
  });
}

export class MemoryIndex {
  private readonly filePath: string;
  private readonly repairState: EmbeddingRepairStateStore;
  private readonly granularity: 'record' | 'passage';
  private readonly queryCache?: QueryEmbeddingCache;
  private queryCacheIdentityDigest?: string;
  private readonly queryLifetime = new AbortController();

  constructor(paths: MemoryPaths, private readonly embedder?: MemoryEmbedder, options: MemoryIndexOptions = {}) {
    this.granularity = options.granularity ?? 'record';
    this.filePath = path.join(paths.index, 'index.json');
    this.repairState = new EmbeddingRepairStateStore(paths);
    if (options.queryCache) {
      this.queryCache = new QueryEmbeddingCache({ ...options.queryCache });
      this.queryCacheIdentityDigest = embedder ? embedderIdentityDigest(embedder.identity) : undefined;
    }
  }

  dispose(): void {
    this.queryLifetime.abort();
    this.queryCache?.dispose();
  }

  private refreshQueryCacheIdentity(identity: MemoryEmbedderIdentity): void {
    if (!this.queryCache) return;
    const digest = embedderIdentityDigest(identity);
    if (this.queryCacheIdentityDigest !== digest) {
      this.queryCache.clear();
      this.queryCacheIdentityDigest = digest;
    }
  }

  async load(): Promise<MemoryIndexFile | null> {
    try {
      const file = validateIndexFile(JSON.parse(await readFile(this.filePath, 'utf8')) as MemoryIndexFile, this.granularity);
      if (this.granularity === 'passage' && file.embedder) for (const entry of file.entries) {
        entry.embedding = normalizedMean(entry.passages!.flatMap(child => validEmbedding(child.embedding, file.embedder!.dimensions) ? [child.embedding] : []), file.embedder.dimensions);
      }
      return file;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  private fileResult(file: MemoryIndexFile): MemoryIndexResult {
    if (!this.embedder) return { index: 'available', embedding: 'not-configured' };
    const dimensions = this.embedder.identity.dimensions;
    const incomplete = file.entries.some(entry => this.granularity === 'passage'
      ? entry.passageCoverage?.coverage === 'partial' || entry.passages?.some(child => child.unavailableReason || !validEmbedding(child.embedding, dimensions))
      : !validEmbedding(entry.embedding, dimensions));
    return { index: 'available', embedding: incomplete ? 'degraded' : 'available',
      ...(incomplete ? { embeddingWarning: 'Memory passage/record semantic coverage incomplete; unavailable inputs and bounded repair remain lexical-only' } : {}) };
  }
  private embeddingsComplete(file: MemoryIndexFile): boolean {
    if (!this.embedder) return true;
    return file.entries.every(entry => this.granularity === 'passage'
      ? entry.passages?.every(child => child.unavailableReason || validEmbedding(child.embedding, this.embedder!.identity.dimensions))
      : validEmbedding(entry.embedding, this.embedder!.identity.dimensions));
  }
  private async build(records: MemoryRecord[], existing: MemoryIndexFile | null, forceEmbed = false, retainMissing = false): Promise<{ file: MemoryIndexFile; result: MemoryIndexResult }> {
    const entries = baseEntries(records, this.granularity, this.embedder?.identity ?? null);
    const file: MemoryIndexFile = { version: this.granularity === 'passage' ? 4 : 3,
      ...(this.granularity === 'passage' ? { granularity: this.granularity, passageVersion: PASSAGE_VERSION } : {}),
      semanticDocumentVersion: SEMANTIC_DOCUMENT_VERSION, builtAt: new Date().toISOString(), embedder: this.embedder?.identity ?? null, entries };
    if (!this.embedder) return { file, result: this.fileResult(file) };
    const dimensions = this.embedder.identity.dimensions;
    const reusable = sameEmbedder(existing?.embedder, this.embedder.identity)
      ? new Map(existing?.entries.map(entry => [entry.id, entry]) ?? []) : new Map<string, IndexEntry>();
    type EmbeddingTarget = Pick<IndexEntry, 'id' | 'fingerprint' | 'semanticText' | 'embedding'>;
    const targets: EmbeddingTarget[] = [];
    const missing: EmbeddingTarget[] = [];
    for (const entry of entries) {
      const previous = reusable.get(entry.id);
      if (this.granularity === 'passage') {
        const children = previous?.fingerprint === entry.fingerprint ? new Map(previous.passages?.map(child => [child.id, child]) ?? []) : new Map<string, IndexedPassage>();
        for (const child of entry.passages!) {
          if (child.unavailableReason) continue;
          targets.push(child);
          const old = children.get(child.id);
          if (!forceEmbed && old?.fingerprint === child.fingerprint && validEmbedding(old.embedding, dimensions)) child.embedding = old.embedding;
          else missing.push(child);
        }
      } else {
        targets.push(entry);
        if (!forceEmbed && previous?.fingerprint === entry.fingerprint && validEmbedding(previous.embedding, dimensions)) entry.embedding = previous.embedding;
        else missing.push(entry);
      }
    }
    let warning: string | undefined;
    const currentIds = new Set(entries.map(entry => entry.id));
    const retainedTargets = retainMissing ? [...reusable.values()].filter(entry => !currentIds.has(entry.id))
      .flatMap(entry => this.granularity === 'passage' ? (entry.passages ?? []).filter(child => !child.unavailableReason) : [entry]) : [];
    try { await this.repairState.reconcile([...targets, ...retainedTargets], this.embedder.identity); }
    catch { warning = 'Memory embedding repair state degraded'; }
    if (missing.length) {
      let due: EmbeddingTarget[] = [];
      try {
        const keys = new Set((warning ? [] : await this.repairState.due(missing, this.embedder.identity, { force: forceEmbed })).map(entry => `${entry.id}\u0000${entry.fingerprint}`));
        due = missing.filter(entry => keys.has(`${entry.id}\u0000${entry.fingerprint}`));
      } catch { warning = 'Memory embedding repair state degraded'; }
      if (!warning && due.length) {
        try {
          const vectors = await this.embedder.embedDocuments(due.map(entry => entry.semanticText));
          if (vectors.length !== due.length) throw new Error('Embedding vector count mismatch');
          // Validate the whole batch before publishing any child or parent vector.
          if (vectors.some(vector => !validEmbedding(vector, dimensions))) throw new Error('Embedding dimension/value mismatch');
          due.forEach((entry, index) => { entry.embedding = vectors[index]; });
          await this.repairState.markSuccess(due, this.embedder.identity);
        } catch (error) {
          due.forEach(entry => { delete entry.embedding; });
          warning = 'Memory embedding unavailable or invalid; bounded repair incomplete';
          await this.repairState.markFailure(due, this.embedder.identity, error, { force: forceEmbed }).catch(() => undefined);
        }
      }
      if (missing.some(entry => !validEmbedding(entry.embedding, dimensions))) warning ??= 'Memory embedding repair deferred by bounded retry/admission policy';
    }
    if (this.granularity === 'passage') for (const entry of entries) {
      entry.embedding = normalizedMean(entry.passages!.flatMap(child => validEmbedding(child.embedding, dimensions) ? [child.embedding] : []), dimensions);
    }
    return { file, result: { ...this.fileResult(file), ...(warning ? { embedding: 'degraded', embeddingWarning: warning } : {}) } };
  }

  async inspect(records: MemoryRecord[]): Promise<MemoryIndexResult> {
    let file: MemoryIndexFile | null;
    try {
      file = await this.load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        index: 'degraded',
        embedding: this.embedder ? 'degraded' : 'not-configured',
        indexWarning: message,
      };
    }
    if (!file) {
      return {
        index: 'degraded',
        embedding: this.embedder ? 'degraded' : 'not-configured',
        indexWarning: 'Memory index is missing',
      };
    }
    if (!fileMatchesRecords(file, records, this.embedder, this.granularity)) {
      return {
        index: 'degraded',
        embedding: this.embedder ? 'degraded' : 'not-configured',
        indexWarning: 'Memory index is stale relative to canonical memory',
      };
    }
    return this.fileResult(file);
  }

  async rebuild(records: MemoryRecord[]): Promise<MemoryIndexResult> {
    const { file, result } = await this.build(records, null, true);
    await atomicWrite(this.filePath, `${JSON.stringify(file, null, 2)}\n`);
    return result;
  }

  async ensure(records: MemoryRecord[], options: { retainMissing?: boolean } = {}): Promise<MemoryIndexResult> {
    let existing: MemoryIndexFile | null = null;
    try { existing = await this.load(); } catch { existing = null; }
    const matches = existing
      && fileMatchesRecords(existing, records, this.embedder, this.granularity)
      && this.embeddingsComplete(existing);
    if (matches && existing && !options.retainMissing) {
      return this.fileResult(existing);
    }
    const { file, result } = await this.build(records, existing, false, options.retainMissing);
    if (options.retainMissing && existing) {
      const currentIds = new Set(file.entries.map((entry) => entry.id));
      const preserveEmbedding = sameEmbedder(existing.embedder, file.embedder);
      for (const entry of existing.entries) {
        if (currentIds.has(entry.id)) continue;
        file.entries.push({
          ...entry, embedding: preserveEmbedding ? entry.embedding : undefined,
          ...(entry.passages ? { passages: entry.passages.map(child => { const { embedding, ...rest } = child; return { ...rest, ...(preserveEmbedding && embedding ? { embedding } : {}) }; }) } : {}),
          ...(preserveEmbedding && entry.embedding ? { embedding: entry.embedding } : {}),
        });
      }
      file.entries.sort((a, b) => a.id.localeCompare(b.id));
    }
    await atomicWrite(this.filePath, `${JSON.stringify(file, null, 2)}\n`);
    if (!options.retainMissing) return result;
    return {
      ...result,
      index: 'degraded',
      indexWarning: 'Canonical scan incomplete; prior derived entries were retained rather than treated as deletions',
    };
  }

  async semanticContext(
    query: string,
    canonicalRecords: MemoryRecord[],
    eligibleRecords: MemoryRecord[] = canonicalRecords,
    options: { signal?: AbortSignal } = {},
  ): Promise<SemanticSearchContext | null> {
    const signal = options.signal ? AbortSignal.any([options.signal, this.queryLifetime.signal]) : this.queryLifetime.signal;
    if (signal.aborted) throw queryAbortError();
    if (!this.embedder) return null;
    // A visible embedder configuration change invalidates old generations even
    // if the current index is incompatible. No query vector is read here.
    this.refreshQueryCacheIdentity(this.embedder.identity);
    const file = await this.load();
    if (!file || !fileMatchesRecords(file, canonicalRecords, this.embedder, this.granularity)) return null;
    const canonical = new Map(baseEntries(canonicalRecords, this.granularity, this.embedder.identity).map(entry => [entry.id, entry.fingerprint]));
    const eligible = new Set<string>();
    for (const record of eligibleRecords) {
      if (eligible.has(record.id) || canonical.get(record.id) !== baseEntries([record], this.granularity, this.embedder.identity)[0].fingerprint) return null;
      eligible.add(record.id);
    }
    const vectors = new Map<string, number[]>();
    for (const entry of file.entries) {
      if (eligible.has(entry.id) && validEmbedding(entry.embedding, this.embedder.identity.dimensions)) {
        vectors.set(entry.id, entry.embedding);
      }
    }
    if (!vectors.size) return null;
    const identity = { ...this.embedder.identity };
    const produce = async () => {
      const [vector] = await this.embedder!.embedDocuments([query]);
      if (!validEmbedding(vector, identity.dimensions)) throw new Error('Memory query embedding has invalid dimensions or values');
      return vector;
    };
    // Every request has just loaded/validated the current corpus and eligible
    // vectors. Only the query vector below can be reused; context, passage scores
    // and snapshot identity are rebuilt for this exact request.
    this.refreshQueryCacheIdentity(identity);
    const queryVector = this.queryCache
      ? await this.queryCache.getOrCreate({ identity, query,
        queryRepresentationVersion: 'embedDocuments-query/v1',
        documentRepresentationVersion: `semantic-document/v${file.semanticDocumentVersion}` }, produce, signal)
      : await waitForQuery(produce, signal);
    if (!sameEmbedder(identity, this.embedder.identity)) return null;
    const passageScores = this.granularity === 'passage' ? new Map<string, PassageScore>() : undefined;
    if (passageScores) for (const entry of file.entries) {
      if (!eligible.has(entry.id)) continue;
      let best: PassageScore | undefined;
      for (const child of entry.passages!) {
        if (!validEmbedding(child.embedding, this.embedder.identity.dimensions)) continue;
        const score = Math.max(0, Math.min(1, cosineSimilarity(queryVector, child.embedding)));
        if (!best || score > best.score || (score === best.score && (child.start < best.start || (child.start === best.start && child.id.localeCompare(best.passageId) < 0)))) {
          best = { score, passageId: child.id, start: child.start, end: child.end, parentRevision: child.parentRevision };
        }
      }
      if (best) passageScores.set(entry.id, best);
    }
    const revision = `sha256:${createHash('sha256').update(JSON.stringify([
      'semantic-search/v2', file.version, this.granularity, file.semanticDocumentVersion, file.embedder,
      file.entries.filter(entry => vectors.has(entry.id)).map(entry => [entry.id, entry.fingerprint, entry.embedding,
        entry.passages?.map(child => [child.id, child.fingerprint, child.embedding ?? null, child.unavailableReason ?? null])]),
    ])).digest('hex')}`;
    return { queryVector, vectors, revision, ...(passageScores ? { passageScores } : {}) };
  }

  async nearest(
    id: string,
    records: MemoryRecord[],
    limit = 5,
  ): Promise<Array<{ id: string; similarity: number }>> {
    const file = await this.load();
    if (!file || !fileMatchesRecords(file, records, this.embedder, this.granularity)) return [];
    const dimensions = file.embedder?.dimensions;
    const source = file.entries.find((entry) => entry.id === id)?.embedding;
    if (!dimensions || !validEmbedding(source, dimensions)) return [];
    return file.entries
      .filter((entry) => entry.id !== id && validEmbedding(entry.embedding, dimensions))
      .map((entry) => ({ id: entry.id, similarity: cosineSimilarity(source, entry.embedding!) }))
      .filter((item) => Number.isFinite(item.similarity))
      .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id))
      .slice(0, Math.max(1, Math.min(50, limit)));
  }

  async similarPairs(
    records: MemoryRecord[],
    threshold = 0.82,
    limit = 50,
  ): Promise<Array<{ leftId: string; rightId: string; similarity: number }>> {
    const file = await this.load();
    if (!file || !fileMatchesRecords(file, records, this.embedder, this.granularity)) return [];
    const dimensions = file.embedder?.dimensions;
    if (!dimensions) return [];
    const entries = file.entries.filter((entry) => validEmbedding(entry.embedding, dimensions));
    const pairs: Array<{ leftId: string; rightId: string; similarity: number }> = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const similarity = cosineSimilarity(entries[i].embedding!, entries[j].embedding!);
        if (Number.isFinite(similarity) && similarity >= threshold) {
          pairs.push({ leftId: entries[i].id, rightId: entries[j].id, similarity });
        }
      }
    }
    return pairs
      .sort((a, b) => b.similarity - a.similarity || a.leftId.localeCompare(b.leftId))
      .slice(0, Math.max(1, Math.min(200, limit)));
  }

  async repairSummary(): Promise<{ pending: number; failed: number; issue?: string }> {
    return this.repairState.summary(this.embedder?.identity);
  }

  identity(): MemoryEmbedderIdentity | null {
    return this.embedder?.identity ?? null;
  }
}
