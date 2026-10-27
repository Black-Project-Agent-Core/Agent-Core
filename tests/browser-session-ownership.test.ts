import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentCoreMcpServer, type AgentCoreMcpRuntime } from '../src/mcp/server.js';
import { BrowserControlService, browserControlService } from '../src/rdc/browser-control/service.js';
import { OpenBrowserUseTransport } from '../src/rdc/browser-control/open-browser-use.js';
import { toolHistory } from '../src/rdc/utils/toolHistory.js';
import { usageTracker } from '../src/rdc/utils/usageTracker.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';
import { attachControllerContract } from './controller-contract-fixture.js';

const PAGE = { url: 'https://example.test/owned', title: 'Owned task', text: 'Synthetic page',
  actions: [{ id: 'wait', kind: 'wait', label: 'Wait' }], marker: ['stable'], page_key: ['stable'],
  guards: {}, omitted_actions: 0, control_states: { items: [], total: 0 },
  document_key: ['document'], focus_key: null, keyboard_safe: false };
const closers: Array<() => Promise<void>> = [];
const transports: Array<{ send: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }> = [];
let service: BrowserControlService;

beforeEach(() => {
  vi.spyOn(toolHistory, 'addCall').mockReturnValue(true);
  vi.spyOn(usageTracker, 'trackSuccess').mockResolvedValue(undefined);
  vi.spyOn(usageTracker, 'trackFailure').mockResolvedValue(undefined);
  vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
  vi.spyOn(activityTracker, 'captureFailure').mockImplementation(() => undefined as any);
  service = new BrowserControlService();
  for (const name of ['open', 'observe', 'act', 'conversation', 'status', 'close', 'assertOwner'] as const)
    vi.spyOn(browserControlService, name).mockImplementation(service[name].bind(service) as any);
  vi.spyOn(OpenBrowserUseTransport, 'connect').mockImplementation(async (_root, _session, _deps, background) => {
    let closed = false;
    const client = { tabId: 100 + transports.length, info: { version: '1.1.0' }, background,
      get closed() { return closed; },
      open: vi.fn(async () => undefined),
      send: vi.fn(async (method: string) => {
        if (method !== 'Runtime.evaluate') throw new Error('Unexpected fixture command: ' + method);
        return { result: { value: structuredClone(PAGE) } };
      }),
      dispose: vi.fn(async () => { closed = true; return { tabClosed: true, browserRetained: true }; }),
      close: () => { closed = true; },
    };
    transports.push(client);
    return client as unknown as OpenBrowserUseTransport;
  });
});

afterEach(async () => {
  try {
    await service.closeAll();
    for (const close of closers.splice(0).reverse()) await close();
  } finally { transports.length = 0; vi.restoreAllMocks(); }
});

