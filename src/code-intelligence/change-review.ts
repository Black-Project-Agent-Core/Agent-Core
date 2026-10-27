import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseCallToolResultJson } from '../mcp/call-tool-result.js';
import { redactSensitiveString } from '../security/redaction.js';
import type { SemanticIdeService } from '../semantic-ide/service.js';
import type { SemanticSymbol } from '../semantic-ide/types.js';
import type { CodeIntelligenceService } from './service.js';
import type { CodeWorkspaceContext } from './types.js';

const execFileAsync = promisify(execFile);
const MAX_CHANGED_FILES = 64;
const MAX_SEEDS = 24;
const MAX_DEPENDENTS = 8;
const MAX_HUNK_LINES = 16;
const MAX_SNIPPET_LINES = 12;

export interface ReviewHunk {
  start: number;
  end: number;
  lines: string[];
}

export interface ReviewChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  hunks: ReviewHunk[];
}
export interface ReviewSeed {
  path: string;
  name: string;
  namePath: string;
  kind: number | string;
  startLine: number;
  endLine: number;
  wholeFile: boolean;
  snippet?: string[];
  entityId?: string;
  dependents: Array<{ id?: string; name?: string; kind?: string; sourceFile?: string; depth?: number }>;
  testEvidence: {
    state: 'changed' | 'stale' | 'none' | 'na' | 'unknown';
    testFiles: string[];
    changedTestFiles: string[];
    unreached: string[];
  };
}

export interface ChangedSymbolReview {
  status: 'available' | 'partial';
  basis: string;
  changed: ReviewChangedFile[];
  seeds: ReviewSeed[];
  reviewers: Array<{ name: string; score: number; touches: number }>;
  limits: { changedFiles: number; seeds: number; dependentsPerSeed: number };
  issues?: string[];
  sourceAuthority: 'exact-source+semantic-ide+grafel';
}

function safeRoot(root: string): string {
  return root.replaceAll('\\', '/');
}
async function git(root: string, args: string[], allowFailure = false): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', [
      '-c', `safe.directory=${safeRoot(root)}`, '--no-optional-locks', '-C', root, ...args,
    ], {
      windowsHide: true,
      timeout: 12_000,
      maxBuffer: 32 * 1024 * 1024,
      encoding: 'utf8',
    });
    return String(stdout ?? '');
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

/** Git refnames cannot start with `-`, so a leading dash is always an option smuggled into argv (e.g. `--output=`). */
export function revisionOptionError(...revisions: Array<string | undefined>): string | undefined {
  return revisions.some(revision => revision?.startsWith('-'))
    ? 'git revisions (base/head/refA/refB) must not start with "-"; a leading "-" would be read as a git option'
    : undefined;
}

