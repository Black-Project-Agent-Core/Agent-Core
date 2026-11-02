import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { comparablePath as comparable, pathInside as inside } from '../portability/paths.js';

const PROTECTED_SEGMENT = 'do not touch without instruction explicit';

export { comparable, inside };

/** True when the path can be reached (exists and is accessible); never throws. */
export async function pathExists(value: string): Promise<boolean> {
  try { await access(value); return true; } catch { return false; }
}

/**
 * Lexical comparison key for one Windows location that has several spellings: NT namespace prefixes
 * (`\\?\`, `\\.\`), trailing dots or spaces on a segment (Windows drops them), and alternate data stream
 * suffixes (`name::$INDEX_ALLOCATION`, `name:stream`). It stays lexical: 8.3 short names and junctions
 * need realpath, which the authorized* helpers apply to the same path afterwards.
 */
export function canonicalPathKey(value: string): string {
  const resolved = path.resolve(value.replace(/^[\\/]{2}[?.][\\/]UNC[\\/]/i, '\\\\').replace(/^[\\/]{2}[?.][\\/]/, ''));
  if (process.platform !== 'win32') return resolved;
  const { root } = path.parse(resolved);
  const segments = resolved.slice(root.length).split(/[\\/]+/)
    .map(segment => segment.replace(/:.*$/, '').replace(/[. ]+$/, ''))
    .filter(Boolean);
  return (root + segments.join('\\')).toLowerCase();
}

/**
 * Spellings that are never an ordinary file for this server: NT namespace and device paths, alternate data streams
 * (hidden content, and a way around name checks), and UNC shares (opening one makes Windows send the user's
 * credentials to the named host; map the share to a drive letter instead).
 */
export function hazardousWindowsPath(value: string): 'nt-namespace' | 'alternate-data-stream' | 'unc-share' | undefined {
  if (process.platform !== 'win32') return undefined;
  if (/^[\\/]{2}[?.][\\/]/.test(value) || /^\\\?\?\\/.test(value)) return 'nt-namespace';
  if (/^[\\/]{2}[^\\/]/.test(value)) return 'unc-share';
  if (value.replace(/^[A-Za-z]:/, '').includes(':')) return 'alternate-data-stream';
  return undefined;
}

export function isProtectedPath(value: string): boolean {
  return canonicalPathKey(value).split(/[\\/]+/).some(segment => segment === PROTECTED_SEGMENT);
}

export async function authorizedExistingPath(
  root: string,
  candidate: string,
): Promise<{ lexicalPath: string; realPath: string; realRoot: string }> {
  const lexicalPath = path.resolve(candidate);
  if (!inside(lexicalPath, root)) throw new Error(`SEMANTIC_PATH_OUTSIDE_WORKSPACE: ${candidate}`);
  if (isProtectedPath(lexicalPath)) throw new Error('SEMANTIC_PROTECTED_PATH');

  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(lexicalPath)]);
  if (!inside(realCandidate, realRoot)) throw new Error(`SEMANTIC_REALPATH_OUTSIDE_WORKSPACE: ${candidate}`);
  if (isProtectedPath(realCandidate)) throw new Error('SEMANTIC_PROTECTED_PATH');
  return { lexicalPath, realPath: realCandidate, realRoot };
}

export async function authorizedDestinationPath(
  root: string,
  candidate: string,
): Promise<{ lexicalPath: string; realParent: string; realRoot: string }> {
  const lexicalPath = path.resolve(candidate);
  if (!inside(lexicalPath, root)) throw new Error(`SEMANTIC_PATH_OUTSIDE_WORKSPACE: ${candidate}`);
  if (isProtectedPath(lexicalPath)) throw new Error('SEMANTIC_PROTECTED_PATH');

  const parent = path.dirname(lexicalPath);
  const [realRoot, realParent] = await Promise.all([realpath(root), realpath(parent)]);
  if (!inside(realParent, realRoot)) throw new Error(`SEMANTIC_REALPATH_OUTSIDE_WORKSPACE: ${candidate}`);
  if (isProtectedPath(realParent)) throw new Error('SEMANTIC_PROTECTED_PATH');
  return { lexicalPath, realParent, realRoot };
}
