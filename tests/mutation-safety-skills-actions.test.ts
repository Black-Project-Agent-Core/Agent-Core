import { describe, expect, it } from 'vitest';
import { hasReadOnlyAction, isReadOnlyToolCall } from '../src/mcp/mutation-safety.js';
import { skills } from '../src/mcp/skills-schemas.js';

// mutation-safety owns which `skills` actions only read; the mutation journal and the Plan-mode gate both ask it.
const READS = ['status', 'list', 'inspect', 'search', 'read', 'validate', 'list_revisions', 'list_retired', 'proposals', 'self_awareness', 'explain_improvement'];
const WRITES = ['import', 'package', 'render_export', 'stage_revision', 'promote_revision', 'rollback_revision', 'retire', 'propose', 'decide_proposal', 'review_outcomes'];

describe('mutation-safety: one read-only action table for the skills tool', () => {
  it.each([...READS.map((action) => [action, true] as const), ...WRITES.map((action) => [action, false] as const)])(
    'skills/%s read-only: %s',
    (action, readOnly) => {
      expect(isReadOnlyToolCall('skills', undefined, { action })).toBe(readOnly);
    },
  );

  it('classifies every action of the tool schema, so a new action needs an explicit decision here', () => {
    expect([...skills.shape.action.options].sort()).toEqual([...READS, ...WRITES].sort());
  });

  it('counts a missing or unknown action, and another mixed tool, as a mutation', () => {
    expect(isReadOnlyToolCall('skills', undefined, {})).toBe(false);
    expect(isReadOnlyToolCall('skills', undefined, { action: 'not-an-action' })).toBe(false);
    expect(isReadOnlyToolCall('write_file', undefined, { action: 'read' })).toBe(false);
  });

  it('reports which tools have a read-only action at all', () => {
    expect(hasReadOnlyAction('skills')).toBe(true);
    expect(hasReadOnlyAction('write_file')).toBe(false);
  });
});
