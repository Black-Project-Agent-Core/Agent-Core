export type CodeIntelligenceStatus = 'available' | 'degraded' | 'not-configured' | 'error';
export type CodeIndexState = 'current' | 'queued' | 'indexing' | 'warming' | 'dirty' | 'degraded' | 'unknown';

export interface CodeIntelligenceResourcePolicy {
  maxRssBudgetMb?: number;
  reloadDebounceMs?: number;
  bm25IdleMs?: number;
  groupIdleMs?: number;
  groupKeepReader?: boolean;
  groupRssBudgetMb?: number;
  groupAlgoDebounce?: string;
}

export interface CodeIntelligenceConfig {
  enabled: boolean;
  projectRoot: string;
  runtimeDir: string;
  binaryPath: string;
  group: string;
  repoSlug: string;
  startupTimeoutMs: number;
  callTimeoutMs: number;
  resourcePolicy?: CodeIntelligenceResourcePolicy;
}

export interface CodeProviderCapabilities {
  coreNavigation: boolean;
  workspaceRouting: boolean;
  refGraphs: boolean;
  repairs: boolean;
  fitness: boolean;
  diagnostics: boolean;
  quarantine: boolean;
  patterns: boolean;
  messaging: boolean;
  graphPatterns: boolean;
  crossLinkCandidates: boolean;
  enrichmentCandidates: boolean;
  dynamicToolRefresh: boolean;
  toolNames: string[];
  issues: string[];
}

export interface CodeWorkspaceRepo {
  slug: string;
  path: string;
  stack?: string[];
}

export interface CodeWorkspaceRecord {
  name: string;
  repos: CodeWorkspaceRepo[];
  features?: {
    watchers?: boolean;
    git_hooks?: boolean;
    track_worktrees?: boolean;
  };
}

export interface CodeWorkspaceContext {
  workspace: string;
  group: string;
  cwd: string;
  ref?: string;
  worktreePath?: string;
  repo?: string;
  repoFilter?: string[];
}

export interface CodeWorkspaceRef {
  group?: string;
  repo?: string;
  ref?: string;
  tier?: string;
  idle?: string;
  size_bytes?: number;
  size?: string;
  pinned?: boolean;
  pin_reason?: string;
  state_dir?: string;
  last_seen?: string;
}

export interface CodeProviderReadiness {
  state: CodeIndexState;
  indexing: boolean;
  warming: boolean;
  busy: boolean;
  pendingAlgorithms: number;
  pendingLinks: number;
  indexedRef?: string;
  indexedCommit?: string;
}

export interface CodeIsolationHealth {
  ok: boolean;
  missingOrInvalid: string[];
}

export interface CodeIntelligenceHealth {
  status: CodeIntelligenceStatus;
  provider: 'grafel';
  providerVersion?: string;
  providerWireVersion?: string;
  providerWireCompatible?: boolean;
  daemon: 'available' | 'unavailable';
  index: CodeIndexState;
  group: string;
  issueCount: number;
  issue?: string;
  readiness?: CodeProviderReadiness;
  resourcePolicy?: CodeIntelligenceResourcePolicy;
  isolation?: CodeIsolationHealth;
}

export interface GrafelStatusPayload {
  status?: string;
  state?: string;
  indexing?: boolean;
  warming?: boolean;
  busy?: boolean;
  version?: string;
  repo_path?: string;
  indexed_ref?: string;
  indexed_commit?: string;
  entities?: number;
  relationships?: number;
  pending_algo?: number;
  pending_algorithms?: number;
  pending_links?: number;
  group_algo_pending?: number;
  links_pending?: number;
  engine_busy_started_at?: string;
}

export interface GrafelCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
