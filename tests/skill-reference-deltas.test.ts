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

  // UP-08: two Skills built as validated sources (not imported into the catalog).
  const built = ['windows-powershell-host', 'skill-authoring'];
  const allowedKeys = new Set(['name', 'description', 'license', 'compatibility', 'allowed-tools', 'metadata']);
  it.each(built)('built Skill %s is one fragment with the strict frontmatter and the required sections', pack => {
    const file = `${packs}${pack}/SKILL.md`;
    expect(statSync(file).size).toBeLessThanOrEqual(8192);
    const bytes = readFileSync(file);
    expect(bytes.some(byte => byte > 127 || byte === 13)).toBe(false);
    const text = bytes.toString('utf8');
    expect(text.startsWith(`---\nname: ${pack}\n`)).toBe(true);
    const frontmatter = text.slice(4, text.indexOf('\n---\n', 4));
    const keys = frontmatter.split('\n').filter(line => /^[A-Za-z]/.test(line)).map(line => line.split(':')[0]);
    expect(keys.filter(key => !allowedKeys.has(key))).toEqual([]);
    expect(frontmatter).not.toMatch(/description:.*[<>]/);
    for (const heading of ['## Triggers', '## Non-triggers', '## Tools used', '## Verification']) expect(text).toContain(`\n${heading}\n`);
  });

  it('skill-authoring points to its intake review, which fits one fragment', () => {
    expect(readFileSync(`${packs}skill-authoring/SKILL.md`, 'utf8')).toContain('](references/intake-review.md)');
    expect(statSync(`${packs}skill-authoring/references/intake-review.md`).size).toBeLessThanOrEqual(8192);
  });

  it('the verdict reference points to a script that exists and refuses a bad input', () => {
    const verdict = readFileSync(`${packs}code-review-and-quality/references/verification-verdict.md`, 'utf8');
    expect(verdict).toContain('scripts/verify/test-run-evidence.mjs');
    expect(statSync(fileURLToPath(new URL('../scripts/verify/test-run-evidence.mjs', import.meta.url))).isFile()).toBe(true);
    expect(() => execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/verify/test-run-evidence.mjs', import.meta.url)), '--self-check'], { encoding: 'utf8', timeout: 30_000 })).not.toThrow();
  });
});
