import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Read-only git invocation: no optional locks, no fsmonitor daemon, no stat-only index refresh
 * (a plain `git diff` can otherwise rewrite `.git/index`), unquoted non-ASCII paths and a stable locale.
 */
export async function readOnlyGit(
  root: string,
  args: string[],
  options: { timeoutMs?: number; maxBuffer?: number } = {},
): Promise<string> {
  const { stdout } = await execFileAsync('git', [
    '-c', `safe.directory=${root.replaceAll('\\', '/')}`,
    '-c', 'core.fsmonitor=false',
    '-c', 'core.quotePath=false',
    '-c', 'diff.autoRefreshIndex=false',
    '--no-optional-locks', '-C', root, ...args,
  ], {
    windowsHide: true,
    timeout: options.timeoutMs ?? 12_000,
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
  });
  return String(stdout ?? '');
}
