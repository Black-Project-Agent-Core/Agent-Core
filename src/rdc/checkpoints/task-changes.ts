import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readOnlyGit, readOnlyGitEnv } from '../../process/readonly-git.js';
import { decideToolEvidenceCapture } from '../../security/evidence-capture-policy.js';
import { isSensitiveKey, redactSensitiveString } from '../../security/redaction.js';
import { isCredentialFileName } from '../../security/credential-names.js';
import { authorizedExistingPath, comparable, inside, isProtectedPath } from '../../semantic-ide/path-safety.js';
import type { AutomaticCheckpointRecord, FileCheckpointService, FileCheckpointSnapshot } from './service.js';

/**
 * Read-only "actual changes" view for one task. It compares the live filesystem with the
 * pre-mutation snapshots that automatic checkpoints already hold, and lists everything else
 * Git reports as unattributed. It never stages, commits, restores, checks out or writes.
 */
const execFileAsync = promisify(execFile);

export const TASK_CHANGES_LIMITS = Object.freeze({
  appliedFiles: 200, diffFiles: 40, diffInputBytes: 512 * 1024, diffOutputBytes: 24 * 1024, diffOutputLines: 600,
  hashBytes: 16 * 1024 * 1024, externalFiles: 300, externalScan: 2000, gitBufferBytes: 4 * 1024 * 1024, gitMilliseconds: 8_000, totalMilliseconds: 20_000,
});
const LIMITS = TASK_CHANGES_LIMITS;

export type DiffState = 'text' | 'truncated' | 'none' | 'binary' | 'too-large' | 'sensitive-not-shown' | 'budget' | 'unavailable';
export type ChangeState = 'added' | 'modified' | 'deleted' | 'renamed' | 'unverified';
export interface AppliedChange {
  path: string;
  oldPath?: string;
  state: ChangeState;
  /** Baseline is exact (this task's first checkpoint of the file); the writer of later edits is not proven. */
  attribution: 'checkpoint-baseline';
  checkpointIds: string[];
  invocationIds: string[];
  /** Other tasks (or untasked captures) that checkpointed this path after this task first did. */
  otherCheckpointTasks: string[];
  before: { exists: boolean; size: number };
  after: { exists: boolean; size: number | null };
  diff: { state: DiffState; text?: string; additions?: number | null; deletions?: number | null; reason?: string };
}
export interface ExternalChange {
  path: string;
  oldPath?: string;
  state: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted' | 'other';
  binary: boolean | null;
  additions: number | null;
  deletions: number | null;
  /** Hint only: file mtime is not ownership. */
  modifiedAfterTaskStart: boolean | null;
  attribution: 'unattributed';
}
export interface RequestRecord {
  checkpointId: string;
  invocationId: string;
  at: string;
  /** "differs": the file differs from its pre-request state at the next recorded point. Not proof of cause. */
  paths: Array<{ path: string; afterwards: 'differs' | 'same' | 'unknown' }>;
}
export interface TaskChanges {
  taskId: string;
  generatedAt: string;
  checkpointCount: number;
  requests: RequestRecord[];
  applied: { items: AppliedChange[]; unchanged: number; truncated: boolean };
  external: { state: 'ok' | 'unavailable'; reason?: string; items: ExternalChange[]; total: number; truncated: boolean };
}

type Current = { exists: false } | { exists: true; size: number } | { error: string };
interface Entry { rel: string; abs: string; key: string; at: string; record: AutomaticCheckpointRecord; snapshot: FileCheckpointSnapshot }

const rel = (root: string, file: string) => path.relative(root, file).split(path.sep).join('/');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Same eligibility the checkpoint service applies at capture; content is withheld otherwise. */
function contentEligible(root: string, file: string): boolean {
  const parts = path.relative(root, file).split(/[\\/]+/);
  if (parts.some(part => isSensitiveKey(part) || isCredentialFileName(part)) || isProtectedPath(file)) return false;
  return decideToolEvidenceCapture('file_checkpoint', { paths: [file] }).disposition === 'full';
}

async function readCurrent(root: string, file: string): Promise<Current> {
  try {
    if (!inside(file, root) || isProtectedPath(file)) return { error: 'outside-workspace' };
    const stats = await lstat(file).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; });
    if (!stats) return { exists: false };
    if (stats.isSymbolicLink() || !stats.isFile()) return { error: 'not-a-regular-file' };
    const real = (await authorizedExistingPath(root, file)).realPath;
    if (comparable(real) !== comparable(file)) return { error: 'path-changed' };
    return { exists: true, size: stats.size };
  } catch { return { error: 'unreadable' }; }
}

