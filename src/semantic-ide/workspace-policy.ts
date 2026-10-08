import { access, lstat, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { inside, isProtectedPath, authorizedExistingPath } from './path-safety.js';
import { readSemanticDigest, semanticFileIdentity, type SemanticFileIdentity } from './source-io.js';

const HARD_IGNORED_DIRS = new Set([
  '.git', '.svn', '.hg', '.bzr',
  '.venv', '.env', '.cache', '.mypy_cache', '.pytest_cache', '.ruff_cache',
  '.tox', '.nox', '.idea', '.vscode', 'node_modules', '.semantic-runtime',
]);

function normalizeExt(value: string): string {
  return value.toLowerCase().startsWith('.') ? value.toLowerCase() : `.${value.toLowerCase()}`;
}

function hardIgnored(relativePath: string, extraIgnored: readonly string[] = []): boolean {
  const extras = new Set(extraIgnored.map(value => value.toLowerCase()));
  for (const segment of relativePath.split(/[\\/]+/)) {
    const lowered = segment.toLowerCase();
    if (HARD_IGNORED_DIRS.has(lowered) || extras.has(lowered)) return true;
  }
  return false;
}

async function runGitCheckIgnoreBatch(root: string, relativePaths: string[]): Promise<Set<string>> {
  if (!relativePaths.length) return new Set();
  return new Promise(resolve => {
    const child = spawn('git', ['-C', root, 'check-ignore', '-z', '--stdin'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (value: Set<string>) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)));
    child.stdin.on('error', () => {
      // Git may close stdin early after an internal/path error. The exit code remains
      // authoritative; swallowing the stream error prevents an unhandled process crash.
    });
    child.once('error', () => finish(new Set()));
    child.once('exit', code => {
      if (code !== 0 && code !== 1) return finish(new Set());
      const output = Buffer.concat(chunks).toString('utf8');
      finish(new Set(output.split('\0').filter(Boolean).map(item => item.replace(/\\/g, '/'))));
    });
    const payload = Buffer.from(
      relativePaths.map(item => item.replace(/\\/g, '/')).join('\0') + '\0',
      'utf8',
    );
    child.stdin.end(payload);
  });
}

async function runGitCheckIgnore(root: string, relativePaths: string[]): Promise<Set<string>> {
  if (!relativePaths.length) return new Set();
  const ignored = new Set<string>();
  const batchSize = 256;
  for (let offset = 0; offset < relativePaths.length; offset += batchSize) {
    const batch = await runGitCheckIgnoreBatch(root, relativePaths.slice(offset, offset + batchSize));
    for (const item of batch) ignored.add(item);
  }
  return ignored;
}

interface GitSourceListing { files: string[]; ioWarning: boolean }

