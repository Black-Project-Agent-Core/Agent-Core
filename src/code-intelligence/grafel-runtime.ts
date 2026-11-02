import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CodeIndexState,
  CodeProviderAttestation,
  CodeIntelligenceConfig,
  CodeWorkspaceRecord,
  CodeWorkspaceRef,
  CodeWorkspaceRepo,
  GrafelCliResult,
  GrafelStatusPayload,
} from './types.js';
import type { GrafelCliCapabilityProbe } from './provider-capabilities.js';
import { buildOwnedChildEnv } from '../security/environment.js';
import { comparablePath, pathInside } from '../portability/paths.js';

function parseJsonValue(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (!line.startsWith('{') && !line.startsWith('[')) continue;
    try { return JSON.parse(line); } catch { /* keep scanning */ }
  }
  return null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const parsed = parseJsonValue(text);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

function normalizeSha256(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/^sha256:/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function normalizeCommit(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(normalized) ? normalized : undefined;
}

function commitFromProviderVersion(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return normalizeCommit(/\bcommit\s+([0-9a-f]{7,64})/i.exec(value)?.[1]);
}

export function validateGrafelIsolationEnvironment(
  runtimeDir: string,
  env: NodeJS.ProcessEnv,
): string[] {
  const required = [
    'HOME',
    'USERPROFILE',
    'XDG_CONFIG_HOME',
    'APPDATA',
    'LOCALAPPDATA',
    'GRAFEL_HOME',
    'GRAFEL_DAEMON_ROOT',
  ] as const;
  const issues: string[] = [];
  for (const key of required) {
    const value = env[key];
    if (!value) {
      issues.push(`${key}:missing`);
      continue;
    }
    if (!pathInside(value, runtimeDir)) issues.push(`${key}:outside-runtime`);
  }
  return issues;
}

export class GrafelRuntime {
  readonly homeDir: string;
  readonly grafelHome: string;
  readonly daemonRoot: string;
  readonly logDir: string;
  readonly configDir: string;
  readonly appDataDir: string;
  readonly localAppDataDir: string;
  private binaryDigestCache?: { size: number; mtimeMs: number; sha256: string };

  constructor(readonly config: CodeIntelligenceConfig) {
    this.homeDir = path.join(config.runtimeDir, 'home');
    this.grafelHome = path.join(this.homeDir, '.grafel');
    this.daemonRoot = path.join(config.runtimeDir, 'daemon');
    this.logDir = path.join(config.runtimeDir, 'logs');
    this.configDir = path.join(this.homeDir, '.config');
    this.appDataDir = path.join(this.homeDir, 'AppData', 'Roaming');
    this.localAppDataDir = path.join(this.homeDir, 'AppData', 'Local');
  }

  private buildEnvironment(): NodeJS.ProcessEnv {
    const policy = this.config.resourcePolicy ?? {};
    return buildOwnedChildEnv({
      HOME: this.homeDir,
      USERPROFILE: this.homeDir,
      XDG_CONFIG_HOME: this.configDir,
      APPDATA: this.appDataDir,
      LOCALAPPDATA: this.localAppDataDir,
      GRAFEL_HOME: this.grafelHome,
      GRAFEL_DAEMON_ROOT: this.daemonRoot,
      GRAFEL_EAGER_ALGO: 'false',
      GRAFEL_EMBEDDING_URL: '',
      GRAFEL_HEAP_MAX_PCT: '60',
      GRAFEL_MAX_RSS_BUDGET_MB: policy.maxRssBudgetMb !== undefined ? String(policy.maxRssBudgetMb) : '',
      GRAFEL_MCP_RELOAD_DEBOUNCE_MS: policy.reloadDebounceMs !== undefined ? String(policy.reloadDebounceMs) : '',
      GRAFEL_RELOAD_DEBOUNCE_MS: '',
      GRAFEL_MCP_BM25_IDLE_MS: policy.bm25IdleMs !== undefined ? String(policy.bm25IdleMs) : '',
      GRAFEL_MCP_GROUP_IDLE_MS: policy.groupIdleMs && policy.groupIdleMs > 0 ? String(policy.groupIdleMs) : '',
      GRAFEL_MCP_GROUP_KEEP_READER: policy.groupKeepReader === undefined ? '' : String(policy.groupKeepReader),
      GRAFEL_MCP_GROUP_RSS_BUDGET_MB: policy.groupRssBudgetMb && policy.groupRssBudgetMb > 0 ? String(policy.groupRssBudgetMb) : '',
      GRAFEL_GROUP_ALGO_DEBOUNCE: policy.groupAlgoDebounce ?? '',
    });
  }

  isolationStatus(): { ok: boolean; missingOrInvalid: string[] } {
    const missingOrInvalid = validateGrafelIsolationEnvironment(this.config.runtimeDir, this.buildEnvironment());
    return { ok: missingOrInvalid.length === 0, missingOrInvalid };
  }

  resourcePolicy(): NonNullable<CodeIntelligenceConfig['resourcePolicy']> {
    const policy = this.config.resourcePolicy ?? {};
    return {
      ...(policy.maxRssBudgetMb !== undefined ? { maxRssBudgetMb: policy.maxRssBudgetMb } : {}),
      reloadDebounceMs: policy.reloadDebounceMs ?? 2000,
      bm25IdleMs: policy.bm25IdleMs ?? 300000,
      groupIdleMs: policy.groupIdleMs ?? 0,
      groupKeepReader: policy.groupKeepReader ?? true,
      groupRssBudgetMb: policy.groupRssBudgetMb ?? 0,
      groupAlgoDebounce: policy.groupAlgoDebounce ?? '180s',
    };
  }

  environment(): NodeJS.ProcessEnv {
    const env = this.buildEnvironment();
    const isolation = validateGrafelIsolationEnvironment(this.config.runtimeDir, env);
    if (isolation.length) {
      throw new Error(`CODE_INTELLIGENCE_ISOLATION_INVALID: ${isolation.join(', ')}`);
    }
    return env;
  }

  stdioEnvironment(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.environment())) {
      if (typeof value === 'string') result[key] = value;
    }
    return result;
  }

  async isConfigured(): Promise<boolean> {
    if (!this.config.enabled) return false;
    try {
      await access(this.config.binaryPath, fsConstants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  async ensureLayout(): Promise<void> {
    await Promise.all([
      mkdir(this.config.runtimeDir, { recursive: true }),
      mkdir(path.dirname(this.config.binaryPath), { recursive: true }),
      mkdir(this.homeDir, { recursive: true }),
      mkdir(this.grafelHome, { recursive: true }),
      mkdir(this.daemonRoot, { recursive: true }),
      mkdir(this.logDir, { recursive: true }),
      mkdir(this.configDir, { recursive: true }),
      mkdir(this.appDataDir, { recursive: true }),
      mkdir(this.localAppDataDir, { recursive: true }),
    ]);
    const configPath = path.join(this.daemonRoot, 'daemon.config.json');
    try {
      await writeFile(configPath, JSON.stringify({ mode: 'background' }, null, 2), { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  async version(): Promise<string> {
    const { stdout } = await this.runCli(['--version'], Math.min(this.config.startupTimeoutMs, 10_000));
    return stdout.trim();
  }

  async start(): Promise<void> {
    await this.ensureLayout();
    await this.runCli(['start'], this.config.startupTimeoutMs);
  }

  async restart(): Promise<void> {
    await this.ensureLayout();
    await this.runCli(['restart'], this.config.startupTimeoutMs);
  }

  async stop(): Promise<void> {
    try {
      await this.runCli(['stop'], Math.min(this.config.startupTimeoutMs, 15_000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/not running|daemon is not reachable|no running daemon/i.test(message)) throw error;
    }
  }

  async registerProject(): Promise<boolean> {
    if (await this.registrationCurrent()) return false;

    const fleetRebased = await this.rebaseDefaultFleetPath();
    const registryRebased = await this.rebaseDefaultProviderRegistryPath();
    if ((fleetRebased || registryRebased) && await this.registrationCurrent()) return true;

    await this.registerWorkspace(
      this.config.group,
      [{ slug: this.config.repoSlug, path: this.config.projectRoot }],
      false,
    );
    if (await this.registrationCurrent()) return true;

    const fleetRepaired = await this.rebaseDefaultFleetPath();
    const registryRepaired = await this.rebaseDefaultProviderRegistryPath();
    if ((fleetRepaired || registryRepaired) && await this.registrationCurrent()) return true;
    throw new Error('CODE_INTELLIGENCE_DEFAULT_REGISTRATION_REPAIR_FAILED');
  }

  async registerWorkspace(
    group: string,
    repos: CodeWorkspaceRepo[],
    trackWorktrees: boolean,
  ): Promise<void> {
    const args = ['group', 'add', group];
    for (const repo of repos) args.push('--repo', `${repo.slug}=${repo.path}`);
    args.push(
      '--install=false',
      '--git-hooks=false',
      '--rules=false',
      '--mcp=false',
      '--json',
    );
    if (trackWorktrees) args.push('--track-worktrees');
    await this.runCli(args, this.config.startupTimeoutMs, { cwd: repos[0]?.path ?? this.config.projectRoot });
  }

  async deleteWorkspace(group: string): Promise<unknown> {
    try {
      const { stdout } = await this.runCli(
        ['delete', group, '--force', '--json', '--keep-caches'],
        Math.min(this.config.startupTimeoutMs, 30_000),
      );
      return parseJsonValue(stdout) ?? stdout.trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (group === this.config.group || !/unknown group:/i.test(message)) throw error;

      const fleetDir = path.join(this.configDir, 'grafel');
      let removed = false;
      for (const name of await readdir(fleetDir).catch(() => [] as string[])) {
        if (!name.endsWith('.fleet.json')) continue;
        const fleetPath = path.join(fleetDir, name);
        try {
          const parsed = JSON.parse(await readFile(fleetPath, 'utf8')) as { name?: string };
          if (parsed.name !== group) continue;
          await rm(fleetPath, { force: true });
          removed = true;
          break;
        } catch {
          // Malformed unrelated provider records are handled by diagnostics.
        }
      }
      return { group, providerAlreadyAbsent: true, localFleetRemoved: removed };
    }
  }

  async listWorkspaces(): Promise<CodeWorkspaceRecord[]> {
    const fleetDir = path.join(this.configDir, 'grafel');
    let entries: string[] = [];
    try {
      entries = await readdir(fleetDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const result: CodeWorkspaceRecord[] = [];
    for (const name of entries.filter(value => value.endsWith('.fleet.json')).sort()) {
      try {
        const parsed = JSON.parse(await readFile(path.join(fleetDir, name), 'utf8')) as CodeWorkspaceRecord;
        if (!parsed?.name || !Array.isArray(parsed.repos)) continue;
        result.push({
          name: parsed.name,
          repos: parsed.repos
            .filter(repo => Boolean(repo?.slug && repo?.path))
            .map(repo => ({
              slug: repo.slug,
              path: path.isAbsolute(repo.path) ? path.resolve(repo.path) : path.resolve(this.config.projectRoot, repo.path),
              ...(Array.isArray(repo.stack) ? { stack: [...repo.stack] } : {}),
            })),
          ...(parsed.features && typeof parsed.features === 'object' ? { features: { ...parsed.features } } : {}),
        });
      } catch {
        // Ignore malformed provider-owned fleet files here; diagnostics reports registry drift separately.
      }
    }
    return result;
  }

  async refs(group: string): Promise<CodeWorkspaceRef[]> {
    const { stdout } = await this.runCli(
      ['branches', group, '--json'],
      Math.min(this.config.startupTimeoutMs, 15_000),
    );
    const parsed = parseJsonValue(stdout);
    return Array.isArray(parsed) ? parsed as CodeWorkspaceRef[] : [];
  }

  async pinRef(group: string, repo: string, ref: string): Promise<string> {
    const { stdout } = await this.runCli(
      ['branches', group, '--pin', repo, '--pin-ref', ref],
      Math.min(this.config.startupTimeoutMs, 15_000),
    );
    return stdout.trim();
  }

  async unpinRef(group: string, repo: string, ref: string): Promise<string> {
    const { stdout } = await this.runCli(
      ['branches', group, '--unpin', repo, '--unpin-ref', ref],
      Math.min(this.config.startupTimeoutMs, 15_000),
    );
    return stdout.trim();
  }

  async pruneRefs(
    group: string,
    options: { ttl?: string; apply?: boolean } = {},
  ): Promise<string> {
    const args = ['branches', group, '--prune-stale'];
    if (options.ttl) args.push('--ttl', options.ttl);
    if (options.apply === true) args.push('--force');
    else args.push('--dry-run');
    const { stdout } = await this.runCli(
      args,
      Math.min(this.config.startupTimeoutMs, 30_000),
    );
    return stdout.trim();
  }

  async quarantine(group: string): Promise<unknown[]> {
    const { stdout } = await this.runCli(
      ['quarantine', 'list', group, '--json'],
      Math.min(this.config.startupTimeoutMs, 15_000),
    );
    const parsed = parseJsonValue(stdout);
    return Array.isArray(parsed) ? parsed : [];
  }

  async mutateQuarantine(
    action: 'remove' | 'pin' | 'unpin',
    repo: string,
    relativePath: string,
  ): Promise<string> {
    const { stdout } = await this.runCli(
      ['quarantine', action, repo, relativePath],
      Math.min(this.config.startupTimeoutMs, 15_000),
    );
    return stdout.trim();
  }

  async requestIndexFor(repoPath: string, _ref?: string): Promise<void> {
    // Grafel v0.3.3 validates --ref client-side but does not forward it in
    // proto.IndexArgs (upstream #2220). Index the explicit checkout/worktree
    // path instead; freshness is proven afterward from provider indexed_ref.
    await this.runCli(['index', repoPath, '--async'], this.config.startupTimeoutMs, { cwd: repoPath });
  }

  async indexNowFor(repoPath: string): Promise<void> {
    // Relocation repair must materialize the graph for the newly resolved
    // project root before the daemon can truthfully report the workspace as
    // ready. This provider build can return exit 1 even after successfully
    // materializing a current graph, so exit 1 is accepted only when the
    // provider postcondition proves the exact active root is current.
    const result = await this.runCli(
      ['index', repoPath, '--quiet', '--json-stats'],
      Math.max(this.config.startupTimeoutMs, 30_000),
      { cwd: repoPath, acceptedExitCodes: [0, 1] },
    );
    if (result.exitCode === 0) return;

    const deadline = Date.now() + Math.max(this.config.startupTimeoutMs, 30_000);
    let lastStatus: GrafelStatusPayload = {};
    while (Date.now() < deadline) {
      try {
        lastStatus = await this.status(this.config.group, undefined, repoPath);
        const sameRoot = typeof lastStatus.repo_path === 'string'
          && comparablePath(lastStatus.repo_path) === comparablePath(repoPath);
        if (lastStatus.status === 'ok' && lastStatus.state === 'current') {
          if (sameRoot) return;
          break;
        }
      } catch {
        // Provider status can be briefly unavailable while the engine swaps the
        // relocated graph into place. Retry within the same bounded startup window.
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    throw new Error(
      `CODE_INTELLIGENCE_RELOCATION_INDEX_POSTCONDITION_FAILED: exit=${result.exitCode} status=${lastStatus.status ?? 'unknown'} state=${lastStatus.state ?? 'unknown'} repo=${lastStatus.repo_path ?? 'unknown'}`,
    );
  }

  async requestIndex(): Promise<void> {
    await this.requestIndexFor(this.config.projectRoot);
  }

  async status(group = this.config.group, ref?: string, cwd?: string): Promise<GrafelStatusPayload> {
    const args = ['status', group, '--json'];
    if (ref) args.push('--ref', ref);
    const { stdout } = await this.runCli(
      args,
      Math.min(this.config.startupTimeoutMs, 10_000),
      { cwd: cwd ?? this.config.projectRoot },
    );
    const parsed = parseJsonObject(stdout);
    if (!parsed) return { status: 'unknown', state: 'unknown' };
    return parsed as GrafelStatusPayload;
  }

  indexState(payload: GrafelStatusPayload): CodeIndexState {
    const raw = String(payload.state ?? '').toLowerCase();
    if (raw === 'current' || raw === 'queued' || raw === 'indexing' || raw === 'warming' || raw === 'dirty' || raw === 'degraded') {
      return raw;
    }
    if (payload.indexing === true) return 'indexing';
    if (payload.warming === true) return 'warming';
    if (String(payload.status ?? '').toLowerCase() === 'degraded') return 'degraded';
    return 'unknown';
  }

  async fitness(
    target: string,
    strict: boolean,
    cwd?: string,
  ): Promise<{ exitCode: number; violated: boolean; report: unknown; stderr: string }> {
    const args = ['quality', 'check'];
    if (strict) args.push('--strict');
    args.push('--json', target);
    const result = await this.runCli(
      args,
      Math.max(this.config.callTimeoutMs, 30_000),
      { cwd: cwd ?? this.config.projectRoot, acceptedExitCodes: [0, 2] },
    );
    return {
      exitCode: result.exitCode,
      violated: result.exitCode === 2,
      report: parseJsonValue(result.stdout),
      stderr: result.stderr.trim(),
    };
  }

  async providerMetadata(): Promise<Record<string, unknown> | null> {
    try {
      const parsed = JSON.parse(await readFile(path.join(this.config.runtimeDir, 'provider.json'), 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  private async executableSha256(): Promise<string> {
    const info = await stat(this.config.binaryPath);
    const cached = this.binaryDigestCache;
    if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) return cached.sha256;
    const sha256 = createHash('sha256').update(await readFile(this.config.binaryPath)).digest('hex');
    this.binaryDigestCache = { size: info.size, mtimeMs: info.mtimeMs, sha256 };
    return sha256;
  }

  async providerAttestation(payload?: GrafelStatusPayload): Promise<CodeProviderAttestation> {
    const metadata = await this.providerMetadata();
    const expectedExecutableSha256 = normalizeSha256(metadata?.executableSha256);
    const expectedVersion = typeof metadata?.version === 'string' ? metadata.version.trim() : undefined;
    const expectedSourceCommit = normalizeCommit(metadata?.sourceCommit);
    let observedExecutableSha256: string | undefined;
    try {
      observedExecutableSha256 = await this.executableSha256();
    } catch {
      return { state: 'unverifiable', expectedExecutableSha256, expectedVersion, expectedSourceCommit,
        issue: 'GRAFEL_PROVIDER_EXECUTABLE_DIGEST_UNAVAILABLE' };
    }

    if (!expectedExecutableSha256) {
      return { state: 'unverifiable', observedExecutableSha256, expectedVersion, expectedSourceCommit,
        issue: 'GRAFEL_PROVIDER_METADATA_DIGEST_MISSING' };
    }
    if (observedExecutableSha256 !== expectedExecutableSha256) {
      return { state: 'metadata-mismatch', expectedExecutableSha256, observedExecutableSha256,
        expectedVersion, expectedSourceCommit, issue: 'GRAFEL_PROVIDER_EXECUTABLE_DIGEST_MISMATCH' };
    }

    const resident = payload ?? await this.status().catch(() => undefined);
    const observedVersion = typeof resident?.version === 'string' ? resident.version.trim() : undefined;
    const observedSourceCommit = commitFromProviderVersion(observedVersion);
    const enginePid = Number.isInteger(resident?.engine_pid) && Number(resident?.engine_pid) > 0
      ? Number(resident?.engine_pid) : undefined;
    const common = { expectedExecutableSha256, observedExecutableSha256, expectedVersion,
      observedVersion, expectedSourceCommit, observedSourceCommit, enginePid };

    if (!resident || String(resident.status ?? '').toLowerCase() !== 'ok' || !enginePid) {
      return { state: 'unverifiable', ...common, issue: 'GRAFEL_PROVIDER_RESIDENT_ATTESTATION_UNAVAILABLE' };
    }
    if (expectedVersion && (!observedVersion
      || !(observedVersion === expectedVersion || observedVersion.startsWith(expectedVersion + ' ')))) {
      return { state: 'resident-mismatch', ...common, issue: 'GRAFEL_PROVIDER_RESIDENT_VERSION_MISMATCH' };
    }
    if (expectedSourceCommit && !observedSourceCommit) {
      return { state: 'unverifiable', ...common, issue: 'GRAFEL_PROVIDER_RESIDENT_COMMIT_UNAVAILABLE' };
    }
    if (expectedSourceCommit && observedSourceCommit
      && !expectedSourceCommit.startsWith(observedSourceCommit)
      && !observedSourceCommit.startsWith(expectedSourceCommit)) {
      return { state: 'resident-mismatch', ...common, issue: 'GRAFEL_PROVIDER_RESIDENT_COMMIT_MISMATCH' };
    }
    return { state: 'current', ...common };
  }

  async assertMutationAttested(payload?: GrafelStatusPayload): Promise<CodeProviderAttestation> {
    const attestation = await this.providerAttestation(payload);
    if (attestation.state === 'metadata-mismatch' || attestation.state === 'resident-mismatch') {
      throw new Error(`CODE_INTELLIGENCE_PROVIDER_ATTESTATION_MISMATCH: ${attestation.state}: ${attestation.issue ?? 'unknown'}`);
    }
    return attestation;
  }

  async probeCliCapabilities(): Promise<GrafelCliCapabilityProbe> {
    const [advanced, addHelp] = await Promise.all([
      this.runCli(['help', 'advanced'], Math.min(this.config.callTimeoutMs, 10_000)),
      this.runCli(['group', 'add', '__agent_core_help_probe__', '--help'], Math.min(this.config.callTimeoutMs, 10_000)),
    ]);
    const surface = `${advanced.stdout}\n${advanced.stderr}`;
    const addSurface = `${addHelp.stdout}\n${addHelp.stderr}`;
    return {
      groupAdd: /group add <group>/i.test(surface),
      trackWorktrees: /--track-worktrees/i.test(addSurface),
      branches: /branches \[group\]/i.test(surface),
      fitness: /quality check/i.test(surface),
      quarantine: /quarantine list/i.test(surface),
    };
  }

  async registryDiagnostics(): Promise<{
    workspaces: CodeWorkspaceRecord[];
    registryPath: string;
    registryReadable: boolean;
  }> {
    const registryPath = path.join(this.grafelHome, 'registry.json');
    let registryReadable = false;
    try {
      JSON.parse(await readFile(registryPath, 'utf8'));
      registryReadable = true;
    } catch {
      registryReadable = false;
    }
    return {
      workspaces: await this.listWorkspaces(),
      registryPath,
      registryReadable,
    };
  }

  async runCli(
    args: string[],
    timeoutMs: number,
    options: { cwd?: string; acceptedExitCodes?: number[] } = {},
  ): Promise<GrafelCliResult> {
    const accepted = new Set(options.acceptedExitCodes ?? [0]);
    return new Promise((resolve, reject) => {
      execFile(this.config.binaryPath, args, {
        cwd: options.cwd ?? this.config.projectRoot,
        env: this.environment(),
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf8',
      }, (error, stdout, stderr) => {
        const out = stdout;
        const err = stderr;
        const rawCode = (error as NodeJS.ErrnoException | null)?.code;
        const exitCode = error
          ? typeof rawCode === 'number' ? rawCode : 1
          : 0;

        if (error && !accepted.has(exitCode)) {
          const detail = [error.message, err.trim(), out.trim()].filter(Boolean).join(' | ');
          reject(new Error(`GRAFEL_CLI_FAILED: exit=${exitCode} ${detail}`));
          return;
        }
        resolve({ exitCode, stdout: out, stderr: err });
      });
    });
  }

  private async rebaseDefaultFleetPath(): Promise<boolean> {
    const fleetPath = path.join(this.configDir, 'grafel', `${this.config.group}.fleet.json`);
    try {
      const fleet = JSON.parse(await readFile(fleetPath, 'utf8')) as {
        name?: string;
        repos?: Array<{ slug?: string; path?: string; stack?: string[] }>;
        features?: Record<string, unknown>;
      };
      if (fleet.name !== this.config.group || !Array.isArray(fleet.repos)) return false;

      const expected = comparablePath(this.config.projectRoot);
      let changed = false;
      const repos = fleet.repos.map(repo => {
        if (repo.slug !== this.config.repoSlug) return repo;
        const current = repo.path ? comparablePath(repo.path) : '';
        if (current === expected) return repo;
        changed = true;
        return { ...repo, path: this.config.projectRoot };
      });
      if (!changed) return false;

      const tempPath = fleetPath + `.relocate-${process.pid}.tmp`;
      await writeFile(tempPath, JSON.stringify({ ...fleet, repos }, null, 2) + '\n', 'utf8');
      await rename(tempPath, fleetPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async rebaseDefaultProviderRegistryPath(): Promise<boolean> {
    const registryPath = path.join(this.grafelHome, 'registry.json');
    const expectedFleetPath = path.join(this.configDir, 'grafel', `${this.config.group}.fleet.json`);
    try {
      const registry = JSON.parse(await readFile(registryPath, 'utf8')) as {
        version?: number;
        groups?: Array<{ name?: string; config_path?: string; installed_at?: string }>;
      };
      if (registry.version !== 1 || !Array.isArray(registry.groups)) {
        throw new Error('CODE_INTELLIGENCE_REGISTRY_SCHEMA_UNSUPPORTED');
      }
      let changed = false;
      const groups = registry.groups.map(group => {
        if (group.name !== this.config.group) return group;
        const current = group.config_path ? comparablePath(group.config_path) : '';
        if (current === comparablePath(expectedFleetPath)) return group;
        changed = true;
        return { ...group, config_path: expectedFleetPath };
      });
      if (!changed) return false;

      const tempPath = registryPath + `.relocate-${process.pid}.tmp`;
      await writeFile(tempPath, JSON.stringify({ ...registry, groups }, null, 2) + '\n', 'utf8');
      await rename(tempPath, registryPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async registrationCurrent(): Promise<boolean> {
    try {
      const fleetPath = path.join(this.configDir, 'grafel', `${this.config.group}.fleet.json`);
      const markerPath = path.join(this.config.projectRoot, '.grafel', 'group.json');
      const registryPath = path.join(this.grafelHome, 'registry.json');
      const [fleetRaw, markerRaw, registryRaw] = await Promise.all([
        readFile(fleetPath, 'utf8'),
        readFile(markerPath, 'utf8'),
        readFile(registryPath, 'utf8'),
      ]);
      const fleet = JSON.parse(fleetRaw) as { name?: string; repos?: Array<{ slug?: string; path?: string }> };
      const marker = JSON.parse(markerRaw) as { group?: string };
      const registry = JSON.parse(registryRaw) as {
        version?: number;
        groups?: Array<{ name?: string; config_path?: string }>;
      };
      const repo = Array.isArray(fleet.repos)
        ? fleet.repos.find(item => item.slug === this.config.repoSlug)
        : undefined;
      const groupEntry = Array.isArray(registry.groups)
        ? registry.groups.find(item => item.name === this.config.group)
        : undefined;
      const configuredPath = repo?.path ? path.resolve(repo.path) : '';
      const expectedPath = path.resolve(this.config.projectRoot);
      const expectedFleetPath = path.join(this.configDir, 'grafel', `${this.config.group}.fleet.json`);
      const samePath = process.platform === 'win32'
        ? configuredPath.toLowerCase() === expectedPath.toLowerCase()
        : configuredPath === expectedPath;
      const sameRegistryPath = typeof groupEntry?.config_path === 'string'
        && comparablePath(groupEntry.config_path) === comparablePath(expectedFleetPath);
      return fleet.name === this.config.group
        && marker.group === this.config.group
        && registry.version === 1
        && samePath
        && sameRegistryPath;
    } catch {
      return false;
    }
  }
}