async function hashFile(file: string): Promise<string | null> {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.size > LIMITS.hashBytes) return null;
    return sha256(await readFile(file));
  } catch { return null; }
}

/** Every git call here shares the task deadline; once it is spent the external listing is reported as unavailable, not run late. */
async function git(cwd: string, args: string[], deadline: number): Promise<string> {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error('TASK_CHANGES_TIME_BUDGET');
  return readOnlyGit(cwd, args, { timeoutMs: Math.min(LIMITS.gitMilliseconds, Math.max(500, Math.floor(remaining))), maxBuffer: LIMITS.gitBufferBytes });
}

/** Fixed argv, no shell. `--no-index` exits 1 when the files differ; that is the normal result. */
async function gitDiffNoIndex(cwd: string, before: string, after: string): Promise<{ text: string; overflow: boolean } | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-c', 'core.quotepath=false', '-c', 'core.autocrlf=false', 'diff', '--no-index',
      '--no-color', '--no-ext-diff', '--no-textconv', '-U3', '--', before, after], {
      cwd, windowsHide: true, timeout: LIMITS.gitMilliseconds, maxBuffer: LIMITS.diffOutputBytes * 4, encoding: 'utf8',
      env: readOnlyGitEnv(),
    });
    return { text: String(stdout ?? ''), overflow: false };
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: unknown };
    if (failure.code === 1 && typeof failure.stdout === 'string') return { text: failure.stdout, overflow: false };
    if (failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return { text: String(failure.stdout ?? ''), overflow: true };
    return null;
  }
}

function shapeDiff(raw: { text: string; overflow: boolean }): AppliedChange['diff'] {
  const lines = raw.text.split('\n');
  const first = lines.findIndex(line => line.startsWith('@@'));
  if (first < 0) return /^Binary files /m.test(raw.text) ? { state: 'binary' } : { state: 'unavailable', reason: 'no-hunks' };
  const body = lines.slice(first);
  if (body.at(-1) === '') body.pop();
  if (redactSensitiveString(body.join('\n')) !== body.join('\n')) return { state: 'sensitive-not-shown' };
  let kept = body.slice(0, LIMITS.diffOutputLines), text = kept.join('\n');
  if (Buffer.byteLength(text) > LIMITS.diffOutputBytes) {
    text = Buffer.from(text).subarray(0, LIMITS.diffOutputBytes).toString('utf8').replace(/\n[^\n]*$/, '');
    kept = text.split('\n');
  }
  const truncated = raw.overflow || kept.length < body.length;
  const count = (mark: string) => kept.filter(line => line.startsWith(mark)).length;
  return { state: truncated ? 'truncated' : 'text', text,
    additions: truncated ? null : count('+'), deletions: truncated ? null : count('-') };
}

interface Work { change: AppliedChange; abs: string; baseline: FileCheckpointSnapshot; sha: string | null }

