import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  processGovernanceCapabilities,
  spawnManagedCommand,
  terminateManagedProcessTree,
} from '../src/runtime/process-governance.js';

const roots: string[] = [];

async function eventually<T>(operation: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let latest = await operation();
  while (!predicate(latest) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    latest = await operation();
  }
  return latest;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('process governance adapter', () => {
  it('reports enforced and unsupported hard limits factually and deterministically', () => {
    const first = processGovernanceCapabilities();
    const second = processGovernanceCapabilities();
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      hardWallClockLimit: true,
      hardOutputByteLimit: true,
      hardCpuTimeLimit: false,
      hardMemoryLimit: false,
    });
    expect(first.processTreeTermination).toBe(process.platform === 'win32' ? 'windows_taskkill_tree' : 'posix_process_group');
  });

  it.skipIf(process.platform === 'win32')('terminates a POSIX descendant process tree without leaving the grandchild alive', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-governance-tree-'));
    roots.push(root);
    const pidFile = path.join(root, 'grandchild.pid');
    const parentFile = path.join(root, 'parent.cjs');
    await writeFile(parentFile, [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "fs.writeFileSync(process.argv[2], String(child.pid));",
      "setInterval(() => {}, 1000);",
    ].join('\n'));

    const managed = spawnManagedCommand(`node ${JSON.stringify(parentFile)} ${JSON.stringify(pidFile)}`, root);
    const pidText = await eventually(
      async () => { try { await access(pidFile); return await readFile(pidFile, 'utf8'); } catch { return ''; } },
      (value) => /^\d+$/.test(value.trim()),
    );
    const grandchildPid = Number(pidText.trim());
    expect(pidAlive(grandchildPid)).toBe(true);

    await terminateManagedProcessTree(managed);
    const stillAlive = await eventually(async () => pidAlive(grandchildPid), (alive) => !alive);
    expect(stillAlive).toBe(false);
  });
});
