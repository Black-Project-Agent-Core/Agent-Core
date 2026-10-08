import {
  lstatSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { resolveModuleProjectRoot } from '../portability/paths.js';

export const EVIDENCE_POLICY_MARKER = '.agent-core-evidence.json';
const PROJECT_ROOT = resolveModuleProjectRoot(import.meta.url);
const MAX_MARKER_BYTES = 64 * 1024;
const MAX_RULES = 128;
const MAX_PATTERN_CHARS = 1024;
const MAX_CANDIDATE_CHARS = 4096;
const MAX_CANDIDATES = 32;
const MAX_ANCESTORS = 64;
const MAX_MATCH_WORK = 1_000_000;

export type EvidenceCaptureDisposition = 'full' | 'metadata-only' | 'omit';
export type EvidencePolicyState = 'inactive' | 'active' | 'invalid';

export interface EvidenceCaptureDecision {
  disposition: EvidenceCaptureDisposition;
  policyState: EvidencePolicyState;
  pathCount: number;
  ruleCount: number;
  markerCount: number;
  reason?: string;
}
interface EvidenceRule {
  pattern: string;
  disposition: EvidenceCaptureDisposition;
}

interface EvidenceMarker {
  version: 1;
  default?: EvidenceCaptureDisposition;
  rules?: EvidenceRule[];
}

interface LoadedMarker {
  root: string;
  config: EvidenceMarker;
}

const FILE_TOOLS = new Set([
  'image_inspect',
  'read_file',
  'read_multiple_files',
  'write_file',
  'write_pdf',
  'create_directory',
  'list_directory',
  'move_file',
  'file_checkpoint',
  'get_file_info',
  'edit_block',
  'start_search',
]);

const severity: Record<EvidenceCaptureDisposition, number> = {
  full: 0,
  'metadata-only': 1,
  omit: 2,
};
function stricter(
  left: EvidenceCaptureDisposition,
  right: EvidenceCaptureDisposition,
): EvidenceCaptureDisposition {
  return severity[right] > severity[left] ? right : left;
}

function candidate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_CANDIDATE_CHARS) return undefined;
  return trimmed;
}

function collectContentSourcePaths(value: unknown, output: string[]): void {
  if (!Array.isArray(value)) return;
  for (const item of value.slice(0, MAX_CANDIDATES)) {
    if (!item || typeof item !== 'object') continue;
    const source = candidate((item as Record<string, unknown>).sourcePdfPath);
    if (source) output.push(source);
  }
}
export function extractEvidenceCandidatePaths(
  toolName: string,
  input: unknown,
): { knownFileTool: boolean; paths: string[] } {
  if (!FILE_TOOLS.has(toolName)) return { knownFileTool: false, paths: [] };
  const o = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  if (toolName === 'read_file' && o.isUrl === true) {
    return { knownFileTool: false, paths: [] };
  }

  const paths: string[] = [];
  const add = (value: unknown) => {
    const parsed = candidate(value);
    if (parsed && paths.length < MAX_CANDIDATES) paths.push(parsed);
  };

  switch (toolName) {
    case 'image_inspect': add(o.path); break;
    case 'read_file': add(o.path); break;
    case 'read_multiple_files':
      if (Array.isArray(o.paths) && o.paths.length > MAX_CANDIDATES) {
        return { knownFileTool: true, paths: [] };
      }
      if (Array.isArray(o.paths)) for (const value of o.paths) add(value);
      break;
    case 'write_file':
    case 'create_directory':
    case 'list_directory':
    case 'get_file_info':
    case 'start_search':
      add(o.path);
      break;
    case 'write_pdf':
      if (Array.isArray(o.content) && o.content.length > MAX_CANDIDATES) {
        return { knownFileTool: true, paths: [] };
      }
      add(o.path);
      add(o.outputPath);
      collectContentSourcePaths(o.content, paths);
      break;
    case 'move_file':
      add(o.source);
      add(o.destination);
      break;
    case 'file_checkpoint':
      if (Array.isArray(o.paths) && o.paths.length > MAX_CANDIDATES) {
        return { knownFileTool: true, paths: [] };
      }
      if (Array.isArray(o.paths)) for (const value of o.paths) add(value);
      break;
    case 'edit_block':
      add(o.file_path);
      break;
  }

  return {
    knownFileTool: true,
    paths: [...new Set(paths)].slice(0, MAX_CANDIDATES),
  };
}

function canonicalCandidate(raw: string): string {
  return (path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(PROJECT_ROOT, raw)).normalize('NFC');
}

