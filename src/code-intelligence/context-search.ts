import { lstat, open, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { flattenRetrievalTokens, tokenizeRetrievalText } from '../memory/identifier-tokenizer.js';
import { maskSecrets } from '../memory/privacy-masking.js';
import { isCredentialFileName } from '../security/credential-names.js';
import { truncateText } from '../text-bounds.js';

// Lexical (BM25) search over bounded line windows of the workspace source.
// Source files stay authoritative: every hit is checked against the file's size and mtime captured when its
// windows were indexed, re-read from disk with its real path inside the root, and dropped if it changed. A
// changed file is indexed again on the spot, so its new text can answer the same query.
// Secret shapes are masked by privacy-masking, the one owner, before a window is indexed and before a snippet
// is returned, so a secret value is neither indexed nor returned.
// The index is a catalog of text files and folders, kept in process memory. Each query re-lists only the folders
// whose mtime moved (a new, renamed, or deleted entry changes it) and re-indexes only the hits that went stale. An
// edit to a file that is not a hit leaves its folder's mtime alone, so it is seen only when the catalog expires,
// 60 seconds after its first quiet pass. A build that runs out of its time budget is resumed by later queries
// until it is complete. A folder or file that stays unreadable keeps the view incomplete, but not the catalog from
// being trusted and expired on the normal clock. No embeddings, no network, no persisted state.

export const CODE_CONTEXT_PROVIDER = 'agent-core-lexical' as const;

const WINDOW_LINES = 40;
const STRIDE_LINES = 32;
// A complete index is trusted this long after its first complete pass; an unfinished one this long after its last step.
const CACHE_TTL_MS = 60 * 1000;
const PARTIAL_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const MAX_SNIPPET_CHARS = 1200;
const MAX_RESPONSE_CHARS = 24000;
const SKIP_SAMPLE_LIMIT = 50;
// Upper bound on files the catalog tracks. The index cap (maxFiles) is applied after priority ordering.
const WALK_HARD_CAP = 50000;
// Failed listings of a folder that fails transiently. The attempt that reaches this count records the folder as
// unreadable; the folder keeps being retried, so its entries come back once the failure clears.
const MAX_LIST_ATTEMPTS = 3;
// A failed folder waits this long before its next attempt, so the attempts are spaced in time, not run back to back.
const LIST_RETRY_MS = 1000;
// A folder or file that failed this many times in a row has failed for good: its retries slow down to LIST_RETRY_MAX_MS,
// and it stops keeping the catalog from being trusted. Short failures (a lock, an antivirus scan) clear well before that.
const PERMANENT_ATTEMPTS = 8;
const LIST_RETRY_MAX_MS = 30 * 1000;
// Re-checks one query may make on hits that changed while it ran.
const MAX_STALE_PASSES = 2;
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
  '.ssh', '.aws', '.gnupg', '.docker', '.secrets', '.credentials',
]);
// Only directly under the workspace root.
const DENY_TOP_LEVEL = new Set(['subproject', 'rdc', '.rdc-standalone', '.grafel']);
// Names that hold secrets, for files and folders alike. isCredentialFileName (security/credential-names) adds
// .env files, key and certificate extensions, and editor backup copies of them.
const DENY_NAME: RegExp[] = [
  /^(credentials?|secrets?)([._-].*)?$/i,
  /^(client[_-]?secrets?|service[_-]?account|tokens?)([._-].*)?\.json$/i,
  /adminsdk.*\.json$/i,
  // Credential files with a compound name: gcp-credentials.json, prod-secrets.yaml, firebase-service-account.json.
  /[._-](credentials?|secrets?)\.(json|ya?ml|env|txt)$/i,
  /service[_-]?account.*\.json$/i,
  /^local\.settings\.json$/i,
  /\.local\.(json|ya?ml|toml|env|ini|xml)$/i,
  /^appsettings(\.[^.]+)?\.json$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^\.pgpass$/i,
  /\.(kdbx|pkcs12)$/i,
];
// Archive trees that repeat near-identical text and crowd out live code; excluded by relative path.
const DENY_RELATIVE_PREFIXES = ['.changeset/applied'];
// The same archive, matched on the absolute path so it is excluded whatever root the search starts from.
const CHANGESET_APPLIED = /[\\/]\.changeset[\\/]applied(?:[\\/]|$)/i;
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
    /** False while a build is still being resumed by later queries; hits then come from the files read so far. */
    complete: boolean;
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

interface FileWindows {
  chunks: Chunk[];
  /** A window was too dense to tokenize in full. */
  limited: boolean;
}

interface SkipView {
  count: number;
  byReason: Partial<Record<SkipReason, number>>;
  samples: Array<{ path: string; reason: SkipReason }>;
}

interface SkipLedger {
  count: number;
  byReason: Partial<Record<SkipReason, number>>;
  /** The reason each skipped path has now: a path counts once, and a later reason replaces the earlier one. */
  reasons: Map<string, SkipReason>;
}

// A read-only snapshot of the catalog. Copies, so a query holding it never sees a later step.
interface Index {
  builtAt: number;
  complete: boolean;
  /** Catalog changes so far; a query reports `rebuilt` when this moved while it ran. */
  changes: number;
  chunks: Chunk[];
  df: Map<string, number>;
  avgLength: number;
  /** Files whose windows are in the index, with the signature those windows were built from. */
  files: Map<string, FileSignature>;
  skips: SkipView;
  truncated: IndexTruncation | null;
}

interface Scored {
  chunk: Chunk;
  score: number;
}

