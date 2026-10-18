import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { buildCapabilityExposure } from '../src/capability-awareness.js';
import { AGENT_CAPABILITY_CATALOG } from '../src/agent-capability-catalog.js';
import { HARNESS_LIMITS, manifestSchema, parseManifest, toolInputSchema,
  type HarnessManifest } from '../src/harness/reconstruction/contracts.js';
import { activityTracker, type TrackerEvent } from '../src/tracker/activity-tracker.js';
import { configManager } from '../src/rdc/config-manager.js';
import { toolHistory } from '../src/rdc/utils/toolHistory.js';
import { usageTracker } from '../src/rdc/utils/usageTracker.js';
import { acknowledgeControllerContract } from './controller-contract-fixture.js';

const closers: Array<() => Promise<void>> = [];
let events: TrackerEvent[];
beforeEach(() => {
  events = [];
  vi.spyOn(activityTracker, 'record').mockImplementation((module, level, message, kind, context) => {
    const event = { id: String(events.length), timestamp: new Date().toISOString(), source: 'node',
      time: '', module, level, message, kind, context } as TrackerEvent;
    events.push(event); return event;
  });
  vi.spyOn(activityTracker, 'captureFailure').mockImplementation(() => undefined as any);
  vi.spyOn(activityTracker, 'readToolInvocationEvents').mockImplementation(() => [...events]);
  vi.spyOn(toolHistory, 'addCall').mockReturnValue(true);
  vi.spyOn(usageTracker, 'trackSuccess').mockResolvedValue(undefined);
  vi.spyOn(usageTracker, 'trackFailure').mockResolvedValue(undefined);
  vi.spyOn(configManager, 'getConfig').mockResolvedValue({ allowedDirectories: [] });
});
afterEach(async () => { for (const close of closers.splice(0)) await close(); vi.restoreAllMocks(); });

const text = (result: any) => (result.content ?? []).filter((part: any) => part.type === 'text')
  .map((part: any) => part.text).join('\n');
const data = (result: any) => {
  expect(result.isError, text(result)).not.toBe(true);
  return JSON.parse(result.content.find((part: any) => part.type === 'text').text);
};
const manifest = (receiptRef = 'tool:' + 'a'.repeat(32)): HarnessManifest => ({
  schemaVersion: 1, coverage: 'complete',
  claims: [{ id: 'claim.one', title: 'A host get_config operation completed', kind: 'tool-completion',
    requiredAuthority: 'tool-terminal', obligationIds: ['obligation.one'] }],
  obligations: [{ id: 'obligation.one', claimId: 'claim.one', required: true, ownerTool: 'get_config',
    requiredCases: ['positive'], dependsOn: [] }],
  selections: [{ obligationId: 'obligation.one', caseKind: 'positive', receiptRef }], contradictions: [],
});

