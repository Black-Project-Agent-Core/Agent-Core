import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { CONFIG_DIR } from './config.js';

export type ProcessLedgerStatus =
  | 'pending' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';

export interface ProcessIdentity {
  image: string;
  created: string;
}

export interface ProcessLedgerRecord {
  id: string;
  pid: number | null;
  status: ProcessLedgerStatus;
  commandDigest: string;
  shell: string;
  cwd: string;
  expectedExecutable: string;
  identity: ProcessIdentity | null;
  createdAt: string;
  updatedAt: string;
  exitCode: number | null;
  error: string | null;
}

interface ProcessLedgerState {
  version: 1;
  records: ProcessLedgerRecord[];
}

const ACTIVE = new Set<ProcessLedgerStatus>(['pending', 'running', 'cancelling']);
const TERMINAL = new Set<ProcessLedgerStatus>(['completed', 'failed', 'cancelled']);
const MAX_RECORDS = 512;
const TERMINAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const processCommandDigest = (command: string): string =>
  'sha256:' + createHash('sha256').update(command).digest('hex');

function normalizeImage(value: string): string {
  const base = path.basename((value || '').trim());
  return process.platform === 'win32' ? base.toLowerCase() : base;
}

export function queryProcessIdentitySync(pid: number): ProcessIdentity | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === 'win32') {
      const script = [
        '$p=Get-CimInstance Win32_Process -Filter "ProcessId=' + pid + '" -ErrorAction Stop;',
        'if($null -eq $p){exit 3};',
        '$o=[ordered]@{image=$p.Name;created=$p.CreationDate};',
        '$o|ConvertTo-Json -Compress',
      ].join(' ');
      const raw = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8', timeout: 5000, windowsHide: true,
      }).trim();
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { image?: string; created?: string };
      if (!parsed.image || !parsed.created) return null;
      return { image: normalizeImage(parsed.image), created: String(parsed.created) };
    }
    const raw = execFileSync('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'comm='], {
      encoding: 'utf8', timeout: 5000,
    }).trim();
    const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return null;
    const line = lines[0];
    const match = line.match(/^(.{24})\s+(.+)$/);
    if (!match) return null;
    return { image: normalizeImage(match[2]), created: match[1].trim() };
  } catch {
    return null;
  }
}

function sameIdentity(expected: ProcessIdentity | null, actual: ProcessIdentity | null, executable: string): boolean {
  if (!expected || !actual) return false;
  const expectedImage = normalizeImage(expected.image || executable);
  return expectedImage === normalizeImage(actual.image) && expected.created === actual.created;
}

export class ProcessLedger {
  private state: ProcessLedgerState;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly mutationChains = new Map<string, Promise<void>>();

  constructor(
    private readonly filePath = path.join(CONFIG_DIR, 'process-ledger.json'),
    private readonly identityProbe: (pid: number) => ProcessIdentity | null = queryProcessIdentitySync,
  ) {
    this.state = this.load();
  }

  private load(): ProcessLedgerState {
    if (!existsSync(this.filePath)) return { version: 1, records: [] };
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as ProcessLedgerState;
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error('PROCESS_LEDGER_INVALID');
      return parsed;
    } catch {
      return { version: 1, records: [] };
    }
  }

  private persist(): Promise<void> {
    this.prune();
    const data = JSON.stringify(this.state, null, 2);
    this.writeChain = this.writeChain.then(() => writeOwnedFileAtomic(this.filePath, data));
    return this.writeChain;
  }

  private async serialize(key: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.mutationChains.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.mutationChains.set(key, next);
    try {
      await next;
    } finally {
      if (this.mutationChains.get(key) === next) this.mutationChains.delete(key);
    }
  }

  private prune(): void {
    const cutoff = Date.now() - TERMINAL_TTL_MS;
    const keep = this.state.records.filter(record =>
      ACTIVE.has(record.status) || Date.parse(record.updatedAt) >= cutoff,
    );
    keep.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    this.state.records = keep.slice(0, MAX_RECORDS);
  }

  async createPending(command: string, shell: string, cwd: string): Promise<string> {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.state.records.push({
      id, pid: null, status: 'pending', commandDigest: processCommandDigest(command),
      shell, cwd: path.resolve(cwd), expectedExecutable: '', identity: null,
      createdAt: now, updatedAt: now, exitCode: null, error: null,
    });
    await this.persist();
    return id;
  }

  async attachRunning(id: string, pid: number, expectedExecutable: string): Promise<void> {
    await this.serialize('record:' + id, async () => {
      const record = this.state.records.find(item => item.id === id);
      if (!record || record.status !== 'pending') throw new Error('PROCESS_LEDGER_PENDING_RECORD_REQUIRED');
      record.pid = pid;
      record.status = 'running';
      record.expectedExecutable = normalizeImage(expectedExecutable);
      record.identity = this.identityProbe(pid);
      record.updatedAt = new Date().toISOString();
      await this.persist();
    });
  }

  async failPending(id: string, error: string): Promise<void> {
    await this.serialize('record:' + id, async () => {
      const record = this.state.records.find(item => item.id === id);
      if (!record || TERMINAL.has(record.status)) return;
      record.status = 'failed';
      record.error = error.slice(0, 500);
      record.updatedAt = new Date().toISOString();
      await this.persist();
    });
  }

  async markCancelling(pid: number): Promise<void> {
    await this.serialize('pid:' + pid, async () => {
      const record = this.findByPid(pid);
      if (!record || record.status !== 'running') return;
      record.status = 'cancelling';
      record.updatedAt = new Date().toISOString();
      await this.persist();
    });
  }

  async finalizeExit(pid: number, exitCode: number | null, error: string | null = null): Promise<void> {
    await this.serialize('pid:' + pid, async () => {
      const record = this.findByPid(pid);
      if (!record || TERMINAL.has(record.status)) return;
      record.status = record.status === 'cancelling' ? 'cancelled' : exitCode === 0 && !error ? 'completed' : 'failed';
      record.exitCode = exitCode;
      record.error = error ? error.slice(0, 500) : null;
      record.updatedAt = new Date().toISOString();
      await this.persist();
    });
  }

  private findByPid(pid: number): ProcessLedgerRecord | undefined {
    return [...this.state.records].reverse().find(item => item.pid === pid && ACTIVE.has(item.status));
  }

  validateLive(record: ProcessLedgerRecord): boolean {
    if (record.pid === null || !record.identity) return false;
    return sameIdentity(record.identity, this.identityProbe(record.pid), record.expectedExecutable);
  }

  recoverDetached(): ProcessLedgerRecord[] {
    const detached: ProcessLedgerRecord[] = [];
    let changed = false;
    for (const record of this.state.records) {
      if (record.status !== 'running' && record.status !== 'cancelling') continue;
      if (this.validateLive(record)) {
        detached.push({ ...record });
      } else {
        record.status = 'failed';
        record.error = 'process-identity-unavailable-or-changed';
        record.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) void this.persist().catch(() => undefined);
    return detached;
  }

  async cancelDetached(pid: number): Promise<boolean> {
    const record = this.findByPid(pid);
    if (!record || !this.validateLive(record)) return false;
    await this.markCancelling(pid);
    try {
      process.kill(pid);
      await this.finalizeExit(pid, null);
      return true;
    } catch (error) {
      await this.finalizeExit(pid, null, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  snapshot(): ProcessLedgerRecord[] {
    return this.state.records.map(record => ({ ...record, identity: record.identity ? { ...record.identity } : null }));
  }
}

export const processLedger = new ProcessLedger();
