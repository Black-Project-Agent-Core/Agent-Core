import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { resolvedIdentityOf } from '../scripts/verify/native-memory-reuse.mjs';

const execute = promisify(execFile);
const bridge = fileURLToPath(new URL('../scripts/external/native-chat-bridge.mjs', import.meta.url));
const identity = { providerId: 'openrouter', model: 'resolved-fixture' };

describe('Native chat CLI result projection', () => {
  it('bounds a truncated record after JSON escaping its preview', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ conversation: { id: 'fixture-chat' }, turns: [],
        messages: Array.from({ length: 10 }, (_, i) => ({ id: String(i), role: 'assistant', content: '\\'.repeat(20_000) })) }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('fixture listener unavailable');
      const { stdout } = await execute(process.execPath, [bridge, 'read', 'fixture-chat'], {
        env: { SystemRoot: process.env.SystemRoot, AGENT_CORE_UI_TOKEN: 'fixture-token', AGENT_CORE_PORT: String(address.port) },
        windowsHide: true, timeout: 5000, maxBuffer: 512 * 1024,
      });
      const records = stdout.trim().split(/\r?\n/);
      expect(JSON.parse(records[0]!)).toMatchObject({ type: 'conversation', truncated: true });
      expect(records.every(line => Buffer.byteLength(line) <= 128 * 1024)).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  it.each([
    { name: 'complete', modelIdentity: { observedCalls: 2, identities: [identity] }, resolved: identity },
    { name: 'missing', modelIdentity: undefined, resolved: null },
    { name: 'mixed', modelIdentity: { observedCalls: 2, identities: [identity, { ...identity, model: 'other-fixture' }] }, resolved: null },
  ])('preserves $name model identity evidence through the actual bridge', async ({ modelIdentity, resolved }) => {
    const token = 'isolated-bridge-fixture-token';
    const requests: Array<{ method?: string; url?: string; token: unknown }> = [];
    const server = createServer((request, response) => {
      requests.push({ method: request.method, url: request.url, token: request.headers['x-agent-core-ui-token'] });
      response.writeHead(200, { 'content-type': 'application/x-ndjson' });
      response.end(JSON.stringify({ type: 'result', result: {
        conversationId: 'fixture-chat', turnId: 'fixture-turn', taskId: 'fixture-task', status: 'finalized',
        providerId: 'openrouter', model: 'openrouter/free', response: 'fixture result password=not-a-real-password',
        metrics: { modelCalls: 2 }, modelIdentity, unprojected: 'fixture-private-field',
      } }) + '\n');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('fixture listener unavailable');
      const { stdout, stderr } = await execute(process.execPath, [bridge, 'send', 'fixture-chat',
        '--prompt', 'fixture prompt', '--client-request-id', 'fixture-request'], {
        env: { SystemRoot: process.env.SystemRoot, AGENT_CORE_UI_TOKEN: token,
          AGENT_CORE_PORT: String(address.port), AGENT_CORE_NATIVE_CHAT_TIMEOUT_MS: '5000' },
        windowsHide: true, timeout: 5_000, maxBuffer: 128 * 1024,
      });
      expect(stderr).toBe('');
      expect(stdout).not.toContain('not-a-real-password');
      const result = stdout.trim().split(/\r?\n/).map(line => JSON.parse(line)).find(row => row.type === 'result')?.result;
      expect(result?.modelIdentity).toEqual(modelIdentity);
      expect(result?.model).toBe('openrouter/free');
      expect(result).not.toHaveProperty('unprojected');
      expect(resolvedIdentityOf(result)).toEqual(resolved);
      expect(requests).toEqual([{ method: 'POST', url: '/agent/chat/conversations/fixture-chat/turns', token }]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('forwards --provider as the turn providerId and rejects a malformed one before sending', async () => {
    const bodies: any[] = [];
    const server = createServer((request, response) => {
      let raw = ''; request.on('data', chunk => { raw += chunk; });
      request.on('end', () => {
        bodies.push(JSON.parse(raw));
        response.writeHead(200, { 'content-type': 'application/x-ndjson' });
        response.end(JSON.stringify({ type: 'result', result: { conversationId: 'fixture-chat', status: 'finalized', response: 'ok' } }) + '\n');
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('fixture listener unavailable');
      const env = { SystemRoot: process.env.SystemRoot, AGENT_CORE_UI_TOKEN: 'isolated-bridge-fixture-token',
        AGENT_CORE_PORT: String(address.port), AGENT_CORE_NATIVE_CHAT_TIMEOUT_MS: '5000' };
      const run = (...extra: string[]) => execute(process.execPath, [bridge, 'send', 'fixture-chat', '--prompt', 'p',
        '--client-request-id', 'fixture-request', ...extra], { env, windowsHide: true, timeout: 5_000 });
      await run('--provider', 'atria');
      await run();
      await expect(run('--provider', 'bad provider')).rejects.toMatchObject({ stdout: expect.stringContaining('provider is invalid') });
      expect(bodies.map(body => body.providerId)).toEqual(['atria', undefined]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('forwards --model as the turn model only with --provider and rejects a malformed or unpinned one before sending', async () => {
    const bodies: any[] = [];
    const server = createServer((request, response) => {
      let raw = ''; request.on('data', chunk => { raw += chunk; });
      request.on('end', () => {
        bodies.push(JSON.parse(raw));
        response.writeHead(200, { 'content-type': 'application/x-ndjson' });
        response.end(JSON.stringify({ type: 'result', result: { conversationId: 'fixture-chat', status: 'finalized', response: 'ok' } }) + '\n');
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('fixture listener unavailable');
      const env = { SystemRoot: process.env.SystemRoot, AGENT_CORE_UI_TOKEN: 'isolated-bridge-fixture-token',
        AGENT_CORE_PORT: String(address.port), AGENT_CORE_NATIVE_CHAT_TIMEOUT_MS: '5000' };
      const run = (...extra: string[]) => execute(process.execPath, [bridge, 'send', 'fixture-chat', '--prompt', 'p',
        '--client-request-id', 'fixture-request', ...extra], { env, windowsHide: true, timeout: 5_000 });
      await run('--provider', 'anthropic', '--model', 'claude-haiku-5-5');
      await expect(run('--model', 'claude-haiku-5-5')).rejects.toMatchObject({ stdout: expect.stringContaining('model requires provider') });
      await expect(run('--provider', 'anthropic', '--model', 'bad model')).rejects.toMatchObject({ stdout: expect.stringContaining('model is invalid') });
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({ providerId: 'anthropic', model: 'claude-haiku-5-5' });
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
