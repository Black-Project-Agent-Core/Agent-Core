import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/verify/skill-pack-lint.mjs', import.meta.url));
const built = existsSync(fileURLToPath(new URL('../dist/skills/service.js', import.meta.url)));

describe('skill pack lint baseline', () => {
  // The lint uses the SkillService parser from dist, so it can only run after a build.
  it.skipIf(!built)('parses every pack with the strict parser and reports the known baseline fields', () => {
    const report = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 60_000 }));
    expect(report.packs).toBeGreaterThan(0);
    expect(report.parserUsed).toContain('parseSkillMarkdown');
    expect(report.errors).toBe(0);
    for (const field of ['overPageBytes', 'sharedNonTriggers', 'withDanglingLinks', 'packsWithFilesOutsideReferences', 'bashWithoutPowerShell', 'upstreamProblems']) {
      expect(report).toHaveProperty(field);
    }
    expect(report.upstreamBehindOrUnreachable).toBeUndefined();
  }, 120_000);
});
