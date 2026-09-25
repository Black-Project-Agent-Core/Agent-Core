import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintFile, type MemoryTransactionMutation } from './transaction.js';
import type { MemoryPaths } from './paths.js';
import type { MemoryRecord } from './types.js';

const REVISION_FILE_VERSION = 1 as const;
const MAX_REVISIONS_PER_MEMORY = 8;
const MAX_REVISION_BYTES_PER_MEMORY = 1_000_000;

export interface MemoryRevisionSnapshot {
  capturedAt: string;
  record: MemoryRecord;
}

interface MemoryRevisionFile {
  version: typeof REVISION_FILE_VERSION;
  id: string;
  revisions: MemoryRevisionSnapshot[];
}

export interface MemoryRevisionRead {
  revisions: MemoryRevisionSnapshot[];
  warning?: string;
}

export function revisionStatePath(paths: MemoryPaths, id: string): string {
  return path.join(paths.revisions, `${id}.json`);
}

function serialize(file: MemoryRevisionFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

function parseRevisionFile(serialized: string, id: string): MemoryRevisionFile {
  const raw = JSON.parse(serialized) as Partial<MemoryRevisionFile>;
  if (raw.version !== REVISION_FILE_VERSION || raw.id !== id || !Array.isArray(raw.revisions)) {
    throw new Error(`MEMORY_REVISION_STATE_INVALID: ${id}`);
  }
  const revisions = raw.revisions.map((item) => {
    if (!item || typeof item !== 'object') throw new Error(`MEMORY_REVISION_STATE_INVALID: ${id}`);
    const capturedAt = String((item as MemoryRevisionSnapshot).capturedAt ?? '');
    const record = (item as MemoryRevisionSnapshot).record;
    if (!Number.isFinite(Date.parse(capturedAt)) || !record || record.id !== id || typeof record.content !== 'string') {
      throw new Error(`MEMORY_REVISION_STATE_INVALID: ${id}`);
    }
    return { capturedAt: new Date(capturedAt).toISOString(), record };
  });
  return { version: REVISION_FILE_VERSION, id, revisions };
}

async function loadStrict(paths: MemoryPaths, id: string): Promise<MemoryRevisionFile> {
  const filePath = revisionStatePath(paths, id);
  try {
    return parseRevisionFile(await readFile(filePath, 'utf8'), id);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: REVISION_FILE_VERSION, id, revisions: [] };
    }
    throw error;
  }
}

function bounded(file: MemoryRevisionFile): MemoryRevisionFile {
  const revisions = file.revisions.slice(-MAX_REVISIONS_PER_MEMORY);
  while (revisions.length > 1) {
    const candidate = { ...file, revisions };
    if (Buffer.byteLength(serialize(candidate), 'utf8') <= MAX_REVISION_BYTES_PER_MEMORY) break;
    revisions.shift();
  }
  return { ...file, revisions };
}

export async function buildRevisionMutation(
  paths: MemoryPaths,
  current: MemoryRecord,
): Promise<MemoryTransactionMutation> {
  const targetPath = revisionStatePath(paths, current.id);
  const expectedFingerprint = await fingerprintFile(targetPath);
  const existing = await loadStrict(paths, current.id);
  const next = bounded({
    version: REVISION_FILE_VERSION,
    id: current.id,
    revisions: [
      ...existing.revisions,
      {
        capturedAt: new Date().toISOString(),
        record: JSON.parse(JSON.stringify(current)) as MemoryRecord,
      },
    ],
  });
  return { targetPath, content: serialize(next), expectedFingerprint };
}

export async function readMemoryRevisions(
  paths: MemoryPaths,
  id: string,
  limit = 5,
): Promise<MemoryRevisionRead> {
  const boundedLimit = Math.max(0, Math.min(MAX_REVISIONS_PER_MEMORY, Math.trunc(limit)));
  if (boundedLimit === 0) return { revisions: [] };
  try {
    const file = await loadStrict(paths, id);
    return { revisions: file.revisions.slice(-boundedLimit).reverse() };
  } catch (error) {
    return {
      revisions: [],
      warning: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    };
  }
}
