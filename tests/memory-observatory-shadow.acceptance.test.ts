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

async function freeLoopbackPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('EPHEMERAL_PORT_ALLOCATION_FAILED');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function runCanary(
  stateRoot: string,
  ports: { agentCore: number; codespaceMcp: number; observatory: number },
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [
    canaryScript,
    '--root', stateRoot,
    '--agent-core-port', String(ports.agentCore),
    '--codespace-mcp-port', String(ports.codespaceMcp),
    '--observatory-port', String(ports.observatory),
    '--json',
  ], {
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
    const ports = {
      agentCore: await freeLoopbackPort(),
      codespaceMcp: await freeLoopbackPort(),
      observatory: await freeLoopbackPort(),
    };
    expect(new Set(Object.values(ports)).size).toBe(3);
    try {
      for (const port of Object.values(ports)) expect(await canConnect(port)).toBe(false);

      const result = await runCanary(stateRoot, ports);
      expect(result.exitCode, result.stderr || result.stdout).toBe(0);
      const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
      const report = JSON.parse(lines.at(-1) ?? '{}') as any;

      expect(report.status).toBe('PASS');
      expect(report.shadow).toMatchObject({
        agentCoreUrl: `http://127.0.0.1:${ports.agentCore}`,
        candidateMcpUrl: `http://127.0.0.1:${ports.codespaceMcp}/mcp`,
        observatoryUrl: `http://127.0.0.1:${ports.observatory}`,
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

      for (const port of Object.values(ports)) expect(await canConnect(port)).toBe(false);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  }, 90_000);
});
