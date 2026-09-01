import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryObservatoryApp } from '../app/MemoryObservatoryApp';

afterEach(() => vi.unstubAllGlobals());

const snapshot = {
  schemaVersion: 1,
  generatedAt: '2026-09-01T00:00:00.000Z',
  auditSequence: 106,
  project: { projectId: '/workspaces/Agent-Core', workspaceLabel: 'Agent-Core' },
  status: { memoryHealthy: true, lifecycleMode: 'advisory', remoteEnabled: true, remoteDurabilityState: 'REMOTE_SYNCED' },
  nodes: [
    { memoryId: 'failure', title: 'Scaling Failure', canonicalKey: 'failure.scaling', kind: 'failure', state: 'active', revisionNo: 1, valuePreview: 'Post-scaling doubled font size.', importance: 0.9, pinned: true, createdAt: 1, updatedAt: 1 },
    { memoryId: 'cause', title: 'Post Scale Cause', canonicalKey: 'cause.post-scale', kind: 'observation', state: 'active', revisionNo: 1, valuePreview: 'Geometry was scaled twice.', importance: 0.8, pinned: false, createdAt: 2, updatedAt: 2 },
    { memoryId: 'solution', title: 'Native Geometry', canonicalKey: 'decision.native-geometry', kind: 'decision', state: 'active', revisionNo: 2, valuePreview: 'Preserve source-native geometry.', importance: 1, pinned: true, createdFromDecisionId: 'decision-9', createdAt: 3, updatedAt: 4 },
    { memoryId: 'validation', title: 'Corpus Validation', canonicalKey: 'artifact.corpus', kind: 'artifact', state: 'active', revisionNo: 1, valuePreview: 'Six fixtures passed.', importance: 0.8, pinned: false, createdAt: 5, updatedAt: 5 },
  ],
  edges: [
    { edgeId: 'edge-1', fromMemoryId: 'failure', toMemoryId: 'cause', relation: 'failed_because', weight: 1 },
    { edgeId: 'edge-2', fromMemoryId: 'cause', toMemoryId: 'solution', relation: 'resolved_by', weight: 1 },
    { edgeId: 'edge-3', fromMemoryId: 'solution', toMemoryId: 'validation', relation: 'validated_by', weight: 1, evidenceEventId: 'event-validation' },
  ],
  conflicts: [{
    conflictId: 'conflict-1',
    leftMemoryId: 'failure',
    rightMemoryId: 'solution',
    conflictType: 'architecture_claim',
    status: 'resolved',
    evidence: ['test=memory-cognition.test.ts', 'commitSha=abc1234'],
    createdAt: 6,
    resolvedAt: 7,
  }],
  continuity: {
    currentObjective: 'Preserve memory observability truth',
    active: [{ taskId: 'task-1', title: 'Task Nine', status: 'running', updatedAt: 9 }],
    completed: [], blocked: [], deferred: [], unfinished: [], frontier: [], interruptedTurnIds: [],
  },
  truncated: { nodes: false, edges: false },
};

const detail = {
  ...snapshot.nodes[2],
  revisions: [
    { revisionId: 'rev-2', revisionNo: 2, valuePreview: 'Preserve source-native geometry.', validFrom: 4 },
    { revisionId: 'rev-1', revisionNo: 1, valuePreview: 'Scale after rendering.', validFrom: 2, validTo: 3 },
  ],
  edges: [snapshot.edges[1], snapshot.edges[2]],
  conflicts: [snapshot.conflicts[0]],
};

const activity = [
  { sequence: 101, timestamp: '2026-09-01T06:10:01.000Z', category: 'memory', event: 'memory.preflight_started', state: 'started', routeContextId: 'route-a' },
  { sequence: 102, timestamp: '2026-09-01T06:10:02.000Z', category: 'memory', event: 'memory.recalled', state: 'completed', routeContextId: 'route-a', memoryIds: ['solution', 'failure'] },
  { sequence: 103, timestamp: '2026-09-01T06:10:03.000Z', category: 'memory', event: 'memory.remember_more_expanded', state: 'completed', routeContextId: 'route-a', memoryIds: ['cause'] },
  { sequence: 104, timestamp: '2026-09-01T06:10:05.000Z', category: 'memory', event: 'memory.edge_created', state: 'completed', routeContextId: 'route-a', memoryIds: ['solution', 'validation'], relation: 'validated_by' },
  { sequence: 105, timestamp: '2026-09-01T06:10:06.000Z', category: 'tool', event: 'tool.read_file', state: 'completed', routeContextId: 'route-a', toolName: 'read_file' },
  { sequence: 106, timestamp: '2026-09-01T06:10:07.000Z', category: 'tool', event: 'tool.execute_command', state: 'completed', routeContextId: 'route-b', toolName: 'execute_command' },
];

