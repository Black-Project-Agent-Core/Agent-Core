import type { CallToolResult } from '@modelcontextprotocol/client';
import path from 'node:path';
import { parseCallToolResultJson } from '../mcp/call-tool-result.js';
import { clearPortabilityReindexRequest, readPortabilityReindexRequest } from '../portability/runtime-relocation.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { GrafelClient } from './grafel-client.js';
import {
  collectSourceRepresentation,
  GraphIntegrityObserver,
  type GraphIntegrityObservation,
  type GraphStructuralEvidence,
} from './graph-observability.js';
import {
  deriveProviderCapabilities,
  GRAFEL_CORE_TOOLS,
  type GrafelCliCapabilityProbe,
} from './provider-capabilities.js';
import { GrafelRuntime } from './grafel-runtime.js';
import type {
  CodeIndexState,
  CodeIntelligenceConfig,
  CodeIntelligenceHealth,
  CodeProviderAttestation,
  CodeProviderCapabilities,
  CodeProviderReadiness,
  CodeWorkspaceContext,
  CodeWorkspaceRecord,
  CodeWorkspaceRef,
} from './types.js';
import { WorkspaceResolver, type WorkspaceContextInput, type WorkspaceRegistrationInput } from './workspace-resolver.js';

const HEALTH_CACHE_MS = 5_000;
const GRAFEL_WIRE_POLICY = { major: 0, minor: 1 } as const;

export function isSupportedGrafelWireVersion(value: string | undefined): boolean {
  if (!value) return false;
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(value.trim());
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major !== GRAFEL_WIRE_POLICY.major) return false;
  return major === 0 ? minor === GRAFEL_WIRE_POLICY.minor : true;
}

interface ProviderIndexRepo {
  repo?: string;
  group?: string;
  state?: string;
  dirty?: boolean;
  indexed_ref?: string;
  indexed_commit?: string;
  indexed_commit_short?: string;
  at_head?: boolean;
}

interface ProviderIndexSnapshot {
  repos: ProviderIndexRepo[];
  any_indexing?: boolean;
  parsing?: number;
  busy?: boolean;
  warming?: boolean;
  pending_algo?: number;
  pending_algorithms?: number;
  pending_links?: number;
  group_algo_pending?: number;
  links_pending?: number;
}

function normalizeFsPath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function parseIndexSnapshot(result: CallToolResult): ProviderIndexSnapshot {
  const parsed = parseCallToolResultJson(result) as ProviderIndexSnapshot | null;
  return parsed && Array.isArray(parsed.repos) ? parsed : { repos: [] };
}

function pendingWork(snapshot: ProviderIndexSnapshot): { algorithms: number; links: number } {
  const algorithms = Number(snapshot.pending_algorithms ?? snapshot.pending_algo ?? snapshot.group_algo_pending ?? 0);
  const links = Number(snapshot.pending_links ?? snapshot.links_pending ?? 0);
  return {
    algorithms: Number.isFinite(algorithms) && algorithms > 0 ? algorithms : 0,
    links: Number.isFinite(links) && links > 0 ? links : 0,
  };
}

function indexStateFromSnapshot(snapshot: ProviderIndexSnapshot, repoPath?: string): CodeIndexState {
  const repos = repoPath
    ? snapshot.repos.filter(repo => repo.repo && normalizeFsPath(repo.repo) === normalizeFsPath(repoPath))
    : snapshot.repos;
  if (snapshot.any_indexing || repos.some(repo => String(repo.state ?? '').toLowerCase() === 'indexing')) return 'indexing';
  const pending = pendingWork(snapshot);
  if (snapshot.warming || pending.algorithms > 0 || pending.links > 0) return 'warming';
  if (repos.some(repo => repo.dirty === true || String(repo.state ?? '').toLowerCase() === 'dirty')) return 'dirty';
  if (repos.some(repo => String(repo.state ?? '').toLowerCase() === 'queued')) return 'queued';
  if (repos.length > 0 && repos.every(repo => String(repo.state ?? '').toLowerCase() === 'current')) return 'current';
  return 'unknown';
}

function parseIndexState(result: CallToolResult, repoPath?: string): CodeIndexState {
  return indexStateFromSnapshot(parseIndexSnapshot(result), repoPath);
}

function readinessFromSnapshot(
  snapshot: ProviderIndexSnapshot,
  state: CodeIndexState,
  repoPath?: string,
): CodeProviderReadiness {
  const pending = pendingWork(snapshot);
  const repo = repoPath
    ? snapshot.repos.find(item => item.repo && normalizeFsPath(item.repo) === normalizeFsPath(repoPath))
    : snapshot.repos[0];
  return {
    state,
    indexing: state === 'indexing' || snapshot.any_indexing === true,
    warming: state === 'warming' || snapshot.warming === true || pending.algorithms > 0 || pending.links > 0,
    busy: snapshot.busy === true || state === 'indexing' || state === 'warming',
    pendingAlgorithms: pending.algorithms,
    pendingLinks: pending.links,
    ...(repo?.indexed_ref ? { indexedRef: repo.indexed_ref } : {}),
    ...(repo?.indexed_commit ? { indexedCommit: repo.indexed_commit } : {}),
  };
}

function contextKey(context: CodeWorkspaceContext): string {
  return [
    context.group,
    context.ref ?? '',
    context.worktreePath ?? context.cwd,
  ].join('|').toLowerCase();
}

export class CodeIntelligenceService {
  private readonly runtime: GrafelRuntime;
  private readonly client: GrafelClient;
  private readonly workspaceResolver: WorkspaceResolver;
  private readonly graphIntegrity: GraphIntegrityObserver;
  private lastHealth: CodeIntelligenceHealth;
  private lastHealthAt = 0;
  private healthGeneration = 0;
  private healthClosed = false;
  private pendingHealth?: { generation: number; promise: Promise<CodeIntelligenceHealth> };
  private providerVersion?: string;
  private providerWireVersion?: string;
  private providerWireIssue?: string;
  private cliCapabilities: GrafelCliCapabilityProbe = {
    groupAdd: false,
    trackWorktrees: false,
    branches: false,
    fitness: false,
    quarantine: false,
  };
  private providerCapabilities: CodeProviderCapabilities = {
    coreNavigation: false,
    workspaceRouting: false,
    refGraphs: false,
    repairs: false,
    fitness: false,
    diagnostics: false,
    quarantine: false,
    patterns: false,
    messaging: false,
    graphPatterns: false,
    crossLinkCandidates: false,
    enrichmentCandidates: false,
    dynamicToolRefresh: true,
    toolNames: [],
    issues: ['initializing'],
  };
  private readonly dirtyContexts = new Set<string>();

