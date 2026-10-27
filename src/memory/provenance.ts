import path from 'node:path';
import { readOnlyGit } from '../process/readonly-git.js';
import type { MemoryProvenance, MemoryRecord, MemoryRepositoryIdentity } from './types.js';
import { captureRepositoryIdentity } from './repository-identity.js';
import { captureMemorySourceSnapshot, compareMemorySourceSnapshot, memorySourcePathAllowed, normalizeMemorySourceSnapshot } from './source-snapshot.js';

const MAX_PROVENANCE_FILES = 64;
const MAX_FILE_REF_LENGTH = 500;

export type MemoryStalenessStatus = 'unanchored' | 'source-unavailable' | 'current' | 'changed';

export interface MemoryStalenessAssessment {
  status: MemoryStalenessStatus;
  anchoredFiles: string[];
  changedFiles: string[];
  captureCommit?: string;
  currentCommit?: string;
  commitsSinceCapture?: number;
  basis?: 'local-byte-snapshot' | 'git-reference';
  capturedAt?: string;
  observedAt?: string;
  unavailableFiles?: string[];
  reason?: string;
}

function boundedText(value: string | undefined, max: number): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

export function normalizeMemoryWorkspace(value: string, projectRoot?: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 120) throw new Error('MEMORY_PROVENANCE_WORKSPACE_INVALID');
  if (typeof projectRoot === 'string' && path.isAbsolute(value)
    && path.resolve(value).toLowerCase() === path.resolve(projectRoot).toLowerCase()) return 'agent-core';
  return normalized;
}

export function normalizeMemorySourceFile(value: string): string {
  const raw = value.trim().replace(/\\/g, '/');
  if (!raw || raw.length > MAX_FILE_REF_LENGTH) throw new Error('MEMORY_PROVENANCE_FILE_INVALID');
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) throw new Error('MEMORY_PROVENANCE_FILE_MUST_BE_RELATIVE');
  const normalized = path.posix.normalize(raw.replace(/^\.\//, ''));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('MEMORY_PROVENANCE_FILE_ESCAPES_WORKSPACE');
  }
  return normalized;
}

export function normalizeRepositoryIdentity(identity: MemoryRepositoryIdentity | undefined): MemoryRepositoryIdentity | undefined {
  if (!identity) return undefined;
  const digest = /^sha256:[0-9a-f]{64}$/i;
  if (!digest.test(identity.repositoryId) || !digest.test(identity.worktreeId)) {
    throw new Error('MEMORY_PROVENANCE_IDENTITY_INVALID');
  }
  const checkpoint = identity.checkpoint;
  return {
    kind: identity.kind,
    repositoryId: identity.repositoryId.toLowerCase(),
    worktreeId: identity.worktreeId.toLowerCase(),
    ...(checkpoint ? { checkpoint: {
      ...(checkpoint.head ? { head: checkpoint.head.slice(0, 64) } : {}),
      ...(checkpoint.ref ? { ref: checkpoint.ref.slice(0, 240) } : {}),
      ...(checkpoint.statusDigest && digest.test(checkpoint.statusDigest) ? { statusDigest: checkpoint.statusDigest.toLowerCase() } : {}),
      ...(Number.isSafeInteger(checkpoint.statusEntryCount) ? { statusEntryCount: checkpoint.statusEntryCount } : {}),
      ...(Number.isSafeInteger(checkpoint.renamedCount) ? { renamedCount: checkpoint.renamedCount } : {}),
      ...(Number.isSafeInteger(checkpoint.untrackedCount) ? { untrackedCount: checkpoint.untrackedCount } : {}),
      ...(checkpoint.renamedPathDigest && digest.test(checkpoint.renamedPathDigest) ? { renamedPathDigest: checkpoint.renamedPathDigest.toLowerCase() } : {}),
      ...(checkpoint.untrackedPathDigest && digest.test(checkpoint.untrackedPathDigest) ? { untrackedPathDigest: checkpoint.untrackedPathDigest.toLowerCase() } : {}),
    } } : {}),
  };
}

