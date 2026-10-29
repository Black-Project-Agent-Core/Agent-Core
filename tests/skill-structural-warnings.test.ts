import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import PizZip from 'pizzip';
import { SkillService } from '../src/skills/service.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-warnings-')); roots.push(root);
  const source = path.join(root, 'source');
  await mkdir(path.join(source, 'references'), { recursive: true });
  const body = '---\nname: inspect-code\ndescription: Inspect code\n---\n'
    + '[present](references/present.md#section) [folder](references/) [missing](references/missing.md)\n'
    + '`scripts/check.mjs` [remote](https://example.com/references/remote.md)\n'
    + '[anchor](#local) `references/*.md` [outside](../outside.md)\n';
  await writeFile(path.join(source, 'SKILL.md'), body);
  await writeFile(path.join(source, 'references/present.md'), 'Present.');
  const service = await SkillService.initialize(root, async value => value);
  return { root, source, service, body };
}
const missing = ['SKILL_REFERENCE_MISSING: references/missing.md', 'SKILL_REFERENCE_MISSING: scripts/check.mjs'];

it('reports missing packaged references without reading outside the scanned tree or changing bytes', async () => {
  const { source, service, body } = await fixture();
  const result = await service.validate(source);
  expect(result).toMatchObject({ name: 'inspect-code', fileCount: 2, warnings: missing });
  expect(await readFile(path.join(source, 'SKILL.md'), 'utf8')).toBe(body);
  await writeFile(path.join(source, 'references/missing.md'), 'Now present.');
  await mkdir(path.join(source, 'scripts'));
  await writeFile(path.join(source, 'scripts/check.mjs'), '// packaged, never executed');
  expect((await service.validate(source)).warnings).toBeUndefined();
});

it('propagates advisory warnings through import, inspect and revision staging', async () => {
  const { source, service, body } = await fixture();
  expect(await service.import(source)).toMatchObject({ status: 'imported', warnings: missing });
  expect(await service.inspect('inspect-code')).toMatchObject({ warnings: missing });
  await writeFile(path.join(source, 'SKILL.md'), body + '\nRevision two.');
  expect(await service.stageRevision(source, ['source:warning-fixture'])).toMatchObject({ status: 'staged', warnings: missing });
});

it('uses archive contents and bounds duplicate or excessive warnings', async () => {
  const { root, service, body } = await fixture();
  const zip = new PizZip();
  zip.file('SKILL.md', body + Array.from({ length: 80 }, (_, i) => `\n[ref](references/missing-${i}.md)`).join(''));
  zip.file('references/present.md', 'Present.');
  const archive = path.join(root, 'pack.zip');
  await writeFile(archive, zip.generate({ type: 'nodebuffer' }));
  const result = await service.validate(archive);
  expect(result.warnings?.slice(0, 2)).toEqual(missing);
  expect(result.warnings).toHaveLength(32);
});
