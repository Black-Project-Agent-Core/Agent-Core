import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillService } from '../src/skills/service.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(projectRoot, 'runtime/skills/capability-packs/mind-control');

it('delivers the complete maintained reasoning procedure in one default-budget response', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mind-control-upgrade-'));
  try {
    const service = await SkillService.initialize(root, async value => value);
    const artifact = await service.import(source);
    const delivered = await service.read('mind-control', { expectedActiveDigest: artifact.digest, maxBytes: 8192 });
    expect(delivered.nextOffset).toBeNull();
    expect(delivered.truncated).toBe(false);
    expect(delivered.content).toBe(await readFile(path.join(source, 'SKILL.md'), 'utf8'));
    expect(Buffer.byteLength(JSON.stringify(delivered))).toBeLessThanOrEqual(8192);
    const hit = (await service.discover({ query: 'mind-control' })).search.hits.find(item => item.name === 'mind-control');
    expect(hit?.applicability).toBe('declared');
    expect(hit?.triggers).toEqual([
      'Every coding task.',
      'Any other task that needs reasoning, judgment, inference, tradeoffs, planning, debugging, evidence assessment, or uncertainty handling.',
    ]);
    expect(hit?.nonTriggers).toEqual([
      'Only non-coding work that is routine, mechanical, deterministic, and requires no reasoning or judgment.',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
