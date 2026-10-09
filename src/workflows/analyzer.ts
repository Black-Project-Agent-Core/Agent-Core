import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript-lsp-runtime';
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from './types.js';

export const WORKFLOW_SOURCE_LIMITS = {
  maxFiles: 1_200,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
  maxEntries: 12_000,
  maxDepth: 16,
  maxPathLength: 240,
  maxNodes: 60,
  maxPathsPerNode: 60,
  maxEvidencePerEdge: 8,
} as const;

const SOURCE_ROOTS = ['src', 'SubProject/agent-core-memory/src'] as const;
const MEMORY_SOURCE_ROOT = `${SOURCE_ROOTS[1]}/`;
const MEMORY_OUTPUT_ROOT = 'SubProject/agent-core-memory/dist/';
const BLOCKED = /^(?:runtime|secrets?|credentials?|node_modules|dist|build|bin|obj|assets|public|coverage|tests?|__tests__|fixtures?|__fixtures__|DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT)$/i;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

interface AllowedSource { path: string; text: string; hash: string }
interface SourceImports { imports: Array<{ specifier?: string; line: number }>; parseError: boolean }
// Keep only the previous root/scan; no source text or ASTs survive a refresh.
let previousRoot = '';
let previousImports = new Map<string, { hash: string; result: SourceImports }>();

function excluded(relative: string): boolean {
  return relative.length > WORKFLOW_SOURCE_LIMITS.maxPathLength
    || /[\\\x00-\x1f\x7f]/.test(relative)
    || relative.split('/').some(part => part.startsWith('.') || BLOCKED.test(part) || /\.(?:tests?|specs?)$/i.test(part))
    || /(?:\.(?:test|spec|d)\.(?:ts|tsx)|(?:Tests|Spec)\.cs)$/i.test(relative);
}

/** Reads only bounded, regular source files; never resolves imports through the filesystem. */
export async function collectAllowedSources(projectRoot: string): Promise<{ sources: AllowedSource[]; limitations: string[] }> {
  const root = path.resolve(projectRoot);
  if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root) {
    throw new Error('Workflows project root must not contain a symlink.');
  }
  const sources: AllowedSource[] = [];
  const warnings = new Set<string>();
  let totalBytes = 0;
  let entries = 0;

  async function inspect(relative: string, depth: number): Promise<void> {
    if (excluded(relative)) return;
    if (depth > WORKFLOW_SOURCE_LIMITS.maxDepth || entries++ >= WORKFLOW_SOURCE_LIMITS.maxEntries) {
      warnings.add('Source traversal depth/entry limit reached; graph is partial.');
      return;
    }
    const absolute = path.join(root, ...relative.split('/'));
    try {
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink() || await realpath(absolute) !== absolute) {
        warnings.add('Symlink sources or path escapes were excluded.');
        return;
      }
      if (stat.isDirectory()) {
        for (const entry of (await readdir(absolute)).sort(compare)) {
          if (entries >= WORKFLOW_SOURCE_LIMITS.maxEntries) {
            warnings.add('Source traversal depth/entry limit reached; graph is partial.');
            break;
          }
          await inspect(`${relative}/${entry}`, depth + 1);
        }
        return;
      }
      if (!stat.isFile() || !/\.(?:ts|tsx|cs)$/.test(relative)) return;
      if (stat.size > WORKFLOW_SOURCE_LIMITS.maxFileBytes) {
        warnings.add('Oversized source files excluded (maximum 1 MiB per file).');
        return;
      }
      if (sources.length >= WORKFLOW_SOURCE_LIMITS.maxFiles || totalBytes + stat.size > WORKFLOW_SOURCE_LIMITS.maxTotalBytes) {
        warnings.add('Source file/byte limit reached; graph is partial.');
        return;
      }
      // O_NOFOLLOW plus identity checks prevents final-component symlink replacement.
      const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || await realpath(absolute) !== absolute) {
          warnings.add('Sources changing during inspection were excluded.');
          return;
        }
        const buffer = Buffer.alloc(Math.min(opened.size, WORKFLOW_SOURCE_LIMITS.maxFileBytes) + 1);
        let bytes = 0;
        while (bytes < buffer.length) {
          const read = await handle.read(buffer, bytes, buffer.length - bytes, null);
          if (!read.bytesRead) break;
          bytes += read.bytesRead;
        }
        const after = await handle.stat();
        if (bytes > WORKFLOW_SOURCE_LIMITS.maxFileBytes || totalBytes + bytes > WORKFLOW_SOURCE_LIMITS.maxTotalBytes) {
          warnings.add('Source file/byte limit reached; graph is partial.');
          return;
        }
        if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
          warnings.add('Sources changing during inspection were excluded.');
          return;
        }
        const content = buffer.subarray(0, bytes);
        sources.push({ path: relative, text: content.toString('utf8'), hash: digest(content) });
        totalBytes += bytes;
      } finally { await handle.close(); }
    } catch {
      warnings.add('Unavailable or unsafe source paths were excluded; graph may be partial.');
    }
  }

  for (const sourceRoot of SOURCE_ROOTS) {
    // Check every source-root ancestor before entering it, including SubProject.
    let valid = true;
    let current = root;
    for (const part of sourceRoot.split('/')) {
      current = path.join(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink() || await realpath(current) !== current) {
          warnings.add('Symlink sources or path escapes were excluded.');
          valid = false;
          break;
        }
      } catch {
        warnings.add(`Missing or unavailable source root: ${sourceRoot}.`);
        valid = false;
        break;
      }
    }
    if (valid) await inspect(sourceRoot, 0);
  }
  return { sources: sources.sort((a, b) => compare(a.path, b.path)), limitations: [...warnings].sort(compare) };
}