function installFetchFixture() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/health') return new Response(JSON.stringify({ status: 'ok', mode: 'shadow', auditSequence: 106 }), { status: 200 });
    if (url === '/api/snapshot') return new Response(JSON.stringify(snapshot), { status: 200 });
    if (url.startsWith('/api/activity?')) return new Response(JSON.stringify({ records: activity, earliestSequence: 101, latestSequence: 106 }), { status: 200 });
    if (url === '/api/node/solution') return new Response(JSON.stringify(detail), { status: 200 });
    return new Response('{}', { status: 404 });
  }));
}

async function renderReady() {
  installFetchFixture();
  render(<MemoryObservatoryApp />);
  await screen.findByText('Native Geometry');
}

describe('Memory Observatory analysis lenses', () => {
  it('shows a deterministic timeline from selected-node revisions plus persisted edge activity', async () => {
    await renderReady();
    fireEvent.click(screen.getAllByText('Native Geometry')[0]!);
    await screen.findByText('Revision 2');
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));

    const lens = screen.getByLabelText('Timeline view');
    const rows = within(lens).getAllByTestId('timeline-entry');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Revision 1'),
      expect.stringContaining('Revision 2'),
      expect.stringContaining('memory.edge_created'),
    ]);
    expect(within(lens).getByText('validated_by')).toBeInTheDocument();
  });

  it('distinguishes recalled, expanded, prior-failure, and not-loaded memories for the current preflight context', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Recall' }));

    const lens = screen.getByLabelText('Recall view');
    expect(within(lens).getByText('Native Geometry').closest('[data-memory-status]')).toHaveAttribute('data-memory-status', 'RECALLED CURRENT');
    expect(within(lens).getByText('Scaling Failure').closest('[data-memory-status]')).toHaveAttribute('data-memory-status', 'PRIOR FAILURE');
    expect(within(lens).getByText('Post Scale Cause').closest('[data-memory-status]')).toHaveAttribute('data-memory-status', 'EXPANDED');
    expect(within(lens).getByText('Corpus Validation').closest('[data-memory-status]')).toHaveAttribute('data-memory-status', 'NOT LOADED');
  });

  it('renders the typed failure-to-cause-to-solution-to-validation path in causal order', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Failure/Solution' }));

    const lens = screen.getByLabelText('Failure solution view');
    const steps = within(lens).getAllByTestId('causal-step');
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining('Scaling Failure'),
      expect.stringContaining('Post Scale Cause'),
      expect.stringContaining('Native Geometry'),
      expect.stringContaining('Corpus Validation'),
    ]);
    expect(within(lens).getByText('failed_because')).toBeInTheDocument();
    expect(within(lens).getByText('resolved_by')).toBeInTheDocument();
    expect(within(lens).getByText('validated_by')).toBeInTheDocument();
  });

  it('keeps both memories visible when a conflict is resolved and shows bounded evidence metadata', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Conflict' }));

    const lens = screen.getByLabelText('Conflict view');
    expect(within(lens).getByText('Scaling Failure')).toBeInTheDocument();
    expect(within(lens).getByText('Native Geometry')).toBeInTheDocument();
    expect(within(lens).getByText('RESOLVED')).toBeInTheDocument();
    expect(within(lens).getByText('test=memory-cognition.test.ts')).toBeInTheDocument();
    expect(within(lens).getByText('commitSha=abc1234')).toBeInTheDocument();
  });

  it('groups persisted activity by route/context identity without mixing unrelated sessions', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Session' }));

    const lens = screen.getByLabelText('Session task view');
    const routeA = within(lens).getByTestId('session-route-a');
    const routeB = within(lens).getByTestId('session-route-b');
    expect(within(routeA).getByText('memory.recalled')).toBeInTheDocument();
    expect(within(routeA).getByText('tool.read_file')).toBeInTheDocument();
    expect(within(routeA).queryByText('tool.execute_command')).not.toBeInTheDocument();
    expect(within(routeB).getByText('tool.execute_command')).toBeInTheDocument();
    expect(screen.getByLabelText('Live activity')).toBeInTheDocument();
  });
});
