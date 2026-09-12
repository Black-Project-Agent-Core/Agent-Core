import { describe, expect, it } from 'vitest';
import { projectExecutionOutput, type OutputTextSegment } from '../src/execution/output-projection.js';

function segment(text: string, stream: 'stdout' | 'stderr' = 'stdout', start = 0): OutputTextSegment {
  return { text, stream, start, end: start + Buffer.byteLength(text, 'utf8') };
}

function project(text: string, exitCode: number | null = 0) {
  return projectExecutionOutput({ segments: [segment(text)], exitCode, complete: true, totalBytes: Buffer.byteLength(text, 'utf8') });
}

function reporter(statuses: string[]) {
  return JSON.stringify({
    numPassedTests: statuses.filter(status => status === 'passed').length,
    numFailedTests: statuses.filter(status => status === 'failed').length,
    numPendingTests: statuses.filter(status => status === 'pending').length,
    numTotalTests: statuses.length,
    testResults: [{ assertionResults: statuses.map(status => ({ status })) }],
  });
}

describe('deterministic execution output projection', () => {
  it('extracts Vitest and Jest counts without deriving success from printed pass text', () => {
    const printed = 'Tests  3 passed | 1 failed | 2 skipped (6)\n';
    expect(project(printed)).toMatchObject({ quality: 'full', format: 'vitest', testResults: { passed: 3, failed: 1, skipped: 2, total: 6 } });
    expect(project('Tests: 1 failed, 2 skipped, 3 passed, 6 total\n')).toMatchObject({ format: 'jest', testResults: { passed: 3, failed: 1, skipped: 2, total: 6 } });
    const failed = project('Tests  6 passed (6)\n', 7);
    expect(failed.exitCode).toBe(7);
    expect(failed.testResults?.passed).toBe(6);
    expect(failed.limitations.join(' ')).toContain('do not override');
    expect(project('Tests  6 passed (5)\n').testResults).toBeUndefined();
    expect(project('Tests: 6 total\n').testResults).toBeUndefined();
    expect(project('Tests  2 passed | 1 todo (3)\n').testResults?.skipped).toBe(1);
  });

  it('validates full JSON reporter aggregate counts against assertions', () => {
    expect(project(reporter(['passed', 'failed', 'pending']))).toMatchObject({ format: 'json_test_report', quality: 'full', testResults: { passed: 1, failed: 1, skipped: 1, total: 3 } });
    const invalid = JSON.parse(reporter(['passed']));
    invalid.numTotalTests = 2;
    expect(project(JSON.stringify(invalid)).testResults).toBeUndefined();
    invalid.numTotalTests = 1;
    invalid.testResults[0].assertionResults[0].status = 'failed';
    expect(project(JSON.stringify(invalid)).testResults).toBeUndefined();
    invalid.numPassedTests = -1;
    expect(project(JSON.stringify(invalid)).testResults).toBeUndefined();
  });

  it('keeps Vitest pending and todo aggregates distinct until computing skipped totals', () => {
    const report = {
      numPassedTests: 1, numFailedTests: 0, numPendingTests: 1, numTodoTests: 1, numTotalTests: 3,
      testResults: [{ assertionResults: [{ status: 'passed' }, { status: 'skipped' }, { status: 'todo' }] }],
    };
    expect(project(JSON.stringify(report))).toMatchObject({ format: 'json_test_report', quality: 'full', testResults: { passed: 1, failed: 0, skipped: 2, total: 3 } });
    report.numPendingTests = 2;
    expect(project(JSON.stringify(report)).testResults).toBeUndefined();
  });

  it('keeps malformed, unsupported, and partial JSON as safe unknown excerpts', () => {
    for (const text of ['{"numPassedTests": 2', '{"note":"Tests 2 passed (2)"}', '["Tests 2 passed (2)"]']) {
      const value = project(text);
      expect(value).toMatchObject({ format: 'unknown', quality: 'unknown', presentation: { mode: 'raw_excerpt' } });
      expect(value.testResults).toBeUndefined();
    }
    const text = reporter(['passed']);
    expect(projectExecutionOutput({ segments: [segment(text)], exitCode: 0, complete: false, totalBytes: Buffer.byteLength(text) }).testResults).toBeUndefined();
  });

  it('parses adjacent JSON ranges only when the entire output is complete', () => {
    const text = JSON.stringify(JSON.parse(reporter(['passed'])), null, 2);
    const split = text.indexOf('\n') + 1;
    const segments = [segment(text.slice(0, split)), segment(text.slice(split), 'stdout', split)];
    expect(projectExecutionOutput({ segments, exitCode: 0, complete: true, totalBytes: Buffer.byteLength(text) }).testResults?.passed).toBe(1);
    segments[1] = segment(text.slice(split), 'stdout', split + 100);
    const result = projectExecutionOutput({ segments, exitCode: 0, complete: false, totalBytes: Buffer.byteLength(text) + 100 });
    expect(result.testResults).toBeUndefined();
    expect(result.quality).toBe('unknown');
  });

  it('extracts TAP counts with skipped/todo while refusing cancellation ambiguity', () => {
    const text = 'TAP version 13\n1..5\n# tests 5\n# pass 2\n# fail 1\n# skipped 1\n# todo 1\n# cancelled 0\n';
    expect(project(text, 1)).toMatchObject({ format: 'tap', testResults: { passed: 2, failed: 1, skipped: 2, total: 5 }, exitCode: 1 });
    expect(project(text.replace('# cancelled 0', '# cancelled 1')).testResults).toBeUndefined();
  });

  it('does not combine separated source fragments into a test summary', () => {
    const segments = [segment('Tests 2 pa'), segment('ssed (2)\n', 'stdout', 500)];
    const value = projectExecutionOutput({ segments, exitCode: 0, complete: false, totalBytes: 509 });
    expect(value.testResults).toBeUndefined();
    expect(value.quality).toBe('unknown');
  });

  it('recognizes a late whole summary as degraded and retains exact omitted byte count', () => {
    const head = segment('start\n');
    const tail = segment('Tests 2 passed | 1 failed (3)\n', 'stdout', 200000);
    const value = projectExecutionOutput({ segments: [head, tail], exitCode: 1, complete: false, totalBytes: tail.end });
    expect(value).toMatchObject({ quality: 'degraded', testResults: { passed: 2, failed: 1 }, omissions: { sampledBytes: 200000 - head.end } });
  });

  it('groups TypeScript diagnostics deterministically with separate file and raw log coordinates', () => {
    const prefix = '界\r\n';
    const first = 'src/a.ts(3,4): error TS2322: Type mismatch\r\n';
    const second = 'src/a.ts:7:9 - error TS2322: Other mismatch\n';
    const text = prefix + first + second;
    const value = project(text, 2);
    expect(project(text, 2)).toEqual(value);
    const group = value.diagnostics.groups[0]!;
    expect(group).toMatchObject({ file: 'src/a.ts', code: 'TS2322', count: 2, locations: [{ line: 3, column: 4 }, { line: 7, column: 9 }] });
    expect(group.logRanges).toEqual([
      { stream: 'stdout', start: Buffer.byteLength(prefix), end: Buffer.byteLength(prefix + first) },
      { stream: 'stdout', start: Buffer.byteLength(prefix + first), end: Buffer.byteLength(text) },
    ]);
    expect(group.firstOffset).toEqual(group.logRanges[0]);
    expect(group.lastOffset).toEqual(group.logRanges[1]);
  });

  it('never merges warning and error severity for the same file and diagnostic code', () => {
    const warning = 'src/a.ts(3,4): warning TS2322: Shared message\n';
    const error = 'src/a.ts(3,4): error TS2322: Shared message\n';
    const value = project(warning.repeat(20) + error.repeat(20), 1);
    expect(value.diagnostics).toMatchObject({ total: 40, errors: 20, warnings: 20 });
    expect(value.diagnostics.groups).toHaveLength(2);
    expect(value.diagnostics.groups.map(group => group.severity)).toEqual(['warning', 'error']);
    expect(value.diagnostics.groups[0]?.id).not.toBe(value.diagnostics.groups[1]?.id);
    expect(value.presentation.text).toContain('warning TS2322');
    expect(value.presentation.text).toContain('error TS2322');
  });

  it('deduplicates exact lines before redaction without normalizing IDs, numbers, paths, or streams', () => {
    const first = 'error request=100 path=/a id=aaaaaaaa\n';
    const second = 'error request=101 path=/b id=bbbbbbbb\n';
    const out = segment(first + second + first + second);
    const err = segment(first + first, 'stderr');
    const value = projectExecutionOutput({ segments: [out, err], exitCode: 1, complete: true, totalBytes: out.end + err.end });
    expect(value.repeatedLines.groups).toHaveLength(3);
    expect(new Set(value.repeatedLines.groups.map(group => group.id)).size).toBe(3);
    expect(value.repeatedLines.groups.every(group => group.count === 2)).toBe(true);
    expect(value.repeatedLines.groups.find(group => group.stream === 'stderr')?.logRanges).toEqual([
      { stream: 'stderr', start: 0, end: Buffer.byteLength(first) },
      { stream: 'stderr', start: Buffer.byteLength(first), end: err.end },
    ]);
  });

  it('redacts presentation, diagnostic file/message, and repetition samples without merging secret identities', () => {
    const a = 'SENTINEL_SECRET_A_1234567890'; const b = 'SENTINEL_SECRET_B_1234567890';
    const lineA = `error token=${a}\n`; const lineB = `error token=${b}\n`;
    const value = project(`${lineA}${lineA}${lineB}${lineB}src/token=${a}/a.ts(1,1): error TS1234: password=${b}\n`, 1);
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain(a);
    expect(serialized).not.toContain(b);
    expect(serialized).toContain('[REDACTED:');
    expect(value.repeatedLines.groups).toHaveLength(2);
    expect(value.repeatedLines.groups[0]?.id).not.toBe(value.repeatedLines.groups[1]?.id);
  });

  it('bounds diagnostic groups, locations, samples, and raw ranges with explicit omission counts', () => {
    const locations = Array.from({ length: 20 }, (_, index) => `a.ts(${index + 1},1): error TS1000: message ${index}\n`).join('');
    const other = Array.from({ length: 20 }, (_, index) => `other${index}.ts(1,1): error TS1001: x\n`).join('');
    const value = project(locations + other, 1);
    expect(value.diagnostics.total).toBe(40);
    expect(value.diagnostics.groups).toHaveLength(16);
    expect(value.diagnostics.omittedGroups).toBe(5);
    const group = value.diagnostics.groups[0]!;
    expect(group.locations).toHaveLength(8);
    expect(group.logRanges).toHaveLength(8);
    expect(group.omittedRanges).toBe(12);
    expect(group.samples).toHaveLength(3);
    expect(group.omittedSamples).toBe(17);
    expect(value.diagnostics.omittedLocations).toBe(17);
    expect(group.lastOffset.end).toBe(Buffer.byteLength(locations));
  });

  it('bounds repeated line groups and ranges and preserves exact occurrence counts', () => {
    const text = Array.from({ length: 16 }, (_, index) => `line ${index}\n`.repeat(20)).join('');
    const value = project(text);
    expect(value.repeatedLines.groups).toHaveLength(12);
    expect(value.repeatedLines.omittedGroups).toBe(4);
    expect(value.repeatedLines.groups[0]).toMatchObject({ count: 20, omittedRanges: 12 });
  });

  it('retains unmatched failure text when selecting a smaller summary', () => {
    const text = 'verbose unchanged line\n'.repeat(50) + 'Tests 2 passed (2)\nFATAL: socket refused\n';
    const value = project(text, 1);
    expect(value.presentation.mode).toBe('summary');
    expect(value.presentation.text).toContain('FATAL: socket refused');
    expect(value.exitCode).toBe(1);
  });

  it('rejects conflicting summaries instead of manufacturing an aggregate result', () => {
    const value = project('Tests 2 passed (2)\nTests 1 failed (1)\n', 1);
    expect(value.quality).toBe('degraded');
    expect(value.testResults).toBeUndefined();
    expect(value.presentation.mode).toBe('raw_excerpt');
    expect(value.limitations.join(' ')).toContain('Conflicting');
  });

  it.each(['', 'x', '界', '😀', 'token=x', '界😀\n'.repeat(10000), '😀'.repeat(10000), 'z'.repeat(100000)])('caps safe presentation by sampled bytes and 8192 UTF8 bytes', text => {
    const value = project(text);
    expect(value.presentation.bytes).toBe(Buffer.byteLength(value.presentation.text));
    expect(value.presentation.bytes).toBeLessThanOrEqual(Math.min(8192, Buffer.byteLength(text)));
    expect(value.presentation.text).not.toContain('\uFFFD');
    expect(value.presentation.sourceBytes).toBe(Buffer.byteLength(text));
    if (text === 'z'.repeat(100000)) expect(value.omissions.presentationBytes).toBe(100000 - 8192);
  });

  it('excludes overlap and invalid byte coordinates instead of counting duplicated evidence', () => {
    const text = 'Tests 1 passed (1)\n';
    const value = projectExecutionOutput({ segments: [segment(text), segment(text), { stream: 'stderr', start: 0, end: 1, text: '界' }], exitCode: 0, complete: true, totalBytes: Buffer.byteLength(text) });
    expect(value.testResults?.passed).toBe(1);
    expect(value.quality).toBe('degraded');
    expect(value.repeatedLines.groups).toEqual([]);
    expect(value.limitations.join(' ')).toContain('Invalid');
  });
});
