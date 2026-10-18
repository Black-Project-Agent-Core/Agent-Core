import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Uses an already installed fixed helper; tests never install or request elevation. */
export async function windowsWorkflowsSymlinkFixture(): Promise<{ root: string; outside: string; projectLink: string }> {
  const script = fileURLToPath(new URL('../../scripts/windows/Invoke-Agent-Core-Symlink-Fixture.ps1', import.meta.url));
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  let stdout: string;
  try {
    ({ stdout } = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Operation', 'Workflows'], {
      windowsHide: true, timeout: 35_000, maxBuffer: 64 * 1024,
    }));
  } catch (error) {
    throw new Error('Real Windows symlink fixture unavailable. Run Setup-Agent-Core-Symlink-Fixture.cmd once, then rerun this test. ' + String(error), { cause: error });
  }
  const result = JSON.parse(stdout);
  if (result.status !== 'ok' || result.fixtureKind !== 'workflows' ||
      !['root', 'outside', 'projectLink'].every(key => typeof result[key] === 'string' && path.isAbsolute(result[key]))) {
    throw new Error('Invalid fixed Workflows symlink fixture receipt.');
  }
  return { root: result.root, outside: result.outside, projectLink: result.projectLink };
}
