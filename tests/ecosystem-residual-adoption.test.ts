import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpMutationSafety } from '../src/mcp/mutation-safety.js';
import type { MemoryEmbedder } from '../src/memory/embedder.js';
import { MemoryService } from '../src/memory/service.js';
import { applyFeedbackSalience } from '../src/memory/feedback.js';
import { scoreMemoryRetention } from '../src/learning/retention-score.js';
import { SkillService } from '../src/skills/service.js';

const roots: string[] = [];

async function tempRoot(prefix: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function invocationCtx(id?: string) {
  return {
    mcpReq: {
      _meta: id ? { 'io.agentcore/invocation-id': id } : {},
    },
  };
}
function resultText(value: any): string {
  return String(value?.content?.[0]?.text ?? '');
}

describe('AC-ECO-P1/P2 MCP mutation safety', () => {
  it('serializes same-id receipt, never replays uncertain work, and remembers completion across restart', async () => {
    const root = await tempRoot('agent-core-mutation-safety-');
    const safety = McpMutationSafety.initialize(root);
    let executions = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });

    const first = safety.runMutation(
      'caller-a',
      'write_file',
      { path: 'a.txt', content: 'one' },
      invocationCtx('same-command'),
      async () => {
        executions += 1;
        await gate;
        return { content: [{ type: 'text', text: 'done' }] };
      },
    );
    await vi.waitFor(() => expect(executions).toBe(1));

    const duplicateWhileRunning = await safety.runMutation(
      'caller-a',
      'write_file',
      { content: 'one', path: 'a.txt' },
      invocationCtx('same-command'),
      async () => {
        executions += 1;
        return { content: [{ type: 'text', text: 'should-not-run' }] };
      },
    );
    expect(duplicateWhileRunning.isError).toBe(true);
    expect(resultText(duplicateWhileRunning)).toContain('UNCERTAIN');
    expect(executions).toBe(1);

    release();
    await first;

    const restarted = McpMutationSafety.initialize(root);
    const completed = await restarted.runMutation(
      'caller-a',
      'write_file',
      { path: 'a.txt', content: 'one' },
      invocationCtx('same-command'),
      async () => {
        executions += 1;
        return { content: [{ type: 'text', text: 'should-not-run' }] };
      },
    );
    expect(completed.isError).not.toBe(true);
    expect(resultText(completed)).toContain('ALREADY_COMPLETED');
    expect(executions).toBe(1);

    const mismatch = await restarted.runMutation(
      'caller-a',
      'write_file',
      { path: 'a.txt', content: 'different' },
      invocationCtx('same-command'),
      async () => ({ content: [] }),
    );
    expect(mismatch.isError).toBe(true);
    expect(resultText(mismatch)).toContain('MISMATCH');

    const journal = await readFile(path.join(root, 'mutation-invocations.jsonl'), 'utf8');
    expect(journal).not.toContain('same-command');
    expect(journal).not.toContain('caller-a');
  });

  it('drains admitted mutations and refuses new mutations after graceful drain begins', async () => {
    const root = await tempRoot('agent-core-mutation-drain-');
    const safety = McpMutationSafety.initialize(root);
    let executions = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });

    const first = safety.runMutation('caller', 'write_file', {}, invocationCtx(), async () => {
      executions += 1;
      await gate;
      return { content: [] };
    });
    await vi.waitFor(() => expect(executions).toBe(1));

    safety.beginDraining();
    const refused = await safety.runMutation('caller', 'move_file', {}, invocationCtx(), async () => {
      executions += 1;
      return { content: [] };
    });
    expect(refused.isError).toBe(true);
    expect(resultText(refused)).toMatch(/draining/i);
    expect(executions).toBe(1);
    expect(await safety.waitForDrain(5)).toBe(false);

    release();
    await first;
    expect(await safety.waitForDrain(100)).toBe(true);
    expect(safety.status().activeMutations).toBe(0);
  });
});

