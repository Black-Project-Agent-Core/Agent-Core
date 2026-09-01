import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryGraph } from './MemoryGraph';

const snapshot = {
  schemaVersion: 1 as const,
  generatedAt: '2026-09-01T00:00:00.000Z',
  auditSequence: 12,
  project: { projectId: '/workspaces/Agent-Core', workspaceLabel: 'Agent-Core' },
  status: { memoryHealthy: true, lifecycleMode: 'advisory' as const, remoteEnabled: true, remoteDurabilityState: 'REMOTE_SYNCED' },
  nodes: [
    { memoryId: 'failure', title: 'Font Size Regression', canonicalKey: 'failure.font', kind: 'failure', state: 'active', revisionNo: 1, valuePreview: 'Font doubled.', importance: 0.8, pinned: false, createdAt: 1, updatedAt: 1 },
    { memoryId: 'solution', title: 'Native Geometry', canonicalKey: 'decision.geometry', kind: 'decision', state: 'active', revisionNo: 2, valuePreview: 'Preserve geometry.', importance: 0.9, pinned: true, createdAt: 2, updatedAt: 2 },
    { memoryId: 'validation', title: 'Corpus PASS', canonicalKey: 'artifact.corpus', kind: 'artifact', state: 'active', revisionNo: 1, valuePreview: 'Six files pass.', importance: 0.7, pinned: false, createdAt: 3, updatedAt: 3 },
  ],
  edges: [
    { edgeId: 'e1', fromMemoryId: 'failure', toMemoryId: 'solution', relation: 'resolved_by', weight: 1 },
    { edgeId: 'e2', fromMemoryId: 'solution', toMemoryId: 'validation', relation: 'validated_by', weight: 1 },
  ],
  conflicts: [],
  continuity: { active: [], completed: [], blocked: [], deferred: [], unfinished: [], frontier: [], interruptedTurnIds: [] },
  truncated: { nodes: false, edges: false },
};

describe('MemoryGraph', () => {
  it('renders authoritative node titles and typed edge labels from the snapshot', () => {
    render(<MemoryGraph snapshot={snapshot as any} selectedMemoryId={null} onSelectMemory={vi.fn()} />);
    expect(screen.getByText('Font Size Regression')).toBeInTheDocument();
    expect(screen.getByText('Native Geometry')).toBeInTheDocument();
    expect(screen.getByText('Corpus PASS')).toBeInTheDocument();
    expect(screen.getAllByText('resolved_by').length).toBeGreaterThan(0);
    expect(screen.getAllByText('validated_by').length).toBeGreaterThan(0);
  });

  it('selects a rendered memory without exposing mutation controls', () => {
    const onSelectMemory = vi.fn();
    render(<MemoryGraph snapshot={snapshot as any} selectedMemoryId={null} onSelectMemory={onSelectMemory} />);
    fireEvent.click(screen.getAllByText('Native Geometry')[0]!);
    expect(onSelectMemory).toHaveBeenCalledWith('solution');
    expect(screen.queryByRole('button', { name: /create memory|delete memory|connect nodes/i })).not.toBeInTheDocument();
  });

  it('filters by bounded search, kind, and state without changing the authoritative snapshot', () => {
    const frozen = JSON.stringify(snapshot);
    render(<MemoryGraph snapshot={snapshot as any} selectedMemoryId={null} onSelectMemory={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Search memories'), { target: { value: 'corpus' } });
    expect(screen.getByText('Corpus PASS')).toBeInTheDocument();
    expect(screen.queryByText('Font Size Regression')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search memories'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter memory kind'), { target: { value: 'failure' } });
    expect(screen.getByText('Font Size Regression')).toBeInTheDocument();
    expect(screen.queryByText('Native Geometry')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter memory kind'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Filter memory state'), { target: { value: 'active' } });
    expect(screen.getByText('Native Geometry')).toBeInTheDocument();
    expect(JSON.stringify(snapshot)).toBe(frozen);
  });

  it('exposes finite current and fit navigation controls without semantic mutation controls', () => {
    const onSelectMemory = vi.fn();
    render(<MemoryGraph snapshot={snapshot as any} selectedMemoryId={null} onSelectMemory={onSelectMemory} />);
    expect(screen.getByRole('button', { name: 'Current' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Fit' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /create memory|delete memory|connect nodes/i })).not.toBeInTheDocument();
  });

  it('shows ROOT only for justified roots and warns about an unlinked non-root node', () => {
    const fixture = {
      ...snapshot,
      nodes: [
        { ...snapshot.nodes[0], memoryId: 'root', title: 'Fresh Root', rootReason: 'FRESH_DURABLE_CONTEXT' },
        { ...snapshot.nodes[1], memoryId: 'orphan', title: 'Broken Orphan', rootReason: undefined, branchParentMemoryId: undefined },
      ],
      edges: [],
    };
    render(<MemoryGraph snapshot={fixture as any} selectedMemoryId={null} onSelectMemory={vi.fn()} />);
    const rootCard = screen.getByText('Fresh Root').closest('article');
    const orphanCard = screen.getByText('Broken Orphan').closest('article');
    expect(within(rootCard!).getByText('ROOT', { exact: true })).toBeInTheDocument();
    expect(within(orphanCard!).queryByText('ROOT', { exact: true })).not.toBeInTheDocument();
    expect(within(orphanCard!).getByText('UNLINKED NON-ROOT', { exact: true })).toBeInTheDocument();
  });
});
