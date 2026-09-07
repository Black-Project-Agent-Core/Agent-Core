import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { injectMemoryIntoRoutingContext } from '../src/mcp/memory-injection.js';
import { createRuntimeServices } from '../src/runtime/services.js';

const roots: string[] = [];
const runtimes: Array<ReturnType<typeof createRuntimeServices>> = [];

async function makeRuntime(root: string, dbPath: string) {
  const memory = loadConfig({}, root).memory;
  const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
    ...memory,
    enabled: true,
    dbPath,
    recallItemBudget: 6,
    recallCharacterBudget: 2_400,
  });
  runtimes.push(runtime);
  return runtime;
}

async function seedCanonicalSuperRuntime(runtime: ReturnType<typeof createRuntimeServices>, scope: { principalId: string; projectId: string }) {
  const entries = [
    {
      canonicalKey: 'project.super-runtime.identity',
      facet: 'identity',
      value: 'Super-Runtime is the product: a CPU-first, polyglot, model-flexible local inference runtime with explicit control over memory, storage residency, context/state, and optional accelerators. It is not a Kimi K3 port and not a thin llama.cpp launcher.',
    },
    {
      canonicalKey: 'project.super-runtime.raison-detre',
      facet: 'raison_d_etre',
      value: 'Super-Runtime exists to generalize the architecture-agnostic low-memory and out-of-core runtime mechanisms learned from kimi-k3-in-c onto the multi-model llama.cpp/GGML substrate, without inheriting K3-specific graph, checkpoint, tensor, tokenizer, or state coupling and without rebuilding every model graph and kernel.',
    },
    {
      canonicalKey: 'project.super-runtime.primary-reference',
      facet: 'primary_reference',
      value: 'Primary low-memory runtime-behavior reference: kimi-k3-in-c pinned revision 117e9d29bde14db9742f54fb66a191fd0bf03903.',
    },
    {
      canonicalKey: 'project.super-runtime.production-substrate',
      facet: 'production_substrate',
      value: 'Production compute and model substrate: llama.cpp/GGML pinned revision daef7b6874397a5a7c3d7e38b55e2ee0adf7da38; it supplies multi-model graphs, kernels, and GGUF while Super-Runtime adds explicit resource-governed residency.',
    },
    {
      canonicalKey: 'project.super-runtime.non-goals',
      facet: 'non_goal',
      value: 'Non-goals: do not copy K3-specific neural graph, checkpoint, tensor, tokenizer, or state semantics into the core; Super-Runtime is not a downstream K3 fork and not a thin llama.cpp launcher.',
    },
    {
      canonicalKey: 'project.super-runtime.engineering-target',
      facet: 'engineering_target',
      value: 'The approximately 8 GiB worker is an engineering target that includes model state and context under one global budget; it is not a universal guarantee.',
    },
  ];

  const committed = [];
  for (const entry of entries) {
    committed.push(await runtime.memory.commit({
      scope,
      canonicalKey: entry.canonicalKey,
      kind: 'project_state',
      value: entry.value,
      importance: 1,
      pinned: true,
      sourceType: 'research_fixture',
      sourceRef: 'Super-Runtime/docs/research/PHASE-0-PROJECT-CHARTER.md',
      explicitAnchors: [
        { type: 'subject_alias' as any, value: 'Super-Runtime' },
        { type: 'subject_facet' as any, value: entry.facet },
      ],
    }));
  }
  return committed;
}

