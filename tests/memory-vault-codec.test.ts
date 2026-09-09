import { describe, expect, it } from 'vitest';
import { parseVaultSegment, serializeVaultSegment } from '../src/memory/file-native/vault-codec.js';
import { validateContinuation } from '../src/memory/file-native/relation-validator.js';
import type { VaultSegment } from '../src/memory/file-native/types.js';

function segment(overrides: Partial<VaultSegment> = {}): VaultSegment {
  return {
    schemaVersion: 1,
    fileId: 'mf_a',
    relativePath: 'Brainstorming/agent-core-memory-A.md',
    contextFamily: 'brainstorming',
    principalId: 'p1',
    projectId: 'F:\\Projects\\Agent-Core',
    topicKey: 'agent-core-memory',
    segmentNo: 1,
    nextFile: 'Brainstorming/agent-core-memory-B.md',
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
    entries: [{
      memoryId: 'mem_a', revisionId: 'rev_a', revisionNo: 1, canonicalKey: 'memory:decision',
      kind: 'decision', state: 'active', importance: 0.9, pinned: false, enforcement: 'none',
      valueText: 'Use file-native memory.', valueHash: 'abc', sourceEventId: 'event_a',
      createdAt: 1, updatedAt: 2, title: 'File-native decision',
      relations: [
        { targetMemoryId: 'mem_b', targetFile: 'Decisions/decision-B.md', relation: 'derived_from', weight: 0.8 },
        { targetMemoryId: 'mem_c', targetFile: 'Failures/failure-C.md', relation: 'resolved_by', weight: 1 },
      ],
    }],
    ...overrides,
  };
}

describe('canonical Markdown vault codec', () => {
  it('round-trips deterministically and preserves many relations', () => {
    const source = segment();
    const text = serializeVaultSegment(source);
    expect(text).toContain('schema_version: 1');
    expect(text).toContain('[[Decisions/decision-B#mem_b]]');
    expect(text).toContain('[[Failures/failure-C#mem_c]]');
    const parsed = parseVaultSegment(text, source.relativePath);
    expect(parsed).toEqual(source);
    expect(serializeVaultSegment(parsed)).toBe(text);
  });

  it('rejects malformed machine metadata instead of inventing an entry', () => {
    const text = serializeVaultSegment(segment()).replace('"memoryId":"mem_a"', '"memoryId":');
    expect(() => parseVaultSegment(text, 'Brainstorming/bad.md')).toThrow('MEMORY_VAULT_ENTRY_INVALID');
  });

  it('accepts same-family same-topic adjacent bidirectional continuation', () => {
    const left = segment();
    const right = segment({
      fileId: 'mf_b', relativePath: 'Brainstorming/agent-core-memory-B.md', segmentNo: 2,
      previousFile: left.relativePath, nextFile: undefined, entries: [],
    });
    expect(validateContinuation(left, right)).toEqual({ valid: true });
  });

  it('rejects cross-family continuation even when the topic matches', () => {
    const left = segment({ nextFile: 'Coding/agent-core-memory-B.md' });
    const right = segment({
      fileId: 'mf_b', relativePath: 'Coding/agent-core-memory-B.md', contextFamily: 'coding', segmentNo: 2,
      previousFile: left.relativePath, nextFile: undefined, entries: [],
    });
    expect(() => validateContinuation(left, right)).toThrow('MEMORY_CONTINUATION_FAMILY_MISMATCH');
  });
});