class FakeEmbedder implements MemoryEmbedder {
  readonly identity = { provider: 'fake', model: 'ecosystem-v1', dimensions: 3 };
  fail = false;
  calls = 0;
  batches: string[][] = [];
  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.calls += 1;
    this.batches.push([...texts]);
    if (this.fail) throw new Error('temporary embedding outage');
    return texts.map((_, index) => index % 2 === 0 ? [1, 0, 0] : [0, 1, 0]);
  }
}
async function memoryRoot(): Promise<string> {
  const root = await tempRoot('agent-core-memory-ecosystem-');
  await mkdir(path.join(root, 'notes'), { recursive: true });
  await writeFile(path.join(root, '00-agent-core-memory.md'), '# Test Agent Core Foundational Memory\n', 'utf8');
  return root;
}

describe('AC-ECO-P3 durable embedding repair', () => {
  it('persists bounded repair state, defers foreground retries, and force-repairs explicitly', async () => {
    const root = await memoryRoot();
    const embedder = new FakeEmbedder();
    const memory = await MemoryService.initialize(process.cwd(), root, embedder);
    expect(memory.health().embedding).toBe('available');

    embedder.fail = true;
    const record = await memory.remember({
      content: 'embedding repair durable fact',
      keywords: ['repair'],
      category: 'test',
    });
    expect(record.content).toContain('embedding repair');
    expect(memory.health().canonicalStore).toBe('available');
    expect(memory.health().embedding).toBe('degraded');
    expect((await memory.embeddingRepairStatus()).pending).toBeGreaterThanOrEqual(1);

    const callsAfterFailure = embedder.calls;
    const repairBeforeSearch = await memory.embeddingRepairStatus();
    embedder.fail = false;
    await memory.search('repair', { rankingProfile: 'bm25' });
    expect(embedder.calls).toBe(callsAfterFailure + 1);
    expect(embedder.batches.at(-1)).toEqual(['repair']);
    expect(await memory.embeddingRepairStatus()).toEqual(repairBeforeSearch);

    await memory.reindex();
    expect(memory.health().embedding).toBe('available');
    expect(await memory.embeddingRepairStatus()).toMatchObject({ pending: 0, failed: 0 });
  });
});

describe('AC-ECO-P4 skill routing holdout evaluator', () => {
  it('creates a deterministic stratified holdout and exposes train-only improvement evidence', async () => {
    const { evaluateSkillRouting } = await import('../scripts/verify/skill-routing-eval.mjs');
    const queries = Array.from({ length: 8 }, (_, index) => ({
      id: 'q' + (index + 1),
      query: 'query ' + (index + 1),
      shouldTrigger: index < 4,
    }));
    const fixture = Buffer.from(JSON.stringify({ schemaVersion: 1, queries }));
    const runs = queries.flatMap(query => [1, 2].map(run => ({
      queryId: query.id,
      run,
      complete: true,
      triggered: query.shouldTrigger,
    })));
    const observations = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      skill: { name: 'route-skill', digest: 'sha256:' + '1'.repeat(64) },
      controller: { id: 'fixture-controller' },
      manifestFingerprint: 'sha256:' + '2'.repeat(64),
      runs,
    }));
    const one = evaluateSkillRouting(fixture, observations, { minimumRuns: 2, holdout: 0.25, seed: 42 });
    const two = evaluateSkillRouting(fixture, observations, { minimumRuns: 2, holdout: 0.25, seed: 42 });
    expect(one.ok).toBe(true);
    expect(one.split).toEqual(two.split);
    expect(one.holdout.metrics.balancedAccuracy).toBe(1);
    expect(one.train.metrics.balancedAccuracy).toBe(1);
    expect(one.split.trainIds.some(id => one.split.holdoutIds.includes(id))).toBe(false);
    expect(one.improvementView.queryIds).toEqual(one.split.trainIds);
    expect(one.improvementView.queryIds.some(id => one.split.holdoutIds.includes(id))).toBe(false);
    expect(one.mutatesSkills).toBe(false);
  });
});

async function writeSkill(root: string, name: string, description: string, body: string) {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'SKILL.md'), [
    '---',
    'name: ' + name,
    'description: ' + description,
    'license: Apache-2.0',
    '---',
    '',
    body,
    '',
  ].join('\n'));
}

