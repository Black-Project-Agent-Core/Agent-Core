import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { flattenRetrievalTokens, tokenizeRetrievalText } from '../memory/identifier-tokenizer.js';
import { maskSecrets } from '../memory/privacy-masking.js';
import { truncateText } from '../text-bounds.js';

// Lexical (BM25) search over bounded line windows of the workspace source.
// Source files stay authoritative: every hit is checked against the file's size and mtime
// captured at indexing time, re-read from disk, and masked before it is returned. A hit whose
// file changed is never returned with a range from the old text; the index is rebuilt instead.
// No embeddings, no network, no persisted state. The index lives in process memory.

export const CODE_CONTEXT_PROVIDER = 'agent-core-lexical' as const;

const WINDOW_LINES = 40;
const STRIDE_LINES = 32;
const CACHE_TTL_MS = 60 * 1000;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const MAX_SNIPPET_CHARS = 1200;
const MAX_RESPONSE_CHARS = 24000;
const SKIP_SAMPLE_LIMIT = 50;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

export interface CodeContextLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxChunks: number;
  buildBudgetMs: number;
}

const DEFAULT_LIMITS: CodeContextLimits = {
  maxFiles: 4000,
  maxFileBytes: 2 * 1024 * 1024,
  maxChunks: 60000,
  buildBudgetMs: 20000,
};

export type SkipReason = 'too-large' | 'binary' | 'unreadable' | 'link' | 'outside-root';
export type IndexTruncation = 'max-files' | 'max-chunks' | 'time-budget';

// Lowercase names, compared case-insensitively. Anywhere in the tree: the names the repository
// path policy already excludes, plus nested secrets folders and the protected folder.
const DENY_ANYWHERE = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', 'bin', 'obj', 'runtime', 'release',
  'backups', 'secrets', '_artifacts', 'launcher-publish', '.tmp', 'do not touch without instruction explicit',
]);
// Only directly under the workspace root.
const DENY_TOP_LEVEL = new Set(['subproject', 'rdc', '.rdc-standalone', '.grafel']);
const DENY_FILE_NAME: RegExp[] = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx|kdbx|keystore|jks|pkcs12)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^(credentials?|secrets?)([._-].*)?$/i,
  /^\.(npmrc|pypirc|netrc|pgpass)$/i,
  /\.local\.(json|ya?ml|toml|env|ini|xml)$/i,
  /^appsettings(\.[^.]+)?\.json$/i,
];
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.toml',
  '.py', '.ps1', '.psm1', '.cmd', '.bat', '.sh', '.css', '.html', '.sql', '.cs', '.go',
  '.rs', '.java', '.kt', '.swift', '.rb', '.php', '.vue', '.svelte',
]);
const STOPWORDS = new Set([
  'the', 'and', 'for', 'how', 'what', 'where', 'when', 'with', 'from', 'this', 'that',
  'are', 'was', 'were', 'does', 'into', 'over', 'per', 'a', 'an', 'of', 'to', 'in', 'on',
  'is', 'it', 'by', 'or', 'as', 'be',
]);

export interface CodeContextInput {
  root: string;
  query: string;
  limit?: number;
  limits?: Partial<CodeContextLimits>;
}

export interface CodeContextHit {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  snippetTruncated: boolean;
}

export interface CodeContextResult {
  provider: typeof CODE_CONTEXT_PROVIDER;
  status: 'ok' | 'no-match' | 'empty-query';
  query: string;
  tokens: string[];
  index: {
    builtAt: string;
    ageMs: number;
    files: number;
    chunks: number;
    skippedFiles: number;
    skippedByReason: Partial<Record<SkipReason, number>>;
    skippedSamples: Array<{ path: string; reason: SkipReason }>;
    truncated: boolean;
    truncatedReason: IndexTruncation | null;
    rebuilt: boolean;
    staleDropped: number;
  };
  hits: CodeContextHit[];
}

interface FileSignature {
  mtimeMs: number;
  size: number;
}

interface Chunk {
  path: string;
  startLine: number;
  endLine: number;
  length: number;
  tf: Map<string, number>;
}

interface SkipLedger {
  count: number;
  byReason: Partial<Record<SkipReason, number>>;
  samples: Array<{ path: string; reason: SkipReason }>;
}

interface Index {
  builtAt: number;
  chunks: Chunk[];
  df: Map<string, number>;
  avgLength: number;
  files: Map<string, FileSignature>;
  skips: SkipLedger;
  truncated: IndexTruncation | null;
}

interface Scored {
  chunk: Chunk;
  score: number;
}

