import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readOnlyGit } from '../process/readonly-git.js';
import { captureRepositoryIdentity } from '../memory/repository-identity.js';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';

const OBSERVABILITY_VERSION = 1;
const DEFAULT_SOURCE_LIMIT = 64;

export interface GraphStructuralEvidence {
  available: boolean;
  reason: string;
  entities?: number;
  relationships?: number;
}

export interface GraphIntegritySnapshot {
  key: string;
  observedAt: string;
  sourceFingerprint?: string;
  sourceHead?: string;
  entities: number;
  relationships: number;
}

interface StoredObservation {
  accepted?: GraphIntegritySnapshot;
  authorizedSourceFingerprint?: string;
  indexRequestedAt?: string;
}

interface StoredGraphObservability {
  version: 1;
  records: Record<string, StoredObservation>;
}
export interface GraphIntegrityObservation {
  state: 'accepted' | 'unverified' | 'degraded' | 'unavailable';
  reason: string;
  accepted?: GraphIntegritySnapshot;
  current?: GraphIntegritySnapshot;
}

export interface SourceRepresentationObservation {
  state: 'available' | 'partial' | 'unavailable';
  basis: 'git-files';
  sourceCandidatesTotal: number;
  intentionallyExcludedTotal: number;
  unclassifiedTotal: number;
  checked: number;
  represented: number;
  unrepresented: number;
  unknown: number;
  truncated: boolean;
  sampleUnrepresented: string[];
  sampleUnclassified: string[];
}

function normalized(value: string): string {
  return value.replaceAll('\\', '/').toLowerCase();
}

function observationKey(group: string, repo: string, ref?: string): string {
  return [group, repo, ref ?? ''].join('|').toLowerCase();
}
async function sourceFingerprint(root: string): Promise<{ fingerprint?: string; head?: string }> {
  try {
    const identity = await captureRepositoryIdentity(root);
    const checkpoint = identity?.checkpoint;
    if (!checkpoint) return {};
    const fingerprint = [
      checkpoint.head ?? '',
      checkpoint.ref ?? '',
      checkpoint.statusDigest ?? '',
    ].join('|');
    return {
      ...(fingerprint.replaceAll('|', '') ? { fingerprint } : {}),
      ...(checkpoint.head ? { head: checkpoint.head } : {}),
    };
  } catch {
    return {};
  }
}

function shrank(previous: GraphIntegritySnapshot, current: GraphIntegritySnapshot): boolean {
  return current.entities < previous.entities || current.relationships < previous.relationships;
}

function hasFreshIndexAuthorization(
  record: StoredObservation,
  accepted: GraphIntegritySnapshot,
  current: GraphIntegritySnapshot,
): boolean {
  if (!current.sourceFingerprint || record.authorizedSourceFingerprint !== current.sourceFingerprint) return false;
  if (!record.indexRequestedAt) return false;
  const requestedAt = Date.parse(record.indexRequestedAt);
  const acceptedAt = Date.parse(accepted.observedAt);
  return Number.isFinite(requestedAt) && (!Number.isFinite(acceptedAt) || requestedAt >= acceptedAt);
}

export class GraphIntegrityObserver {
  private loaded = false;
  private state: StoredGraphObservability = { version: OBSERVABILITY_VERSION, records: {} };

