import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillService } from '../src/skills/service.js';
import { PACKAGED_CAPABILITY_SEEDS, isPackagePathAllowed } from '../scripts/release/packaging-policy.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specialized = ['mind-control', 'performance-oriented-software-engineering', 'reverse-engineer-anything'];

it('ships every indexed capability needed by a fresh package', () => {
  expect(PACKAGED_CAPABILITY_SEEDS).toEqual(['agent-core-capability-index', ...specialized]);
});

it('gives every specialized capability declared discovery boundaries', async () => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'capability-pack-indexing-'));
  try {
    const service = await SkillService.initialize(runtimeRoot, async value => value);
    for (const name of specialized) {
      await service.import(path.join(projectRoot, 'runtime', 'skills', 'capability-packs', name));
      const hit = (await service.discover({ query: name })).search.hits.find(item => item.name === name);
      expect(hit, name).toMatchObject({ applicability: 'declared' });
      expect(hit?.triggers.length, name).toBeGreaterThan(0);
      expect(hit?.nonTriggers.length, name).toBeGreaterThan(0);
      if (name === 'mind-control') {
        expect(hit?.description).toContain('Default reasoning capability');
        expect(hit?.descriptorTruncated).toBe(false);
        expect(hit?.triggers).toEqual([
          expect.stringContaining('Every coding task'),
          expect.stringContaining('Any other task'),
        ]);
        expect(hit?.nonTriggers).toEqual([expect.stringContaining('Only non-coding work')]);
      }
      if (name === 'performance-oriented-software-engineering')
        expect(hit?.nonTriggers).toEqual([expect.stringContaining('Trivial edits')]);
    }
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

it('packages maintained Skill source from the existing home while excluding live runtime state', () => {
  expect(isPackagePathAllowed('runtime/skills/capability-packs/mind-control/SKILL.md')).toBe(true);
  expect(isPackagePathAllowed('runtime/skills/README.md')).toBe(true);
  for (const relative of ['runtime/skills/catalog/mind-control/SKILL.md', 'runtime/skills/revisions/x/history/a/SKILL.md',
    'runtime/skills/tooling/reverse-engineer-anything.json', 'runtime/skills/capability-packs-copy/x/SKILL.md', 'runtime/memory/private.md'])
    expect(isPackagePathAllowed(relative), relative).toBe(false);
  expect(isPackagePathAllowed('runtime/skills/capability-packs/x/.env')).toBe(false);
  expect(isPackagePathAllowed('bundled-skills/capability-packs/mind-control/SKILL.md')).toBe(false);
});
