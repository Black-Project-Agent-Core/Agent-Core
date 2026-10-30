import path from 'node:path';
import type { AgentProviderContinuationMetadata, AgentProviderCredentialConfig, AgentRuntimeConfig } from './agent-provider.js';
import type { AgentReasoningEffort } from './agent-provider-state.js';
import { isAgentCapabilityFamily, type AgentCapabilityFamily } from './agent-capability-catalog.js';
import type { WebResearchConfig } from './web-research/service.js';
import type { CodeIntelligenceConfig } from './code-intelligence/types.js';
import type { LearningConfig } from './learning/types.js';
import type { SemanticIdeConfig } from './semantic-ide/types.js';
import { loadPhoneConfig, type PhoneConfig } from './phone/config.js';
import { recordNewRootEnvSecrets } from './security/environment.js';
import { resolveModuleProjectRoot, resolvePortableProjectPath, resolveProjectRoot } from './portability/paths.js';

export type McpProtocolMode = 'dual' | 'legacy';
export interface HttpSecurityConfig {
  publicBaseUrl: string | null;
  protectedResourceUrl: string | null;
  /** Extra https MCP resource URLs, selected by request host (for example a Cloudflare Tunnel hostname). */
  additionalProtectedResourceUrls?: string[];
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
  projectRoot: string;
  host: string;
  port: number;
  launcherControlFile: string | null;
  dataDir: string;
  memoryDir: string;
  memoryEmbedding: MemoryEmbeddingConfig;
  httpSecurity: HttpSecurityConfig;
  mcp: { protocolMode: McpProtocolMode };
  phone?: PhoneConfig;
  codeIntelligence?: CodeIntelligenceConfig;
  learning: LearningConfig;
  agentRuntime: AgentRuntimeConfig;
  webResearch: WebResearchConfig;
  agentUiToken: string | null;
  semanticIde: SemanticIdeConfig;
}
const bool = (value: string | undefined, fallback: boolean) => value === undefined
  ? fallback : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