export function normalizeMemoryProvenance(input: MemoryProvenance): MemoryProvenance {
  const files = [...new Set((input.files ?? []).map(normalizeMemorySourceFile))].slice(0, MAX_PROVENANCE_FILES);
  const gitCommit = boundedText(input.gitCommit, 80);
  if (gitCommit && !/^[0-9a-fA-F]{7,64}$/.test(gitCommit)) {
    throw new Error('MEMORY_PROVENANCE_COMMIT_INVALID');
  }
  return {
    files,
    ...(input.workspace !== undefined ? { workspace: normalizeMemoryWorkspace(input.workspace) } : {}),
    ...(boundedText(input.repo, 160) ? { repo: boundedText(input.repo, 160) } : {}),
    ...(gitCommit ? { gitCommit } : {}),
    ...(boundedText(input.gitRef, 240) ? { gitRef: boundedText(input.gitRef, 240) } : {}),
    ...(input.importKey && /^sha256:[0-9a-f]{64}$/i.test(input.importKey) ? { importKey: input.importKey.toLowerCase() } : {}),
    ...(input.importKey && !/^sha256:[0-9a-f]{64}$/i.test(input.importKey) ? (() => { throw new Error('MEMORY_PROVENANCE_IMPORT_KEY_INVALID'); })() : {}),
    ...(normalizeRepositoryIdentity(input.identity) ? { identity: normalizeRepositoryIdentity(input.identity) } : {}),
    ...(input.sourceSnapshot !== undefined
      ? { sourceSnapshot: normalizeMemorySourceSnapshot(input.sourceSnapshot, files) } : {}),
  };
}

async function git(projectRoot: string, args: string[]): Promise<string> {
  return (await readOnlyGit(path.resolve(projectRoot), args, { timeoutMs: 10_000, maxBuffer: 1_000_000 })).trim();
}

function supportsLocalWorkspace(provenance: MemoryProvenance): boolean {
  return !provenance.workspace || provenance.workspace === 'agent-core';
}

export async function captureMemoryProvenance(
  projectRoot: string,
  input: MemoryProvenance,
): Promise<MemoryProvenance> {
  const provenance = normalizeMemoryProvenance({ ...input,
    ...(input.workspace ? { workspace: normalizeMemoryWorkspace(input.workspace, projectRoot) } : {}) });
  const identity = supportsLocalWorkspace(provenance)
    ? await captureRepositoryIdentity(projectRoot).catch(() => undefined)
    : undefined;
  const withIdentity = identity ? normalizeMemoryProvenance({ ...provenance, identity }) : provenance;
  if (!withIdentity.files.length || withIdentity.gitCommit || !supportsLocalWorkspace(withIdentity)) return withIdentity;

  // Capture selected working bytes, not HEAD-as-a-proxy for dirty/untracked files.
  // Explicit caller-supplied commits above retain their historical Git basis.
  const captured = normalizeMemoryProvenance({ ...withIdentity,
    sourceSnapshot: await captureMemorySourceSnapshot(projectRoot, withIdentity.files) });
  try {
    const gitCommit = await git(projectRoot, ['rev-parse', 'HEAD']);
    let gitRef: string | undefined;
    try {
      const ref = await git(projectRoot, ['symbolic-ref', '-q', '--short', 'HEAD']);
      if (ref) gitRef = ref;
    } catch {
      // Detached HEAD is valid; commit identity is sufficient.
    }
    return normalizeMemoryProvenance({ ...captured, gitCommit, ...(gitRef ? { gitRef } : {}) });
  } catch {
    return captured;
  }
}

