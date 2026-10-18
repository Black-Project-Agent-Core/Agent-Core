import { createServer, type Server } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [],
} }));
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { memoryTaskFixture } from './memory/memory-task-test-utils.js';
import { acknowledgeControllerContract } from './controller-contract-fixture.js';

const roots: string[] = [], servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve('runtime/tmp') || !path.basename(root).startsWith('memory-task-')) throw Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const f = await memoryTaskFixture(); roots.push(f.root);
  const handler = createMcpHttpHandler({ memoryExperience: f.memory as any, memoryService: f.memory as any,
    externalControllerLearning: f.external, learningService: f.learning });
  const server = createServer((req, res) => { void handler(req, res, { id: 'selector-owner' } as any); });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No listener');
  const raw = async (name: string, args: unknown, header: string) => {
    const response = await fetch('http://127.0.0.1:' + address.port + '/mcp', { method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json,text/event-stream', 'x-agent-core-session-id': header },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    expect(response.ok).toBe(true);
    const text = await response.text(), event = text.split('\n').find(line => line.startsWith('data:'));
    const rpc = JSON.parse(event ? event.slice(5) : text);
    expect(rpc.error).toBeUndefined();
    return rpc.result;
  };
  const call = async (args: Record<string, unknown>, header: string) => {
    // A new receipt each time intentionally does not create a new Learning namespace.
    const contractSession = await acknowledgeControllerContract((name, input) => raw(name, input, header));
    return raw('controller_learning', { ...args, contractSession }, header);
  };
  const start = async (key: string, header: string) => {
    const result = await call({ action: 'episode', episodeOperation: 'start', taskKey: key, workspace: 'agent-core' }, header);
    expect(result.isError).not.toBe(true); return JSON.parse(result.content[0].text);
  };
  const state = async () => JSON.parse(await readFile(path.join(f.root, 'external', 'external-controller.json'), 'utf8'));
  return { call, start, state };
}

describe('external Learning task selector through HTTP admission', () => {
  it('refuses task A after a shared transport rotates to B, even with separately acknowledged receipts', async () => {
    const f = await fixture();
    const a = await f.start('A', 'shared'), b = await f.start('B', 'shared');
    const result = await f.call({ action: 'episode', episodeOperation: 'verify', taskId: a.id,
      episodeOutcome: 'failed', verificationRef: 'verification:no-registered-oracle' }, 'shared');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('EXTERNAL_EPISODE_VERIFICATION_TASK_MISMATCH');
    const state = await f.state();
    for (const task of [a, b]) {
      const stored = state.episodes.find((item: any) => item.id === task.id);
      expect(stored.terminalOutcome).toBeUndefined(); expect(stored.closedAt).toBeUndefined();
      expect(stored.metrics.verifications).toBe(0);
      expect(stored.events.filter((event: any) => event.kind === 'verification')).toHaveLength(0);
    }
  });

  it('verifies only the requested current task when transports have distinct session headers', async () => {
    const f = await fixture();
    const a = await f.start('A', 'session-a'), b = await f.start('B', 'session-b');
    const result = await f.call({ action: 'episode', episodeOperation: 'verify', taskId: a.id,
      episodeOutcome: 'failed', verificationRef: 'verification:no-registered-oracle' }, 'session-a');
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ id: a.id, terminalOutcome: 'failed', verificationStatus: 'unavailable' });
    const state = await f.state(), other = state.episodes.find((item: any) => item.id === b.id);
    expect(other.terminalOutcome).toBeUndefined(); expect(other.metrics.verifications).toBe(0);
    expect(other.events.filter((event: any) => event.kind === 'verification')).toHaveLength(0);
  });
});