interface FileEntry {
  /** Bumped on invalidation, so a read that started before it does not index stale text. */
  generation: number;
  /** Set while the file's windows are in the index. */
  signature?: FileSignature;
  skipped?: SkipReason;
}

interface BuildState {
  root: string;
  limits: CodeContextLimits;
  startedAt: number;
  expiresAt: number;
  /** Set at the first complete pass. Adds and removals count as changes only after it. */
  trustUntil?: number;
  skips: SkipLedger;
  /** Folders listed so far, with the mtime seen when each was listed. A folder enters only after its entries were read. The root is ''. */
  dirs: Map<string, number>;
  /** Folders to list, in order: the root first, then folders whose mtime moved or that are new. */
  dirQueue: string[];
  /** Folders whose listing failed transiently; they join `dirQueue` on the next step. */
  retryDirs: Set<string>;
  /** Failed listing attempts of a folder, and the time its next attempt may run. Cleared by a successful listing. */
  dirFailures: Map<string, { attempts: number; retryAt: number }>;
  /** Index of the folder the last step did not reach, so one step's lstat calls stay within its budget. */
  checkCursor: number;
  /** Files whose read failed for a transient reason: failed attempts, and the time the next read may run. Cleared on a good read. */
  fileRetries: Map<string, { attempts: number; retryAt: number }>;
  /** The step running for this catalog, if any: a request joins it instead of starting another. */
  pending?: Promise<Index>;
  /** Folders whose latest listing refused a file at the hard cap. */
  cappedDirs: Set<string>;
  /** Text files in the catalog. A file is indexed once `signature` is set; a skipped file is never read again. */
  files: Map<string, FileEntry>;
  /** Files to read before the rest: new, edited, or invalidated since they were last indexed. */
  urgent: Set<string>;
  /** Hit files invalidated for a request. The request waits for each to be read or set aside; new files do not make it wait. */
  staleHits: Set<string>;
  /** Unread files in priority order. Rebuilt only when `orderDirty` is set; `cursor` is the next one to consider. */
  order: string[];
  orderDirty: boolean;
  cursor: number;
  chunksByFile: Map<string, Chunk[]>;
  /** Files with a window too dense to tokenize in full. */
  limitedFiles: Set<string>;
  /** Files whose windows are in the index. */
  indexed: number;
  chunkCount: number;
  df: Map<string, number>;
  totalLength: number;
  /** Terminal stop (max-chunks). A time-budget stop is not terminal: the next query resumes. */
  stop: IndexTruncation | null;
  changes: number;
  /** Requests made so far, and the highest request a finished step has covered. */
  requests: number;
  handled: number;
}

type FsResult<T> = { ok: true; value: T } | { ok: false; code: string | undefined };

interface FileRead {
  ok: true;
  text: string;
  signature: FileSignature;
}

interface FileReadFailure {
  ok: false;
  reason: SkipReason;
  /** The failure may clear (a file being written, a lock, a handle that could not be opened): the file is retried. */
  transient?: boolean;
}

const buildStats = { indexBuilds: 0, indexSlices: 0 };
const indexStates = new Map<string, BuildState>();

/** Counters for tests and diagnostics. Builds and build steps only; no request data. */
export function codeContextStats(): { indexBuilds: number; indexSlices: number } {
  return { indexBuilds: buildStats.indexBuilds, indexSlices: buildStats.indexSlices };
}

export function clearCodeContextIndexCache(): void {
  indexStates.clear();
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

function deniedPrefix(relative: string): boolean {
  const lower = relative.replace(/\\/g, '/').toLowerCase();
  return DENY_RELATIVE_PREFIXES.some(prefix => lower === prefix || lower.startsWith(`${prefix}/`));
}

// A path relative to the root is denied when it sits under a denied prefix or any of its segments is denied.
function deniedRelativePath(relative: string): boolean {
  return deniedPrefix(relative)
    || relative.split(/[\\/]/).some((segment, index) => isDeniedEntry(segment, index === 0));
}

function parentOf(relative: string): string {
  const slash = relative.lastIndexOf('/');
  return slash < 0 ? '' : relative.slice(0, slash);
}

// Lower rank is indexed first: the same order a fresh build uses, and the one an incremental build keeps.
function compareRank(a: string, b: string): number {
  return filePriority(a) - filePriority(b) || a.localeCompare(b);
}

function recordSkip(ledger: SkipLedger, relative: string, reason: SkipReason): void {
  if (ledger.reasons.get(relative) === reason) return;
  dropSkip(ledger, relative);
  ledger.reasons.set(relative, reason);
  ledger.count += 1;
  ledger.byReason[reason] = (ledger.byReason[reason] ?? 0) + 1;
}

// Drops the skip record of one path, so a file that was deleted, renamed or read again is no longer reported as skipped.
function dropSkip(ledger: SkipLedger, relative: string): void {
  const reason = ledger.reasons.get(relative);
  if (reason === undefined) return;
  ledger.reasons.delete(relative);
  ledger.count -= 1;
  const left = (ledger.byReason[reason] ?? 0) - 1;
  if (left > 0) ledger.byReason[reason] = left;
  else delete ledger.byReason[reason];
}

// The first skipped paths in record order. Derived at each view, so the samples always describe the skips counted now.
function sampleSkips(ledger: SkipLedger): Array<{ path: string; reason: SkipReason }> {
  return [...ledger.reasons].slice(0, SKIP_SAMPLE_LIMIT).map(([relative, reason]) => ({ path: relative, reason }));
}

function dropSkipsWhere(ledger: SkipLedger, named: (relative: string) => boolean): void {
  for (const relative of [...ledger.reasons.keys()]) {
    if (named(relative)) dropSkip(ledger, relative);
  }
}

// Runs a filesystem call and keeps only its error code, so the caller can tell a missing entry from a transient failure.
async function tryFs<T>(run: () => Promise<T>): Promise<FsResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, code: (error as NodeJS.ErrnoException).code };
  }
}