  constructor(private readonly statePath: string) {}
  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = JSON.parse(await readFile(this.statePath, 'utf8')) as StoredGraphObservability;
      if (parsed.version === OBSERVABILITY_VERSION && parsed.records && typeof parsed.records === 'object') {
        this.state = parsed;
      }
    } catch {
      this.state = { version: OBSERVABILITY_VERSION, records: {} };
    }
  }

  private async save(): Promise<void> {
    await writeOwnedFileAtomic(this.statePath, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  async authorizeIndex(input: {
    group: string;
    repo: string;
    ref?: string;
    repoPath: string;
  }): Promise<void> {
    await this.load();
    const source = await sourceFingerprint(input.repoPath);
    const key = observationKey(input.group, input.repo, input.ref);
    const current = this.state.records[key] ?? {};
    this.state.records[key] = {
      ...current,
      ...(source.fingerprint ? { authorizedSourceFingerprint: source.fingerprint } : {}),
      indexRequestedAt: new Date().toISOString(),
    };
    await this.save();
  }

  async observe(input: {
    group: string;
    repo: string;
    ref?: string;
    repoPath: string;
    evidence: GraphStructuralEvidence;
  }): Promise<GraphIntegrityObservation> {
    await this.load();
    if (!input.evidence.available
      || input.evidence.entities === undefined
      || input.evidence.relationships === undefined) {
      return { state: 'unavailable', reason: input.evidence.reason };
    }
    const source = await sourceFingerprint(input.repoPath);
    const key = observationKey(input.group, input.repo, input.ref);
    const current: GraphIntegritySnapshot = {
      key,
      observedAt: new Date().toISOString(),
      ...(source.fingerprint ? { sourceFingerprint: source.fingerprint } : {}),
      ...(source.head ? { sourceHead: source.head } : {}),
      entities: input.evidence.entities,
      relationships: input.evidence.relationships,
    };
    const record = this.state.records[key] ?? {};
    const accepted = record.accepted;

    if (!accepted) {
      this.state.records[key] = { accepted: current };
      await this.save();
      return { state: 'accepted', reason: 'baseline-created', current, accepted: current };
    }

    const sameSource = Boolean(current.sourceFingerprint
      && accepted.sourceFingerprint
      && current.sourceFingerprint === accepted.sourceFingerprint);
    const explicitlyAuthorized = hasFreshIndexAuthorization(record, accepted, current);
    if (sameSource && shrank(accepted, current)) {
      if (!explicitlyAuthorized) {
        return { state: 'degraded', reason: 'unexplained-structural-shrink', accepted, current };
      }
      this.state.records[key] = { accepted: current };
      await this.save();
      return { state: 'accepted', reason: 'same-source-shrink-explicitly-indexed', accepted: current, current };
    }
    if (!sameSource && shrank(accepted, current)) {
      if (!explicitlyAuthorized) {
        return { state: 'unverified', reason: 'source-changed-shrink-requires-explicit-index', accepted, current };
      }
      this.state.records[key] = { accepted: current };
      await this.save();
      return { state: 'accepted', reason: 'source-changed-shrink-explicitly-indexed', accepted: current, current };
    }

    this.state.records[key] = { accepted: current };
    await this.save();
    return {
      state: 'accepted',
      reason: sameSource ? 'stable-or-growing-graph' : 'source-change-explains-new-baseline',
      accepted: current,
      current,
    };
  }
}

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  '.py', '.pyw', '.go', '.rs', '.java', '.kt', '.kts', '.cs', '.fs', '.fsx', '.vb',
  '.php', '.rb', '.swift', '.c', '.cc', '.cpp', '.cxx', '.h', '.hpp', '.hxx',
  '.lua', '.scala', '.sc', '.r', '.ps1', '.psm1', '.psd1', '.sh', '.bash', '.zsh',
  '.sql', '.dart', '.ex', '.exs', '.erl', '.hrl', '.gleam', '.zig', '.nim',
  '.ml', '.mli', '.hs', '.lhs', '.clj', '.cljs', '.cljc', '.vue', '.svelte', '.astro',
]);
const SOURCE_BASENAMES = new Set([
  'dockerfile', 'makefile', 'jenkinsfile', 'procfile', 'rakefile', 'gemfile', 'cmakelists.txt',
]);
const EXCLUDED_BASENAMES = new Set(['.grafelignore']);

const EXCLUDED_EXTENSIONS = new Set([
  '.md', '.mdx', '.markdown', '.txt', '.json', '.jsonl', '.yaml', '.yml', '.toml',
  '.lock', '.map', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf',
  '.doc', '.docx', '.xls', '.xlsx', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf',
]);

interface ProviderIgnoreRule { regex: RegExp; negated: boolean }

function globRegexBody(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') { out += '.*'; i += 1; }
      else out += '[^/]*';
    } else if (ch === '?') out += '[^/]';
    else out += '\\.^$+{}()|[]'.includes(ch) ? `\\${ch}` : ch;
  }
  return out;
}

function classifyPath(relativePath: string, providerIgnored = false): 'source' | 'excluded' | 'unclassified' {
  if (providerIgnored) return 'excluded';
  const clean = normalized(relativePath);
  const segments = clean.split('/');
  if (segments.some(segment => ['node_modules', '.git', 'dist', 'build', 'coverage', 'runtime',
    'release', 'vendor', 'third_party', '.next', '.cache'].includes(segment))) return 'excluded';
  const base = path.posix.basename(clean);
  if (EXCLUDED_BASENAMES.has(base)) return 'excluded';
  if (SOURCE_BASENAMES.has(base)) return 'source';
  const ext = path.posix.extname(clean);
  if (SOURCE_EXTENSIONS.has(ext)) return 'source';
  if (EXCLUDED_EXTENSIONS.has(ext)) return 'excluded';
  return 'unclassified';
}

