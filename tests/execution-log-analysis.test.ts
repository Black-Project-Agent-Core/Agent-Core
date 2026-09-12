import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionLogStore, type ExecutionResultMarker } from '../src/execution/log-store.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
async function fixture(stdout: string | Buffer, stderr = '') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-output-analysis-'));
  roots.push(root);
  const logs = new ExecutionLogStore(root);
  const paths = await logs.prepareAttempt('run', 'node', 1);
  await writeFile(paths.stdoutPath, stdout);
  await writeFile(paths.stderrPath, stderr);
  const marker: ExecutionResultMarker = { version: 1, runId: 'run', nodeId: 'node', attemptId: 'attempt', attemptNo: 1,
    state: 'failed', startedAt: 1, finishedAt: 2, exitCode: 1, signal: null,
    stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr), stdoutSha256: sha(stdout), stderrSha256: sha(stderr) };
  return { logs, paths, marker };
}

describe('verified bounded output analysis windows', () => {
  it('reads short UTF-8 output completely and retains exact original byte offsets', async () => {
    const stdout = 'Nama: \u{1F642}\r\nTests  1 passed (1)\n';
    const f = await fixture(stdout);
    const result = await f.logs.readAnalysis(f.marker, 'stdout');
    expect(result.coverage).toEqual({ strategy: 'full', totalBytes: Buffer.byteLength(stdout),
      examinedBytes: Buffer.byteLength(stdout), omittedBytes: 0, ranges: [{ start: 0, end: Buffer.byteLength(stdout) }] });
    expect(result.segments[0]?.text).toBe(stdout);
    expect((await readFile(f.paths.stdoutPath)).equals(Buffer.from(stdout))).toBe(true);
  });

  it('captures a failure after 128 KiB and exposes the omitted middle rather than declaring full coverage', async () => {
    const stdout = 'identical progress line\n'.repeat(9000) + 'source.ts(7,4): error TS2322: LATE_FAILURE\n';
    const f = await fixture(stdout);
    const result = await f.logs.readAnalysis(f.marker, 'stdout');
    expect(result.coverage.strategy).toBe('head_tail');
    expect(result.coverage.examinedBytes).toBeLessThanOrEqual(128 * 1024);
    expect(result.coverage.omittedBytes).toBeGreaterThan(0);
    expect(result.segments.at(-1)?.text).toContain('LATE_FAILURE');
    for (const segment of result.segments) {
      expect(segment.text).toBe(Buffer.from(stdout).subarray(segment.start, segment.end).toString('utf8'));
    }
    const lateOffset = Buffer.byteLength(stdout.slice(0, stdout.indexOf('source.ts')));
    const raw = await f.logs.readLog('run', 'node', 1, 'stdout', lateOffset, 1024);
    expect(raw.data).toBe('source.ts(7,4): error TS2322: LATE_FAILURE\n');
    expect(raw.eof).toBe(true);
    expect(sha(await readFile(f.paths.stdoutPath))).toBe(f.marker.stdoutSha256);
  });

  it('rejects same-size changes even in the omitted middle of a stream', async () => {
    const stdout = 'progress\n'.repeat(20_000);
    const f = await fixture(stdout);
    const tampered = Buffer.from(stdout);
    tampered[90_000] = 88;
    await writeFile(f.paths.stdoutPath, tampered);
    await expect(f.logs.readAnalysis(f.marker, 'stdout')).rejects.toMatchObject({ code: 'EXECUTION_LOG_INTEGRITY_MISMATCH' });
  });

  it('never treats either cut fragment of a huge line as a complete observation', async () => {
    const f = await fixture('x'.repeat(200_000));
    const result = await f.logs.readAnalysis(f.marker, 'stdout');
    expect(result.segments).toEqual([]);
    expect(result.coverage).toMatchObject({ examinedBytes: 0, omittedBytes: 200_000, ranges: [] });
  });

  it('keeps windows on complete UTF-8 lines and supports an empty stream', async () => {
    const stdout = '\u{1F642} unicode line\r\n'.repeat(30) + 'final';
    const f = await fixture(stdout);
    const result = await f.logs.readAnalysis(f.marker, 'stdout', 61);
    expect(result.segments.at(-1)?.text).toContain('final');
    expect(result.segments.every(segment => !segment.text.includes('\uFFFD'))).toBe(true);
    expect(result.coverage.examinedBytes).toBeLessThanOrEqual(61);
    expect((await f.logs.readAnalysis(f.marker, 'stderr')).coverage).toMatchObject({ totalBytes: 0, examinedBytes: 0, omittedBytes: 0 });
  });

  it('preserves BOM bytes and a complete line exactly at the tail window boundary', async () => {
    const bom = await fixture('\uFEFFTests  1 passed (1)\n');
    const full = await bom.logs.readAnalysis(bom.marker, 'stdout');
    expect(full.segments[0]?.text.startsWith('\uFEFF')).toBe(true);
    expect(Buffer.byteLength(full.segments[0]!.text)).toBe(full.coverage.examinedBytes);
    const f = await fixture('first\npadding\nTAIL_ERR\n');
    const result = await f.logs.readAnalysis(f.marker, 'stdout', 18);
    expect(result.segments.at(-1)?.text).toBe('TAIL_ERR\n');
  });

  it('reports unsupported encoding instead of silently deriving facts from replacement characters', async () => {
    const f = await fixture(Buffer.from([0xff, 0xfe, 0x65, 0x00]));
    await expect(f.logs.readAnalysis(f.marker, 'stdout')).rejects.toMatchObject({ code: 'EXECUTION_LOG_ENCODING_UNSUPPORTED' });
    expect((await readFile(f.paths.stdoutPath)).length).toBe(4);
  });
});