// The signature is taken before the read and must still hold after it: a file that changes mid-read is read
// again, so the returned text and its signature always describe the same content. With root, the real path
// must also stay inside the root and avoid denied names (per-hit and re-index reads, after the listing).
// The bytes come from one handle, and that handle must be the object the checks looked at. Its identity (device and
// inode, read as BigInt so a 64-bit file id keeps every bit) is taken before the real-path check and compared with the
// handle's: a path swapped to a link or another file in between is opened as another object and checked again.
async function readTextFile(absolute: string, maxFileBytes: number, root?: string): Promise<FileRead | FileReadFailure> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await lstat(absolute).catch(() => null);
    if (!before) return { ok: false, reason: 'unreadable', transient: true };
    if (before.isSymbolicLink()) return { ok: false, reason: 'link' };
    if (!before.isFile()) return { ok: false, reason: 'unreadable' };
    if (before.size > maxFileBytes) return { ok: false, reason: 'too-large' };
    const handle = await open(absolute, 'r').catch(() => null);
    if (!handle) return { ok: false, reason: 'unreadable', transient: true };
    let buffer: Buffer;
    try {
      const opened = await handle.stat({ bigint: true });
      let real: string | undefined;
      if (root) {
        // The real path must stay inside the root and name the same object as the handle, both before and after the read.
        // Node has no O_NOFOLLOW, so a swap inside the window is caught only when the identities differ; that residual
        // window is a documented limit.
        const resolved = await realpath(absolute).catch(() => null);
        if (resolved === null) return { ok: false, reason: 'unreadable', transient: true };
        if (!isInside(root, resolved) || deniedRelativePath(path.relative(root, resolved))) {
          return { ok: false, reason: 'outside-root' };
        }
        const target = await lstat(resolved, { bigint: true }).catch(() => null);
        if (!target || target.dev !== opened.dev || target.ino !== opened.ino) continue;
        real = resolved;
      }
      buffer = await handle.readFile();
      const after = await handle.stat();
      if (after.mtimeMs !== before.mtimeMs || after.size !== before.size) continue;
      if (real !== undefined && (await realpath(absolute).catch(() => null)) !== real) continue;
    } finally {
      await handle.close();
    }
    if (buffer.subarray(0, 8192).includes(0)) return { ok: false, reason: 'binary' };
    return { ok: true, text: buffer.toString('utf8'), signature: { mtimeMs: before.mtimeMs, size: before.size } };
  }
  return { ok: false, reason: 'unreadable', transient: true };
}

// Where a path really lands: 'inside' the root and off denied names, 'outside' it, or 'unknown' when realpath failed.
// An unknown place is a transient failure, so the file is retried rather than recorded as outside the root.
async function realInside(root: string, absolute: string): Promise<'inside' | 'outside' | 'unknown'> {
  const real = await realpath(absolute).catch(() => null);
  if (real === null) return 'unknown';
  return isInside(root, real) && !deniedRelativePath(path.relative(root, real)) ? 'inside' : 'outside';
}

// The real path (links and intermediate folders resolved) must stay under the root and avoid denied names.
async function resolvesInside(root: string, absolute: string): Promise<boolean> {
  return (await realInside(root, absolute)) === 'inside';
}

function tokensOf(text: string): { tokens: string[]; truncated: boolean } {
  const parsed = tokenizeRetrievalText(text);
  return { tokens: flattenRetrievalTokens(parsed), truncated: parsed.truncated === true };
}

// The one masking pass for indexed text. Line count is preserved, so window line numbers match the file.
function maskFileText(text: string): string {
  return maskSecrets(text, { preserveLines: true }).text;
}

function maskSnippet(raw: string): { text: string; truncated: boolean } {
  let masked: string;
  try {
    masked = maskSecrets(raw).text;
  } catch {
    return { text: '[REDACTED:snippet-unavailable]', truncated: false };
  }
  // Mask before truncating so a secret is never cut in half and left unmasked.
  const bounded = truncateText(masked, MAX_SNIPPET_CHARS);
  return { text: bounded, truncated: bounded.length < masked.length };
}

const PRIORITY_ROOTS = ['src', 'tests', 'scripts'];

// Lower rank is indexed first. Docs go last, so a cut never drops code in favour of prose.
function filePriority(relative: string): number {
  const first = (relative.split('/')[0] ?? '').toLowerCase();
  const rank = PRIORITY_ROOTS.indexOf(first);
  if (rank >= 0) return rank;
  return first === 'docs' ? 4 : 3;
}

function newBuildState(root: string, limits: CodeContextLimits): BuildState {
  const now = Date.now();
  return {
    root,
    limits,
    startedAt: now,
    expiresAt: now + PARTIAL_TTL_MS,
    skips: { count: 0, byReason: {}, reasons: new Map() },
    checkCursor: 0,
    fileRetries: new Map(),
    dirs: new Map(),
    dirQueue: [''],
    retryDirs: new Set(),
    dirFailures: new Map(),
    cappedDirs: new Set(),
    files: new Map(),
    urgent: new Set(),
    staleHits: new Set(),
    order: [],
    orderDirty: true,
    cursor: 0,
    chunksByFile: new Map(),
    limitedFiles: new Set(),
    indexed: 0,
    chunkCount: 0,
    df: new Map(),
    totalLength: 0,
    stop: null,
    changes: 0,
    requests: 0,
    handled: 0,
  };
}

