import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { flattenRetrievalTokens, tokenizeRetrievalText } from '../memory/identifier-tokenizer.js';
import { maskSecrets } from '../memory/privacy-masking.js';
import { truncateText } from '../text-bounds.js';

// Lexical (BM25) search over bounded line windows of the workspace source.
// Source files stay authoritative: hits are re-read from disk and masked before return.
// Deliberately no embeddings, no network, no persisted state. Index lives in process memory.

export const CODE_CONTEXT_PROVIDER = 'agent-core-lexical' as const;

const WINDOW_LINES = 40;
const STRIDE_LINES = 32;
const MAX_FILES = 4000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_CHUNKS = 60000;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const MAX_SNIPPET_CHARS = 1200;
const MAX_RESPONSE_CHARS = 24000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

// Runtime state, secrets, protected content, backups, and provider copies never enter the index.
const DENY_TOP_LEVEL = new Set([
  'runtime', 'secrets', 'DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT', 'Backups', 'release',
  'SubProject', 'rdc', '.rdc-standalone', 'launcher-publish', '_artifacts', '.grafel', '.tmp',
]);
const DENY_ANYWHERE = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'bin', 'obj']);
const DENY_FILE_NAME: RegExp[] = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx|kdbx|keystore|jks)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^credentials/i,
  /^secrets?(\.|$)/i,
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
    truncated: boolean;
  };
  hits: CodeContextHit[];
}

interface Chunk {
  path: string;
  startLine: number;
  endLine: number;
  length: number;
  tf: Map<string, number>;
}

interface Index {
  builtAt: number;
  chunks: Chunk[];
  df: Map<string, number>;
  avgLength: number;
  files: number;
  skipped: number;
  truncated: boolean;
}

interface Candidates {
  files: string[];
  skipped: number;
  truncated: boolean;
}

const indexCache = new Map<string, { index: Index; expiresAt: number }>();

export function clearCodeContextIndexCache(): void {
  indexCache.clear();
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isDeniedFileName(name: string): boolean {
  return DENY_FILE_NAME.some(pattern => pattern.test(name));
}

async function readEntries(directory: string): Promise<Dirent[] | null> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
}