async function runGitListFiles(root: string): Promise<GitSourceListing | null> {
  return new Promise(resolve => {
    const safeRoot = path.resolve(root).replace(/\\/g, '/');
    const child = spawn('git', [
      '-c', `safe.directory=${safeRoot}`,
      '-C', root,
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let total = 0;
    let ioWarning = false;
    child.stderr.on('data', chunk => { if (String(chunk).trim()) ioWarning = true; });
    let settled = false;
    const finish = (value: GitSourceListing | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.stdout.on('data', chunk => {
      const value = Buffer.from(chunk);
      total += value.length;
      if (total > 16 * 1024 * 1024) {
        try { child.kill(); } catch { /* bounded local Git listing */ }
        finish(null);
        return;
      }
      chunks.push(value);
    });
    child.once('error', () => finish(null));
    // Wait for stdout/stderr to drain before judging listing completeness.
    child.once('close', code => {
      if (settled) return;
      if (code !== 0) return finish(null);
      const output = Buffer.concat(chunks).toString('utf8');
      finish({ files: output.split('\0').filter(Boolean), ioWarning });
    });
  });
}

export interface WorkspaceFileStamp {
  mtimeMs: number;
  size: number;
  identity: SemanticFileIdentity;
  digest?: string;
  evidence: 'metadata' | 'digest' | 'unknown';
  cacheable: boolean;
}
export interface WorkspaceSourceFile extends WorkspaceFileStamp {
  absolutePath: string;
  relativePath: string;
}

export interface WorkspaceScanResult {
  files: WorkspaceSourceFile[];
  truncated: boolean;
  complete: boolean;
  ioIssueCount: number;
  issues: Array<{ relativePath: string; code: string }>;
  durationMs: number;
  ignoredCount: number;
}

interface WorkspaceSourceCandidate {
  absolutePath: string;
  relativePath: string;
}

export async function scanWorkspaceSources(
  root: string,
  extensions: readonly string[],
  extraIgnored: readonly string[] = [],
  maxFiles = 4000,
  maxMs = 5000,
  previous?: ReadonlyMap<string, WorkspaceFileStamp>,
): Promise<WorkspaceScanResult> {
  const started = Date.now();
  const deadline = started + maxMs;
  const issues: WorkspaceScanResult['issues'] = [];
  let ioIssueCount = 0;
  const noteIssue = (relativePath: string, error: unknown, rootFailure = false) => {
    const rawCode = (error as NodeJS.ErrnoException | undefined)?.code;
    const code = typeof rawCode === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(rawCode) ? rawCode : 'EUNKNOWN';
    // A vanished leaf is absence; a missing root is not a healthy workspace.
    if (code === 'ENOENT' && !rootFailure) return;
    ioIssueCount += 1;
    if (issues.length < 16) {
      const safePath = !path.isAbsolute(relativePath) && !relativePath.split(/[\\/]+/).includes('..')
        ? relativePath.replace(/\\/g, '/').slice(0, 240) : '.';
      issues.push({ relativePath: safePath || '.', code });
    }
  };
  let realRoot: string;
  try { realRoot = await realpath(root); }
  catch (error) {
    noteIssue('.', error, true);
    return { files: [], complete: false, ioIssueCount, issues, truncated: false,
      durationMs: Date.now() - started, ignoredCount: 0 };
  }
  const extensionSet = new Set(extensions.map(normalizeExt));
  const candidates: WorkspaceSourceCandidate[] = [];
  let truncated = false;
  let ignoredCount = 0;

  const gitListing = await runGitListFiles(root);
  if (gitListing !== null) {
    const gitFiles = gitListing.files;
    // A successful Git exit can still omit unreadable untracked subtrees.
    // Preserve filtered positive evidence, but do not infer absence after a warning.
    if (gitListing.ioWarning) noteIssue('.', { code: 'EGIT_ENUMERATION_WARNING' }, true);
    for (const rawRelative of gitFiles) {
      if (candidates.length >= maxFiles || Date.now() >= deadline) {
        truncated = true;
        break;
      }
      const relative = rawRelative.replace(/\//g, path.sep);
      if (hardIgnored(relative, extraIgnored)) {
        ignoredCount += 1;
        continue;
      }
      if (!extensionSet.has(path.extname(relative).toLowerCase())) continue;
      const absolute = path.join(root, relative);
      if (isProtectedPath(absolute)) {
        ignoredCount += 1;
        continue;
      }
      candidates.push({ absolutePath: absolute, relativePath: relative });
    }
    if (gitFiles.length > candidates.length && candidates.length >= maxFiles) truncated = true;
  } else {
    // Non-Git workspaces retain the bounded filesystem fallback. Regular-file
    // metadata is deferred to the worker pool below.
    const queue = [''];
    while (queue.length && candidates.length < maxFiles && Date.now() < deadline) {
      const relativeDir = queue.shift()!;
      const absoluteDir = path.join(root, relativeDir);
      let entries;
      try { entries = await readdir(absoluteDir, { withFileTypes: true }); }
      catch (error) { noteIssue(relativeDir || '.', error, relativeDir === ''); continue; }

      for (const entry of entries) {
        const relative = path.join(relativeDir, entry.name);
        if (hardIgnored(relative, extraIgnored)) {
          ignoredCount += 1;
          continue;
        }
        const absolute = path.join(root, relative);
        if (isProtectedPath(absolute)) {
          ignoredCount += 1;
          continue;
        }
        if (entry.isDirectory()) {
          queue.push(relative);
          continue;
        }
        if (!(entry.isFile() || entry.isSymbolicLink())
          || !extensionSet.has(path.extname(entry.name).toLowerCase())) continue;
        candidates.push({ absolutePath: absolute, relativePath: relative });
        if (candidates.length >= maxFiles || Date.now() >= deadline) break;
      }
    }
    if (queue.length || candidates.length >= maxFiles || Date.now() >= deadline) truncated = true;
  }

  const results: Array<WorkspaceSourceFile | undefined> = new Array(candidates.length);
  let cursor = 0;
  const workerCount = Math.min(32, Math.max(1, candidates.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= candidates.length) return;
      if (Date.now() >= deadline) {
        truncated = true;
        return;
      }
      const candidate = candidates[index]!;
      try {
        try { await authorizedExistingPath(root, candidate.absolutePath); }
        catch (error) {
          if (error instanceof Error && /SEMANTIC_(?:REALPATH_OUTSIDE_WORKSPACE|PROTECTED_PATH)/.test(error.message)) { ignoredCount += 1; continue; }
          throw error;
        }
        const ownMetadata = await lstat(candidate.absolutePath, { bigint: true });
        let metadata = ownMetadata;
        if (ownMetadata.isSymbolicLink()) {
          const resolved = await realpath(candidate.absolutePath);
          if (!inside(resolved, realRoot) || isProtectedPath(resolved)) {
            ignoredCount += 1;
            continue;
          }
          metadata = await stat(resolved, { bigint: true });
        }
        if (!metadata.isFile()) continue;
        const identity = semanticFileIdentity(metadata);
        const threshold = BigInt(started - 2000) * 1000000n;
        const cacheable = metadata.mtimeNs < threshold && metadata.ctimeNs < threshold;
        results[index] = {
          absolutePath: candidate.absolutePath,
          relativePath: candidate.relativePath,
          mtimeMs: Number(metadata.mtimeNs) / 1000000,
          size: identity.size, identity, cacheable,
          evidence: cacheable && (!previous?.has(candidate.absolutePath) || previous.get(candidate.absolutePath)?.evidence === 'metadata') ? 'metadata' : 'unknown',
        };
      } catch (error) {
        noteIssue(candidate.relativePath, error);
      }
    }
  });
  await Promise.all(workers);
  let digestCursor = 0;
  let digestBytes = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (digestCursor < results.length) {
      const file = results[digestCursor++];
      if (!file || file.evidence === 'metadata') continue;
      if (Date.now() >= deadline || file.size > 1024 * 1024 || digestBytes + file.size > 8 * 1024 * 1024) continue;
      digestBytes += file.size;
      try {
        file.digest = await readSemanticDigest(root, file.absolutePath, file.identity, 1024 * 1024, deadline);
        file.evidence = 'digest';
      } catch (error) { noteIssue(file.relativePath, error); }
    }
  }));
  if (Date.now() >= deadline && results.some(item => item === undefined)) truncated = true;

  // Root loss during enumeration must not turn all vanished leaves into a clean empty scan.
  try { await lstat(root); } catch (error) { noteIssue('.', error, true); }
  return {
    complete: !truncated && ioIssueCount === 0,
    ioIssueCount,
    issues,
    files: results.filter((item): item is WorkspaceSourceFile => Boolean(item)),
    truncated,
    durationMs: Date.now() - started,
    ignoredCount,
  };
}

