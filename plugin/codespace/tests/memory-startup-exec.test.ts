import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(pluginRoot, 'scripts/memory-lifecycle-preflight.sh');
const servers: Server[] = [];

function env(mode: 'disabled' | 'advisory' | 'enforce', port = 49151) {
  return {
    ...process.env,
    CODESPACE_NAME: 'phase7-fixture-backend',
    CODESPACE_MEMORY_LIFECYCLE_MODE: mode,
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: mode,
    AGENT_CORE_MEMORY_REMOTE_ENABLED: 'false',
    AGENT_CORE_CODESPACE_PORT: String(port),
    AGENT_CORE_ANCHOR_CODESPACE_NAME: 'different-anchor-name',
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('executable Codespace memory lifecycle startup preflight', () => {
  it('keeps disabled and advisory rollback modes available when Memory Remote is disabled', async () => {
    const disabled = await execFileAsync('bash', [script], { env: env('disabled') });
    expect(disabled.stdout).toContain('adapter disabled');

    const advisory = await execFileAsync('bash', [script], { env: env('advisory') });
    expect(advisory.stdout).toContain('Memory Remote is disabled; hydration gate is not required.');
    expect(advisory.stdout).toContain('adapter configured in advisory mode');
  });

  it('propagates the existing Phase-2 hydration gate failure before any lease-authority readiness probe', async () => {
    let failure: any;
    try {
      await execFileAsync('bash', [script], {
        env: {
          ...env('enforce', 49153),
          AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
          AGENT_CORE_MEMORY_REMOTE_OWNER: '',
          AGENT_CORE_MEMORY_REMOTE_REPO: '',
          AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID: '',
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure?.code).toBe(55);
    expect(String(failure?.stderr)).toContain('Memory Remote hydration requires owner to be configured');
    expect(String(failure?.stderr)).toContain('existing Phase-2 Memory Remote hydration gate rejected bridge mutation readiness');
    expect(String(failure?.stderr)).not.toContain('MEMORY_CONTEXT_LEASE_ENDPOINT_UNAVAILABLE');
  });

  it('fails enforce-mode mutation readiness with the exact preflight exit code when Agent Core lease authority is unreachable', async () => {
    let failure: any;
    try {
      await execFileAsync('bash', [script], { env: env('enforce', 49152) });
    } catch (error) {
      failure = error;
    }
    expect(failure?.code).toBe(56);
    expect(String(failure?.stderr)).toContain('MEMORY_CONTEXT_LEASE_ENDPOINT_UNAVAILABLE');
  });

  it('accepts enforce-mode startup only after a real loopback read-only lease-authority exchange', async () => {
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any>;
      expect(req.url).toBe('/internal/memory-context-lease');
      expect(body).toMatchObject({
        action: 'before',
        toolName: 'execute_command',
        input: { command: 'pwd' },
      });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        ok: true,
        mode: 'enforce',
        required: false,
        valid: true,
        mutationClass: 'shell_read_only',
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const port = (server.address() as AddressInfo).port;

    const result = await execFileAsync('bash', [script], { env: env('enforce', port) });
    expect(result.stdout).toContain('adapter prepared in enforce mode via verified local Agent Core authority');
  });
});
