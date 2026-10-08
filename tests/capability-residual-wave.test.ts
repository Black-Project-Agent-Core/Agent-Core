import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BoundedJsonlEventLog } from '../src/persistence/bounded-event-log.js';
import { decideToolEvidenceCapture } from '../src/security/evidence-capture-policy.js';
import { ToolHistory } from '../src/rdc/utils/toolHistory.js';
import { searchMemories } from '../src/memory/retrieval.js';
import type { SemanticSearchContext } from '../src/memory/index.js';
import type { MemoryRecord } from '../src/memory/types.js';
import {
  parseSkillMarkdown,
  sanitizeSkillArchivePath,
  SkillService,
} from '../src/skills/service.js';

const roots: string[] = [];
const histories: ToolHistory[] = [];
async function tempRoot(prefix: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(histories.splice(0).map(history => history.cleanup()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
function memory(id: string, content: string, extra: Partial<MemoryRecord> = {}): MemoryRecord {
  const stamp = '2026-09-27T00:00:00.000Z';
  return {
    version: 1,
    id,
    content,
    keywords: [],
    context: 'General',
    tags: [],
    category: 'test',
    links: [],
    createdAt: stamp,
    updatedAt: stamp,
    lastAccessedAt: null,
    retrievalCount: 0,
    evolutionHistory: [],
    pinned: false,
    ...extra,
  };
}

describe('PRIME-P4 bounded evidence log', () => {
  it('treats only the incomplete final append as uncommitted and repairs it before the next append', async () => {
    const root = await tempRoot('agent-core-event-log-');
    const file = path.join(root, 'events.jsonl');
    const log = new BoundedJsonlEventLog(file, { maxBytes: 4096, maxRecords: 20 });
    log.appendSync([{ id: 'committed' }], { durable: true });
    await appendFile(file, '{"id":"partial"');
    expect(log.replaySync(line => JSON.parse(line))).toEqual([{ id: 'committed' }]);
    log.appendSync([{ id: 'next' }]);
    expect(log.replaySync(line => JSON.parse(line))).toEqual([{ id: 'committed' }, { id: 'next' }]);
    expect(await readFile(file, 'utf8')).not.toContain('partial');
  });

  it('fails closed on malformed interior committed data', async () => {
    const root = await tempRoot('agent-core-event-log-corrupt-');
    const file = path.join(root, 'events.jsonl');
    await writeFile(file, '{"id":"one"}\nnot-json\n{"id":"two"}\n');
    const log = new BoundedJsonlEventLog(file, { maxBytes: 4096, maxRecords: 20 });
    expect(() => log.replaySync(line => JSON.parse(line))).toThrow();
  });
});
describe('AIM-P6 evidence capture policy', () => {
  it('applies the most restrictive matching workspace rule without changing tool execution', async () => {
    const root = await tempRoot('agent-core-evidence-policy-');
    await writeFile(path.join(root, '.agent-core-evidence.json'), JSON.stringify({
      version: 1,
      default: 'full',
      rules: [
        { pattern: 'secret/**', disposition: 'omit' },
        { pattern: 'metadata/**', disposition: 'metadata-only' },
      ],
    }));
    const secret = decideToolEvidenceCapture('read_file', { path: path.join(root, 'secret', 'a.txt') });
    expect(secret).toMatchObject({ disposition: 'omit', policyState: 'active', pathCount: 1 });

    const mixed = decideToolEvidenceCapture('read_multiple_files', {
      paths: [path.join(root, 'public.txt'), path.join(root, 'metadata', 'a.txt')],
    });
    expect(mixed).toMatchObject({ disposition: 'metadata-only', policyState: 'active', pathCount: 2 });

    expect(decideToolEvidenceCapture('write_file', {})).toMatchObject({
      disposition: 'metadata-only',
      policyState: 'invalid',
    });
    expect(decideToolEvidenceCapture('read_multiple_files', {
      paths: Array.from({ length: 33 }, (_, index) => path.join(root, 'public', String(index))),
    })).toMatchObject({
      disposition: 'metadata-only',
      policyState: 'invalid',
      pathCount: 0,
    });
  });

  it('keeps ToolHistory metadata-only and omit decisions free of raw details', async () => {
    const root = await tempRoot('agent-core-history-policy-');
    const history = new ToolHistory(root);
    histories.push(history);
    const output = { isError: true, content: [{ type: 'text', text: 'secret-result' }] } as any;
    expect(history.addCall('read_file', { path: 'secret-path' }, output, 4, {
      disposition: 'metadata-only', policyState: 'active', pathCount: 1, ruleCount: 1, markerCount: 1,
    })).toBe(true);
    expect(history.addCall('read_file', { path: 'hidden' }, output, 4, {
      disposition: 'omit', policyState: 'active', pathCount: 1, ruleCount: 1, markerCount: 1,
    })).toBe(false);
    const calls = history.getRecentCalls({ maxResults: 10 });
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain('secret-path');
    expect(JSON.stringify(calls)).not.toContain('secret-result');
    expect(calls[0]?.capture?.disposition).toBe('metadata-only');
  });
});
describe('MEMOS-P4 fusion retrieval', () => {
  it('is opt-in, requires exact confirmation for concrete identifiers, and exposes selection evidence', () => {
    const exact = memory('exact', 'fix src/auth/token-cache.ts retry handling', {
      provenance: { files: ['src/auth/token-cache.ts'] },
    });
    const semanticOnly = memory('semantic', 'fix authentication retry handling');
    const legacy = searchMemories([semanticOnly, exact], 'src/auth/token-cache.ts', {
      limit: 2, maxNeighbors: 0, rankingProfile: 'legacy',
    });
    expect(legacy.length).toBeGreaterThan(0);

    const semantic: SemanticSearchContext = {
      queryVector: [1, 0],
      vectors: new Map([
        ['exact', [0.8, 0.2]],
        ['semantic', [1, 0]],
      ]),
    };
    const fusion = searchMemories([semanticOnly, exact], 'src/auth/token-cache.ts', {
      limit: 2, maxNeighbors: 0, rankingProfile: 'fusion',
    }, semantic);
    expect(fusion.map(row => row.record.id)).toEqual(['exact']);
    expect(fusion[0]?.selection?.profile).toBe('fusion');
    expect(fusion[0]?.selection?.channels.length).toBeGreaterThanOrEqual(1);
  });

  it('uses semantic redundancy to avoid spending all direct slots on near-identical vectors', () => {
    const records = [
      memory('a', 'quasar deployment alpha'),
      memory('b', 'quasar deployment beta'),
      memory('c', 'quasar deployment alternative'),
    ];
    const semantic: SemanticSearchContext = {
      queryVector: [1, 0],
      vectors: new Map([
        ['a', [1, 0]],
        ['b', [0.999, 0.001]],
        ['c', [0.7, 0.714]],
      ]),
    };
    const results = searchMemories(records, 'quasar deployment', {
      limit: 2, maxNeighbors: 0, rankingProfile: 'fusion',
    }, semantic);
    expect(results).toHaveLength(2);
    expect(results[0]?.selection?.profile).toBe('fusion');
    expect(results.map(row => row.record.id)).toContain('c');
    expect(results.map(row => row.record.id)).not.toContain('b');
  });
});
describe('SK-P4 skill artifacts', () => {
  it('validates strict metadata, imports atomically, packages deterministically, and revalidates its package', async () => {
    const project = await tempRoot('agent-core-skill-project-');
    const source = path.join(project, 'source');
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, 'SKILL.md'), [
      '---',
      'name: test-skill',
      'description: Deterministic test skill',
      'license: Apache-2.0',
      'allowed-tools:',
      '  - read_file',
      'metadata:',
      '  owner: agent-core',
      '---',
      '',
      '# Test Skill',
      '',
    ].join('\n'));
    await writeFile(path.join(source, 'guide.txt'), 'bounded guide\n');

    const service = await SkillService.initialize(project, async value => path.resolve(value));
    const validated = await service.validate(source);
    expect(validated.name).toBe('test-skill');
    expect(validated.allowedTools).toEqual(['read_file']);
    const imported = await service.import(source);
    expect(imported.status).toBe('imported');
    expect((await service.import(source)).status).toBe('duplicate');
    expect((await service.list()).map(item => item.name)).toEqual(['test-skill']);
    const packaged = await service.package('test-skill');
    const packagedAgain = await service.package('test-skill');
    expect(packaged.packageDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(packagedAgain.packageDigest).toBe(packaged.packageDigest);
    expect((await service.validate(packaged.packagePath)).digest).toBe(imported.digest);
  });

  it('rejects unsafe archive paths and unsupported frontmatter instead of executing content', () => {
    expect(() => sanitizeSkillArchivePath('../escape.txt')).toThrow('SKILL_ARCHIVE_PATH_ESCAPES_ROOT');
    expect(() => parseSkillMarkdown('---\nname: bad\ndescription: ok\nunknown: x\n---\n')).toThrow(
      'SKILL_FRONTMATTER_KEY_UNSUPPORTED',
    );
  });
});

describe('SK-P5 skill effectiveness evaluator', () => {
  it('computes comparable repeated-run statistics without mutating skills', async () => {
    const { evaluateSkillEffectiveness } = await import('../scripts/verify/skill-effectiveness-eval.mjs');
    const fixture = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      tasks: [{ id: 'task-a' }, { id: 'task-b' }],
    }));
    const observations = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      skill: { name: 'test-skill', digest: 'sha256:' + '1'.repeat(64) },
      controller: { id: 'fixture-controller' },
      manifestFingerprint: 'sha256:' + '2'.repeat(64),
      runs: [
        { taskId: 'task-a', condition: 'skill', run: 1, complete: true, correct: true, durationMs: 10, toolCalls: 1, errorCount: 0, outputChars: 100 },
        { taskId: 'task-a', condition: 'skill', run: 2, complete: true, correct: true, durationMs: 12, toolCalls: 1, errorCount: 0, outputChars: 110 },
        { taskId: 'task-a', condition: 'control', run: 1, complete: true, correct: false, durationMs: 8, toolCalls: 2, errorCount: 1, outputChars: 90 },
        { taskId: 'task-a', condition: 'control', run: 2, complete: true, correct: true, durationMs: 9, toolCalls: 2, errorCount: 0, outputChars: 95 },
        { taskId: 'task-b', condition: 'skill', run: 1, complete: true, correct: true, durationMs: 11, toolCalls: 1, errorCount: 0, outputChars: 105 },
        { taskId: 'task-b', condition: 'skill', run: 2, complete: true, correct: true, durationMs: 13, toolCalls: 1, errorCount: 0, outputChars: 115 },
        { taskId: 'task-b', condition: 'control', run: 1, complete: true, correct: false, durationMs: 7, toolCalls: 2, errorCount: 1, outputChars: 80 },
        { taskId: 'task-b', condition: 'control', run: 2, complete: true, correct: true, durationMs: 8, toolCalls: 2, errorCount: 0, outputChars: 85 },
      ],
    }));
    const report = evaluateSkillEffectiveness(fixture, observations, { minimumRuns: 2 });
    expect(report).toMatchObject({
      ok: true,
      complete: true,
      advisoryOnly: true,
      mutatesSkills: false,
      taskCount: 2,
      runCount: 8,
    });
    expect(report.delta.accuracy).toBe(0.5);
    expect(report.configurations.skill.accuracy.count).toBe(4);
    expect(report.configurations.control.accuracy.count).toBe(4);
  });
});