// The catalog for a root and its limits. An expired catalog is replaced; a step still running on it finishes on its own.
// `created` tells a first build from a rebuild.
function stateFor(root: string, limits: CodeContextLimits): { state: BuildState; created: boolean } {
  const now = Date.now();
  for (const [key, state] of indexStates) {
    if (state.expiresAt <= now) indexStates.delete(key);
  }
  const key = cacheKey(root, limits);
  const existing = indexStates.get(key);
  if (existing) return { state: existing, created: false };
  buildStats.indexBuilds += 1;
  const state = newBuildState(root, limits);
  indexStates.set(key, state);
  return { state, created: true };
}

// Adds and removals count as changes only once the catalog has been trusted; a build still in progress is not one.
function noteChange(state: BuildState): void {
  if (state.trustUntil !== undefined) state.changes += 1;
}

// One lstat per listed folder, from the cursor, until the step's deadline. A folder whose mtime moved, or that is gone,
// is queued for listing; the cursor carries the rest over to the next step.
async function checkFolders(state: BuildState, deadline: number): Promise<void> {
  const folders = [...state.dirs];
  for (let step = 0; step < folders.length; step += 1) {
    const at = (state.checkCursor + step) % folders.length;
    if (step > 0 && Date.now() >= deadline) {
      state.checkCursor = at;
      return;
    }
    const [relDir, mtimeMs] = folders[at]!;
    // A folder whose listing failed is retried on its own pause, not queued again on every step.
    if (state.retryDirs.has(relDir)) continue;
    const absolute = relDir ? path.join(state.root, relDir) : state.root;
    const info = await lstat(absolute).catch(() => null);
    if ((!info || !info.isDirectory() || info.mtimeMs !== mtimeMs) && !state.dirQueue.includes(relDir)) {
      state.dirQueue.push(relDir);
    }
  }
  state.checkCursor = 0;
}

// Forgets a folder, every file below it, every folder below it, and their skip records.
function removeFolder(state: BuildState, relDir: string): void {
  const prefix = `${relDir}/`;
  const under = (value: string): boolean => relDir === '' || value === relDir || value.startsWith(prefix);
  let removed = false;
  for (const known of [...state.files.keys()]) {
    if (under(known)) {
      forgetFile(state, known);
      removed = true;
    }
  }
  for (const known of [...state.dirs.keys()]) {
    if (under(known)) {
      state.dirs.delete(known);
      removed = true;
    }
  }
  dropSkipsWhere(state.skips, under);
  state.dirQueue = state.dirQueue.filter(folder => !under(folder));
  for (const folder of [...state.retryDirs]) {
    if (under(folder)) state.retryDirs.delete(folder);
  }
  for (const folder of [...state.dirFailures.keys()]) {
    if (under(folder)) state.dirFailures.delete(folder);
  }
  for (const folder of [...state.cappedDirs]) {
    if (under(folder)) state.cappedDirs.delete(folder);
  }
  if (removed) noteChange(state);
}

// A folder that cannot be listed. A missing one leaves the catalog. A transient failure keeps its entries, and the
// folder stays pending until its pause is over (LIST_RETRY_MS). The attempt that reaches MAX_LIST_ATTEMPTS records the
// folder unreadable; retries go on, so the view stays incomplete until a listing succeeds.
function listingFailed(state: BuildState, relDir: string, code: string | undefined): void {
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    removeFolder(state, relDir);
    return;
  }
  const attempts = (state.dirFailures.get(relDir)?.attempts ?? 0) + 1;
  state.dirFailures.set(relDir, { attempts, retryAt: Date.now() + retryPause(attempts) });
  state.retryDirs.add(relDir);
  if (attempts >= MAX_LIST_ATTEMPTS) recordSkip(state.skips, relDir || '.', 'unreadable');
}

// The pause before the next attempt: short while a failure may clear, slow once it has failed for good.
function retryPause(attempts: number): number {
  return attempts < PERMANENT_ATTEMPTS ? LIST_RETRY_MS : LIST_RETRY_MAX_MS;
}

