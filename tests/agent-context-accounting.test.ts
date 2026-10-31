import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  accountContext, completionCap, contextRefusal, OUTPUT_RESERVE_TOKENS, automaticContext, AUTOMATIC_CONTEXT_MAX_BYTES,
} from '../src/agent-context-accounting.js';
import {
  OpenAICompatibleProviderPool, type AgentModelMessage, type AgentModelTool, type AgentProviderConfig,
} from '../src/agent-provider.js';
import { buildKnowledgeSynthesisPacket } from '../src/agent-knowledge-synthesis.js';

const roots: string[] = [];
it('bounds the Native knowledge projection by UTF8 bytes and reports omitted source detail', async () => {
  const packet = await buildKnowledgeSynthesisPacket({ runtime: {}, memoryItems: [], availableTools: [], maxTextBytes: 8192,
    procedures: [], task: { goal: 'Inspect data ' + '漢😀'.repeat(700), episodes: Array.from({ length: 16 }, (_, index) => ({
      id: String(index), at: '2026-10-31T00:00:00Z', kind: 'observation', summary: '漢😀'.repeat(700), evidenceRefs: [],
    })) as any } });
  expect(Buffer.byteLength(packet.text)).toBeLessThanOrEqual(8192);
  expect(packet.coverage).toMatchObject({ unit: 'utf8-bytes', limit: 8192, used: Buffer.byteLength(packet.text) });
  expect(packet.coverage.sections['task-evidence'].detailTruncated).toBe(true);
});
it('bounds total automatic context in UTF8 bytes, keeps expansion pointers and never clips required rules', () => {
  const required = 'MANDATORY_RULES'.repeat(1_000);
  const result = automaticContext(required, Array.from({ length: 12 }, (_, index) => ({
    source: 'memory:' + index, text: '😀漢'.repeat(4_000), expand: 'memory_read id=' + index,
  })));
  expect(Buffer.byteLength(required + '\n\n' + result)).toBeLessThanOrEqual(AUTOMATIC_CONTEXT_MAX_BYTES);
  expect(result).not.toContain('�');
  expect(result).toContain('memory_read id=0');
  expect(result).toContain('not a complete source read');
  expect(() => automaticContext('x'.repeat(AUTOMATIC_CONTEXT_MAX_BYTES), [])).toThrow('REQUIRED_RULES');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const ascii: AgentModelMessage[] = [{ role: 'user', content: 'a'.repeat(4_000) }];
const cjk: AgentModelMessage[] = [{ role: 'user', content: '漢'.repeat(4_000) }];
const bigSchema: AgentModelTool[] = [{
  type: 'function',
  function: {
    name: 'big',
    parameters: { type: 'object', properties: Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => ['field' + index, { type: 'string', description: 'x'.repeat(40) }])) },
  },
}];

describe('context accounting', () => {
  it('counts UTF-8 bytes, so Unicode and tool schemas are not undercounted', () => {
    const plain = accountContext(ascii, []);
    const unicode = accountContext(cjk, []);
    const withSchema = accountContext(ascii, bigSchema);
    expect(unicode.bytes - plain.bytes).toBe(4_000 * 2);
    expect(withSchema.bytes).toBeGreaterThan(plain.bytes + 8_000);
    for (const item of [plain, unicode, withSchema]) {
      expect(item.upperBoundTokens).toBe(item.bytes);
      expect(item.requiredTokens).toBe(item.bytes + OUTPUT_RESERVE_TOKENS);
      expect(item.estimatedTokens).toBeLessThanOrEqual(item.upperBoundTokens);
    }
  });

  it('falls back to the conservative bound without an observation and calibrates with one', () => {
    const heuristic = accountContext(ascii, []);
    expect(heuristic).toMatchObject({ method: 'bytes-per-4', confidence: 'heuristic' });
    expect(heuristic.estimatedTokens).toBe(Math.ceil(heuristic.bytes / 4));
    const calibrated = accountContext(ascii, [], { observed: { inputTokens: 500, bytes: 4_000 } });
    expect(calibrated).toMatchObject({ method: 'observed-ratio', confidence: 'calibrated' });
    expect(calibrated.estimatedTokens).toBeLessThan(calibrated.bytes);
    expect(calibrated.upperBoundTokens).toBe(calibrated.bytes);
    // A nonsense observation (more tokens than bytes) cannot lift the estimate over the hard bound.
    expect(accountContext(ascii, [], { observed: { inputTokens: 50_000, bytes: 100 } }).estimatedTokens)
      .toBe(calibrated.bytes);
    // An unusable observation is ignored.
    expect(accountContext(ascii, [], { observed: { inputTokens: 0, bytes: 100 } }).method).toBe('bytes-per-4');
  });

  it('explains a refusal with both numbers and never refuses what fits', () => {
    const accounting = accountContext(ascii, [], { maxOutputTokens: 256 });
    expect(accounting.outputReserve).toBe(256);
    expect(contextRefusal(accounting, accounting.requiredTokens)).toBeNull();
    const reason = contextRefusal(accounting, accounting.requiredTokens - 1)!;
    expect(reason).toContain('MODEL_CONTEXT_INSUFFICIENT(bytes=' + accounting.bytes);
    expect(reason).toContain(';required=' + accounting.requiredTokens);
    expect(reason).toContain(';estimate=' + accounting.estimatedTokens + '/bytes-per-4');
    expect(completionCap(accounting, { contextWindowTokens: accounting.bytes + 100, maxOutputTokens: 8_192 }))
      .toBe(100);
  });
});

