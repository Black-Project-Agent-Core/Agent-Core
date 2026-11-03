import { lstat, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';

const MAP = 'docs/PROJECT-STRUCTURE.md';
const POLICY_START = '<!-- DIRECTORY-POLICY:START -->';
const POLICY_END = '<!-- DIRECTORY-POLICY:END -->';
const START = '<!-- DIRECTORY-SNAPSHOT:START -->';
const END = '<!-- DIRECTORY-SNAPSHOT:END -->';
const LOCK = 'docs/.PROJECT-STRUCTURE.md.lock';
const MAX_BYTES = 256 * 1024;
const MAX_DIRECTORIES = 20_000;
export const PARALLEL_SKILL_HOMES = ['bundled-skills', 'skills', 'capability-packs', 'runtime/capability-packs', 'runtime/skill-catalog', 'runtime/skills-v2'] as const;
const rootBoundaries: Record<string, string> = {
  '.git': 'metadata Git; tidak ditelusuri', '.grafel': 'state/index lokal; tidak ditelusuri',
  '.rdc-standalone': 'tool operator eksternal; tidak ditelusuri', '.superpowers': 'state host lokal; tidak ditelusuri',
  '.claude': 'izin lokal Claude Code (settings.local.json); tidak ditelusuri',
  node_modules: 'dependency; tidak ditelusuri', dist: 'hasil build; tidak ditelusuri',
  release: 'arsip rilis; tidak ditelusuri', Backups: 'backup existing; tidak ditelusuri',
  secrets: 'terlindungi; tidak ditelusuri', 'DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT': 'terlindungi; tidak ditelusuri',
  vendor: 'pihak ketiga; tidak ditelusuri', 'tunnel-client': 'tool/config lokal; tidak ditelusuri',
  source: 'snapshot source paket rilis; bukan rumah authoring',
};
const boundaryNames = new Set(['node_modules', 'bin', 'obj', '.git', '.venv', 'venv', '.cache', '__pycache__', 'target', 'dist', 'build', 'coverage', 'secrets', 'vendor']);
interface Owner { purpose: string; path: string; aliases?: string[] }
interface Intent { path: string; purpose: string; owner: string }
interface Policy { version: 1; owners: Owner[]; directoryIntents: Intent[] }
interface Directory { path: string; label: string; depth: number; last: boolean; prefix: string }
interface MapState { text: string; policy: Policy; baseline: Set<string>; directories: Directory[]; expected: string; issues: string[] }
const key = (value: string) => value.toLowerCase();
const inside = (value: string, parent: string) => key(value) === key(parent) || key(value).startsWith(key(parent) + '/');
const fail = (message: string): never => { throw new Error('PROJECT_STRUCTURE: ' + message); };
const relativePath = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\r\n\0<>]/.test(value)
    || path.posix.isAbsolute(value) || /^[a-z]:/i.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..' || part.trim() !== part))
    return fail('invalid project-relative directory path');
  return value;
};
function section(text: string, start: string, end: string): string {
  if (text.split(start).length !== 2 || text.split(end).length !== 2 || text.indexOf(end) < text.indexOf(start))
    return fail('missing or duplicate map markers: ' + start);
  return text.slice(text.indexOf(start) + start.length, text.indexOf(end));
}
function parsePolicy(text: string): Policy {
  const block = section(text, POLICY_START, POLICY_END).trim();
  const match = /^```json\s*\n([\s\S]*?)\n```$/.exec(block);
  if (!match) return fail('directory policy must contain one JSON block');
  const policy = JSON.parse(match[1]) as Policy;
  if (policy.version !== 1 || !Array.isArray(policy.owners) || !Array.isArray(policy.directoryIntents))
    return fail('invalid directory policy');
  const paths = new Map<string, string>(), purposes = new Map<string, string>();
  for (const row of [...policy.owners, ...policy.directoryIntents]) {
    relativePath(row.path);
    if (typeof row.purpose !== 'string' || !row.purpose.trim() || row.purpose.length > 160)
      return fail('every directory declaration needs an explicit purpose');
    const purpose = key(row.purpose.trim()), oldPath = purposes.get(purpose);
    if (oldPath && key(oldPath) !== key(row.path)) return fail(`duplicate purpose ${row.purpose}; reuse ${oldPath}`);
    if (paths.has(key(row.path))) return fail('duplicate declaration: ' + row.path);
    purposes.set(purpose, row.path); paths.set(key(row.path), row.purpose);
  }
  for (const owner of policy.owners) {
    if (owner.aliases !== undefined && !Array.isArray(owner.aliases)) return fail('invalid aliases');
    for (const alias of owner.aliases ?? []) relativePath(alias);
  }
  for (const intent of policy.directoryIntents) {
    relativePath(intent.owner);
    const owner = nearestOwner(policy, intent.path);
    if (!owner || key(owner.path) !== key(intent.owner) || !inside(intent.path, intent.owner) || key(intent.path) === key(intent.owner))
      return fail('new directory must remain inside its declared existing owner: ' + intent.path);
  }
  return policy;
}
function nearestOwner(policy: Policy, relative: string): Owner | undefined {
  return policy.owners.filter(owner => inside(relative, owner.path)).sort((a, b) => b.path.length - a.path.length)[0];
}
function declared(policy: Policy, relative: string): boolean {
  return policy.directoryIntents.some(intent => inside(relative, intent.path)
    || inside(intent.path, relative) && inside(relative, intent.owner))
    || policy.owners.some(owner => inside(owner.path, relative));
}
function parseBaseline(text: string): Set<string> {
  const result = new Set<string>(), stack: string[] = [];
  for (const line of section(text, START, END).split(/\r?\n/)) {
    const match = /^((?:\|   |    )*)(?:\|-- |`-- )(.+?)\/(?:  \[.*\])?$/.exec(line);
    if (!match) continue;
    const depth = match[1].length / 4;
    if (depth > stack.length) return fail('invalid snapshot indentation');
    stack.length = depth; stack.push(match[2]);
    const relative = relativePath(stack.join('/'));
    if (result.has(key(relative))) return fail('duplicate snapshot entry: ' + relative);
    result.add(key(relative));
  }
  return result;
}
function boundary(relative: string, name: string, link: boolean): string {
  if (link) return 'link; tidak diikuti';
  if (!relative.includes('/') && rootBoundaries[name]) return rootBoundaries[name];
  if (name === 'secrets') return 'terlindungi; tidak ditelusuri';
  if (boundaryNames.has(name) || name.endsWith('.WebView2')) return 'dependency/output/profile; tidak ditelusuri';
  if (relative.startsWith('runtime/') && relative !== 'runtime/skills' && !relative.startsWith('runtime/skills/capability-packs/'))
    return relative === 'runtime/skills/capability-packs' ? '' : relative.startsWith('runtime/skills/')
      ? 'artifact/state SkillService; lihat pola role' : 'state/tooling/output existing; tidak ditelusuri';
  if (relative.startsWith('SubProject/') && name === 'runtime') return 'runtime subproyek; tidak ditelusuri';
  return '';
}
// Live install state exists only where Agent Core runs (Platform), never in the git Source tree. Leaving it out keeps the snapshot identical in both.
const INSTALL_STATE_ROOTS = new Set(['.grafel', '.rdc-standalone', 'dist']);
const installState = (relative: string, label: string) => INSTALL_STATE_ROOTS.has(relative) || label === 'state/tooling/output existing; tidak ditelusuri';
async function collect(root: string, incoming?: { source: string; destination: string }): Promise<Directory[]> {
  const result: Directory[] = [];
  async function walk(current: string, relative: string, prefix: string, depth: number) {
    if (depth > 64) return fail('directory depth limit');
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) return fail('directory changed during inspection: ' + relative);
    const entries = (await readdir(current, { withFileTypes: true })).filter(entry => {
      const child = path.posix.join(relative, entry.name);
      return (entry.isDirectory() || entry.isSymbolicLink()) && child !== LOCK
        && !installState(child, boundary(child, entry.name, entry.isSymbolicLink()));
    }).sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i], child = path.posix.join(relative, entry.name);
      const label = boundary(child, entry.name, entry.isSymbolicLink()), last = i === entries.length - 1;
      if (result.length >= MAX_DIRECTORIES) return fail('directory count limit');
      result.push({ path: child, label, depth, last, prefix });
      if (!label) await walk(path.join(current, entry.name), child, prefix + (last ? '    ' : '|   '), depth + 1);
    }
  }
  await walk(incoming?.source ?? root, incoming?.destination ?? '', '', 0);
  return result;
}
function copyBase(name: string): string {
  return key(name).replace(/(?:[-_. ](?:copy|backup|new|final|v\d+|\d{8}))+$/i, '').replace(/[-_. ]+/g, '-');
}
function placementIssue(policy: Policy, relative: string, known: Iterable<string>): string | undefined {
  for (const alias of PARALLEL_SKILL_HOMES)
    if (inside(relative, alias)) return `parallel home ${relative}; reuse runtime/skills`;
  for (const owner of policy.owners) for (const alias of owner.aliases ?? [])
    if (inside(relative, alias)) return `parallel home ${relative}; reuse ${owner.path}`;
  const parent = path.posix.dirname(relative), name = path.posix.basename(relative), base = copyBase(name);
  for (const existing of known) {
    if (key(existing) === key(relative)) {
      if (existing !== relative) return `duplicate folder casing ${relative}; reuse ${existing}`;
      continue;
    }
    if (key(path.posix.dirname(existing)) === key(parent) && copyBase(path.posix.basename(existing)) === base)
      return `duplicate folder ${relative}; reuse ${existing}`;
  }
  return undefined;
}
function render(directories: Directory[]): string {
  return '\n\nDaftar otomatis: **' + directories.length + ' direktori/boundary**. Subtree privat, dependency, generated output, arsip dan link diberi label tanpa ditelusuri. State instalasi hidup (`dist`, `.grafel`, `.rdc-standalone`, state di `runtime/*`) tidak dicantumkan agar daftar sama di Source dan Platform. Jangan edit blok ini; gunakan `npm run structure:sync`.\n\n```text\n<PROJECT_ROOT>/\n'
    + directories.map(row => row.prefix + (row.last ? '`-- ' : '|-- ') + path.posix.basename(row.path) + '/' + (row.label ? '  [' + row.label + ']' : '')).join('\n')
    + '\n```\n\n';
}
async function state(root: string): Promise<MapState> {
  await assertMapParents(root);
  const file = path.join(root, MAP);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) return fail('map must be a bounded regular file');
  const text = await readFile(file, 'utf8'), policy = parsePolicy(text), baseline = parseBaseline(text);
  const directories = await collect(root), known = directories.map(row => row.path), issues: string[] = [];
  for (const row of directories) {
    const issue = placementIssue(policy, row.path, known);
    if (issue) issues.push(issue);
    if (!baseline.has(key(row.path)) && !declared(policy, row.path))
      issues.push('undeclared directory ' + row.path + '; define its distinct purpose in directoryIntents first');
  }
  const block = render(directories);
  const expected = text.slice(0, text.indexOf(START) + START.length) + block + text.slice(text.indexOf(END));
  return { text, policy, baseline, directories, expected, issues: [...new Set(issues)] };
}
export async function inspectProjectStructure(projectRoot: string) {
  try {
    const current = await state(path.resolve(projectRoot));
    return { directoryCount: current.directories.length, stale: current.text !== current.expected,
      issues: [...current.issues, ...(current.text !== current.expected ? ['PROJECT-STRUCTURE.md snapshot is stale; run npm run structure:sync'] : [])] };
  } catch (error) {
    return { directoryCount: 0, stale: true, issues: [error instanceof Error ? error.message : String(error)] };
  }
}
async function locked<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const file = path.join(root, MAP);
  await assertMapParents(root);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) return fail('map must be a regular file');
  const release = await lockfile.lock(file, { realpath: false, lockfilePath: path.join(root, LOCK), stale: 120_000, update: 60_000,
    retries: { retries: 40, minTimeout: 25, maxTimeout: 100 } });
  try { return await operation(); } finally { await release(); }
}
async function assertMapParents(root: string): Promise<void> {
  for (const directory of [root, path.join(root, 'docs')]) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) return fail('map parent must not be a link');
  }
}
async function sync(root: string): Promise<{ updated: boolean; directoryCount: number }> {
  const current = await state(root);
  if (current.issues.length) return fail(current.issues.join('; '));
  if (current.text === current.expected) return { updated: false, directoryCount: current.directories.length };
  const target = path.join(root, MAP), temporary = target + '.' + randomUUID() + '.tmp';
  const file = await open(temporary, 'wx');
  try {
    await file.writeFile(current.expected); await file.sync(); await file.close();
    if (await readFile(target, 'utf8') !== current.text) return fail('map changed during synchronization; retry after inspecting it');
    await rename(temporary, target);
  } finally { await file.close().catch(() => undefined); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return { updated: true, directoryCount: current.directories.length };
}
export async function synchronizeProjectStructure(projectRoot: string) {
  const root = path.resolve(projectRoot);
  return locked(root, () => sync(root));
}
export async function withProjectStructureMutation<T>(projectRoot: string,
  mutation: { kind: 'create-directory' | 'move'; source?: string; destination: string; requestedSource?: string; requestedDestination?: string }, operation: () => Promise<T>): Promise<T> {
  const root = path.resolve(projectRoot), destination = path.resolve(mutation.destination);
  const dest = path.relative(root, destination).split(path.sep).join('/');
  const src = mutation.source && path.relative(root, path.resolve(mutation.source)).split(path.sep).join('/');
  if (mutation.kind === 'move' && src === '' && dest !== '') return fail('cannot relocate the canonical project root');
  if (src && key(src) === key(MAP) && key(src) !== key(dest)) return fail('cannot relocate the canonical folder map');
  const inRoot = (value: string) => value !== '..' && !value.startsWith('../') && !path.isAbsolute(value);
  const sourceInfo = mutation.source ? await lstat(mutation.source).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; }) : undefined;
  if (mutation.kind === 'move' && !sourceInfo?.isDirectory() && !sourceInfo?.isSymbolicLink()) return operation();
  for (const [requested, resolved] of [[mutation.requestedDestination, destination], [mutation.requestedSource, mutation.source]]) {
    if (!requested || !resolved) continue;
    const lexical = path.resolve(root, requested), relative = path.relative(root, lexical).split(path.sep).join('/');
    if (inRoot(relative) && key(lexical) !== key(path.resolve(resolved)))
      return fail('project directory mutation through a resolved link is forbidden');
  }
  // Ordinary external workspaces retain their existing permissions and filesystem behavior.
  if (!inRoot(dest) && (src === undefined || !inRoot(src))) return operation();
  return locked(root, async () => {
    const current = await state(root);
    if (current.issues.length) return fail(current.issues.join('; '));
    if (mutation.kind === 'move' && src && current.policy.owners.some(owner => inside(owner.path, src)))
      return fail('cannot relocate an existing canonical owner: ' + src);
    if (inRoot(dest) && dest) {
      const known = current.directories.map(row => row.path);
      const opaque = current.directories.find(row => row.label && inside(dest, row.path) && key(dest) !== key(row.path));
      let anchor = root;
      let relative = '';
      for (const part of dest.split('/')) {
        anchor = path.join(anchor, part);
        relative = path.posix.join(relative, part);
        const info = await lstat(anchor).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
        if (info?.isSymbolicLink()) return fail('directory mutation through a link is forbidden');
        if (!opaque || !inside(relative, opaque.path) || key(relative) === key(opaque.path)) {
          const issue = placementIssue(current.policy, relative, known);
          if (issue) return fail(issue);
          if (!current.baseline.has(key(relative)) && !declared(current.policy, relative))
            return fail('undeclared directory ' + relative + '; add purpose and existing owner to directoryIntents');
        }
      }
      if (mutation.kind === 'move' && sourceInfo?.isDirectory() && !opaque) {
        if (src && current.directories.some(row => row.label && inside(src, row.path)))
          return fail('cannot relocate a private/generated owner into authored storage');
        const subtree = await collect(root, { source: mutation.source!, destination: dest });
        const projected = [dest, ...subtree.map(row => row.path)];
        const remaining = known.filter(relative => !src || !inside(relative, src));
        for (const relative of projected) {
          const issue = placementIssue(current.policy, relative, [...remaining, ...projected]);
          if (issue) return fail(issue);
          if (!current.baseline.has(key(relative)) && !declared(current.policy, relative))
            return fail('undeclared incoming directory ' + relative + '; declare its purpose before moving');
        }
      }
    }
    const result = await operation();
    try { await sync(root); }
    catch (error) { throw new Error('PROJECT_STRUCTURE_UPDATE_FAILED_AFTER_MUTATION: filesystem operation completed; inspect before retry. ' + (error instanceof Error ? error.message : String(error))); }
    return result;
  });
}
