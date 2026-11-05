import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { flattenRetrievalTokens, tokenizeRetrievalText } from '../memory/identifier-tokenizer.js';
import { maskSecrets } from '../memory/privacy-masking.js';
import { isCredentialFileName } from '../security/credential-names.js';
import { truncateText } from '../text-bounds.js';

// Lexical (BM25) search over bounded line windows of the workspace source.
// Source files stay authoritative: every hit is checked against the file's size and mtime
// captured at indexing time, re-read from disk, and masked before it is returned. A hit whose
// file changed is never returned with a range from the old text; the index is rebuilt instead.
// A new, renamed, or deleted file changes its directory's mtime, so each query re-checks the
// directories (one lstat each) and rebuilds when one changed. An edit to an indexed file that adds
// no hit is visible after at most CACHE_TTL_MS; index.ageMs reports how old the index is.
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
// Upper bound on paths collected by the walk. The file cap (maxFiles) is applied after priority ordering.
const WALK_HARD_CAP = 50000;
// Index rebuilds one query may trigger while directories keep changing under it.
const MAX_DIRECTORY_REBUILDS = 2;
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
export type IndexTruncation = 'max-files' | 'max-chunks' | 'time-budget' | 'token-limit';

// Lowercase names, compared case-insensitively, anywhere in the tree: the names the repository path policy
// already excludes, plus private folders. A denied name is dropped silently, links included, so its name never
// reaches the skip samples.
const DENY_ANYWHERE = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', 'bin', 'obj', 'runtime', 'release',
  'backups', 'secrets', '_artifacts', 'launcher-publish', '.tmp', 'do not touch without instruction explicit',
  '.ssh', '.aws', '.gnupg', '.docker',
]);
// Only directly under the workspace root.
const DENY_TOP_LEVEL = new Set(['subproject', 'rdc', '.rdc-standalone', '.grafel']);
// Names that hold secrets, for files and folders alike. isCredentialFileName (security/credential-names) adds
// .env files, key and certificate extensions, and editor backup copies of them.
const DENY_NAME: RegExp[] = [
  /^(credentials?|secrets?)([._-].*)?$/i,
  /^(client[_-]?secrets?|service[_-]?account|tokens?)([._-].*)?\.json$/i,
  /adminsdk.*\.json$/i,
  /^local\.settings\.json$/i,
  /\.local\.(json|ya?ml|toml|env|ini|xml)$/i,
  /^appsettings(\.[^.]+)?\.json$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^\.pgpass$/i,
  /\.(kdbx|pkcs12)$/i,
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
    builtAt: string | null;
    ageMs: number | null;
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
  dirs: Map<string, number>;
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

function isDeniedName(name: string): boolean {
  return isCredentialFileName(name) || DENY_NAME.some(pattern => pattern.test(name));
}

function isDeniedEntry(name: string, atTop: boolean): boolean {
  const lower = name.toLowerCase();
  return DENY_ANYWHERE.has(lower) || (atTop && DENY_TOP_LEVEL.has(lower)) || isDeniedName(name);
}

// A path relative to the root is denied when any of its segments is.
function deniedRelativePath(relative: string): boolean {
  return relative.split(/[\\/]/).some((segment, index) => isDeniedEntry(segment, index === 0));
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
  ledger: SkipLedger,
  deadline: number,
): Promise<{ files: string[]; dirs: Map<string, number>; truncated: IndexTruncation | null }> {
  const files: string[] = [];
  const dirs = new Map<string, number>();
  const pending: Array<{ dir: string; relDir: string }> = [{ dir: root, relDir: '' }];
  while (pending.length > 0) {
    if (Date.now() >= deadline) return { files, dirs, truncated: 'time-budget' };
    const current = pending.pop()!;
    // Directory mtime is read before its entries: a change after this point forces a rebuild, never a miss.
    const dirInfo = await lstat(current.dir).catch(() => null);
    if (dirInfo) dirs.set(current.relDir, dirInfo.mtimeMs);
    const entries = await readEntries(current.dir);
    if (!entries) {
      recordSkip(ledger, current.relDir || '.', 'unreadable');
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = current.relDir ? `${current.relDir}/${entry.name}` : entry.name;
      const absolute = path.join(current.dir, entry.name);
      if (isDeniedEntry(entry.name, current.relDir === '')) continue;
      if (entry.isSymbolicLink()) {
        recordSkip(ledger, relative, 'link');
        continue;
      }
      if (entry.isDirectory()) {
        // A Windows junction is reported as a link above; a real folder must still resolve inside the root.
        const real = await realpath(absolute).catch(() => null);
        if (!real || !isInside(rootReal, real)) {
          recordSkip(ledger, relative, 'outside-root');
          continue;
        }
        pending.push({ dir: absolute, relDir: relative });
        continue;
      }
      if (!entry.isFile()) continue;
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      if (files.length >= WALK_HARD_CAP) return { files, dirs, truncated: 'max-files' };
      files.push(relative);
    }
  }
  return { files, dirs, truncated: null };
}

type FileRead = { ok: true; text: string; signature: FileSignature } | { ok: false; reason: SkipReason };

// The signature is taken before the read and must still hold after it: a file that changes mid-read is read
// again, so the returned text and its signature always describe the same content.
async function readTextFile(absolute: string, maxFileBytes: number, rootReal?: string): Promise<FileRead> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await lstat(absolute).catch(() => null);
    if (!before) return { ok: false, reason: 'unreadable' };
    if (before.isSymbolicLink()) return { ok: false, reason: 'link' };
    if (!before.isFile()) return { ok: false, reason: 'unreadable' };
    if (before.size > maxFileBytes) return { ok: false, reason: 'too-large' };
    // Per-hit and staleness reads come after indexing, so the real path is checked again (junctions, folders swapped in).
    if (rootReal && !(await resolvesInside(rootReal, absolute))) return { ok: false, reason: 'outside-root' };
    const buffer = await readFile(absolute).catch(() => null);
    if (!buffer) return { ok: false, reason: 'unreadable' };
    const after = await lstat(absolute).catch(() => null);
    if (!after || after.mtimeMs !== before.mtimeMs || after.size !== before.size) continue;
    if (buffer.length > maxFileBytes) return { ok: false, reason: 'too-large' };
    if (buffer.subarray(0, 8192).includes(0)) return { ok: false, reason: 'binary' };
    return { ok: true, text: buffer.toString('utf8'), signature: { mtimeMs: before.mtimeMs, size: before.size } };
  }
  return { ok: false, reason: 'unreadable' };
}

