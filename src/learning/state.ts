import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { persistSerializedFile } from '../auth/persistent-file.js';
import type { LearningState } from './types.js';
import type { LearningPaths } from './paths.js';

const MAX_IDEMPOTENCY = 64;

export function defaultLearningState(): LearningState {
  return {
    version: 1,
    checkpointCount: 0,
    sinceReview: 0,
    lastCheckpointAt: null,
    lastReviewAt: null,
    lastCuratorAt: null,
    recentIdempotency: [],
  };
}

function normalizeState(value: unknown): LearningState {
  if (!value || typeof value !== 'object') throw new Error('Invalid learning state');
  const raw = value as Partial<LearningState>;
  if (raw.version !== 1) throw new Error('Unsupported learning state version');
  const integer = (v: unknown, name: string) => {
    if (!Number.isSafeInteger(v) || Number(v) < 0) throw new Error(`Invalid learning ${name}`);
    return Number(v);
  };

  const nullableIso = (v: unknown, name: string): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw new Error(`Invalid learning ${name}`);
    return new Date(v).toISOString();
  };
  const recent = Array.isArray(raw.recentIdempotency)
    ? raw.recentIdempotency.slice(-MAX_IDEMPOTENCY).map((item) => {
      if (!item || typeof item !== 'object') throw new Error('Invalid learning idempotency record');
      const record = item as { key?: unknown; at?: unknown };
      if (typeof record.key !== 'string' || !record.key.trim()) throw new Error('Invalid learning idempotency key');
      return { key: record.key.trim().slice(0, 200), at: nullableIso(record.at, 'idempotency timestamp')! };
    })
    : [];

  return {
    version: 1,
    checkpointCount: integer(raw.checkpointCount ?? 0, 'checkpointCount'),
    sinceReview: integer(raw.sinceReview ?? 0, 'sinceReview'),
    lastCheckpointAt: nullableIso(raw.lastCheckpointAt, 'lastCheckpointAt'),
    lastReviewAt: nullableIso(raw.lastReviewAt, 'lastReviewAt'),
    lastCuratorAt: nullableIso(raw.lastCuratorAt, 'lastCuratorAt'),
    recentIdempotency: recent,
  };
}

export class LearningStateStore {
  private issue: string | null = null;
  private corruptionSnapshotTaken = false;

  constructor(readonly paths: LearningPaths) {}

  getIssue(): string | null {
    return this.issue;
  }

  async load(): Promise<LearningState> {
    await mkdir(this.paths.root, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.paths.state, 'utf8'));
      const state = normalizeState(parsed);
      this.issue = null;
      this.corruptionSnapshotTaken = false;
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.issue = null;
        return defaultLearningState();
      }
      this.issue = `Learning state degraded: ${error instanceof Error ? error.message : String(error)}`;
      if (!this.corruptionSnapshotTaken) {
        try {
          const stamp = new Date().toISOString().replaceAll(':', '-');
          await copyFile(this.paths.state, path.join(this.paths.root, `state.corrupt.${stamp}.json`));
          this.corruptionSnapshotTaken = true;
        } catch {
          // Preserve fail-soft startup even if the corrupt snapshot cannot be copied.
        }
      }
      return defaultLearningState();
    }
  }

  async save(state: LearningState): Promise<void> {
    await mkdir(this.paths.root, { recursive: true });
    const normalized = normalizeState({
      ...state,
      recentIdempotency: state.recentIdempotency.slice(-MAX_IDEMPOTENCY),
    });
    const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
    const temporary = `${this.paths.state}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
    await persistSerializedFile(temporary, this.paths.state, serialized);
    this.issue = null;
    this.corruptionSnapshotTaken = false;
  }
}