// Lists one folder. A folder listed before is listed again: its new files are urgent once the catalog is trusted,
// and what is gone is forgotten.
async function listFolder(state: BuildState, relDir: string): Promise<void> {
  const absolute = relDir ? path.join(state.root, relDir) : state.root;
  const relisting = state.dirs.has(relDir);
  // Folder mtime is read before its entries: a change after this point is seen by the next check, never missed.
  const info = await tryFs(() => lstat(absolute));
  if (!info.ok) return listingFailed(state, relDir, info.code);
  if (!info.value.isDirectory()) {
    removeFolder(state, relDir);
    return;
  }
  const listed = await tryFs(() => readdir(absolute, { withFileTypes: true }));
  if (!listed.ok) return listingFailed(state, relDir, listed.code);

  // Recorded only now that its entries were read: a folder that failed is listed again, never taken for complete.
  state.dirFailures.delete(relDir);
  state.dirs.set(relDir, info.value.mtimeMs);
  dropSkip(state.skips, relDir || '.');
  state.cappedDirs.delete(relDir);
  const entries = listed.value.sort((a, b) => a.name.localeCompare(b.name));
  const names = new Set<string>();
  const listedFiles = new Set<string>();
  const listedFolders = new Set<string>();
  // Link and outside-root records are written after the cleanup below, which forgets what this listing replaced.
  const linkRecords: Array<{ relative: string; reason: SkipReason }> = [];
  for (const entry of entries) {
    const relative = relDir ? `${relDir}/${entry.name}` : entry.name;
    names.add(relative);
    const child = path.join(absolute, entry.name);
    if (isDeniedEntry(entry.name, relDir === '') || deniedPrefix(relative) || CHANGESET_APPLIED.test(child)) continue;
    if (entry.isSymbolicLink()) {
      linkRecords.push({ relative, reason: 'link' });
      continue;
    }
    // A link or outside-root record of this name is stale once the entry is a plain one.
    const previous = state.skips.reasons.get(relative);
    if (previous === 'link' || previous === 'outside-root') dropSkip(state.skips, relative);
    if (entry.isDirectory()) {
      // A Windows junction is reported as a link above; a real folder must still resolve inside the root.
      const real = await realpath(child).catch(() => null);
      if (!real || !isInside(state.root, real)) {
        linkRecords.push({ relative, reason: 'outside-root' });
        continue;
      }
      listedFolders.add(relative);
      if (!state.dirs.has(relative) && !state.dirQueue.includes(relative) && !state.retryDirs.has(relative)) {
        state.dirQueue.push(relative);
        noteChange(state);
      }
      continue;
    }
    if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    if (state.files.has(relative)) {
      listedFiles.add(relative);
      continue;
    }
    if (state.files.size >= WALK_HARD_CAP) {
      state.cappedDirs.add(relDir);
      continue;
    }
    listedFiles.add(relative);
    state.files.set(relative, { generation: 0 });
    state.orderDirty = true;
    if (state.trustUntil !== undefined) state.urgent.add(relative);
    noteChange(state);
  }
  if (relisting) {
    // What is no longer listed here is forgotten: files directly in this folder, folders below it, and their skip records.
    dropSkipsWhere(state.skips, value => parentOf(value) === relDir && !names.has(value));
    for (const known of [...state.files.keys()]) {
      if (parentOf(known) === relDir && !listedFiles.has(known)) {
        forgetFile(state, known);
        noteChange(state);
      }
    }
    for (const known of [...state.dirs.keys()]) {
      if (known !== relDir && parentOf(known) === relDir && !listedFolders.has(known)) removeFolder(state, known);
    }
  }
  for (const record of linkRecords) recordSkip(state.skips, record.relative, record.reason);
}

function removeChunks(state: BuildState, relative: string): void {
  state.limitedFiles.delete(relative);
  const chunks = state.chunksByFile.get(relative);
  if (!chunks) return;
  for (const chunk of chunks) {
    state.totalLength -= chunk.length;
    state.chunkCount -= 1;
    for (const token of chunk.tf.keys()) {
      const left = (state.df.get(token) ?? 0) - 1;
      if (left > 0) state.df.set(token, left);
      else state.df.delete(token);
    }
  }
  state.chunksByFile.delete(relative);
}

// Takes a file out of the index: its windows leave, and it is an unread file again.
function unindex(state: BuildState, relative: string, entry: FileEntry): void {
  if (entry.signature === undefined) return;
  removeChunks(state, relative);
  entry.signature = undefined;
  state.indexed -= 1;
}

function forgetFile(state: BuildState, relative: string): void {
  const entry = state.files.get(relative);
  if (entry) unindex(state, relative, entry);
  state.files.delete(relative);
  state.urgent.delete(relative);
  state.fileRetries.delete(relative);
  dropSkip(state.skips, relative);
  state.orderDirty = true;
}

// A file whose hit no longer matches its text: its windows leave the index and it is read again first.
function invalidateFile(state: BuildState, relative: string): void {
  const entry = state.files.get(relative);
  if (!entry) return;
  unindex(state, relative, entry);
  entry.skipped = undefined;
  state.fileRetries.delete(relative);
  entry.generation += 1;
  state.urgent.add(relative);
  state.staleHits.add(relative);
  state.orderDirty = true;
  state.changes += 1;
}

// Unread, and not waiting out a transient read failure. A file whose pause is over counts as unread again.
function isUnread(state: BuildState, relative: string): boolean {
  const entry = state.files.get(relative);
  if (entry === undefined || entry.signature !== undefined || entry.skipped !== undefined) return false;
  const retry = state.fileRetries.get(relative);
  return retry === undefined || retry.retryAt <= Date.now();
}

// Unread files in priority order. Sorted only when the set of unread files changed, so a step sorts at most once.
function unreadOrder(state: BuildState): string[] {
  if (state.orderDirty) {
    const unread: string[] = [];
    for (const relative of state.files.keys()) {
      if (isUnread(state, relative)) unread.push(relative);
    }
    unread.sort(compareRank);
    state.order = unread;
    state.cursor = 0;
    state.orderDirty = false;
  }
  return state.order;
}

// The indexed file that ranks last. Only consulted once the index is full.
function worstIndexed(state: BuildState): string | undefined {
  let worst: string | undefined;
  for (const [relative, entry] of state.files) {
    if (entry.signature !== undefined && (worst === undefined || compareRank(relative, worst) > 0)) worst = relative;
  }
  return worst;
}

