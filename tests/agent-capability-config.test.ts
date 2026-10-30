import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('Native Agent capability configuration', () => {
  it('defaults the tool iteration cap to 60 and lets the environment override it', () => {
    expect(loadConfig({}, process.cwd()).agentRuntime.maxToolIterations).toBe(60);
    expect(loadConfig({ AGENT_CORE_AI_MAX_TOOL_ITERATIONS: '12' }, process.cwd()).agentRuntime.maxToolIterations).toBe(12);
  });

  it('loads dynamic capability policy, family ceiling and web research settings without changing explicit defaults', () => {
    const configured = loadConfig({
      AGENT_CORE_AI_ENABLED: 'true',
      AGENT_CORE_AI_CAPABILITY_POLICY: 'dynamic',
      AGENT_CORE_AI_ALLOWED_CAPABILITIES: 'observe.local,files.mutate,web.research',
      AGENT_CORE_AI_ALLOWED_TOOLS: '',
      AGENT_CORE_WEB_RESEARCH_ENABLED: 'true',
      AGENT_CORE_WEB_RESEARCH_TIMEOUT_MS: '45000',
      EXA_API_KEY: 'fixture-exa',
      PARALLEL_API_KEY: 'fixture-parallel',
      JINA_API_KEY: 'fixture-jina',
      FIRECRAWL_API_KEY: 'fixture-firecrawl',
      OPENALEX_API_KEY: 'fixture-openalex',
      PEXELS_API_KEY: 'fixture-pexels',
      UNSPLASH_ACCESS_KEY: 'fixture-unsplash',
      BROWSERBASE_API_KEY: 'fixture-browserbase',
      APIFY_TOKEN: 'fixture-apify',
      LANGFUSE_PUBLIC_KEY: 'fixture-langfuse-public',
      LANGFUSE_SECRET_KEY: 'fixture-langfuse-secret',
      LANGFUSE_BASE_URL: 'https://us.cloud.langfuse.com',
    }, process.cwd());
    expect(configured.agentRuntime.capabilityPolicy).toBe('dynamic');
    expect(configured.agentRuntime.allowedCapabilities).toEqual([
      'observe.local',
      'files.mutate',
      'web.research',
    ]);
    expect(configured.agentRuntime.allowedTools).toEqual([]);
    expect(configured.webResearch).toEqual({
      enabled: true,
      exaApiKey: 'fixture-exa',
      parallelApiKey: 'fixture-parallel',
      jinaApiKey: 'fixture-jina',
      firecrawlApiKey: 'fixture-firecrawl',
      openAlexApiKey: 'fixture-openalex',
      pexelsApiKey: 'fixture-pexels',
      unsplashAccessKey: 'fixture-unsplash',
      browserbaseApiKey: 'fixture-browserbase',
      apifyToken: 'fixture-apify',
      langfusePublicKey: 'fixture-langfuse-public',
      langfuseSecretKey: 'fixture-langfuse-secret',
      langfuseBaseUrl: 'https://us.cloud.langfuse.com',
      timeoutMs: 45_000,
    });

    const defaults = loadConfig({}, process.cwd());
    expect(defaults.agentRuntime.capabilityPolicy).toBe('explicit');
    expect(defaults.agentRuntime.allowedCapabilities).toEqual([]);
    expect(defaults.agentRuntime.allowedTools).toEqual([]);
    expect(defaults.agentRuntime.anthropicPromptCaching).toBe(true);
    expect(loadConfig({ ANTHROPIC_API_KEY_01: 'fixture' }, process.cwd()).agentRuntime.providers?.find(item => item.id === 'anthropic')?.models)
      .toEqual(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']);
    expect(loadConfig({ ANTHROPIC_PROMPT_CACHING: 'false' }, process.cwd()).agentRuntime.anthropicPromptCaching).toBe(false);
  });

  it('defaults the Anthropic route to Fable 5.1 and lets ANTHROPIC_MODEL override it', () => {
    const anthropic = (env: Record<string, string>) =>
      loadConfig({ ANTHROPIC_API_KEY_01: 'fixture', ...env }, process.cwd()).agentRuntime.providers?.find(item => item.id === 'anthropic');
    expect(anthropic({})?.model).toBe('claude-fable-5-1');
    expect(anthropic({ ANTHROPIC_MODEL: 'claude-opus-5-5' })?.model).toBe('claude-opus-5-5');
  });

  it('rejects unknown capability families and policy modes', () => {
    expect(() => loadConfig({
      AGENT_CORE_AI_ALLOWED_CAPABILITIES: 'observe.local,unknown.family',
    }, process.cwd())).toThrow('AGENT_CORE_AI_ALLOWED_CAPABILITY_INVALID:unknown.family');
    expect(() => loadConfig({
      AGENT_CORE_AI_CAPABILITY_POLICY: 'everything',
    }, process.cwd())).toThrow('AGENT_CORE_AI_CAPABILITY_POLICY_INVALID');
  });
});
