// Read-only lint of the Skill pack sources in runtime/skills/capability-packs. It reports a baseline and changes
// nothing: no catalog write, no temporary file, no gate. The strict frontmatter parser is the one SkillService uses.
// Usage: node scripts/verify/skill-pack-lint.mjs [--strict] [--packs <folder>]   (build first; --strict exits 1 on a parse or name error;
// --packs lints another folder of packs, for example a test fixture)
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packsArgument = process.argv.indexOf('--packs');
const packsDir = packsArgument > 0 && process.argv[packsArgument + 1]
  ? path.resolve(process.argv[packsArgument + 1]) : path.join(root, 'runtime', 'skills', 'capability-packs');
const PAGE_BYTES = 8_192;
const UNIFORM_FROM = 5;
const exists = target => access(target).then(() => true, () => false);

const serviceFile = path.join(root, 'dist', 'skills', 'service.js');
const parse = await exists(serviceFile) ? (await import(pathToFileURL(serviceFile).href)).parseSkillMarkdown : null;

function section(text, heading) {
  const match = new RegExp(`^## ${heading}\\s*$`, 'm').exec(text);
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

async function lintPack(name) {
  const file = path.join(packsDir, name, 'SKILL.md');
  const text = await readFile(file, 'utf8').catch(() => null);
  if (text === null) return { name, errors: ['SKILL.md missing'], notes: [] };
  const errors = [];
  const notes = [];
  if (parse) {
    try {
      const meta = parse(text);
      if (meta.name !== name) errors.push(`name "${meta.name}" differs from folder`);
    } catch (error) { errors.push(String(error?.message ?? error).split('\n')[0].slice(0, 120)); }
  } else errors.push('parser unavailable (run npm run build)');
  const upstream = await readFile(path.join(packsDir, name, 'UPSTREAM.json'), 'utf8').then(JSON.parse, () => null);
  if (upstream === null) notes.push('no readable UPSTREAM.json (provenance unknown)');
  else {
    const bad = [];
    if (!/^https:\/\/[^\s]+$/.test(String(upstream.repository ?? ''))) bad.push('repository');
    if (!/^[0-9a-f]{40}$/.test(String(upstream.commit ?? ''))) bad.push('commit');
    if (!/^[0-9a-f]{64}$/.test(String(upstream.skillSha256 ?? ''))) bad.push('skillSha256');
    if (!upstream.license) bad.push('license');
    if (bad.length) notes.push(`UPSTREAM.json fields missing or malformed: ${bad.join(', ')}`);
  }
  const size = Buffer.byteLength(text, 'utf8');
  if (size > PAGE_BYTES) notes.push(`over ${PAGE_BYTES} bytes (${size})`);
  const triggers = section(text, 'Triggers');
  const nonTriggers = section(text, 'Non-triggers');
  if (triggers === null) notes.push('no ## Triggers');
  if (nonTriggers === null) notes.push('no ## Non-triggers');
  const dangling = [];
  for (const [, target] of text.matchAll(/\]\(([^)\s#]+)(?:#[^)\s]*)?\)/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    if (!await exists(path.join(packsDir, name, target))) dangling.push(target);
  }
  const packDir = path.join(packsDir, name);
  const unreadable = (await readdir(packDir, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => path.relative(packDir, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .filter(relative => relative !== 'SKILL.md' && !relative.startsWith('references/') && !/^(?:LICENSE[^/]*|UPSTREAM\.json)$/i.test(relative));
  if (dangling.length) notes.push(`dangling links: ${[...new Set(dangling)].slice(0, 5).join(', ')}`);
  if (unreadable.length) notes.push(`has files skills(read) cannot send (only references/ is readable): ${unreadable.slice(0, 5).join(', ')}`);
  if (/```(?:bash|sh)\b/.test(text) && !/```(?:powershell|pwsh|ps1)\b/.test(text)) notes.push('bash examples without a PowerShell equivalent');
  const nonTriggerHash = nonTriggers === null ? null : createHash('sha256').update(nonTriggers.replace(/\s+/g, ' ')).digest('hex').slice(0, 12);
  return { name, size, errors, notes, nonTriggerHash, upstream, triggerItems: bulletsOf(triggers), nonTriggerItems: bulletsOf(nonTriggers) };
}

// Bullet text normalised so that two packs saying the same thing in slightly different markdown compare equal.
function bulletsOf(body) {
  if (!body) return [];
  return body.split('\n').map(line => /^\s*(?:[-*]|\d+[.)])\s+(.*)$/.exec(line)?.[1])
    .filter(Boolean).map(item => item.toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ').replace(/[.;:]+$/, '').trim()).filter(item => item.length > 3);
}
const words = text => new Set(text.split(/[^a-z0-9]+/).filter(word => word.length > 3));

// CHB-11: where do the Triggers of different packs say the same thing, and does one pack's Non-triggers entry sit in another's Triggers.
function triggerOverlap(results) {
  const packsByBullet = new Map();
  for (const result of results) for (const item of new Set(result.triggerItems ?? [])) packsByBullet.set(item, [...(packsByBullet.get(item) ?? []), result.name]);
  const boilerplate = new Set([...packsByBullet].filter(([, packs]) => packs.length >= UNIFORM_FROM).map(([item]) => item));
  const own = new Map(results.map(result => [result.name, (result.triggerItems ?? []).filter(item => !boilerplate.has(item))]));
  const similarPairs = [];
  const names = [...own.keys()];
  for (let a = 0; a < names.length; a += 1) {
    const left = words(own.get(names[a]).join(' '));
    for (let b = a + 1; b < names.length; b += 1) {
      const right = words(own.get(names[b]).join(' '));
      if (left.size < 3 || right.size < 3) continue;
      const shared = [...left].filter(word => right.has(word)).length;
      const similarity = shared / (left.size + right.size - shared);
      if (similarity >= 0.6) similarPairs.push({ a: names[a], b: names[b], similarity: Number(similarity.toFixed(2)) });
    }
  }
  const nonTriggerBullets = new Map();
  for (const result of results) for (const item of new Set(result.nonTriggerItems ?? [])) nonTriggerBullets.set(item, (nonTriggerBullets.get(item) ?? 0) + 1);
  const crossed = [];
  for (const result of results) {
    for (const item of result.nonTriggerItems ?? []) {
      if ((nonTriggerBullets.get(item) ?? 0) >= UNIFORM_FROM) continue;
      for (const other of packsByBullet.get(item) ?? []) if (other !== result.name) crossed.push({ nonTriggerOf: result.name, triggerOf: other, bullet: item.slice(0, 100) });
    }
  }
  return {
    sharedTriggerBullets: [...boilerplate].map(item => ({ bullet: item.slice(0, 100), packs: packsByBullet.get(item).length })),
    similarPairs: similarPairs.sort((x, y) => y.similarity - x.similarity).slice(0, 20),
    nonTriggerAlsoTriggerElsewhere: crossed.slice(0, 20),
  };
}

// Explicit and read-only: asks each upstream repository for its current HEAD and compares it with the pinned commit.
// This is the only network use in the script and it only runs with --remote.
async function remoteDrift(results) {
  const { execFile } = await import('node:child_process');
  const heads = new Map();
  for (const repository of new Set(results.map(result => result.upstream?.repository).filter(Boolean))) {
    heads.set(repository, await new Promise(resolve => execFile('git', ['ls-remote', repository, 'HEAD'],
      { timeout: 30_000, windowsHide: true }, (error, stdout) => resolve(error ? null : stdout.split(/\s/)[0] || null))));
  }
  return results.filter(result => result.upstream?.repository)
    .map(result => ({ name: result.name, pinned: result.upstream.commit.slice(0, 12), head: heads.get(result.upstream.repository)?.slice(0, 12) ?? 'unreachable' }))
    .filter(item => item.head === 'unreachable' || !item.head.startsWith(item.pinned.slice(0, 12)));
}

const names = (await readdir(packsDir, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const results = [];
for (const name of names) results.push(await lintPack(name));

const sharing = new Map();
for (const result of results) if (result.nonTriggerHash) sharing.set(result.nonTriggerHash, [...(sharing.get(result.nonTriggerHash) ?? []), result.name]);
const uniform = [...sharing.values()].filter(packs => packs.length >= UNIFORM_FROM);
for (const result of results) {
  if (uniform.some(packs => packs.includes(result.name))) result.notes.push('Non-triggers text shared with ' + (uniform.find(packs => packs.includes(result.name)).length - 1) + ' other packs');
}

const count = predicate => results.filter(predicate).length;
const report = {
  packs: results.length,
  parserUsed: parse ? 'dist/skills/service.js parseSkillMarkdown' : 'none',
  errors: count(result => result.errors.length > 0),
  overPageBytes: count(result => (result.size ?? 0) > PAGE_BYTES),
  sharedNonTriggers: uniform.map(packs => ({ packs: packs.length, example: packs.slice(0, 3) })),
  withDanglingLinks: count(result => result.notes.some(note => note.startsWith('dangling'))),
  packsWithFilesOutsideReferences: count(result => result.notes.some(note => note.startsWith('has files'))),
  bashWithoutPowerShell: count(result => result.notes.includes('bash examples without a PowerShell equivalent')),
  upstreamProblems: count(result => result.notes.some(note => note.startsWith('UPSTREAM.json') || note.startsWith('no readable'))),
  triggerOverlap: triggerOverlap(results),
  ...(process.argv.includes('--remote') ? { upstreamBehindOrUnreachable: await remoteDrift(results) } : {}),
  findings: results.filter(result => result.errors.length || result.notes.length)
    .map(({ name, errors, notes }) => ({ name, errors, notes })),
  note: 'Baseline only. The byte size is the skills(read) page size, not a stored limit; the owner decides any ceiling. Use --remote to compare pinned upstream commits with each upstream HEAD (network, read-only).',
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--strict') && report.errors > 0) process.exitCode = 1;