describe('AC-ECO-P5 skill revision lifecycle', () => {
  it('stages non-active revisions, promotes with expected digest, and rolls back explicitly', async () => {
    const project = await tempRoot('agent-core-skill-revision-');
    const v1 = path.join(project, 'v1');
    const v2 = path.join(project, 'v2');
    await writeSkill(v1, 'revision-skill', 'Revision skill v1', '# Version One');
    await writeSkill(v2, 'revision-skill', 'Revision skill v2', '# Version Two');

    const service = await SkillService.initialize(project, async value => path.resolve(value));
    const imported = await service.import(v1);
    const staged = await service.stageRevision(v2, [
      'skill-effectiveness:sha256:' + 'a'.repeat(64),
      'skill-routing:sha256:' + 'b'.repeat(64),
    ]);
    expect(staged.status).toBe('staged');
    expect((await service.inspect('revision-skill')).digest).toBe(imported.digest);

    await expect(service.promoteRevision(
      'revision-skill',
      staged.digest,
      'sha256:' + '0'.repeat(64),
      'PROMOTE_SKILL_REVISION',
    )).rejects.toThrow('SKILL_REVISION_ACTIVE_DIGEST_MISMATCH');

    const promoted = await service.promoteRevision(
      'revision-skill',
      staged.digest,
      imported.digest,
      'PROMOTE_SKILL_REVISION',
      'CONFIRM_SKILL_SOURCE_CHANGE',
    );
    expect(promoted.status).toBe('promoted');
    expect((await service.inspect('revision-skill')).digest).toBe(staged.digest);
    const revisions = await service.listRevisions('revision-skill');
    expect(revisions.history.map(item => item.digest)).toContain(imported.digest);
    expect(revisions.staged).toHaveLength(0);

    const rolled = await service.rollbackRevision(
      'revision-skill',
      imported.digest,
      staged.digest,
      'ROLLBACK_SKILL_REVISION',
    );
    expect(rolled.status).toBe('rolled-back');
    expect((await service.inspect('revision-skill')).digest).toBe(imported.digest);
  });
});

describe('AC-ECO-P6/P7 Memory feedback and guarded retirement review', () => {
  it('keeps feedback auxiliary/idempotent and refuses deletion from stale review evidence', async () => {
    const root = await memoryRoot();
    const memory = await MemoryService.initialize(process.cwd(), root);
    const record = await memory.remember({
      content: 'retirement review original content',
      category: 'review-test',
    });

    const first = await memory.feedback(record.id, 'feedback-1', 'stale');
    const duplicate = await memory.feedback(record.id, 'feedback-1', 'stale');
    expect(first).toMatchObject({ duplicate: false, salience: 0.25 });
    expect(duplicate).toMatchObject({ duplicate: true, salience: 0.25 });
    expect((await memory.read(record.id, false))?.content).toBe('retirement review original content');

    expect(applyFeedbackSalience(2, 'helpful')).toBe(2);
    expect(applyFeedbackSalience(0.25, 'not-helpful')).toBe(0.25);
    expect(applyFeedbackSalience(2, 'wrong')).toBe(0.25);

    const current = await memory.read(record.id, false);
    expect(scoreMemoryRetention(current!, Date.now(), 0.25)!.score)
      .toBeLessThan(scoreMemoryRetention(current!, Date.now(), 1)!.score);

    const preview = await memory.retirementReview({ limit: 10 });
    const candidate = preview.candidates.find(item => item.id === record.id);
    expect(preview.mutatesMemory).toBe(false);
    expect(candidate?.reasons).toContain('explicit-stale-or-wrong-feedback');
    expect(await memory.read(record.id, false)).not.toBeNull();

    await memory.update(record.id, { content: 'retirement review refreshed content' });
    await expect(memory.delete(record.id, candidate!.reviewFingerprint))
      .rejects.toThrow('MEMORY_RETIREMENT_REVIEW_STALE');

    const refreshed = await memory.retirementReview({ limit: 10 });
    const freshCandidate = refreshed.candidates.find(item => item.id === record.id);
    expect(freshCandidate?.reviewFingerprint).not.toBe(candidate?.reviewFingerprint);
    expect(await memory.delete(record.id, freshCandidate!.reviewFingerprint)).toBe(true);
    expect((await memory.feedbackStatus()).recordCount).toBe(0);
  });
});
