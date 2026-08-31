import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyExecutionRecoveryBundle } from './backup.js';
import { ExecutionRuntimeLease } from './runtime-lease.js';

const FORMAT = 'agent-core-execution-retention-plan' as const;
const VERSION = 1 as const;
const TERMINAL_STATES = new Set(['succeeded', 'failed', 'interrupted', 'cancelled']);

export interface ExecutionRetentionCandidate {
  path: string;
  size: number;
  mtimeMs: number;
  resultMarkerPath: string;
  resultMarkerSha256: string;
}

export interface ExecutionRetentionPlan {
  format: typeof FORMAT;
  version: typeof VERSION;
  planId: string;
  createdAt: string;
  dryRun: true;
  logRoot: string;
  olderThanMs: number;
  cutoffAt: string;
  totalBytes: number;
  candidates: ExecutionRetentionCandidate[];
}

export class ExecutionRetentionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ExecutionRetentionError';
  }
}

function fail(code: string, message: string): never {
  throw new ExecutionRetentionError(code, message);
}

function portableRelative(value: string): string {
  return value.split(path.sep).join('/');
}

function safeRelative(value: string): string {
  if (!value || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value)) {
    fail('EXECUTION_RETENTION_PLAN_INVALID', 'Retention plan contains an unsafe path');
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '..' || normalized.startsWith('../')) {
    fail('EXECUTION_RETENTION_PLAN_INVALID', 'Retention plan contains an unsafe path');
  }
  return normalized;
}

function localPath(root: string, relative: string): string {
  return path.join(root, ...safeRelative(relative).split('/'));
}

async function exists(target: string): Promise<boolean> {
  try { await stat(target); return true; } catch { return false; }
}

async function sha256File(target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(target);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

async function resultMarkerPaths(logRoot: string): Promise<string[]> {
  if (!await exists(logRoot)) return [];
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() && entry.name.endsWith('.result.json')) results.push(target);
    }
  }
  await walk(logRoot);
  return results.sort((left, right) => left.localeCompare(right));
}

function planBody(plan: Omit<ExecutionRetentionPlan, 'planId'>): string {
  return JSON.stringify(plan);
}

function planId(body: Omit<ExecutionRetentionPlan, 'planId'>): string {
  return createHash('sha256').update(planBody(body)).digest('hex');
}

async function candidateForRaw(
  logRoot: string,
  rawPath: string,
  markerPath: string,
  markerSha256: string,
): Promise<ExecutionRetentionCandidate | null> {
  try {
    const info = await stat(rawPath);
    if (!info.isFile()) return null;
    return {
      path: portableRelative(path.relative(logRoot, rawPath)),
      size: info.size,
      mtimeMs: info.mtimeMs,
      resultMarkerPath: portableRelative(path.relative(logRoot, markerPath)),
      resultMarkerSha256: markerSha256,
    };
  } catch {
    return null;
  }
}