const buildStats = { indexBuilds: 0 };
const indexCache = new Map<string, { index: Index; expiresAt: number }>();
const pendingBuilds = new Map<string, Promise<Index>>();

/** Counters for tests and diagnostics. Builds only; no request data. */
export function codeContextStats(): { indexBuilds: number } {
  return { indexBuilds: buildStats.indexBuilds };
}

export function clearCodeContextIndexCache(): void {
  indexCache.clear();
  pendingBuilds.clear();
}

function resolveLimits(input: Partial<CodeContextLimits> | undefined): CodeContextLimits {
  return {
    maxFiles: Math.max(1, Math.trunc(input?.maxFiles ?? DEFAULT_LIMITS.maxFiles)),
    maxFileBytes: Math.max(1, Math.trunc(input?.maxFileBytes ?? DEFAULT_LIMITS.maxFileBytes)),
    maxChunks: Math.max(1, Math.trunc(input?.maxChunks ?? DEFAULT_LIMITS.maxChunks)),
    buildBudgetMs: Math.max(0, Math.trunc(input?.buildBudgetMs ?? DEFAULT_LIMITS.buildBudgetMs)),
  };
}

function cacheKey(root: string, limits: CodeContextLimits): string {
  return [root, limits.maxFiles, limits.maxFileBytes, limits.maxChunks, limits.buildBudgetMs].join('|');
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isDeniedDirectory(name: string, atTop: boolean): boolean {
  const lower = name.toLowerCase();
  return DENY_ANYWHERE.has(lower) || (atTop && DENY_TOP_LEVEL.has(lower));
}

function isDeniedFileName(name: string): boolean {
  return DENY_FILE_NAME.some(pattern => pattern.test(name));
}

function recordSkip(ledger: SkipLedger, relative: string, reason: SkipReason): void {
  ledger.count += 1;
  ledger.byReason[reason] = (ledger.byReason[reason] ?? 0) + 1;
  if (ledger.samples.length < SKIP_SAMPLE_LIMIT) ledger.samples.push({ path: relative, reason });
}

async function readEntries(directory: string): Promise<Dirent[] | null> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
}

async function collectCandidates(
  root: string,
  rootReal: string,
  limits: CodeContextLimits,
  ledger: SkipLedger,
): Promise<{ files: string[]; truncated: IndexTruncation | null }> {
  const files: string[] = [];
  const pending: Array<{ dir: string; relDir: string }> = [{ dir: root, relDir: '' }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = await readEntries(current.dir);
    if (!entries) {
      recordSkip(ledger, current.relDir || '.', 'unreadable');
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = current.relDir ? `${current.relDir}/${entry.name}` : entry.name;
      const absolute = path.join(current.dir, entry.name);
      if (entry.isSymbolicLink()) {
        recordSkip(ledger, relative, 'link');
        continue;
      }
      if (entry.isDirectory()) {
        if (isDeniedDirectory(entry.name, current.relDir === '')) continue;
        // A Windows junction is reported as a directory; its real target decides.
        const real = await realpath(absolute).catch(() => null);
        if (!real || !isInside(rootReal, real)) {
          recordSkip(ledger, relative, 'outside-root');
          continue;
        }
        pending.push({ dir: absolute, relDir: relative });
        continue;
      }
      if (!entry.isFile() || isDeniedFileName(entry.name)) continue;
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      if (files.length >= limits.maxFiles) return { files, truncated: 'max-files' };
      files.push(relative);
    }
  }
  return { files, truncated: null };
}

type FileRead = { ok: true; text: string; signature: FileSignature } | { ok: false; reason: SkipReason };

async function readTextFile(absolute: string, maxFileBytes: number): Promise<FileRead> {
  const info = await lstat(absolute).catch(() => null);
  if (!info) return { ok: false, reason: 'unreadable' };
  if (info.isSymbolicLink()) return { ok: false, reason: 'link' };
  if (!info.isFile()) return { ok: false, reason: 'unreadable' };
  if (info.size > maxFileBytes) return { ok: false, reason: 'too-large' };
  const buffer = await readFile(absolute).catch(() => null);
  if (!buffer) return { ok: false, reason: 'unreadable' };
  if (buffer.subarray(0, 8192).includes(0)) return { ok: false, reason: 'binary' };
  return { ok: true, text: buffer.toString('utf8'), signature: { mtimeMs: info.mtimeMs, size: info.size } };
}

function tokensOf(text: string): string[] {
  return flattenRetrievalTokens(tokenizeRetrievalText(text));
}

