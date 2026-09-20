import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ToolHistory } from '../src/rdc/utils/toolHistory.js';

const roots: string[] = [];
const histories: ToolHistory[] = [];

async function createHistory(): Promise<ToolHistory> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-reflexion-history-'));
  roots.push(root);
  const history = new ToolHistory(root);
  histories.push(history);
  return history;
}

afterEach(async () => {
  await Promise.all(histories.splice(0).map(history => history.cleanup()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Reflexion compact failure evidence', () => {
  it('preserves redacted failure evidence before oversized raw output is capped', async () => {
    const history = await createHistory();
    const largeFailure = {
      isError: true,
      content: [{
        type: 'text',
        text: 'Error: EFAIL token=FAILSECRET ' + 'X'.repeat(6000) + ' TAIL-EVIDENCE',
      }],
    };

    history.addCall(
      'read_file',
      { path: 'C:/missing.txt', authorization: 'Bearer ARGSECRET' },
      largeFailure as any,
      42,
    );

    const full = history.getRecentCallsFormatted({ maxResults: 10 });
    expect(full).toHaveLength(1);
    expect((full[0] as any).failureEvidence).toBeUndefined();
    expect(JSON.stringify(full[0].output)).toContain('output omitted from history');
    expect(JSON.stringify(full)).not.toContain('FAILSECRET');
    expect(JSON.stringify(full)).not.toContain('ARGSECRET');

    const compact = history.getRecentCallsCompact({ maxResults: 10, failuresOnly: true });
    expect(compact).toHaveLength(1);
    expect(compact[0].outcome).toBe('error');
    expect(compact[0].failureFamily).toContain('EFAIL');
    expect(compact[0].failureFamily).not.toContain('FAILSECRET');
    expect(compact[0].argumentsSummary).not.toContain('ARGSECRET');
    expect(compact[0].outputExcerpt).toContain('TAIL-EVIDENCE');
    expect(compact[0].outputExcerpt!.length).toBeLessThanOrEqual(1200);
  });

  it('filters compact history to failures while leaving default full history shape unchanged', async () => {
    const history = await createHistory();
    history.addCall('get_config', {}, { content: [{ type: 'text', text: 'ok' }] } as any, 5);
    history.addCall('read_file', { path: 'bad' }, {
      isError: true,
      content: [{ type: 'text', text: 'Error: missing target' }],
    } as any, 9);

    const failures = history.getRecentCallsCompact({ maxResults: 10, failuresOnly: true });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ toolName: 'read_file', outcome: 'error', duration: 9 });
    expect((failures[0] as any).output).toBeUndefined();

    const full = history.getRecentCallsFormatted({ maxResults: 10 });
    expect(full).toHaveLength(2);
    expect((full[0] as any).failureEvidence).toBeUndefined();
    expect((full[1] as any).failureEvidence).toBeUndefined();
    expect((full[0] as any).output).toBeDefined();
    expect((full[1] as any).output).toBeDefined();
  });

  it('handles circular failed outputs without leaking raw cyclic state', async () => {
    const history = await createHistory();
    const output: any = {
      isError: true,
      content: [{ type: 'text', text: 'Error: circular fixture' }],
    };
    output.self = output;

    expect(() => history.addCall('start_process', { command: 'fixture' }, output, 11)).not.toThrow();
    const compact = history.getRecentCallsCompact({ maxResults: 10, failuresOnly: true });
    expect(compact).toHaveLength(1);
    expect(compact[0].outcome).toBe('error');
    expect(JSON.stringify(compact[0])).not.toContain('"self"');
    expect(JSON.stringify(compact[0]).length).toBeLessThan(3000);
  });
});