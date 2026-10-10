import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MemoryEmbedderIdentity } from './embedder.js';
import type { MemoryPaths } from './paths.js';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';

const VERSION = 1 as const;
const MAX_JOBS = 512;
const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;

export type EmbeddingRepairStatus = 'pending' | 'failed';

export interface EmbeddingRepairJob {
  id: string;
  fingerprint: string;
  embedderKey: string;
  status: EmbeddingRepairStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  updatedAt: string;
}
interface EmbeddingRepairState {
  version: typeof VERSION;
  jobs: EmbeddingRepairJob[];
}

function embedderKey(identity: MemoryEmbedderIdentity): string {
  return JSON.stringify([identity.provider, identity.model, identity.dimensions]);
}
function safeErrorCategory(error: unknown): string {
  const code = typeof error === 'object' && error !== null
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (/rate|429|retry/i.test(code)) return 'rate-limited';
  const message = error instanceof Error ? error.message : String(error);
  if (/429|rate|retry-after|cooldown/i.test(message)) return 'rate-limited';
  if (/dimension|vector|count mismatch|invalid/i.test(message)) return 'invalid-vector';
  if (/timeout|unavailable|network|fetch|HTTP 5/i.test(message)) return 'embedding-unavailable';
  return 'embedding-failed';
}
function retryAtFromError(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const value = Number((error as { retryAt?: unknown }).retryAt);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function backoff(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
}
function validateJob(raw: unknown): EmbeddingRepairJob {
  if (!raw || typeof raw !== 'object') throw new Error('MEMORY_EMBEDDING_REPAIR_JOB_INVALID');
  const value = raw as Partial<EmbeddingRepairJob>;
  if (typeof value.id !== 'string' || !value.id
    || typeof value.fingerprint !== 'string' || !/^[0-9a-f]{64}$/i.test(value.fingerprint)
    || typeof value.embedderKey !== 'string' || !value.embedderKey
    || (value.status !== 'pending' && value.status !== 'failed')
    || !Number.isSafeInteger(value.attempts) || Number(value.attempts) < 0
    || typeof value.nextAttemptAt !== 'number' || !Number.isFinite(value.nextAttemptAt)
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
    || (value.lastError !== null && value.lastError !== undefined && typeof value.lastError !== 'string')) {
    throw new Error('MEMORY_EMBEDDING_REPAIR_JOB_INVALID');
  }
  return {
    id: value.id,
    fingerprint: value.fingerprint.toLowerCase(),
    embedderKey: value.embedderKey,
    status: value.status,
    attempts: Number(value.attempts),
    nextAttemptAt: value.nextAttemptAt,
    lastError: value.lastError?.slice(0, 120) ?? null,
    updatedAt: new Date(value.updatedAt).toISOString(),
  };
}

export class EmbeddingRepairStateStore {
  private readonly filePath: string;
  private issue: string | null = null;

  constructor(paths: MemoryPaths) {
    this.filePath = path.join(paths.state, 'embedding-repair.json');
  }

  getIssue(): string | null {
    return this.issue;
  }

  async load(): Promise<EmbeddingRepairState> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<EmbeddingRepairState>;
      if (raw.version !== VERSION || !Array.isArray(raw.jobs)) throw new Error('MEMORY_EMBEDDING_REPAIR_STATE_INVALID');
      if (raw.jobs.length > MAX_JOBS) throw new Error('MEMORY_EMBEDDING_REPAIR_CAPACITY_EXCEEDED');
      const jobs = raw.jobs.map(validateJob);
      if (new Set(jobs.map(job => job.id)).size !== jobs.length) throw new Error('MEMORY_EMBEDDING_REPAIR_JOB_INVALID');
      this.issue = null;
      return { version: VERSION, jobs };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.issue = null;
        return { version: VERSION, jobs: [] };
      }
      this.issue = `Memory embedding repair state degraded: ${error instanceof Error ? error.message : String(error)}`;
      throw new Error('MEMORY_EMBEDDING_REPAIR_STATE_DEGRADED');
    }
  }

  private async save(state: EmbeddingRepairState): Promise<void> {
    if (state.jobs.length > MAX_JOBS) throw new Error('MEMORY_EMBEDDING_REPAIR_CAPACITY_EXCEEDED');
    const jobs = state.jobs.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    await writeOwnedFileAtomic(
      this.filePath,
      JSON.stringify({ version: VERSION, jobs }, null, 2) + '\n',
      { mode: 0o600 },
    );
    this.issue = null;
  }

  async reconcile(
    current: Array<{ id: string; fingerprint: string }>,
    identity: MemoryEmbedderIdentity,
  ): Promise<void> {
    const state = await this.load();
    const expected = new Map(current.map(item => [item.id, item.fingerprint.toLowerCase()]));
    const key = embedderKey(identity);
    const jobs = state.jobs.filter(job =>
      job.embedderKey === key && expected.get(job.id) === job.fingerprint);
    if (jobs.length !== state.jobs.length) await this.save({ version: VERSION, jobs });
  }

  async due(
    entries: Array<{ id: string; fingerprint: string }>,
    identity: MemoryEmbedderIdentity,
    options: { force?: boolean; now?: number } = {},
  ): Promise<Array<{ id: string; fingerprint: string }>> {
    const state = await this.load();
    const byId = new Map(state.jobs.map(job => [job.id, job]));
    const key = embedderKey(identity);
    const now = options.now ?? Date.now();
    const output: Array<{ id: string; fingerprint: string }> = [];
    let changed = false;

    for (const entry of entries) {
      const fingerprint = entry.fingerprint.toLowerCase();
      let job = byId.get(entry.id);
      if (job && (job.fingerprint !== fingerprint || job.embedderKey !== key)) {
        state.jobs = state.jobs.filter(item => item.id !== entry.id);
        byId.delete(entry.id);
        job = undefined;
        changed = true;
      }
      if (!job) {
        // Reserve bounded retry ownership before dispatch; overflow remains degraded,
        // rather than evicting failures and retrying them forever as fresh jobs.
        if (state.jobs.length >= MAX_JOBS) continue;
        job = { id: entry.id, fingerprint, embedderKey: key, status: 'pending', attempts: 0,
          nextAttemptAt: now, lastError: null, updatedAt: new Date(now).toISOString() };
        state.jobs.push(job); byId.set(entry.id, job); changed = true;
        output.push({ id: entry.id, fingerprint });
        continue;
      }
      if (options.force) {
        output.push({ id: entry.id, fingerprint });
        continue;
      }
      if (job.status === 'pending' && job.nextAttemptAt <= now) {
        output.push({ id: entry.id, fingerprint });
      }
    }
    if (changed) await this.save(state);
    return output;
  }

  async markFailure(
    entries: Array<{ id: string; fingerprint: string }>,
    identity: MemoryEmbedderIdentity,
    error: unknown,
    options: { force?: boolean; now?: number } = {},
  ): Promise<void> {
    const state = await this.load();
    const byId = new Map(state.jobs.map(job => [job.id, job]));
    const key = embedderKey(identity);
    const now = options.now ?? Date.now();
    const category = safeErrorCategory(error);
    const providerRetryAt = retryAtFromError(error);

    for (const entry of entries) {
      const fingerprint = entry.fingerprint.toLowerCase();
      const existing = byId.get(entry.id);
      if (!existing && byId.size >= MAX_JOBS) continue;
      const baseAttempts = options.force && existing?.status === 'failed'
        ? 0
        : existing?.attempts ?? 0;
      const attempts = baseAttempts + 1;
      const terminal = attempts >= MAX_ATTEMPTS;
      const nextAttemptAt = terminal
        ? Number.MAX_SAFE_INTEGER
        : Math.max(now + backoff(attempts), providerRetryAt ?? 0);
      const job: EmbeddingRepairJob = {
        id: entry.id,
        fingerprint,
        embedderKey: key,
        status: terminal ? 'failed' : 'pending',
        attempts,
        nextAttemptAt,
        lastError: category,
        updatedAt: new Date(now).toISOString(),
      };
      byId.set(entry.id, job);
    }
    await this.save({ version: VERSION, jobs: [...byId.values()] });
  }

  async markSuccess(
    entries: Array<{ id: string; fingerprint: string }>,
    identity: MemoryEmbedderIdentity,
  ): Promise<void> {
    if (!entries.length) return;
    const state = await this.load();
    const key = embedderKey(identity);
    const completed = new Set(entries.map(entry => `${entry.id}\u0000${entry.fingerprint.toLowerCase()}`));
    const jobs = state.jobs.filter(job =>
      job.embedderKey !== key || !completed.has(`${job.id}\u0000${job.fingerprint}`));
    if (jobs.length !== state.jobs.length) await this.save({ version: VERSION, jobs });
  }

  async summary(identity?: MemoryEmbedderIdentity): Promise<{
    pending: number;
    failed: number;
    issue?: string;
  }> {
    try {
      const state = await this.load();
      const key = identity ? embedderKey(identity) : null;
      const jobs = key ? state.jobs.filter(job => job.embedderKey === key) : state.jobs;
      return {
        pending: jobs.filter(job => job.status === 'pending').length,
        failed: jobs.filter(job => job.status === 'failed').length,
      };
    } catch {
      return { pending: 0, failed: 0, ...(this.issue ? { issue: this.issue } : {}) };
    }
  }
}