function changeRange(base?: string, head?: string): { args: string[]; basis: string } {
  const optionError = revisionOptionError(base, head);
  if (optionError) throw new Error(optionError);
  if (base && head) return { args: [`${base}...${head}`], basis: `${base}...${head}` };
  if (base) return { args: [`${base}...HEAD`], basis: `${base}...HEAD` };
  if (head) return { args: [`HEAD...${head}`], basis: `HEAD...${head}` };
  return { args: ['HEAD'], basis: 'working tree vs HEAD' };
}
function parseNameStatus(raw: string): ReviewChangedFile[] {
  const fields = raw.split('\0').filter(Boolean);
  const out: ReviewChangedFile[] = [];
  for (let i = 0; i < fields.length && out.length < MAX_CHANGED_FILES;) {
    const code = fields[i++] ?? '';
    if (code.startsWith('R') || code.startsWith('C')) {
      const oldPath = normalizePath(fields[i++] ?? '');
      const nextPath = normalizePath(fields[i++] ?? '');
      if (nextPath) out.push({ path: nextPath, oldPath, status: 'renamed', hunks: [] });
      continue;
    }
    const file = normalizePath(fields[i++] ?? '');
    if (!file) continue;
    const status = code.startsWith('A')
      ? 'added'
      : code.startsWith('D')
        ? 'deleted'
        : 'modified';
    out.push({ path: file, status, hunks: [] });
  }
  return out;
}

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function attachPatchHunks(files: ReviewChangedFile[], patch: string): void {
  const byPath = new Map(files.map(file => [file.path, file]));
  let current: ReviewChangedFile | undefined;
  let hunk: ReviewHunk | undefined;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      current = undefined;
      hunk = undefined;
      continue;
    }
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).split('\t', 1)[0];
      const file = raw === '/dev/null' ? '' : normalizePath(raw.replace(/^b\//, ''));
      current = file ? byPath.get(file) : undefined;
      hunk = undefined;
      continue;
    }
    if (line.startsWith('@@')) {
      const match = current ? HUNK_RE.exec(line) : null;
      if (!current || !match) {
        hunk = undefined;
        continue;
      }
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      const end = count === 0 ? start : start + count - 1;
      hunk = { start, end, lines: [] };
      current.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if ((line.startsWith('+') || line.startsWith('-')) && hunk.lines.length < MAX_HUNK_LINES) {
      hunk.lines.push(line.slice(0, 800));
    }
  }
}
async function changedFiles(root: string, base?: string, head?: string): Promise<{ basis: string; files: ReviewChangedFile[] }> {
  const range = changeRange(base, head);
  const statusRaw = await git(root, ['diff', '--name-status', '--find-renames', '-z', ...range.args, '--'], true);
  if (statusRaw === null) return { basis: range.basis, files: [] };
  const files = parseNameStatus(statusRaw);
  if (!files.length) return { basis: range.basis, files };
  const patch = await git(root, [
    'diff', '--unified=0', '--no-color', '--no-ext-diff', '--find-renames', ...range.args, '--',
  ], true);
  if (patch) attachPatchHunks(files, patch);
  return { basis: range.basis, files };
}

function flattenSymbols(items: SemanticSymbol[]): SemanticSymbol[] {
  const out: SemanticSymbol[] = [];
  const stack = [...items];
  while (stack.length) {
    const item = stack.shift()!;
    out.push(item);
    if (item.members?.length) stack.unshift(...item.members);
  }
  return out;
}

function spanSize(symbol: SemanticSymbol): number {
  return Math.max(0, symbol.range.end.line - symbol.range.start.line) * 100_000
    + Math.max(0, symbol.range.end.character - symbol.range.start.character);
}
function containingSymbol(symbols: SemanticSymbol[], start: number, end: number): SemanticSymbol | undefined {
  return symbols
    .filter(symbol => {
      const from = symbol.range.start.line + 1;
      const to = Math.max(from, symbol.range.end.line + 1);
      return from <= start && to >= end;
    })
    .sort((a, b) => spanSize(a) - spanSize(b) || b.namePath.length - a.namePath.length)[0];
}

function behavioral(kind: number | string): boolean {
  if (typeof kind === 'number') return kind === 5 || kind === 6 || kind === 9 || kind === 12;
  return /class|method|function|constructor/i.test(String(kind));
}

function isTestPath(value: string): boolean {
  const normalized = normalizePath(value).toLowerCase();
  return /(^|\/)(test|tests|__tests__|spec)(\/|$)/.test(normalized)
    || /\.(test|spec)\.[^.\/]+$/.test(normalized);
}

function providerRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.results)) return record.results.filter(Boolean) as Array<Record<string, unknown>>;
  if (Array.isArray(record.items)) return record.items.filter(Boolean) as Array<Record<string, unknown>>;
  return [];
}
async function readSnippet(root: string, file: ReviewChangedFile, hunk: ReviewHunk | undefined): Promise<string[] | undefined> {
  if (file.status === 'deleted') return undefined;
  try {
    const lines = (await readFile(path.join(root, ...file.path.split('/')), 'utf8')).split(/\r?\n/);
    const start = Math.max(1, (hunk?.start ?? 1) - 2);
    const end = Math.min(lines.length, Math.max(start, hunk?.end ?? start) + 2, start + MAX_SNIPPET_LINES - 1);
    return lines.slice(start - 1, end).map((line, index) =>
      `${start + index}: ${redactSensitiveString(line.slice(0, 700))}`);
  } catch {
    return undefined;
  }
}

function normalizeSourceFile(value: unknown): string {
  return typeof value === 'string' ? normalizePath(value).toLowerCase() : '';
}