  private constructor(readonly config: CodeIntelligenceConfig) {
    this.runtime = new GrafelRuntime(config);
    this.client = new GrafelClient(this.runtime, config.callTimeoutMs);
    this.client.setToolSurfaceListener(async toolNames => {
      if (this.healthClosed) return;
      this.providerCapabilities = deriveProviderCapabilities(toolNames, this.cliCapabilities);
      this.invalidateHealth();
      activityTracker.record(
        'CODE_INTELLIGENCE',
        'info',
        'Grafel provider tool surface refreshed',
        'provider-tool-surface-refresh',
        { toolCount: toolNames.length, issueCount: this.providerCapabilities.issues.length },
      );
    });
    this.workspaceResolver = new WorkspaceResolver(config, this.runtime);
    this.graphIntegrity = new GraphIntegrityObserver(
      path.join(config.runtimeDir, 'agent-core-graph-observability.json'),
    );
    this.lastHealth = {
      status: config.enabled ? 'degraded' : 'not-configured',
      provider: 'grafel',
      daemon: 'unavailable',
      index: 'unknown',
      group: config.group,
      issueCount: config.enabled ? 1 : 0,
      ...(config.enabled ? { issue: 'initializing' } : {}),
    };
  }

  static async initialize(config: CodeIntelligenceConfig): Promise<CodeIntelligenceService> {
    const service = new CodeIntelligenceService(config);
    await service.bootstrap();
    return service;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  capabilities(): CodeProviderCapabilities {
    return {
      ...this.providerCapabilities,
      toolNames: [...this.providerCapabilities.toolNames],
      issues: [...this.providerCapabilities.issues],
    };
  }

  async health(force = false): Promise<CodeIntelligenceHealth> {
    if (!this.config.enabled) return this.lastHealth;
    if (this.healthClosed) return this.unavailableHealth('CODE_INTELLIGENCE_CLOSED');
    const now = Date.now();
    if (!force && this.lastHealthAt > 0 && now - this.lastHealthAt < HEALTH_CACHE_MS) return this.lastHealth;
    const generation = this.healthGeneration;
    if (this.pendingHealth?.generation === generation) return this.pendingHealth.promise;
    const owner = { generation, promise: undefined as unknown as Promise<CodeIntelligenceHealth> };
    owner.promise = this.collectHealth(generation).then(health => {
      if (this.healthClosed || generation !== this.healthGeneration) {
        return this.unavailableHealth(this.healthClosed ? 'CODE_INTELLIGENCE_CLOSED' : 'CODE_INTELLIGENCE_HEALTH_SUPERSEDED');
      }
      this.lastHealth = health;
      this.lastHealthAt = Date.now();
      return health;
    }).finally(() => {
      if (this.pendingHealth === owner) this.pendingHealth = undefined;
    });
    this.pendingHealth = owner;
    return owner.promise;
  }

  private invalidateHealth(): void {
    this.healthGeneration += 1;
    this.lastHealthAt = 0;
  }

  private async assertProviderMutationAllowed(operation: string): Promise<CodeProviderAttestation> {
    const attestation = await this.runtime.assertMutationAttested();
    if (attestation.state === 'unverifiable') {
      activityTracker.record(
        'CODE_INTELLIGENCE',
        'info',
        'Grafel provider mutation proceeding with unverifiable resident attestation',
        'provider-attestation-unverifiable',
        { operation, issue: attestation.issue ?? '' },
      );
    }
    return attestation;
  }

  private unavailableHealth(issue: string): CodeIntelligenceHealth {
    return { status: 'degraded', provider: 'grafel', daemon: 'unavailable', index: 'unknown',
      group: this.config.group, issueCount: 1, issue };
  }

  async resolveWorkspace(input: WorkspaceContextInput = {}): Promise<CodeWorkspaceContext> {
    return this.workspaceResolver.resolve(input);
  }

  async listWorkspaces(): Promise<CodeWorkspaceRecord[]> {
    this.assertCapability('workspaceRouting');
    return this.workspaceResolver.list();
  }

  async previewWorkspaceRegistration(input: WorkspaceRegistrationInput): Promise<unknown> {
    this.assertCapability('workspaceRouting');
    return this.workspaceResolver.registrationPreview(input);
  }

  async registerWorkspace(input: WorkspaceRegistrationInput): Promise<CodeWorkspaceRecord> {
    this.assertCapability('workspaceRouting');
    await this.assertProviderMutationAllowed('register-workspace');
    const registered = await this.workspaceResolver.register(input);
    if (input.trackWorktrees === true) {
      // Grafel v0.3.3 creates the worktree watcher only when a
      // track_worktrees group exists at daemon startup. Registration is an
      // explicit mutation, so restart only the isolated Grafel daemon here
      // to activate discovery immediately; Agent Core execution stays live.
      await this.client.close().catch(() => undefined);
      await this.runtime.stop();
      await this.runtime.start();
      await this.waitForProviderReadiness();
    }
    activityTracker.record(
      'CODE_INTELLIGENCE',
      'success',
      'Grafel workspace registered',
      'workspace-registered',
      { workspace: registered.name, repoCount: registered.repos.length, trackWorktrees: input.trackWorktrees === true },
    );
    return registered;
  }

  async workspaceHygiene(): Promise<unknown> {
    this.assertCapability('workspaceRouting');
    const records = await this.workspaceResolver.hygiene();
    return {
      workspaces: records,
      stale: records.filter(record => record.stale),
      staleCount: records.filter(record => record.stale).length,
    };
  }

  async unregisterWorkspace(input: { workspace: string; confirmation?: string }): Promise<unknown> {
    this.assertCapability('workspaceRouting');
    await this.assertProviderMutationAllowed('unregister-workspace');
    const workspace = input.workspace.trim();
    if (!workspace) throw new Error('CODE_WORKSPACE_NAME_REQUIRED');
    if (workspace === this.config.group) throw new Error(`CODE_WORKSPACE_DEFAULT_PROTECTED: ${workspace}`);
    if (input.confirmation !== 'UNREGISTER_WORKSPACE') {
      throw new Error('CODE_WORKSPACE_UNREGISTER_CONFIRMATION_REQUIRED: confirmation=UNREGISTER_WORKSPACE');
    }
    const before = await this.workspaceResolver.list();
    const exact = before.find(item => item.name === workspace);
    if (!exact) return { workspace, changed: false, reason: 'already-unregistered' };
    const provider = await this.runtime.deleteWorkspace(workspace);
    const after = await this.workspaceResolver.list();
    if (after.some(item => item.name === workspace)) {
      throw new Error(`CODE_WORKSPACE_UNREGISTER_VERIFY_FAILED: ${workspace}`);
    }
    activityTracker.record('CODE_INTELLIGENCE', 'success', 'Grafel workspace unregistered', 'workspace-unregistered', {
      workspace,
      repoCount: exact.repos.length,
    });
    return { workspace, changed: true, provider };
  }

  async pruneWorkspaces(input: { apply?: boolean; confirmation?: string } = {}): Promise<unknown> {
    this.assertCapability('workspaceRouting');
    const hygiene = await this.workspaceResolver.hygiene();
    const stale = hygiene.filter(record => record.stale && record.workspace !== this.config.group);
    if (input.apply !== true) return { dryRun: true, stale, staleCount: stale.length };
    await this.assertProviderMutationAllowed('prune-workspaces');
    if (input.confirmation !== 'PRUNE_STALE_WORKSPACES') {
      throw new Error('CODE_WORKSPACE_PRUNE_CONFIRMATION_REQUIRED: confirmation=PRUNE_STALE_WORKSPACES');
    }
    const removed: string[] = [];
    for (const record of stale) {
      await this.runtime.deleteWorkspace(record.workspace);
      removed.push(record.workspace);
    }
    const after = await this.workspaceResolver.list();
    const remaining = removed.filter(name => after.some(item => item.name === name));
    if (remaining.length) throw new Error(`CODE_WORKSPACE_PRUNE_VERIFY_FAILED: ${remaining.join(', ')}`);
    if (removed.length) {
      activityTracker.record('CODE_INTELLIGENCE', 'success', 'Stale Grafel workspaces pruned', 'workspace-pruned', {
        removed,
        count: removed.length,
      });
    }
    return { dryRun: false, removed, removedCount: removed.length };
  }

  async workspaceStatus(input: WorkspaceContextInput = {}): Promise<unknown> {
    this.assertCapability('workspaceRouting');
    const context = await this.resolveWorkspace(input);
    await this.assertRequestedRef(context);
    const members = (await this.workspaceResolver.list()).find(item => item.name === context.group)?.repos ?? [];
    const [providerIndexStatus, refs, graphs] = await Promise.all([
      this.providerIndexSnapshot(context),
      this.providerCapabilities.refGraphs ? this.runtime.refs(context.group).catch(() => []) : Promise.resolve([]),
      this.graphLoadEvidence(context, members.map(repo => repo.slug)),
    ]);
    const selected = this.contextGraphEvidence(context, providerIndexStatus, refs, graphs);
    const index = selected.index;
    const coverage = await Promise.all(members.map(async repo => {
      const memberContext = { ...context, cwd: repo.path, repo: repo.slug,
        ...(repo.slug === context.repo ? {} : { worktreePath: undefined }) };
      const evidence = this.contextGraphEvidence(memberContext, providerIndexStatus, refs, graphs);
      const integrity = this.config.enabled && evidence.index === 'current' && evidence.graphAvailability.available
        ? await this.graphIntegrity.observe({
            group: memberContext.group,
            repo: repo.slug,
            ...(memberContext.ref ? { ref: memberContext.ref } : {}),
            repoPath: memberContext.worktreePath ?? repo.path,
            evidence: evidence.graphAvailability,
          }).catch(error => ({
            state: 'unavailable' as const,
            reason: `observer-failure: ${error instanceof Error ? error.message : String(error)}`,
          }))
        : { state: 'unavailable' as const, reason: evidence.graphAvailability.reason };
      return { repo: repo.slug, index: evidence.index, ...evidence.graphAvailability, integrity };
    }));
    const selectedIntegrity = coverage.find(repo => repo.repo === context.repo)?.integrity
      ?? { state: 'unavailable' as const, reason: selected.graphAvailability.reason };
    if (index === 'current') this.dirtyContexts.delete(contextKey(context));
    let effectiveIndex = this.dirtyContexts.has(contextKey(context)) ? 'dirty' : index;
    if (effectiveIndex === 'current'
      && (selectedIntegrity.state === 'degraded' || selectedIntegrity.state === 'unverified')) {
      effectiveIndex = 'degraded';
    }
    return {
      context,
      index: effectiveIndex,
      readiness: readinessFromSnapshot(providerIndexStatus, effectiveIndex, context.worktreePath ?? context.cwd),
      freshnessEvidence: context.ref
        ? context.worktreePath ? 'git-head+provider-indexed-ref' : 'provider-ref-status'
        : 'provider-index-status',
      providerIndexStatus,
      refs,
      graphAvailability: selected.graphAvailability,
      graphIntegrity: selectedIntegrity,
      groupCoverage: {
        scope: 'registered-workspace',
        totalRepos: members.length,
        availableRepos: coverage.filter(repo => repo.available).length,
        currentRepos: coverage.filter(repo => repo.index === 'current').length,
        complete: members.length > 0 && coverage.every(repo => repo.index === 'current'),
        integrityAcceptedRepos: coverage.filter(repo => repo.integrity.state === 'accepted').length,
        integrityComplete: members.length > 0 && coverage.every(repo => repo.integrity.state === 'accepted'),
        repos: coverage,
      },
    };
  }

  async indexWorkspace(input: WorkspaceContextInput = {}): Promise<unknown> {
    this.assertCapability('workspaceRouting');
    await this.assertProviderMutationAllowed('index-workspace');
    const context = await this.resolveWorkspace(input);
    await this.assertRequestedRef(context, true);
    if (context.repo) {
      await this.graphIntegrity.authorizeIndex({
        group: context.group,
        repo: context.repo,
        ...(context.ref ? { ref: context.ref } : {}),
        repoPath: context.worktreePath ?? context.cwd,
      }).catch(error => {
        activityTracker.captureFailure(
          'CODE_INTELLIGENCE',
          error,
          'graph-integrity-index-authorization-failure',
          { workspace: context.group, repo: context.repo ?? '', ref: context.ref ?? '' },
        );
      });
    }
    await this.runtime.requestIndexFor(context.worktreePath ?? context.cwd, context.ref);
    this.dirtyContexts.add(contextKey(context));
    this.invalidateHealth();
    activityTracker.record(
      'CODE_INTELLIGENCE',
      'info',
      'Grafel workspace index requested',
      'workspace-index-requested',
      { workspace: context.group, ref: context.ref ?? '', repo: context.repo ?? '' },
    );
    return { context, requested: true, index: 'queued' };
  }

  async workspaceRefs(input: WorkspaceContextInput = {}): Promise<CodeWorkspaceRef[]> {
    this.assertCapability('refGraphs');
    const context = await this.resolveWorkspace(input);
    return this.runtime.refs(context.group);
  }

  async setWorkspaceRefPin(
    input: WorkspaceContextInput & {
      repo: string;
      targetRef: string;
      pinned: boolean;
    },
  ): Promise<unknown> {
    this.assertCapability('refGraphs');
    await this.assertProviderMutationAllowed('set-workspace-ref-pin');
    const context = await this.resolveWorkspace(input);
    const refs = await this.runtime.refs(context.group);
    const exact = refs.find(item =>
      String(item.group ?? context.group) === context.group
      && String(item.repo ?? '') === input.repo
      && String(item.ref ?? '') === input.targetRef);
    if (!exact) {
      throw new Error(`CODE_WORKSPACE_REF_NOT_FOUND: workspace=${context.group} repo=${input.repo} ref=${input.targetRef}`);
    }

    const pinReason = String(exact.pin_reason ?? '');
    if (!input.pinned && pinReason === 'main') {
      throw new Error(`CODE_WORKSPACE_DEFAULT_REF_PIN_PROTECTED: repo=${input.repo} ref=${input.targetRef}`);
    }
    if (input.pinned && exact.pinned === true) {
      return { context, changed: false, ref: exact, reason: pinReason || 'already-pinned' };
    }
    if (!input.pinned && exact.pinned !== true) {
      return { context, changed: false, ref: exact, reason: 'already-unpinned' };
    }

    const provider = input.pinned
      ? await this.runtime.pinRef(context.group, input.repo, input.targetRef)
      : await this.runtime.unpinRef(context.group, input.repo, input.targetRef);
    const after = await this.runtime.refs(context.group);
    const verified = after.find(item =>
      String(item.repo ?? '') === input.repo
      && String(item.ref ?? '') === input.targetRef);
    if (!verified || Boolean(verified.pinned) !== input.pinned) {
      throw new Error(`CODE_WORKSPACE_REF_PIN_VERIFY_FAILED: repo=${input.repo} ref=${input.targetRef}`);
    }

    activityTracker.record(
      'CODE_INTELLIGENCE',
      'success',
      input.pinned ? 'Grafel ref pinned' : 'Grafel ref unpinned',
      input.pinned ? 'workspace-ref-pinned' : 'workspace-ref-unpinned',
      { workspace: context.group, repo: input.repo, ref: input.targetRef },
    );
    return { context, changed: true, ref: verified, provider };
  }

  async pruneWorkspaceRefs(
    input: WorkspaceContextInput & {
      ttl?: string;
      apply?: boolean;
      confirmation?: string;
    },
  ): Promise<unknown> {
    this.assertCapability('refGraphs');
    const context = await this.resolveWorkspace(input);
    const apply = input.apply === true;
    if (apply) await this.assertProviderMutationAllowed('prune-workspace-refs');
    if (apply && input.confirmation !== 'PRUNE_EXPIRED_REFS') {
      throw new Error('CODE_WORKSPACE_PRUNE_CONFIRMATION_REQUIRED: confirmation=PRUNE_EXPIRED_REFS');
    }

    const before = await this.runtime.refs(context.group);
    const output = await this.runtime.pruneRefs(context.group, {
      ...(input.ttl ? { ttl: input.ttl } : {}),
      apply,
    });
    const after = await this.runtime.refs(context.group);
    if (apply) {
      activityTracker.record(
        'CODE_INTELLIGENCE',
        'success',
        'Grafel expired refs pruned',
        'workspace-refs-pruned',
        { workspace: context.group, before: before.length, after: after.length, ttl: input.ttl ?? '' },
      );
    }
    return {
      context,
      dryRun: !apply,
      beforeCount: before.length,
      afterCount: after.length,
      provider: output,
    };
  }

  async callProviderTool(
    name: string,
    args: Record<string, unknown> = {},
    options: {
      allowStale?: boolean;
      context?: WorkspaceContextInput;
    } = {},
  ): Promise<CallToolResult> {
    const health = await this.health();
    if (health.status === 'not-configured' || health.status === 'error' || health.daemon !== 'available') {
      throw new Error(`CODE_INTELLIGENCE_UNAVAILABLE: ${health.issue ?? health.status}`);
    }

    const context = await this.resolveWorkspace(options.context);
    await this.assertRequestedRef(context);
    const dirty = this.dirtyContexts.has(contextKey(context));
    let index: CodeIndexState = dirty ? 'dirty' : 'unknown';
    if (!dirty) index = await this.contextIndexState(context);

    if (!options.allowStale && index !== 'current') {
      throw new Error(
        `CODE_INTELLIGENCE_INDEX_NOT_CURRENT: workspace=${context.group} ref=${context.ref ?? '<default>'} state=${index}; use Agent Core search/read or request code_workspace(index)`,
      );
    }

    const effectiveRepoFilter = context.repoFilter?.length
      ? context.repoFilter
      : context.worktreePath && context.repo ? [context.repo] : undefined;
    const enriched = {
      ...args,
      group: context.group,
      cwd: context.cwd,
      ...(context.ref ? { ref: context.ref } : {}),
      ...(effectiveRepoFilter?.length && args.repo_filter === undefined ? { repo_filter: effectiveRepoFilter } : {}),
    };
    return this.client.callTool(name, enriched, { cwd: context.cwd });
  }

  async listRepairs(
    input: WorkspaceContextInput & { repoFilter?: string[]; limit?: number; offset?: number },
  ): Promise<CallToolResult> {
    this.assertCapability('repairs');
    if (input.ref && !input.worktreePath) {
      throw new Error('CODE_REPAIR_REF_REQUIRES_WORKTREE: Grafel v0.3.3 repair routing is cwd-scoped');
    }
    return this.callProviderTool('grafel_docgen_apply', {
      kind: 'repairs',
      action: 'list',
      ...(input.repoFilter?.length ? { repo_filter: input.repoFilter } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.offset !== undefined ? { offset: input.offset } : {}),
    }, {
      allowStale: true,
      context: input,
    });
  }

  async submitRepair(
    input: WorkspaceContextInput & {
      residualId: string;
      resolution: 'bind_to_entity' | 'reclassify_as_external' | 'reclassify_as_dynamic' | 'reclassify_as_resolved' | 'abandon';
      targetEntityId?: string;
      newTarget?: string;
      confidence?: number;
      module?: string;
      reasoning?: string;
      reason?: string;
      repo?: string;
    },
  ): Promise<CallToolResult> {
    this.assertCapability('repairs');
    if (input.ref && !input.worktreePath) {
      throw new Error('CODE_REPAIR_REF_REQUIRES_WORKTREE: Grafel v0.3.3 repair routing is cwd-scoped');
    }
    const context = await this.resolveWorkspace(input);
    const result = await this.callProviderTool('grafel_docgen_apply', {
      kind: 'repairs',
      action: 'submit',
      residual_id: input.residualId,
      resolution: input.resolution,
      source: 'agent-core-code-repair',
      ...(input.targetEntityId ? { target_entity_id: input.targetEntityId } : {}),
      ...(input.newTarget ? { new_target: input.newTarget } : {}),
      ...(input.module ? { module: input.module } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...((input.reasoning || input.reason) ? { reasoning: input.reasoning || input.reason } : {}),
      ...(input.resolution === 'reclassify_as_dynamic' && input.reasoning ? { dynamic_reason: input.reasoning } : {}),
      ...(input.reason ? { abandon_reason: input.reason } : {}),
      ...(input.repo ? { repo: input.repo } : {}),
    }, {
      allowStale: true,
      context: input,
    });
    if (!result.isError) {
      this.dirtyContexts.add(contextKey(context));
      this.invalidateHealth();
      activityTracker.record(
        'CODE_INTELLIGENCE',
        'success',
        'Grafel residual repair submitted',
        'repair-submitted',
        { workspace: context.group, ref: context.ref ?? '', resolution: input.resolution },
      );
    }
    return result;
  }

  async runFitness(input: WorkspaceContextInput & { repo?: string; strict?: boolean }): Promise<unknown> {
    this.assertCapability('fitness');
    if (input.ref && !input.worktreePath) {
      throw new Error('CODE_FITNESS_REF_REQUIRES_WORKTREE: Grafel v0.3.3 fitness is path/group scoped');
    }
    const context = await this.resolveWorkspace(input);
    await this.assertRequestedRef(context);
    const target = input.repo?.trim()
      || (context.ref && context.worktreePath ? context.worktreePath : context.group);
    const result = await this.runtime.fitness(target, input.strict === true, context.cwd);
    activityTracker.record(
      'CODE_INTELLIGENCE',
      result.violated ? 'info' : 'success',
      result.violated ? 'Grafel fitness violations observed' : 'Grafel fitness check completed',
      'fitness-check',
      { workspace: context.group, ref: context.ref ?? '', violated: result.violated, exitCode: result.exitCode },
    );
    return { context, ...result };
  }

  async quarantine(input: WorkspaceContextInput = {}): Promise<unknown> {
    this.assertCapability('quarantine');
    const context = await this.resolveWorkspace(input);
    const entries = await this.runtime.quarantine(context.group);
    activityTracker.record(
      'CODE_INTELLIGENCE',
      'success',
      'Grafel quarantine state observed',
      'quarantine-observed',
      { workspace: context.group, count: entries.length },
    );
    return { context, count: entries.length, entries };
  }

  async mutateQuarantine(
    input: WorkspaceContextInput & {
      action: 'remove' | 'pin' | 'unpin';
      repo: string;
      relativePath: string;
      confirmation: string;
    },
  ): Promise<unknown> {
    this.assertCapability('quarantine');
    await this.assertProviderMutationAllowed('mutate-quarantine');
    if (input.confirmation !== 'QUARANTINE_MUTATION') {
      throw new Error('CODE_QUARANTINE_CONFIRMATION_REQUIRED: confirmation=QUARANTINE_MUTATION');
    }

    const context = await this.resolveWorkspace(input);
    const workspaces = await this.runtime.listWorkspaces();
    const slugMatches = workspaces.flatMap(workspace =>
      workspace.repos
        .filter(repo => repo.slug === input.repo)
        .map(repo => ({ workspace: workspace.name, path: repo.path })));
    if (slugMatches.length !== 1 || slugMatches[0]!.workspace !== context.group) {
      throw new Error(`CODE_QUARANTINE_REPO_AMBIGUOUS: repo=${input.repo} matches=${slugMatches.length}`);
    }

    const before = await this.runtime.quarantine(context.group) as Array<Record<string, unknown>>;
    const exact = before.find(row =>
      String(row.repo ?? '') === input.repo
      && String(row.path ?? '') === input.relativePath);
    if (!exact) {
      throw new Error(`CODE_QUARANTINE_TARGET_NOT_FOUND: repo=${input.repo} path=${input.relativePath}`);
    }
    const pinnedBefore = exact.pinned === true;
    if (input.action === 'pin' && pinnedBefore) {
      return { context, changed: false, entry: exact, reason: 'already-pinned' };
    }
    if (input.action === 'unpin' && !pinnedBefore) {
      return { context, changed: false, entry: exact, reason: 'already-unpinned' };
    }

    const provider = await this.runtime.mutateQuarantine(input.action, input.repo, input.relativePath);
    const after = await this.runtime.quarantine(context.group) as Array<Record<string, unknown>>;
    const verified = after.find(row =>
      String(row.repo ?? '') === input.repo
      && String(row.path ?? '') === input.relativePath);
    const valid = input.action === 'remove'
      ? !verified
      : Boolean(verified?.pinned) === (input.action === 'pin');
    if (!valid) {
      throw new Error(`CODE_QUARANTINE_VERIFY_FAILED: action=${input.action} repo=${input.repo} path=${input.relativePath}`);
    }

    activityTracker.record(
      'CODE_INTELLIGENCE',
      'success',
      'Grafel quarantine mutation completed',
      'quarantine-mutated',
      { workspace: context.group, repo: input.repo, path: input.relativePath, action: input.action },
    );
    return { context, changed: true, action: input.action, entry: verified ?? null, provider };
  }

  async providerMetrics(
    input: WorkspaceContextInput & { days?: number; limit?: number } = {},
  ): Promise<unknown> {
    const context = await this.resolveWorkspace(input);
    const days = Math.min(30, Math.max(1, input.days ?? 1));
    const limit = Math.min(50, Math.max(1, input.limit ?? 20));
    const result = await this.callProviderTool(
      'grafel_mcp_metrics',
      { days },
      { allowStale: true, context: input },
    );
    const raw = parseCallToolResultJson(result) as Record<string, unknown> | null;
    if (!raw) throw new Error('CODE_PROVIDER_METRICS_INVALID_RESPONSE');

    const sessionRaw = raw.session && typeof raw.session === 'object'
      ? raw.session as Record<string, unknown>
      : {};
    const sessionTools = Array.isArray(sessionRaw.tools)
      ? sessionRaw.tools.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
      : [];
    const session = sessionTools
      .map(row => ({
        tool: String(row.tool ?? ''),
        calls: Number(row.calls ?? 0),
        errors: Number(row.errors ?? 0),
        errorPct: Number(row.error_pct ?? 0),
        p50Ms: Number(row.p50_ms ?? 0),
        p95Ms: Number(row.p95_ms ?? 0),
      }))
      .filter(row => row.tool)
      .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool))
      .slice(0, limit);

    const rollups = Array.isArray(raw.rollup_records)
      ? raw.rollup_records.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
      : [];
    const aggregate = new Map<string, { tool: string; calls: number; errors: number; records: number; maxObservedP50Ms: number; maxObservedP95Ms: number }>();
    for (const row of rollups) {
      const tool = String(row.tool ?? '');
      if (!tool) continue;
      const current = aggregate.get(tool) ?? {
        tool,
        calls: 0,
        errors: 0,
        records: 0,
        maxObservedP50Ms: 0,
        maxObservedP95Ms: 0,
      };
      current.calls += Number(row.calls ?? 0) || 0;
      current.errors += Number(row.errors ?? 0) || 0;
      current.records += 1;
      current.maxObservedP50Ms = Math.max(current.maxObservedP50Ms, Number(row.p50_ms ?? 0) || 0);
      current.maxObservedP95Ms = Math.max(current.maxObservedP95Ms, Number(row.p95_ms ?? 0) || 0);
      aggregate.set(tool, current);
    }

    return {
      context,
      days,
      session: {
        uptimeSeconds: Number(sessionRaw.uptime_seconds ?? 0) || 0,
        totalCalls: Number(sessionRaw.total_calls ?? 0) || 0,
        totalErrors: Number(sessionRaw.total_errors ?? 0) || 0,
        tools: session,
      },
      rollup: {
        recordsConsidered: rollups.length,
        tools: [...aggregate.values()]
          .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool))
          .slice(0, limit),
      },
    };
  }

  private async sourceRepresentation(context: CodeWorkspaceContext): Promise<unknown> {
    if (!context.repo) {
      return {
        state: 'unavailable',
        basis: 'git-files',
        reason: 'repository-not-resolved',
      };
    }
    const repoRoot = context.worktreePath ?? context.cwd;
    return collectSourceRepresentation({
      root: repoRoot,
      probe: async relativePath => {
        try {
          const response = await this.client.callTool('grafel_find', {
            query: relativePath,
            search: 'substring',
            fields: ['source_file'],
            limit: 6,
            repo_filter: [context.repo!],
            group: context.group,
            cwd: context.cwd,
            ...(context.ref ? { ref: context.ref } : {}),
          }, { cwd: context.cwd });
          if (response.isError) return 'unknown' as const;
          const payload = parseCallToolResultJson(response) as Record<string, unknown> | null;
          const rows = payload && Array.isArray(payload.results)
            ? payload.results.filter(Boolean) as Array<Record<string, unknown>>
            : [];
          const target = normalizeFsPath(relativePath);
          return rows.some(row => typeof row.source_file === 'string'
            && normalizeFsPath(row.source_file) === target);
        } catch {
          return 'unknown' as const;
        }
      },
    });
  }

  async diagnostics(input: WorkspaceContextInput = {}): Promise<unknown> {
    this.assertCapability('diagnostics');
    const context = await this.resolveWorkspace(input);
    const [health, registry, refs, quarantine, providerMetadata, providerAttestation, sourceRepresentation] = await Promise.all([
      this.workspaceStatus(input),
      this.runtime.registryDiagnostics(),
      this.providerCapabilities.refGraphs ? this.runtime.refs(context.group) : Promise.resolve([]),
      this.providerCapabilities.quarantine ? this.runtime.quarantine(context.group) : Promise.resolve([]),
      this.runtime.providerMetadata(),
      this.runtime.providerAttestation(),
      this.sourceRepresentation(context),
    ]);
    const result = {
      provider: 'grafel',
      providerVersion: this.providerVersion,
      providerWireVersion: this.providerWireVersion,
      providerWireCompatible: !this.providerWireIssue,
      providerWireIssue: this.providerWireIssue,
      capabilities: this.capabilities(),
      context,
      health,
      registry: {
        readable: registry.registryReadable,
        workspaceCount: registry.workspaces.length,
        workspaces: registry.workspaces,
      },
      refCount: refs.length,
      refs,
      quarantineCount: quarantine.length,
      isolation: {
        ...this.runtime.isolationStatus(),
        runtimeDir: this.config.runtimeDir,
        globalInstallUsed: false,
        externalHostMutationUsed: false,
        gitHooksManagedByAgentCore: false,
      },
      resourcePolicy: this.runtime.resourcePolicy(),
      providerArtifact: providerMetadata,
      providerAttestation,
      sourceRepresentation,
    };
    activityTracker.record(
      'CODE_INTELLIGENCE',
      'success',
      'Grafel provider diagnostics completed',
      'provider-diagnostics',
      { workspace: context.group, ref: context.ref ?? '', quarantineCount: quarantine.length },
    );
    return result;
  }

  async close(): Promise<void> {
    this.healthClosed = true;
    this.invalidateHealth();
    this.lastHealth = this.unavailableHealth('CODE_INTELLIGENCE_CLOSED');
    await this.client.close().catch(() => undefined);
    if (!this.config.enabled) return;
    await this.runtime.stop().catch(error => {
      activityTracker.captureFailure('CODE_INTELLIGENCE', error, 'grafel-stop-failure');
    });
    activityTracker.record('CODE_INTELLIGENCE', 'info', 'Grafel provider stopped', 'provider-stop');
  }

  private assertCapability(capability: keyof Omit<CodeProviderCapabilities, 'toolNames' | 'issues'>): void {
    if (!this.providerCapabilities[capability]) {
      throw new Error(`CODE_INTELLIGENCE_CAPABILITY_UNAVAILABLE: ${capability}`);
    }
  }

  private async callReadOnlyProviderTool(
    name: 'grafel_index_status' | 'grafel_orient',
    args: Record<string, unknown>,
    context: { cwd: string },
  ): Promise<CallToolResult> {
    try {
      const result = await this.client.callTool(name, args, context);
      if (!result.isError) return result;
    } catch {
      // The Grafel client resets itself on thrown transport failures.
    }
    activityTracker.record(
      'CODE_INTELLIGENCE',
      'info',
      'Retrying read-only Grafel provider probe after stale bridge failure',
      'provider-read-probe-retry',
      { tool: name, retry: 1 },
    );
    await this.client.close().catch(() => undefined);
    return this.client.callTool(name, args, context);
  }

  private async providerIndexSnapshot(context: CodeWorkspaceContext): Promise<ProviderIndexSnapshot> {
    try {
      const result = await this.callReadOnlyProviderTool('grafel_index_status', {
        group: context.group,
        cwd: context.cwd,
      }, { cwd: context.cwd });
      return parseIndexSnapshot(result);
    } catch {
      return { repos: [] };
    }
  }

  private async graphLoadEvidence(
    context: CodeWorkspaceContext,
    repos: string[],
  ): Promise<Map<string, GraphStructuralEvidence>> {
    const result = new Map<string, GraphStructuralEvidence>(
      repos.map(repo => [repo, { available: false, reason: 'graph-not-reported' }]),
    );
    if (!repos.length) return result;
    try {
      // This canonical read actually loads graph data; a status sidecar alone
      // is not evidence that the exact repository has a usable graph.
      const response = await this.callReadOnlyProviderTool('grafel_orient', {
        view: 'stats', group: context.group, cwd: context.cwd,
        repo_filter: repos, ...(context.ref ? { ref: context.ref } : {}),
      }, { cwd: context.cwd });
      const parsed = parseCallToolResultJson(response) as {
        repos?: Array<{ repo?: unknown; entities?: unknown; relationships?: unknown }>;
        unavailable?: unknown[];
      } | null;
      if (!parsed || !Array.isArray(parsed.repos)) throw new Error('invalid graph-load reply');
      for (const repo of repos) {
        const rows = parsed.repos.filter(row => row && row.repo === repo);
        const failed = Array.isArray(parsed.unavailable)
          && parsed.unavailable.some(value => typeof value === 'string' && value.startsWith(`${repo}:`));
        const row = rows.length === 1 ? rows[0] : undefined;
        const loaded = !failed && Boolean(row
          && Number.isSafeInteger(row.entities) && Number(row.entities) >= 0
          && Number.isSafeInteger(row.relationships) && Number(row.relationships) >= 0);
        result.set(repo, loaded
          ? {
              available: true,
              reason: 'provider-graph-loaded',
              entities: Number(row!.entities),
              relationships: Number(row!.relationships),
            }
          : { available: false, reason: 'graph-unavailable' });
      }
    } catch {
      for (const repo of repos) result.set(repo, { available: false, reason: 'graph-load-probe-failed' });
    }
    return result;
  }

  private contextGraphEvidence(
    context: CodeWorkspaceContext,
    snapshot: ProviderIndexSnapshot,
    refs: CodeWorkspaceRef[],
    graphs: Map<string, GraphStructuralEvidence>,
  ): { index: CodeIndexState; graphAvailability: GraphStructuralEvidence } {
    const repoPath = context.worktreePath ?? context.cwd;
    const state = indexStateFromSnapshot(snapshot, repoPath);
    let graphAvailability = graphs.get(context.repo ?? '')
      ?? { available: false, reason: 'repository-not-reported' };
    const exactRef = refs.some(row => row.repo === context.repo
      && (row.group === undefined || row.group === context.group)
      && (context.ref === undefined || row.ref === context.ref));
    if (graphAvailability.available && this.providerCapabilities.refGraphs && !exactRef) {
      graphAvailability = { available: false, reason: 'exact-repository-ref-unavailable' };
    }
    if (context.ref) {
      const row = snapshot.repos.find(item => item.repo && normalizeFsPath(item.repo) === normalizeFsPath(repoPath));
      if (!context.worktreePath || !row || row.indexed_ref !== context.ref || !row.indexed_commit) {
        return { index: 'unknown', graphAvailability: { available: false, reason: 'indexed-ref-unproven' } };
      }
    }
    return { index: state === 'current' && !graphAvailability.available ? 'unknown' : state, graphAvailability };
  }

  private async contextIndexState(context: CodeWorkspaceContext): Promise<CodeIndexState> {
    const snapshot = await this.providerIndexSnapshot(context);
    const state = indexStateFromSnapshot(snapshot, context.worktreePath ?? context.cwd);
    if (state !== 'current') return state;
    const [refs, graphs] = await Promise.all([
      this.providerCapabilities.refGraphs ? this.runtime.refs(context.group).catch(() => []) : Promise.resolve([]),
      this.graphLoadEvidence(context, context.repo ? [context.repo] : []),
    ]);
    return this.contextGraphEvidence(context, snapshot, refs, graphs).index;
  }

  async assertRequestedRef(context: CodeWorkspaceContext, allowMissingForIndex = false): Promise<void> {
    if (!context.ref) return;
    this.assertCapability('refGraphs');

    if (context.worktreePath) {
      const actualRef = await this.workspaceResolver.currentGitRef(context.worktreePath);
      if (actualRef !== context.ref) {
        throw new Error(`CODE_INTELLIGENCE_REF_MISMATCH: requested=${context.ref} worktreeHead=${actualRef ?? '<detached>'}`);
      }
      return;
    }

    const refs = await this.runtime.refs(context.group);
    const exact = refs.some(item => item.repo === context.repo
      && (item.group === undefined || item.group === context.group)
      && String(item.ref ?? '') === context.ref);
    if (!exact && !allowMissingForIndex) {
      throw new Error(`CODE_INTELLIGENCE_REF_NOT_AVAILABLE: workspace=${context.group} ref=${context.ref}`);
    }
  }

  private async refreshProviderWireCompatibility(): Promise<void> {
    try {
      const result = await this.client.callTool(
        'grafel_orient',
        { view: 'me', group: this.config.group },
        { cwd: this.config.projectRoot },
      );
      const parsed = parseCallToolResultJson(result) as Record<string, unknown> | null;
      const version = typeof parsed?.wire_version === 'string' ? parsed.wire_version.trim() : '';
      this.providerWireVersion = version || undefined;
      this.providerWireIssue = !version
        ? 'GRAFEL_WIRE_VERSION_MISSING'
        : isSupportedGrafelWireVersion(version)
          ? undefined
          : `GRAFEL_WIRE_VERSION_UNSUPPORTED: ${version}`;
    } catch (error) {
      this.providerWireVersion = undefined;
      this.providerWireIssue = `GRAFEL_WIRE_VERSION_PROBE_FAILED: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private publishBootstrapHealth(health: CodeIntelligenceHealth): void {
    if (this.healthClosed) return;
    this.invalidateHealth();
    this.lastHealth = health;
    this.lastHealthAt = Date.now();
  }

  private async bootstrap(): Promise<void> {
    if (!this.config.enabled || this.healthClosed) return;
    this.invalidateHealth();
    try {
      const isolation = this.runtime.isolationStatus();
      if (!isolation.ok) {
        throw new Error(`CODE_INTELLIGENCE_ISOLATION_INVALID: ${isolation.missingOrInvalid.join(', ')}`);
      }
      if (!await this.runtime.isConfigured()) {
        this.publishBootstrapHealth({
          status: 'not-configured',
          provider: 'grafel',
          daemon: 'unavailable',
          index: 'unknown',
          group: this.config.group,
          issueCount: 1,
          issue: 'project-local grafel.exe is missing',
        });
        return;
      }

      await this.runtime.ensureLayout();
      await this.assertProviderMutationAllowed('bootstrap');
      this.providerVersion = await this.runtime.version();
      const portabilityReindex = await readPortabilityReindexRequest(this.config.projectRoot);
      const registrationChanged = await this.runtime.registerProject();
      let runtimeStarted = false;
      if (registrationChanged || portabilityReindex) {
        // Registration repair can invalidate process ownership, but graph
        // materialization must not block Agent Core startup. Restart only the
        // isolated provider here; freshness is evaluated below and any required
        // indexing is requested asynchronously.
        await this.client.close().catch(() => undefined);
        await this.runtime.stop().catch(() => undefined);
        await this.runtime.start();
        runtimeStarted = true;
      }
      if (!runtimeStarted) await this.runtime.start();
      await this.waitForProviderReadiness();
      const [tools, cliProbe] = await Promise.all([
        this.client.listToolNames(),
        this.runtime.probeCliCapabilities(),
      ]);
      this.cliCapabilities = cliProbe;
      this.providerCapabilities = deriveProviderCapabilities(tools, this.cliCapabilities);
      const missing = GRAFEL_CORE_TOOLS.filter(name => !tools.includes(name));
      if (missing.length > 0) throw new Error(`GRAFEL_CORE_TOOL_MISMATCH: ${missing.join(', ')}`);
      await this.refreshProviderWireCompatibility();

      const health = await this.health(true);
      if (this.healthClosed) return;
      if (portabilityReindex && health.index === 'current') {
        // Clear relocation evidence only after the normal provider health path
        // proves the exact active root has a current graph.
        await clearPortabilityReindexRequest(this.config.projectRoot);
        activityTracker.record(
          'CODE_INTELLIGENCE',
          'success',
          'Grafel project relocation/registration verified on the active root',
          'provider-registration-repair',
          {
            group: this.config.group,
            registrationChanged,
            portabilityReason: portabilityReindex.reason,
          },
        );
      }
      if (health.index !== 'current') {
        await this.assertProviderMutationAllowed('bootstrap-index-refresh');
        await this.runtime.requestIndex();
        const refreshIndex = health.index === 'unknown' ? 'queued' : health.index;
        this.publishBootstrapHealth(health.status === 'available'
          ? { ...health, index: refreshIndex, issueCount: 0 }
          : {
              ...health,
              status: 'degraded',
              index: refreshIndex,
              issueCount: 1,
              issue: 'Grafel index is not current; asynchronous refresh requested',
            });
      }

      activityTracker.record(
        'CODE_INTELLIGENCE',
        this.lastHealth.status === 'available' ? 'success' : 'info',
        'Grafel code-intelligence provider initialized',
        'provider-start',
        {
          provider: 'grafel',
          providerVersion: this.providerVersion ?? '',
          index: this.lastHealth.index,
          group: this.config.group,
          optionalIssueCount: this.providerCapabilities.issues.length,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.publishBootstrapHealth({
        status: 'error',
        provider: 'grafel',
        providerVersion: this.providerVersion,
        daemon: 'unavailable',
        index: 'unknown',
        group: this.config.group,
        issueCount: 1,
        issue: message,
      });
      activityTracker.captureFailure('CODE_INTELLIGENCE', error, 'provider-start-failure', {
        provider: 'grafel',
        group: this.config.group,
      });
    }
  }

  private async waitForProviderReadiness(): Promise<void> {
    const deadline = Date.now() + Math.min(this.config.startupTimeoutMs, 10_000);
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const payload = await this.runtime.status();
        if (String(payload.status ?? '').toLowerCase() === 'ok') return;
      } catch (error) {
        lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (lastError) throw lastError;
  }

  private async collectHealth(generation: number): Promise<CodeIntelligenceHealth> {
    try {
      const payload = await this.runtime.status();
      if (this.healthClosed || generation !== this.healthGeneration) return this.unavailableHealth('CODE_INTELLIGENCE_HEALTH_SUPERSEDED');
      const isolation = this.runtime.isolationStatus();
      const daemonAvailable = String(payload.status ?? '').toLowerCase() === 'ok';
      let index = this.runtime.indexState(payload);
      let activeGraphAvailable = false;
      let graphIntegrity: GraphIntegrityObservation | undefined;
      let snapshot: ProviderIndexSnapshot = {
        repos: [],
        any_indexing: payload.indexing,
        busy: payload.busy,
        warming: payload.warming,
        pending_algo: payload.pending_algo ?? payload.pending_algorithms ?? payload.group_algo_pending,
        pending_links: payload.pending_links ?? payload.links_pending,
      };
      if (daemonAvailable) {
        try {
          const providerStatus = await this.callReadOnlyProviderTool(
            'grafel_index_status',
            { group: this.config.group, cwd: this.config.projectRoot },
            { cwd: this.config.projectRoot },
          );
          if (this.healthClosed || generation !== this.healthGeneration) return this.unavailableHealth('CODE_INTELLIGENCE_HEALTH_SUPERSEDED');
          const parsed = parseIndexSnapshot(providerStatus);
          snapshot = {
            ...snapshot,
            ...parsed,
            any_indexing: parsed.any_indexing ?? snapshot.any_indexing,
            busy: parsed.busy ?? snapshot.busy,
            warming: parsed.warming ?? snapshot.warming,
          };
          index = indexStateFromSnapshot(snapshot, this.config.projectRoot);
          if (index === 'current' || index === 'queued' || index === 'indexing' || index === 'warming') {
            const context: CodeWorkspaceContext = {
              workspace: this.config.group, group: this.config.group,
              cwd: this.config.projectRoot, repo: this.config.repoSlug,
            };
            const [refs, graphs] = await Promise.all([
              this.providerCapabilities.refGraphs ? this.runtime.refs(this.config.group).catch(() => []) : Promise.resolve([]),
              this.graphLoadEvidence(context, [this.config.repoSlug]),
            ]);
            const graphEvidence = this.contextGraphEvidence(context, snapshot, refs, graphs);
            activeGraphAvailable = graphEvidence.graphAvailability.available;
            if (index === 'current') index = graphEvidence.index;
            if (index === 'current' && graphEvidence.graphAvailability.available) {
              graphIntegrity = await this.graphIntegrity.observe({
                group: context.group,
                repo: this.config.repoSlug,
                repoPath: this.config.projectRoot,
                evidence: graphEvidence.graphAvailability,
              }).catch(error => ({
                state: 'unavailable' as const,
                reason: `observer-failure: ${error instanceof Error ? error.message : String(error)}`,
              }));
              if (graphIntegrity.state === 'degraded' || graphIntegrity.state === 'unverified') {
                index = 'degraded';
              }
            }
          }
        } catch {
          index = 'unknown';
        }
      }
      if (index === 'current') {
        const stalePortabilityMarker = await readPortabilityReindexRequest(this.config.projectRoot);
        if (stalePortabilityMarker) {
          try {
            await clearPortabilityReindexRequest(this.config.projectRoot);
            activityTracker.record(
              'CODE_INTELLIGENCE',
              'success',
              'Cleared converged Grafel portability reindex marker',
              'provider-portability-marker-cleared',
              { reason: stalePortabilityMarker.reason, group: this.config.group },
            );
          } catch (error) {
            activityTracker.captureFailure(
              'CODE_INTELLIGENCE',
              error,
              'provider-portability-marker-clear-failure',
              { reason: stalePortabilityMarker.reason, group: this.config.group },
            );
          }
        }
      }

      const wireCompatible = !this.providerWireIssue;
      const providerAttestation = await this.runtime.providerAttestation(payload);
      const attestationMismatch = providerAttestation.state === 'metadata-mismatch'
        || providerAttestation.state === 'resident-mismatch';
      const refreshInProgress = index === 'queued' || index === 'indexing' || index === 'warming';
      const usableDuringRefresh = refreshInProgress && activeGraphAvailable;
      const available = daemonAvailable && isolation.ok && (index === 'current' || usableDuringRefresh)
        && wireCompatible && !attestationMismatch;
      const health: CodeIntelligenceHealth = {
        status: available ? 'available' : 'degraded',
        provider: 'grafel',
        providerVersion: payload.version ?? this.providerVersion,
        providerWireVersion: this.providerWireVersion,
        providerWireCompatible: wireCompatible,
        daemon: daemonAvailable ? 'available' : 'unavailable',
        index,
        group: this.config.group,
        readiness: readinessFromSnapshot(snapshot, index, this.config.projectRoot),
        resourcePolicy: this.runtime.resourcePolicy(),
        isolation,
        providerAttestation,
        ...(graphIntegrity ? { graphIntegrity } : {}),
        issueCount: available ? 0 : 1,
        ...(available
          ? {}
          : {
              issue: !daemonAvailable
                ? 'Grafel daemon is unavailable'
                : !isolation.ok
                  ? `Grafel isolation invalid: ${isolation.missingOrInvalid.join(', ')}`
                  : attestationMismatch
                    ? `Grafel provider attestation mismatch: ${providerAttestation.issue ?? providerAttestation.state}`
                    : graphIntegrity && (graphIntegrity.state === 'degraded' || graphIntegrity.state === 'unverified')
                      ? `Grafel graph integrity ${graphIntegrity.state}: ${graphIntegrity.reason}`
                      : this.providerWireIssue
                        ?? (refreshInProgress && !activeGraphAvailable
                          ? `Grafel index state is ${index}; no usable graph is loaded yet`
                          : `Grafel index state is ${index}`),
            }),
      };
      return health;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const health: CodeIntelligenceHealth = {
        status: 'error',
        provider: 'grafel',
        providerVersion: this.providerVersion,
        providerWireVersion: this.providerWireVersion,
        providerWireCompatible: !this.providerWireIssue,
        daemon: 'unavailable',
        index: 'unknown',
        group: this.config.group,
        resourcePolicy: this.runtime.resourcePolicy(),
        isolation: this.runtime.isolationStatus(),
        issueCount: 1,
        issue: message,
      };
      return health;
    }
  }
}