// The real path (links and intermediate folders resolved) must stay under the root and avoid denied names.
async function resolvesInside(rootReal: string, absolute: string): Promise<boolean> {
  const real = await realpath(absolute).catch(() => null);
  return real !== null && isInside(rootReal, real) && !deniedRelativePath(path.relative(rootReal, real));
}

function tokensOf(text: string): { tokens: string[]; truncated: boolean } {
  const parsed = tokenizeRetrievalText(text);
  return { tokens: flattenRetrievalTokens(parsed), truncated: parsed.truncated === true };
}

const PRIORITY_ROOTS = ['src', 'tests', 'scripts'];

// Lower rank is indexed first. Docs go last, so a cut never drops code in favour of prose.
function filePriority(relative: string): number {
  const first = (relative.split('/')[0] ?? '').toLowerCase();
  const rank = PRIORITY_ROOTS.indexOf(first);
  if (rank >= 0) return rank;
  return first === 'docs' ? 4 : 3;
}

// One lstat per traversed directory. An added, renamed, or deleted entry changes that directory's mtime.
async function directoriesChanged(root: string, index: Index): Promise<boolean> {
  for (const [relDir, mtimeMs] of index.dirs) {
    const info = await lstat(relDir ? path.join(root, relDir) : root).catch(() => null);
    if (!info || !info.isDirectory() || info.mtimeMs !== mtimeMs) return true;
  }
  return false;
}