const list = (value: string | undefined) => (value ?? '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
/** Ceiling of the default reasoning effort: the highest level each model supports up to it is used. 'off', 'auto' or an unknown value means the provider default. */
const defaultReasoningEffort = (value: string | undefined): AgentReasoningEffort | undefined => {
  const level = (value ?? '').trim().toLowerCase();
  if (!level) return 'max';
  return (['low', 'medium', 'high', 'xhigh', 'max'] as const).find(item => item === level);
};
/** Public MCP resource URL for a Cloudflare Tunnel hostname. A pasted scheme or path is tolerated; an invalid value adds nothing, so a typo cannot stop startup. */
const tunnelResourceUrl = (value: string | undefined) => {
  const host = (value ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? [`https://${host}/mcp`] : [];
};
const numberedCredentials = (
  env: NodeJS.ProcessEnv,
  prefix: string,
  providerId: string,
  max = 20,
): AgentProviderCredentialConfig[] => {
  const values: AgentProviderCredentialConfig[] = [];
  const seen = new Set<string>();
  for (let index = 1; index <= max; index += 1) {
    const slot = String(index).padStart(2, '0');
    const secret = env[`${prefix}_API_KEY_${slot}`]?.trim();
    if (!secret || seen.has(secret)) continue;
    seen.add(secret);
    values.push({ id: `${providerId}:${slot}`, secret, ordinal: index });
  }
  return values;
};
const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
// Owner-declared capacity for a pinned model whose /models entry has no limits (gonkarouter lists only the id).
// Readiness still requires a live tool probe per key; both values are needed or nothing is declared.
const declaredCapacity = (env: NodeJS.ProcessEnv, prefix: string): { continuation?: AgentProviderContinuationMetadata } => {
  const contextWindowTokens = positiveInt(env[`${prefix}_CONTEXT_WINDOW_TOKENS`], 0);
  const maxOutputTokens = positiveInt(env[`${prefix}_MAX_OUTPUT_TOKENS`], 0);
  return contextWindowTokens && maxOutputTokens ? { continuation: { supportsTools: true, modalities: ['text'],
    contextWindowTokens, maxOutputTokens, toolCallFormat: 'openai-chat-tool-calls-v1' } } : {};
};
const optionalNonNegativeInt = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};
const capabilityFamilies = (value: string | undefined): AgentCapabilityFamily[] => {
  const values = [...new Set(list(value))];
  for (const item of values) {
    if (!isAgentCapabilityFamily(item)) throw new Error('AGENT_CORE_AI_ALLOWED_CAPABILITY_INVALID:' + item);
  }
  return values as AgentCapabilityFamily[];
};
const capabilityPolicy = (value: string | undefined): AgentRuntimeConfig['capabilityPolicy'] => {
  const mode = (value ?? 'explicit').trim().toLowerCase();
  if (!['explicit', 'minimal', 'read-only', 'dynamic'].includes(mode)) {
    throw new Error('AGENT_CORE_AI_CAPABILITY_POLICY_INVALID');
  }
  return mode as AgentRuntimeConfig['capabilityPolicy'];
};

const MODULE_PROJECT_ROOT = resolveModuleProjectRoot(import.meta.url);

export function loadConfig(env: NodeJS.ProcessEnv = process.env, baseDir = MODULE_PROJECT_ROOT): AppConfig {
  let projectRoot = resolveProjectRoot(env, baseDir);
  if (env === process.env) {
    const beforeKeys = new Set(Object.keys(process.env));
    try { process.loadEnvFile(path.join(projectRoot, '.env')); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    recordNewRootEnvSecrets(beforeKeys, process.env);
    env = process.env;
    projectRoot = resolveProjectRoot(env, projectRoot);
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
  const codeIntelligenceRuntimeDir = resolvePortableProjectPath(
    projectRoot, env.AGENT_CORE_CODE_INTELLIGENCE_RUNTIME_DIR, path.join('runtime', 'grafel'),
  );
  const learningStateDir = resolvePortableProjectPath(
    projectRoot, env.AGENT_CORE_LEARNING_STATE_DIR, path.join('runtime', 'learning'),
  );
  const semanticIdeRuntimeDir = resolvePortableProjectPath(
    projectRoot, env.AGENT_CORE_SEMANTIC_IDE_RUNTIME_DIR, path.join('runtime', 'semantic-ide'),
  );
  const typescriptServerPath = resolvePortableProjectPath(
    projectRoot,
    env.AGENT_CORE_SEMANTIC_IDE_TYPESCRIPT_SERVER,
    path.join('node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
  );
  const typescriptTsserverPath = resolvePortableProjectPath(
    projectRoot,
    env.AGENT_CORE_SEMANTIC_IDE_TYPESCRIPT_TSSERVER,
    path.join('node_modules', 'typescript-lsp-runtime', 'lib', 'tsserver.js'),
  );
  const semanticIdeServersFile = env.AGENT_CORE_SEMANTIC_IDE_SERVERS_FILE?.trim()
    ? resolvePortableProjectPath(
      projectRoot, env.AGENT_CORE_SEMANTIC_IDE_SERVERS_FILE, path.join('runtime', 'semantic-ide', 'servers.json'),
    )
    : path.join(semanticIdeRuntimeDir, 'servers.json');
  const namedAgentProviders = [
    {
      id: 'anthropic',
      baseUrl: env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com/v1',
      model: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
      models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
      ...(env.ANTHROPIC_WORKSPACE_ID?.trim() ? { workspaceId: env.ANTHROPIC_WORKSPACE_ID.trim() } : {}),
      ...declaredCapacity(env, 'ANTHROPIC'),
      credentials: numberedCredentials(env, 'ANTHROPIC', 'anthropic'),
    },
    {
      id: 'atria',
      baseUrl: env.ATRIA_BASE_URL?.trim() || null,
      model: env.ATRIA_MODEL?.trim() || null,
      ...declaredCapacity(env, 'ATRIA'),
      credentials: numberedCredentials(env, 'ATRIA', 'atria'),
    },
    {
      id: 'gonka',
      baseUrl: env.GONKA_BASE_URL?.trim() || null,
      model: env.GONKA_MODEL?.trim() || null,
      ...declaredCapacity(env, 'GONKA'),
      credentials: numberedCredentials(env, 'GONKA', 'gonka'),
    },
    {
      id: 'openrouter',
      baseUrl: env.OPENROUTER_BASE_URL?.trim() || null,
      model: env.OPENROUTER_MODEL?.trim() || null,
      ...declaredCapacity(env, 'OPENROUTER'),
      credentials: numberedCredentials(env, 'OPENROUTER', 'openrouter'),
    },
  ].filter(provider => provider.id === 'anthropic'
    ? provider.credentials.length > 0 || Boolean(env.ANTHROPIC_BASE_URL?.trim() || env.ANTHROPIC_MODEL?.trim())
    : provider.baseUrl || provider.model || provider.credentials.length > 0);
  const configuredProviderOrder = list(env.AGENT_CORE_AI_PROVIDER_ORDER);
  return {
    projectRoot,
    host: env.AGENT_CORE_HOST?.trim() || '127.0.0.1',
    port,
    launcherControlFile: env.AGENT_CORE_LAUNCHER_CONTROL_FILE?.trim()
      ? resolvePortableProjectPath(
        projectRoot,
        env.AGENT_CORE_LAUNCHER_CONTROL_FILE,
        path.join('runtime', 'launcher', 'control.signal'),
      )
      : null,
    dataDir: resolvePortableProjectPath(
      projectRoot, env.AGENT_CORE_DATA_DIR, path.join('runtime', 'bridge-auth'),
    ),
    memoryDir: resolvePortableProjectPath(
      projectRoot, env.AGENT_CORE_MEMORY_DIR, path.join('runtime', 'memory'),
    ),
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
      additionalProtectedResourceUrls: [
        ...list(env.AGENT_CORE_OAUTH_ADDITIONAL_RESOURCE_URLS),
        ...tunnelResourceUrl(env.CLOUDFLARE_TUNNEL_HOSTNAME),
      ],
      trustProxy: bool(env.AGENT_CORE_TRUST_PROXY, false),
      allowedOrigins: list(env.AGENT_CORE_MCP_ALLOWED_ORIGINS ?? env.AGENT_CORE_ALLOWED_ORIGINS),
    },
    mcp: { protocolMode: protocol },
    phone: loadPhoneConfig(env, projectRoot),
    codeIntelligence: {
      enabled: bool(env.AGENT_CORE_CODE_INTELLIGENCE_ENABLED, true),
      projectRoot,
      runtimeDir: codeIntelligenceRuntimeDir,
      binaryPath: env.AGENT_CORE_GRAFEL_BINARY?.trim()
        ? resolvePortableProjectPath(
          projectRoot, env.AGENT_CORE_GRAFEL_BINARY, path.join('runtime', 'grafel', 'bin', 'grafel.exe'),
        )
        : path.join(codeIntelligenceRuntimeDir, 'bin', 'grafel.exe'),
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
    agentRuntime: {
      enabled: bool(env.AGENT_CORE_AI_ENABLED, false),
      baseUrl: env.AGENT_CORE_AI_BASE_URL?.trim() || null,
      model: env.AGENT_CORE_AI_MODEL?.trim() || null,
      apiKey: env.AGENT_CORE_AI_API_KEY?.trim() || null,
      anthropicPromptCaching: bool(env.ANTHROPIC_PROMPT_CACHING, true),
      anthropicDefaultReasoningEffort: defaultReasoningEffort(env.ANTHROPIC_REASONING_EFFORT),
      providers: namedAgentProviders,
      providerOrder: configuredProviderOrder.length
        ? configuredProviderOrder
        : ['atria', 'gonka', 'openrouter', 'anthropic'],
      maxProviderAttempts: positiveInt(env.AGENT_CORE_AI_MAX_PROVIDER_ATTEMPTS, 6),
      // Patient on purpose: reasoning models answer non-streaming requests slowly and unevenly (3.5-26.5 s for tiny
      // outputs on Duanyan), and a timeout counts as a transport failure that feeds the route breaker.
      requestTimeoutMs: positiveInt(env.AGENT_CORE_AI_REQUEST_TIMEOUT_MS, 180_000),
      // 60 (was 24): real coding tasks need more rounds, and an over-limit turn loses its tool context (user decision 2026-10-30).
      maxToolIterations: positiveInt(env.AGENT_CORE_AI_MAX_TOOL_ITERATIONS, 60),
      // Goal mode runs in resumable windows of this size; a window end parks the turn instead of failing it.
      goalMaxToolIterations: positiveInt(env.AGENT_CORE_AI_GOAL_MAX_TOOL_ITERATIONS, 200),
      allowedTools: [...new Set(list(env.AGENT_CORE_AI_ALLOWED_TOOLS))].slice(0, 128),
      capabilityPolicy: capabilityPolicy(env.AGENT_CORE_AI_CAPABILITY_POLICY),
      allowedCapabilities: capabilityFamilies(env.AGENT_CORE_AI_ALLOWED_CAPABILITIES),
    },
    webResearch: {
      enabled: bool(env.AGENT_CORE_WEB_RESEARCH_ENABLED, true),
      exaApiKey: env.EXA_API_KEY?.trim() || null,
      parallelApiKey: env.PARALLEL_API_KEY?.trim() || null,
      jinaApiKey: env.JINA_API_KEY?.trim() || null,
      firecrawlApiKey: env.FIRECRAWL_API_KEY?.trim() || null,
      openAlexApiKey: env.OPENALEX_API_KEY?.trim() || null,
      pexelsApiKey: env.PEXELS_API_KEY?.trim() || null,
      unsplashAccessKey: env.UNSPLASH_ACCESS_KEY?.trim() || null,
      browserbaseApiKey: env.BROWSERBASE_API_KEY?.trim() || null,
      apifyToken: env.APIFY_TOKEN?.trim() || null,
      langfusePublicKey: env.LANGFUSE_PUBLIC_KEY?.trim() || null,
      langfuseSecretKey: env.LANGFUSE_SECRET_KEY?.trim() || null,
      langfuseBaseUrl: env.LANGFUSE_BASE_URL?.trim() || null,
      timeoutMs: positiveInt(env.AGENT_CORE_WEB_RESEARCH_TIMEOUT_MS, 30_000),
    },
    agentUiToken: env.AGENT_CORE_UI_TOKEN?.trim() || null,
    semanticIde: {
      enabled: bool(env.AGENT_CORE_SEMANTIC_IDE_ENABLED, true),
      projectRoot,
      runtimeDir: semanticIdeRuntimeDir,
      startupTimeoutMs: positiveInt(env.AGENT_CORE_SEMANTIC_IDE_STARTUP_TIMEOUT_MS, 30_000),
      callTimeoutMs: positiveInt(env.AGENT_CORE_SEMANTIC_IDE_CALL_TIMEOUT_MS, 15_000),
      typescriptServerPath,
      typescriptTsserverPath,
      ...(env.AGENT_CORE_SEMANTIC_IDE_PYTHON_SERVER?.trim() ? {
        pythonServerPath: resolvePortableProjectPath(
          projectRoot,
          env.AGENT_CORE_SEMANTIC_IDE_PYTHON_SERVER,
          path.join('runtime', 'semantic-ide', 'providers', 'python', 'node_modules', 'pyright', 'langserver.index.js'),
        ),
      } : {}),
      ...(env.AGENT_CORE_SEMANTIC_IDE_CSHARP_SERVER?.trim() ? {
        csharpServerPath: resolvePortableProjectPath(
          projectRoot,
          env.AGENT_CORE_SEMANTIC_IDE_CSHARP_SERVER,
          path.join('runtime', 'semantic-ide', 'providers', 'csharp', 'roslyn', 'Microsoft.CodeAnalysis.LanguageServer.dll'),
        ),
      } : {}),
      ...(env.AGENT_CORE_SEMANTIC_IDE_DOTNET?.trim() ? {
        dotnetPath: resolvePortableProjectPath(
          projectRoot,
          env.AGENT_CORE_SEMANTIC_IDE_DOTNET,
          path.join('runtime', 'semantic-ide', 'providers', 'csharp', 'dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'),
        ),
      } : {}),
      ...(env.AGENT_CORE_SEMANTIC_IDE_POWERSHELL_EDITOR_SERVICES?.trim() ? {
        powershellEditorServicesPath: resolvePortableProjectPath(
          projectRoot,
          env.AGENT_CORE_SEMANTIC_IDE_POWERSHELL_EDITOR_SERVICES,
          path.join('runtime', 'semantic-ide', 'providers', 'powershell', 'PowerShellEditorServices', 'Start-EditorServices.ps1'),
        ),
      } : {}),
      serversFile: semanticIdeServersFile,
    },
  };
}
