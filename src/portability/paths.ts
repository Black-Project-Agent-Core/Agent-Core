import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT_TOKENS = /\$\{AGENT_CORE_PROJECT_ROOT\}|%AGENT_CORE_PROJECT_ROOT%|<PROJECT_ROOT>/gi;

function normalizeForCompare(value: string): string {
  const normalized = path.resolve(value).replaceAll('\\', '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function hasProjectMarker(candidate: string): boolean {
  return existsSync(path.join(candidate, 'package.json'));
}

/** Absolute path folded for comparison: Windows paths are case-insensitive. */
export function comparablePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** True when `candidate` is `root` or lies below it; both sides are compared through `comparablePath`. */
export function pathInside(candidate: string, root: string): boolean {
  const child = comparablePath(candidate);
  const parent = comparablePath(root);
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}

export function discoverProjectRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  while (true) {
    if (hasProjectMarker(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveModuleProjectRoot(moduleUrl: string, env: NodeJS.ProcessEnv = process.env): string {
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
  const discovered = discoverProjectRoot(moduleDir) ?? moduleDir;
  return resolveProjectRoot(env, discovered);
}

export function resolveProjectRoot(env: NodeJS.ProcessEnv, fallbackRoot: string): string {
  const fallback = path.resolve(fallbackRoot);
  const raw = env.AGENT_CORE_PROJECT_ROOT?.trim();
  if (!raw) return fallback;
  const tokenized = raw.replace(PROJECT_ROOT_TOKENS, fallback);
  const candidate = path.isAbsolute(tokenized)
    ? path.resolve(tokenized)
    : path.resolve(fallback, tokenized);
  if (hasProjectMarker(candidate)) return candidate;
  return hasProjectMarker(fallback) ? fallback : candidate;
}
export function resolvePortableProjectPath(
  projectRoot: string,
  rawValue: string | undefined,
  defaultRelativePath: string,
): string {
  const root = path.resolve(projectRoot);
  const fallback = path.resolve(root, defaultRelativePath);
  const raw = rawValue?.trim();
  if (!raw) return fallback;

  let expanded = raw.replace(PROJECT_ROOT_TOKENS, root);
  if (/^@project(?:[\\/]|$)/i.test(expanded)) {
    expanded = expanded.replace(/^@project[\\/]?/i, '');
    return path.resolve(root, expanded);
  }
  if (!path.isAbsolute(expanded)) return path.resolve(root, expanded);

  const candidate = path.resolve(expanded);
  if (existsSync(candidate)) return candidate;

  const suffix = defaultRelativePath.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
  const comparableCandidate = normalizeForCompare(candidate);
  const matchesOwnedDefault = comparableCandidate.endsWith('/' + suffix);
  if (matchesOwnedDefault) return fallback;

  const ownedRoots = ['runtime', 'node_modules', 'dist', 'scripts', 'src', 'assets', 'tunnel-client'];
  const parts = candidate.split(/[\\/]+/);
  for (let index = 0; index < parts.length; index += 1) {
    if (!ownedRoots.includes(parts[index]!.toLowerCase())) continue;
    const rebased = path.resolve(root, ...parts.slice(index));
    if (normalizeForCompare(rebased).startsWith(normalizeForCompare(root) + '/')) return rebased;
  }
  return candidate;
}
