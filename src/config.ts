import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { resolvePersistencePaths, resolveRecoveryPersistencePaths } from './runtime/persistence-paths.js';
import { resolveFileNativeMemoryPaths, resolvePathInsideProject, type FileNativeMemoryPaths } from './memory/file-native/paths.js';

export interface MemoryScoreWeights {
  lexical: number;
  exact: number;
  graph: number;
  state: number;
  importance: number;
  recency: number;
}

export interface MemoryRemoteConfig {
  enabled: boolean;
  owner: string | null;
  repo: string | null;
  branch: string;
  keyFile: string | null;
  workRoot: string;
  syncTimeoutMs: number;
  maxRetryAttempts: number;
}


export interface MemorySupabaseSecondConfig {
  enabled: boolean;
  url: string | null;
  publishableKey: string | null;
  mirrorId: string;
  signingKeyFile: string | null;
  encryptionKeyFile: string | null;
  timeoutMs: number;
  retentionMs: number;
}

export interface MemorySupabaseDirectConfig {
  enabled: boolean;
  url: string | null;
  secretKey: string | null;
  timeoutMs: number;
}

export type MemoryHardLifecycleMode = 'disabled' | 'advisory' | 'enforce';

export interface MemoryFileNativeConfig extends FileNativeMemoryPaths {
  rgPath: string | null;
  pythonPath: string | null;
  graphifyPath: string | null;
}

export interface MemoryConfig {
  enabled: boolean;
  principalId: string | null;
  enforceHardGuardrails: boolean;
  hardLifecycleMode: MemoryHardLifecycleMode;
  fileNative: MemoryFileNativeConfig;
  seedCap: number;
  graphNodeCap: number;
  graphEdgeCap: number;
  graphMaxHops: number;
  pprDamping: number;
  pprEpsilon: number;
  pprMaxIterations: number;
  recallItemBudget: number;
  recallCharacterBudget: number;
  tokenOverlapJaccardThreshold: number;
  temporalNeighborWindowMs: number;
  archiveObservationAfterMs: number;
  tombstoneRetentionMs: number;
  scoreWeights: MemoryScoreWeights;
  remote: MemoryRemoteConfig;
  supabaseSecond: MemorySupabaseSecondConfig;
  supabaseDirect: MemorySupabaseDirectConfig;
}

export interface ExecutionResourceGovernanceConfig {
  enabled: boolean;
  minimumConcurrency: number;
  cpuWarningRatio: number;
  cpuCriticalRatio: number;
  memoryWarningRatio: number;
  memoryCriticalRatio: number;
  storageWarningFreeRatio: number;
  storageCriticalFreeRatio: number;
  auditWarningRatio: number;
  auditCriticalRatio: number;
  telemetryWarningRatio: number;
  telemetryCriticalRatio: number;
  queuedSyncWarning: number;
  queuedSyncCritical: number;
}

export interface ExecutionConfig {
  enabled: boolean;
  stateRoot: string;
  logRoot: string;
  maxConcurrency: number;
  maxNodes: number;
  maxOutputBytes: number;
  waitMaxMs: number;
  lockTimeoutMs: number;
  resourceGovernance: ExecutionResourceGovernanceConfig;
}

export interface AuditObservabilityConfig {
  queueCapacity: number;
  maxFileBytes: number;
  maxRotatedFiles: number;
  retentionMs: number;
}

export interface OtlpObservabilityConfig {
  enabled: boolean;
  endpoint: string | null;
  timeoutMs: number;
  maxQueue: number;
  exportIntervalMs: number;
}

export interface ObservabilityConfig {
  audit: AuditObservabilityConfig;
  otlp: OtlpObservabilityConfig;
}

export interface MaintenanceConfig {
  enabled: boolean;
  intervalMs: number;
  retentionOlderThanMs: number;
  retentionPlanRoot: string;
}

export interface GitHubConfig {
  enabled: boolean;
  apiBaseUrl: string;
  apiVersion: string;
  tokenFile: string;
  packagesTokenFile: string;
  useGhCliCredential: boolean;
  ghCliPath: string | null;
  requestTimeoutMs: number;
  gitTimeoutMs: number;
}

export interface LangflowConfig {
  enabled: boolean;
  baseUrl: string;
  apiKeyFile: string | null;
  requestTimeoutMs: number;
}

export interface OperatorDirectiveConfig {
  enabled: boolean;
  stateRoot: string;
  lockTimeoutMs: number;
  stateVersion: 1;
}

export interface HttpSecurityConfig {
  publicBaseUrl: string | null;
  protectedResourceUrl?: string | null;
  trustProxy: boolean;
  allowedOrigins: string[];
}

export type McpProtocolMode = 'dual' | 'legacy';