function comparisonKey(value: string): string {
  const normalized = value.replaceAll('\\', '/').normalize('NFC');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
function markerStart(candidatePath: string): string {
  try {
    return statSync(candidatePath).isDirectory()
      ? candidatePath
      : path.dirname(candidatePath);
  } catch {
    return path.dirname(candidatePath);
  }
}

function parseMarker(filePath: string): EvidenceMarker {
  const info = lstatSync(filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('EVIDENCE_POLICY_MARKER_NOT_REGULAR');
  if (info.size > MAX_MARKER_BYTES) throw new Error('EVIDENCE_POLICY_MARKER_TOO_LARGE');

  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<EvidenceMarker>;
  if (raw.version !== 1) throw new Error('EVIDENCE_POLICY_VERSION_INVALID');
  if (raw.default !== undefined && !['full', 'metadata-only', 'omit'].includes(raw.default)) {
    throw new Error('EVIDENCE_POLICY_DEFAULT_INVALID');
  }
  if (raw.rules !== undefined && !Array.isArray(raw.rules)) {
    throw new Error('EVIDENCE_POLICY_RULES_INVALID');
  }
  const rules = (raw.rules ?? []).slice(0, MAX_RULES);
  if ((raw.rules?.length ?? 0) > MAX_RULES) throw new Error('EVIDENCE_POLICY_RULE_LIMIT');
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') throw new Error('EVIDENCE_POLICY_RULE_INVALID');
    if (typeof rule.pattern !== 'string' || !rule.pattern.trim()) {
      throw new Error('EVIDENCE_POLICY_PATTERN_INVALID');
    }
    if (rule.pattern.length > MAX_PATTERN_CHARS) throw new Error('EVIDENCE_POLICY_PATTERN_TOO_LONG');
    if (!['full', 'metadata-only', 'omit'].includes(rule.disposition)) {
      throw new Error('EVIDENCE_POLICY_DISPOSITION_INVALID');
    }
    validatePattern(rule.pattern);
  }
  return { version: 1, ...(raw.default ? { default: raw.default } : {}), rules };
}

function nearestMarker(candidatePath: string): LoadedMarker | null {
  let current = markerStart(candidatePath);
  for (let depth = 0; depth < MAX_ANCESTORS; depth += 1) {
    const marker = path.join(current, EVIDENCE_POLICY_MARKER);
    try {
      const config = parseMarker(marker);
      return { root: current, config };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}
function validatePattern(raw: string): string {
  const normalized = raw.trim().replaceAll('\\', '/').normalize('NFC');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error('EVIDENCE_POLICY_PATTERN_MUST_BE_RELATIVE');
  }
  const parts = normalized.split('/');
  if (parts.some((part) => part === '..')) throw new Error('EVIDENCE_POLICY_PATTERN_ESCAPES_ROOT');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function globRegex(raw: string): RegExp {
  const pattern = validatePattern(raw);
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === '*' && pattern[index + 1] === '*') {
      const slashBefore = source.endsWith('/');
      index += 1;
      if (pattern[index + 1] === '/') {
        index += 1;
        source += '.*';
      } else if (slashBefore && index === pattern.length - 1) {
        source = source.slice(0, -1) + '(?:/.*)?';
      } else {
        source += '.*';
      }
      continue;
    }
    if (char === '*') { source += '[^/]*'; continue; }
    if (char === '?') { source += '[^/]'; continue; }
    source += /[.\\+^$(){}|[\]]/.test(char) ? '\\' + char : char;
  }
  return new RegExp(source + '$');
}
function relativeCandidate(markerRoot: string, candidatePath: string): string | null {
  const relative = path.relative(markerRoot, candidatePath);
  if (!relative || relative === '.') return '';
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
  return comparisonKey(relative);
}

function applyMarker(
  marker: LoadedMarker,
  candidatePath: string,
  work: { value: number },
): EvidenceCaptureDisposition {
  const relative = relativeCandidate(marker.root, candidatePath);
  if (relative === null) return 'full';
  let disposition = marker.config.default ?? 'full';
  for (const rule of marker.config.rules ?? []) {
    work.value += rule.pattern.length + relative.length;
    if (work.value > MAX_MATCH_WORK) throw new Error('EVIDENCE_POLICY_MATCH_WORK_LIMIT');
    if (globRegex(rule.pattern).test(relative)) {
      disposition = stricter(disposition, rule.disposition);
    }
  }
  return disposition;
}
export function decideToolEvidenceCapture(
  toolName: string,
  input: unknown,
): EvidenceCaptureDecision {
  const extracted = extractEvidenceCandidatePaths(toolName, input);
  const minimum: EvidenceCaptureDisposition = toolName === 'image_inspect' ? 'metadata-only' : 'full';
  if (!extracted.knownFileTool) {
    return { disposition: 'full', policyState: 'inactive', pathCount: 0, ruleCount: 0, markerCount: 0 };
  }
  if (extracted.paths.length === 0) {
    return {
      disposition: 'metadata-only',
      policyState: 'invalid',
      pathCount: 0,
      ruleCount: 0,
      markerCount: 0,
      reason: 'known-file-tool-without-trustworthy-path',
    };
  }

  const paths = extracted.paths.map(canonicalCandidate);
  const markers = new Map<string, LoadedMarker>();
  try {
    for (const value of paths) {
      const marker = nearestMarker(value);
      if (marker) markers.set(comparisonKey(marker.root), marker);
    }
  } catch {
    return {
      disposition: 'metadata-only',
      policyState: 'invalid',
      pathCount: paths.length,
      ruleCount: 0,
      markerCount: 0,
      reason: 'marker-read-or-parse-failed',
    };
  }
  if (markers.size === 0) {
    return {
      disposition: minimum,
      policyState: 'inactive',
      pathCount: paths.length,
      ruleCount: 0,
      markerCount: 0,
    };
  }

  let disposition: EvidenceCaptureDisposition = minimum;
  let ruleCount = 0;
  const work = { value: 0 };
  try {
    for (const marker of markers.values()) {
      ruleCount += marker.config.rules?.length ?? 0;
      for (const value of paths) {
        disposition = stricter(disposition, applyMarker(marker, value, work));
      }
    }
  } catch {
    return {
      disposition: 'metadata-only',
      policyState: 'invalid',
      pathCount: paths.length,
      ruleCount,
      markerCount: markers.size,
      reason: 'policy-match-failed',
    };
  }

  return {
    disposition,
    policyState: 'active',
    pathCount: paths.length,
    ruleCount,
    markerCount: markers.size,
  };
}
