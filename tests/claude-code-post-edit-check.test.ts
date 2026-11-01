import { describe, expect, it } from 'vitest';
import { checksFor } from '../scripts/verify/claude-code-post-edit-check.mjs';

const all = ['path-policy', 'topic-size', 'typecheck'];

describe('Claude Code post-edit check routing', () => {
  it('sends a source file to the path policy and the type check', () => {
    expect(checksFor('src/mcp/server.ts', all)).toEqual(['path-policy', 'typecheck']);
  });

  it('runs only the checks the hook entry names', () => {
    expect(checksFor('src/mcp/server.ts', ['path-policy'])).toEqual(['path-policy']);
  });

  it('sends an instruction topic to the size check only', () => {
    expect(checksFor('docs/instructions/bootstrap.md', all)).toEqual(['topic-size']);
  });

  it('keeps UI sources out of the type check and ignores unrelated files', () => {
    expect(checksFor('src/ui/src/App.tsx', all)).toEqual(['path-policy']);
    expect(checksFor('docs/CODEBASE.md', all)).toEqual([]);
    expect(checksFor('tests/x.test.ts', all)).toEqual([]);
  });

  it('never treats an inherited object key as a check name', () => {
    expect(checksFor('src/a.ts', ['constructor', 'toString'])).toEqual([]);
  });
});