async function buildIndex(root: string, limits: CodeContextLimits): Promise<Index> {
  buildStats.indexBuilds += 1;
  const deadline = Date.now() + limits.buildBudgetMs;
  const rootReal = await realpath(root);
  const skips: SkipLedger = { count: 0, byReason: {}, samples: [] };
  const walk = await collectCandidates(root, rootReal, limits, skips);
  // The walk's own truncation (max-files) still leaves a usable partial index: index what was collected.
  // Only the time and chunk limits stop the build loop early.
  let truncated: IndexTruncation | null = walk.truncated;
  let stopped = false;
  const files = new Map<string, FileSignature>();
  const chunks: Chunk[] = [];
  const df = new Map<string, number>();
  let totalLength = 0;

  for (const relative of walk.files) {
    if (stopped) break;
    if (Date.now() >= deadline) {
      truncated = 'time-budget';
      break;
    }
    const read = await readTextFile(path.join(root, relative), limits.maxFileBytes);
    if (!read.ok) {
      recordSkip(skips, relative, read.reason);
      continue;
    }
    files.set(relative, read.signature);
    const lines = read.text.split(/\r?\n/);
    for (let start = 0; start < lines.length; start += STRIDE_LINES) {
      if (chunks.length >= limits.maxChunks) {
        truncated = 'max-chunks';
        stopped = true;
        break;
      }
      const end = Math.min(lines.length, start + WINDOW_LINES);
      const tokens = tokensOf(`${relative}\n${lines.slice(start, end).join('\n')}`);
      if (tokens.length > 0) {
        const tf = new Map<string, number>();
        for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
        chunks.push({ path: relative, startLine: start + 1, endLine: end, length: tokens.length, tf });
        totalLength += tokens.length;
        for (const token of tf.keys()) df.set(token, (df.get(token) ?? 0) + 1);
      }
      if (end >= lines.length) break;
    }
  }

  return {
    builtAt: Date.now(),
    chunks,
    df,
    avgLength: chunks.length > 0 ? totalLength / chunks.length : 0,
    files,
    skips,
    truncated,
  };
}

/** Single-flight: concurrent cold callers share one build; a forced rebuild waits for any build in flight. */
async function getIndex(root: string, limits: CodeContextLimits, forceRebuild = false): Promise<Index> {
  const key = cacheKey(root, limits);
  const pending = pendingBuilds.get(key);
  if (forceRebuild) {
    if (pending) await pending.catch(() => undefined);
  } else {
    const cached = indexCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.index;
    if (pending) return pending;
  }
  const build: Promise<Index> = buildIndex(root, limits)
    .then(index => {
      indexCache.set(key, { index, expiresAt: Date.now() + CACHE_TTL_MS });
      return index;
    })
    .finally(() => {
      if (pendingBuilds.get(key) === build) pendingBuilds.delete(key);
    });
  pendingBuilds.set(key, build);
  return build;
}

function queryTerms(query: string): string[] {
  const parsed = tokenizeRetrievalText(query);
  if (parsed.truncated) throw new Error('CODE_CONTEXT_QUERY_INVALID');
  const terms = new Set<string>();
  for (const token of flattenRetrievalTokens(parsed)) {
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    terms.add(token);
  }
  return [...terms];
}

function scoreChunk(terms: string[], chunk: Chunk, index: Index): number {
  const total = index.chunks.length;
  let score = 0;
  for (const term of terms) {
    const tf = chunk.tf.get(term);
    if (!tf) continue;
    const df = index.df.get(term) ?? 0;
    const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
    const norm = tf + BM25_K1 * (1 - BM25_B + BM25_B * (chunk.length / index.avgLength));
    score += idf * (tf * (BM25_K1 + 1)) / norm;
  }
  return score;
}

function selectTop(terms: string[], index: Index, limit: number): Scored[] {
  const scored: Scored[] = [];
  for (const chunk of index.chunks) {
    const score = scoreChunk(terms, chunk, index);
    if (score > 0) scored.push({ chunk, score });
  }
  scored.sort((a, b) =>
    b.score - a.score
    || a.chunk.path.localeCompare(b.chunk.path)
    || a.chunk.startLine - b.chunk.startLine);
  const selected: Scored[] = [];
  for (const candidate of scored) {
    if (selected.length >= limit) break;
    // Overlapping windows of one file describe the same region: keep the best one.
    const overlaps = selected.some(item =>
      item.chunk.path === candidate.chunk.path
      && candidate.chunk.startLine <= item.chunk.endLine
      && item.chunk.startLine <= candidate.chunk.endLine);
    if (!overlaps) selected.push(candidate);
  }
  return selected;
}

