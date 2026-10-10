import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { cosineSimilarity, type MemoryEmbedder, type MemoryEmbedderIdentity } from './embedder.js';
import { buildSemanticDocument, SEMANTIC_DOCUMENT_VERSION } from './semantic-document.js';
import { EmbeddingRepairStateStore } from './embedding-repair.js';
import type { MemoryPaths } from './paths.js';
import type { MemoryRecord } from './types.js';

export interface IndexEntry {
  id: string;
  fingerprint: string;
  semanticText: string;
  embedding?: number[];
}

export interface MemoryIndexFile {
  version: 3;
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

function validIdentity(identity: MemoryEmbedderIdentity | null): boolean {
  return identity === null || (
    typeof identity.provider === 'string' && Boolean(identity.provider.trim())
    && typeof identity.model === 'string' && Boolean(identity.model.trim())
    && Number.isSafeInteger(identity.dimensions) && identity.dimensions > 0
  );
}

function validEmbedding(vector: unknown, dimensions: number): vector is number[] {
  return Array.isArray(vector)
    && vector.length === dimensions
    && vector.every((value) => typeof value === 'number' && Number.isFinite(value));
}
function validateIndexFile(file: MemoryIndexFile): MemoryIndexFile {
  if (file.version !== 3 || file.semanticDocumentVersion !== SEMANTIC_DOCUMENT_VERSION
    || !Array.isArray(file.entries)) throw new Error('Unsupported memory index format');
  if (typeof file.builtAt !== 'string' || !Number.isFinite(Date.parse(file.builtAt))) {
    throw new Error('Invalid memory index builtAt');
  }
  if (!validIdentity(file.embedder)) throw new Error('Invalid memory index embedder identity');
  const dimensions = file.embedder?.dimensions;
  for (const entry of file.entries) {
    if (!entry || typeof entry !== 'object'
      || typeof entry.id !== 'string'
      || typeof entry.fingerprint !== 'string'
      || typeof entry.semanticText !== 'string') {
      throw new Error('Invalid memory index entry');
    }
    if (entry.embedding !== undefined) {
      if (!dimensions || !validEmbedding(entry.embedding, dimensions)) {
        throw new Error(`Invalid memory index embedding for ${entry.id}`);
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
function baseEntries(records: MemoryRecord[]): IndexEntry[] {
  return records
    .map((record) => ({
      id: record.id,
      fingerprint: fingerprint(record),
      semanticText: buildSemanticDocument(record),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function fileMatchesRecords(
  file: MemoryIndexFile,
  records: MemoryRecord[],
  embedder: MemoryEmbedder | undefined,
): boolean {
  const expected = baseEntries(records);
  return file.entries.length === expected.length
    && expected.every((entry, index) =>
      file.entries[index]?.id === entry.id
      && file.entries[index]?.fingerprint === entry.fingerprint)
    && sameEmbedder(file.embedder, embedder?.identity ?? null);
}

export class MemoryIndex {
  private readonly filePath: string;
  private readonly repairState: EmbeddingRepairStateStore;

  constructor(paths: MemoryPaths, private readonly embedder?: MemoryEmbedder) {
    this.filePath = path.join(paths.index, 'index.json');
    this.repairState = new EmbeddingRepairStateStore(paths);
  }

  async load(): Promise<MemoryIndexFile | null> {
    try {
      return validateIndexFile(JSON.parse(await readFile(this.filePath, 'utf8')) as MemoryIndexFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  private async build(
    records: MemoryRecord[],
    existing: MemoryIndexFile | null,
    forceEmbed = false,
  ): Promise<{ file: MemoryIndexFile; result: MemoryIndexResult }> {
    const entries = baseEntries(records);
    if (!this.embedder) {
      return {
        file: { version: 3, semanticDocumentVersion: SEMANTIC_DOCUMENT_VERSION, builtAt: new Date().toISOString(), embedder: null, entries },
        result: { index: 'available', embedding: 'not-configured' },
      };
    }

    const reusable = sameEmbedder(existing?.embedder, this.embedder.identity)
      ? new Map(existing?.entries.map((entry) => [entry.id, entry]) ?? [])
      : new Map<string, IndexEntry>();
    const missing: IndexEntry[] = [];
    for (const entry of entries) {
      const previous = reusable.get(entry.id);
      if (!forceEmbed
        && previous?.fingerprint === entry.fingerprint
        && validEmbedding(previous.embedding, this.embedder.identity.dimensions)) {
        entry.embedding = previous.embedding;
      } else {
        missing.push(entry);
      }
    }

    let embedding: MemoryIndexResult['embedding'] = 'available';
    let embeddingWarning: string | undefined;
    if (missing.length) {
      let due: IndexEntry[] = [];
      try {
        await this.repairState.reconcile(
          entries.map(entry => ({ id: entry.id, fingerprint: entry.fingerprint })),
          this.embedder.identity,
        );
        const dueKeys = new Set(
          (await this.repairState.due(
            missing.map(entry => ({ id: entry.id, fingerprint: entry.fingerprint })),
            this.embedder.identity,
            { force: forceEmbed },
          )).map(entry => `${entry.id}\u0000${entry.fingerprint}`),
        );
        due = missing.filter(entry => dueKeys.has(`${entry.id}\u0000${entry.fingerprint}`));
      } catch (error) {
        embedding = 'degraded';
        embeddingWarning = error instanceof Error ? error.message : String(error);
      }

      if (!embeddingWarning && due.length) {
        try {
          const vectors = await this.embedder.embedDocuments(due.map((entry) => entry.semanticText));
          if (vectors.length !== due.length) throw new Error('Embedding vector count mismatch');
          due.forEach((entry, index) => {
            const vector = vectors[index];
            if (!validEmbedding(vector, this.embedder!.identity.dimensions)) {
              throw new Error(`Embedding dimension/value mismatch for ${entry.id}`);
            }
            entry.embedding = vector;
          });
          await this.repairState.markSuccess(
            due.map(entry => ({ id: entry.id, fingerprint: entry.fingerprint })),
            this.embedder.identity,
          );
        } catch (error) {
          embedding = 'degraded';
          embeddingWarning = error instanceof Error ? error.message : String(error);
          try {
            await this.repairState.markFailure(
              due.map(entry => ({ id: entry.id, fingerprint: entry.fingerprint })),
              this.embedder.identity,
              error,
              { force: forceEmbed },
            );
          } catch {
            // Canonical Memory and lexical index remain authoritative if repair-state persistence degrades.
          }
        }
      }

      const stillMissing = missing.filter(entry =>
        !validEmbedding(entry.embedding, this.embedder!.identity.dimensions));
      if (stillMissing.length) {
        embedding = 'degraded';
        embeddingWarning ??= due.length
          ? 'Memory embedding repair remains incomplete'
          : 'Memory embedding repair deferred by bounded retry policy';
      }
    }
    const file: MemoryIndexFile = {
      version: 3,
      semanticDocumentVersion: SEMANTIC_DOCUMENT_VERSION,
      builtAt: new Date().toISOString(),
      embedder: this.embedder.identity,
      entries,
    };
    return {
      file,
      result: {
        index: 'available',
        embedding,
        ...(embeddingWarning ? { embeddingWarning } : {}),
      },
    };
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
    if (!fileMatchesRecords(file, records, this.embedder)) {
      return {
        index: 'degraded',
        embedding: this.embedder ? 'degraded' : 'not-configured',
        indexWarning: 'Memory index is stale relative to canonical memory',
      };
    }
    if (this.embedder) {
      const invalid = file.entries.find((entry) =>
        !validEmbedding(entry.embedding, this.embedder!.identity.dimensions));
      if (invalid) {
        return {
          index: 'available',
          embedding: 'degraded',
          embeddingWarning: `Memory embedding missing or invalid for ${invalid.id}`,
        };
      }
    }
    return { index: 'available', embedding: this.embedder ? 'available' : 'not-configured' };
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
      && fileMatchesRecords(existing, records, this.embedder)
      && (!this.embedder || existing.entries.every((entry) =>
        validEmbedding(entry.embedding, this.embedder!.identity.dimensions)));
    if (matches && !options.retainMissing) {
      return { index: 'available', embedding: this.embedder ? 'available' : 'not-configured' };
    }
    const { file, result } = await this.build(records, existing, false);
    if (options.retainMissing && existing) {
      const currentIds = new Set(file.entries.map((entry) => entry.id));
      const preserveEmbedding = sameEmbedder(existing.embedder, file.embedder);
      for (const entry of existing.entries) {
        if (currentIds.has(entry.id)) continue;
        file.entries.push({
          id: entry.id,
          fingerprint: entry.fingerprint,
          semanticText: entry.semanticText,
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
  ): Promise<SemanticSearchContext | null> {
    if (!this.embedder) return null;
    const file = await this.load();
    if (!file || !fileMatchesRecords(file, canonicalRecords, this.embedder)) return null;
    const canonical = new Map(canonicalRecords.map(record => [record.id, fingerprint(record)]));
    const eligible = new Set<string>();
    for (const record of eligibleRecords) {
      if (eligible.has(record.id) || canonical.get(record.id) !== fingerprint(record)) return null;
      eligible.add(record.id);
    }
    const vectors = new Map<string, number[]>();
    for (const entry of file.entries) {
      if (eligible.has(entry.id) && validEmbedding(entry.embedding, this.embedder.identity.dimensions)) {
        vectors.set(entry.id, entry.embedding);
      }
    }
    if (!vectors.size) return null;
    const [queryVector] = await this.embedder.embedDocuments([query]);
    if (!validEmbedding(queryVector, this.embedder.identity.dimensions)) {
      throw new Error('Memory query embedding has invalid dimensions or values');
    }
    const revision = `sha256:${createHash('sha256').update(JSON.stringify([
      'semantic-search/v1', file.version, 'semantic-document', file.semanticDocumentVersion, file.embedder,
      file.entries.filter(entry => vectors.has(entry.id))
        .map(entry => [entry.id,entry.fingerprint]).sort(([a],[b]) => a.localeCompare(b)),
    ])).digest('hex')}`;
    return { queryVector, vectors, revision };
  }

  async nearest(
    id: string,
    records: MemoryRecord[],
    limit = 5,
  ): Promise<Array<{ id: string; similarity: number }>> {
    const file = await this.load();
    if (!file || !fileMatchesRecords(file, records, this.embedder)) return [];
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
    if (!file || !fileMatchesRecords(file, records, this.embedder)) return [];
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
