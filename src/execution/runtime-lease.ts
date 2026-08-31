import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

interface ExecutionRuntimeLeaseRecord {
  pid: number;
  token: string;
  startedAt: number;
}

export class ExecutionRuntimeLeaseError extends Error {
  constructor(public readonly code: 'EXECUTION_RUNTIME_ACTIVE' | 'EXECUTION_RUNTIME_LEASE_INVALID', message: string) {
    super(message);
    this.name = 'ExecutionRuntimeLeaseError';
  }
}

export function executionRuntimeLeasePath(dbPath: string): string {
  return `${path.resolve(dbPath)}.runtime.json`;
}

function validRecord(value: unknown): value is ExecutionRuntimeLeaseRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Number.isSafeInteger(record.pid) && Number(record.pid) > 0
    && typeof record.token === 'string' && record.token.length >= 8
    && typeof record.startedAt === 'number' && Number.isFinite(record.startedAt) && record.startedAt >= 0;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readRecord(leasePath: string): Promise<ExecutionRuntimeLeaseRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(leasePath, 'utf8')) as unknown;
    if (!validRecord(parsed)) throw new ExecutionRuntimeLeaseError('EXECUTION_RUNTIME_LEASE_INVALID', 'Execution runtime lease is malformed');
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function removeStaleLease(leasePath: string, record: ExecutionRuntimeLeaseRecord): Promise<void> {
  const latest = await readRecord(leasePath);
  if (!latest) return;
  if (latest.pid !== record.pid || latest.token !== record.token || latest.startedAt !== record.startedAt) return;
  await rm(leasePath, { force: true });
}

export class ExecutionRuntimeLease {
  private released = false;

  private constructor(
    readonly dbPath: string,
    readonly leasePath: string,
    readonly token: string,
  ) {}

  static async acquire(dbPath: string): Promise<ExecutionRuntimeLease> {
    const resolvedDbPath = path.resolve(dbPath);
    const leasePath = executionRuntimeLeasePath(resolvedDbPath);
    await mkdir(path.dirname(leasePath), { recursive: true });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = randomUUID();
      const record: ExecutionRuntimeLeaseRecord = { pid: process.pid, token, startedAt: Date.now() };
      try {
        const handle = await open(leasePath, 'wx');
        try {
          await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        return new ExecutionRuntimeLease(resolvedDbPath, leasePath, token);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const current = await readRecord(leasePath);
        if (!current) continue;
        if (pidAlive(current.pid)) {
          throw new ExecutionRuntimeLeaseError(
            'EXECUTION_RUNTIME_ACTIVE',
            `Execution runtime is active for ${resolvedDbPath}`,
          );
        }
        await removeStaleLease(leasePath, current);
      }
    }
    throw new ExecutionRuntimeLeaseError('EXECUTION_RUNTIME_ACTIVE', `Execution runtime lease could not be acquired for ${resolvedDbPath}`);
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    const current = await readRecord(this.leasePath).catch(() => null);
    if (!current || current.token !== this.token || current.pid !== process.pid) return;
    await rm(this.leasePath, { force: true });
  }
}

export async function assertExecutionRuntimeStopped(dbPath: string): Promise<void> {
  const leasePath = executionRuntimeLeasePath(dbPath);
  const current = await readRecord(leasePath);
  if (!current) return;
  if (pidAlive(current.pid)) {
    throw new ExecutionRuntimeLeaseError('EXECUTION_RUNTIME_ACTIVE', `Execution runtime is active for ${path.resolve(dbPath)}`);
  }
  await removeStaleLease(leasePath, current);
}