async function appliedChanges(service: FileCheckpointService, root: string, mine: Entry[], later: Map<string, Entry[]>,
  deadline: number): Promise<{ items: AppliedChange[]; unchanged: number; truncated: boolean; claimed: Set<string> }> {
  const first = new Map<string, Entry>(), all = new Map<string, Entry[]>();
  for (const entry of mine) { if (!first.has(entry.key)) first.set(entry.key, entry); all.set(entry.key, [...all.get(entry.key) ?? [], entry]); }
  const work: Work[] = [];
  let unchanged = 0;
  for (const [key, origin] of first) {
    const baseline = origin.snapshot, now = await readCurrent(root, origin.abs);
    const others = [...new Set((later.get(key) ?? []).filter(entry => entry.at >= origin.at && entry.record.taskId !== origin.record.taskId)
      .map(entry => entry.record.taskId ?? 'untasked'))].slice(0, 5);
    const base = { path: origin.rel, attribution: 'checkpoint-baseline' as const,
      checkpointIds: all.get(key)!.map(entry => entry.record.id), invocationIds: [...new Set(all.get(key)!.map(entry => entry.record.invocationId))],
      otherCheckpointTasks: others, before: { exists: baseline.exists, size: baseline.size } };
    let state: ChangeState | 'same', sha: string | null = null, reason: string | undefined;
    if ('error' in now) { state = 'unverified'; reason = now.error; }
    else if (!baseline.exists && !now.exists) state = 'same';
    else if (!baseline.exists) state = 'added';
    else if (!now.exists) state = 'deleted';
    else if (baseline.size !== now.size) state = 'modified';
    else {
      sha = await hashFile(origin.abs);
      if (sha === null) { state = 'unverified'; reason = 'same-size-too-large-to-compare'; }
      else state = sha === baseline.sha256 ? 'same' : 'modified';
    }
    if (state === 'same') { unchanged += 1; continue; }
    work.push({ abs: origin.abs, baseline, sha, change: { ...base, state,
      after: { exists: 'exists' in now && now.exists, size: 'size' in now ? now.size : null },
      diff: { state: 'unavailable', ...(reason ? { reason } : {}) } } });
  }
  // Exact-content rename: a deleted baseline and an added file with identical bytes.
  const deleted = work.filter(item => item.change.state === 'deleted'), renamedFrom: string[] = [];
  for (const item of work.filter(entry => entry.change.state === 'added')) {
    if (!deleted.length) break;
    const sha = item.sha ?? await hashFile(item.abs);
    const match = sha ? deleted.findIndex(candidate => candidate.baseline.sha256 === sha) : -1;
    if (match < 0) continue;
    const [from] = deleted.splice(match, 1);
    renamedFrom.push(from.abs);
    work.splice(work.indexOf(from), 1);
    item.change.state = 'renamed'; item.change.oldPath = from.change.path; item.change.diff = { state: 'none' };
    item.change.invocationIds = [...new Set([...item.change.invocationIds, ...from.change.invocationIds])];
    item.change.checkpointIds = [...new Set([...item.change.checkpointIds, ...from.change.checkpointIds])];
  }
  const truncated = work.length > LIMITS.appliedFiles;
  // Everything the task changed is claimed here, listed or not, so it never reappears as external.
  const claimed = new Set([...work.map(item => item.abs), ...renamedFrom].map(comparable));
  const items = work.sort((a, b) => a.change.path.localeCompare(b.change.path)).slice(0, LIMITS.appliedFiles);
  let diffs = 0;
  for (const item of items) {
    const { change, baseline, abs } = item;
    if (change.state === 'unverified' || change.state === 'renamed') continue;
    if (!contentEligible(root, abs)) { change.diff = { state: 'sensitive-not-shown' }; continue; }
    if (diffs >= LIMITS.diffFiles || performance.now() >= deadline) { change.diff = { state: 'budget' }; continue; }
    if (baseline.size > LIMITS.diffInputBytes || (change.after.size ?? 0) > LIMITS.diffInputBytes) { change.diff = { state: 'too-large' }; continue; }
    if (baseline.exists && !(baseline.sha256 && await service.readBlob(baseline.sha256, LIMITS.diffInputBytes))) {
      change.diff = { state: 'unavailable', reason: 'baseline-blob-missing-or-corrupt' }; continue;
    }
    diffs += 1;
    const raw = await gitDiffNoIndex(root, baseline.exists ? service.blobFilePath(baseline.sha256!) : '/dev/null', change.after.exists ? abs : '/dev/null');
    change.diff = raw ? shapeDiff(raw) : { state: 'unavailable', reason: 'git-diff-failed' };
  }
  return { items: items.map(item => item.change), unchanged, truncated, claimed };
}

function parseStatus(raw: string, top: string, root: string) {
  const out: Array<{ path: string; oldPath?: string; state: ExternalChange['state'] }> = [];
  const fields = raw.split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field.length < 4) continue;
    const code = field.slice(0, 2), abs = path.resolve(top, field.slice(3));
    const renamed = /[RC]/.test(code), old = renamed ? fields[++index] : undefined;
    if (!inside(abs, root)) continue;
    out.push({ path: rel(root, abs), ...(old ? { oldPath: rel(root, path.resolve(top, old)) } : {}),
      state: code === '??' ? 'untracked' : /U|^AA$|^DD$/.test(code) ? 'conflicted' : renamed ? 'renamed'
        : code.includes('D') ? 'deleted' : code.includes('A') ? 'added' : code.includes('M') ? 'modified' : 'other' });
  }
  return out;
}