export async function assessMemoryStaleness(
  record: MemoryRecord,
  projectRoot: string,
): Promise<MemoryStalenessAssessment> {
  const provenance = record.provenance ? normalizeMemoryProvenance(record.provenance) : undefined;
  if (!provenance?.files.length) {
    return { status: 'unanchored', anchoredFiles: [], changedFiles: [] };
  }

  const base = {
    anchoredFiles: [...provenance.files],
    changedFiles: [] as string[],
    ...(provenance.gitCommit ? { captureCommit: provenance.gitCommit } : {}),
  };

  if (!supportsLocalWorkspace(provenance)) {
    return { ...base, status: 'source-unavailable', reason: 'workspace is not locally resolvable by MemoryService' };
  }
  if (provenance.sourceSnapshot) {
    const identity = await captureRepositoryIdentity(projectRoot).catch(() => undefined);
    const recorded = provenance.identity;
    if (!recorded || !identity || recorded.kind !== identity.kind
      || recorded.repositoryId !== identity.repositoryId || recorded.worktreeId !== identity.worktreeId) {
      return { ...base, status: 'source-unavailable', basis: 'local-byte-snapshot',
        reason: 'Source repository/worktree identity is missing or differs from capture.' };
    }
    return { ...base, ...(identity.checkpoint?.head ? { currentCommit: identity.checkpoint.head } : {}),
      ...await compareMemorySourceSnapshot(projectRoot, provenance.sourceSnapshot) };
  }
  if (!provenance.gitCommit) {
    return { ...base, status: 'source-unavailable', reason: 'capture commit is unavailable; no byte snapshot exists' };
  }
  // Legacy metadata describes a Git reference, not capture-time working bytes.
  if (provenance.files.some(file => !memorySourcePathAllowed(file))) {
    return { ...base, status: 'source-unavailable', basis: 'git-reference', reason: 'Selected source is outside the supported text-source scope.' };
  }

  const pathspecs = provenance.files.map((file) => `:(literal)${file}`);
  try {
    const readable = await captureMemorySourceSnapshot(projectRoot, provenance.files);
    const unavailableFiles = readable.files.filter(file => file.status !== 'captured').map(file => file.path);
    if (unavailableFiles.length) return { ...base, status: 'source-unavailable', basis: 'git-reference',
      unavailableFiles, reason: 'Selected source is missing, excluded, over budget or not safely readable.' };
    await git(projectRoot, ['cat-file', '-e', `${provenance.gitCommit}^{commit}`]);
    const tree = await git(projectRoot, ['ls-tree', '-rz', '--name-only', provenance.gitCommit, '--', ...provenance.files]);
    const trackedAtReference = new Set(tree.split('\0').filter(Boolean));
    if (provenance.files.some(file => !trackedAtReference.has(file))) {
      return { ...base, status: 'source-unavailable', basis: 'git-reference',
        reason: 'Selected files are not all present in the declared commit; legacy metadata has no working-byte baseline.' };
    }
    const currentCommit = await git(projectRoot, ['rev-parse', 'HEAD']);
    const changedRaw = await git(projectRoot, [
      'diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', provenance.gitCommit, '--', ...pathspecs,
    ]);
    const changedSet = new Set(changedRaw.split('\0').filter(Boolean));
    const changedFiles = provenance.files.filter((file) => changedSet.has(file));
    let commitsSinceCapture = 0;
    try {
      const countRaw = await git(projectRoot, [
        'rev-list', '--count', `${provenance.gitCommit}..HEAD`, '--', ...pathspecs,
      ]);
      const parsed = Number.parseInt(countRaw, 10);
      if (Number.isSafeInteger(parsed) && parsed >= 0) commitsSinceCapture = parsed;
    } catch {
      // Count is advisory; staleness still comes from the bounded file diff.
    }
    return {
      ...base,
      status: changedFiles.length ? 'changed' : 'current',
      changedFiles,
      currentCommit,
      commitsSinceCapture,
      basis: 'git-reference',
      reason: 'Compared to the declared Git reference, not a capture-time working-byte snapshot.',
    };
  } catch (error) {
    return {
      ...base,
      status: 'source-unavailable',
      basis: 'git-reference',
      reason: 'Git source comparison is unavailable; no current-source claim.',
    };
  }
}
