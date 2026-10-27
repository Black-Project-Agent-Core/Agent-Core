import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Argv for a read-only git call: no optional locks, no fsmonitor daemon, no stat-only index refresh (a plain
 * `git diff` can otherwise rewrite `.git/index`), unquoted non-ASCII paths, and the default `a/` `b/` diff
 * prefixes whatever the user configured (`diff.mnemonicPrefix` would turn them into `w/` and `i/`).
 */
export function readOnlyGitArgs(root: string, args: string[]): string[] {
  return [
    '-c', `safe.directory=${root.replaceAll('\\', '/')}`,
    '-c', 'core.fsmonitor=false',
    '-c', 'core.quotePath=false',
    '-c', 'diff.autoRefreshIndex=false',
    '-c', 'diff.mnemonicPrefix=false',
    '-c', 'diff.noprefix=false',
    '--no-optional-locks', '-C', root, ...args,
  ];
}

/** Stable locale and no credential prompt for every read-only git call. */
export function readOnlyGitEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0', ...extra };
}

export async function readOnlyGit(
  root: string,
  args: string[],
  options: { timeoutMs?: number; maxBuffer?: number } = {},
): Promise<string> {
  // Bound here, not at module load: callers that only need the argv must not depend on execFile existing.
  const { stdout } = await promisify(execFile)('git', readOnlyGitArgs(root, args), {
    windowsHide: true,
    timeout: options.timeoutMs ?? 12_000,
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
    encoding: 'utf8',
    env: readOnlyGitEnv(),
  });
  return String(stdout ?? '');
}
