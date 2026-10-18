import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GrafelRuntime } from '../src/code-intelligence/grafel-runtime.js';
import { CodePatternLearningSink } from '../src/learning/code-pattern-sink.js';
import type { LearningCandidate } from '../src/learning/types.js';

function okText(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] } as any;
}

function errorText(message: string) {
  return { content: [{ type: 'text', text: message }], isError: true } as any;
}

function candidate(overrides: Partial<LearningCandidate> = {}): LearningCandidate {
  return {
    kind: 'code-pattern',
    content: 'Verify exact current source before relying on graph evidence.',
    evidenceRefs: ['source:AGENTS.md', 'verification:test'],
    verified: true,
    workspace: 'agent-core',
    steps: ['Inspect source', 'Use graph evidence', 'Verify findings'],
    exemplars: ['agent-core::entity-1'],
    tags: ['source-verification'],
    ...overrides,
  };
}

describe('Hermes learning Grafel integration', () => {
  it('records code patterns with Grafel trigger objects and verified entity exemplars', async () => {
    const calls: Array<{ name: string; args: any }> = [];
    const code: any = {
      enabled: true,
      capabilities: () => ({ patterns: true }),
      health: async () => ({ status: 'available', index: 'current' }),
      callProviderTool: async (name: string, args: any) => {
        calls.push({ name, args });
        if (name === 'grafel_patterns' && args.action === 'query') return okText({ patterns: [] });
        if (name === 'grafel_inspect') return okText({
          id: args.entity_id,
          name: 'source graph evidence verifier',
          file: 'src/memory/service.ts',
          signature: 'verify source graph evidence',
          summary: 'Inspect source and verify graph evidence before relying on structural findings.',
        });
        if (name === 'grafel_patterns' && args.action === 'record') return okText({ id: 'pattern-1' });
        throw new Error(`unexpected provider call: ${name}`);
      },
    };

    const sink = new CodePatternLearningSink(code);
    const result = await sink.capture(candidate());
    expect(result.id).toBe('pattern-1');

    const record = calls.find((call) => call.name === 'grafel_patterns' && call.args.action === 'record');
    expect(record?.args.text).toBeUndefined();
    expect(record?.args.trigger).toEqual({
      natural_language: 'Verify exact current source before relying on graph evidence.',
      keywords: ['source-verification'],
    });
    expect(record?.args.exemplars).toEqual(['agent-core::entity-1']);
  });

  it('does not reinterpret generic provenance references as Grafel exemplars', async () => {
    const code: any = {
      enabled: true,
      capabilities: () => ({ patterns: true }),
      health: async () => ({ status: 'available', index: 'current' }),
      callProviderTool: vi.fn(),
    };
    const sink = new CodePatternLearningSink(code);
    await expect(sink.capture(candidate({ exemplars: [] })))
      .rejects.toThrow('requires at least one verified Grafel entity exemplar');
    expect(code.callProviderTool).not.toHaveBeenCalled();
  });

  it('rejects resolvable but textually incoherent exemplars before pattern recording', async () => {
    const calls: Array<{ name: string; args: any }> = [];
    const code: any = {
      enabled: true,
      capabilities: () => ({ patterns: true }),
      health: async () => ({ status: 'available', index: 'current' }),
      callProviderTool: async (name: string, args: any) => {
        calls.push({ name, args });
        if (name === 'grafel_inspect') return okText({
          id: args.entity_id,
          name: 'invoice payment calculator',
          file: 'src/billing/tax.ts',
          summary: 'Compute regional payment totals.',
        });
        if (name === 'grafel_patterns' && args.action === 'record') return okText({ id: 'should-not-record' });
        throw new Error(`unexpected provider call: ${name}`);
      },
    };
    const sink = new CodePatternLearningSink(code);
    await expect(sink.capture(candidate())).rejects.toThrow(/not coherent|insufficient.*coherence/i);
    expect(calls.some((call) => call.name === 'grafel_patterns' && call.args.action === 'record')).toBe(false);
  });

  it('deduplicates using Grafel trigger + steps and preserves provider error detail', async () => {
    const code: any = {
      enabled: true,
      capabilities: () => ({ patterns: true }),
      health: async () => ({ status: 'available', index: 'current' }),
      callProviderTool: async (name: string, args: any) => {
        if (name === 'grafel_patterns' && args.action === 'query') {
          return okText({
            patterns: [{
              id: 'pattern-existing',
              trigger: { natural_language: 'Verify exact current source before relying on graph evidence.' },
              steps: ['Inspect source', 'Use graph evidence', 'Verify findings'],
            }],
          });
        }
        if (name === 'grafel_inspect') return errorText('entity not found: agent-core::entity-1');
        throw new Error('unexpected call');
      },
    };
    const sink = new CodePatternLearningSink(code);
    expect(await sink.findDuplicates(candidate())).toEqual([{
      id: 'pattern-existing',
      reason: 'equivalent Grafel pattern already exists',
    }]);
    await expect(sink.capture(candidate()))
      .rejects.toThrow('entity not found: agent-core::entity-1');
  });

  it('de-interns provider exemplar ids and excludes rejected patterns from journey sampling', async () => {
    const code: any = {
      enabled: true,
      capabilities: () => ({ patterns: true }),
      health: async () => ({ status: 'available', index: 'current' }),
      callProviderTool: async () => okText({
        _id_table: { '@1': 'agent-core::entity-1' },
        patterns: [
          { id: 'active', trigger: { natural_language: 'Active' }, exemplars: ['@1'] },
          { id: 'rejected', trigger: { natural_language: 'Rejected' }, exemplars: ['@1'], reject_reason: 'cleanup' },
        ],
      }),
    };
    const sink = new CodePatternLearningSink(code);
    const patterns = await sink.samplePatterns('agent-core');
    expect(patterns).toHaveLength(1);
    expect(patterns[0].id).toBe('active');
    expect(patterns[0].exemplars).toEqual(['agent-core::entity-1']);
  });
});

describe('Grafel project relocation primitives', () => {
  const root = path.resolve('X:/portable/Agent-Core');
  const config: any = {
    enabled: true,
    projectRoot: root,
    runtimeDir: path.join(root, 'runtime', 'grafel'),
    binaryPath: path.join(root, 'runtime', 'grafel', 'bin', 'grafel.exe'),
    group: 'agent-core',
    repoSlug: 'agent-core',
    startupTimeoutMs: 30_000,
    callTimeoutMs: 15_000,
  };

  it('signals re-registration and provides a synchronous relocation index', async () => {
    const runtime = new GrafelRuntime(config);
    const calls: any[] = [];
    (runtime as any).registrationCurrent = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    (runtime as any).runCli = vi.fn(async (...args: any[]) => {
      calls.push(args);
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    expect(await runtime.registerProject()).toBe(true);
    expect(calls[0][0]).toContain('group');
    expect(calls[0][0]).toContain(`agent-core=${root}`);

    await runtime.indexNowFor(root);
    expect(calls[1][0]).toEqual(['index', root, '--quiet', '--json-stats']);
  });

  it('does not re-register an already-current portable root', async () => {
    const runtime = new GrafelRuntime(config);
    (runtime as any).registrationCurrent = vi.fn().mockResolvedValue(true);
    (runtime as any).runCli = vi.fn();
    expect(await runtime.registerProject()).toBe(false);
    expect((runtime as any).runCli).not.toHaveBeenCalled();
  });
});
