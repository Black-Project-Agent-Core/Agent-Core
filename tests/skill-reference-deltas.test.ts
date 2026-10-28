import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// UP-09: reference deltas added to existing Skills. Each file must stay one skills(read) fragment and each pack must point to it.
const packs = fileURLToPath(new URL('../runtime/skills/capability-packs/', import.meta.url));
const deltas: Record<string, string[]> = {
  'code-review-and-quality': ['review-calibration', 'review-lenses', 'verification-verdict'],
  'security-and-hardening': ['finding-report', 'vulnerability-review'],
  'deprecation-and-migration': ['verified-code-migration', 'characterization-and-equivalence'],
  'git-workflow-and-versioning': ['branch-cleanup'],
  'doubt-driven-development': ['attack-patterns'],
  'ci-cd-and-automation': ['workflow-hardening'],
  'debugging-and-error-recovery': ['environment-differences', 'incident-handling'],
  'test-driven-development': ['component-strategies'],
  'documentation-and-adrs': ['runbooks-and-onboarding'],
  'mind-control': ['tool_output_trust'],
};

describe('Skill reference deltas (UP-09)', () => {
  for (const [pack, names] of Object.entries(deltas)) {
    for (const name of names) {
      it(`${pack}/references/${name}.md is one fragment of plain ASCII with LF endings`, () => {
        const file = `${packs}${pack}/references/${name}.md`;
        expect(statSync(file).size).toBeLessThanOrEqual(8192);
        const bytes = readFileSync(file);
        expect(bytes.some(byte => byte > 127 || byte === 13)).toBe(false);
      });
    }
  }

  // mind-control's pointer lives only in the staged candidate: its source folder is an older lineage than the active Skill.
  it.each(Object.entries(deltas).filter(([pack]) => pack !== 'mind-control'))('%s SKILL.md points to every new reference and keeps the upstream pin', (pack, names) => {
    const skill = readFileSync(`${packs}${pack}/SKILL.md`, 'utf8');
    for (const name of names) expect(skill).toContain(`](references/${name}.md)`);
    expect(skill).toContain('adapter-revision: "2"');
    expect(skill.indexOf('## Upstream workflow')).toBeGreaterThan(skill.indexOf('](references/'));
  });

  it('the new references name no command that prints a secret value', () => {
    const text = readFileSync(`${packs}git-workflow-and-versioning/references/branch-cleanup.md`, 'utf8');
    expect(text).toContain('--name-only');
    expect(text).not.toMatch(/git diff --staged \| grep/);
  });

  it('the verdict reference points to a script that exists and refuses a bad input', () => {
    const verdict = readFileSync(`${packs}code-review-and-quality/references/verification-verdict.md`, 'utf8');
    expect(verdict).toContain('scripts/verify/test-run-evidence.mjs');
    expect(statSync(fileURLToPath(new URL('../scripts/verify/test-run-evidence.mjs', import.meta.url))).isFile()).toBe(true);
    expect(() => execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/verify/test-run-evidence.mjs', import.meta.url)), '--self-check'], { encoding: 'utf8', timeout: 30_000 })).not.toThrow();
  });
});