function subsystem(sourcePath: string): string {
  const memory = sourcePath.startsWith(MEMORY_SOURCE_ROOT);
  const local = sourcePath.slice(memory ? MEMORY_SOURCE_ROOT.length : 4).split('/');
  const group = local.length === 1 ? (!memory && local[0].startsWith('agent-') ? 'agent' : 'core')
    : local[0] === 'rdc' && local.length > 2 ? `rdc/${local[1]}` : local[0];
  return `${memory ? 'memory' : 'system'}/${group}`;
}

function labelFor(id: string): string {
  const [family, ...parts] = id.split('/');
  const group = parts.join(' / ');
  const names: Record<string, string> = { core: 'Core runtime', agent: 'Native Agent', memory: 'Memory host', rdc: 'Machine control', mcp: 'MCP', ui: 'UI', other: 'Other subsystems' };
  return family === 'memory' ? `Memory / ${group === 'memory' ? 'Engine' : group}` : names[group] ?? group;
}

function resolveImport(sourcePath: string, specifier: string, allowed: Set<string>): string | undefined {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return;
  if (/[\\\x00-\x1f]/.test(specifier)) return;
  let target = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier));
  if (target.startsWith(MEMORY_OUTPUT_ROOT)) target = MEMORY_SOURCE_ROOT + target.slice(MEMORY_OUTPUT_ROOT.length);
  const base = target.replace(/\.(?:js|jsx)$/, '');
  return [target, `${base}.ts`, `${base}.tsx`, `${target}/index.ts`, `${target}/index.tsx`].find(candidate => allowed.has(candidate));
}

function extractImports(source: AllowedSource): SourceImports {
  let ast: ts.SourceFile;
  try {
    ast = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true, source.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  } catch { return { imports: [], parseError: true }; }
  // TypeScript exposes these diagnostics but omits them from its public SourceFile interface.
  if ((ast as ts.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics?.length) return { imports: [], parseError: true };
  const imports: SourceImports['imports'] = [];
  const record = (expression: ts.Node | undefined, origin: ts.Node): void => {
    const specifier = expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) ? expression.text : undefined;
    imports.push({ specifier, line: ast.getLineAndCharacterOfPosition(origin.getStart(ast)).line + 1 });
  };
  const pending: ts.Node[] = [ast];
  while (pending.length) {
    const node = pending.pop()!;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) record(node.moduleSpecifier, node);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      record(node.arguments[0], node);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      record(node.moduleReference.expression, node);
    } else if (ts.isImportTypeNode(node)) {
      record(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, node);
    }
    const children: ts.Node[] = [];
    ts.forEachChild(node, child => { children.push(child); });
    for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]);
  }
  return { imports, parseError: false };
}