async function floodOperationalMemory(runtime: ReturnType<typeof createRuntimeServices>, scope: { principalId: string; projectId: string }) {
  for (let index = 0; index < 18; index += 1) {
    await runtime.memory.commit({
      scope,
      canonicalKey: `operational.super-runtime.hardening.${index.toString().padStart(2, '0')}`,
      kind: index % 2 === 0 ? 'decision' : 'project_state',
      value: `Super-Runtime hardening verification ${index}: Windows test build audit lifecycle memory lease result and recent operational evidence ${'x'.repeat(180)}.`,
      importance: 0.98,
      pinned: index < 6,
      sourceType: 'operational_fixture',
    });
  }
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('canonical project memory', () => {
  it('reserves foundational Super-Runtime facets ahead of newer operational recall and keeps them after restart', async () => {
    const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-canonical-memory-'));
    roots.push(root);
    const dbPath = path.join(root, 'runtime', 'memory', 'canonical.sqlite');
    const scope = { principalId: 'principal-canonical', projectId: root };

    const runtime = await makeRuntime(root, dbPath);
    const canonical = await seedCanonicalSuperRuntime(runtime, scope);
    await floodOperationalMemory(runtime, scope);

    const first = await runtime.memory.preflight({
      scope,
      routeContextId: '11111111-1111-4111-8111-111111111111',
      task: 'Apa tujuan Super-Runtime?',
      expiresAt: Date.now() + 60_000,
    });
    const firstCanonical = (first as any).canonicalSubjectMemory as Array<Record<string, any>>;
    expect(firstCanonical).toBeDefined();
    expect(firstCanonical.map((hit) => hit.canonicalKey)).toEqual(expect.arrayContaining([
      'project.super-runtime.identity',
      'project.super-runtime.raison-detre',
      'project.super-runtime.primary-reference',
      'project.super-runtime.production-substrate',
    ]));
    expect(firstCanonical.find((hit) => hit.canonicalKey === 'project.super-runtime.primary-reference')?.valueText)
      .toContain('kimi-k3-in-c');
    expect(firstCanonical.find((hit) => hit.canonicalKey === 'project.super-runtime.production-substrate')?.valueText)
      .toContain('llama.cpp/GGML');

    const injection = injectMemoryIntoRoutingContext(undefined, first);
    expect((injection as any).canonicalMemoryIds).toEqual(expect.arrayContaining(canonical.slice(0, 4).map((item) => item.memoryId)));
    expect(injection.context).toContain('kimi-k3-in-c');
    expect(injection.context).toContain('llama.cpp/GGML');
    expect(injection.memoryIds).toEqual(expect.arrayContaining(canonical.slice(0, 4).map((item) => item.memoryId)));

    const unrelated = await runtime.memory.preflight({
      scope,
      routeContextId: '22222222-2222-4222-8222-222222222222',
      task: 'Apa tujuan Langflow?',
      expiresAt: Date.now() + 60_000,
    });
    expect((unrelated as any).canonicalSubjectMemory ?? []).toEqual([]);

    await runtime.memory.close();
    runtimes.splice(runtimes.indexOf(runtime), 1);

    const restarted = await makeRuntime(root, dbPath);
    const afterRestart = await restarted.memory.preflight({
      scope,
      routeContextId: '33333333-3333-4333-8333-333333333333',
      task: 'Kenapa Super Runtime dibuat?',
      expiresAt: Date.now() + 60_000,
    });
    const restartedCanonical = (afterRestart as any).canonicalSubjectMemory as Array<Record<string, any>>;
    expect(restartedCanonical.map((hit) => hit.canonicalKey)).toEqual(expect.arrayContaining([
      'project.super-runtime.identity',
      'project.super-runtime.raison-detre',
      'project.super-runtime.primary-reference',
      'project.super-runtime.production-substrate',
    ]));
  });

  it('keeps canonical subject memory principal/project scoped and ignores operational kinds', async () => {
    const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-canonical-scope-'));
    roots.push(root);
    const dbPath = path.join(root, 'runtime', 'memory', 'canonical.sqlite');
    const runtime = await makeRuntime(root, dbPath);
    const scopeA = { principalId: 'principal-a', projectId: `${root}-project-a` };
    const scopeB = { principalId: 'principal-a', projectId: `${root}-project-b` };

    await runtime.memory.commit({
      scope: scopeB,
      canonicalKey: 'project.super-runtime.identity',
      kind: 'project_state',
      value: 'This canonical fact belongs only to project B.',
      importance: 1,
      pinned: true,
      sourceType: 'test',
      explicitAnchors: [
        { type: 'subject_alias', value: 'Super-Runtime' },
        { type: 'subject_facet', value: 'identity' },
      ],
    });
    await runtime.memory.commit({
      scope: scopeA,
      canonicalKey: 'decision.super-runtime.operational',
      kind: 'decision',
      value: 'A recent operational decision must not become canonical identity.',
      importance: 1,
      pinned: true,
      sourceType: 'test',
      explicitAnchors: [
        { type: 'subject_alias', value: 'Super-Runtime' },
        { type: 'subject_facet', value: 'identity' },
      ],
    });

    const preflight = await runtime.memory.preflight({
      scope: scopeA,
      routeContextId: '55555555-5555-4555-8555-555555555555',
      task: 'Apa tujuan Super-Runtime?',
      expiresAt: Date.now() + 60_000,
    });
    expect(preflight.canonicalSubjectMemory).toEqual([]);
  });

  it('does not treat a subject alias as a substring match', async () => {
    const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-canonical-boundary-'));
    roots.push(root);
    const dbPath = path.join(root, 'runtime', 'memory', 'canonical.sqlite');
    const scope = { principalId: 'principal-boundary', projectId: root };
    const runtime = await makeRuntime(root, dbPath);

    await runtime.memory.commit({
      scope,
      canonicalKey: 'project.agent.identity',
      kind: 'project_state',
      value: 'Agent is a deliberately short subject alias fixture.',
      importance: 1,
      pinned: true,
      sourceType: 'test',
      explicitAnchors: [
        { type: 'subject_alias' as any, value: 'Agent' },
        { type: 'subject_facet' as any, value: 'identity' },
      ],
    });

    const preflight = await runtime.memory.preflight({
      scope,
      routeContextId: '44444444-4444-4444-8444-444444444444',
      task: 'Review reagent handling code',
      expiresAt: Date.now() + 60_000,
    });
    expect((preflight as any).canonicalSubjectMemory ?? []).toEqual([]);
  });
});