export async function isSemanticallyIgnored(
  root: string,
  absolutePath: string,
  extraIgnored: readonly string[] = [],
): Promise<boolean> {
  const relative = path.relative(root, absolutePath);
  if (!relative || relative === '.') return false;
  if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return true;
  if (isProtectedPath(absolutePath) || hardIgnored(relative, extraIgnored)) return true;
  try { await access(absolutePath); } catch { return true; }
  const ignored = await runGitCheckIgnore(root, [relative]);
  return ignored.has(relative.replace(/\\/g, '/'));
}

export async function computeLanguageComposition(
  root: string,
  definitions: Array<{ id: string; extensions: string[]; ignoredDirectories?: string[] }>,
): Promise<Map<string, number>> {
  const union = [...new Set(definitions.flatMap(item => item.extensions.map(normalizeExt)))];
  const scan = await scanWorkspaceSources(root, union, []);
  if (!scan.files.length) return new Map();
  const counts = new Map<string, number>();
  let recognized = 0;
  for (const file of scan.files) {
    const extension = path.extname(file.absolutePath).toLowerCase();
    let matched = false;
    for (const definition of definitions) {
      if (!definition.extensions.some(value => normalizeExt(value) === extension)) continue;
      counts.set(definition.id, (counts.get(definition.id) ?? 0) + 1);
      matched = true;
    }
    if (matched) recognized += 1;
  }
  if (!recognized) return new Map();
  return new Map([...counts.entries()].map(([id, count]) => [id, count / recognized]));
}
