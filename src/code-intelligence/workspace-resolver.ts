import { execFile } from 'node:child_process';
import { readOnlyGitArgs, readOnlyGitEnv } from '../process/readonly-git.js';
import { comparablePath as comparable, pathInside as within } from '../portability/paths.js';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { CodeIntelligenceConfig, CodeWorkspaceContext, CodeWorkspaceRecord, CodeWorkspaceRepo } from './types.js';
import type { GrafelRuntime } from './grafel-runtime.js';

export interface WorkspaceContextInput {
  workspace?: string;
  ref?: string;
  worktreePath?: string;
  repoFilter?: string[];
}

export interface WorkspaceRegistrationInput {
  path?: string;
  group?: string;
  repos?: Array<{ slug?: string; path: string }>;
  trackWorktrees?: boolean;
  allowRepoMarker?: boolean;
  allowProtectedPath?: boolean;
}

export interface WorkspaceHygieneRecord {
  workspace: string;
  stale: boolean;
  repos: Array<{
    slug: string;
    path: string;
    state: 'present' | 'missing' | 'unreadable';
  }>;
}

function sanitizeBasename(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized.slice(0, 28) || 'workspace';
}

export function deriveWorkspaceName(workspacePath: string): string {
  const normalized = comparable(workspacePath);
  const base = sanitizeBasename(path.basename(path.resolve(workspacePath)));
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 8);
  return `ac-${base}-${hash}`;
}

export class WorkspaceResolver {
  private readonly protectedRoot: string;

  constructor(
    private readonly config: CodeIntelligenceConfig,
    private readonly runtime: GrafelRuntime,
  ) {
    this.protectedRoot = path.join(config.projectRoot, 'DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT');
  }

  async list(): Promise<CodeWorkspaceRecord[]> {
    return this.runtime.listWorkspaces();
  }

