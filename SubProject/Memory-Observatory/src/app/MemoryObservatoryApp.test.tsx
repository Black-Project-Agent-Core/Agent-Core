import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryObservatoryApp } from './MemoryObservatoryApp';

afterEach(() => vi.unstubAllGlobals());

const snapshot = {
  schemaVersion: 1,
  generatedAt: '2026-09-01T00:00:00.000Z',
  auditSequence: 42,
  project: { projectId: '/workspaces/Agent-Core', workspaceLabel: 'Agent-Core' },
  status: { memoryHealthy: true, lifecycleMode: 'advisory', remoteEnabled: true, remoteDurabilityState: 'REMOTE_SYNCED' },
  nodes: [{ memoryId: 'solution', title: 'Native Geometry', canonicalKey: 'decision.geometry', kind: 'decision', state: 'active', revisionNo: 2, valuePreview: 'Preserve source-native geometry.', importance: 0.9, pinned: true, createdAt: 2, updatedAt: 3, createdFromDecisionId: 'decision-42' }],
  edges: [], conflicts: [],
  continuity: { active: [], completed: [], blocked: [], deferred: [], unfinished: [], frontier: [], interruptedTurnIds: [] },
  truncated: { nodes: false, edges: false },
};

const detail = {
  ...snapshot.nodes[0],
  rootReason: undefined,
  branchParentMemoryId: 'parent-memory',
  revisions: [
    { revisionId: 'r2', revisionNo: 2, valuePreview: 'Preserve source-native geometry.', validFrom: 3 },
    { revisionId: 'r1', revisionNo: 1, valuePreview: 'Scale after rendering.', validFrom: 1, validTo: 2 },
  ],
  edges: [{ edgeId: 'e1', fromMemoryId: 'failure-memory', toMemoryId: 'solution', relation: 'resolved_by', weight: 1, evidenceEventId: 'evidence-9' }],
  conflicts: [],
};

describe('MemoryObservatoryApp graph shell', () => {
  it('loads the authoritative snapshot then shows selected node revision/state/relation/branch/provenance details', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/health') return new Response(JSON.stringify({ status: 'ok', mode: 'shadow', auditSequence: 42 }), { status: 200 });
      if (url === '/api/snapshot') return new Response(JSON.stringify(snapshot), { status: 200 });
      if (url === '/api/node/solution') return new Response(JSON.stringify(detail), { status: 200 });
      return new Response('{}', { status: 404 });
    }));

    render(<MemoryObservatoryApp />);
    expect(await screen.findByText('Native Geometry')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Native Geometry')[0]!);

    const inspector = screen.getByLabelText('Node inspector');
    expect(await within(inspector).findByText('Revision 2')).toBeInTheDocument();
    expect(within(inspector).getByText('ACTIVE')).toBeInTheDocument();
    expect(within(inspector).getByText('resolved_by')).toBeInTheDocument();
    expect(within(inspector).getByText('parent-memory')).toBeInTheDocument();
    expect(within(inspector).getByText('decision-42')).toBeInTheDocument();
    expect(within(inspector).getByText('evidence-9')).toBeInTheDocument();
  });
});

describe('MemoryObservatoryApp live activity', () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    readonly url: string;
    private listeners = new Map<string, Array<(event: MessageEvent) => void>>();
    onerror: ((event: Event) => void) | null = null;
    closed = false;
    constructor(url: string | URL) {
      this.url = String(url);
      FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const callback = listener as (event: MessageEvent) => void;
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
    }
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const callback = listener as (event: MessageEvent) => void;
      this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== callback));
    }
    emit(type: string, payload: unknown, lastEventId = '') {
      const event = new MessageEvent(type, { data: JSON.stringify(payload), lastEventId });
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
    close() { this.closed = true; }
  }

  it('loads recent persisted activity, consumes SSE without refresh, and resyncs graph on retained-history gap', async () => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
    const activityCalls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/health') return new Response(JSON.stringify({ status: 'ok', mode: 'shadow', auditSequence: 300 }), { status: 200 });
      if (url === '/api/snapshot') return new Response(JSON.stringify(snapshot), { status: 200 });
      if (url.startsWith('/api/activity?')) {
        activityCalls.push(url);
        return new Response(JSON.stringify({
          records: [{ sequence: 299, timestamp: '2026-09-01T06:20:00.000Z', category: 'memory', event: 'memory.recalled', state: 'completed', memoryIds: ['solution'] }],
          earliestSequence: 1,
          latestSequence: 299,
        }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MemoryObservatoryApp />);
    expect(await screen.findByText('memory.recalled')).toBeInTheDocument();
    expect(activityCalls[0]).toContain('after=50');
    const source = FakeEventSource.instances[0]!;
    expect(source.url).toContain('/api/stream?after=299');

    source.emit('activity', { sequence: 300, timestamp: '2026-09-01T06:20:01.000Z', category: 'memory', event: 'memory.remember_more_expanded', state: 'completed', memoryIds: ['solution'] }, '300');
    expect(await screen.findByText('memory.remember_more_expanded')).toBeInTheDocument();

    source.emit('stream.gap', { code: 'AUDIT_HISTORY_GAP', requiresSnapshotResync: true });
    expect(await screen.findByText('HISTORY GAP — GRAPH RESYNCED')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([value]) => String(value) === '/api/snapshot').length).toBeGreaterThan(1);
  });
});

