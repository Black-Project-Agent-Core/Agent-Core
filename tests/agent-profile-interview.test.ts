import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractProfileDraft, isInterviewStart, parseOperatorIntroduction, saveProfileDrafts } from '../src/agent-profile.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function profileRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-profile-interview-')); roots.push(root);
  const selected = path.join(root, 'selected'); await mkdir(selected);
  return { selected, config: { enabled: true, root: selected } };
}
const digest = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');

describe('/perkenalan command syntax', () => {
  it('tells an interview start, an append and a save apart', () => {
    expect(parseOperatorIntroduction('/perkenalan')).toEqual({});
    expect(parseOperatorIntroduction('/Perkenalan Panggilan: Nara')).toEqual({ preferences: 'Panggilan: Nara' });
    expect(parseOperatorIntroduction('/perkenalan simpan soul')).toEqual({ save: ['SOUL'] });
    expect(parseOperatorIntroduction('/perkenalan simpan SEMUA')).toEqual({ save: ['SOUL', 'IDENTITY', 'USER', 'AGENTS'] });
    expect(parseOperatorIntroduction('/perkenalan simpan sesuatu lain')).toEqual({ preferences: 'simpan sesuatu lain' });
    expect(parseOperatorIntroduction('halo /perkenalan')).toBeUndefined();
    expect(isInterviewStart('/perkenalan')).toBe(true);
    expect(isInterviewStart('/perkenalan simpan soul')).toBe(false);
    expect(isInterviewStart('/perkenalan Panggilan: Nara')).toBe(false);
  });
});

describe('interview draft extraction', () => {
  it('takes the last block labelled with the exact file name and ignores other labels', () => {
    const text = 'Draf:\n```SOUL.md\nlama\n```\nRevisi:\n```SOUL.md\nbaru\nbaris dua\n```\n```USER.md\nlain\n```\n```markdown\nbukan draf\n```';
    expect(extractProfileDraft(text, 'SOUL')).toBe('baru\nbaris dua\n');
    expect(extractProfileDraft(text, 'USER')).toBe('lain\n');
    expect(extractProfileDraft(text, 'AGENTS')).toBeUndefined();
  });
});

describe('saving interview drafts', () => {
  it('replaces a file only while it still has the revision the draft was made from', async () => {
    const { selected, config } = await profileRoot();
    await writeFile(path.join(selected, 'SOUL.md'), 'versi lama\n');
    const stale = digest('versi lama\n');
    const [first] = [await saveProfileDrafts(config, [{ name: 'SOUL', content: 'versi baru\n', expectedDigest: stale }])];
    expect(first).toContain('SOUL.md tersimpan dan sudah dibaca kembali');
    expect(await readFile(path.join(selected, 'SOUL.md'), 'utf8')).toBe('versi baru\n');

    await writeFile(path.join(selected, 'SOUL.md'), 'suntingan manual\n');
    const refused = await saveProfileDrafts(config, [{ name: 'SOUL', content: 'draf usang\n', expectedDigest: digest('versi baru\n') }]);
    expect(refused).toContain('SOUL.md tidak disimpan: berkas berubah sejak draf dibuat');
    expect(await readFile(path.join(selected, 'SOUL.md'), 'utf8')).toBe('suntingan manual\n');
  });

  it('creates an absent file, but refuses when a file appeared since the draft', async () => {
    const { selected, config } = await profileRoot();
    expect(await saveProfileDrafts(config, [{ name: 'AGENTS', content: 'Catatan kerja.\n', expectedDigest: undefined }])).toContain('AGENTS.md tersimpan');
    expect(await readFile(path.join(selected, 'AGENTS.md'), 'utf8')).toBe('Catatan kerja.\n');
    const refused = await saveProfileDrafts(config, [{ name: 'AGENTS', content: 'Lain.\n', expectedDigest: undefined }]);
    expect(refused).toContain('berkas berubah sejak draf dibuat');
    expect(await readFile(path.join(selected, 'AGENTS.md'), 'utf8')).toBe('Catatan kerja.\n');
  });

  it.each([
    ['empty', 'USER', '   \n'],
    ['control character', 'USER', 'a\u0007b\n'],
    ['oversize', 'IDENTITY', '- Name: ' + 'x'.repeat(1100) + '\n'],
  ] as const)('refuses a %s draft and leaves the file untouched', async (_label, name, content) => {
    const { selected, config } = await profileRoot();
    await writeFile(path.join(selected, name + '.md'), 'asli\n');
    const result = await saveProfileDrafts(config, [{ name, content, expectedDigest: digest('asli\n') }]);
    expect(result).toContain(name + '.md tidak disimpan');
    expect(await readFile(path.join(selected, name + '.md'), 'utf8')).toBe('asli\n');
  });

  it('needs a Name for IDENTITY, refuses a new Avatar and keeps the existing one', async () => {
    const { selected, config } = await profileRoot();
    const original = '- Name: Atlas\n- Avatar: atlas.png\n';
    await writeFile(path.join(selected, 'IDENTITY.md'), original);
    const expectedDigest = digest(original);
    expect(await saveProfileDrafts(config, [{ name: 'IDENTITY', content: '- Role: Rekan\n', expectedDigest }])).toContain('tidak valid');
    expect(await saveProfileDrafts(config, [{ name: 'IDENTITY', content: '- Name: Lentera\n- Avatar: lain.png\n', expectedDigest }])).toContain('tidak valid');
    expect(await saveProfileDrafts(config, [{ name: 'IDENTITY', content: '- Name: Lentera\n- Name: Ganda\n', expectedDigest }])).toContain('tidak valid');
    expect(await readFile(path.join(selected, 'IDENTITY.md'), 'utf8')).toBe(original);
    expect(await saveProfileDrafts(config, [{ name: 'IDENTITY', content: '- Name: Lentera\n- Role: Rekan riset\n', expectedDigest }])).toContain('IDENTITY.md tersimpan');
    expect(await readFile(path.join(selected, 'IDENTITY.md'), 'utf8')).toBe('- Name: Lentera\n- Role: Rekan riset\n- Avatar: atlas.png\n');
  });

  it('saves nothing while the profile is disabled or has no selected root', async () => {
    const { selected } = await profileRoot();
    for (const config of [{ enabled: false, root: selected }, { enabled: true }, undefined]) {
      expect(await saveProfileDrafts(config, [{ name: 'SOUL', content: 'x\n', expectedDigest: undefined }])).toContain('tidak ada draf yang disimpan');
    }
  });
});
