import { createHash } from 'node:crypto';
import { open, readdir, realpath, stat } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import { redactMemoryText } from '../memory/redaction.js';
import { WorkflowError } from './types.js';
import { analyzeEngineeringImpact } from './engineering-parser.js';
import { engineeringInventoryRecord, type EngineeringCoverage, type EngineeringDiscoveryResult, type EngineeringInventory, type EngineeringFacilities } from './engineering-types.js';
export * from './engineering-types.js';

const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|c|h|cc|cpp|cxx|hpp|cs|swift|rb|php|lua|sh|bash|ps1|bat|cmd|pl|ex|exs|erl|hs|scala|dart|r|sql|html|css|scss|vue|svelte|zig|nim|jl|clj|f|f90|pas|m|mm|sol|json|jsonc|yaml|yml|toml|ini|xml|lock|config|props|targets)$/i;
const SOURCE_BASENAME = /^(?:Dockerfile(?:\..+)?|Makefile|CMakeLists\.txt|go\.(?:mod|sum)|Gemfile(?:\.lock)?|requirements[^/]*\.txt|Pipfile(?:\.lock)?|\.gitmodules|\.gitignore|\.env\.(?:example|sample|template))$/i;
const PRIVATE_DIRS = new Set(['.git', '.hg', '.svn', '.agent-core', '.obsidian', 'node_modules', 'secrets', 'credentials', '.tools', '.venv', 'venv', '__pycache__', '.cache', '.next', '.nuxt', 'coverage', 'dist', 'target', 'bin', 'obj']);
const ROOT_OUTPUTS = new Set(['runtime', 'data', 'logs', 'reports', 'release', 'releases', 'referensi', 'build']);
const MAX_WALK_ENTRIES = 20_000;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const canonical = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
function inside(root: string, candidate: string) { const rel = path.relative(canonical(root), canonical(candidate)); return !rel || !rel.startsWith('..') && !path.isAbsolute(rel); }
function bound(value: number | undefined, fallback: number, ceiling: number, label: string) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new WorkflowError('WORKFLOW_ENGINEERING_BOUND_INVALID', `${label} is outside its supported bound`);
  return value;
}
export interface EngineeringDiscoveryOptions {
  workspace: WorkspacePolicy; protectedRoots?: string[]; maxFiles?: number; maxBytes?: number; maxFileBytes?: number; maxMatches?: number;
}
function excluded(relative: string, directory: boolean): boolean {
  const segments = relative.replaceAll('\\', '/').split('/'), lower = segments.map(part => part.toLowerCase());
  const basename = lower.at(-1)!;
  if (lower.length === 1 && directory && ROOT_OUTPUTS.has(basename)) return true;
  if (lower.some((part, index) => PRIVATE_DIRS.has(part) && (directory || index < lower.length - 1))) return true;
  if (lower.includes('referensi')) return true;
  // Nested native runtime is source. Other nested runtime state is not an implementation candidate.
  const runtime = lower.indexOf('runtime');
  if (runtime >= 0 && lower[runtime - 1] !== 'src' && runtime < lower.length - 1 && lower[runtime + 1] !== 'native') return true;
  if (!directory && (/^\.env(?:\.|$)/.test(basename) && !/^\.env\.(example|sample|template)$/.test(basename)
    || /^(?:\.npmrc|\.netrc|\.pypirc|credentials(?:\..*)?|secrets?(?:\..*)?|id_rsa(?:\..*)?|id_ed25519(?:\..*)?)$/.test(basename)
    || /\.(?:pem|pfx|p12|key|keystore)$/.test(basename))) return true;
  return false;
}
/** Captures source/config directly, including untracked files; Git health is not discovery authority. */
export async function collectEngineeringInventory(options: EngineeringDiscoveryOptions & { root: string }): Promise<EngineeringInventory> {
  const maxFiles = bound(options.maxFiles, 5000, 10_000, 'maxFiles');
  const maxBytes = bound(options.maxBytes, 64 * 1024 * 1024, 128 * 1024 * 1024, 'maxBytes');
  const maxFileBytes = bound(options.maxFileBytes, 2 * 1024 * 1024, 2 * 1024 * 1024, 'maxFileBytes');
  const root = await realpath(await options.workspace.resolveExisting(options.root));
  if (!(await stat(root)).isDirectory()) throw new WorkflowError('WORKFLOW_ENGINEERING_ROOT_INVALID', 'Discovery root must be a project directory');
  const entries: EngineeringInventory['entries'] = [], documents = new Map<string, string>(), nonCodePaths = new Set<string>();
  const coverage: EngineeringCoverage = { complete: true, truncated: false, exclusions: [], gaps: [], inventoryHash: '0'.repeat(64) };
  let bytes = 0, walked = 0, stopped = false;
  const gap = (file: string, reason: string) => { coverage.complete = false; coverage.gaps.push({ path: file, reason }); };
  const stop = (file: string, reason: string) => { coverage.truncated = true; stopped = true; gap(file, reason); };
  const walk = async (directory: string): Promise<void> => {
    let children;
    try { children = await readdir(directory, { withFileTypes: true }); }
    catch (error) { gap(directory, `DIRECTORY_${(error as NodeJS.ErrnoException).code ?? 'UNAVAILABLE'}`); return; }
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (stopped) return;
      const file = path.join(directory, child.name), relative = path.relative(root, file);
      if (++walked > MAX_WALK_ENTRIES) { stop(directory, 'ENTRY_LIMIT'); return; }
      if (excluded(relative, child.isDirectory()) || options.protectedRoots?.some(protectedRoot => inside(protectedRoot, file))) { coverage.exclusions.push(relative); continue; }
      if (child.isSymbolicLink()) { gap(file, 'SYMLINK_NOT_FOLLOWED'); continue; }
      if (child.isDirectory()) {
        try { const resolved = await realpath(file); if (!inside(root, resolved) || options.protectedRoots?.some(p => inside(p, resolved))) { gap(file, 'REALPATH_OUTSIDE_SCOPE'); continue; } }
        catch (error) { gap(file, `PATH_${(error as NodeJS.ErrnoException).code ?? 'UNAVAILABLE'}`); continue; }
        await walk(file); continue;
      }
      if (!child.isFile()) { gap(file, 'UNSUPPORTED_FILE_KIND'); continue; }
      if (!SOURCE.test(child.name) && !SOURCE_BASENAME.test(child.name)) {
        coverage.exclusions.push(relative);
        if (/\.(?:md|mdx|txt|rst|adoc)$/i.test(child.name)) nonCodePaths.add(canonical(file));
        continue;
      }
      if (entries.length >= maxFiles) { stop(file, 'FILE_LIMIT'); return; }
      try {
        const beforePath = await realpath(file);
        if (!inside(root, beforePath) || options.protectedRoots?.some(p => inside(p, beforePath))) { gap(file, 'REALPATH_OUTSIDE_SCOPE'); continue; }
        const handle = await open(file, 'r');
        try {
          const before = await handle.stat();
          if (!before.isFile()) { gap(file, 'UNSUPPORTED_FILE_KIND'); continue; }
          if (before.size > maxFileBytes) { gap(file, 'FILE_BYTE_LIMIT'); continue; }
          if (bytes + before.size > maxBytes) { stop(file, 'TOTAL_BYTE_LIMIT'); return; }
          const content = Buffer.alloc(before.size + 1);
          let size = 0;
          while (size < content.length) { const read = await handle.read(content, size, content.length - size, size); if (!read.bytesRead) break; size += read.bytesRead; }
          const after = await handle.stat(), afterPath = await realpath(file);
          if (canonical(beforePath) !== canonical(afterPath) || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || size !== before.size) { gap(file, 'SOURCE_CHANGED_DURING_CAPTURE'); continue; }
          const captured = content.subarray(0, size), text = captured.toString('utf8');
          if (captured.includes(0) || !Buffer.from(text, 'utf8').equals(captured)) { gap(file, 'SOURCE_ENCODING_UNSUPPORTED'); continue; }
          entries.push({ path: file, hash: hash(captured), bytes: size }); documents.set(file, text); bytes += size;
        } finally { await handle.close(); }
      } catch (error) { gap(file, `FILE_${(error as NodeJS.ErrnoException).code ?? 'UNAVAILABLE'}`); }
    }
  };
  await walk(root);
  entries.sort((a, b) => a.path.localeCompare(b.path)); coverage.exclusions.sort();
  const facilities = await collectFacilities(root, entries, documents, coverage, options.protectedRoots ?? []);
  coverage.gaps.sort((a, b) => a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason));
  coverage.inventoryHash = hash(JSON.stringify({ root, entries, facilities, exclusions: coverage.exclusions, nonCodePaths: [...nonCodePaths].sort(), gaps: coverage.gaps, truncated: coverage.truncated }));
  return { root, entries, documents, coverage, facilities, nonCodePaths };
}
export function discoverEngineering(input: { inventory: EngineeringInventory; query: string; maxMatches?: number }): EngineeringDiscoveryResult {
  if (!input.query.trim() || input.query.length > 2000) throw new WorkflowError('WORKFLOW_ENGINEERING_QUERY_INVALID', 'Use a nonempty query of at most 2000 characters');
  const maxMatches = bound(input.maxMatches, 1000, 10_000, 'maxMatches');
  const { inventory } = input, query = input.query.trim(), needle = query.toLowerCase();
  const coverage: EngineeringCoverage = { ...inventory.coverage, gaps: [...inventory.coverage.gaps], exclusions: [...inventory.coverage.exclusions] };
  const matches: EngineeringDiscoveryResult['matches'] = [];
  outer: for (const entry of inventory.entries) {
    const lines = inventory.documents.get(entry.path)!.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!; if (!line.toLowerCase().includes(needle)) continue;
      if (matches.length >= maxMatches) { coverage.complete = false; coverage.truncated = true; coverage.gaps.push({ path: entry.path, reason: 'MATCH_LIMIT' }); break outer; }
      const preview = redactMemoryText(line).text.replace(/\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+|sk-[A-Za-z0-9_-]{16,})\b/g, '[REDACTED:TOKEN]').slice(0, 1000);
      matches.push({ path: entry.path, line: index + 1, preview, sourceHash: entry.hash });
    }
  }
  return { inventory: engineeringInventoryRecord(inventory), query, matches, coverage, facilities: inventory.facilities };
}
async function collectFacilities(root: string, entries: EngineeringInventory['entries'], documents: Map<string, string>, coverage: EngineeringCoverage, protectedRoots: string[]): Promise<EngineeringFacilities> {
  const facilities: EngineeringFacilities = { nodeVersion: process.version, platform: process.platform,
    builtins: [...new Set(builtinModules.filter(name => !name.startsWith('_')).map(name => name.startsWith('node:') ? name : `node:${name}`))].sort(), dependencies: [] };
  const gap = (file: string, reason: string) => { coverage.complete = false; coverage.gaps.push({ path: file, reason }); };
  for (const entry of entries.filter(item => path.basename(item.path).toLowerCase() === 'package.json')) {
    let manifest: Record<string, unknown>;
    try { const parsed: unknown = JSON.parse(documents.get(entry.path)!); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); manifest = parsed as Record<string, unknown>; }
    catch { gap(entry.path, 'PACKAGE_MANIFEST_INVALID'); continue; }
    const declarations = new Map<string, string>();
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const data = manifest[field]; if (data === undefined) continue;
      if (!data || typeof data !== 'object' || Array.isArray(data)) { gap(entry.path, 'PACKAGE_DEPENDENCIES_INVALID'); continue; }
      for (const [name, version] of Object.entries(data)) {
        if (!/^(?:@[a-z\d._~-]+\/)?[a-z\d._~-]+$/i.test(name) || name.split('/').some(part => part === '.' || part === '..') || name.length > 300 || typeof version !== 'string' || !version || version.length > 1000) { gap(entry.path, 'PACKAGE_DECLARATION_INVALID'); continue; }
        if (!declarations.has(name)) declarations.set(name, version);
      }
    }
    for (const [name, version] of [...declarations].sort(([a], [b]) => a.localeCompare(b))) {
      if (facilities.dependencies.length >= 1000) { coverage.truncated = true; gap(entry.path, 'DEPENDENCY_LIMIT'); return facilities; }
      const dependency: EngineeringFacilities['dependencies'][number] = { name, declaredVersion: redactMemoryText(version).text.replace(/https?:\/\/[^/\s]+@/gi, 'https://[REDACTED]@'), manifestPath: entry.path, manifestHash: entry.hash };
      facilities.dependencies.push(dependency);
      // Inspect manifest bytes only; never import/require a dependency or execute its scripts.
      const installedPath = path.join(path.dirname(entry.path), 'node_modules', ...name.split('/'), 'package.json');
      let installedReal: string;
      try { installedReal = await realpath(installedPath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') gap(installedPath, 'INSTALLED_MANIFEST_UNAVAILABLE'); continue; }
      if (!inside(root, installedReal) || protectedRoots.some(p => inside(p, installedReal))) { gap(installedPath, 'INSTALLED_MANIFEST_OUTSIDE_SCOPE'); continue; }
      try {
        const handle = await open(installedPath, 'r');
        try {
          const before = await handle.stat();
          if (!before.isFile() || before.size > 256 * 1024) { gap(installedPath, 'INSTALLED_MANIFEST_LIMIT'); continue; }
          const buffer = Buffer.alloc(before.size + 1); let size = 0;
          while (size < buffer.length) { const read = await handle.read(buffer, size, buffer.length - size, size); if (!read.bytesRead) break; size += read.bytesRead; }
          const after = await handle.stat();
          if (size !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || canonical(await realpath(installedPath)) !== canonical(installedReal)) { gap(installedPath, 'INSTALLED_MANIFEST_CHANGED'); continue; }
          const captured = buffer.subarray(0, size), data = JSON.parse(captured.toString('utf8')) as Record<string, unknown>;
          if (data.name !== name || typeof data.version !== 'string' || !data.version || data.version.length > 200) { gap(installedPath, 'INSTALLED_MANIFEST_INVALID'); continue; }
          dependency.installedVersion = data.version; dependency.installedManifestPath = installedPath; dependency.installedManifestHash = hash(captured);
        } finally { await handle.close(); }
      } catch { gap(installedPath, 'INSTALLED_MANIFEST_INVALID'); }
    }
  }
  return facilities;
}
export class EngineeringDiscovery {
  constructor(private readonly options: EngineeringDiscoveryOptions) {}
  collect(root: string) { return collectEngineeringInventory({ ...this.options, root }); }
  async discover(root: string, query: string) { return discoverEngineering({ inventory: await this.collect(root), query, maxMatches: this.options.maxMatches }); }
  async impact(root: string, targets: string[]) { return analyzeEngineeringImpact(await this.collect(root), targets); }
}
