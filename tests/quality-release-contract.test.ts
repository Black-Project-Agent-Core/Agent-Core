import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Wave E release quality contract', () => {
  it('runs the deterministic quality gate inside verify:release before release metadata checks', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const command = pkg.scripts?.['verify:release'] ?? '';
    expect(command).toContain('npm run verify');
    expect(command).toContain('npm run quality:gate');
    expect(command).toContain('node scripts/release/check-release.mjs');
    expect(command.indexOf('npm run quality:gate')).toBeGreaterThan(command.indexOf('npm run verify'));
    expect(command.indexOf('npm run quality:gate')).toBeLessThan(command.indexOf('node scripts/release/check-release.mjs'));
  });
});
