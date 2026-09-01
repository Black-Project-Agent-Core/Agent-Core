import { access, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MemoryRemoteConfig } from '../config.js';
import type { GitHubGitService } from '../github/git-service.js';
import { runBoundedProcess, type ProcessRunner, type SpawnResult } from '../github/process.js';
import type { WorkspacePolicy } from '../runtime/workspace.js';

const MAX_REMOTE_FILES_PER_WRITE = 256;
const MAX_REMOTE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_REMOTE_WRITE_BYTES = 256 * 1024 * 1024;
const MAX_COMMIT_MESSAGE = 200;

export interface MemoryRemoteTransport {
  ensureCheckout(): Promise<{ cwd: string }>;
  fetch(): Promise<void>;
  currentRemoteHead(): Promise<string | null>;
  readFile(relativePath: string): Promise<Uint8Array | null>;
  writeFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]): Promise<void>;
  commit(message: string): Promise<string>;
  pushNonForce(): Promise<void>;
  resetToRemoteHead(): Promise<void>;
}

export class MemoryRemoteTransportError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'MemoryRemoteTransportError';
  }
}

type NetworkGit = Pick<GitHubGitService, 'clone' | 'fetch' | 'push' | 'remoteGetUrl'>;

function inside(root: string, candidate: string): boolean {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  const normalizedBase = process.platform === 'win32' ? base.toLowerCase() : base;
  const normalizedTarget = process.platform === 'win32' ? target.toLowerCase() : target;
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}${path.sep}`);
}

function safeRelativePath(value: string): string {
  const raw = value.trim();
  if (!raw || raw.length > 512 || /[\r\n\0]/.test(raw) || path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
    throw new MemoryRemoteTransportError('MEMORY_REMOTE_PATH_INVALID', 'Memory Remote relative path is invalid');
  }
  const normalized = raw.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new MemoryRemoteTransportError('MEMORY_REMOTE_PATH_INVALID', 'Memory Remote relative path must not traverse directories');
  }
  return segments.join('/');
}

function safeCommitMessage(value: string): string {
  const message = value.trim();
  if (!message || message.length > MAX_COMMIT_MESSAGE || /[\r\n\0]/.test(message)) {
    throw new MemoryRemoteTransportError('MEMORY_REMOTE_COMMIT_MESSAGE_INVALID', 'Memory Remote commit message is invalid');
  }
  return message;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function nearestExistingParent(target: string): Promise<string> {
  let current = path.resolve(target);
  while (true) {
    try {
      await stat(current);
      return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

function canonicalRemote(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}

function assertRemoteIdentity(actual: string, owner: string, repo: string): void {
  const expected = canonicalRemote(owner, repo);
  let actualUrl: URL;
  let expectedUrl: URL;
  try {
    actualUrl = new URL(actual.trim());
    expectedUrl = new URL(expected);
  } catch {
    throw new MemoryRemoteTransportError('MEMORY_REMOTE_IDENTITY_MISMATCH', 'Memory Remote checkout has an invalid remote identity');
  }
  if (
    actualUrl.protocol !== 'https:'
    || actualUrl.hostname.toLowerCase() !== 'github.com'
    || actualUrl.username
    || actualUrl.password
    || actualUrl.pathname !== expectedUrl.pathname
  ) {
    throw new MemoryRemoteTransportError('MEMORY_REMOTE_IDENTITY_MISMATCH', 'Memory Remote checkout remote identity does not match configured owner/repository');
  }
}

export class GitHubMemoryRemoteTransport implements MemoryRemoteTransport {
  private readonly gitExecutable = process.platform === 'win32' ? 'git.exe' : 'git';

  constructor(
    private readonly git: NetworkGit,
    private readonly workspace: WorkspacePolicy,
    readonly config: MemoryRemoteConfig,
    private readonly runner: ProcessRunner = runBoundedProcess,
  ) {}

  async ensureCheckout(): Promise<{ cwd: string }> {
    const { owner, repo } = this.requiredIdentity();
    const destination = await this.workspace.resolveTarget(this.config.workRoot);
    const gitDir = path.join(destination, '.git');
    if (!await exists(gitDir)) {
      if (await exists(destination)) {
        const entries = await (await import('node:fs/promises')).readdir(destination);
        if (entries.length > 0) {
          throw new MemoryRemoteTransportError(
            'MEMORY_REMOTE_CHECKOUT_INVALID',
            'Memory Remote work root exists but is not an empty Git checkout',
          );
        }
      } else {
        await mkdir(path.dirname(destination), { recursive: true });
      }
      await this.git.clone({ owner, repo, destination });
    }

    const cwd = await this.workspace.resolveExisting(destination);
    if (!await exists(path.join(cwd, '.git'))) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_CHECKOUT_INVALID', 'Memory Remote checkout is missing .git metadata');
    }
    const remote = await this.git.remoteGetUrl({ cwd, remote: 'origin' });
    assertRemoteIdentity(remote.stdout, owner, repo);
    await this.runLocal(['checkout', '-B', this.config.branch], cwd);
    return { cwd };
  }

  async fetch(): Promise<void> {
    const { cwd } = await this.ensureCheckout();
    await this.git.fetch({
      cwd,
      remote: 'origin',
      refspec: `refs/heads/${this.config.branch}:refs/remotes/origin/${this.config.branch}`,
    });
  }

  async currentRemoteHead(): Promise<string | null> {
    const { cwd } = await this.ensureCheckout();
    const result = await this.runLocalOptional(['rev-parse', '--verify', `refs/remotes/origin/${this.config.branch}`], cwd);
    if (!result) return null;
    const head = result.stdout.trim();
    if (!/^[0-9a-f]{40}$/i.test(head)) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_HEAD_INVALID', 'Memory Remote fetched head is not a Git commit SHA');
    }
    return head.toLowerCase();
  }

  async readFile(relativePath: string): Promise<Uint8Array | null> {
    const relative = safeRelativePath(relativePath);
    const { cwd } = await this.ensureCheckout();
    const target = await this.safeTarget(cwd, relative);
    try {
      return new Uint8Array(await readFile(target));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async writeFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]): Promise<void> {
    if (files.length < 1 || files.length > MAX_REMOTE_FILES_PER_WRITE) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_WRITE_INVALID', `Memory Remote write requires 1..${MAX_REMOTE_FILES_PER_WRITE} files`);
    }
    const normalized = files.map((file) => ({ relativePath: safeRelativePath(file.relativePath), bytes: file.bytes }));
    let totalBytes = 0;
    for (const file of normalized) {
      if (!(file.bytes instanceof Uint8Array) || file.bytes.byteLength > MAX_REMOTE_FILE_BYTES) {
        throw new MemoryRemoteTransportError('MEMORY_REMOTE_WRITE_INVALID', 'Memory Remote file exceeds the bounded write size');
      }
      totalBytes += file.bytes.byteLength;
    }
    if (totalBytes > MAX_REMOTE_WRITE_BYTES) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_WRITE_INVALID', 'Memory Remote write batch exceeds the bounded total size');
    }
    if (new Set(normalized.map((file) => file.relativePath)).size !== normalized.length) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_WRITE_INVALID', 'Memory Remote write batch contains duplicate paths');
    }

    const { cwd } = await this.ensureCheckout();
    for (const file of normalized) {
      const target = await this.safeTarget(cwd, file.relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.bytes, { mode: 0o600 });
    }
  }

  async commit(message: string): Promise<string> {
    const safeMessage = safeCommitMessage(message);
    const { cwd } = await this.ensureCheckout();
    await this.runLocal(['add', '--all', '--', '.'], cwd);
    const status = await this.runLocal(['status', '--porcelain=v1'], cwd);
    if (status.stdout.trim()) {
      await this.runLocal([
        '-c', 'user.name=Agent Core Memory Remote',
        '-c', 'user.email=memory-remote@agent-core.local',
        'commit', '--no-gpg-sign', '-m', safeMessage,
      ], cwd);
    }
    const head = (await this.runLocal(['rev-parse', 'HEAD'], cwd)).stdout.trim();
    if (!/^[0-9a-f]{40}$/i.test(head)) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_COMMIT_INVALID', 'Memory Remote local commit did not produce a Git commit SHA');
    }
    return head.toLowerCase();
  }

  async pushNonForce(): Promise<void> {
    const { cwd } = await this.ensureCheckout();
    await this.git.push({
      cwd,
      remote: 'origin',
      refspec: `HEAD:refs/heads/${this.config.branch}`,
      force: false,
    });
  }

  async resetToRemoteHead(): Promise<void> {
    const { cwd } = await this.ensureCheckout();
    const remoteHead = await this.currentRemoteHead();
    if (!remoteHead) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_HEAD_MISSING', 'Memory Remote fetched branch has no head to reset to');
    }
    await this.runLocal(['reset', '--hard', remoteHead], cwd);
  }

  private requiredIdentity(): { owner: string; repo: string } {
    if (!this.config.enabled || !this.config.owner || !this.config.repo) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_DISABLED', 'Memory Remote transport requires enabled owner/repository configuration');
    }
    return { owner: this.config.owner, repo: this.config.repo };
  }

  private async safeTarget(cwd: string, relative: string): Promise<string> {
    const target = path.resolve(cwd, ...relative.split('/'));
    if (!inside(cwd, target)) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_PATH_INVALID', 'Memory Remote relative path escapes the checkout');
    }
    const [realCwd, existingParent] = await Promise.all([realpath(cwd), nearestExistingParent(target)]);
    const realParent = await realpath(existingParent);
    if (!inside(realCwd, realParent)) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_PATH_INVALID', 'Memory Remote relative path resolves through a symlink outside the checkout');
    }
    return target;
  }

  private async runLocal(args: string[], cwd: string): Promise<SpawnResult> {
    let result: SpawnResult;
    try {
      result = await this.runner({
        executable: this.gitExecutable,
        args,
        cwd,
        timeoutMs: this.config.syncTimeoutMs,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_CONFIG_NOSYSTEM: '1',
        },
      });
    } catch (error) {
      throw new MemoryRemoteTransportError(
        'MEMORY_REMOTE_GIT_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (result.exitCode !== 0 || result.timedOut) {
      throw new MemoryRemoteTransportError(
        'MEMORY_REMOTE_GIT_FAILED',
        result.stderr.trim() || result.stdout.trim() || 'Memory Remote local Git command failed',
      );
    }
    return result;
  }

  private async runLocalOptional(args: string[], cwd: string): Promise<SpawnResult | null> {
    let result: SpawnResult;
    try {
      result = await this.runner({
        executable: this.gitExecutable,
        args,
        cwd,
        timeoutMs: this.config.syncTimeoutMs,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_CONFIG_NOSYSTEM: '1',
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new MemoryRemoteTransportError('MEMORY_REMOTE_GIT_FAILED', 'Git executable was not found');
      }
      throw error;
    }
    if (result.timedOut) {
      throw new MemoryRemoteTransportError('MEMORY_REMOTE_GIT_FAILED', 'Memory Remote local Git command timed out');
    }
    return result.exitCode === 0 ? result : null;
  }
}