describe('provider pool uses the shared accounting', () => {
  const small: AgentModelMessage[] = [{ role: 'user', content: 'hello' }];
  const large: AgentModelMessage[] = [{ role: 'user', content: 'a'.repeat(10_000) }];

  function poolFixture(root: string, contextLength: number) {
    const config: AgentProviderConfig = {
      enabled: true, baseUrl: null, model: null, apiKey: null, requestTimeoutMs: 2_000, maxToolIterations: 6,
      providers: [{
        id: 'provider-a', baseUrl: 'http://127.0.0.1:65530/v1', model: 'fixture-model',
        credentials: [{ id: 'a:1', secret: 'fixture-secret', ordinal: 1 }],
      }],
      providerOrder: ['provider-a'], maxProviderAttempts: 4,
    };
    const completions = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'fixture-model',
        context_length: contextLength, max_output_tokens: 500, supported_parameters: ['tools'] }] }));
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.tools?.[0]?.function?.name === 'agent_core_model_probe') return new Response(JSON.stringify({ choices: [{
        message: { content: null, tool_calls: [{ id: 'probe', type: 'function', function: {
          name: 'agent_core_model_probe', arguments: JSON.stringify({ nonce: body.tools[0].function.parameters.properties.nonce.enum[0] }),
        } }] }, finish_reason: 'tool_calls' }] }));
      completions();
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 }, model: 'fixture-model' }));
    }));
    return { pool: new OpenAICompatibleProviderPool(config, path.join(root, 'provider-state.json')), completions };
  }

  it('explains a size refusal with the accounting and leaves the route usable for smaller requests', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'context-accounting-'));
    roots.push(root);
    const { pool, completions } = poolFixture(root, 8_000);
    await expect(pool.complete(small, [], 'session-1')).resolves.toMatchObject({ content: 'ok' });
    await expect(pool.complete(large, [], 'session-1')).rejects.toThrow(
      /MODEL_CONTEXT_INSUFFICIENT\(bytes=\d+;required=\d+;window=8000;estimate=\d+\/bytes-per-4\)/);
    expect(completions).toHaveBeenCalledTimes(1);
    // The oversized request must not overwrite the ready verdict: the next small request goes straight through.
    await expect(pool.complete(small, [], 'session-1')).resolves.toMatchObject({ content: 'ok' });
    expect(completions).toHaveBeenCalledTimes(2);
  });

  it('reports the window it knows only after the route was qualified', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'context-accounting-'));
    roots.push(root);
    const { pool } = poolFixture(root, 8_000);
    expect(pool.knownContextWindow()).toBeNull();
    await pool.complete(small, [], 'session-1');
    expect(pool.knownContextWindow()).toBe(8_000);
    expect(pool.knownContextWindow('provider-a')).toBe(8_000);
    expect(pool.knownContextWindow('provider-unknown')).toBeNull();
  });

  it('records provider-reported input tokens as the calibration for later estimates', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'context-accounting-'));
    roots.push(root);
    const { pool } = poolFixture(root, 128_000);
    await pool.complete(small, [], 'session-1');
    const observed = (pool as any).observedInput.get('provider-a::fixture-model');
    expect(observed).toMatchObject({ inputTokens: 10 });
    expect(accountContext(small, [], { observed }).method).toBe('observed-ratio');
  });
});