export interface McpConfig {
  protocolMode: McpProtocolMode;
}

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  logDir: string;
  capabilityDir: string;
  allowedRoots: string[];
  httpSecurity: HttpSecurityConfig;
  mcp: McpConfig;
  observability: ObservabilityConfig;
  memory: MemoryConfig;
  execution: ExecutionConfig;
  maintenance: MaintenanceConfig;
  github: GitHubConfig;
  langflow: LangflowConfig;
  operatorDirectives: OperatorDirectiveConfig;
}

type Env = Record<string, string | undefined>;

export function resolveRuntimeProjectRoot(env: Env = process.env, cwd = process.cwd()): string {
  const configured = env.AGENT_CORE_HOME?.trim();
  return path.resolve(configured || cwd);
}

function readProjectEnv(projectRoot: string): Env {
  const envPath = path.join(projectRoot, '.env');
  let text: string;
  try { text = readFileSync(envPath, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const candidate = line.startsWith('export ') ? line.slice(7).trim() : line;
    if (/^AGENT_CORE_[A-Za-z0-9_]*$/.test(candidate)) throw new Error(`AGENT_CORE_ENV_INVALID:${envPath}`);
  }
  return parseEnv(text) as Env;
}

export function loadRuntimeConfig(env: Env = process.env, cwd = process.cwd()): AppConfig {
  const projectRoot = resolveRuntimeProjectRoot(env, cwd);
  return loadConfig({ ...readProjectEnv(projectRoot), ...env }, projectRoot);
}

/**
 * Storage selection for identity repair commands. Keeps every manifest and redirection
 * check, but does not require the credential snapshot the repair itself has to rebuild.
 */
export function loadRecoveryPaths(env: Env = process.env, cwd = process.cwd()): { dataDir: string; logDir: string } {
  const projectRoot = resolveRuntimeProjectRoot(env, cwd);
  return resolveRecoveryPersistencePaths({ ...readProjectEnv(projectRoot), ...env }, projectRoot);
}

function parseRoots(value: string | undefined, baseDir: string): string[] {
  if (!value?.trim()) return [path.resolve(baseDir)];
  const roots = value.split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
  return roots.length ? [...new Set(roots)] : [path.resolve(baseDir)];
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}


function parseMemoryHardLifecycleMode(value: string | undefined): MemoryHardLifecycleMode {
  const normalized = value?.trim().toLowerCase() || 'enforce';
  if (normalized === 'disabled' || normalized === 'advisory' || normalized === 'enforce') return normalized;
  throw new Error('AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE must be disabled, advisory, or enforce');
}

function parseMcpProtocolMode(value: string | undefined): McpProtocolMode {
  const normalized = value?.trim().toLowerCase() || 'dual';
  if (normalized === 'dual' || normalized === 'legacy') return normalized;
  throw new Error('AGENT_CORE_MCP_PROTOCOL_MODE must be dual or legacy');
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseBoundedPositiveInteger(value: string | undefined, fallback: number, name: string, max: number): number {
  const parsed = parsePositiveInteger(value, fallback, name);
  if (parsed > max) throw new Error(`${name} must be between 1 and ${max}`);
  return parsed;
}

function parseUnitInterval(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) throw new Error(`${name} must be between 0 and 1`);
  return parsed;
}

function parsePositiveNumber(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be positive`);
  return parsed;
}

function parsePublicBaseUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('AGENT_CORE_PUBLIC_BASE_URL must be a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AGENT_CORE_PUBLIC_BASE_URL must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('AGENT_CORE_PUBLIC_BASE_URL must not include credentials');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('AGENT_CORE_PUBLIC_BASE_URL must be an origin without a path, query, or fragment');
  }
  return parsed.origin;
}

function parseOAuthProtectedResourceUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL must be a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL must not include credentials');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL must not include query or fragment');
  }
  return parsed.toString().replace(/\/$/, parsed.pathname === '/' ? '/' : '');
}

function normalizeAllowedOriginHostname(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error('AGENT_CORE_MCP_ALLOWED_ORIGINS contains an invalid origin');
  try {
    const parsed = raw.includes('://') ? new URL(raw) : new URL(`http://${raw}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('scheme');
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('shape');
    return parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    throw new Error('AGENT_CORE_MCP_ALLOWED_ORIGINS contains an invalid origin');
  }
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const normalized = value.split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeAllowedOriginHostname);
  return [...new Set(normalized)];
}

function loopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') return true;
  if (!/^127(?:\.\d{1,3}){3}$/.test(normalized)) return false;
  return normalized.split('.').every((part) => {
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

function parseOtlpEndpoint(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw new Error('AGENT_CORE_OTLP_ENDPOINT must be a valid URL'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AGENT_CORE_OTLP_ENDPOINT must use http or https');
  }
  if (parsed.username || parsed.password) throw new Error('AGENT_CORE_OTLP_ENDPOINT must not include credentials');
  if (parsed.search || parsed.hash) throw new Error('AGENT_CORE_OTLP_ENDPOINT must not include query or fragment');
  if (!loopbackHostname(parsed.hostname)) throw new Error('AGENT_CORE_OTLP_ENDPOINT must use a loopback hostname');
  const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/g, '');
  return `${parsed.origin}${pathname}`;
}

function parseLangflowBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || 'http://127.0.0.1:7860';
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw new Error('AGENT_CORE_LANGFLOW_BASE_URL must be a valid URL'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AGENT_CORE_LANGFLOW_BASE_URL must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('AGENT_CORE_LANGFLOW_BASE_URL must not include credentials');
  }
  if (!loopbackHostname(parsed.hostname)) {
    throw new Error('AGENT_CORE_LANGFLOW_BASE_URL must use a loopback hostname');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('AGENT_CORE_LANGFLOW_BASE_URL must be an origin without a path, query, or fragment');
  }
  return parsed.origin;
}

function parseMemoryPrincipalId(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.length > 512 || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new Error('AGENT_CORE_MEMORY_PRINCIPAL_ID must be a bounded printable identifier');
  }
  return raw;
}

function parseMemoryRemoteOwner(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.length > 39 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(raw)) {
    throw new Error('AGENT_CORE_MEMORY_REMOTE_OWNER must be a safe GitHub owner identifier');
  }
  return raw;
}

function parseMemoryRemoteRepo(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.length > 100 || raw === '.' || raw === '..' || !/^[A-Za-z0-9._-]+$/.test(raw)) {
    throw new Error('AGENT_CORE_MEMORY_REMOTE_REPO must be a safe GitHub repository identifier');
  }
  return raw;
}

function parseMemoryRemoteBranch(value: string | undefined): string {
  const raw = value?.trim() || 'main';
  if (
    raw.length > 200
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(raw)
    || raw.startsWith('refs/')
    || raw.startsWith('/')
    || raw.endsWith('/')
    || raw.endsWith('.')
    || raw.endsWith('.lock')
    || raw.includes('..')
    || raw.includes('//')
    || raw.includes('@{')
  ) {
    throw new Error('AGENT_CORE_MEMORY_REMOTE_BRANCH must be a bounded safe branch name');
  }
  return raw;
}

function parseGitHubApiBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || 'https://api.github.com';
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('AGENT_CORE_GITHUB_API_BASE_URL must be a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AGENT_CORE_GITHUB_API_BASE_URL must use http or https');
  }
  return raw.replace(/\/+$/g, '');
}


function parseMemorySupabaseSecondUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error('AGENT_CORE_MEMORY_SUPABASE_URL must be a valid URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('AGENT_CORE_MEMORY_SUPABASE_URL must be an https origin without path/query/fragment');
  }
  return parsed.origin;
}
function parseMemorySupabaseMirrorId(value: string | undefined): string {
  const raw = value?.trim() || 'canonical';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw)) throw new Error('AGENT_CORE_MEMORY_SUPABASE_MIRROR_ID must be a bounded safe identifier');
  return raw;
}

