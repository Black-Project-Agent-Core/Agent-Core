import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderStateStore, secretRevisionDigest } from '../src/agent-provider-state.js';
import { ProviderModelReadinessService } from '../src/agent-provider-readiness.js';
import { AgentProviderRequestError, classifyAgentProviderFailure } from '../src/agent-provider-errors.js';
import type { AgentModelTool } from '../src/agent-provider.js';
import { loadConfig } from '../src/config.js';

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'provider-readiness-'));
  roots.push(root);
  const store = new ProviderStateStore(path.join(root, 'provider-state.sqlite'));
  return { root, store, service: new ProviderModelReadinessService(store, 2_000) };
}
const route = { id: 'a', baseUrl: 'http://127.0.0.1:12345/v1', model: 'preferred' };
const credential = { id: 'a:01', secret: 'private-key-one' };
function catalog(data: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } })));
}
function toolResponse(tools: AgentModelTool[]) {
  return { content: null, finishReason: 'tool_calls', toolCalls: [{ id: 'probe', type: 'function' as const,
    function: { name: 'agent_core_model_probe', arguments: JSON.stringify({ nonce: (tools[0]!.function.parameters as any).properties.nonce.enum[0] }) } }] };
}
// Public model metadata in the shape of the Duanyan TokenPlan /models listing (catalog schema 2.4). No credential.
function duanyanEntry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    schema_version: '2.4', id, name: id, object: 'model', owned_by: 'tokenplan', status: 'active', is_ready: true,
    input_modalities: [{ type: 'text', supported_inputs: { max_context_length: { value: 524_288, unit: 'token' } } }],
    output_modalities: [{ type: 'text', max_length: { value: 524_288, unit: 'token' }, streaming: true,
      supported_parameters: { max_tokens: { type: 'integer', min: 1, max: 524_288, unit: 'token' }, tools: { type: 'boolean' } } }],
    capacity: [{ type: 'request', unit: 'request', per: 'minute', value: 3_120 }],
    ...overrides,
  };
}
describe('automatic per-key model readiness', () => {
  it.each([0, 10])('requalifies cached readiness after a model failure at +%ims without changing the credential or cursor', async delay => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(30_000_000);
    const { service, store } = await fixture();
    catalog([{ id: 'preferred', context_length: 131_072, supported_parameters: ['tools'], max_output_tokens: 8_192 }]);
    const probe = vi.fn(async (_model, _messages, tools) => toolResponse(tools));
    const initial = await service.ensure(route, credential, probe);
    const picked = store.selectCredential({ providerId: route.id, model: route.model, trackPool: true,
      expectedPoolRevision: 0, credentials: [{ id: credential.id, ordinal: 1, secretRevisionDigest: secretRevisionDigest(credential.secret) }] });
    vi.setSystemTime(30_000_000 + delay);
    store.recordFailure({ selection: picked.selection!, model: route.model,
      decision: classifyAgentProviderFailure(new AgentProviderRequestError({ status: 404, message: 'HTTP_404' })) });
    const cursor = store.readPoolCursor([route.id]);
    expect(service.read(route, credential)).toMatchObject({ status: 'pending', reason: 'MODEL_REQUALIFICATION_REQUIRED' });
    expect((await service.ensure(route, credential, probe)).status).toBe('pending');
    expect(probe).toHaveBeenCalledTimes(1);
    vi.setSystemTime(30_060_011);
    const ready = await service.ensure(route, credential, probe);
    expect(ready.status).toBe('ready');
    expect(ready.checkedAtMs).toBeGreaterThan(initial.checkedAtMs);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(service.read(route, credential)?.status).toBe('ready');
    expect(store.readPoolCursor([route.id])).toEqual(cursor);
    expect(store.providerHealth(route.id, [{ id: credential.id, ordinal: 1,
      secretRevisionDigest: secretRevisionDigest(credential.secret) }]).invalidCount).toBe(0);
  });

  it('prefers a probed configured model, caches across reconstruction and invalidates on key or endpoint change', async () => {
    const { service, store, root } = await fixture();
    catalog([{ id: 'preferred', context_length: 131_072, supported_parameters: ['tools'], max_output_tokens: 8_192 }]);
    const probe = vi.fn(async (_model, _messages, tools) => toolResponse(tools));
    expect(await service.ensure(route, credential, probe)).toMatchObject({ status: 'ready', model: 'preferred', contextWindowTokens: 131_072 });
    expect(await new ProviderModelReadinessService(store, 2_000).ensure(route, credential, probe)).toMatchObject({ status: 'ready' });
    expect(probe).toHaveBeenCalledTimes(1);
    await service.ensure(route, { ...credential, secret: 'replacement-private-key' }, probe);
    await service.ensure({ ...route, baseUrl: 'http://127.0.0.1:12346/v1' }, credential, probe);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(store.readPoolCursor(['a'])).toBeNull();
    const bytes = Buffer.concat(await Promise.all((await readdir(root)).map(name => readFile(path.join(root, name))))).toString('latin1');
    expect(bytes).not.toContain(credential.secret);
    expect(bytes).not.toContain('replacement-private-key');
  });
  it('tries a compatible catalog alternative when the configured model is outside the key plan', async () => {
    const { service } = await fixture();
    catalog(['preferred', 'alternative'].map(id => ({ id, context_length: 65_536, supported_parameters: ['tools'] })));
    const seen: string[] = [];
    const ready = await service.ensure(route, credential, async (model, _messages, tools) => {
      seen.push(model);
      if (model === 'preferred') throw new AgentProviderRequestError({ status: 401, message: 'unauthorized model access for subscription plan' });
      return toolResponse(tools);
    });
    expect(seen).toEqual(['preferred', 'alternative']);
    expect(ready).toMatchObject({ status: 'ready', model: 'alternative' });
  });
  it.each(['atria', 'gonka'])('pins explicit %s model without probing a catalog alternative', async providerId => {
    const { service } = await fixture();
    const selected = { ...route, id: providerId };
    catalog(['preferred', 'alternative'].map(id => ({ id, context_length: 65_536, supported_parameters: ['tools'] })));
    const probed: string[] = [];
    const result = await service.ensure(selected, credential, async (model) => {
      probed.push(model);
      throw new AgentProviderRequestError({ status: 401, message: 'model unavailable for this plan' });
    });
    expect(probed).toEqual(['preferred']);
    expect(result).toMatchObject({ status: 'pending', model: 'preferred' });
  });
  it.each(['atria', 'gonka'])('does not qualify another %s model when the pinned one is missing', async providerId => {
    const { service } = await fixture();
    const selected = { ...route, id: providerId };
    catalog([{ id: 'alternative', context_length: 65_536, supported_parameters: ['tools'] }]);
    const probe = vi.fn(async (_model, _messages, tools) => toolResponse(tools));
    expect(await service.ensure(selected, credential, probe)).toMatchObject({
      status: 'pending', model: 'preferred', reason: 'MODEL_CONTEXT_OR_TOOLS_UNPROVEN',
    });
    expect(probe).not.toHaveBeenCalled();
  });
  it('qualifies a pinned atria model from a catalog that nests limits per modality (Duanyan schema 2.x)', async () => {
    const { service } = await fixture();
    const selected = { ...route, id: 'atria', model: 'Atria-Dawn' };
    catalog([duanyanEntry('Atria-Dawn-Preview', { status: 'deprecated' }), duanyanEntry('Atria-Dawn')]);
    const probe = vi.fn(async (_model, _messages, tools) => toolResponse(tools));
    expect(await service.ensure(selected, credential, probe)).toMatchObject({
      status: 'ready', model: 'Atria-Dawn', reason: 'MODEL_TOOL_PROBE_VERIFIED',
      contextWindowTokens: 524_288, maxOutputTokens: 524_288,
    });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe.mock.calls[0]![0]).toBe('Atria-Dawn');
  });
  it('keeps a nested-schema model without a tools parameter unqualified and never probes it', async () => {
    const { service } = await fixture();
    const selected = { ...route, id: 'atria', model: 'Atria-Dawn' };
    const withoutTools = duanyanEntry('Atria-Dawn');
    (withoutTools.output_modalities[0] as any).supported_parameters = { max_tokens: { type: 'integer', min: 1, max: 524_288, unit: 'token' } };
    catalog([withoutTools]);
    const probe = vi.fn(async (_model, _messages, tools) => toolResponse(tools));
    expect(await service.ensure(selected, credential, probe)).toMatchObject({ status: 'pending', reason: 'MODEL_CONTEXT_OR_TOOLS_UNPROVEN' });
    expect(probe).not.toHaveBeenCalled();
  });
  it('never probes a nested-schema model that has no text output, such as an embedding model', async () => {
    const { service } = await fixture();
    const embedding = duanyanEntry('preferred');
    (embedding as any).output_modalities = [{ type: 'embedding', dimensions: 1_024 }];
    catalog([embedding]);
    const probe = vi.fn(async (_model, _messages, tools) => toolResponse(tools));
    expect(await service.ensure(route, credential, probe)).toMatchObject({ status: 'pending', reason: 'MODEL_CONTEXT_OR_TOOLS_UNPROVEN' });
    expect(probe).not.toHaveBeenCalled();
  });
  it.each([
    ['false', false],
    ['null', null],
    ['an explicit unsupported flag', { supported: false }],
  ])('treats a nested tools parameter that is %s as no tool support', async (_label, toolsParameter) => {
    const { service } = await fixture();
    const entry = duanyanEntry('preferred');
    (entry.output_modalities[0] as any).supported_parameters = {
      max_tokens: { type: 'integer', min: 1, max: 524_288, unit: 'token' }, tools: toolsParameter,
    };
    catalog([entry]);
    const probe = vi.fn(async (_model, _messages, tools) => toolResponse(tools));
    expect(await service.ensure(route, credential, probe)).toMatchObject({ status: 'pending', reason: 'MODEL_CONTEXT_OR_TOOLS_UNPROVEN' });
    expect(probe).not.toHaveBeenCalled();
  });
  it.each([
    ['a type descriptor', { type: 'boolean' }],
    ['true', true],
    ['an explicit supported flag', { supported: true }],
  ])('qualifies a nested tools parameter given as %s', async (_label, toolsParameter) => {
    const { service } = await fixture();
    const entry = duanyanEntry('preferred');
    (entry.output_modalities[0] as any).supported_parameters = {
      max_tokens: { type: 'integer', min: 1, max: 524_288, unit: 'token' }, tools: toolsParameter,
    };
    catalog([entry]);
    const probe = vi.fn(async (_model, _messages, tools) => toolResponse(tools));
    expect(await service.ensure(route, credential, probe)).toMatchObject({ status: 'ready', reason: 'MODEL_TOOL_PROBE_VERIFIED' });
    expect(probe).toHaveBeenCalledTimes(1);
  });
  it('lets OpenRouter-style top-level limits win over the nested schema-2.x fallback', async () => {
    const { service } = await fixture();
    catalog([{ ...duanyanEntry('preferred'), context_length: 65_536, max_output_tokens: 4_096 }]);
    const probe = vi.fn(async (_model, _messages, tools) => toolResponse(tools));
    expect(await service.ensure(route, credential, probe)).toMatchObject({
      status: 'ready', contextWindowTokens: 65_536, maxOutputTokens: 4_096,
    });
  });
  it('qualifies a pinned gonka model whose catalog lists only its id when the owner declares capacity in .env', async () => {
    const { service } = await fixture();
    // Shape returned by api.gonkarouter.io /models on 2026-10-26: no context, output or tools metadata.
    catalog([{ id: 'deepseek-ai/DeepSeek-V4-Flash-0731', object: 'model' }]);
    const probe = vi.fn(async (_model, _messages, tools) => toolResponse(tools));
    const base = loadConfig({ GONKA_BASE_URL: 'http://127.0.0.1:12345/v1', GONKA_MODEL: 'deepseek-ai/DeepSeek-V4-Flash-0731',
      GONKA_API_KEY_01: 'gonka-key' }, process.cwd()).agentRuntime.providers!.find(item => item.id === 'gonka')!;
    expect(base.continuation).toBeUndefined();
    expect(await service.ensure(base, credential, probe)).toMatchObject({ status: 'pending', reason: 'MODEL_CONTEXT_OR_TOOLS_UNPROVEN' });
    const declared = loadConfig({ GONKA_BASE_URL: 'http://127.0.0.1:12345/v1', GONKA_MODEL: 'deepseek-ai/DeepSeek-V4-Flash-0731',
      GONKA_API_KEY_01: 'gonka-key', GONKA_CONTEXT_WINDOW_TOKENS: '131072', GONKA_MAX_OUTPUT_TOKENS: '8192' },
    process.cwd()).agentRuntime.providers!.find(item => item.id === 'gonka')!;
    expect(await service.ensure(declared, { ...credential, id: 'a:02' }, probe)).toMatchObject({
      status: 'ready', reason: 'MODEL_TOOL_PROBE_VERIFIED', contextWindowTokens: 131_072, maxOutputTokens: 8_192,
    });
    expect(probe).toHaveBeenCalledTimes(1);
    const halfDeclared = loadConfig({ GONKA_BASE_URL: 'http://127.0.0.1:12345/v1', GONKA_MODEL: 'm', GONKA_CONTEXT_WINDOW_TOKENS: '131072' },
      process.cwd()).agentRuntime.providers!.find(item => item.id === 'gonka')!;
    expect(halfDeclared.continuation).toBeUndefined();
  });

  it('keeps unknown context, inaccessible catalogs and unproven tool responses pending or unavailable', async () => {
    const { service } = await fixture();
    const probe = vi.fn(async () => ({ content: 'I support tools', toolCalls: [], finishReason: 'stop' }));
    catalog([{ id: 'preferred', supported_parameters: ['tools'] }]);
    expect(await service.ensure(route, credential, probe)).toMatchObject({ status: 'pending', reason: 'MODEL_CONTEXT_OR_TOOLS_UNPROVEN' });
    expect(probe).not.toHaveBeenCalled();
    catalog([{ id: 'preferred', context_length: 8_192 }]);
    expect(await service.ensure(route, { ...credential, id: 'a:02' }, probe)).toMatchObject({ status: 'pending', reason: 'MODEL_ENTITLEMENT_OR_TOOL_PROTOCOL_UNPROVEN' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    expect(await service.ensure(route, { ...credential, id: 'a:03' }, probe)).toMatchObject({ status: 'unavailable', reason: 'MODEL_CATALOG_UNAVAILABLE' });
  });
  it.each([
    [401, 'unauthorized model access for subscription plan', 'MODEL_ACCESS'],
    [400, 'maximum context window exceeded', 'MODEL_CAPACITY'],
    [401, 'invalid API key', 'AUTH_INVALID'],
    [503, 'service unavailable', 'PROVIDER_TRANSIENT'],
  ])('distinguishes HTTP %i %s from credential invalidation', (status, message, failureClass) => {
    const decision = classifyAgentProviderFailure(new AgentProviderRequestError({ status: Number(status), message: String(message) }));
    expect(decision.failureClass).toBe(failureClass);
    expect(decision.terminalCredential).toBe(failureClass === 'AUTH_INVALID');
  });
});