describe('MemoryObservatoryApp graph convergence', () => {
  class ConvergenceEventSource {
    static instances: ConvergenceEventSource[] = [];
    readonly url: string;
    private listeners = new Map<string, Array<(event: MessageEvent) => void>>();
    constructor(url: string | URL) { this.url = String(url); ConvergenceEventSource.instances.push(this); }
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const callback = listener as (event: MessageEvent) => void;
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
    }
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const callback = listener as (event: MessageEvent) => void;
      this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== callback));
    }
    emit(type: string, payload: unknown, lastEventId = '') {
      const event = new MessageEvent(type, { data: JSON.stringify(payload), lastEventId });
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
    close() {}
    onerror: ((event: Event) => void) | null = null;
  }

  it('converges node, revision, and edge changes from authoritative snapshots without browser reload', async () => {
    ConvergenceEventSource.instances = [];
    vi.stubGlobal('EventSource', ConvergenceEventSource as unknown as typeof EventSource);
    const baseNode = { memoryId: 'a1', title: 'A1', canonicalKey: 'a1', kind: 'decision', state: 'active', revisionNo: 1, valuePreview: 'A1', importance: 1, pinned: false, createdAt: 1, updatedAt: 1 };
    const a2 = { ...baseNode, memoryId: 'a2', title: 'A2', canonicalKey: 'a2', createdAt: 2, updatedAt: 2 };
    const a3r1 = { ...baseNode, memoryId: 'a3', title: 'A3', canonicalKey: 'a3', createdAt: 3, updatedAt: 3 };
    const a3r2 = { ...a3r1, revisionNo: 2, valuePreview: 'A3 revised', updatedAt: 4 };
    const makeSnapshot = (nodes: any[], edges: any[] = []) => ({
      schemaVersion: 1, generatedAt: '2026-09-01T00:00:00.000Z', auditSequence: 10,
      project: { projectId: '/workspaces/Agent-Core', workspaceLabel: 'Agent-Core' },
      status: { memoryHealthy: true, lifecycleMode: 'advisory', remoteEnabled: true, remoteDurabilityState: 'REMOTE_SYNCED' },
      nodes, edges, conflicts: [], timeline: [],
      continuity: { active: [], completed: [], blocked: [], deferred: [], unfinished: [], frontier: [], interruptedTurnIds: [] },
      truncated: { nodes: false, edges: false, timeline: false },
    });
    let currentSnapshot = makeSnapshot([baseNode, a2]);
    let snapshotCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/health') return new Response(JSON.stringify({ status: 'ok', mode: 'shadow', auditSequence: 10 }), { status: 200 });
      if (url === '/api/snapshot') { snapshotCalls += 1; return new Response(JSON.stringify(currentSnapshot), { status: 200 }); }
      if (url.startsWith('/api/activity?')) return new Response(JSON.stringify({ records: [], earliestSequence: 1, latestSequence: 10 }), { status: 200 });
      return new Response('{}', { status: 404 });
    }));

    render(<MemoryObservatoryApp />);
    expect(await screen.findByText('A2')).toBeInTheDocument();
    const source = ConvergenceEventSource.instances[0]!;

    currentSnapshot = makeSnapshot([baseNode, a2, a3r1]);
    source.emit('activity', { sequence: 11, timestamp: new Date().toISOString(), category: 'memory', event: 'memory.node_created', state: 'completed', memoryIds: ['a3'] }, '11');
    expect(await screen.findByText('A3')).toBeInTheDocument();
    expect(screen.getByText('3 nodes · 0 edges')).toBeInTheDocument();

    currentSnapshot = makeSnapshot([baseNode, a2, a3r2]);
    source.emit('activity', { sequence: 12, timestamp: new Date().toISOString(), category: 'memory', event: 'memory.revision_created', state: 'completed', memoryIds: ['a3'] }, '12');
    const a3Card = (await screen.findByText('A3')).closest('article')!;
    expect(await within(a3Card).findByText('r2')).toBeInTheDocument();
    expect(screen.getByText('3 nodes · 0 edges')).toBeInTheDocument();

    currentSnapshot = makeSnapshot([baseNode, a2, a3r2], [{ edgeId: 'e3', fromMemoryId: 'a3', toMemoryId: 'a2', relation: 'validated_by', weight: 1 }]);
    source.emit('activity', { sequence: 13, timestamp: new Date().toISOString(), category: 'memory', event: 'memory.edge_created', state: 'completed', memoryIds: ['a3', 'a2'], relation: 'validated_by' }, '13');
    expect((await screen.findAllByText('validated_by')).length).toBeGreaterThan(0);
    expect(await screen.findByText('3 nodes · 1 edges')).toBeInTheDocument();
    expect(screen.getByTestId('graph-convergence-latency')).toHaveAttribute('data-samples', '3');
    expect(snapshotCalls).toBe(4);
  });
});