export async function planExecutionRetention(options: {
  logRoot: string;
  planRoot: string;
  olderThanMs: number;
  now?: number;
}): Promise<{ planPath: string; plan: ExecutionRetentionPlan }> {
  if (!Number.isSafeInteger(options.olderThanMs) || options.olderThanMs < 0) {
    fail('EXECUTION_RETENTION_AGE_INVALID', 'olderThanMs must be a non-negative integer');
  }
  const logRoot = path.resolve(options.logRoot);
  const planRoot = path.resolve(options.planRoot);
  const cutoffMs = (options.now ?? Date.now()) - options.olderThanMs;
  const candidates: ExecutionRetentionCandidate[] = [];

  for (const markerPath of await resultMarkerPaths(logRoot)) {
    let marker: Record<string, unknown>;
    try {
      marker = JSON.parse(await readFile(markerPath, 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    const state = typeof marker.state === 'string' ? marker.state : '';
    const finishedAt = Number(marker.finishedAt);
    if (!TERMINAL_STATES.has(state) || !Number.isFinite(finishedAt) || finishedAt > cutoffMs) continue;
    const markerHash = await sha256File(markerPath);
    const prefix = markerPath.slice(0, -'.result.json'.length);
    for (const suffix of ['.stdout.log', '.stderr.log']) {
      const candidate = await candidateForRaw(logRoot, `${prefix}${suffix}`, markerPath, markerHash);
      if (candidate) candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => left.path.localeCompare(right.path));
  const body: Omit<ExecutionRetentionPlan, 'planId'> = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    dryRun: true,
    logRoot,
    olderThanMs: options.olderThanMs,
    cutoffAt: new Date(cutoffMs).toISOString(),
    totalBytes: candidates.reduce((sum, candidate) => sum + candidate.size, 0),
    candidates,
  };
  const plan: ExecutionRetentionPlan = { ...body, planId: planId(body) };
  await mkdir(planRoot, { recursive: true });
  const planPath = path.join(planRoot, `execution-retention-${plan.createdAt.replace(/[:.]/g, '-')}-${plan.planId.slice(0, 12)}.json`);
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { planPath, plan };
}

function validCandidate(value: unknown): value is ExecutionRetentionCandidate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ExecutionRetentionCandidate>;
  return typeof candidate.path === 'string'
    && typeof candidate.size === 'number' && Number.isSafeInteger(candidate.size) && candidate.size >= 0
    && typeof candidate.mtimeMs === 'number' && Number.isFinite(candidate.mtimeMs)
    && typeof candidate.resultMarkerPath === 'string'
    && typeof candidate.resultMarkerSha256 === 'string' && /^[a-f0-9]{64}$/.test(candidate.resultMarkerSha256);
}

async function readRetentionPlan(planPath: string): Promise<ExecutionRetentionPlan> {
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(planPath, 'utf8')) as unknown; }
  catch (error) { fail('EXECUTION_RETENTION_PLAN_INVALID', `Retention plan could not be read: ${error instanceof Error ? error.message : String(error)}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('EXECUTION_RETENTION_PLAN_INVALID', 'Retention plan is invalid');
  const plan = parsed as Partial<ExecutionRetentionPlan>;
  if (plan.format !== FORMAT || plan.version !== VERSION || plan.dryRun !== true
    || typeof plan.planId !== 'string' || !/^[a-f0-9]{64}$/.test(plan.planId)
    || typeof plan.createdAt !== 'string' || !Number.isFinite(Date.parse(plan.createdAt))
    || typeof plan.logRoot !== 'string' || !path.isAbsolute(plan.logRoot)
    || !Number.isSafeInteger(plan.olderThanMs) || Number(plan.olderThanMs) < 0
    || typeof plan.cutoffAt !== 'string' || !Number.isFinite(Date.parse(plan.cutoffAt))
    || !Number.isSafeInteger(plan.totalBytes) || Number(plan.totalBytes) < 0
    || !Array.isArray(plan.candidates) || !plan.candidates.every(validCandidate)) {
    fail('EXECUTION_RETENTION_PLAN_INVALID', 'Retention plan shape is invalid');
  }
  const typed = plan as ExecutionRetentionPlan;
  for (const candidate of typed.candidates) {
    safeRelative(candidate.path);
    safeRelative(candidate.resultMarkerPath);
    if (!candidate.path.endsWith('.stdout.log') && !candidate.path.endsWith('.stderr.log')) {
      fail('EXECUTION_RETENTION_PLAN_INVALID', 'Retention plan may contain only raw stdout/stderr logs');
    }
    if (!candidate.resultMarkerPath.endsWith('.result.json')) fail('EXECUTION_RETENTION_PLAN_INVALID', 'Retention candidate result marker path is invalid');
  }
  if (new Set(typed.candidates.map((item) => item.path)).size !== typed.candidates.length) {
    fail('EXECUTION_RETENTION_PLAN_INVALID', 'Retention plan contains duplicate candidates');
  }
  const { planId: storedId, ...body } = typed;
  if (planId(body) !== storedId) fail('EXECUTION_RETENTION_PLAN_TAMPERED', 'Retention plan hash does not match its contents');
  if (typed.totalBytes !== typed.candidates.reduce((sum, item) => sum + item.size, 0)) {
    fail('EXECUTION_RETENTION_PLAN_INVALID', 'Retention plan byte total is invalid');
  }
  return typed;
}

async function appendAudit(auditPath: string, record: Record<string, unknown>): Promise<void> {
  await mkdir(path.dirname(auditPath), { recursive: true });
  await appendFile(auditPath, `${JSON.stringify(record)}\n`, 'utf8');
}

export async function applyExecutionRetention(options: {
  planPath: string;
  bundlePath: string;
  dbPath: string;
  logRoot: string;
}): Promise<{
  planId: string;
  deleted: Array<{ path: string; bytes: number }>;
  skipped: Array<{ path: string; reason: string }>;
  bytesDeleted: number;
  auditPath: string;
}> {
  const plan = await readRetentionPlan(path.resolve(options.planPath));
  const logRoot = path.resolve(options.logRoot);
  if (path.resolve(plan.logRoot) !== logRoot) fail('EXECUTION_RETENTION_ROOT_MISMATCH', 'Retention plan belongs to a different execution log root');
  const verified = await verifyExecutionRecoveryBundle(options.bundlePath);
  if (Date.parse(verified.manifest.createdAt) < Date.parse(plan.createdAt)) {
    fail('EXECUTION_RETENTION_BACKUP_TOO_OLD', 'Recovery bundle must be created after the retention plan');
  }

  const lease = await ExecutionRuntimeLease.acquire(options.dbPath);
  const auditPath = path.join(path.dirname(path.resolve(options.planPath)), 'execution-retention-audit.jsonl');
  const deleted: Array<{ path: string; bytes: number }> = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  try {
    for (const candidate of plan.candidates) {
      const rawPath = localPath(logRoot, candidate.path);
      const markerPath = localPath(logRoot, candidate.resultMarkerPath);
      let reason: string | null = null;
      let current: Awaited<ReturnType<typeof stat>> | null = null;
      try { current = await stat(rawPath); } catch { reason = 'candidate_missing'; }
      if (!reason && (!current?.isFile() || current.size !== candidate.size || current.mtimeMs !== candidate.mtimeMs)) reason = 'candidate_changed';
      if (!reason) {
        try {
          const markerInfo = await stat(markerPath);
          if (!markerInfo.isFile() || await sha256File(markerPath) !== candidate.resultMarkerSha256) reason = 'result_marker_changed';
        } catch {
          reason = 'result_marker_missing';
        }
      }

      if (reason) {
        skipped.push({ path: candidate.path, reason });
        await appendAudit(auditPath, {
          timestamp: new Date().toISOString(), planId: plan.planId, path: candidate.path, action: 'skipped', reason,
        });
        continue;
      }

      await rm(rawPath, { force: true });
      deleted.push({ path: candidate.path, bytes: candidate.size });
      await appendAudit(auditPath, {
        timestamp: new Date().toISOString(), planId: plan.planId, path: candidate.path, action: 'deleted', bytes: candidate.size,
      });
    }
  } finally {
    await lease.release().catch(() => undefined);
  }
  return {
    planId: plan.planId,
    deleted,
    skipped,
    bytesDeleted: deleted.reduce((sum, item) => sum + item.bytes, 0),
    auditPath,
  };
}