export function loadConfig(env: Env = process.env, baseDir = process.cwd()): AppConfig {
  const persistence = resolvePersistencePaths(env, baseDir);
  const port = Number.parseInt(env.AGENT_CORE_PORT ?? '8765', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('AGENT_CORE_PORT must be an integer between 1 and 65535');
  }

  const memoryRemoteEnabled = parseBoolean(env.AGENT_CORE_MEMORY_REMOTE_ENABLED, false);
  const memoryRemoteOwner = parseMemoryRemoteOwner(env.AGENT_CORE_MEMORY_REMOTE_OWNER);
  const memoryRemoteRepo = parseMemoryRemoteRepo(env.AGENT_CORE_MEMORY_REMOTE_REPO);
  const memoryRemoteKeyRaw = env.AGENT_CORE_MEMORY_REMOTE_KEY_FILE?.trim() || null;
  if (memoryRemoteEnabled && !memoryRemoteOwner) {
    throw new Error('AGENT_CORE_MEMORY_REMOTE_OWNER is required when memory remote is enabled');
  }
  if (memoryRemoteEnabled && !memoryRemoteRepo) {
    throw new Error('AGENT_CORE_MEMORY_REMOTE_REPO is required when memory remote is enabled');
  }
  if (memoryRemoteEnabled && !memoryRemoteKeyRaw) {
    throw new Error('AGENT_CORE_MEMORY_REMOTE_KEY_FILE is required when memory remote is enabled');
  }
  const memoryRemote: MemoryRemoteConfig = {
    enabled: memoryRemoteEnabled,
    owner: memoryRemoteOwner,
    repo: memoryRemoteRepo,
    branch: parseMemoryRemoteBranch(env.AGENT_CORE_MEMORY_REMOTE_BRANCH),
    keyFile: memoryRemoteKeyRaw ? path.resolve(memoryRemoteKeyRaw) : null,
    workRoot: path.resolve(env.AGENT_CORE_MEMORY_REMOTE_WORK_ROOT?.trim() || path.join(baseDir, 'runtime', 'memory', 'remote')),
    syncTimeoutMs: parseBoundedPositiveInteger(
      env.AGENT_CORE_MEMORY_REMOTE_SYNC_TIMEOUT_MS,
      120_000,
      'AGENT_CORE_MEMORY_REMOTE_SYNC_TIMEOUT_MS',
      600_000,
    ),
    maxRetryAttempts: parseBoundedPositiveInteger(
      env.AGENT_CORE_MEMORY_REMOTE_MAX_RETRIES,
      3,
      'AGENT_CORE_MEMORY_REMOTE_MAX_RETRIES',
      16,
    ),
  };

  const memorySupabaseSecondEnabled = parseBoolean(env.AGENT_CORE_MEMORY_SUPABASE_SECOND_ENABLED, false);
  const memorySupabaseSecondUrl = parseMemorySupabaseSecondUrl(env.AGENT_CORE_MEMORY_SUPABASE_URL ?? env.SUPABASE_URL);
  const memorySupabaseSecondPublishableKey = (env.AGENT_CORE_MEMORY_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY)?.trim() || null;
  const memorySupabaseSigningRaw = env.AGENT_CORE_MEMORY_SUPABASE_SIGNING_KEY_FILE?.trim() || null;
  const memorySupabaseEncryptionRaw = env.AGENT_CORE_MEMORY_SUPABASE_ENCRYPTION_KEY_FILE?.trim() || null;
  if (memorySupabaseSecondEnabled && !memorySupabaseSecondUrl) throw new Error('AGENT_CORE_MEMORY_SUPABASE_URL is required when Supabase second memory is enabled');
  if (memorySupabaseSecondEnabled && !memorySupabaseSecondPublishableKey) throw new Error('AGENT_CORE_MEMORY_SUPABASE_PUBLISHABLE_KEY is required when Supabase second memory is enabled');
  if (memorySupabaseSecondEnabled && !memorySupabaseSigningRaw) throw new Error('AGENT_CORE_MEMORY_SUPABASE_SIGNING_KEY_FILE is required when Supabase second memory is enabled');
  if (memorySupabaseSecondEnabled && !memorySupabaseEncryptionRaw) throw new Error('AGENT_CORE_MEMORY_SUPABASE_ENCRYPTION_KEY_FILE is required when Supabase second memory is enabled');
  const memorySupabaseSecond: MemorySupabaseSecondConfig = {
    enabled: memorySupabaseSecondEnabled,
    url: memorySupabaseSecondUrl,
    publishableKey: memorySupabaseSecondPublishableKey,
    mirrorId: parseMemorySupabaseMirrorId(env.AGENT_CORE_MEMORY_SUPABASE_MIRROR_ID),
    signingKeyFile: memorySupabaseSigningRaw ? resolvePathInsideProject(baseDir, memorySupabaseSigningRaw, 'AGENT_CORE_MEMORY_SUPABASE_SIGNING_KEY_FILE') : null,
    encryptionKeyFile: memorySupabaseEncryptionRaw ? resolvePathInsideProject(baseDir, memorySupabaseEncryptionRaw, 'AGENT_CORE_MEMORY_SUPABASE_ENCRYPTION_KEY_FILE') : null,
    timeoutMs: parseBoundedPositiveInteger(env.AGENT_CORE_MEMORY_SUPABASE_TIMEOUT_MS, 15_000, 'AGENT_CORE_MEMORY_SUPABASE_TIMEOUT_MS', 600_000),
    retentionMs: parseBoundedPositiveInteger(env.AGENT_CORE_MEMORY_SUPABASE_RETENTION_MS, 30 * 24 * 60 * 60 * 1000, 'AGENT_CORE_MEMORY_SUPABASE_RETENTION_MS', 3650 * 24 * 60 * 60 * 1000),
  };

  const defaultFileNativePaths = resolveFileNativeMemoryPaths(baseDir);
  const directEnabled = parseBoolean(env.AGENT_CORE_MEMORY_SUPABASE_DIRECT_ENABLED, false);
  const directKey = (env.AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY ?? env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)?.trim() || null;
  if (directEnabled && !memorySupabaseSecondUrl) throw new Error('AGENT_CORE_MEMORY_SUPABASE_URL is required when direct Supabase memory is enabled');
  if (directEnabled && !directKey) throw new Error('AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY is required when direct Supabase memory is enabled');
  if (directEnabled && directKey && !directKey.startsWith('sb_secret_')) {
    let role: unknown;
    try { role = JSON.parse(Buffer.from(directKey.split('.')[1] ?? '', 'base64url').toString()).role; } catch { /* reject without exposing credentials */ }
    if (role !== 'service_role') throw new Error('Direct Supabase memory requires a server secret key or legacy service_role key');
  }
  const supabaseDirect: MemorySupabaseDirectConfig = {
    enabled: directEnabled, url: memorySupabaseSecondUrl, secretKey: directKey,
    timeoutMs: memorySupabaseSecond.timeoutMs,
  };
  const vaultRoot = env.AGENT_CORE_MEMORY_VAULT_ROOT?.trim()
    ? resolvePathInsideProject(baseDir, env.AGENT_CORE_MEMORY_VAULT_ROOT.trim(), 'AGENT_CORE_MEMORY_VAULT_ROOT')
    : defaultFileNativePaths.vaultRoot;
  const fileNative: MemoryFileNativeConfig = {
    ...defaultFileNativePaths,
    vaultRoot,
    rgPath: env.AGENT_CORE_MEMORY_RG_PATH?.trim()
      ? resolvePathInsideProject(baseDir, env.AGENT_CORE_MEMORY_RG_PATH.trim(), 'AGENT_CORE_MEMORY_RG_PATH') : null,
    pythonPath: env.AGENT_CORE_MEMORY_PYTHON_PATH?.trim()
      ? resolvePathInsideProject(baseDir, env.AGENT_CORE_MEMORY_PYTHON_PATH.trim(), 'AGENT_CORE_MEMORY_PYTHON_PATH') : null,
    graphifyPath: env.AGENT_CORE_MEMORY_GRAPHIFY_PATH?.trim()
      ? resolvePathInsideProject(baseDir, env.AGENT_CORE_MEMORY_GRAPHIFY_PATH.trim(), 'AGENT_CORE_MEMORY_GRAPHIFY_PATH') : null,
  };

  const memory: MemoryConfig = {
    enabled: parseBoolean(env.AGENT_CORE_MEMORY_ENABLED, true),
    principalId: parseMemoryPrincipalId(
      env.AGENT_CORE_MEMORY_PRINCIPAL_ID
        ?? (memoryRemoteEnabled ? env.AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID : undefined),
    ),
    enforceHardGuardrails: parseBoolean(env.AGENT_CORE_MEMORY_ENFORCE_HARD_GUARDRAILS, false),
    hardLifecycleMode: parseMemoryHardLifecycleMode(env.AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE),
    fileNative,
    seedCap: parsePositiveInteger(env.AGENT_CORE_MEMORY_SEED_CAP, 64, 'AGENT_CORE_MEMORY_SEED_CAP'),
    graphNodeCap: parsePositiveInteger(env.AGENT_CORE_MEMORY_GRAPH_NODE_CAP, 1000, 'AGENT_CORE_MEMORY_GRAPH_NODE_CAP'),
    graphEdgeCap: parsePositiveInteger(env.AGENT_CORE_MEMORY_GRAPH_EDGE_CAP, 10_000, 'AGENT_CORE_MEMORY_GRAPH_EDGE_CAP'),
    graphMaxHops: parsePositiveInteger(env.AGENT_CORE_MEMORY_GRAPH_MAX_HOPS, 2, 'AGENT_CORE_MEMORY_GRAPH_MAX_HOPS'),
    pprDamping: parseUnitInterval(env.AGENT_CORE_MEMORY_PPR_DAMPING, 0.85, 'AGENT_CORE_MEMORY_PPR_DAMPING'),
    pprEpsilon: Number(env.AGENT_CORE_MEMORY_PPR_EPSILON ?? '0.000001'),
    pprMaxIterations: parsePositiveInteger(env.AGENT_CORE_MEMORY_PPR_MAX_ITERATIONS, 20, 'AGENT_CORE_MEMORY_PPR_MAX_ITERATIONS'),
    recallItemBudget: parsePositiveInteger(env.AGENT_CORE_MEMORY_RECALL_ITEM_BUDGET, 24, 'AGENT_CORE_MEMORY_RECALL_ITEM_BUDGET'),
    recallCharacterBudget: parsePositiveInteger(env.AGENT_CORE_MEMORY_RECALL_CHARACTER_BUDGET, 12_000, 'AGENT_CORE_MEMORY_RECALL_CHARACTER_BUDGET'),
    tokenOverlapJaccardThreshold: parseUnitInterval(env.AGENT_CORE_MEMORY_TOKEN_JACCARD, 0.35, 'AGENT_CORE_MEMORY_TOKEN_JACCARD'),
    temporalNeighborWindowMs: parsePositiveInteger(env.AGENT_CORE_MEMORY_TEMPORAL_WINDOW_MS, 30 * 60 * 1000, 'AGENT_CORE_MEMORY_TEMPORAL_WINDOW_MS'),
    archiveObservationAfterMs: parsePositiveInteger(env.AGENT_CORE_MEMORY_ARCHIVE_OBSERVATION_MS, 90 * 24 * 60 * 60 * 1000, 'AGENT_CORE_MEMORY_ARCHIVE_OBSERVATION_MS'),
    tombstoneRetentionMs: parsePositiveInteger(env.AGENT_CORE_MEMORY_TOMBSTONE_RETENTION_MS, 30 * 24 * 60 * 60 * 1000, 'AGENT_CORE_MEMORY_TOMBSTONE_RETENTION_MS'),
    scoreWeights: {
      lexical: 0.40,
      exact: 0.20,
      graph: 0.20,
      state: 0.05,
      importance: 0.10,
      recency: 0.05,
    },
    remote: memoryRemote,
    supabaseSecond: memorySupabaseSecond,
    supabaseDirect,
  };

  if (!Number.isFinite(memory.pprEpsilon) || memory.pprEpsilon <= 0) {
    throw new Error('AGENT_CORE_MEMORY_PPR_EPSILON must be positive');
  }

  const httpSecurity: HttpSecurityConfig = {
    publicBaseUrl: parsePublicBaseUrl(env.AGENT_CORE_PUBLIC_BASE_URL),
    protectedResourceUrl: parseOAuthProtectedResourceUrl(env.AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL),
    trustProxy: parseBoolean(env.AGENT_CORE_TRUST_PROXY, false),
    allowedOrigins: parseAllowedOrigins(env.AGENT_CORE_MCP_ALLOWED_ORIGINS),
  };

  const mcp: McpConfig = {
    protocolMode: parseMcpProtocolMode(env.AGENT_CORE_MCP_PROTOCOL_MODE),
  };

  const otlpEndpoint = parseOtlpEndpoint(env.AGENT_CORE_OTLP_ENDPOINT);
  const observability: ObservabilityConfig = {
    audit: {
      queueCapacity: parseBoundedPositiveInteger(env.AGENT_CORE_AUDIT_QUEUE_CAPACITY, 4096, 'AGENT_CORE_AUDIT_QUEUE_CAPACITY', 65_536),
      maxFileBytes: parseBoundedPositiveInteger(env.AGENT_CORE_AUDIT_MAX_FILE_BYTES, 16 * 1024 * 1024, 'AGENT_CORE_AUDIT_MAX_FILE_BYTES', 1024 * 1024 * 1024),
      maxRotatedFiles: parseBoundedPositiveInteger(env.AGENT_CORE_AUDIT_MAX_ROTATED_FILES, 16, 'AGENT_CORE_AUDIT_MAX_ROTATED_FILES', 1024),
      retentionMs: parsePositiveInteger(env.AGENT_CORE_AUDIT_RETENTION_MS, 30 * 24 * 60 * 60 * 1000, 'AGENT_CORE_AUDIT_RETENTION_MS'),
    },
    otlp: {
      enabled: otlpEndpoint !== null,
      endpoint: otlpEndpoint,
      timeoutMs: parseBoundedPositiveInteger(env.AGENT_CORE_OTLP_TIMEOUT_MS, 2000, 'AGENT_CORE_OTLP_TIMEOUT_MS', 60_000),
      maxQueue: parseBoundedPositiveInteger(env.AGENT_CORE_OTLP_MAX_QUEUE, 1024, 'AGENT_CORE_OTLP_MAX_QUEUE', 65_536),
      exportIntervalMs: parseBoundedPositiveInteger(env.AGENT_CORE_OTLP_EXPORT_INTERVAL_MS, 5000, 'AGENT_CORE_OTLP_EXPORT_INTERVAL_MS', 60 * 60 * 1000),
    },
  };

  const maxConcurrency = parsePositiveInteger(env.AGENT_CORE_EXECUTION_MAX_CONCURRENCY, 4, 'AGENT_CORE_EXECUTION_MAX_CONCURRENCY');
  const resourceGovernance: ExecutionResourceGovernanceConfig = {
    enabled: parseBoolean(env.AGENT_CORE_EXECUTION_RESOURCE_GOVERNANCE_ENABLED, true),
    minimumConcurrency: parsePositiveInteger(env.AGENT_CORE_EXECUTION_RESOURCE_MIN_CONCURRENCY, 1, 'AGENT_CORE_EXECUTION_RESOURCE_MIN_CONCURRENCY'),
    cpuWarningRatio: parsePositiveNumber(env.AGENT_CORE_EXECUTION_CPU_WARNING_RATIO, 0.90, 'AGENT_CORE_EXECUTION_CPU_WARNING_RATIO'),
    cpuCriticalRatio: parsePositiveNumber(env.AGENT_CORE_EXECUTION_CPU_CRITICAL_RATIO, 1.25, 'AGENT_CORE_EXECUTION_CPU_CRITICAL_RATIO'),
    memoryWarningRatio: parseUnitInterval(env.AGENT_CORE_EXECUTION_MEMORY_WARNING_RATIO, 0.85, 'AGENT_CORE_EXECUTION_MEMORY_WARNING_RATIO'),
    memoryCriticalRatio: parseUnitInterval(env.AGENT_CORE_EXECUTION_MEMORY_CRITICAL_RATIO, 0.95, 'AGENT_CORE_EXECUTION_MEMORY_CRITICAL_RATIO'),
    storageWarningFreeRatio: parseUnitInterval(env.AGENT_CORE_EXECUTION_STORAGE_WARNING_FREE_RATIO, 0.15, 'AGENT_CORE_EXECUTION_STORAGE_WARNING_FREE_RATIO'),
    storageCriticalFreeRatio: parseUnitInterval(env.AGENT_CORE_EXECUTION_STORAGE_CRITICAL_FREE_RATIO, 0.05, 'AGENT_CORE_EXECUTION_STORAGE_CRITICAL_FREE_RATIO'),
    auditWarningRatio: parseUnitInterval(env.AGENT_CORE_EXECUTION_AUDIT_WARNING_RATIO, 0.75, 'AGENT_CORE_EXECUTION_AUDIT_WARNING_RATIO'),
    auditCriticalRatio: parseUnitInterval(env.AGENT_CORE_EXECUTION_AUDIT_CRITICAL_RATIO, 0.90, 'AGENT_CORE_EXECUTION_AUDIT_CRITICAL_RATIO'),
    telemetryWarningRatio: parseUnitInterval(env.AGENT_CORE_EXECUTION_TELEMETRY_WARNING_RATIO, 0.75, 'AGENT_CORE_EXECUTION_TELEMETRY_WARNING_RATIO'),
    telemetryCriticalRatio: parseUnitInterval(env.AGENT_CORE_EXECUTION_TELEMETRY_CRITICAL_RATIO, 0.90, 'AGENT_CORE_EXECUTION_TELEMETRY_CRITICAL_RATIO'),
    queuedSyncWarning: parsePositiveInteger(env.AGENT_CORE_EXECUTION_QUEUED_SYNC_WARNING, 32, 'AGENT_CORE_EXECUTION_QUEUED_SYNC_WARNING'),
    queuedSyncCritical: parsePositiveInteger(env.AGENT_CORE_EXECUTION_QUEUED_SYNC_CRITICAL, 128, 'AGENT_CORE_EXECUTION_QUEUED_SYNC_CRITICAL'),
  };
  if (resourceGovernance.minimumConcurrency > maxConcurrency) {
    throw new Error('AGENT_CORE_EXECUTION_RESOURCE_MIN_CONCURRENCY must not exceed AGENT_CORE_EXECUTION_MAX_CONCURRENCY');
  }
  if (resourceGovernance.cpuWarningRatio >= resourceGovernance.cpuCriticalRatio) throw new Error('cpu warning ratio must be lower than critical ratio');
  if (resourceGovernance.memoryWarningRatio >= resourceGovernance.memoryCriticalRatio) throw new Error('memory warning ratio must be lower than critical ratio');
  if (resourceGovernance.storageWarningFreeRatio <= resourceGovernance.storageCriticalFreeRatio) throw new Error('storage warning free ratio must be higher than critical free ratio');
  if (resourceGovernance.auditWarningRatio >= resourceGovernance.auditCriticalRatio) throw new Error('audit warning ratio must be lower than critical ratio');
  if (resourceGovernance.telemetryWarningRatio >= resourceGovernance.telemetryCriticalRatio) throw new Error('telemetry warning ratio must be lower than critical ratio');
  if (resourceGovernance.queuedSyncWarning >= resourceGovernance.queuedSyncCritical) throw new Error('queued sync warning must be lower than critical threshold');

  const execution: ExecutionConfig = {
    // Production default is enabled after the staged Task 22 live canary; operators can still disable it explicitly.
    enabled: parseBoolean(env.AGENT_CORE_EXECUTION_ENABLED, true),
    stateRoot: path.resolve(env.AGENT_CORE_EXECUTION_STATE_ROOT?.trim() || path.join(baseDir, 'runtime', 'execution', 'state')),
    logRoot: path.resolve(env.AGENT_CORE_EXECUTION_LOG_ROOT?.trim() || path.join(baseDir, 'runtime', 'execution', 'runs')),
    maxConcurrency,
    maxNodes: parsePositiveInteger(env.AGENT_CORE_EXECUTION_MAX_NODES, 128, 'AGENT_CORE_EXECUTION_MAX_NODES'),
    maxOutputBytes: parseBoundedPositiveInteger(env.AGENT_CORE_EXECUTION_MAX_OUTPUT_BYTES, 64 * 1024 * 1024, 'AGENT_CORE_EXECUTION_MAX_OUTPUT_BYTES', 1024 * 1024 * 1024),
    waitMaxMs: parsePositiveInteger(env.AGENT_CORE_EXECUTION_WAIT_MAX_MS, 60_000, 'AGENT_CORE_EXECUTION_WAIT_MAX_MS'),
    lockTimeoutMs: parsePositiveInteger(env.AGENT_CORE_EXECUTION_LOCK_TIMEOUT_MS, 5_000, 'AGENT_CORE_EXECUTION_LOCK_TIMEOUT_MS'),
    resourceGovernance,
  };

  const maintenance: MaintenanceConfig = {
    enabled: parseBoolean(env.AGENT_CORE_MAINTENANCE_ENABLED, false),
    intervalMs: parsePositiveInteger(env.AGENT_CORE_MAINTENANCE_INTERVAL_MS, 6 * 60 * 60 * 1000, 'AGENT_CORE_MAINTENANCE_INTERVAL_MS'),
    retentionOlderThanMs: parsePositiveInteger(env.AGENT_CORE_MAINTENANCE_RETENTION_OLDER_THAN_MS, 30 * 24 * 60 * 60 * 1000, 'AGENT_CORE_MAINTENANCE_RETENTION_OLDER_THAN_MS'),
    retentionPlanRoot: path.resolve(env.AGENT_CORE_MAINTENANCE_RETENTION_PLAN_ROOT?.trim() || path.join(baseDir, 'runtime', 'execution', 'retention')),
  };

  const github: GitHubConfig = {
    enabled: parseBoolean(env.AGENT_CORE_GITHUB_ENABLED, true),
    apiBaseUrl: parseGitHubApiBaseUrl(env.AGENT_CORE_GITHUB_API_BASE_URL),
    apiVersion: env.AGENT_CORE_GITHUB_API_VERSION?.trim() || '2026-03-10',
    tokenFile: path.resolve(env.AGENT_CORE_GITHUB_TOKEN_FILE?.trim() || path.join(baseDir, 'secrets', 'github', 'gh-token.txt')),
    packagesTokenFile: path.resolve(env.AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE?.trim() || path.join(baseDir, 'secrets', 'github', 'packages-token.txt')),
    useGhCliCredential: parseBoolean(env.AGENT_CORE_GITHUB_USE_GH_CLI, false),
    ghCliPath: env.AGENT_CORE_GH_EXE?.trim() ? path.resolve(env.AGENT_CORE_GH_EXE.trim()) : null,
    requestTimeoutMs: parsePositiveInteger(env.AGENT_CORE_GITHUB_REQUEST_TIMEOUT_MS, 30_000, 'AGENT_CORE_GITHUB_REQUEST_TIMEOUT_MS'),
    gitTimeoutMs: parsePositiveInteger(env.AGENT_CORE_GITHUB_GIT_TIMEOUT_MS, 120_000, 'AGENT_CORE_GITHUB_GIT_TIMEOUT_MS'),
  };

  const langflowApiKeyFile = env.AGENT_CORE_LANGFLOW_API_KEY_FILE?.trim() || null;
  const langflow: LangflowConfig = {
    enabled: parseBoolean(env.AGENT_CORE_LANGFLOW_ENABLED, true),
    baseUrl: parseLangflowBaseUrl(env.AGENT_CORE_LANGFLOW_BASE_URL),
    apiKeyFile: langflowApiKeyFile ? path.resolve(langflowApiKeyFile) : null,
    requestTimeoutMs: parseBoundedPositiveInteger(
      env.AGENT_CORE_LANGFLOW_REQUEST_TIMEOUT_MS,
      30_000,
      'AGENT_CORE_LANGFLOW_REQUEST_TIMEOUT_MS',
      600_000,
    ),
  };

  const operatorDirectives: OperatorDirectiveConfig = {
    enabled: parseBoolean(env.AGENT_CORE_OPERATOR_DIRECTIVES_ENABLED, true),
    stateRoot: path.resolve(
      env.AGENT_CORE_OPERATOR_DIRECTIVES_STATE_ROOT?.trim()
        || path.join(baseDir, 'runtime', 'operator-directives', 'state'),
    ),
    lockTimeoutMs: parseBoundedPositiveInteger(
      env.AGENT_CORE_OPERATOR_DIRECTIVES_LOCK_TIMEOUT_MS,
      5_000,
      'AGENT_CORE_OPERATOR_DIRECTIVES_LOCK_TIMEOUT_MS',
      60_000,
    ),
    stateVersion: 1,
  };

  return {
    host: env.AGENT_CORE_HOST?.trim() || '127.0.0.1',
    port,
    dataDir: persistence.dataDir,
    logDir: persistence.logDir,
    capabilityDir: path.resolve(env.AGENT_CORE_CAPABILITY_DIR?.trim() || path.join(baseDir, 'capabilities')),
    allowedRoots: parseRoots(env.AGENT_CORE_ALLOWED_ROOTS, baseDir),
    httpSecurity,
    mcp,
    observability,
    memory,
    execution,
    maintenance,
    github,
    langflow,
    operatorDirectives,
  };
}