// The next unread file to read, or null. Urgent files come first whenever the index has room for them. Once the index
// is full, a file is read only when it ranks better than the worst indexed one, which it displaces. Without room the
// rest follow in priority order. A terminal stop, or urgentOnly, leaves every other file unread.
function pickRead(state: BuildState, urgentOnly: boolean): string | null {
  if (state.indexed < state.limits.maxFiles) {
    // Invalidated hits go first, so the request that invalidated them reads their new text in this step.
    for (const relative of state.staleHits) {
      if (state.urgent.has(relative) && isUnread(state, relative)) return relative;
    }
    let urgent: string | undefined;
    for (const relative of state.urgent) {
      if (isUnread(state, relative) && (urgent === undefined || compareRank(relative, urgent) < 0)) urgent = relative;
    }
    if (urgent !== undefined) return urgent;
    if (urgentOnly || state.stop !== null) return null;
    const order = unreadOrder(state);
    while (state.cursor < order.length) {
      const relative = order[state.cursor]!;
      if (isUnread(state, relative)) return relative;
      state.cursor += 1;
    }
    return null;
  }
  const onlyUrgent = urgentOnly || state.stop !== null;
  let best: string | undefined;
  for (const relative of state.files.keys()) {
    if (!isUnread(state, relative)) continue;
    if (onlyUrgent && !state.urgent.has(relative)) continue;
    if (best === undefined || compareRank(relative, best) < 0) best = relative;
  }
  const worst = worstIndexed(state);
  return best !== undefined && (worst === undefined || compareRank(best, worst) < 0) ? best : null;
}

// Quiet: no folder to list or retry on the normal clock, no file waiting for a transient failure to clear, and no unread
// file that can still enter the index. A folder or file that failed for good does not make a catalog unquiet, so it can be
// trusted and expired like any other; it still keeps the view incomplete (see isComplete).
function isQuiet(state: BuildState): boolean {
  if (state.dirQueue.length > 0) return false;
  for (const relDir of state.retryDirs) {
    if ((state.dirFailures.get(relDir)?.attempts ?? 0) < PERMANENT_ATTEMPTS) return false;
  }
  for (const retry of state.fileRetries.values()) {
    if (retry.attempts < PERMANENT_ATTEMPTS) return false;
  }
  return pickRead(state, false) === null;
}

// Complete: quiet, and no folder or file is unreadable at the moment.
function isComplete(state: BuildState): boolean {
  return state.retryDirs.size === 0 && state.fileRetries.size === 0 && isQuiet(state);
}

// Whether a hit invalidated for a request still waits to be read or set aside. Only these hold a request back.
function staleHitsPending(state: BuildState): boolean {
  let pending = false;
  for (const relative of [...state.staleHits]) {
    if (state.urgent.has(relative)) pending = true;
    else state.staleHits.delete(relative);
  }
  return pending;
}

