import { describe, expect, it } from 'vitest';
import { layoutMemoryGraph } from './graph-layout';

const nodes = [
  { memoryId: 'artifact', title: 'Validation', canonicalKey: 'artifact', kind: 'artifact', state: 'active', revisionNo: 1, valuePreview: '', importance: 1, pinned: false, createdAt: 40, updatedAt: 40 },
  { memoryId: 'decision-b', title: 'Decision B', canonicalKey: 'decision-b', kind: 'decision', state: 'active', revisionNo: 1, valuePreview: '', importance: 1, pinned: false, createdAt: 30, updatedAt: 30 },
  { memoryId: 'failure', title: 'Failure', canonicalKey: 'failure', kind: 'failure', state: 'active', revisionNo: 1, valuePreview: '', importance: 1, pinned: false, createdAt: 20, updatedAt: 20 },
  { memoryId: 'root', title: 'Root', canonicalKey: 'root', kind: 'decision', state: 'active', revisionNo: 1, valuePreview: '', importance: 1, pinned: false, rootReason: 'FRESH_DURABLE_CONTEXT', createdAt: 10, updatedAt: 10 },
  { memoryId: 'decision-a', title: 'Decision A', canonicalKey: 'decision-a', kind: 'decision', state: 'active', revisionNo: 1, valuePreview: '', importance: 1, pinned: false, createdAt: 25, updatedAt: 25 },
];
const edges = [
  { edgeId: 'e1', fromMemoryId: 'failure', toMemoryId: 'decision-a', relation: 'resolved_by', weight: 1 },
  { edgeId: 'e2', fromMemoryId: 'decision-a', toMemoryId: 'artifact', relation: 'validated_by', weight: 1 },
];

describe('layoutMemoryGraph', () => {
  it('assigns deterministic lanes and orders within a lane by createdAt then memoryId', () => {
    const first = layoutMemoryGraph(nodes as any, edges as any);
    const second = layoutMemoryGraph([...nodes].reverse() as any, [...edges].reverse() as any);
    expect(second).toEqual(first);
    expect(first.map((entry) => [entry.memoryId, entry.lane])).toEqual([
      ['root', 0],
      ['failure', 1],
      ['decision-a', 2],
      ['decision-b', 2],
      ['artifact', 3],
    ]);
    expect(first.find((entry) => entry.memoryId === 'decision-a')!.y)
      .toBeLessThan(first.find((entry) => entry.memoryId === 'decision-b')!.y);
  });
});
