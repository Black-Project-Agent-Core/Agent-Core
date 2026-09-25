import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CodeIntelligenceConfig } from './code-intelligence/types.js';
import type { LearningConfig } from './learning/types.js';
import type { HermesPartnerConfig } from './partner/types.js';
import type { SemanticIdeConfig } from './semantic-ide/types.js';
import { loadPhoneConfig, type PhoneConfig } from './phone/config.js';
import { recordNewRootEnvSecrets } from './security/environment.js';

export type McpProtocolMode = 'dual' | 'legacy';
export interface HttpSecurityConfig {
  publicBaseUrl: string | null;
  protectedResourceUrl: string | null;
  trustProxy: boolean;
  allowedOrigins: string[];
}

export interface MemoryEmbeddingConfig {
  provider: 'cloudflare-workers-ai' | null;
  accountId: string | null;
  apiToken: string | null;
  model: string | null;
  dimensions: number;
}

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  memoryDir: string;
  memoryEmbedding: MemoryEmbeddingConfig;
  httpSecurity: HttpSecurityConfig;
  mcp: { protocolMode: McpProtocolMode };
  phone?: PhoneConfig;
  codeIntelligence?: CodeIntelligenceConfig;
  learning: LearningConfig;
  hermesPartner: HermesPartnerConfig;
  semanticIde: SemanticIdeConfig;
}
const bool = (value: string | undefined, fallback: boolean) => value === undefined
  ? fallback : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