function compileProviderIgnoreRules(raw: string): ProviderIgnoreRule[] {
  const rules: ProviderIgnoreRule[] = [];
  for (const sourceLine of raw.split(/\r?\n/)) {
    let line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const negated = line.startsWith('!');
    if (negated) line = line.slice(1).trim();
    if (!line) continue;
    const anchored = line.startsWith('/');
    const directory = line.endsWith('/');
    line = line.replace(/^\/+|\/+$/g, '');
    if (!line) continue;
    const body = globRegexBody(line.replaceAll('\\', '/'));
    const prefix = anchored ? '^' : '(?:^|.*/)';
    const suffix = directory ? '(?:/.*)?$' : '$';
    rules.push({ regex: new RegExp(`${prefix}${body}${suffix}`, 'i'), negated });
  }
  return rules;
}

async function providerIgnoreRules(root: string): Promise<ProviderIgnoreRule[]> {
  try {
    return compileProviderIgnoreRules(await readFile(path.join(root, '.grafelignore'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function isProviderIgnored(relativePath: string, rules: ProviderIgnoreRule[]): boolean {
  const clean = relativePath.replaceAll('\\', '/');
  let ignored = false;
  for (const rule of rules) if (rule.regex.test(clean)) ignored = !rule.negated;
  return ignored;
}

async function gitFiles(root: string): Promise<string[] | null> {
  try {
    const stdout = await readOnlyGit(root, ['ls-files', '-co', '--exclude-standard', '-z'], { maxBuffer: 16 * 1024 * 1024 });
    return String(stdout ?? '').split('\0').filter(Boolean).map(value => value.replaceAll('\\', '/'));
  } catch {
    return null;
  }
}
export async function collectSourceRepresentation(input: {
  root: string;
  probe: (relativePath: string) => Promise<boolean | 'unknown'>;
  limit?: number;
}): Promise<SourceRepresentationObservation> {
  const files = await gitFiles(input.root);
  if (!files) {
    return {
      state: 'unavailable',
      basis: 'git-files',
      sourceCandidatesTotal: 0,
      intentionallyExcludedTotal: 0,
      unclassifiedTotal: 0,
      checked: 0,
      represented: 0,
      unrepresented: 0,
      unknown: 0,
      truncated: false,
      sampleUnrepresented: [],
      sampleUnclassified: [],
    };
  }

  let ignoreRules: ProviderIgnoreRule[];
  try {
    ignoreRules = await providerIgnoreRules(input.root);
  } catch {
    return {
      state: 'unavailable',
      basis: 'git-files',
      sourceCandidatesTotal: 0,
      intentionallyExcludedTotal: 0,
      unclassifiedTotal: 0,
      checked: 0,
      represented: 0,
      unrepresented: 0,
      unknown: 0,
      truncated: false,
      sampleUnrepresented: [],
      sampleUnclassified: [],
    };
  }

  const unique = [...new Set(files.map(value => value.replaceAll('\\', '/')))].sort();
  const classified = unique.map(value => ({
    value,
    kind: classifyPath(value, isProviderIgnored(value, ignoreRules)),
  }));
  const source = classified.filter(item => item.kind === 'source').map(item => item.value);
  const excluded = classified.filter(item => item.kind === 'excluded').map(item => item.value);
  const unclassified = classified.filter(item => item.kind === 'unclassified').map(item => item.value);
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_SOURCE_LIMIT, DEFAULT_SOURCE_LIMIT));
  const checkedFiles = source.slice(0, limit);
  let represented = 0;
  let unrepresented = 0;
  let unknown = 0;
  const sampleUnrepresented: string[] = [];

  for (let offset = 0; offset < checkedFiles.length; offset += 8) {
    const batch = checkedFiles.slice(offset, offset + 8);
    const results = await Promise.all(batch.map(async file => {
      try { return await input.probe(file); } catch { return 'unknown' as const; }
    }));
    results.forEach((result, index) => {
      if (result === true) represented += 1;
      else if (result === false) {
        unrepresented += 1;
        if (sampleUnrepresented.length < 12) sampleUnrepresented.push(batch[index]);
      } else unknown += 1;
    });
  }

  const truncated = source.length > checkedFiles.length;
  return {
    state: unknown || truncated ? 'partial' : 'available',
    basis: 'git-files',
    sourceCandidatesTotal: source.length,
    intentionallyExcludedTotal: excluded.length,
    unclassifiedTotal: unclassified.length,
    checked: checkedFiles.length,
    represented,
    unrepresented,
    unknown,
    truncated,
    sampleUnrepresented,
    sampleUnclassified: unclassified.slice(0, 12),
  };
}
