import { describe, expect, it } from 'vitest';
import {
  iterationBudgetThreshold,
  summarizeAssistantProgress,
  summarizeToolArgs,
  summarizeToolResult,
  type AgentTurnEvent,
} from './agent-turn-events.js';

describe('summarizeToolResult', () => {
  it('counts search matches and files without copying content', () => {
    const text = 'Started search\n📄 src/a.ts:3 - secretLooking line\n📄 src/a.ts:9 - other\n📄 src/a.ts:12 - third';
    expect(summarizeToolResult('start_search', { text })).toBe('3 matches in 1 file');
    const two = '📄 src/a.ts:3 - x\n📄 src/b.ts:4 - y';
    expect(summarizeToolResult('get_more_search_results', { text: two })).toBe('2 matches in 2 files');
    const context = 'Total results found: 12 (2 matches)\n📄 src/a.ts:3 - hit\n📄 src/a.ts:4 - context\n📄 src/a.ts:9 - hit';
    expect(summarizeToolResult('start_search', { text: context })).toBe('2 matches in 1 file');
    expect(summarizeToolResult('start_search', { text: '📄 src/a.ts:3 - x' })).toBe('1 match in 1 file');
  });

  it('summarizes reads, listings, process exit codes and edits', () => {
    expect(summarizeToolResult('read_file', { text: '[Reading 120 lines from start (total: 300 lines)]\nbody' })).toBe('read 120 lines');
    expect(summarizeToolResult('list_directory', { text: '[DIR] a\n[FILE] a/b.ts\n[FILE] c.ts' })).toBe('3 entries');
    expect(summarizeToolResult('start_process', { text: 'Process finished with exit code 0\nout' })).toBe('exit 0');
    expect(summarizeToolResult('start_process', { text: 'exited with code 2' })).toBe('exit 2');
    expect(summarizeToolResult('edit_block', { text: 'Successfully applied 1 edit' }, { file_path: 'src/x.ts' })).toBe('edited src/x.ts');
    expect(summarizeToolResult('write_file', { text: 'ok' }, { path: 'src/y.ts' })).toBe('edited src/y.ts');
  });

  it('reports errors with a 60 character excerpt and an unknown tool as ok with its size', () => {
    const summary = summarizeToolResult('read_file', { isError: true, text: 'ENOENT ' + 'x'.repeat(200) });
    expect(summary.startsWith('error: ENOENT x')).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(80);
    expect(summarizeToolResult('weird_tool', { text: 'abcde' })).toBe('ok · 5 chars');
  });

  it('never carries secret-like values, even from an error or the 80 character cap', () => {
    const summary = summarizeToolResult('start_process', { isError: true, text: 'failed token=abc123SECRET password: hunter2 Authorization: Bearer zzz' });
    expect(summary).not.toMatch(/abc123SECRET|hunter2|zzz/);
    expect(summary).toContain('***');
    expect(summarizeToolResult('x', { isError: true, text: 'sk-liveABCDEFGHIJKLMNOPQRSTUV broke' })).not.toMatch(/sk-live/);
    expect(summarizeToolResult('x', { text: 'y'.repeat(500) }).length).toBeLessThanOrEqual(80);
  });
});

describe('assistant progress and budget contract', () => {
  it('bounds narration to 280 characters on one line and masks secrets', () => {
    const text = summarizeAssistantProgress('Saya cek\n file ini dulu. '.repeat(40));
    expect(text.length).toBeLessThanOrEqual(280);
    expect(text).not.toMatch(/\n/);
    expect(summarizeAssistantProgress('  ')).toBe('');
    expect(summarizeAssistantProgress(undefined)).toBe('');
    expect(summarizeAssistantProgress('pakai api_key=sk-123456 ya')).not.toContain('sk-123456');
  });

  it('warns at ceil(75%) of the iteration limit', () => {
    expect(iterationBudgetThreshold(24)).toBe(18);
    expect(iterationBudgetThreshold(10)).toBe(8);
  });

  it('declares assistant.progress and agent.budget as turn events', () => {
    const progress: AgentTurnEvent = { type: 'assistant.progress', at: 't', text: 'x', iteration: 1, maxIterations: 24, };
    const budget: AgentTurnEvent = { type: 'agent.budget', at: 't', iteration: 18, maxIterations: 24 };
    const withSummary: AgentTurnEvent = { type: 'tool.completed', at: 't', resultSummary: 'exit 0' };
    expect([progress.type, budget.type, withSummary.resultSummary]).toEqual(['assistant.progress', 'agent.budget', 'exit 0']);
  });
});

describe('summarizeToolArgs', () => {
  it('renders a one-line key=value summary', () => {
    expect(summarizeToolArgs({ path: 'src/a.ts', offset: 5 })).toBe('path="src/a.ts" offset=5');
  });

  it('truncates to 80 characters', () => {
    const summary = summarizeToolArgs({ command: 'x'.repeat(300) });
    expect(summary).toHaveLength(80);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('masks values whose key names a secret, including nested keys', () => {
    const summary = summarizeToolArgs({ path: 'ok', apiKey: 'sk-live-123', token: 'abc', Password: 'p', cookie: 'c' });
    expect(summary).toBe('path="ok" apiKey=*** token=*** Password=*** cookie=***');
    expect(summarizeToolArgs({ client_secret: 's', authorization: 'Bearer z' })).toBe('client_secret=*** authorization=***');
    const nested = summarizeToolArgs({ headers: { Authorization: 'Bearer nested', accept: 'json' } });
    expect(nested).toBe('headers={"Authorization":"***","accept":"json"}');
  });

  it('collapses newlines and tolerates non-object input', () => {
    expect(summarizeToolArgs({ text: 'a\nb\tc' })).not.toMatch(/[\n\t]/);
    expect(summarizeToolArgs(undefined)).toBe('');
    expect(summarizeToolArgs('plain')).toBe('"plain"');
  });
});