// Key-value secrets, whatever the identifier: dbPassword, DB_PASSWORD, access_token, and a JSON key such as
// "token": "...". There is no word boundary before the keyword, so compound names match, and the pattern starts
// at the keyword, so a long identifier costs nothing extra. Separators: ':' (YAML, TypeScript, Python), '='
// (env, ini), ':=' (Go). A type annotation may sit between the key and the separator: password: string = "...".
// Groups: 1 = key and separator, 2 = quote of a quoted value, 3 = quoted value, 4 = bare value.
const SECRET_ASSIGNMENT = /((?:password|passwd|pwd|secret[_-]?key|secret|token|api[_-]?key|client[_-]?secret|access[_-]?key|private[_-]?key)["'`]?(?:\s*:\s*[A-Za-z_][\w.<>[\]|]*)?\s*(?::=|[:=])\s*)(?:(["'`])((?:(?!\2)[^\r\n])+)\2|([^\s"'`()[\]{};,<>]+))/gi;

// Bare values that name a type or a literal are not secrets: `password: string` stays readable.
const NON_SECRET_VALUES = new Set([
  'string', 'number', 'boolean', 'unknown', 'any', 'object', 'void', 'never', 'bigint', 'symbol',
  'null', 'undefined', 'true', 'false', 'str', 'int', 'float', 'bool', 'bytes', 'none', 'nil',
]);

function maskAssignment(match: string, prefix: string, quote: string | undefined, _quoted: string | undefined, bare: string | undefined): string {
  if (quote) return `${prefix}${quote}[REDACTED:secret]${quote}`;
  if (bare !== undefined && !NON_SECRET_VALUES.has(bare.toLowerCase())) return `${prefix}[REDACTED:secret]`;
  return match;
}

// PEM key blocks of any label, up to their END line or the end of the text.
const PRIVATE_KEY_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----[\s\S]*?(?:-----END \1-----|(?![\s\S]))/g;

// Whole-file masking, applied before windowing. A window that starts inside a key body has no BEGIN line, so
// the key must already be blank in the text the windows are cut from. Each key line is blanked except the first,
// so line numbers do not move. Indexing and snippets both read this text.
function maskFileText(text: string): string {
  const keysBlanked = text.replace(PRIVATE_KEY_BLOCK, block => block
    .split(/\r?\n/)
    .map((_line, index) => (index === 0 ? '-----BEGIN [REDACTED:key-block]' : ''))
    .join('\n'));
  return keysBlanked.replace(SECRET_ASSIGNMENT, maskAssignment);
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

async function buildIndex(root: string, limits: CodeContextLimits): Promise<Index> {
  buildStats.indexBuilds += 1;
  const deadline = Date.now() + limits.buildBudgetMs;
  const rootReal = await realpath(root);
  const skips: SkipLedger = { count: 0, byReason: {}, samples: [] };
  const walk = await collectCandidates(root, rootReal, skips, deadline);
  const ordered = [...walk.files].sort((a, b) => filePriority(a) - filePriority(b) || a.localeCompare(b));
  const candidates = ordered.slice(0, limits.maxFiles);
  // The walk's own truncation (max-files) still leaves a usable partial index: index what was collected.
  // Only the time and chunk limits stop the build loop early.
  let truncated: IndexTruncation | null = walk.truncated ?? (ordered.length > limits.maxFiles ? 'max-files' : null);
  let stopped = false;
  let tokenLimited = false;
  const files = new Map<string, FileSignature>();
  const chunks: Chunk[] = [];
  const df = new Map<string, number>();
  let totalLength = 0;

  for (const relative of candidates) {
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
    // Windows are cut from the masked text, so a query for a secret value cannot match it.
    const lines = maskFileText(read.text).split(/\r?\n/);
    for (let start = 0; start < lines.length; start += STRIDE_LINES) {
      if (chunks.length >= limits.maxChunks) {
        truncated = 'max-chunks';
        stopped = true;
        break;
      }
      const end = Math.min(lines.length, start + WINDOW_LINES);
      const piece = tokensOf(`${relative}\n${lines.slice(start, end).join('\n')}`);
      if (piece.truncated) tokenLimited = true;
      if (piece.tokens.length > 0) {
        const tf = new Map<string, number>();
        for (const token of piece.tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
        chunks.push({ path: relative, startLine: start + 1, endLine: end, length: piece.tokens.length, tf });
        totalLength += piece.tokens.length;
        for (const token of tf.keys()) df.set(token, (df.get(token) ?? 0) + 1);
      }
      if (end >= lines.length) break;
    }
  }
  if (truncated === null && tokenLimited) truncated = 'token-limit';

  return {
    builtAt: Date.now(),
    chunks,
    df,
    avgLength: chunks.length > 0 ? totalLength / chunks.length : 0,
    files,
    dirs: walk.dirs,
    skips,
    truncated,
  };
}

/**
 * Single-flight: callers share one build in flight. `observed` is the index a caller found out of date: a forced
 * fetch then returns a newer cached index instead of building again.
 */
async function getIndex(root: string, limits: CodeContextLimits, observed?: Index): Promise<Index> {
  const key = cacheKey(root, limits);
  const pending = pendingBuilds.get(key);
  if (pending) return pending;
  const cached = indexCache.get(key);
  if (cached && cached.expiresAt > Date.now() && (observed === undefined || cached.index !== observed)) {
    return cached.index;
  }
  const build: Promise<Index> = buildIndex(root, limits)
    .then(index => {
      const now = Date.now();
      for (const [entryKey, entry] of indexCache) {
        if (entry.expiresAt <= now) indexCache.delete(entryKey);
      }
      indexCache.set(key, { index, expiresAt: now + CACHE_TTL_MS });
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

async function isStale(root: string, rootReal: string, index: Index, relative: string): Promise<boolean> {
  const signature = index.files.get(relative);
  if (!signature) return true;
  const absolute = path.join(root, relative);
  const info = await lstat(absolute).catch(() => null);
  if (!info || info.isSymbolicLink() || !info.isFile() || info.mtimeMs !== signature.mtimeMs || info.size !== signature.size) {
    return true;
  }
  return !(await resolvesInside(rootReal, absolute));
}

function emptyIndexMeta(): CodeContextResult['index'] {
  return {
    builtAt: null,
    ageMs: null,
    files: 0,
    chunks: 0,
    skippedFiles: 0,
    skippedByReason: {},
    skippedSamples: [],
    truncated: false,
    truncatedReason: null,
    rebuilt: false,
    staleDropped: 0,
  };
}

/**
 * Refuses a search root that repository policy does not cover: a folder above the repository, a denied folder
 * inside it, or a separate folder (a worktree outside the repository) whose own name is denied.
 */
export function assertSearchRoot(root: string, repoRoot: string): void {
  const target = path.resolve(root);
  const repo = path.resolve(repoRoot);
  if (target === repo) return;
  if (isInside(repo, target)) {
    if (deniedRelativePath(path.relative(repo, target))) throw new Error('CODE_CONTEXT_ROOT_DENIED');
    return;
  }
  if (isInside(target, repo)) throw new Error('CODE_CONTEXT_ROOT_TOO_BROAD');
  if (isDeniedName(path.basename(target))) throw new Error('CODE_CONTEXT_ROOT_DENIED');
}

export async function searchCodeContext(input: CodeContextInput): Promise<CodeContextResult> {
  const root = path.resolve(input.root);
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory()) throw new Error('CODE_CONTEXT_ROOT_INVALID');
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(input.limit ?? DEFAULT_LIMIT)));
  const terms = queryTerms(input.query);
  // A query with no searchable terms is answered without building or reading an index.
  if (terms.length === 0) {
    return { provider: CODE_CONTEXT_PROVIDER, status: 'empty-query', query: input.query, tokens: [], index: emptyIndexMeta(), hits: [] };
  }
  const limits = resolveLimits(input.limits);
  const rootReal = await realpath(root);

  let index = await getIndex(root, limits);
  // A new, renamed, or deleted file changes its directory's mtime: one light check per query, bounded rebuilds.
  let rebuilt = false;
  for (let pass = 0; pass < MAX_DIRECTORY_REBUILDS; pass += 1) {
    if (!(await directoriesChanged(root, index))) break;
    rebuilt = true;
    index = await getIndex(root, limits, index);
  }
  let selected = index.chunks.length > 0 ? selectTop(terms, index, limit) : [];
  // Each returned range must still describe its file; the first changed file triggers one rebuild.
  for (const item of selected) {
    if (await isStale(root, rootReal, index, item.chunk.path)) {
      rebuilt = true;
      index = await getIndex(root, limits, index);
      selected = index.chunks.length > 0 ? selectTop(terms, index, limit) : [];
      break;
    }
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

  const hits: CodeContextHit[] = [];
  let staleDropped = 0;
  let budget = MAX_RESPONSE_CHARS;
  for (const item of selected) {
    // Re-read and compare with the indexed signature: a range is returned only for the text it came from.
    const read = await readTextFile(path.join(root, item.chunk.path), limits.maxFileBytes, rootReal);
    const signature = index.files.get(item.chunk.path);
    if (!read.ok || !signature || read.signature.mtimeMs !== signature.mtimeMs || read.signature.size !== signature.size) {
      staleDropped += 1;
      continue;
    }
    const raw = maskFileText(read.text).split(/\r?\n/).slice(item.chunk.startLine - 1, item.chunk.endLine).join('\n');
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
