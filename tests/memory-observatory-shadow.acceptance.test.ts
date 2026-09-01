import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const canaryScript = path.join(repoRoot, 'scripts', 'run-memory-observatory-shadow-canary.mjs');

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(350, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function runCanary(stateRoot: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [canaryScript, '--root', stateRoot, '--json'], {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const exitCode = await new Promise<number | null>((resolve) => child.once('close', resolve));
  return { exitCode, stdout, stderr };
}

describe('isolated Memory Observatory shadow canary', () => {
  it('runs Agent Core + candidate Codespace MCP + Observatory on shadow-only ports, performs a real leased mutation/checkpoint, then leaves live runtime unchanged', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-core-observatory-shadow-'));
    try {
      for (const port of [8865, 39765, 3697]) expect(await canConnect(port)).toBe(false);

      const result = await runCanary(stateRoot);
      expect(result.exitCode, result.stderr || result.stdout).toBe(0);
      const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
      const report = JSON.parse(lines.at(-1) ?? '{}') as any;

      expect(report.status).toBe('PASS');
      expect(report.shadow).toMatchObject({
        agentCoreUrl: 'http://127.0.0.1:8865',
        candidateMcpUrl: 'http://127.0.0.1:39765/mcp',
        observatoryUrl: 'http://127.0.0.1:3697',
      });
      expect(report.canary.memoryContextOpened).toBe(true);
      expect(report.canary.recallObserved).toBe(true);
      expect(report.canary.mutationFileWritten).toBe(true);
      expect(report.canary.checkpointCompleted).toBe(true);
      expect(report.canary.memoryActivityObserved).toBe(true);
      expect(report.canary.events).toEqual(expect.arrayContaining([
        'memory.recalled',
        'memory.revision_created',
        'memory.edge_created',
        'memory.write_decision',
      ]));
      expect(report.canary.observatorySnapshotMatchesBackend).toBe(true);
      expect(report.live.before).toEqual(report.live.after);
      expect(report.cleanup.shadowPortsClosed).toBe(true);

      for (const port of [8865, 39765, 3697]) expect(await canConnect(port)).toBe(false);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  }, 90_000);
});
