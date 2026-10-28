import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// UP-10 / OFB-15: the drift report with a fake GitHub, so nothing here touches the network.
const script = fileURLToPath(new URL('../scripts/research/skill-upstream-drift.mjs', import.meta.url));
const { checkDrift, classify, normalizeUpstream } = await import(pathToFileURL(script).href);

const sha = (character: string) => character.repeat(40);
const folder = mkdtempSync(path.join(os.tmpdir(), 'skill-drift-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));
const pack = (name: string, upstream: unknown) => {
  mkdirSync(path.join(folder, name), { recursive: true });
  if (upstream !== undefined) writeFileSync(path.join(folder, name, 'UPSTREAM.json'), JSON.stringify(upstream));
};

describe('normalizeUpstream and classify', () => {
  it('reads both key spellings and rejects what cannot be compared', () => {
    expect(normalizeUpstream({ repository: 'https://github.com/acme/skills.git', commit: sha('A'), path: '/skills/x/' }))
      .toEqual({ slug: 'acme/skills', commit: sha('a'), path: 'skills/x' });
    expect(normalizeUpstream({ repo: 'acme/skills', commit: sha('b'), path: 'skills/y' }).slug).toBe('acme/skills');
    expect(normalizeUpstream({ repository: 'https://example.com/acme/skills', commit: sha('b'), path: 'p' }).slug).toBeNull();
    expect(normalizeUpstream({ repository: 'https://github.com/acme/skills', commit: 'main', path: 'p' }).commit).toBeNull();
  });

  it('calls a folder changed only for a file at or under it, not for a sibling with the same prefix', () => {
    expect(classify(['skills/x/SKILL.md'], true, 'skills/x').result).toBe('changed');
    expect(classify(['skills/x-other/SKILL.md', 'README.md'], true, 'skills/x').result).toBe('unchanged');
    expect(classify(['README.md'], false, 'skills/x').result).toBe('unknown');
  });
});

describe('checkDrift', () => {
  it('compares each pinned commit once per repository and tells changed from unchanged', async () => {
    pack('alpha', { repository: 'https://github.com/acme/skills', commit: sha('1'), path: 'skills/alpha' });
    pack('beta', { repository: 'https://github.com/acme/skills', commit: sha('1'), path: 'skills/beta' });
    pack('legacy', { repo: 'acme/other', commit: sha('2'), path: 'skills/legacy' });
    pack('nofile', undefined);
    pack('nopath', { repository: 'https://github.com/acme/skills', commit: sha('1') });
    const calls: string[] = [];
    const fetchJson = async (url: string) => {
      calls.push(url);
      if (/\/repos\/acme\/(skills|other)$/.test(url)) return { ok: true, status: 200, json: { default_branch: 'main' } };
      if (url.includes(`/acme/skills/compare/${sha('1')}...main`)) return { ok: true, status: 200, json: { files: [{ filename: 'skills/alpha/SKILL.md' }, { filename: 'docs/readme.md' }] } };
      if (url.includes(`/acme/other/compare/${sha('2')}...main`)) return { ok: true, status: 200, json: { files: [] } };
      return { ok: false, status: 404, json: null };
    };
    const report = await checkDrift({ packsDir: folder, fetchJson });
    const by = Object.fromEntries(report.packs.map((item: { name: string; result: string }) => [item.name, item.result]));
    expect(by).toEqual({ alpha: 'changed', beta: 'unchanged', legacy: 'unchanged', nofile: 'unknown', nopath: 'unknown' });
    expect(calls.filter(url => url.includes('/compare/'))).toHaveLength(2);
    expect(report.summary).toEqual({ packs: 5, unchanged: 2, changed: 1, unknown: 2 });
  });

  it('reports unknown, not unchanged, when the listing is cut off or the network fails', async () => {
    // Every page is full and brings new names, so the five-page cap is reached without ever seeing the pinned folder.
    const page = (url: string) => Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? 1);
    const cutOff = await checkDrift({
      packsDir: folder,
      fetchJson: async (url: string) => url.endsWith('/acme/skills') || url.endsWith('/acme/other')
        ? { ok: true, status: 200, json: { default_branch: 'main' } }
        : { ok: true, status: 200, json: { files: Array.from({ length: 100 }, (_, index) => ({ filename: `elsewhere/p${page(url)}-${index}.md` })) } },
    });
    expect(cutOff.packs.find((item: { name: string }) => item.name === 'beta').result).toBe('unknown');
    const offline = await checkDrift({ packsDir: folder, fetchJson: async () => ({ ok: false, status: 0, json: null }) });
    expect(offline.packs.filter((item: { result: string }) => item.result === 'unchanged')).toHaveLength(0);
  });

  it('stops asking after a rate limit and says so', async () => {
    let calls = 0;
    const report = await checkDrift({ packsDir: folder, fetchJson: async () => { calls += 1; return { ok: false, status: 403, json: null }; } });
    expect(calls).toBe(1);
    expect(report.packs.some((item: { reason: string }) => item.reason === 'rate-limited')).toBe(true);
  });
});

describe('command line', () => {
  it('refuses to write outside runtime/tmp', () => {
    const run = spawnSync(process.execPath, [script, '--packs', folder, '--out', path.join(folder, 'report.json')], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('runtime/tmp');
  }, 30_000);
});