const list = (value: string | undefined) => (value ?? '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const optionalNonNegativeInt = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

function resolveHermesSourceRoot(env: NodeJS.ProcessEnv, baseDir: string, hermesHome: string): string {
  const explicit = env.AGENT_CORE_HERMES_SOURCE_ROOT?.trim();
  if (explicit) return path.resolve(explicit);

  const apiServerRelative = path.join('gateway', 'platforms', 'api_server.py');
  const candidates = [
    path.resolve(baseDir, '..', 'hermes-agent'),
    path.resolve(hermesHome, 'hermes-agent'),
  ];
  return candidates.find(candidate => existsSync(path.join(candidate, apiServerRelative))) ?? candidates[1];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, baseDir = process.cwd()): AppConfig {
  if (env === process.env) {
    const beforeKeys = new Set(Object.keys(process.env));
    try { process.loadEnvFile(path.join(baseDir, '.env')); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    recordNewRootEnvSecrets(beforeKeys, process.env);
    env = process.env;
  }
  const port = Number.parseInt(env.AGENT_CORE_PORT ?? '8765', 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('AGENT_CORE_PORT_INVALID');
  const protocol = (env.AGENT_CORE_MCP_PROTOCOL_MODE ?? 'dual').trim().toLowerCase();
  if (protocol !== 'dual' && protocol !== 'legacy') throw new Error('AGENT_CORE_MCP_PROTOCOL_MODE_INVALID');

  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() || null;
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim() || null;
  const embeddingModel = env.CLOUDFLARE_EMBEDDING_MODEL?.trim() || null;
  const embeddingFields = [accountId, apiToken, embeddingModel];
  const embeddingConfiguredCount = embeddingFields.filter(Boolean).length;
  if (embeddingConfiguredCount > 0 && embeddingConfiguredCount < embeddingFields.length) {
    throw new Error('CLOUDFLARE_EMBEDDING_CONFIGURATION_INCOMPLETE');
  }
  const embeddingConfigured = embeddingConfiguredCount === embeddingFields.length;
  const codeIntelligenceRuntimeDir = path.resolve(
    env.AGENT_CORE_CODE_INTELLIGENCE_RUNTIME_DIR?.trim() || path.join(baseDir, 'runtime', 'grafel'),
  );
  const learningStateDir = path.resolve(
    env.AGENT_CORE_LEARNING_STATE_DIR?.trim() || path.join(baseDir, 'runtime', 'learning'),
  );
  const partnerRuntimeDir = path.resolve(
    env.AGENT_CORE_HERMES_PARTNER_RUNTIME_DIR?.trim() || path.join(baseDir, 'runtime', 'partner', 'hermes'),
  );
  const semanticIdeRuntimeDir = path.resolve(
    env.AGENT_CORE_SEMANTIC_IDE_RUNTIME_DIR?.trim() || path.join(baseDir, 'runtime', 'semantic-ide'),
  );
  const typescriptServerPath = path.resolve(
    env.AGENT_CORE_SEMANTIC_IDE_TYPESCRIPT_SERVER?.trim()
      || path.join(baseDir, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
  );
  const typescriptTsserverPath = path.resolve(
    env.AGENT_CORE_SEMANTIC_IDE_TYPESCRIPT_TSSERVER?.trim()
      || path.join(baseDir, 'node_modules', 'typescript-lsp-runtime', 'lib', 'tsserver.js'),
  );
  const semanticIdeServersFile = path.resolve(
    env.AGENT_CORE_SEMANTIC_IDE_SERVERS_FILE?.trim() || path.join(semanticIdeRuntimeDir, 'servers.json'),
  );
  const hermesHome = path.resolve(
    env.AGENT_CORE_HERMES_HOME?.trim() || path.join(baseDir, '..', 'hermes'),
  );
  const hermesSourceRoot = resolveHermesSourceRoot(env, baseDir, hermesHome);
  return {
    host: env.AGENT_CORE_HOST?.trim() || '127.0.0.1',
    port,
    dataDir: path.resolve(env.AGENT_CORE_DATA_DIR?.trim() || path.join(baseDir, 'runtime', 'bridge-auth')),
    memoryDir: path.resolve(env.AGENT_CORE_MEMORY_DIR?.trim() || path.join(baseDir, 'runtime', 'memory')),
    memoryEmbedding: {
      provider: embeddingConfigured ? 'cloudflare-workers-ai' : null,
      accountId,
      apiToken,
      model: embeddingModel,
      dimensions: positiveInt(env.CLOUDFLARE_EMBEDDING_DIMENSIONS, 768),
    },
    httpSecurity: {
      publicBaseUrl: env.AGENT_CORE_PUBLIC_BASE_URL?.trim() || null,
      protectedResourceUrl: (env.AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL ?? env.AGENT_CORE_PROTECTED_RESOURCE_URL)?.trim() || null,
      trustProxy: bool(env.AGENT_CORE_TRUST_PROXY, false),
      allowedOrigins: list(env.AGENT_CORE_MCP_ALLOWED_ORIGINS ?? env.AGENT_CORE_ALLOWED_ORIGINS),
    },
    mcp: { protocolMode: protocol },
    phone: loadPhoneConfig(env, baseDir),
    codeIntelligence: {
      enabled: bool(env.AGENT_CORE_CODE_INTELLIGENCE_ENABLED, true),
      projectRoot: path.resolve(baseDir),
      runtimeDir: codeIntelligenceRuntimeDir,
      binaryPath: path.resolve(
        env.AGENT_CORE_GRAFEL_BINARY?.trim() || path.join(codeIntelligenceRuntimeDir, 'bin', 'grafel.exe'),
      ),
      group: env.AGENT_CORE_CODE_INTELLIGENCE_GROUP?.trim() || 'agent-core',
      repoSlug: env.AGENT_CORE_CODE_INTELLIGENCE_REPO_SLUG?.trim() || 'agent-core',
      startupTimeoutMs: positiveInt(env.AGENT_CORE_CODE_INTELLIGENCE_STARTUP_TIMEOUT_MS, 30_000),
      callTimeoutMs: positiveInt(env.AGENT_CORE_CODE_INTELLIGENCE_CALL_TIMEOUT_MS, 15_000),
      resourcePolicy: {
        ...(optionalNonNegativeInt(env.AGENT_CORE_GRAFEL_MAX_RSS_BUDGET_MB) !== undefined
          ? { maxRssBudgetMb: optionalNonNegativeInt(env.AGENT_CORE_GRAFEL_MAX_RSS_BUDGET_MB)! } : {}),
        ...(optionalNonNegativeInt(env.AGENT_CORE_GRAFEL_RELOAD_DEBOUNCE_MS) !== undefined
          ? { reloadDebounceMs: optionalNonNegativeInt(env.AGENT_CORE_GRAFEL_RELOAD_DEBOUNCE_MS)! } : {}),
        ...(optionalNonNegativeInt(env.AGENT_CORE_GRAFEL_BM25_IDLE_MS) !== undefined
          ? { bm25IdleMs: optionalNonNegativeInt(env.AGENT_CORE_GRAFEL_BM25_IDLE_MS)! } : {}),
        groupIdleMs: optionalNonNegativeInt(env.AGENT_CORE_GRAFEL_GROUP_IDLE_MS) ?? 0,
        groupKeepReader: bool(env.AGENT_CORE_GRAFEL_GROUP_KEEP_READER, true),
        groupRssBudgetMb: optionalNonNegativeInt(env.AGENT_CORE_GRAFEL_GROUP_RSS_BUDGET_MB) ?? 0,
        ...(env.AGENT_CORE_GRAFEL_GROUP_ALGO_DEBOUNCE?.trim()
          ? { groupAlgoDebounce: env.AGENT_CORE_GRAFEL_GROUP_ALGO_DEBOUNCE.trim() } : {}),
      },
    },
    learning: {
      enabled: bool(env.AGENT_CORE_LEARNING_ENABLED, true),
      stateDir: learningStateDir,
      reviewInterval: positiveInt(env.AGENT_CORE_LEARNING_REVIEW_INTERVAL, 10),
      curatorIntervalHours: positiveInt(env.AGENT_CORE_LEARNING_CURATOR_INTERVAL_HOURS, 168),
    },
    hermesPartner: {
      enabled: bool(env.AGENT_CORE_HERMES_PARTNER_ENABLED, true),
      projectRoot: path.resolve(baseDir),
      runtimeDir: partnerRuntimeDir,
      hermesHome,
      hermesSourceRoot,
      host: '127.0.0.1',
      portStart: positiveInt(env.AGENT_CORE_HERMES_PARTNER_PORT_START, 18642),
      startupTimeoutMs: positiveInt(env.AGENT_CORE_HERMES_PARTNER_STARTUP_TIMEOUT_MS, 30_000),
      callTimeoutMs: positiveInt(env.AGENT_CORE_HERMES_PARTNER_CALL_TIMEOUT_MS, 30_000),
      discussionRounds: Math.min(3, positiveInt(env.AGENT_CORE_HERMES_PARTNER_DISCUSSION_ROUNDS, 3)),
    },
    semanticIde: {
      enabled: bool(env.AGENT_CORE_SEMANTIC_IDE_ENABLED, true),
      projectRoot: path.resolve(baseDir),
      runtimeDir: semanticIdeRuntimeDir,
      startupTimeoutMs: positiveInt(env.AGENT_CORE_SEMANTIC_IDE_STARTUP_TIMEOUT_MS, 30_000),
      callTimeoutMs: positiveInt(env.AGENT_CORE_SEMANTIC_IDE_CALL_TIMEOUT_MS, 15_000),
      typescriptServerPath,
      typescriptTsserverPath,
      serversFile: semanticIdeServersFile,
    },
  };
}
