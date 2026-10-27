import { execFile } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const runner = path.join(root, 'scripts/verify/native-memory-reuse.mjs');
const options = { cwd: root, env: { SystemRoot: process.env.SystemRoot }, windowsHide: true,
  timeout: 15_000, maxBuffer: 128 * 1024 };

it('runs only an untouched domain and refuses replay without replacing earlier evidence', async () => {
  const prepared = await execute(process.execPath, [runner, '--prepare'], options);
  const { manifest: manifestPath } = JSON.parse(prepared.stdout);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const coding = manifest.jobs.find((job: { domain: string; arm: string }) => job.domain === 'coding' && job.arm === 'seed');
  const dispatch = path.join(path.dirname(coding.oracle.answerPath), 'dispatch.json');
  const previous = '{"conversationId":"ambiguous-prior-dispatch"}\n';
  await writeFile(dispatch, previous, { flag: 'wx' });
  await expect(execute(process.execPath, [runner, '--run-domain', 'coding', manifestPath], options))
    .rejects.toMatchObject({ stderr: expect.stringContaining('EVALUATION_JOB_ALREADY_STARTED') });
  await expect(access(path.join(manifest.bundle, 'run-started-coding.json'))).rejects.toThrow();
  // No credential is supplied: the real bridge stops before network access, after domain admission.
  await expect(execute(process.execPath, [runner, '--run-domain', 'research', manifestPath], options))
    .rejects.toMatchObject({ stderr: expect.stringContaining('AGENT_CORE_UI_TOKEN_UNAVAILABLE') });
  const markerPath = path.join(manifest.bundle, 'run-started-research.json');
  const marker = await readFile(markerPath, 'utf8');
  expect(JSON.parse(marker).domain).toBe('research');
  await expect(execute(process.execPath, [runner, '--run-domain', 'research', manifestPath], options))
    .rejects.toMatchObject({ stderr: expect.stringContaining('EVALUATION_JOB_ALREADY_STARTED') });
  expect(await readFile(markerPath, 'utf8')).toBe(marker);
  expect(await readFile(dispatch, 'utf8')).toBe(previous);
}, 60_000);