export async function analyzeSources(projectRoot: string): Promise<WorkflowGraph> {
  const { sources, limitations } = await collectAllowedSources(projectRoot);
  const root = path.resolve(projectRoot);
  const cache = root === previousRoot ? previousImports : new Map<string, { hash: string; result: SourceImports }>();
  const nextImports = new Map<string, { hash: string; result: SourceImports }>();
  limitations.push('Static source dependencies only, not observed execution; subsystem-internal imports are omitted.',
    'Only src and SubProject/agent-core-memory/src are scanned; Memory dist imports map to matching src files.');
  const groups = [...new Set(sources.map(source => subsystem(source.path)))].sort(compare);
  // Reserve two overflow nodes so both source families survive larger repositories.
  const retained = new Set(groups.length > WORKFLOW_SOURCE_LIMITS.maxNodes ? groups.slice(0, WORKFLOW_SOURCE_LIMITS.maxNodes - 2) : groups);
  const fileGroups = new Map(sources.map(source => {
    const id = subsystem(source.path);
    return [source.path, retained.has(id) ? id : `${id.split('/')[0]}/other`];
  }));
  if (retained.size < groups.length) limitations.push('Subsystems above the 60-node limit are grouped into Other subsystems.');
  const nodes = new Map<string, WorkflowNode>();
  let pathsTruncated = false;
  for (const source of sources) {
    const id = fileGroups.get(source.path)!;
    const node = nodes.get(id) ?? { id, label: labelFor(id), kind: id.startsWith('memory/') ? 'memory' : 'system', paths: [] };
    if (node.paths.length < WORKFLOW_SOURCE_LIMITS.maxPathsPerNode) node.paths.push(source.path);
    else pathsTruncated = true;
    nodes.set(id, node);
  }
  const allowed = new Set(sources.map(source => source.path));
  const edges = new Map<string, WorkflowEdge>();
  let unresolved = 0;
  let external = 0;
  let dynamic = 0;
  let unsupported = 0;
  let parseErrors = 0;
  let evidenceTruncated = false;
  for (const source of sources) {
    if (source.path.endsWith('.cs')) { unsupported++; continue; }
    const cached = cache.get(source.path);
    const result = cached?.hash === source.hash ? cached.result : extractImports(source);
    nextImports.set(source.path, { hash: source.hash, result });
    if (result.parseError) { parseErrors++; continue; }
    for (const { specifier, line } of result.imports) {
      if (specifier === undefined) { dynamic++; continue; }
      if (!specifier.startsWith('.')) { external++; continue; }
      const target = resolveImport(source.path, specifier, allowed);
      if (!target) { unresolved++; continue; }
      const from = fileGroups.get(source.path)!;
      const to = fileGroups.get(target)!;
      if (from === to) continue;
      const id = `${from}->${to}`;
      const edge = edges.get(id) ?? { id, from, to, kind: 'imports', evidence: [] };
      const evidence = { path: source.path, line };
      if (!edge.evidence.some(item => item.path === evidence.path && item.line === evidence.line)) {
        if (edge.evidence.length < WORKFLOW_SOURCE_LIMITS.maxEvidencePerEdge) edge.evidence.push(evidence);
        else evidenceTruncated = true;
      }
      edges.set(id, edge);
    }
  }
  previousRoot = root;
  previousImports = nextImports;
  if (external) limitations.push(`${external} external or bare-module imports are not resolved.`);
  if (unresolved) limitations.push(`${unresolved} relative imports have no allowed source target.`);
  if (dynamic) limitations.push(`${dynamic} nonliteral dynamic imports cannot be resolved statically.`);
  if (unsupported) limitations.push(`${unsupported} C# source files have unsupported dependency analysis; nodes only.`);
  if (parseErrors) limitations.push(`${parseErrors} files have syntax errors or exceed parser limits; their imports were omitted.`);
  if (evidenceTruncated) limitations.push(`Edge evidence is capped at ${WORKFLOW_SOURCE_LIMITS.maxEvidencePerEdge} source locations per edge.`);
  if (pathsTruncated) {
    limitations.push(`Node source paths are capped at ${WORKFLOW_SOURCE_LIMITS.maxPathsPerNode} per subsystem.`);
  }
  return {
    schemaVersion: 1,
    fingerprint: digest(JSON.stringify({ version: 1, sources: sources.map(source => [source.path, source.hash]), limitations })),
    files: sources.length,
    nodes: [...nodes.values()].sort((a, b) => compare(a.id, b.id)),
    edges: [...edges.values()].sort((a, b) => compare(a.id, b.id)),
    unknowns: unresolved + external + dynamic + unsupported + parseErrors,
    limitations,
  };
}
