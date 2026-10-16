import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { withMemoryProcessLock } from '../../../src/memory/lock.js';

test('Windows/exFAT lock renewal preserves exclusive ownership across heartbeat', async () => {
  const projectRoot = path.resolve(process.cwd(), '..', '..');
  const tmp = path.join(projectRoot, 'runtime', 'tmp');
  await mkdir(tmp, { recursive: true });
  const dir = await mkdtemp(path.join(tmp, 'memory-exfat-lease-'));
  const lockPath = path.join(dir, '.memory.lock');
  try {
    await withMemoryProcessLock(lockPath, async () => {
      const module = pathToFileURL(path.join(process.cwd(), 'dist', 'memory', 'lock.js')).href;
      const code = `import {withMemoryProcessLock} from ${JSON.stringify(module)};
        try {await withMemoryProcessLock(${JSON.stringify(lockPath)},async()=>{},800);
          process.stdout.write('UNEXPECTED_OWNER');process.exitCode=3;}
        catch(error){if(error?.code!=='MEMORY_STORE_BUSY')throw error;
          process.stdout.write('BUSY_CONFIRMED');}`;
      const contender = spawnSync(process.execPath, ['--input-type=module', '--eval', code],
        { encoding: 'utf8', timeout: 10_000, windowsHide: true });
      expect(contender.status).toBe(0);
      expect(contender.stdout).toContain('BUSY_CONFIRMED');
      // Functional lease renewal (not a throughput or speed benchmark).
      await delay(17_000);
    }, 10_000);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}, 35_000);
