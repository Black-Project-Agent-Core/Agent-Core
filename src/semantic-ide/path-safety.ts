import { realpath } from 'node:fs/promises';
import path from 'node:path';

const PROTECTED_SEGMENT = 'do not touch without instruction explicit';

export function comparable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function inside(candidate: string, root: string): boolean {
  const child = comparable(candidate);
  const parent = comparable(root);
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}

export function isProtectedPath(value: string): boolean {
  return comparable(value).split(/[\\/]+/).some(segment => segment === PROTECTED_SEGMENT);
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