async function isStale(root: string, index: Index, relative: string): Promise<boolean> {
  const signature = index.files.get(relative);
  if (!signature) return true;
  const info = await lstat(path.join(root, relative)).catch(() => null);
  return !info
    || info.isSymbolicLink()
    || !info.isFile()
    || info.mtimeMs !== signature.mtimeMs
    || info.size !== signature.size;
}

// Second pass after maskSecrets: key-value secrets whose values have no digits or symbols
// (correcthorsebattery) or contain symbols (P@ssw0rd!). Quoted values are always masked;
// bare values are masked when they are long or contain a digit, so type names such as
// `password: string` stay readable.
const SECRET_ASSIGNMENT = /(\b(?:password|passwd|pwd|secret|token|api[_-]?key|client[_-]?secret|access[_-]?key|private[_-]?key)\b["']?\s*[:=]\s*)(?:(["'])((?:(?!\2)[^\r\n])+)\2|([^\s"'`()[\]{};,<>]+))/gi;

function maskAssignment(match: string, prefix: string, quote: string | undefined, _quoted: string | undefined, bare: string | undefined): string {
  if (quote) return `${prefix}${quote}[REDACTED:secret]${quote}`;
  if (bare && (bare.length >= 8 || (/\d/.test(bare) && bare.length >= 6))) return `${prefix}[REDACTED:secret]`;
  return match;
}

function maskSnippet(raw: string): { text: string; truncated: boolean } {
  let masked: string;
  try {
    masked = maskSecrets(raw).text.replace(SECRET_ASSIGNMENT, maskAssignment);
  } catch {
    return { text: '[REDACTED:snippet-unavailable]', truncated: false };
  }
  // Mask before truncating so a secret is never cut in half and left unmasked.
  const bounded = truncateText(masked, MAX_SNIPPET_CHARS);
  return { text: bounded, truncated: bounded.length < masked.length };
}

export async function searchCodeContext(input: CodeContextInput): Promise<CodeContextResult> {
  const root = path.resolve(input.root);
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory()) throw new Error('CODE_CONTEXT_ROOT_INVALID');
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(input.limit ?? DEFAULT_LIMIT)));
  const terms = queryTerms(input.query);
  const limits = resolveLimits(input.limits);

  let index = await getIndex(root, limits);
  let selected = terms.length > 0 && index.chunks.length > 0 ? selectTop(terms, index, limit) : [];
  let rebuilt = false;
  for (const item of selected) {
    if (await isStale(root, index, item.chunk.path)) {
      rebuilt = true;
      break;
    }
  }
  if (rebuilt) {
    index = await getIndex(root, limits, true);
    selected = selectTop(terms, index, limit);
  }

  const meta = {
    builtAt: new Date(index.builtAt).toISOString(),
    ageMs: Date.now() - index.builtAt,
    files: index.files.size,
    chunks: index.chunks.length,
    skippedFiles: index.skips.count,
    skippedByReason: index.skips.byReason,
    skippedSamples: index.skips.samples,
    truncated: index.truncated !== null,
    truncatedReason: index.truncated,
    rebuilt,
    staleDropped: 0,
  };
  if (terms.length === 0) {
    return { provider: CODE_CONTEXT_PROVIDER, status: 'empty-query', query: input.query, tokens: [], index: meta, hits: [] };
  }

  const hits: CodeContextHit[] = [];
  let staleDropped = 0;
  let budget = MAX_RESPONSE_CHARS;
  for (const item of selected) {
    // Re-read and compare with the indexed signature: a range is returned only for the text it came from.
    const read = await readTextFile(path.join(root, item.chunk.path), limits.maxFileBytes);
    const signature = index.files.get(item.chunk.path);
    if (!read.ok || !signature || read.signature.mtimeMs !== signature.mtimeMs || read.signature.size !== signature.size) {
      staleDropped += 1;
      continue;
    }
    const raw = read.text.split(/\r?\n/).slice(item.chunk.startLine - 1, item.chunk.endLine).join('\n');
    const snippet = maskSnippet(raw);
    if (snippet.text.length > budget) break;
    budget -= snippet.text.length;
    hits.push({
      path: item.chunk.path,
      startLine: item.chunk.startLine,
      endLine: item.chunk.endLine,
      score: Number(item.score.toFixed(4)),
      snippet: snippet.text,
      snippetTruncated: snippet.truncated,
    });
  }

  return {
    provider: CODE_CONTEXT_PROVIDER,
    status: hits.length > 0 ? 'ok' : 'no-match',
    query: input.query,
    tokens: terms,
    index: { ...meta, staleDropped },
    hits,
  };
}
