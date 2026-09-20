import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { MemoryProvenance, MemoryRecord } from './types.js';

const execFileAsync = promisify(execFile);
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
  reason?: string;
}

function boundedText(value: string | undefined, max: number): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, max) : undefined;
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

export function normalizeMemoryProvenance(input: MemoryProvenance): MemoryProvenance {
  const files = [...new Set((input.files ?? []).map(normalizeMemorySourceFile))].slice(0, MAX_PROVENANCE_FILES);
  const gitCommit = boundedText(input.gitCommit, 80);
  if (gitCommit && !/^[0-9a-fA-F]{7,64}$/.test(gitCommit)) {
    throw new Error('MEMORY_PROVENANCE_COMMIT_INVALID');
  }
  return {
    files,
    ...(boundedText(input.workspace, 120) ? { workspace: boundedText(input.workspace, 120) } : {}),
    ...(boundedText(input.repo, 160) ? { repo: boundedText(input.repo, 160) } : {}),
    ...(gitCommit ? { gitCommit } : {}),
    ...(boundedText(input.gitRef, 240) ? { gitRef: boundedText(input.gitRef, 240) } : {}),
  };
}

async function git(projectRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['--no-optional-locks', '-C', projectRoot, ...args],
    { windowsHide: true, timeout: 10_000, maxBuffer: 1_000_000, encoding: 'utf8' },
  );
  return String(stdout ?? '').trim();
}

function supportsLocalWorkspace(provenance: MemoryProvenance): boolean {
  return !provenance.workspace || provenance.workspace === 'agent-core';
}

export async function captureMemoryProvenance(
  projectRoot: string,
  input: MemoryProvenance,
): Promise<MemoryProvenance> {
  const provenance = normalizeMemoryProvenance(input);
  if (!provenance.files.length || provenance.gitCommit || !supportsLocalWorkspace(provenance)) return provenance;

  try {
    const gitCommit = await git(projectRoot, ['rev-parse', 'HEAD']);
    let gitRef: string | undefined;
    try {
      const ref = await git(projectRoot, ['symbolic-ref', '-q', '--short', 'HEAD']);
      if (ref) gitRef = ref;
    } catch {
      // Detached HEAD is valid; commit identity is sufficient.
    }
    return normalizeMemoryProvenance({ ...provenance, gitCommit, ...(gitRef ? { gitRef } : {}) });
  } catch {
    return provenance;
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
  if (!provenance.gitCommit) {
    return { ...base, status: 'source-unavailable', reason: 'capture commit is unavailable' };
  }

  const pathspecs = provenance.files.map((file) => `:(literal)${file}`);
  try {
    await git(projectRoot, ['cat-file', '-e', `${provenance.gitCommit}^{commit}`]);
    const currentCommit = await git(projectRoot, ['rev-parse', 'HEAD']);
    const changedRaw = await git(projectRoot, [
      'diff', '--name-only', '--no-renames', provenance.gitCommit, '--', ...pathspecs,
    ]);
    const changedSet = new Set(
      changedRaw.split(/\r?\n/).map((item) => item.trim().replace(/\\/g, '/')).filter(Boolean),
    );
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
    };
  } catch (error) {
    return {
      ...base,
      status: 'source-unavailable',
      reason: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    };
  }
}
