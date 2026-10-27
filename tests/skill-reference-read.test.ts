import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SkillService } from '../src/skills/service.js';
import { skills as skillSchema } from '../src/mcp/skills-schemas.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
 const root = await mkdtemp(path.join(os.tmpdir(), 'skill-reference-'));
 roots.push(root);
 const skill = path.join(root, 'runtime', 'skills', 'catalog', 'research-review');
 await mkdir(path.join(skill, 'references'), { recursive: true });
 await writeFile(path.join(skill, 'SKILL.md'), '---\nname: research-review\ndescription: Verify evidence\n---\nPrimary content');
 await writeFile(path.join(skill, 'references', 'appraisal.md'), 'á😀'.repeat(125), 'utf8');
 const service = await SkillService.initialize(root, async value => value);
 return { skill, service, digest: (await service.inspect('research-review')).digest };
}

it('reads selected reference in revision-bound UTF8 fragments without changing default SKILL.md', async () => {
 const { service, digest } = await fixture();
 const main = await service.read('research-review', { expectedActiveDigest: digest });
 expect(main.source).toBe('SKILL.md');
 expect(main.content).toContain('Primary content');
 let offset = 0, assembled = '';
 do {
  const page = await service.read('research-review', { expectedActiveDigest: digest,
   resourcePath: 'references/appraisal.md', offset, maxBytes: 512 });
  expect(page.source).toBe('references/appraisal.md');
  expect(page.offset).toBe(offset);
  expect(Buffer.byteLength(JSON.stringify(page), 'utf8')).toBeLessThanOrEqual(512);
  assembled += page.content;
  if (page.nextOffset === null) break;
  offset = page.nextOffset;
 } while (offset > 0 && offset < 20_000);
 expect(assembled).toBe('á😀'.repeat(125));
});
it('rejects absent, non-UTF8, traversal, and changed active revision', async () => {
 const { service, skill, digest } = await fixture();
 const read = (resourcePath: string, expectedActiveDigest = digest) =>
  service.read('research-review', { expectedActiveDigest, resourcePath });
 await expect(read('references/none.md')).rejects.toThrow('SKILL_READ_RESOURCE_NOT_FOUND');
 await expect(read('references/../SKILL.md')).rejects.toThrow('SKILL_READ_RESOURCE_INVALID');
 await expect(read('references/appraisal.md', 'sha256:'+'a'.repeat(64)))
  .rejects.toThrow('SKILL_ACTIVE_REVISION_CHANGED');
 await writeFile(path.join(skill, 'references', 'binary.md'), Buffer.from([0xc3, 0x28]));
 const current = (await service.inspect('research-review')).digest;
 await expect(read('references/binary.md', current)).rejects.toThrow('SKILL_READ_UTF8_INVALID');
});

it('binds resourcePath to read and rejects ambiguous sourcePath', () => {
 const base = { name: 'research-review', expectedActiveDigest: 'sha256:'+'a'.repeat(64) };
 expect(skillSchema.safeParse({ action: 'read', ...base, resourcePath: 'references/appraisal.md' }).success).toBe(true);
 expect(skillSchema.safeParse({ action: 'inspect', ...base, resourcePath: 'references/appraisal.md' }).success).toBe(false);
 expect(skillSchema.safeParse({ action: 'read', ...base, sourcePath: 'references/appraisal.md' }).success).toBe(false);
});