async function collectCandidates(root: string): Promise<Candidates> {
  const files: string[] = [];
  let skipped = 0;
  let truncated = false;
  const pending: Array<{ dir: string; relDir: string }> = [{ dir: root, relDir: '' }];
  while (pending.length > 0 && !truncated) {
    const current = pending.pop()!;
    const entries = await readEntries(current.dir);
    if (!entries) {
      skipped += 1;
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        skipped += 1;
        continue;
      }
      const relative = current.relDir ? `${current.relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!current.relDir && DENY_TOP_LEVEL.has(entry.name)) continue;
        if (DENY_ANYWHERE.has(entry.name)) continue;
        pending.push({ dir: path.join(current.dir, entry.name), relDir: relative });
        continue;
      }
      if (!entry.isFile()) continue;
      if (isDeniedFileName(entry.name)) continue;
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      if (files.length >= MAX_FILES) {
        truncated = true;
        break;
      }
      files.push(relative);
    }
  }
  return { files, skipped, truncated };
}

async function readTextFile(absolute: string): Promise<string | null> {
  try {
    const info = await lstat(absolute);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) return null;
    const buffer = await readFile(absolute);
    if (buffer.subarray(0, 8192).includes(0)) return null;
    return buffer.toString('utf8');
  } catch {
    return null;
  }
}

function tokensOf(text: string): string[] {
  return flattenRetrievalTokens(tokenizeRetrievalText(text));
}

async function buildIndex(root: string): Promise<Index> {
  const candidates = await collectCandidates(root);
  let skipped = candidates.skipped;
  let truncated = candidates.truncated;
  let files = 0;
  const chunks: Chunk[] = [];
  const df = new Map<string, number>();
  let totalLength = 0;

  for (const relative of candidates.files) {
    if (chunks.length >= MAX_CHUNKS) {
      truncated = true;
      break;
    }
    const absolute = path.join(root, relative);
    if (!isInside(root, absolute)) {
      skipped += 1;
      continue;
    }
    const text = await readTextFile(absolute);
    if (text === null) {
      skipped += 1;
      continue;
    }
    files += 1;
    const lines = text.split(/\r?\n/);
    for (let start = 0; start < lines.length; start += STRIDE_LINES) {
      const end = Math.min(lines.length, start + WINDOW_LINES);
      const tokens = tokensOf(`${relative}\n${lines.slice(start, end).join('\n')}`);
      if (tokens.length > 0) {
        const tf = new Map<string, number>();
        for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
        chunks.push({ path: relative, startLine: start + 1, endLine: end, length: tokens.length, tf });
        totalLength += tokens.length;
        for (const token of tf.keys()) df.set(token, (df.get(token) ?? 0) + 1);
        if (chunks.length >= MAX_CHUNKS) {
          truncated = true;
          break;
        }
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
    skipped,
    truncated,
  };
}

async function getIndex(root: string): Promise<Index> {
  const cached = indexCache.get(root);
  if (cached && cached.expiresAt > Date.now()) return cached.index;
  const index = await buildIndex(root);
  indexCache.set(root, { index, expiresAt: Date.now() + CACHE_TTL_MS });
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

interface Scored {
  chunk: Chunk;
  score: number;
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

async function snippetFor(root: string, chunk: Chunk): Promise<{ snippet: string; truncated: boolean }> {
  const absolute = path.join(root, chunk.path);
  if (!isInside(root, absolute)) return { snippet: '[REDACTED:path-outside-root]', truncated: false };
  const text = await readTextFile(absolute);
  if (text === null) return { snippet: '[unavailable: file changed, too large, or unreadable]', truncated: false };
  const raw = text.split(/\r?\n/).slice(chunk.startLine - 1, chunk.endLine).join('\n');
  // Mask before truncating so a secret is never cut in half and left unmasked.
  let masked: string;
  try {
    masked = maskSecrets(raw).text;
  } catch {
    return { snippet: '[REDACTED:snippet-unavailable]', truncated: false };
  }
  const bounded = truncateText(masked, MAX_SNIPPET_CHARS);
  return { snippet: bounded, truncated: bounded.length < masked.length };
}

export async function searchCodeContext(input: CodeContextInput): Promise<CodeContextResult> {
  const root = path.resolve(input.root);
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory()) throw new Error('CODE_CONTEXT_ROOT_INVALID');
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(input.limit ?? DEFAULT_LIMIT)));
  const terms = queryTerms(input.query);
  const index = await getIndex(root);
  const meta = {
    builtAt: new Date(index.builtAt).toISOString(),
    ageMs: Date.now() - index.builtAt,
    files: index.files,
    chunks: index.chunks.length,
    skippedFiles: index.skipped,
    truncated: index.truncated,
  };
  if (terms.length === 0) {
    return { provider: CODE_CONTEXT_PROVIDER, status: 'empty-query', query: input.query, tokens: [], index: meta, hits: [] };
  }
  const selected = index.chunks.length > 0 ? selectTop(terms, index, limit) : [];
  const hits: CodeContextHit[] = [];
  let budget = MAX_RESPONSE_CHARS;
  for (const item of selected) {
    const { snippet, truncated } = await snippetFor(root, item.chunk);
    if (snippet.length > budget) break;
    budget -= snippet.length;
    hits.push({
      path: item.chunk.path,
      startLine: item.chunk.startLine,
      endLine: item.chunk.endLine,
      score: Number(item.score.toFixed(4)),
      snippet,
      snippetTruncated: truncated,
    });
  }
  return {
    provider: CODE_CONTEXT_PROVIDER,
    status: hits.length > 0 ? 'ok' : 'no-match',
    query: input.query,
    tokens: terms,
    index: meta,
    hits,
  };
}