async function resolveProviderEntity(
  service: CodeIntelligenceService,
  context: CodeWorkspaceContext,
  repo: string,
  seed: ReviewSeed,
): Promise<string | undefined> {
  if (seed.wholeFile) return undefined;
  try {
    const result = await service.callProviderTool('grafel_find', {
      query: seed.name,
      search: 'substring',
      fields: ['name', 'kind', 'source_file', 'source_location'],
      context_filter: [seed.path],
      limit: 8,
      repo_filter: [repo],
    }, { context });
    const payload = parseCallToolResultJson(result);
    const rows = providerRows(payload);
    const exact = rows.find(row => normalizeSourceFile(row.source_file) === seed.path.toLowerCase()
      && String(row.name ?? '') === seed.name);
    const fallback = rows.find(row => normalizeSourceFile(row.source_file) === seed.path.toLowerCase());
    const id = exact?.id ?? exact?.entity_id ?? fallback?.id ?? fallback?.entity_id;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}
async function attachProviderImpact(
  service: CodeIntelligenceService,
  context: CodeWorkspaceContext,
  repo: string,
  seed: ReviewSeed,
  changedPaths: Set<string>,
): Promise<void> {
  if (!seed.entityId) {
    seed.testEvidence.state = behavioral(seed.kind) ? 'unknown' : 'na';
    return;
  }
  try {
    const result = await service.callProviderTool('grafel_impact_radius', {
      scope: 'entity',
      entity_id: seed.entityId,
      detail: 'full',
      repo_filter: [repo],
    }, { context });
    const payload = parseCallToolResultJson(result) as Record<string, unknown> | null;
    const affected = payload && Array.isArray(payload.affected)
      ? payload.affected.filter(Boolean) as Array<Record<string, unknown>>
      : [];
    seed.dependents = affected.slice(0, MAX_DEPENDENTS).map(row => ({
      ...(typeof row.entity_id === 'string' ? { id: row.entity_id } : {}),
      ...(typeof row.name === 'string' ? { name: row.name } : {}),
      ...(typeof row.kind === 'string' ? { kind: row.kind } : {}),
      ...(typeof row.source_file === 'string' ? { sourceFile: normalizePath(row.source_file) } : {}),
      ...(typeof row.hop_count === 'number' ? { depth: row.hop_count } : {}),
    }));
    const tests = [...new Set(affected
      .map(row => typeof row.source_file === 'string' ? normalizePath(row.source_file) : '')
      .filter(file => file && isTestPath(file)))].sort();
    const changedTests = tests.filter(file => changedPaths.has(file.toLowerCase()));
    const truncated = payload?.truncated === true
      || Number(payload?.total_affected ?? affected.length) > affected.length;
    const behavior = behavioral(seed.kind);
    seed.testEvidence = {
      state: !behavior ? 'na' : changedTests.length ? 'changed' : tests.length ? 'stale' : truncated ? 'unknown' : 'none',
      testFiles: tests,
      changedTestFiles: changedTests,
      unreached: behavior && !tests.length && !truncated ? [seed.namePath] : [],
    };
  } catch {
    seed.testEvidence.state = behavioral(seed.kind) ? 'unknown' : 'na';
  }
}
async function reviewerEvidence(root: string, files: string[]): Promise<Array<{ name: string; score: number; touches: number }>> {
  if (!files.length) return [];
  const [authorRaw, historyRaw] = await Promise.all([
    git(root, ['log', '-1', '--format=%an', 'HEAD'], true),
    git(root, ['log', '-n', '80', '--format=%an', '--', ...files.slice(0, 24)], true),
  ]);
  if (!historyRaw) return [];
  const author = (authorRaw ?? '').trim().toLowerCase();
  const scores = new Map<string, { name: string; score: number; touches: number }>();
  historyRaw.split(/\r?\n/).map(name => name.trim()).filter(Boolean).forEach((name, index) => {
    const lower = name.toLowerCase();
    if (lower === author || /\bbot\b|\[bot\]|dependabot|renovate/i.test(name)) return;
    const current = scores.get(lower) ?? { name, score: 0, touches: 0 };
    current.score += 1 / (1 + index / 12);
    current.touches += 1;
    scores.set(lower, current);
  });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || b.touches - a.touches || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map(item => ({ ...item, score: Number(item.score.toFixed(3)) }));
}

function semanticItems(result: unknown): SemanticSymbol[] {
  if (!result || typeof result !== 'object') return [];
  const outer = result as Record<string, unknown>;
  const bounded = outer.results as Record<string, unknown> | undefined;
  return Array.isArray(bounded?.items) ? bounded.items as SemanticSymbol[] : [];
}
export async function buildChangedSymbolReview(input: {
  service: CodeIntelligenceService;
  semanticIde?: SemanticIdeService;
  context: CodeWorkspaceContext;
  repo: string;
  root: string;
  base?: string;
  head?: string;
}): Promise<ChangedSymbolReview> {
  const diff = await changedFiles(input.root, input.base, input.head);
  const issues: string[] = [];
  if (!input.semanticIde) issues.push('Semantic IDE unavailable; review uses truthful whole-file fallback seeds.');
  const seeds: ReviewSeed[] = [];
  const changedPaths = new Set(diff.files.map(file => file.path.toLowerCase()));

  for (const file of diff.files) {
    if (seeds.length >= MAX_SEEDS) break;
    let symbols: SemanticSymbol[] = [];
    if (input.semanticIde && file.status !== 'deleted') {
      try {
        const result = await input.semanticIde.symbol('overview', {
          workspace: input.context.workspace,
          ...(input.context.ref ? { ref: input.context.ref } : {}),
          ...(input.context.worktreePath ? { worktreePath: input.context.worktreePath } : {}),
          relativePath: file.path,
          depth: 12,
          maxResults: 240,
          maxAnswerChars: 80_000,
        });
        symbols = flattenSymbols(semanticItems(result));
      } catch (error) {
        issues.push(`${file.path}: semantic overview unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const hunks = file.hunks.length ? file.hunks : [{ start: 1, end: 1, lines: [] }];
    const seen = new Set<string>();
    for (const hunk of hunks) {
      if (seeds.length >= MAX_SEEDS) break;
      const symbol = file.status === 'deleted' ? undefined : containingSymbol(symbols, hunk.start, hunk.end);
      const key = symbol ? `${file.path}|${symbol.namePath}` : `${file.path}|<file>`;
      if (seen.has(key)) continue;
      seen.add(key);
      const seed: ReviewSeed = symbol ? {
        path: file.path,
        name: symbol.name,
        namePath: symbol.namePath,
        kind: symbol.kind,
        startLine: symbol.range.start.line + 1,
        endLine: Math.max(symbol.range.start.line + 1, symbol.range.end.line + 1),
        wholeFile: false,
        dependents: [],
        testEvidence: { state: 'unknown', testFiles: [], changedTestFiles: [], unreached: [] },
      } : {
        path: file.path,
        name: path.basename(file.path),
        namePath: file.path,
        kind: 'file',
        startLine: hunk.start,
        endLine: hunk.end,
        wholeFile: true,
        dependents: [],
        testEvidence: { state: 'na', testFiles: [], changedTestFiles: [], unreached: [] },
      };
      seed.snippet = await readSnippet(input.root, file, hunk);
      seeds.push(seed);
    }
  }

  for (const seed of seeds) {
    seed.entityId = await resolveProviderEntity(input.service, input.context, input.repo, seed);
    await attachProviderImpact(input.service, input.context, input.repo, seed, changedPaths);
  }

  const reviewers = await reviewerEvidence(input.root, diff.files.map(file => file.path));
  return {
    status: issues.length || diff.files.length > MAX_CHANGED_FILES ? 'partial' : 'available',
    basis: diff.basis,
    changed: diff.files,
    seeds,
    reviewers,
    limits: {
      changedFiles: MAX_CHANGED_FILES,
      seeds: MAX_SEEDS,
      dependentsPerSeed: MAX_DEPENDENTS,
    },
    ...(issues.length ? { issues: issues.slice(0, 12) } : {}),
    sourceAuthority: 'exact-source+semantic-ide+grafel',
  };
}
