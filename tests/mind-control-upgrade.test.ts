import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillService } from '../src/skills/service.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(projectRoot, 'runtime/skills/capability-packs/mind-control');

it('delivers the complete maintained reasoning procedure through bounded digest-bound pages', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mind-control-upgrade-'));
  try {
    const service = await SkillService.initialize(root, async value => value);
    const artifact = await service.import(source);
    let content = '', offset = 0;
    for (;;) {
      const delivered = await service.read('mind-control', { expectedActiveDigest: artifact.digest, maxBytes: 8192, offset });
      expect(Buffer.byteLength(JSON.stringify(delivered))).toBeLessThanOrEqual(8192);
      content += delivered.content;
      if (delivered.nextOffset === null) {
        expect(delivered.truncated).toBe(false);
        break;
      }
      expect(delivered.nextOffset).toBeGreaterThan(offset);
      expect(delivered.truncated).toBe(true);
      offset = delivered.nextOffset;
    }
    expect(content).toBe(await readFile(path.join(source, 'SKILL.md'), 'utf8'));
    expect(content).toContain('references/tool_output_trust.md');
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
