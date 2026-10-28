// Explicit, read-only drift report for the Skill packs that carry an UPSTREAM.json. For each pinned commit it asks the public GitHub
// compare API (anonymous, no token) whether any file under the pinned path changed between that commit and the upstream default branch.
// It never bumps a pin, opens a pull request or writes outside runtime/tmp. Run it yourself when you want to know; it is not part of a build.
//   node scripts/research/skill-upstream-drift.mjs [--packs <folder>] [--out runtime/tmp/<file>.json]
// Anonymous GitHub calls are rate limited (60 per hour): one call per repository plus one per distinct pinned commit.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_PACKS = path.join(ROOT, 'runtime', 'skills', 'capability-packs');
const OUT_ROOT = path.join(ROOT, 'runtime', 'tmp');
const PAGE = 100;
const MAX_PAGES = 5;

/** Both spellings seen in the packs: `repository` (a URL) or `repo` (`owner/name`). Returns null fields where nothing usable is pinned. */
export function normalizeUpstream(json) {
  const raw = String(json?.repository ?? json?.repo ?? '').trim();
  const url = !raw ? null : /^https?:\/\//i.test(raw) ? raw : /^[\w.-]+\/[\w.-]+$/.test(raw) ? `https://github.com/${raw}` : null;
  const slug = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(url ?? '')?.[1] ?? null;
  const commit = /^[0-9a-f]{40}$/i.test(String(json?.commit ?? '')) ? String(json.commit).toLowerCase() : null;
  const folder = typeof json?.path === 'string' ? json.path.replace(/^\/+|\/+$/g, '') : '';
  return { slug, commit, path: folder || null };
}

/** `changed` when a file at or under the pinned path differs, `unchanged` when the whole file list was seen and none does, otherwise `unknown`. */
export function classify(files, complete, folder) {
  if (files.some(name => name === folder || name.startsWith(`${folder}/`))) return { result: 'changed', reason: 'a file under the pinned path differs from the upstream default branch' };
  return complete ? { result: 'unchanged', reason: 'no file under the pinned path differs' } : { result: 'unknown', reason: `the compare listing was cut off at ${PAGE * MAX_PAGES} files` };
}

export async function checkDrift({ packsDir = DEFAULT_PACKS, fetchJson }) {
  const rows = [];
  for (const entry of (await readdir(packsDir, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const json = await readFile(path.join(packsDir, entry.name, 'UPSTREAM.json'), 'utf8').then(JSON.parse, () => null);
    rows.push({ name: entry.name, ...normalizeUpstream(json), hasFile: json !== null });
  }
  const defaults = new Map();
  const compares = new Map();
  let stopped = null;
  const get = async url => {
    if (stopped) return { ok: false, status: 0, json: null, stopped };
    const response = await fetchJson(url);
    if (response.status === 403 || response.status === 429) stopped = 'rate-limited';
    return response;
  };
  const report = [];
  for (const row of rows) {
    const base = { name: row.name, repository: row.slug, pinned: row.commit?.slice(0, 12) ?? null, path: row.path };
    if (!row.hasFile) { report.push({ ...base, result: 'unknown', reason: 'no readable UPSTREAM.json' }); continue; }
    if (!row.slug || !row.commit || !row.path) { report.push({ ...base, result: 'unknown', reason: 'no GitHub repository, 40-character commit or path is pinned' }); continue; }
    if (!defaults.has(row.slug)) {
      const response = await get(`https://api.github.com/repos/${row.slug}`);
      defaults.set(row.slug, response.ok ? String(response.json?.default_branch ?? '') || null : null);
    }
    const branch = defaults.get(row.slug);
    if (!branch) { report.push({ ...base, result: 'unknown', reason: stopped ?? 'the repository or its default branch could not be read' }); continue; }
    const key = `${row.slug}@${row.commit}`;
    if (!compares.has(key)) {
      const files = new Set();
      let complete = false, failed = null;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const response = await get(`https://api.github.com/repos/${row.slug}/compare/${row.commit}...${encodeURIComponent(branch)}?per_page=${PAGE}&page=${page}`);
        if (!response.ok) { failed = stopped ?? (response.status === 404 ? 'the pinned commit is not on the upstream repository any more' : 'the compare request failed'); break; }
        const before = files.size;
        for (const file of response.json?.files ?? []) if (typeof file?.filename === 'string') files.add(file.filename);
        if ((response.json?.files ?? []).length < PAGE || files.size === before) { complete = true; break; }
      }
      compares.set(key, { files: [...files], complete, failed });
    }
    const compared = compares.get(key);
    report.push({ ...base, ...(compared.failed ? { result: 'unknown', reason: compared.failed } : classify(compared.files, compared.complete, row.path)) });
  }
  const count = result => report.filter(item => item.result === result).length;
  return { checkedAt: new Date().toISOString(), summary: { packs: report.length, unchanged: count('unchanged'), changed: count('changed'), unknown: count('unknown') }, packs: report };
}

const anonymousFetch = async url => {
  try {
    const response = await fetch(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'agent-core-skill-upstream-drift' }, signal: AbortSignal.timeout(20_000) });
    return { ok: response.ok, status: response.status, json: response.ok ? await response.json() : null };
  } catch { return { ok: false, status: 0, json: null }; }
};

async function main(argv) {
  let packsDir = DEFAULT_PACKS, out = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--packs') packsDir = path.resolve(argv[++index] ?? '');
    else if (argv[index] === '--out') out = path.resolve(argv[++index] ?? '');
    else throw new Error(`unknown option ${argv[index]}`);
  }
  if (out) {
    const relative = path.relative(OUT_ROOT, out);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !relative) throw new Error('--out must be a file under runtime/tmp');
  }
  const text = JSON.stringify(await checkDrift({ packsDir, fetchJson: anonymousFetch }), null, 2);
  if (out) { await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, text + '\n', 'utf8'); console.log(`written: ${out}`); }
  else console.log(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(String(error?.message ?? error)); process.exit(1); });
}
