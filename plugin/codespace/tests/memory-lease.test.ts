import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { CodespaceError } from '../src/errors.js';
import { CodespaceMemoryLeaseClient, parseMemoryLeaseRuntimeConfig } from '../src/memory-lease.js';

const servers: Server[] = [];

async function endpoint(handler: Parameters<typeof createServer>[0]) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/memory-context-lease`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('Codespace opaque Memory Context Lease adapter', () => {
  it('defaults standalone execution to disabled and accepts only the exact loopback Agent Core endpoint shape', () => {
    expect(parseMemoryLeaseRuntimeConfig({})).toEqual({ mode: 'disabled', endpoint: null, timeoutMs: 2000 });
    expect(parseMemoryLeaseRuntimeConfig({
      CODESPACE_MEMORY_LIFECYCLE_MODE: 'enforce',
      CODESPACE_AGENT_CORE_MEMORY_LEASE_URL: 'http://127.0.0.1:8765/internal/memory-context-lease',
    })).toEqual({
      mode: 'enforce',
      endpoint: 'http://127.0.0.1:8765/internal/memory-context-lease',
      timeoutMs: 2000,
    });
    for (const bad of [
      'https://127.0.0.1:8765/internal/memory-context-lease',
      'http://localhost:8765/internal/memory-context-lease',
      'http://0.0.0.0:8765/internal/memory-context-lease',
      'http://127.0.0.1:8765/mcp',
      'http://127.0.0.1:8765/internal/memory-context-lease?token=x',
      'http://user@127.0.0.1:8765/internal/memory-context-lease',
    ]) {
      expect(() => parseMemoryLeaseRuntimeConfig({
        CODESPACE_MEMORY_LIFECYCLE_MODE: 'enforce',
        CODESPACE_AGENT_CORE_MEMORY_LEASE_URL: bad,
      })).toThrow(/CODESPACE_AGENT_CORE_MEMORY_LEASE_URL/);
    }
  });

  it('transports an opaque lease only to the loopback authority and returns bounded before/after decisions', async () => {
    const lease = 'mcl1.opaque-token-fixture.never-decode-me.auth-tag';
    const seen: Array<Record<string, unknown>> = [];
    const url = await endpoint(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      seen.push(body);
      res.setHeader('content-type', 'application/json');
      if (body.action === 'before') {
        res.end(JSON.stringify({ ok: true, mode: 'enforce', required: true, valid: true, mutationClass: 'shell_mutation_or_unknown' }));
      } else {
        res.end(JSON.stringify({ ok: true, mode: 'enforce', required: true, valid: true, mutationClass: 'shell_mutation_or_unknown', postflightState: 'POSTFLIGHT_PENDING' }));
      }
    });
    const client = new CodespaceMemoryLeaseClient({ mode: 'enforce', endpoint: url, timeoutMs: 2000 });

    await expect(client.before({
      toolName: 'execute_command',
      workspaceRoot: '/workspaces/Agent-Core',
      lease,
      input: { command: 'npm test' },
    })).resolves.toMatchObject({ required: true, valid: true, mutationClass: 'shell_mutation_or_unknown' });
    await expect(client.after({
      toolName: 'execute_command',
      workspaceRoot: '/workspaces/Agent-Core',
      lease,
      input: { command: 'npm test' },
    })).resolves.toMatchObject({ postflightState: 'POSTFLIGHT_PENDING' });

    expect(seen).toEqual([
      { action: 'before', toolName: 'execute_command', workspaceRoot: '/workspaces/Agent-Core', lease, input: { command: 'npm test' } },
      { action: 'after', toolName: 'execute_command', workspaceRoot: '/workspaces/Agent-Core', lease, input: { command: 'npm test' } },
    ]);
  });

  it('fails closed before mutation in enforce mode without a lease or healthy authority, without leaking a supplied token', async () => {
    const missingEndpoint = new CodespaceMemoryLeaseClient({ mode: 'enforce', endpoint: null, timeoutMs: 20 });
    await expect(missingEndpoint.before({ toolName: 'write_file', workspaceRoot: '/workspaces/repo' }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });

    const token = 'mcl1.top-secret-token.ciphertext.tag';
    const unreachable = new CodespaceMemoryLeaseClient({
      mode: 'enforce',
      endpoint: 'http://127.0.0.1:9/internal/memory-context-lease',
      timeoutMs: 20,
    });
    let failure: unknown;
    try {
      await unreachable.before({ toolName: 'write_file', workspaceRoot: '/workspaces/repo', lease: token });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CodespaceError);
    expect(failure).toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    expect(JSON.stringify(failure)).not.toContain(token);
    expect(String((failure as Error).message)).not.toContain(token);
  });

  it('keeps advisory mode non-blocking when authority is unavailable without pretending the lease is valid', async () => {
    const client = new CodespaceMemoryLeaseClient({
      mode: 'advisory',
      endpoint: 'http://127.0.0.1:9/internal/memory-context-lease',
      timeoutMs: 20,
    });
    await expect(client.before({ toolName: 'write_file', workspaceRoot: '/workspaces/repo' })).resolves.toEqual({
      mode: 'advisory', required: true, valid: false, mutationClass: 'authority_unavailable', advisoryCode: 'MEMORY_PREFLIGHT_REQUIRED',
    });
  });

  it('reports post-mutation authority failure truthfully with mutationCommitted and never embeds the lease in the error', async () => {
    const token = 'mcl1.post-mutation-secret.ciphertext.tag';
    const url = await endpoint((_req, res) => {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'MEMORY_POSTFLIGHT_REQUIRED', message: `do not relay ${token}` } }));
    });
    const client = new CodespaceMemoryLeaseClient({ mode: 'enforce', endpoint: url, timeoutMs: 2000 });
    let failure: unknown;
    try {
      await client.after({ toolName: 'write_file', workspaceRoot: '/workspaces/repo', lease: token });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: 'MEMORY_POSTFLIGHT_REQUIRED',
      details: { mutationCommitted: true },
    });
    expect(JSON.stringify(failure)).not.toContain(token);
    expect(String((failure as Error).message)).not.toContain(token);
  });
});