async function externalChanges(root: string, claimed: Set<string>, taskStart: number | null, deadline: number): Promise<TaskChanges['external']> {
  let top: string, raw: string;
  try {
    top = (await git(root, ['rev-parse', '--show-toplevel'], deadline)).trim();
    raw = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all'], deadline);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    const late = error instanceof Error && error.message === 'TASK_CHANGES_TIME_BUDGET';
    return { state: 'unavailable', reason: late ? 'time-budget' : missing ? 'git-not-installed' : 'not-a-git-repository-or-status-failed', items: [], total: 0, truncated: false };
  }
  const stats = new Map<string, { additions: number | null; deletions: number | null; binary: boolean }>();
  try { // Untracked files and repositories without HEAD simply have no line counts.
    const numstat = (await git(root, ['diff', '--numstat', '-z', '--ignore-submodules=all', 'HEAD', '--'], deadline)).split('\0');
    for (let index = 0; index < numstat.length; index += 1) {
      // A file name may itself contain a tab, so split on the first two tabs only.
      const first = numstat[index].indexOf('\t'), second = first < 0 ? -1 : numstat[index].indexOf('\t', first + 1);
      if (second < 0) continue;
      const added = numstat[index].slice(0, first), removed = numstat[index].slice(first + 1, second), name = numstat[index].slice(second + 1);
      const target = name === '' ? numstat[index += 2] : name;
      if (target) stats.set(comparable(path.resolve(top, target)), { binary: added === '-', additions: added === '-' ? null : Number(added), deletions: removed === '-' ? null : Number(removed) });
    }
  } catch { /* line counts stay unknown */ }
  const entries = parseStatus(raw, top, root).filter(entry =>
    !claimed.has(comparable(path.resolve(root, entry.path))) && !(entry.oldPath && claimed.has(comparable(path.resolve(root, entry.oldPath)))));
  // Hints are computed before the cut so the likeliest task-related files survive truncation.
  const hinted = await Promise.all(entries.slice(0, LIMITS.externalScan).map(async (entry): Promise<ExternalChange> => {
    const abs = path.resolve(root, entry.path), stat = stats.get(comparable(abs));
    const mtime = taskStart === null || entry.state === 'deleted' ? null : await lstat(abs).then(info => info.mtimeMs >= taskStart, () => null);
    return { ...entry, binary: stat ? stat.binary : null, additions: stat?.additions ?? null, deletions: stat?.deletions ?? null,
      modifiedAfterTaskStart: mtime, attribution: 'unattributed' };
  }));
  hinted.sort((a, b) => Number(b.modifiedAfterTaskStart === true) - Number(a.modifiedAfterTaskStart === true) || a.path.localeCompare(b.path));
  const listed = hinted.slice(0, LIMITS.externalFiles);
  return { state: 'ok', items: listed, total: entries.length, truncated: entries.length > listed.length };
}

export async function computeTaskChanges(service: FileCheckpointService, taskId: string): Promise<TaskChanges> {
  const deadline = performance.now() + LIMITS.totalMilliseconds;
  const root = await realpath(service.workspaceRoot);
  const records = await service.readAutomaticCheckpoints();
  const byPath = new Map<string, Entry[]>(), mine: Entry[] = [], byRecord = new Map<AutomaticCheckpointRecord, Entry[]>();
  for (const record of records) for (const snapshot of record.captured) {
    const abs = path.resolve(snapshot.path), key = comparable(abs);
    if (!inside(abs, root)) continue;
    const entry: Entry = { rel: rel(root, abs), abs, key, at: record.createdAt, record, snapshot };
    byPath.set(key, [...byPath.get(key) ?? [], entry]);
    if (record.taskId === taskId) { mine.push(entry); byRecord.set(record, [...byRecord.get(record) ?? [], entry]); }
  }
  const requests: RequestRecord[] = [];
  const nowCache = new Map<string, Promise<{ exists: boolean; sha: string | null } | null>>();
  const currentState = (entry: Entry) => {
    if (!nowCache.has(entry.key)) nowCache.set(entry.key, (async () => {
      const now = await readCurrent(root, entry.abs);
      if ('error' in now) return null;
      return now.exists ? { exists: true, sha: await hashFile(entry.abs) } : { exists: false, sha: null };
    })());
    return nowCache.get(entry.key)!;
  };
  for (const [record, entries] of byRecord) {
    const paths: RequestRecord['paths'] = [];
    for (const entry of entries) {
      // The next recorded state of the file is the next checkpoint of any task, else the live file.
      const list = byPath.get(entry.key)!, next = list[list.indexOf(entry) + 1], before = entry.snapshot;
      let afterwards: RequestRecord['paths'][number]['afterwards'] = 'unknown';
      if (next) afterwards = next.snapshot.exists === before.exists && next.snapshot.sha256 === before.sha256 ? 'same' : 'differs';
      else {
        const now = await currentState(entry);
        if (now && (!now.exists || now.sha)) afterwards = now.exists === before.exists && now.sha === before.sha256 ? 'same' : 'differs';
      }
      paths.push({ path: entry.rel, afterwards });
    }
    requests.push({ checkpointId: record.id, invocationId: record.invocationId, at: record.createdAt, paths });
  }
  const applied = await appliedChanges(service, root, mine, byPath, deadline);
  const starts = mine.map(entry => Date.parse(entry.at)).filter(Number.isFinite);
  const external = await externalChanges(root, applied.claimed, starts.length ? Math.min(...starts) : null, deadline);
  const { claimed: _claimed, ...visible } = applied;
  return { taskId, generatedAt: new Date().toISOString(), checkpointCount: byRecord.size, requests, applied: visible, external };
}
