import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/verify/skill-pack-lint.mjs', import.meta.url));
const built = existsSync(fileURLToPath(new URL('../dist/skills/service.js', import.meta.url)));

describe('skill pack lint baseline', () => {
  // The lint uses the SkillService parser from dist, so it can only run after a build.
  it.skipIf(!built)('parses every pack with the strict parser and reports the known baseline fields', () => {
    const report = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 60_000 }));
    expect(report.packs).toBeGreaterThan(0);
    expect(report.parserUsed).toContain('parseSkillMarkdown');
    expect(report.errors).toBe(0);
    for (const field of ['overPageBytes', 'sharedNonTriggers', 'withDanglingLinks', 'packsWithFilesOutsideReferences', 'bashWithoutPowerShell', 'upstreamProblems', 'triggerOverlap']) {
      expect(report).toHaveProperty(field);
    }
    expect(report.triggerOverlap).toEqual(expect.objectContaining({ sharedTriggerBullets: expect.any(Array), similarPairs: expect.any(Array), nonTriggerAlsoTriggerElsewhere: expect.any(Array) }));
    expect(report.upstreamBehindOrUnreachable).toBeUndefined();
  }, 120_000);
});

// UP-10 / CHB-11: the Triggers overlap check, run on a synthetic folder so it needs neither a build nor the real packs.
const folder = mkdtempSync(path.join(os.tmpdir(), 'pack-lint-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

const writePack = (name: string, triggers: string[], nonTriggers: string[]) => {
  mkdirSync(path.join(folder, name), { recursive: true });
  writeFileSync(path.join(folder, name, 'SKILL.md'), [
    '---', `name: ${name}`, 'description: "fixture"', '---',
    '## Triggers', ...triggers.map(item => `- ${item}`), '', '## Non-triggers', ...nonTriggers.map(item => `- ${item}`), '', 'Body.', '',
  ].join('\n'));
};

describe('skill pack lint: trigger overlap', () => {
  it('flags shared boilerplate, near-identical Triggers and a Non-triggers entry that is another pack\'s Trigger', () => {
    const boilerplate = 'Apply when the current task matches the upstream purpose and workflow below.';
    const review = 'Review a pull request for correctness and maintainability regressions before merge.';
    writePack('alpha', [review, boilerplate], ['Unrelated work.']);
    writePack('beta', [review, boilerplate], ['Unrelated work.']);
    writePack('gamma', ['Draft a database migration with a rollback plan.', boilerplate], [review]);
    writePack('delta', ['Profile a slow endpoint with a flame graph.', boilerplate], ['Unrelated work.']);
    writePack('epsilon', ['Write a runbook for an on-call rotation.', boilerplate], ['Unrelated work.']);
    const report = JSON.parse(execFileSync(process.execPath, [script, '--packs', folder], { encoding: 'utf8', timeout: 60_000 }));
    expect(report.packs).toBe(5);
    const overlap = report.triggerOverlap;
    expect(overlap.sharedTriggerBullets).toEqual([{ bullet: expect.stringContaining('apply when the current task matches'), packs: 5 }]);
    expect(overlap.similarPairs).toEqual([{ a: 'alpha', b: 'beta', similarity: 1 }]);
    expect(overlap.nonTriggerAlsoTriggerElsewhere.map((entry: { nonTriggerOf: string; triggerOf: string }) => `${entry.nonTriggerOf}>${entry.triggerOf}`).sort())
      .toEqual(['gamma>alpha', 'gamma>beta']);
  }, 60_000);

  it('reports nothing for packs whose Triggers are distinct', () => {
    const clean = mkdtempSync(path.join(os.tmpdir(), 'pack-lint-clean-'));
    try {
      for (const [name, trigger] of [['one', 'Tune garbage collection pauses in a long running service.'], ['two', 'Translate a marketing page into formal Indonesian prose.'], ['three', 'Rotate an expired signing certificate on a build server.']]) {
        mkdirSync(path.join(clean, name), { recursive: true });
        writeFileSync(path.join(clean, name, 'SKILL.md'), `---\nname: ${name}\ndescription: "fixture"\n---\n## Triggers\n- ${trigger}\n\n## Non-triggers\n- Anything else.\n`);
      }
      const report = JSON.parse(execFileSync(process.execPath, [script, '--packs', clean], { encoding: 'utf8', timeout: 60_000 }));
      expect(report.triggerOverlap).toEqual({ sharedTriggerBullets: [], similarPairs: [], nonTriggerAlsoTriggerElsewhere: [] });
    } finally { rmSync(clean, { recursive: true, force: true }); }
  }, 60_000);
});