/** Host-owned identity is synthetic; the real MCP wrappers generate every tested terminal receipt. */
async function fixture(options: { bound?: boolean; allowedTools?: string[]; ownerId?: string } = {}) {
  const ownerId = options.ownerId ?? 'owner-a', sessionId = 'controller-a';
  const state = { context: { binding: options.bound === false ? 'unbound' : 'bound',
    taskId: 'task-a', workspace: 'workspace-a', workspaceIdentityKey: 'workspace-key-a' } as Record<string, unknown> };
  const external = {
    captureToolInvocationContext: vi.fn(async (input: any) => ({ version: 1, ...input,
      capturedAt: new Date().toISOString(), ...state.context })),
    invocationTaskCurrent: vi.fn(async () => true),
    invocationDisclosureCurrent: vi.fn(async () => true),
    recordToolOutcome: vi.fn(async (_input: any) => 'attributed'),
    getEpisode: vi.fn(async (_sessionId: string): Promise<any> => undefined),
    recordCapabilityUse: vi.fn(async () => undefined),
    takeCapabilityUsageNotice: vi.fn(async () => ''),
  };
  const principal = { id: ownerId, ...(options.allowedTools ? {
    toolGrant: { version: 1, allowedTools: options.allowedTools },
  } : {}) };
  const server = createAgentCoreMcpServer(principal, {
    externalControllerLearning: external as any, controllerSessionId: sessionId,
  });
  const client = new Client({ name: 'external-harness-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  closers.push(async () => { await client.close(); await server.close(); });
  let contractSession: string | undefined;
  const raw = (name: string, args: any) => client.callTool({ name, arguments: args });
  const call = (action: string, input?: unknown, extra: Record<string, unknown> = {}) => raw('reconstruction_harness',
    { action, ...(input === undefined ? {} : { manifest: input }), ...(contractSession ? { contractSession } : {}), ...extra });
  const acknowledge = async () => { contractSession = await acknowledgeControllerContract(raw); };
  const receipt = async (attributionStatus = 'attributed') => {
    const result = await raw('get_config', { contractSession });
    expect(result.isError, text(result)).not.toBe(true);
    const event = events.findLast(item => item.kind === 'tool-call' && item.context?.tool === 'get_config');
    expect(event?.context?.attributionStatus).toBe(attributionStatus);
    return 'tool:' + event!.context!.invocationId;
  };
  return { client, state, external, raw, call, acknowledge, receipt };
}

async function delayedReceipt(f: Awaited<ReturnType<typeof fixture>>) {
  f.external.recordToolOutcome.mockResolvedValueOnce('late-unavailable');
  const ref = await f.receipt('late-unavailable');
  const id = ref.slice('tool:'.length);
  const observed = f.external.recordToolOutcome.mock.calls.find(([input]) => input.invocationId === id)![0];
  const context = observed.invocationContext;
  const terminal = events.find(event => event.kind === 'tool-call' && event.context?.invocationId === id)!;
  // This models a completed durable write whose optional observer timed out before returning.
  const episode = { id: context.taskId, boundary: 'explicit', workspace: context.workspace,
    memoryBinding: { ownerId: context.ownerId, workspaceIdentityKey: context.workspaceIdentityKey },
    events: [{ id: 'durable-' + id, at: terminal.timestamp, kind: 'tool', summary: 'get_config success',
      tool: observed.tool, outcome: observed.outcome, invocationId: id, taskId: context.taskId,
      processSessionId: context.processSessionId, attributionStatus: 'attributed', evidenceRefs: [ref] }] };
  return { ref, input: manifest(ref), terminal, episode };
}

describe('external reconstruction harness over the actual MCP boundary', () => {
  it('discovers the compact contract but requires handshake before schema access', async () => {
    const f = await fixture({ bound: false });
    const tool = (await f.client.listTools()).tools.find(item => item.name === 'reconstruction_harness');
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect((tool?.inputSchema.properties?.action as any)?.enum).toEqual(['schema', 'preview', 'assess', 'readiness']);
    expect(text(await f.call('schema'))).toContain('CONTRACT_READ_REQUIRED');
    await f.acknowledge();
    const schema = data(await f.call('schema'));
    expect(schema.manifestSchema).toEqual(manifestSchema.toJSONSchema());
    expect(parseManifest(schema.example)).toEqual(schema.example);
    expect(schema.workflow).toContain('evidenceRefs');
    expect(f.external.invocationTaskCurrent).not.toHaveBeenCalled();
    expect(f.external.recordCapabilityUse).not.toHaveBeenCalled();
  });

  it('preserves the existing Native action schema unchanged', () => {
    expect(toolInputSchema.toJSONSchema().properties?.action.enum).toEqual(['preview', 'assess', 'readiness']);
  });

  it('describes the external capability without changing the default Native descriptor', () => {
    const input = { availableTools: ['reconstruction_harness'], artifacts: [], owners: {} };
    const find = (externalController?: boolean) => buildCapabilityExposure({ ...input, externalController })
      .inventory.find(item => item.capabilityId === 'family:reconstruction.harness')!;
    expect(find().description).toBe(AGENT_CAPABILITY_CATALOG.find(item => item.family === 'reconstruction.harness')!.description);
    expect(find(true).description).toContain('External task-bound');
    expect(find(true).availability).toBe('available');
    expect(find(true).memberTools).toEqual(['reconstruction_harness']);
  });

  it('does not widen a credential grant during schema discovery or execution', async () => {
    const f = await fixture({ allowedTools: ['get_config'] });
    expect((await f.client.listTools()).tools.map(tool => tool.name)).not.toContain('reconstruction_harness');
    await f.acknowledge();
    await expect(f.call('schema')).rejects.toThrow(/disabled|GRANT_DENIED/);
  });

  it('requires the current host-bound task identity for every assessment action', async () => {
    const f = await fixture({ bound: false }); await f.acknowledge();
    for (const action of ['preview', 'assess', 'readiness']) {
      const result = await f.call(action, manifest());
      expect(result.isError).toBe(true); expect(text(result)).toContain('HARNESS_HOST_SCOPE_UNAVAILABLE');
    }
    f.state.context.binding = 'bound';
    for (const [field, invalid] of [['taskId', ''], ['workspace', ''], ['workspaceIdentityKey', ''],
      ['ownerId', 'foreign'], ['sessionId', 'foreign'], ['invocationId', 'spoof'], ['processSessionId', 'spoof']] as const) {
      const original = f.state.context[field]; f.state.context[field] = invalid;
      const result = await f.call('preview', manifest());
      expect(result.isError, field).toBe(true); expect(text(result), field).toContain('HARNESS_HOST_SCOPE_UNAVAILABLE');
      if (original === undefined) delete f.state.context[field]; else f.state.context[field] = original;
    }
    expect(activityTracker.readToolInvocationEvents).not.toHaveBeenCalled();
  });

  it('accepts a real wrapper terminal only as tool completion and keeps preview non-verifying', async () => {
    const f = await fixture(); await f.acknowledge();
    const input = manifest(await f.receipt());
    const preview = data(await f.call('preview', input));
    expect(preview.status).toBe('unknown'); expect(preview.summary.verified).toBe(0);
    expect(f.external.recordCapabilityUse).not.toHaveBeenCalled();
    for (const action of ['assess', 'readiness']) {
      const result = data(await f.call(action, input));
      expect(result.status).toBe('ready'); expect(result.summary.verified).toBe(1);
      expect(result.automaticApproval).toBe(false); expect(result.executesTarget).toBe(false);
      expect(result.memoryPersisted).toBe(false);
    }
    expect(f.external.recordCapabilityUse).toHaveBeenCalledTimes(2);
    input.claims[0]!.kind = 'behavior'; input.claims[0]!.requiredAuthority = 'packaged-process';
    expect(data(await f.call('assess', input)).status).toBe('unknown');
  });

  it('does not reuse receipts across owner, task or registered-workspace identity', async () => {
    const a = await fixture(); await a.acknowledge();
    const input = manifest(await a.receipt());
    const foreign = await fixture({ ownerId: 'owner-b' }); await foreign.acknowledge();
    expect(data(await foreign.call('assess', input)).status).toBe('unknown');
    for (const field of ['taskId', 'workspace', 'workspaceIdentityKey']) {
      const original = a.state.context[field]; a.state.context[field] = 'different';
      expect(data(await a.call('assess', input)).status, field).toBe('unknown');
      a.state.context[field] = original;
    }
    expect(data(await a.call('assess', input)).status).toBe('ready');
  });

  it('filters otherwise valid receipts when the current credential lacks the source tool grant', async () => {
    const producer = await fixture(); await producer.acknowledge();
    const input = manifest(await producer.receipt());
    const restricted = await fixture({ allowedTools: ['reconstruction_harness'] }); await restricted.acknowledge();
    expect(data(await restricted.call('assess', input)).status).toBe('unknown');
  });

  it('rejects strict nested input violations and oversize manifests without accepting caller authority', async () => {
    const f = await fixture(); await f.acknowledge();
    for (const input of [{ ...manifest(), verified: true }, { ...manifest(), claims: [] },
      { ...manifest(), extra: 'x'.repeat(HARNESS_LIMITS.maxInputBytes + 1) }]) {
      const result = await f.call('assess', input);
      expect(result.isError).toBe(true); expect(text(result)).toMatch(/HARNESS_INPUT/);
    }
    const overridden = await f.call('preview', manifest(), { ownerId: 'forged', taskId: 'forged' })
      .catch(error => ({ isError: true, content: [{ type: 'text', text: String(error) }] }));
    expect(overridden.isError).toBe(true); expect(text(overridden)).toMatch(/unrecognized|Unrecognized|Invalid|invalid/);
    expect(activityTracker.readToolInvocationEvents).not.toHaveBeenCalled();
  });

  it('rechecks task authority before and after reading receipts', async () => {
    const f = await fixture(); await f.acknowledge();
    const input = manifest(await f.receipt());
    f.external.invocationTaskCurrent.mockResolvedValueOnce(false);
    const stale = await f.call('assess', input);
    expect(stale.isError).toBe(true); expect(text(stale)).toContain('HARNESS_HOST_SCOPE_UNAVAILABLE');
    expect(activityTracker.readToolInvocationEvents).not.toHaveBeenCalled();
    f.external.invocationTaskCurrent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const switched = await f.call('assess', input);
    expect(switched.isError).toBe(true); expect(text(switched)).toContain('HARNESS_HOST_SCOPE_UNAVAILABLE');
    expect(activityTracker.readToolInvocationEvents).toHaveBeenCalledOnce();
  });

  it('reconciles late-unavailable attribution only with the exact durable host event', async () => {
    const f = await fixture(); await f.acknowledge();
    const { input, terminal, episode } = await delayedReceipt(f);
    expect(data(await f.call('assess', input)).status).toBe('unknown');
    f.external.getEpisode.mockResolvedValue(episode);
    const reconciled = data(await f.call('assess', input));
    expect(reconciled.status).toBe('ready'); expect(reconciled.summary.verified).toBe(1);
    expect(reconciled.automaticApproval).toBe(false); expect(reconciled.executesTarget).toBe(false);
    expect(reconciled.memoryPersisted).toBe(false);
    expect(f.external.getEpisode).toHaveBeenCalledWith('controller-a', true);
    expect(terminal.context!.attributionStatus).toBe('late-unavailable');
    f.external.getEpisode.mockClear();
    expect(data(await f.call('preview', input)).status).toBe('unknown');
    expect(f.external.getEpisode).not.toHaveBeenCalled();
  });

  it('rejects foreign, closed and ambiguous durable episodes for delayed attribution', async () => {
    const f = await fixture(); await f.acknowledge();
    const { input, episode } = await delayedReceipt(f);
    const corruptions: Array<[string, (value: any) => void]> = [
      ['foreign owner', value => { value.memoryBinding.ownerId = 'foreign'; }],
      ['foreign workspace', value => { value.workspace = 'foreign'; }],
      ['foreign workspace identity', value => { value.memoryBinding.workspaceIdentityKey = 'foreign'; }],
      ['foreign task', value => { value.id = 'foreign'; }],
      ['closed task', value => { value.closedAt = new Date().toISOString(); }],
      ['inferred task', value => { value.boundary = 'inferred'; }],
      ['missing binding', value => { delete value.memoryBinding; }],
      ['duplicate event', value => { value.events.push(structuredClone(value.events[0])); }],
      ['conflicting failure with same ref', value => { value.events.push({ ...value.events[0],
        kind: 'failure', outcome: 'handled-failure', invocationId: 'b'.repeat(32) }); }],
      ['conflicting failure with same invocation', value => { value.events.push({ ...value.events[0],
        kind: 'failure', outcome: 'handled-failure', evidenceRefs: ['tool:' + 'b'.repeat(32)] }); }],
    ];
    for (const [label, corrupt] of corruptions) {
      const bad = structuredClone(episode); corrupt(bad); f.external.getEpisode.mockResolvedValue(bad);
      expect(data(await f.call('assess', input)).status, label).toBe('unknown');
    }
  });

  it('requires matching successful tool, task, invocation, reference and process in the durable event', async () => {
    const f = await fixture(); await f.acknowledge();
    const { input, episode } = await delayedReceipt(f);
    for (const [field, value] of [['kind', 'verification'], ['outcome', 'handled-failure'],
      ['tool', 'read_file'], ['taskId', 'foreign'], ['invocationId', 'b'.repeat(32)],
      ['processSessionId', 'foreign'], ['attributionStatus', 'late-unavailable'],
      ['evidenceRefs', ['tool:' + 'b'.repeat(32)]]] as const) {
      const bad = structuredClone(episode); (bad.events[0] as any)[field] = value;
      f.external.getEpisode.mockResolvedValue(bad);
      expect(data(await f.call('assess', input)).status, field).toBe('unknown');
    }
  });

  it('never upgrades late-closed, unbound, missing-process or duplicate tracker terminals', async () => {
    const f = await fixture(); await f.acknowledge();
    const { input, terminal, episode } = await delayedReceipt(f);
    f.external.getEpisode.mockResolvedValue(episode);
    for (const status of ['late-closed', 'unbound']) {
      terminal.context!.attributionStatus = status;
      expect(data(await f.call('assess', input)).status, status).toBe('unknown');
    }
    terminal.context!.attributionStatus = 'late-unavailable';
    const digest = terminal.context!.processInstanceDigest;
    delete terminal.context!.processInstanceDigest;
    expect(data(await f.call('assess', input)).status).toBe('unknown');
    terminal.context!.processInstanceDigest = 'sha256:' + '0'.repeat(64);
    expect(data(await f.call('assess', input)).status).toBe('unknown');
    terminal.context!.processInstanceDigest = digest;
    events.push(structuredClone(terminal));
    expect(data(await f.call('assess', input)).status).toBe('unknown');
  });
});
