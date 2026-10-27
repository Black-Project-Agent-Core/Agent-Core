import { createServer, type Server } from 'node:http';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/v4';
import { ControllerContractGate } from '../src/mcp/controller-contract.js';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { acknowledgeControllerContract } from './controller-contract-fixture.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';
import { toolHistory } from '../src/rdc/utils/toolHistory.js';
import { usageTracker } from '../src/rdc/utils/usageTracker.js';
import { configManager } from '../src/rdc/config-manager.js';

const closers: Array<() => Promise<void>> = [];
beforeEach(() => {
  vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
  vi.spyOn(activityTracker, 'captureFailure').mockImplementation(() => undefined as any);
  vi.spyOn(toolHistory, 'addCall').mockReturnValue(true);
  vi.spyOn(usageTracker, 'trackSuccess').mockResolvedValue(undefined);
  vi.spyOn(usageTracker, 'trackFailure').mockResolvedValue(undefined);
  vi.spyOn(configManager, 'getConfig').mockResolvedValue({ allowedDirectories: [] });
});
afterEach(async () => { for (const close of closers.splice(0)) await close(); vi.restoreAllMocks(); });
const text = (value: any) => value.content.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n');
async function connected(key?: any, runtime: any = {}) {
  const server = createAgentCoreMcpServer(key, runtime);
  const client = new Client({ name: 'contract-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  closers.push(async () => { await client.close(); await server.close(); });
  return { server, client, call: (name: string, args: any) => client.callTool({ name, arguments: args }) };
}

describe('controller contract receipts', () => {
  it('requires acknowledgement of the exact content and isolates receipts and owners', () => {
    const gate = new ControllerContractGate(() => '# Session rules\nRead Memory first.');
    const first = gate.read('owner-a'), second = gate.read('owner-a');
    expect(first.contractSession).not.toBe(second.contractSession);
    expect(() => gate.assertReady('owner-a', undefined)).toThrow('CONTRACT_READ_REQUIRED');
    expect(() => gate.assertReady('owner-a', first.contractSession)).toThrow('CONTRACT_READ_REQUIRED');
    expect(() => gate.acknowledge('owner-a', first.contractSession, 'wrong')).toThrow('CONTRACT_REVISION_MISMATCH');
    gate.acknowledge('owner-a', first.contractSession, first.digest);
    expect(() => gate.assertReady('owner-a', first.contractSession)).not.toThrow();
    expect(() => gate.assertReady('owner-a', second.contractSession)).toThrow('CONTRACT_READ_REQUIRED');
    expect(() => gate.assertReady('owner-b', first.contractSession)).toThrow('CONTRACT_READ_REQUIRED');
  });

  it('invalidates edited, unreadable and empty contracts until a fresh handshake', () => {
    let content = '# Original';
    const gate = new ControllerContractGate(() => { if (content === 'missing') throw Error('ENOENT'); return content; });
    const first = gate.read('a'); gate.acknowledge('a', first.contractSession, first.digest);
    content = '# Updated';
    expect(() => gate.assertReady('a', first.contractSession)).toThrow('CONTRACT_REVISION_CHANGED');
    const second = gate.read('a'); gate.acknowledge('a', second.contractSession, second.digest);
    content = 'missing';
    expect(() => gate.assertReady('a', second.contractSession)).toThrow('CONTRACT_UNAVAILABLE');
    expect(() => gate.read('a')).toThrow();
    content = '  ';
    expect(() => gate.read('a')).toThrow('CONTRACT_UNAVAILABLE');
    content = '# Updated';
    expect(() => gate.assertReady('a', second.contractSession)).toThrow('CONTRACT_READ_REQUIRED');
  });

  it('keeps receipts across idle time, retains active ones under churn and bounds retained sessions', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const gate = new ControllerContractGate(() => '# Rules');
    const first = gate.read('a'); gate.acknowledge('a', first.contractSession, first.digest);
    now.mockReturnValue(31 * 60_000); expect(() => gate.assertReady('a', first.contractSession)).not.toThrow();
    now.mockReturnValue(3 * 24 * 60 * 60_000); expect(() => gate.assertReady('a', first.contractSession)).not.toThrow();
    for (let i = 0; i < 300; i++) { gate.read('a'); gate.assertReady('a', first.contractSession); }
    const oldest = gate.read('a'); gate.acknowledge('a', oldest.contractSession, oldest.digest);
    for (let i = 0; i < 128; i++) gate.read('a');
    expect(() => gate.assertReady('a', oldest.contractSession)).toThrow('CONTRACT_READ_REQUIRED');
    const restarted = new ControllerContractGate(() => '# Rules');
    expect(() => restarted.assertReady('a', first.contractSession)).toThrow('CONTRACT_READ_REQUIRED');
  });
});

describe('external MCP admission', () => {
  it('blocks reads, Memory and mutations including origin ui before downstream dispatch', async () => {
    const safety = { runMutation: vi.fn(async (_id, _tool, _args, _ctx, execute) => execute()) };
    const memory = { list: vi.fn(), read: vi.fn() };
    const f = await connected(undefined, { memoryService: memory, mutationSafety: safety });
    for (const [name, args] of [
      ['get_config', {}], ['memory_list', {}], ['memory_read', { id: 'fixture' }],
      ['write_file', { path: 'never-created', content: 'no', origin: 'ui' }],
    ] as const) {
      const result = await f.call(name, args);
      expect(result.isError, name).toBe(true); expect(text(result), name).toContain('CONTRACT_READ_REQUIRED');
    }
    expect(safety.runMutation).not.toHaveBeenCalled(); expect(memory.list).not.toHaveBeenCalled();
    expect(memory.read).not.toHaveBeenCalled(); expect(toolHistory.addCall).not.toHaveBeenCalled();
    const contractSession = await acknowledgeControllerContract(f.call);
    expect((await f.call('get_config', { contractSession })).isError).not.toBe(true);
    expect(JSON.stringify(vi.mocked(toolHistory.addCall).mock.calls)).not.toContain(contractSession);
    expect(JSON.stringify(vi.mocked(activityTracker.record).mock.calls)).not.toContain(contractSession);
  });

  it('strips the transport receipt before mutation admission, refinements and execution', async () => {
    const gate = new ControllerContractGate(() => '# Rules');
    const safety = { runMutation: vi.fn(async (_id, _tool, _args, _ctx, execute) => execute()) };
    const f = await connected(undefined, { controllerContract: { gate, binding: 'a' }, mutationSafety: safety });
    const execute = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));
    f.server.registerTool('fixture_probe', { inputSchema: z.strictObject({ value: z.string() }).refine(value => value.value === 'yes') }, execute);
    const contractSession = await acknowledgeControllerContract(f.call);
    expect((await f.call('fixture_probe', { value: 'yes', contractSession })).isError).not.toBe(true);
    expect(execute.mock.calls[0]?.[0]).toEqual({ value: 'yes' });
    expect(JSON.stringify(safety.runMutation.mock.calls)).not.toContain(contractSession);
    const invalid = await f.call('fixture_probe', { value: 'no', contractSession }).catch(() => null);
    expect(invalid === null || invalid.isError === true).toBe(true); expect(execute).toHaveBeenCalledOnce();
  });

  it('delivers the complete contract outside ordinary result budgets and never widens grants', async () => {
    const content = '# Complete contract\n' + 'Full instruction content.\n'.repeat(16000) + 'END OF CONTRACT';
    const f = await connected({ id: 'restricted', toolGrant: { version: 1, allowedTools: [] } },
      { controllerContract: { gate: new ControllerContractGate(() => content), binding: 'restricted' } });
    expect((await f.client.listTools()).tools.map(tool => tool.name)).toEqual(['controller_contract']);
    const read = await f.call('controller_contract', { action: 'read' });
    expect(text(read).split('\n\nAGENT CORE CONTRACT RECEIPT\n')[0]).toBe(content);
    await acknowledgeControllerContract(f.call);
    await expect(f.call('get_config', {})).rejects.toThrow(/disabled|GRANT_DENIED/);
  });
});