  async hygiene(): Promise<WorkspaceHygieneRecord[]> {
    const workspaces = await this.list();
    return Promise.all(workspaces.map(async (workspace) => {
      const repos = await Promise.all(workspace.repos.map(async (repo) => {
        try {
          const info = await stat(repo.path);
          return { slug: repo.slug, path: repo.path, state: info.isDirectory() ? 'present' as const : 'unreadable' as const };
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          return { slug: repo.slug, path: repo.path, state: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' as const : 'unreadable' as const };
        }
      }));
      return {
        workspace: workspace.name,
        stale: repos.length > 0 && repos.every(repo => repo.state === 'missing'),
        repos,
      };
    }));
  }

  async registrationPreview(input: WorkspaceRegistrationInput): Promise<{
    group: string;
    repos: CodeWorkspaceRepo[];
    requiresRepoMarker: boolean;
    markerConflicts: Array<{ path: string; group: string }>;
  }> {
    const repos = await this.normalizeRegistrationRepos(input);
    const group = input.group?.trim() || deriveWorkspaceName(repos[0]!.path);
    const markerConflicts: Array<{ path: string; group: string }> = [];
    let requiresRepoMarker = false;

    for (const repo of repos) {
      const marker = path.join(repo.path, '.grafel', 'group.json');
      try {
        const parsed = JSON.parse(await readFile(marker, 'utf8')) as { group?: string };
        if (parsed.group && parsed.group !== group) markerConflicts.push({ path: marker, group: parsed.group });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') requiresRepoMarker = true;
        else if (error instanceof SyntaxError) markerConflicts.push({ path: marker, group: '<invalid-marker>' });
        else throw error;
      }
    }

    return { group, repos, requiresRepoMarker, markerConflicts };
  }

  async resolve(input: WorkspaceContextInput = {}): Promise<CodeWorkspaceContext> {
    const workspaces = await this.list();
    const requestedWorkspace = input.workspace?.trim();
    const requestedPath = input.worktreePath ? await this.normalizeExistingPath(input.worktreePath, false) : undefined;

    let workspace: CodeWorkspaceRecord | undefined;
    if (requestedWorkspace) {
      workspace = workspaces.find(item => item.name === requestedWorkspace);
      if (!workspace) throw new Error(`CODE_WORKSPACE_NOT_REGISTERED: ${requestedWorkspace}`);
      if (requestedPath && !workspace.repos.some(repo => within(requestedPath, repo.path) || within(repo.path, requestedPath))) {
        throw new Error(`CODE_WORKSPACE_PATH_OUTSIDE_WORKSPACE: workspace=${requestedWorkspace} path=${requestedPath}`);
      }
    } else if (requestedPath) {
      workspace = this.findByPath(workspaces, requestedPath);
      if (!workspace) throw new Error(`CODE_WORKSPACE_NOT_REGISTERED_FOR_PATH: ${requestedPath}`);
    } else {
      workspace = workspaces.find(item => item.name === this.config.group);
      if (!workspace) throw new Error(`CODE_WORKSPACE_DEFAULT_NOT_REGISTERED: ${this.config.group}`);
    }

    const repoFilter = input.repoFilter?.length
      ? [...new Set(input.repoFilter.map(value => {
        const match = workspace!.repos.find(repo => repo.slug.toLowerCase() === value.trim().toLowerCase());
        if (!match) throw new Error(`CODE_WORKSPACE_REPO_FILTER_NOT_FOUND: workspace=${workspace!.name} repo=${value}`);
        return match.slug;
      }))]
      : undefined;
    const cwd = requestedPath ?? this.preferredRepoPath(workspace, repoFilter);
    const repo = this.repoForPath(workspace, cwd)?.slug ?? workspace.repos[0]?.slug;
    if (requestedPath && repoFilter?.length && (!repo || !repoFilter.includes(repo))) {
      throw new Error('CODE_WORKSPACE_REPO_FILTER_PATH_MISMATCH');
    }
    return {
      workspace: workspace.name,
      group: workspace.name,
      cwd,
      ...(input.ref?.trim() ? { ref: input.ref.trim() } : {}),
      ...(requestedPath ? { worktreePath: requestedPath } : {}),
      ...(repo ? { repo } : {}),
      ...(repoFilter?.length ? { repoFilter } : {}),
    };
  }

  async currentGitRef(worktreePath: string): Promise<string | null> {
    const cwd = await this.normalizeExistingPath(worktreePath, false);
    return new Promise((resolve, reject) => {
      execFile('git', readOnlyGitArgs(cwd, ['branch', '--show-current']), {
        windowsHide: true,
        timeout: 10_000,
        encoding: 'utf8',
        env: readOnlyGitEnv(),
      }, (error, stdout, stderr) => {
        if (error) {
          const message = [error.message, stderr.trim()].filter(Boolean).join(' | ');
          reject(new Error(`CODE_WORKSPACE_GIT_REF_FAILED: ${message}`));
          return;
        }
        resolve(stdout.trim() || null);
      });
    });
  }

  async register(input: WorkspaceRegistrationInput): Promise<CodeWorkspaceRecord> {
    const preview = await this.registrationPreview(input);
    if (preview.markerConflicts.length) {
      throw new Error(`CODE_WORKSPACE_MARKER_CONFLICT: ${preview.markerConflicts.map(item => `${item.path}=>${item.group}`).join(', ')}`);
    }
    if (preview.requiresRepoMarker && input.allowRepoMarker !== true) {
      throw new Error('CODE_WORKSPACE_REPO_MARKER_REQUIRED: registration would create .grafel/group.json; retry with allowRepoMarker=true after explicit authorization');
    }

    await this.runtime.registerWorkspace(preview.group, preview.repos, input.trackWorktrees === true);
    const registered = (await this.list()).find(item => item.name === preview.group);
    if (!registered) throw new Error(`CODE_WORKSPACE_REGISTRATION_NOT_VISIBLE: ${preview.group}`);
    return registered;
  }

  private async normalizeRegistrationRepos(input: WorkspaceRegistrationInput): Promise<CodeWorkspaceRepo[]> {
    const supplied = input.repos?.length
      ? input.repos
      : input.path
        ? [{ path: input.path }]
        : [];
    if (!supplied.length) throw new Error('CODE_WORKSPACE_PATH_REQUIRED');

    const repos: CodeWorkspaceRepo[] = [];
    const seen = new Set<string>();
    for (const item of supplied) {
      const normalized = await this.normalizeExistingPath(item.path, input.allowProtectedPath === true);
      const key = comparable(normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      repos.push({
        slug: item.slug?.trim() || sanitizeBasename(path.basename(normalized)),
        path: normalized,
      });
    }
    return repos;
  }

  private async normalizeExistingPath(value: string, allowProtected: boolean): Promise<string> {
    const resolved = await realpath(path.resolve(value));
    const info = await stat(resolved);
    if (!info.isDirectory()) throw new Error(`CODE_WORKSPACE_PATH_NOT_DIRECTORY: ${resolved}`);
    if (!allowProtected && within(resolved, this.protectedRoot)) {
      throw new Error(`CODE_WORKSPACE_PROTECTED_PATH: ${resolved}`);
    }
    return resolved;
  }

  private findByPath(workspaces: CodeWorkspaceRecord[], target: string): CodeWorkspaceRecord | undefined {
    return workspaces
      .filter(workspace => workspace.repos.some(repo => within(target, repo.path) || within(repo.path, target)))
      .sort((a, b) => {
        const aMax = Math.max(...a.repos.map(repo => comparable(repo.path).length));
        const bMax = Math.max(...b.repos.map(repo => comparable(repo.path).length));
        return bMax - aMax;
      })[0];
  }

  private preferredRepoPath(workspace: CodeWorkspaceRecord, repoFilter?: string[]): string {
    if (repoFilter?.length) {
      const wanted = new Set(repoFilter.map(value => value.toLowerCase()));
      const match = workspace.repos.find(repo => wanted.has(repo.slug.toLowerCase()));
      if (match) return match.path;
    }
    const first = workspace.repos[0];
    if (!first) throw new Error(`CODE_WORKSPACE_HAS_NO_REPOS: ${workspace.name}`);
    return first.path;
  }

  private repoForPath(workspace: CodeWorkspaceRecord, target: string): CodeWorkspaceRepo | undefined {
    return workspace.repos
      .filter(repo => within(target, repo.path) || within(repo.path, target))
      .sort((a, b) => comparable(b.path).length - comparable(a.path).length)[0];
  }
}