// The windows of a file, tokenized before any is indexed, so a file can be checked against the chunk cap first.
function windowsOf(relative: string, masked: string): FileWindows {
  const lines = masked.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let limited = false;
  for (let start = 0; start < lines.length; start += STRIDE_LINES) {
    const end = Math.min(lines.length, start + WINDOW_LINES);
    const piece = tokensOf(`${relative}\n${lines.slice(start, end).join('\n')}`);
    if (piece.truncated) limited = true;
    if (piece.tokens.length > 0) {
      const tf = new Map<string, number>();
      for (const token of piece.tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
      chunks.push({ path: relative, startLine: start + 1, endLine: end, length: piece.tokens.length, tf });
    }
    if (end >= lines.length) break;
  }
  return { chunks, limited };
}

// Adds windows to the index. A partial file keeps the windows that fit, and a stop is set when some do not.
function commitWindows(state: BuildState, relative: string, windows: FileWindows, partial: boolean): void {
  const room = state.limits.maxChunks - state.chunkCount;
  if (partial && windows.chunks.length > room) state.stop ??= 'max-chunks';
  const chunks = partial && windows.chunks.length > room ? windows.chunks.slice(0, Math.max(0, room)) : windows.chunks;
  if (windows.limited) state.limitedFiles.add(relative);
  for (const chunk of chunks) {
    state.totalLength += chunk.length;
    state.chunkCount += 1;
    for (const token of chunk.tf.keys()) state.df.set(token, (state.df.get(token) ?? 0) + 1);
  }
  if (chunks.length > 0) state.chunksByFile.set(relative, chunks);
}

// The index is full and a better-ranked file is being read: the worst indexed file leaves the index and stays a
// known unread file, so a later step can read it again if room opens.
function evictWorst(state: BuildState): void {
  const worst = worstIndexed(state);
  if (worst === undefined) return;
  unindex(state, worst, state.files.get(worst)!);
  state.orderDirty = true;
  noteChange(state);
}

// A file whose read failed transiently waits its pause, then comes back as an urgent file. It counts as skipped
// (unreadable) until a read succeeds, and after PERMANENT_ATTEMPTS failures it keeps being retried on the slow pause.
function scheduleFileRetry(state: BuildState, relative: string): void {
  const attempts = (state.fileRetries.get(relative)?.attempts ?? 0) + 1;
  state.fileRetries.set(relative, { attempts, retryAt: Date.now() + retryPause(attempts) });
  recordSkip(state.skips, relative, 'unreadable');
}

// Reads one file and indexes it. An urgent file must fit under the chunk cap whole; one that does not stays out and
// stops the build. Any other file keeps the windows that fit.
async function readNext(state: BuildState, relative: string): Promise<void> {
  const entry = state.files.get(relative);
  if (!entry) return;
  const urgent = state.urgent.has(relative);
  const generation = entry.generation;
  const read = await readTextFile(path.join(state.root, relative), state.limits.maxFileBytes, state.root);
  // Forgotten or invalidated while it was read: the next step decides again.
  if (state.files.get(relative) !== entry || entry.generation !== generation) return;
  state.urgent.delete(relative);
  if (!read.ok) {
    if (read.transient) {
      scheduleFileRetry(state, relative);
    } else {
      // A failure that is not transient settles the file: an earlier transient failure no longer keeps the view incomplete.
      state.fileRetries.delete(relative);
      recordSkip(state.skips, relative, read.reason);
      entry.skipped = read.reason;
    }
    return;
  }
  state.fileRetries.delete(relative);
  const windows = windowsOf(relative, maskFileText(read.text));
  if (urgent && state.chunkCount + windows.chunks.length > state.limits.maxChunks) {
    state.stop ??= 'max-chunks';
    return;
  }
  // pickRead chose this file because it ranks better than the worst indexed one, so that one makes room.
  if (state.indexed >= state.limits.maxFiles) evictWorst(state);
  entry.signature = read.signature;
  state.indexed += 1;
  dropSkip(state.skips, relative);
  commitWindows(state, relative, windows, !urgent);
}

// Reads files while the budget lasts; the first read always runs. With urgentOnly, only urgent files are read.
async function readUnits(state: BuildState, deadline: number, urgentOnly: boolean): Promise<void> {
  for (let read = 0; ; read += 1) {
    if (read > 0 && Date.now() >= deadline) break;
    const relative = pickRead(state, urgentOnly);
    if (relative === null) {
      // Nothing more can enter the index: urgent files that did not make it are ordinary unread files now.
      state.urgent.clear();
      break;
    }
    await readNext(state, relative);
  }
}

// One budgeted step of a build: urgent re-reads run first, then queued folders are listed, then the other files are
// read. Each kind of unit has a first unit that always runs, so a step moves forward on both even with no budget.
// With urgentOnly the step only re-reads urgent files: a request that follows a stale-hit pass needs no folder walk.
async function advanceBuild(state: BuildState, urgentOnly: boolean): Promise<void> {
  buildStats.indexSlices += 1;
  const deadline = Date.now() + state.limits.buildBudgetMs;
  if (!urgentOnly) await checkFolders(state, deadline);
  // A failed folder joins the queue once its pause is over; until then it stays pending, so the view is not complete.
  const now = Date.now();
  for (const relDir of [...state.retryDirs]) {
    if ((state.dirFailures.get(relDir)?.retryAt ?? 0) > now) continue;
    state.retryDirs.delete(relDir);
    if (!state.dirQueue.includes(relDir)) state.dirQueue.push(relDir);
  }
  // A file whose transient read failure is over is queued as urgent. Its failure count stays until a read succeeds.
  for (const [relative, retry] of state.fileRetries) {
    if (retry.retryAt > now || !state.files.has(relative)) continue;
    state.urgent.add(relative);
    state.orderDirty = true;
  }
  await readUnits(state, deadline, true);
  if (urgentOnly) return;
  // Discovery stops at a terminal stop; the urgent re-reads above still ran.
  for (let listed = 0; state.stop === null && state.dirQueue.length > 0; listed += 1) {
    if (listed > 0 && Date.now() >= deadline) break;
    await listFolder(state, state.dirQueue.shift()!);
  }
  await readUnits(state, deadline, false);
}

// A read-only snapshot of the catalog. Copies, so a query holding it never sees a later step.
function viewOf(state: BuildState): Index {
  const stopped = state.stop !== null;
  const quiet = stopped || isQuiet(state);
  const complete = stopped || isComplete(state);
  const now = Date.now();
  if (quiet) {
    state.trustUntil ??= now + CACHE_TTL_MS;
    state.expiresAt = state.trustUntil;
  } else {
    state.expiresAt = now + PARTIAL_TTL_MS;
  }
  const files = new Map<string, FileSignature>();
  let kept = 0;
  for (const [relative, entry] of state.files) {
    if (entry.signature) files.set(relative, entry.signature);
    if (entry.skipped === undefined) kept += 1;
  }
  const chunks: Chunk[] = [];
  for (const list of state.chunksByFile.values()) {
    for (const chunk of list) chunks.push(chunk);
  }
  // The cut counts the text files the catalog keeps or still has to read; skipped files never cut the list.
  const cut: IndexTruncation | null = state.cappedDirs.size > 0 || kept > state.limits.maxFiles ? 'max-files' : null;
  const truncated: IndexTruncation | null = state.stop
    ?? (quiet ? (cut ?? (state.limitedFiles.size > 0 ? 'token-limit' : null)) : 'time-budget');
  return {
    builtAt: state.startedAt,
    complete,
    changes: state.changes,
    chunks,
    df: new Map(state.df),
    avgLength: chunks.length > 0 ? state.totalLength / chunks.length : 0,
    files,
    skips: { count: state.skips.count, byReason: { ...state.skips.byReason }, samples: sampleSkips(state.skips) },
    truncated,
  };
}

// Runs one step for the catalog, or joins the step already running. A step covers every request made before it starts.
function runStep(state: BuildState, urgentOnly: boolean): Promise<Index> {
  if (state.pending) return state.pending;
  const step: Promise<Index> = (async () => {
    const covered = state.requests;
    await advanceBuild(state, urgentOnly);
    // A request is answered once the hit files it invalidated were read or set aside, or the build stopped for good.
    const waiting = staleHitsPending(state);
    if (state.stop !== null || !waiting) state.handled = Math.max(state.handled, covered);
    return viewOf(state);
  })().finally(() => {
    if (state.pending === step) state.pending = undefined;
  });
  state.pending = step;
  return step;
}

/**
 * Brings the catalog up to date for one query: invalidated files are queued, folders that moved are re-listed,
 * and reads run within the budget. A step already running may have started before this request, so the request
 * is covered by a step that starts after it.
 */
async function refresh(state: BuildState, invalidate: string[]): Promise<Index> {
  // A pass that re-reads invalidated hits needs urgent reads only, so it skips the folder walk.
  const urgentOnly = invalidate.length > 0;
  for (const relative of invalidate) invalidateFile(state, relative);
  const mine = ++state.requests;
  let index = await runStep(state, urgentOnly);
  for (let rounds = 0; state.handled < mine && rounds < 2; rounds += 1) {
    index = await runStep(state, true);
  }
  return index;
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

function selectFrom(index: Index, terms: string[], limit: number): Scored[] {
  return index.chunks.length > 0 ? selectTop(terms, index, limit) : [];
}

async function isStale(root: string, index: Index, relative: string): Promise<boolean> {
  const signature = index.files.get(relative);
  if (!signature) return true;
  const absolute = path.join(root, relative);
  const info = await lstat(absolute).catch(() => null);
  if (!info || info.isSymbolicLink() || !info.isFile() || info.mtimeMs !== signature.mtimeMs || info.size !== signature.size) {
    return true;
  }
  return !(await resolvesInside(root, absolute));
}

function emptyIndexMeta(): CodeContextResult['index'] {
  return {
    builtAt: null,
    ageMs: null,
    complete: false,
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

// The real path of an existing folder. A junction or symlink is followed here, once, so every later check compares real paths.
async function realFolder(input: string): Promise<string> {
  const real = await realpath(path.resolve(input)).catch(() => null);
  const info = real === null ? null : await stat(real).catch(() => null);
  if (real === null || !info?.isDirectory()) throw new Error('CODE_CONTEXT_ROOT_INVALID');
  return real;
}

/**
 * Refuses a search root that repository policy does not cover, judged by real paths: a folder above the repository,
 * a denied folder inside it (a junction cannot hide one), or a folder outside it whose own name is denied.
 */
export async function assertSearchRoot(root: string, repoRoot: string): Promise<void> {
  const target = await realFolder(root);
  const repo = await realFolder(repoRoot);
  const relative = path.relative(repo, target);
  if (relative === '') return;
  if (isInside(repo, target)) {
    if (deniedRelativePath(relative)) throw new Error('CODE_CONTEXT_ROOT_DENIED');
    return;
  }
  if (isInside(target, repo)) throw new Error('CODE_CONTEXT_ROOT_TOO_BROAD');
  if (isDeniedEntry(path.basename(path.resolve(root)), false) || isDeniedEntry(path.basename(target), false)) {
    throw new Error('CODE_CONTEXT_ROOT_DENIED');
  }
}

// The masked lines of one file as the index saw them, or null when it no longer matches its indexed signature. Read and
// compared once per query, so a range is returned only for the text it came from.
async function maskedLinesOf(root: string, index: Index, relative: string, maxFileBytes: number): Promise<string[] | null> {
  const read = await readTextFile(path.join(root, relative), maxFileBytes, root);
  const signature = index.files.get(relative);
  if (!read.ok || !signature || read.signature.mtimeMs !== signature.mtimeMs || read.signature.size !== signature.size) {
    return null;
  }
  return maskFileText(read.text).split(/\r?\n/);
}

export async function searchCodeContext(input: CodeContextInput): Promise<CodeContextResult> {
  // The walk starts at the real folder, so a junction or symlink root is followed once, here.
  const root = await realFolder(input.root);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(input.limit ?? DEFAULT_LIMIT)));
  const terms = queryTerms(input.query);
  // A query with no searchable terms is answered without building or reading an index.
  if (terms.length === 0) {
    return { provider: CODE_CONTEXT_PROVIDER, status: 'empty-query', query: input.query, tokens: [], index: emptyIndexMeta(), hits: [] };
  }
  const limits = resolveLimits(input.limits);
  const { state, created } = stateFor(root, limits);
  const changesBefore = state.changes;
  let index = await refresh(state, []);
  let selected = selectFrom(index, terms, limit);
  // Each returned range must still describe its file. A changed file is indexed again and answers this query too.
  for (let pass = 0; pass < MAX_STALE_PASSES; pass += 1) {
    const stale: string[] = [];
    for (const item of selected) {
      if (await isStale(root, index, item.chunk.path)) stale.push(item.chunk.path);
    }
    if (stale.length === 0) break;
    index = await refresh(state, [...new Set(stale)]);
    selected = selectFrom(index, terms, limit);
  }
  // A catalog this query created is a first build, not a rebuild.
  const rebuilt = !created && index.changes !== changesBefore;

  const meta = {
    builtAt: new Date(index.builtAt).toISOString(),
    ageMs: Date.now() - index.builtAt,
    complete: index.complete,
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
  // Each file is read and masked once per query, however many of its ranges are returned.
  const texts = new Map<string, string[] | null>();
  for (const item of selected) {
    if (!texts.has(item.chunk.path)) {
      texts.set(item.chunk.path, await maskedLinesOf(root, index, item.chunk.path, limits.maxFileBytes));
    }
    const lines = texts.get(item.chunk.path);
    if (!lines) {
      staleDropped += 1;
      continue;
    }
    const raw = lines.slice(item.chunk.startLine - 1, item.chunk.endLine).join('\n');
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
