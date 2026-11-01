import { expect, test } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './skill-proposal-fixture.js';
import * as schemas from '../src/mcp/skills-schemas.js';

async function writeSkill(root: string, name: string, body: string): Promise<string> {
  const directory = path.join(root, 'source-' + name);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} fixture skill\nlicense: Apache-2.0\n---\n\n${body}\n`);
  return directory;
}

async function retirementFixture() {
  const f = await fixture();
  const alphaSource = await writeSkill(f.root, 'alpha', 'Alpha instructions.');
  const alpha = await f.skills.import(alphaSource);
  const beta = await f.skills.import(await writeSkill(f.root, 'beta', 'Beta instructions.'));
  const catalog = path.join(f.root, 'runtime/skills/catalog');
  const names = async () => (await f.skills.list()).map(item => item.name).sort();
  const retire = () => f.skills.retireSkill('alpha', alpha.digest, 'RETIRE_SKILL', ['task:merge-fixture'], 'beta');
  return { ...f, alpha, beta, alphaSource, catalog, names, retire };
}

const hex = (digest: string) => digest.slice('sha256:'.length);

test('retires an active Skill into restorable history and records why', async () => {
  const f = await retirementFixture();
  const result = await f.retire();
  expect(result).toMatchObject({ status: 'retired', name: 'alpha', digest: f.alpha.digest, supersededBy: 'beta', evidenceRefs: ['task:merge-fixture'] });
  expect(await f.names()).toEqual(['beta']);
  await expect(fs.access(path.join(f.catalog, 'alpha'))).rejects.toThrow();
  await expect(f.skills.inspect('alpha')).rejects.toThrow();
  expect(await fs.readdir(path.join(f.root, 'runtime/skills/revisions/alpha/history'))).toContain(hex(f.alpha.digest));
  const retired = await f.skills.listRetired();
  expect(retired).toHaveLength(1);
  expect(retired[0]).toMatchObject({ name: 'alpha', digest: f.alpha.digest, supersededBy: 'beta', evidenceRefs: ['task:merge-fixture'] });
  expect(retired[0]!.history.map(item => item.digest)).toEqual([f.alpha.digest]);
  expect((await f.skills.list()).find(item => item.name === 'beta')!.digest).toBe(f.beta.digest);
});

test('refuses a retirement without confirmation, exact digest, evidence or an active successor', async () => {
  const f = await retirementFixture();
  await expect(f.skills.retireSkill('alpha', f.alpha.digest, 'yes', ['task:x'])).rejects.toThrow('SKILL_RETIREMENT_CONFIRMATION_REQUIRED');
  await expect(f.skills.retireSkill('alpha', f.beta.digest, 'RETIRE_SKILL', ['task:x'])).rejects.toThrow('SKILL_REVISION_ACTIVE_DIGEST_MISMATCH');
  await expect(f.skills.retireSkill('alpha', f.alpha.digest, 'RETIRE_SKILL', [])).rejects.toThrow('SKILL_REVISION_EVIDENCE_REQUIRED');
  await expect(f.skills.retireSkill('alpha', f.alpha.digest, 'RETIRE_SKILL', ['task:x'], 'missing-skill')).rejects.toThrow('SKILL_RETIREMENT_SUCCESSOR_NOT_ACTIVE');
  await expect(f.skills.retireSkill('alpha', f.alpha.digest, 'RETIRE_SKILL', ['task:x'], 'alpha')).rejects.toThrow('SKILL_RETIREMENT_SUCCESSOR_INVALID');
  await expect(f.skills.retireSkill('nothing-here', f.alpha.digest, 'RETIRE_SKILL', ['task:x'])).rejects.toThrow();
  expect(await f.names()).toEqual(['alpha', 'beta']);
  expect(await f.skills.listRetired()).toEqual([]);
});

test('restores a retired Skill through rollback with the retired digest as the state check', async () => {
  const f = await retirementFixture();
  await f.retire();
  await expect(f.skills.rollbackRevision('alpha', f.alpha.digest, f.beta.digest, 'ROLLBACK_SKILL_REVISION')).rejects.toThrow('SKILL_REVISION_ACTIVE_DIGEST_MISMATCH');
  await expect(f.skills.rollbackRevision('alpha', f.alpha.digest, f.alpha.digest, 'nope')).rejects.toThrow('SKILL_REVISION_ROLLBACK_CONFIRMATION_REQUIRED');
  const restored = await f.skills.rollbackRevision('alpha', f.alpha.digest, f.alpha.digest, 'ROLLBACK_SKILL_REVISION');
  expect(restored).toMatchObject({ status: 'rolled-back', targetDigest: f.alpha.digest });
  expect(restored.active.digest).toBe(f.alpha.digest);
  expect(await f.names()).toEqual(['alpha', 'beta']);
  expect(await f.skills.listRetired()).toEqual([]);
  await expect(f.skills.rollbackRevision('alpha', f.alpha.digest, f.alpha.digest, 'ROLLBACK_SKILL_REVISION')).rejects.toThrow('SKILL_REVISION_MATCHES_ACTIVE');
});

test('importing the same name again ends the retirement', async () => {
  const f = await retirementFixture();
  await f.retire();
  const again = await f.skills.import(f.alphaSource);
  expect(again.status).toBe('imported');
  expect(await f.skills.listRetired()).toEqual([]);
  expect(await f.names()).toEqual(['alpha', 'beta']);
});

test('keeps the tool schema strict for retire and list_retired', () => {
  const digest = 'sha256:' + 'a'.repeat(64);
  const ok = { action: 'retire', name: 'alpha', expectedActiveDigest: digest, evidenceRefs: ['task:x'], confirmation: 'RETIRE_SKILL', supersededBy: 'beta' };
  expect(schemas.skills.safeParse(ok).success).toBe(true);
  expect(schemas.skills.safeParse({ ...ok, confirmation: 'RETIRE' }).success).toBe(false);
  expect(schemas.skills.safeParse({ ...ok, evidenceRefs: undefined }).success).toBe(false);
  expect(schemas.skills.safeParse({ ...ok, expectedActiveDigest: undefined }).success).toBe(false);
  expect(schemas.skills.safeParse({ ...ok, name: undefined }).success).toBe(false);
  expect(schemas.skills.safeParse({ action: 'list', supersededBy: 'beta' }).success).toBe(false);
  expect(schemas.skills.safeParse({ action: 'list_retired' }).success).toBe(true);
});
