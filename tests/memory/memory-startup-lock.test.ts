import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { MemoryService } from '../../src/memory/service.js';

it('waits for orphan lock expiry during startup instead of reporting a disabled engine', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-startup-lock-'));
  try {
    await writeFile(path.join(root, '00-agent-core-memory.md'), '# Agent Core Startup Foundation\n');
    const lock = path.join(root, '.memory.lock');
    await mkdir(lock);
    const old = new Date(Date.now() - 113_000);
    await utimes(lock, old, old);
    const started = Date.now();
    const memory = await MemoryService.initialize(process.cwd(), root);
    expect(memory.health().canonicalComplete, JSON.stringify(memory.getIssues())).toBe(true);
    expect(Date.now() - started).toBeGreaterThan(5_000);
    memory.dispose();
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20_000);
