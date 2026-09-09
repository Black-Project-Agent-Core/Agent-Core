import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolveShellInvocation } from './platform-shell.js';

export type ProcessTreeTerminationMode = 'windows_taskkill_tree' | 'posix_process_group';

export interface ProcessGovernanceCapabilities {
  processTreeTermination: ProcessTreeTerminationMode;
  hardWallClockLimit: true;
  hardOutputByteLimit: true;
  hardCpuTimeLimit: false;
  hardMemoryLimit: false;
}

export function processGovernanceCapabilities(platform: NodeJS.Platform = process.platform): ProcessGovernanceCapabilities {
  return {
    processTreeTermination: platform === 'win32' ? 'windows_taskkill_tree' : 'posix_process_group',
    hardWallClockLimit: true,
    hardOutputByteLimit: true,
    hardCpuTimeLimit: false,
    hardMemoryLimit: false,
  };
}

export function spawnManagedCommand(command: string, cwd: string): ChildProcessWithoutNullStreams {
  const invocation = resolveShellInvocation(command);
  return spawn(invocation.executable, invocation.args, {
    cwd,
    windowsHide: invocation.windowsHide,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export async function terminateManagedProcessTree(
  child: ChildProcessWithoutNullStreams,
  force = false,
): Promise<void> {
  if (!child.pid) {
    try { child.kill(force ? 'SIGKILL' : undefined); } catch { /* already gone */ }
    return;
  }

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', ...(force ? ['/F'] : [])], {
        windowsHide: true,
        stdio: 'ignore',
      });
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      killer.once('error', () => {
        try { child.kill(force ? 'SIGKILL' : undefined); } catch { /* best effort fallback */ }
        done();
      });
      killer.once('close', done);
    });
    return;
  }

  try {
    process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch {
    try { child.kill(force ? 'SIGKILL' : undefined); } catch { /* already gone */ }
  }
}
