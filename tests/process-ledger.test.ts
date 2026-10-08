import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProcessLedger, type ProcessIdentity } from '../src/rdc/process-ledger.js';

const roots: string[] = [];
async function fixture(identity: ProcessIdentity | null = { image: 'node.exe', created: 'fixed-start' }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-process-ledger-'));
  roots.push(root);
  const file = path.join(root, 'process-ledger.json');
  return { file, ledger: new ProcessLedger(file, () => identity) };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('process ledger', () => {
  it('persists a command digest instead of the raw command and restores an identity-valid detached session', async () => {
    const { file, ledger } = await fixture();
    const command = 'echo super-private-command-argument';
    const id = await ledger.createPending(command, 'powershell.exe', process.cwd());
    await ledger.attachRunning(id, 4242, 'node.exe');

    const persisted = await readFile(file, 'utf8');
    expect(persisted).not.toContain(command);
    expect(persisted).toContain('sha256:');
    expect(ledger.recoverDetached()).toEqual([
      expect.objectContaining({ id, pid: 4242, status: 'running' }),
    ]);
  });

  it('rejects stale PID identity on recovery', async () => {
    const original = { image: 'node.exe', created: 'first-start' };
    const { file, ledger } = await fixture(original);
    const id = await ledger.createPending('echo x', 'powershell.exe', process.cwd());
    await ledger.attachRunning(id, 4242, 'node.exe');

    const restarted = new ProcessLedger(file, () => ({ image: 'node.exe', created: 'reused-pid' }));
    expect(restarted.recoverDetached()).toEqual([]);
    expect(restarted.snapshot().find(item => item.id === id)).toMatchObject({
      status: 'failed',
      error: 'process-identity-unavailable-or-changed',
    });
  });

  it('serializes cancelling and terminal transitions without terminal-state regression', async () => {
    const { ledger } = await fixture();
    const id = await ledger.createPending('echo x', 'powershell.exe', process.cwd());
    await ledger.attachRunning(id, 4242, 'node.exe');
    await Promise.all([
      ledger.markCancelling(4242),
      ledger.finalizeExit(4242, 0),
    ]);
    const terminal = ledger.snapshot().find(item => item.id === id)!;
    expect(['completed', 'cancelled']).toContain(terminal.status);
    await ledger.markCancelling(4242);
    expect(ledger.snapshot().find(item => item.id === id)?.status).toBe(terminal.status);
  });
});
