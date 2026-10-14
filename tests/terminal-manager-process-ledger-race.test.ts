import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('terminal manager process-ledger exit ordering', () => {
  it('finalizes a short-lived command even when it exits during ledger attachment', async () => {
    const originalCwd = process.cwd();
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-terminal-ledger-race-'));
    await mkdir(path.join(root, 'runtime', 'rdc'), { recursive: true });
    process.chdir(root);
    vi.resetModules();
    try {
      const { TerminalManager } = await import('../src/rdc/terminal-manager.js');
      const { processLedger } = await import('../src/rdc/process-ledger.js');
      const manager = new TerminalManager();
      const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
      const command = process.platform === 'win32' ? 'exit 0' : 'true';
      const result = await manager.executeCommand(command, 5_000, shell);

      expect(result.pid).toBeGreaterThan(0);
      expect(result.isBlocked).toBe(false);
      expect(manager.listActiveSessions().some(item => item.pid === result.pid)).toBe(false);
      expect(manager.listCompletedSessions().find(item => item.pid === result.pid)?.exitCode).toBe(0);
      expect(processLedger.snapshot().find(item => item.pid === result.pid)?.status).toBe('completed');
    } finally {
      process.chdir(originalCwd);
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });
});
