import { afterEach, expect, it, vi } from 'vitest';
import { killProcess } from '../src/rdc/tools/process.js';

afterEach(() => vi.restoreAllMocks());

// process.kill is mocked in every case: a guard regression must fail the test, never signal a real process.
it.each([process.pid, process.ppid, 0, -1, 1.5])('refuses pid %s without signalling anything', async pid => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
  const result = await killProcess({ pid });
  expect(result.isError).toBe(true);
  expect((result.content[0] as { text: string }).text).toContain('Refusing to kill process');
  expect(kill).not.toHaveBeenCalled();
});

it('still terminates an unrelated process', async () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
  const unrelated = process.pid + process.ppid + 1;
  const result = await killProcess({ pid: unrelated });
  expect(result.isError).toBeFalsy();
  expect(kill).toHaveBeenCalledWith(unrelated);
});
