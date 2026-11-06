import { afterAll, describe, expect, it } from 'vitest';
import { readOnlyGitEnv } from '../src/process/readonly-git.js';
import { interactWithProcess, startProcess } from '../src/rdc/tools/improved-process-tools.js';
import { recordAgentCoreOwnedSecretKey } from '../src/security/environment.js';

const KEY = 'CHILDENVTEST_API_KEY_01';

describe('owned credentials stay out of child process environments', () => {
  process.env[KEY] = 'fixture-not-a-real-key';
  recordAgentCoreOwnedSecretKey(KEY);
  afterAll(() => { delete process.env[KEY]; });

  it('leaves them out of read-only git and keeps its own settings', () => {
    const env = readOnlyGitEnv({ EXTRA: '1' });
    expect(env[KEY]).toBeUndefined();
    expect(env.LC_ALL).toBe('C');
    expect(env.EXTRA).toBe('1');
    expect(env.PATH ?? env.Path).toBeTruthy();
  });

  it('does not show them to code run through node:local', async () => {
    const started = await startProcess({ command: 'node:local', timeout_ms: 20_000 });
    const pid = Number(/-?\d+/.exec(String(started.content[0]?.text))?.[0]);
    expect(Number.isFinite(pid)).toBe(true);
    const result = await interactWithProcess({ pid, input: `console.log('seen=' + (process.env.${KEY} ?? 'absent'))`, timeout_ms: 20_000 });
    expect(String(result.content[0]?.text)).toContain('seen=absent');
  }, 30_000);
});