it('retains receipts across fresh HTTP servers while isolating headers, owners and headerless chats', async () => {
  const external = { bootstrapInstructions: vi.fn(async () => 'Synthetic continuity context'),
    captureToolInvocationContext: vi.fn(async () => undefined), recordToolOutcome: vi.fn(async () => 'unbound') };
  const handler = createMcpHttpHandler({ externalControllerLearning: external as any });
  const server: Server = createServer((req, res) => { void handler(req, res, { id: req.headers['x-fixture-owner'] ?? 'owner-a' } as any); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  closers.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); if (!address || typeof address === 'string') throw Error('LISTENER_NOT_BOUND');
  const call = (owner: string, session?: string) => async (name: string, args: any) => {
    const response = await fetch('http://127.0.0.1:' + address.port + '/mcp', { method: 'POST', headers: {
      'content-type': 'application/json', accept: 'application/json,text/event-stream', 'x-fixture-owner': owner,
      ...(session ? { 'x-agent-core-session-id': session } : {}),
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    expect(response.ok).toBe(true);
    const body = await response.text(), line = body.split('\n').find(value => value.startsWith('data:'));
    const rpc = JSON.parse(line ? line.slice(5) : body); expect(rpc.error).toBeUndefined(); return rpc.result;
  };
  const a = call('owner-a', 'chat-a');
  expect(text(await a('get_config', {}))).toContain('CONTRACT_READ_REQUIRED');
  expect(external.bootstrapInstructions).not.toHaveBeenCalled();
  expect(external.captureToolInvocationContext).not.toHaveBeenCalled();
  const read = await a('controller_contract', { action: 'read' });
  expect(read.isError).not.toBe(true);
  expect(external.bootstrapInstructions).not.toHaveBeenCalled();
  await a('controller_contract', { action: 'acknowledge', contractSession: 'wrong', digest: 'wrong' });
  expect(external.bootstrapInstructions).not.toHaveBeenCalled();
  const contractSession = await acknowledgeControllerContract(a);
  expect(external.bootstrapInstructions).toHaveBeenCalledOnce();
  expect((await a('get_config', { contractSession })).isError).not.toBe(true);
  for (const other of [call('owner-b', 'chat-a'), call('owner-a', 'chat-b'), call('owner-a')])
    expect(text(await other('get_config', { contractSession }))).toContain('CONTRACT_READ_REQUIRED');
  const headerless = call('owner-a'), token = await acknowledgeControllerContract(headerless);
  expect((await headerless('get_config', { contractSession: token })).isError).not.toBe(true);
  expect(text(await headerless('get_config', {}))).toContain('CONTRACT_READ_REQUIRED');
});
