import { describe, expect, it } from 'vitest';
import {
  FailureLoopAdvisor,
  annotateFailureLoopException,
  appendFailureLoopAdvisory,
  normalizeFailureFamily,
} from '../src/mcp/failure-loop-advisor.js';

const failure = (text = 'Error: missing target') => ({
  content: [{ type: 'text', text }],
  isError: true,
});

describe('Deterministic advisory loop detector', () => {
  it('emits nothing on first failure, then repeat and no-progress advisories', () => {
    const advisor = new FailureLoopAdvisor();
    const args = { path: 'C:/missing.txt' };

    expect(advisor.observeFailure('read_file', args, failure(), 1_000)).toBeUndefined();

    const second = advisor.observeFailure('read_file', args, failure(), 1_100);
    expect(second).toMatchObject({ repeatCount: 2, strength: 'repeat', scope: 'exact' });
    expect(second?.message).toContain('change arguments, target, hypothesis, or diagnostic method');

    const third = advisor.observeFailure('read_file', args, failure(), 1_200);
    expect(third).toMatchObject({ repeatCount: 3, strength: 'no-progress' });
  });

  it('does not inherit loop count across changed arguments or changed failure family', () => {
    const advisor = new FailureLoopAdvisor();

    expect(advisor.observeFailure('read_file', { path: 'A' }, failure('Error: missing'), 1_000)).toBeUndefined();
    expect(advisor.observeFailure('read_file', { path: 'B' }, failure('Error: missing'), 1_100)).toBeUndefined();

    expect(advisor.observeFailure('read_file', { path: 'B' }, failure('Error: permission denied'), 1_200)).toBeUndefined();
    const repeated = advisor.observeFailure('read_file', { path: 'B' }, failure('Error: permission denied'), 1_300);
    expect(repeated?.repeatCount).toBe(2);
  });

  it('normalizes volatile absolute paths so repeated coded failures share one family', () => {
    const advisor = new FailureLoopAdvisor();
    const enoent = (filePath: string) => Object.assign(
      new Error("ENOENT: no such file or directory, stat '" + filePath + "'"),
      { code: 'ENOENT' },
    );

    const first = enoent('E:\\one\\missing.txt');
    const second = enoent('E:\\two\\missing.txt');
    const third = enoent('E:\\three\\missing.txt');

    expect(normalizeFailureFamily(first)).toBe(normalizeFailureFamily(second));
    expect(advisor.observeFailure('read_file', { path: 'E:/one/missing.txt' }, first, 1_000)).toBeUndefined();
    expect(advisor.observeFailure('read_file', { path: 'E:/two/missing.txt' }, second, 1_100)).toBeUndefined();
    expect(advisor.observeFailure('read_file', { path: 'E:/three/missing.txt' }, third, 1_200))
      .toMatchObject({ repeatCount: 3, strength: 'no-progress', scope: 'failure-family' });
  });
  it('emits broader no-progress advisory after three same-family failures with changed arguments', () => {
    const advisor = new FailureLoopAdvisor();

    expect(advisor.observeFailure('read_file', { path: 'A' }, failure('Error: missing target'), 1_000)).toBeUndefined();
    expect(advisor.observeFailure('read_file', { path: 'B' }, failure('Error: missing target'), 1_100)).toBeUndefined();
    const third = advisor.observeFailure('read_file', { path: 'C' }, failure('Error: missing target'), 1_200);

    expect(third).toMatchObject({
      repeatCount: 3,
      strength: 'no-progress',
      scope: 'failure-family',
    });
    expect(third?.message).toContain('changed arguments');
  });

  it('resets broader same-family stagnation after a different family, success, or TTL expiry', () => {
    const advisor = new FailureLoopAdvisor(100);

    expect(advisor.observeFailure('read_file', { path: 'A' }, failure('Error: missing'), 1_000)).toBeUndefined();
    expect(advisor.observeFailure('read_file', { path: 'B' }, failure('Error: missing'), 1_020)).toBeUndefined();
    expect(advisor.observeFailure('read_file', { path: 'C' }, failure('Error: denied'), 1_040)).toBeUndefined();

    expect(advisor.observeFailure('read_file', { path: 'D' }, failure('Error: missing'), 1_060)).toBeUndefined();
    advisor.observeSuccess('get_config', {}, 1_070);
    expect(advisor.observeFailure('read_file', { path: 'E' }, failure('Error: missing'), 1_080)).toBeUndefined();
    expect(advisor.observeFailure('read_file', { path: 'F' }, failure('Error: missing'), 1_300)).toBeUndefined();
  });

  it('ignores origin-only changes when fingerprinting effective arguments', () => {
    const advisor = new FailureLoopAdvisor();

    expect(advisor.observeFailure('read_file', { path: 'A', origin: 'llm' }, failure(), 1_000)).toBeUndefined();
    const repeated = advisor.observeFailure('read_file', { path: 'A', origin: 'other-controller' }, failure(), 1_100);

    expect(repeated?.repeatCount).toBe(2);
  });

  it('breaks a consecutive-failure streak after intervening success', () => {
    const advisor = new FailureLoopAdvisor();
    const args = { path: 'A' };

    expect(advisor.observeFailure('read_file', args, failure(), 1_000)).toBeUndefined();
    advisor.observeSuccess('get_config', {}, 1_050);
    expect(advisor.observeFailure('read_file', args, failure(), 1_100)).toBeUndefined();
  });

  it('starts a fresh sequence in a new advisor instance, matching restart semantics', () => {
    const firstRuntime = new FailureLoopAdvisor();
    const args = { path: 'A' };
    firstRuntime.observeFailure('read_file', args, failure(), 1_000);
    expect(firstRuntime.observeFailure('read_file', args, failure(), 1_100)?.repeatCount).toBe(2);

    const restartedRuntime = new FailureLoopAdvisor();
    expect(restartedRuntime.observeFailure('read_file', args, failure(), 1_200)).toBeUndefined();
  });

  it('resets expired state and keeps continuation/status tools exempt', () => {
    const advisor = new FailureLoopAdvisor(100);

    expect(advisor.observeFailure('read_file', { path: 'A' }, failure(), 1_000)).toBeUndefined();
    expect(advisor.observeFailure('read_file', { path: 'A' }, failure(), 1_200)).toBeUndefined();

    expect(advisor.observeFailure('read_process_output', { pid: 1 }, failure(), 2_000)).toBeUndefined();
    expect(advisor.observeFailure('read_process_output', { pid: 1 }, failure(), 2_010)).toBeUndefined();

    expect(advisor.observeFailure('memory_status', {}, failure(), 2_100)).toBeUndefined();
    expect(advisor.observeFailure('memory_status', {}, failure(), 2_110)).toBeUndefined();
  });

  it('redacts credentials before retained fingerprints/failure family and advisory text', () => {
    const advisor = new FailureLoopAdvisor();
    const argsA = {
      command: 'tool --api-key SUPERSECRET_A',
      authorization: 'Bearer SUPERSECRET_A',
    };
    const argsB = {
      command: 'tool --api-key SUPERSECRET_B',
      authorization: 'Bearer SUPERSECRET_B',
    };
    const secretFailure = failure('Error: token=FAILSECRET and Bearer FAILBEARER');

    expect(advisor.observeFailure('start_process', argsA, secretFailure, 1_000)).toBeUndefined();
    const advisory = advisor.observeFailure('start_process', argsB, secretFailure, 1_050);

    expect(advisory?.repeatCount).toBe(2);
    expect(advisory?.failureFamily).not.toContain('FAILSECRET');
    expect(advisory?.failureFamily).not.toContain('FAILBEARER');
    expect(advisory?.message).not.toContain('SUPERSECRET');
    expect(normalizeFailureFamily(secretFailure)).not.toContain('FAILSECRET');

    const retained = JSON.stringify([...(advisor as any).entries.values()]);
    expect(retained).not.toContain('SUPERSECRET_A');
    expect(retained).not.toContain('SUPERSECRET_B');
    expect(retained).not.toContain('FAILSECRET');
    expect(retained).not.toContain('FAILBEARER');
  });

  it('preserves original failure semantics while appending an advisory', () => {
    const original = failure('Error: missing target');
    const advisor = new FailureLoopAdvisor();

    advisor.observeFailure('read_file', { path: 'A' }, original, 1_000);
    const advisory = advisor.observeFailure('read_file', { path: 'A' }, original, 1_100);
    const decorated = appendFailureLoopAdvisory(original, advisory);

    expect(decorated.isError).toBe(true);
    expect(decorated.content[0]).toEqual(original.content[0]);
    expect(decorated.content).toHaveLength(2);
    expect((decorated.content[1] as any).text).toContain('Reflexion advisory');
  });

  it('preserves thrown Error identity while surfacing a repeat advisory', () => {
    const advisor = new FailureLoopAdvisor();
    const first = new Error('boom');
    const second = new Error('boom');

    expect(advisor.observeFailure('start_process', { command: 'bad' }, first, 1_000)).toBeUndefined();
    const advisory = advisor.observeFailure('start_process', { command: 'bad' }, second, 1_100);
    const decorated = annotateFailureLoopException(second, advisory);

    expect(decorated).toBe(second);
    expect(second.message).toContain('boom');
    expect(second.message).toContain('Reflexion advisory');
  });
});
