import { spawn } from 'node:child_process';

function collectTree(rows: Array<{ pid: number; ppid: number }>, rootPid: number): number[] {
  const result: number[] = [];
  const queue = [rootPid];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const row of rows) {
      if (row.ppid !== parent || result.includes(row.pid) || row.pid === rootPid) continue;
      result.push(row.pid);
      queue.push(row.pid);
    }
  }
  return result;
}

async function capture(command: string, args: string[], timeoutMs = 3000): Promise<string> {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      resolve('');
    }, timeoutMs);
    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)));
    child.once('error', () => {
      clearTimeout(timer);
      resolve('');
    });
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

export async function snapshotDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) return [];
  if (process.platform === 'win32') {
    const script = [
      '$ErrorActionPreference="SilentlyContinue"',
      '$all=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId',
      '$all | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId)" }',
    ].join(';');
    const output = await capture('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script]);
    const rows = output.split(/\r?\n/).flatMap(line => {
      const match = /^(\d+),(\d+)$/.exec(line.trim());
      return match ? [{ pid: Number(match[1]), ppid: Number(match[2]) }] : [];
    });
    return collectTree(rows, rootPid);
  }
  const output = await capture('ps', ['-eo', 'pid=,ppid=']);
  const rows = output.split(/\r?\n/).flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]) }] : [];
  });
  return collectTree(rows, rootPid);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function runKill(command: string, args: string[], timeoutMs = 3000): Promise<void> {
  await new Promise<void>(resolve => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, timeoutMs);
    child.once('error', () => {
      clearTimeout(timer);
      resolve();
    });
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function terminateCapturedPids(pids: readonly number[], force = true): Promise<void> {
  const targets = [...new Set(pids)].filter(pid => Number.isSafeInteger(pid) && pid > 0 && alive(pid));
  if (!targets.length) return;
  if (process.platform === 'win32') {
    for (const pid of targets) {
      await runKill('taskkill.exe', ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])]);
    }
    return;
  }
  for (const pid of targets.reverse()) {
    try { process.kill(pid, force ? 'SIGKILL' : 'SIGTERM'); } catch {}
  }
}

export async function terminateOwnedProcessTree(
  rootPid: number,
  capturedDescendants: readonly number[] = [],
  force = true,
): Promise<void> {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) return;
  if (process.platform === 'win32') {
    if (alive(rootPid)) {
      await runKill('taskkill.exe', ['/PID', String(rootPid), '/T', ...(force ? ['/F'] : [])]);
    }
    await terminateCapturedPids(capturedDescendants, force);
    return;
  }

  if (alive(rootPid)) {
    try { process.kill(-rootPid, force ? 'SIGKILL' : 'SIGTERM'); }
    catch {
      try { process.kill(rootPid, force ? 'SIGKILL' : 'SIGTERM'); } catch {}
    }
  }
  await terminateCapturedPids(capturedDescendants, force);
}
