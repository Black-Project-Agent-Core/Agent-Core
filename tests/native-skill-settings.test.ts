import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeSkillSettings } from '../src/native-skill-settings.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const dir = async () => { const root = await mkdtemp(path.join(os.tmpdir(), 'native-skill-settings-')); roots.push(root); return root; };

describe('NativeSkillSettings', () => {
  it('has every Skill on by default', async () => {
    const settings = new NativeSkillSettings(await dir());
    expect(settings.isDisabled('mind-control')).toBe(false);
    expect(settings.listDisabled()).toEqual([]);
  });

  it('switches a Skill off and on again', async () => {
    const settings = new NativeSkillSettings(await dir());
    settings.setEnabled('mind-control', false);
    settings.setEnabled('code-review', false);
    expect(settings.isDisabled('mind-control')).toBe(true);
    expect(settings.listDisabled()).toEqual(['code-review', 'mind-control']);
    settings.setEnabled('mind-control', true);
    expect(settings.isDisabled('mind-control')).toBe(false);
    expect(settings.listDisabled()).toEqual(['code-review']);
  });

  it('applies a stored OFF on the very first call of a new instance (restart)', async () => {
    const root = await dir();
    new NativeSkillSettings(root).setEnabled('mind-control', false);
    const restarted = new NativeSkillSettings(root);
    expect(restarted.isDisabled('mind-control')).toBe(true);
  });

  it('sees a change written by another process without restarting', async () => {
    const root = await dir();
    const settings = new NativeSkillSettings(root);
    settings.setEnabled('a-skill', false);
    expect(settings.isDisabled('b-skill')).toBe(false);
    await writeFile(path.join(root, 'native-skill-settings.json'), JSON.stringify({ version: 1, disabled: ['a-skill', 'b-skill-longer-name'], updatedAtMs: 1 }));
    expect(settings.isDisabled('b-skill-longer-name')).toBe(true);
  });

  it('treats a corrupt file as nothing switched off and does not overwrite it until the next change', async () => {
    const root = await dir();
    const file = path.join(root, 'native-skill-settings.json');
    await writeFile(file, '{not json');
    const settings = new NativeSkillSettings(root);
    expect(settings.listDisabled()).toEqual([]);
    expect(await readFile(file, 'utf8')).toBe('{not json');
    settings.setEnabled('mind-control', false);
    expect(settings.isDisabled('mind-control')).toBe(true);
  });

  it('rejects invalid Skill names', async () => {
    const settings = new NativeSkillSettings(await dir());
    for (const name of ['', '../evil', 'has space', '-lead', 'a'.repeat(161)]) {
      expect(() => settings.setEnabled(name, false), name).toThrow('INVALID_SKILL_NAME');
    }
  });
});
