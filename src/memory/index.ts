import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { cosineSimilarity, type MemoryEmbedder, type MemoryEmbedderIdentity } from './embedder.js';
import { buildSemanticDocument } from './semantic-document.js';
import type { MemoryPaths } from './paths.js';
import type { MemoryRecord } from './types.js';

export interface IndexEntry {
  id: string;
  fingerprint: string;
  semanticText: string;
  embedding?: number[];
}

export interface MemoryIndexFile {
  version: 2;
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
}
function fingerprint(record: MemoryRecord): string {
  return createHash('sha256').update(JSON.stringify({
    id: record.id,
    content: record.content,
    keywords: record.keywords,
    context: record.context,
    tags: record.tags,
    category: record.category,
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
  if (file.version !== 2 || !Array.isArray(file.entries)) throw new Error('Unsupported memory index format');
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

  constructor(paths: MemoryPaths, private readonly embedder?: MemoryEmbedder) {
    this.filePath = path.join(paths.index, 'index.json');
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
        file: { version: 2, builtAt: new Date().toISOString(), embedder: null, entries },
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
      try {
        const vectors = await this.embedder.embedDocuments(missing.map((entry) => entry.semanticText));
        if (vectors.length !== missing.length) throw new Error('Embedding vector count mismatch');
        missing.forEach((entry, index) => {
          const vector = vectors[index];
          if (!validEmbedding(vector, this.embedder!.identity.dimensions)) {
            throw new Error(`Embedding dimension/value mismatch for ${entry.id}`);
          }
          entry.embedding = vector;
        });
      } catch (error) {
        embedding = 'degraded';
        embeddingWarning = error instanceof Error ? error.message : String(error);
      }
    }
    const file: MemoryIndexFile = {
      version: 2,
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

  async ensure(records: MemoryRecord[]): Promise<MemoryIndexResult> {
    let existing: MemoryIndexFile | null = null;
    try { existing = await this.load(); } catch { existing = null; }
    const matches = existing
      && fileMatchesRecords(existing, records, this.embedder)
      && (!this.embedder || existing.entries.every((entry) =>
        validEmbedding(entry.embedding, this.embedder!.identity.dimensions)));
    if (matches) {
      return { index: 'available', embedding: this.embedder ? 'available' : 'not-configured' };
    }
    const { file, result } = await this.build(records, existing, false);
    await atomicWrite(this.filePath, `${JSON.stringify(file, null, 2)}\n`);
    return result;
  }

  async semanticContext(query: string, records: MemoryRecord[]): Promise<SemanticSearchContext | null> {
    if (!this.embedder) return null;
    const file = await this.load();
    if (!file || !fileMatchesRecords(file, records, this.embedder)) return null;
    const [queryVector] = await this.embedder.embedDocuments([query]);
    if (!validEmbedding(queryVector, this.embedder.identity.dimensions)) {
      throw new Error('Memory query embedding has invalid dimensions or values');
    }
    const vectors = new Map<string, number[]>();
    for (const entry of file.entries) {
      if (validEmbedding(entry.embedding, this.embedder.identity.dimensions)) {
        vectors.set(entry.id, entry.embedding);
      }
    }
    return vectors.size ? { queryVector, vectors } : null;
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

  identity(): MemoryEmbedderIdentity | null {
    return this.embedder?.identity ?? null;
  }
}
