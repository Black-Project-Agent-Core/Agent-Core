import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(pluginRoot, 'dist', 'server.js');

let base: string;
let root: string;
const authorityServers: Server[] = [];

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'codespace-mcp-'));
  root = path.join(base, 'repo');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'seed.txt'), 'seed value', 'utf8');
});

afterEach(async () => {
  await Promise.all(authorityServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await fs.rm(base, { recursive: true, force: true });
});

function transportEnvironment(overrides: Record<string, string> = {}): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return {
    ...env,
    NODE_ENV: 'test',
    CODESPACE_WORKSPACE_ROOT: root,
    CODESPACE_TEST_ALLOWED_BASE: base,
    CONTROL_PLANE_API_KEY: 'must-not-reach-shell',
    CODESPACE_MEMORY_LIFECYCLE_MODE: 'disabled',
    CODESPACE_AGENT_CORE_MEMORY_LEASE_URL: '',
    CODESPACE_AGENT_CORE_SHARED_MEMORY_URL: '',
    ...overrides,
  };
}

describe('codespace MCP stdio server', () => {
  it('initializes, exposes the bounded tool surface, and executes real workspace operations', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
      env: transportEnvironment(),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'codespace-test', version: '1.0.0' });

    try {
      await client.connect(transport);

      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name);
      expect(names).toHaveLength(19);
      expect(names).toEqual(expect.arrayContaining([
        'codespace_status',
        'list_directory',
        'read_file',
        'read_multiple_files',
        'search_files',
        'write_file',
        'edit_file',
        'execute_command',
        'start_process',
        'read_process_output',
        'stop_process',
        'list_processes',
        'memory_status',
        'memory_open_context',
        'memory_search',
        'memory_get',
        'memory_explain',
        'memory_remember_more',
        'memory_checkpoint',
      ]));

      const readSeed = await client.callTool({
        name: 'read_file',
        arguments: { path: 'seed.txt' },
      });
      expect(JSON.stringify(readSeed)).toContain('seed value');

      await client.callTool({
        name: 'write_file',
        arguments: { path: 'created.txt', content: 'hello', mode: 'rewrite' },
      });
      await client.callTool({
        name: 'edit_file',
        arguments: {
          path: 'created.txt',
          oldString: 'hello',
          newString: 'world',
          expectedReplacements: 1,
        },
      });
      const edited = await client.callTool({
        name: 'read_file',
        arguments: { path: 'created.txt' },
      });
      expect(JSON.stringify(edited)).toContain('world');

      const pwd = await client.callTool({
        name: 'execute_command',
        arguments: { command: 'pwd' },
      });
      expect(JSON.stringify(pwd)).toContain(root);

      const credentialProbe = await client.callTool({
        name: 'execute_command',
        arguments: { command: 'printf %s "${CONTROL_PLANE_API_KEY-unset}"' },
      });
      expect(JSON.stringify(credentialProbe)).toContain('unset');
      expect(JSON.stringify(credentialProbe)).not.toContain('must-not-reach-shell');
    } finally {
      await client.close().catch(() => undefined);
    }
  });

  it('opens shared Agent Core memory context and uses its returned lease for the existing mutation tools', async () => {
    const validLease = 'mcl1.shared-open-context.ciphertext.auth-tag';
    const sharedCalls: Array<Record<string, unknown>> = [];
    const leaseCalls: Array<Record<string, unknown>> = [];
    const authority = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any>;
      res.setHeader('content-type', 'application/json');
      if (req.url === '/internal/codespace-memory') {
        sharedCalls.push(body);
        if (body.action !== 'open_context') {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'CODESPACE_SHARED_MEMORY_ACTION_INVALID' }));
          return;
        }
        res.end(JSON.stringify({
          ok: true,
          result: {
            routeContextId: '11111111-1111-4111-8111-111111111111',
            memoryContextId: '22222222-2222-4222-8222-222222222222',
            continuityTaskId: '33333333-3333-4333-8333-333333333333',
            continuityTurnId: '44444444-4444-4444-8444-444444444444',
            memoryContextLease: validLease,
            memoryContextLeaseExpiresAt: '2026-09-01T12:00:00.000Z',
            memorySummary: [{ memoryId: '55555555-5555-4555-8555-555555555555', revisionId: '66666666-6666-4666-8666-666666666666', canonicalKey: 'decision.shared', valueText: 'same Agent Core memory' }],
            memoryLifecycle: { mode: 'enforce', postflightState: 'OPEN' },
          },
        }));
        return;
      }
      if (req.url === '/internal/memory-context-lease') {
        leaseCalls.push(body);
        if (body.lease !== validLease) {
          res.statusCode = 428;
          res.end(JSON.stringify({ error: { code: 'MEMORY_PREFLIGHT_REQUIRED' } }));
          return;
        }
        res.end(JSON.stringify({
          ok: true,
          mode: 'enforce',
          required: true,
          valid: true,
          mutationClass: 'agent_core_mutation',
          ...(body.action === 'after' ? { postflightState: 'POSTFLIGHT_PENDING' } : {}),
        }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not_found' }));
    });
    await new Promise<void>((resolve) => authority.listen(0, '127.0.0.1', resolve));
    authorityServers.push(authority);
    const port = (authority.address() as AddressInfo).port;

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
      env: transportEnvironment({
        CODESPACE_MEMORY_LIFECYCLE_MODE: 'enforce',
        CODESPACE_AGENT_CORE_MEMORY_LEASE_URL: `http://127.0.0.1:${port}/internal/memory-context-lease`,
        CODESPACE_AGENT_CORE_SHARED_MEMORY_URL: `http://127.0.0.1:${port}/internal/codespace-memory`,
      }),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'codespace-shared-memory-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      const opened = await client.callTool({
        name: 'memory_open_context',
        arguments: { task: 'Continue shared memory integration' },
      });
      expect(opened.isError).not.toBe(true);
      const openedBody = JSON.parse(String((opened.content as any[])[0].text));
      expect(openedBody.memoryContextLease).toBe(validLease);
      expect(openedBody.memorySummary[0].canonicalKey).toBe('decision.shared');

      const written = await client.callTool({
        name: 'write_file',
        arguments: {
          path: 'shared-memory-write.txt',
          content: 'written under shared memory lease',
          memoryContextLease: openedBody.memoryContextLease,
        },
      });
      expect(written.isError).not.toBe(true);
      expect(JSON.stringify(written)).toContain('POSTFLIGHT_PENDING');
      expect(JSON.stringify(written)).not.toContain(validLease);
      await expect(fs.readFile(path.join(root, 'shared-memory-write.txt'), 'utf8'))
        .resolves.toBe('written under shared memory lease');

      expect(sharedCalls).toEqual([{ action: 'open_context', workspaceRoot: root, task: 'Continue shared memory integration' }]);
      expect(leaseCalls.map((call) => call.action)).toEqual(['before', 'after']);
      expect(leaseCalls.every((call) => call.lease === validLease)).toBe(true);
      expect(leaseCalls.every((call) => call.workspaceRoot === root)).toBe(true);
    } finally {
      await client.close().catch(() => undefined);
    }
  });

  it('enforces opaque memory leases around direct workspace mutations without leaking the token', async () => {
    const validLease = 'mcl1.integration-opaque.ciphertext.auth-tag';
    const calls: Array<Record<string, unknown>> = [];
    let failAfter = false;
    const authority = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any>;
      calls.push(body);
      res.setHeader('content-type', 'application/json');
      if (body.action === 'after' && failAfter) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: { code: 'MEMORY_POSTFLIGHT_REQUIRED', message: validLease } }));
        return;
      }
      if (body.toolName === 'execute_command' && body.input?.command === 'pwd') {
        res.end(JSON.stringify({ ok: true, mode: 'enforce', required: false, valid: true, mutationClass: 'shell_read_only' }));
        return;
      }
      if (body.lease !== validLease) {
        res.statusCode = 428;
        res.end(JSON.stringify({ error: { code: 'MEMORY_PREFLIGHT_REQUIRED', message: validLease } }));
        return;
      }
      res.end(JSON.stringify({
        ok: true,
        mode: 'enforce',
        required: true,
        valid: true,
        mutationClass: 'agent_core_mutation',
        ...(body.action === 'after' ? { postflightState: 'POSTFLIGHT_PENDING' } : {}),
      }));
    });
    await new Promise<void>((resolve) => authority.listen(0, '127.0.0.1', resolve));
    authorityServers.push(authority);
    const endpoint = `http://127.0.0.1:${(authority.address() as AddressInfo).port}/internal/memory-context-lease`;

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
      env: transportEnvironment({
        CODESPACE_MEMORY_LIFECYCLE_MODE: 'enforce',
        CODESPACE_AGENT_CORE_MEMORY_LEASE_URL: endpoint,
      }),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'codespace-lease-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      for (const toolName of ['write_file', 'edit_file', 'execute_command', 'start_process']) {
        const tool = tools.tools.find((item) => item.name === toolName)!;
        expect((tool.inputSchema as any).properties.memoryContextLease).toBeDefined();
      }
      expect((tools.tools.find((item) => item.name === 'stop_process')!.inputSchema as any).properties.memoryContextLease).toBeUndefined();

      const blockedPath = path.join(root, 'blocked.txt');
      const blocked = await client.callTool({
        name: 'write_file',
        arguments: { path: 'blocked.txt', content: 'must not exist' },
      });
      expect(blocked.isError).toBe(true);
      expect(JSON.stringify(blocked)).toContain('MEMORY_PREFLIGHT_REQUIRED');
      await expect(fs.access(blockedPath)).rejects.toThrow();

      const allowed = await client.callTool({
        name: 'write_file',
        arguments: { path: 'allowed.txt', content: 'committed', memoryContextLease: validLease },
      });
      expect(allowed.isError).not.toBe(true);
      expect(JSON.stringify(allowed)).toContain('POSTFLIGHT_PENDING');
      expect(JSON.stringify(allowed)).not.toContain(validLease);
      await expect(fs.readFile(path.join(root, 'allowed.txt'), 'utf8')).resolves.toBe('committed');

      const callsBeforeFailedEdit = calls.length;
      const failedEdit = await client.callTool({
        name: 'edit_file',
        arguments: {
          path: 'allowed.txt',
          oldString: 'not-present',
          newString: 'never-written',
          expectedReplacements: 1,
          memoryContextLease: validLease,
        },
      });
      expect(failedEdit.isError).toBe(true);
      const failedEditCalls = calls.slice(callsBeforeFailedEdit).filter((item) => item.toolName === 'edit_file');
      expect(failedEditCalls).toHaveLength(1);
      expect(failedEditCalls[0]?.action).toBe('before');
      expect(calls.slice(callsBeforeFailedEdit).some((item) => item.toolName === 'edit_file' && item.action === 'after')).toBe(false);

      const started = await client.callTool({
        name: 'start_process',
        arguments: { command: 'sleep 10', memoryContextLease: validLease },
      });
      expect(started.isError).not.toBe(true);
      expect(JSON.stringify(started)).not.toContain(validLease);
      const startedBody = JSON.parse(String((started.content as any[])[0].text));
      expect(startedBody.command).toBe('sleep 10');
      expect(startedBody).toHaveProperty('sessionId');
      const listed = await client.callTool({ name: 'list_processes', arguments: {} });
      expect(JSON.stringify(listed)).not.toContain(validLease);
      await client.callTool({ name: 'stop_process', arguments: { sessionId: startedBody.sessionId } });

      const pwd = await client.callTool({ name: 'execute_command', arguments: { command: 'pwd' } });
      expect(pwd.isError).not.toBe(true);
      expect(JSON.stringify(pwd)).toContain(root);

      failAfter = true;
      const committedError = await client.callTool({
        name: 'write_file',
        arguments: { path: 'committed-before-postflight-error.txt', content: 'factual local write', memoryContextLease: validLease },
      });
      expect(committedError.isError).toBe(true);
      expect(JSON.stringify(committedError)).toContain('MEMORY_POSTFLIGHT_REQUIRED');
      expect(JSON.stringify(committedError)).toContain('mutationCommitted');
      expect(JSON.stringify(committedError)).not.toContain(validLease);
      await expect(fs.readFile(path.join(root, 'committed-before-postflight-error.txt'), 'utf8')).resolves.toBe('factual local write');

      expect(calls.some((item) => item.action === 'before' && item.toolName === 'write_file' && item.lease === undefined)).toBe(true);
      expect(calls.some((item) => item.action === 'before' && item.toolName === 'write_file' && item.lease === validLease)).toBe(true);
      expect(calls.some((item) => item.action === 'after' && item.toolName === 'write_file' && item.lease === validLease)).toBe(true);
      for (const call of calls.filter((item) => item.toolName === 'write_file')) {
        expect(call.input).toEqual({});
        expect(JSON.stringify(call)).not.toContain('committed');
        expect(JSON.stringify(call)).not.toContain('factual local write');
      }
    } finally {
      await client.close().catch(() => undefined);
    }
  });


  it('keeps advisory lifecycle mode non-blocking when Agent Core lease authority is unavailable', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
      env: transportEnvironment({
        CODESPACE_MEMORY_LIFECYCLE_MODE: 'advisory',
        CODESPACE_AGENT_CORE_MEMORY_LEASE_URL: 'http://127.0.0.1:9/internal/memory-context-lease',
        CODESPACE_MEMORY_LEASE_TIMEOUT_MS: '100',
      }),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'codespace-advisory-lease-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: 'write_file',
        arguments: { path: 'advisory-write.txt', content: 'allowed with explicit advisory degradation' },
      });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result)).toContain('MEMORY_POSTFLIGHT_REQUIRED');
      expect(JSON.stringify(result)).toContain('advisory');
      await expect(fs.readFile(path.join(root, 'advisory-write.txt'), 'utf8'))
        .resolves.toBe('allowed with explicit advisory degradation');
    } finally {
      await client.close().catch(() => undefined);
    }
  });

});