async function connected(runtime: AgentCoreMcpRuntime, principal?: { id: string }) {
  const server = createAgentCoreMcpServer(principal, runtime);
  const ai = new Client({ name: 'browser-owner-fixture', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  closers.push(async () => { await ai.close(); await server.close(); });
  await server.connect(serverTransport); await ai.connect(clientTransport);
  if (!runtime.nativeTaskId) await attachControllerContract(ai);
  const raw = (args: Record<string, unknown>) => ai.callTool({ name: 'browser_control', arguments: args }) as Promise<any>;
  const call = async (args: Record<string, unknown>) => {
    const result = await raw(args);
    if (result.isError) throw new Error(result.content.find((part: any) => part.type === 'text')?.text);
    return result.structuredContent ?? JSON.parse(result.content.find((part: any) => part.type === 'text').text);
  };
  return { raw, call };
}
type Peer = Awaited<ReturnType<typeof connected>>;
const native = (taskId: string, workspace = 'agent-core') => connected({ nativeTaskId: taskId, nativeWorkspace: workspace });
const open = (peer: Peer) => peer.call({ action: 'open', url: PAGE.url, headless: true });
const sessions = async (peer: Peer) => (await peer.call({ action: 'status' })).sessions;

async function refusesForeign(peer: Peer, sessionId: string, observationId: string,
  spoof: Record<string, unknown> = {}, conversation = false) {
  const state = service.status();
  const effects = transports.map(client => [client.send.mock.calls.length, client.dispose.mock.calls.length]);
  const requests = [
    { action: 'observe', sessionId },
    { action: 'act', sessionId, observationId, actionId: 'wait' },
    { action: 'close', sessionId },
    ...(conversation ? [
      { action: 'conversation_read', sessionId },
    ] : []),
  ];
  for (const args of requests)
    await expect(peer.call({ ...args, ...spoof })).rejects.toThrow('BROWSER_CONTROL_SESSION_NOT_FOUND');
  expect(service.status()).toEqual(state);
  expect(transports.map(client => [client.send.mock.calls.length, client.dispose.mock.calls.length])).toEqual(effects);
}

describe('browser session ownership through the actual MCP boundary', () => {
  it('isolates Native tasks and workspaces even when JSON claims the target owner and task', async () => {
    const a = await native('native-a'), b = await native('native-b'), otherWorkspace = await native('native-a', 'other-workspace');
    const ownedA = await open(a), ownedB = await open(b);
    const observedA = await a.call({ action: 'observe', sessionId: ownedA.sessionId });
    const observedB = await b.call({ action: 'observe', sessionId: ownedB.sessionId });
    const targetOwner = vi.mocked(browserControlService.open).mock.calls[0]![2]!.owner;
    expect(await sessions(a)).toEqual([expect.objectContaining({ sessionId: ownedA.sessionId })]);
    expect(await sessions(b)).toEqual([expect.objectContaining({ sessionId: ownedB.sessionId })]);
    expect(await sessions(otherWorkspace)).toEqual([]);
    await refusesForeign(a, ownedB.sessionId, observedB.observationId);
    await refusesForeign(b, ownedA.sessionId, observedA.observationId, {
      owner: targetOwner, taskId: 'native-a', nativeTaskId: 'native-a', workspace: 'agent-core', nativeWorkspace: 'agent-core',
      invocationContext: { taskId: 'native-a', workspace: 'agent-core' },
    });
    await refusesForeign(otherWorkspace, ownedA.sessionId, observedA.observationId);
    expect(await b.call({ action: 'status', owner: targetOwner, taskId: 'native-a', workspace: 'agent-core' }))
      .toMatchObject({ sessions: [expect.objectContaining({ sessionId: ownedB.sessionId })] });
    expect(await a.call({ action: 'act', sessionId: ownedA.sessionId,
      observationId: observedA.observationId, actionId: 'wait' })).toMatchObject({ executed: 'wait', actionCount: 1 });
  });

  it('allows another MCP server for the same Native task and workspace to continue and close its session', async () => {
    const first = await native('continuing-task'), continuation = await native('continuing-task');
    const owned = await open(first);
    expect(await sessions(continuation)).toEqual([expect.objectContaining({ sessionId: owned.sessionId })]);
    const observed = await continuation.call({ action: 'observe', sessionId: owned.sessionId });
    expect(await continuation.call({ action: 'act', sessionId: owned.sessionId,
      observationId: observed.observationId, actionId: 'wait' })).toMatchObject({ executed: 'wait', actionCount: 1 });
    expect(await first.call({ action: 'status' })).toMatchObject({ sessions: [expect.objectContaining({ actionCount: 1 })] });
    expect(await continuation.call({ action: 'close', sessionId: owned.sessionId })).toMatchObject({ closed: true, tabClosed: true });
    expect(await sessions(first)).toEqual([]);
    expect(transports[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  it('separates external and Native sessions and refuses every external conversation operation on a Native session', async () => {
    const n = await native('native-task');
    const external = await connected({ controllerSessionId: 'external-controller' }, { id: 'external-owner' });
    const nativeSession = await open(n), externalSession = await open(external);
    const nativeObservation = await n.call({ action: 'observe', sessionId: nativeSession.sessionId });
    const externalObservation = await external.call({ action: 'observe', sessionId: externalSession.sessionId });
    await refusesForeign(n, externalSession.sessionId, externalObservation.observationId);
    await refusesForeign(external, nativeSession.sessionId, nativeObservation.observationId, {}, true);
    expect(await sessions(n)).toEqual([expect.objectContaining({ sessionId: nativeSession.sessionId })]);
    expect(await sessions(external)).toEqual([expect.objectContaining({ sessionId: externalSession.sessionId })]);
    const state = service.status();
    const reads = transports.map(client => client.send.mock.calls.length);
    for (const action of ['conversation_read']) {
      const result = await n.raw({ action, sessionId: externalSession.sessionId });
      expect(result.isError).toBe(true);
    }
    for (const spoof of [{ owner: 'native-task' }, { taskId: 'native-task' }, { workspace: 'agent-core' }]) {
      expect((await external.raw({ action: 'observe', sessionId: nativeSession.sessionId, ...spoof })).isError).toBe(true);
      expect((await external.raw({ action: 'status', ...spoof })).isError).toBe(true);
    }
    expect(service.status()).toEqual(state);
    expect(transports.map(client => client.send.mock.calls.length)).toEqual(reads);
    expect(await external.call({ action: 'close', sessionId: externalSession.sessionId })).toMatchObject({ closed: true });
    expect(await n.call({ action: 'close', sessionId: nativeSession.sessionId })).toMatchObject({ closed: true });
  });

  it('isolates external principals and controller sessions without trusting JSON identity', async () => {
    const a = await connected({ controllerSessionId: 'controller-a' }, { id: 'owner-a' });
    const sameOwner = await connected({ controllerSessionId: 'controller-b' }, { id: 'owner-a' });
    const otherOwner = await connected({ controllerSessionId: 'controller-a' }, { id: 'owner-b' });
    const owned = await open(a), observed = await a.call({ action: 'observe', sessionId: owned.sessionId });
    for (const foreign of [sameOwner, otherOwner]) {
      expect(await sessions(foreign)).toEqual([]);
      await refusesForeign(foreign, owned.sessionId, observed.observationId, {}, true);
    }
    const continuation = await connected({ controllerSessionId: 'controller-a' }, { id: 'owner-a' });
    expect(await continuation.call({ action: 'observe', sessionId: owned.sessionId })).toMatchObject({ sessionId: owned.sessionId });
  });

  it('binds external sessions to the host task, workspace identity and process rather than JSON selectors', async () => {
    const original = { taskId: 'host-task-a', workspace: 'agent-core', workspaceIdentityKey: 'workspace-a', processSessionId: 'host-process-a' };
    let scope = original;
    const external = {
      captureToolInvocationContext: vi.fn(async ({ invocationId, sessionId, ownerId }: any) => ({
        ...scope, binding: 'bound', invocationId, sessionId, ownerId, capturedAt: new Date().toISOString(),
      })),
      recordToolOutcome: vi.fn(async () => 'attributed'),
      invocationDisclosureCurrent: vi.fn(async () => true),
    };
    const peer = await connected({ controllerSessionId: 'bound-controller', externalControllerLearning: external as any }, { id: 'bound-owner' });
    const owned = await open(peer), observed = await peer.call({ action: 'observe', sessionId: owned.sessionId });
    for (const changed of [{ taskId: 'host-task-b' }, { workspaceIdentityKey: 'workspace-b' }, { processSessionId: 'host-process-b' }]) {
      scope = { ...original, ...changed };
      expect(await sessions(peer)).toEqual([]);
      await refusesForeign(peer, owned.sessionId, observed.observationId, {}, true);
      expect((await peer.raw({ action: 'observe', sessionId: owned.sessionId, taskId: original.taskId,
        workspace: original.workspace, owner: 'bound-owner', invocationContext: original })).isError).toBe(true);
    }
    scope = original;
    expect(await peer.call({ action: 'observe', sessionId: owned.sessionId })).toMatchObject({ sessionId: owned.sessionId });
    expect(await peer.call({ action: 'close', sessionId: owned.sessionId })).toMatchObject({ closed: true });
  });
});
