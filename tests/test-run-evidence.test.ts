import { describe, expect, it } from 'vitest';
import { parseResult, selfCheck, verdictFor } from '../scripts/verify/test-run-evidence.mjs';

describe('test run verdict is computed from counts', () => {
  it('reads the vitest text summary, including a failure and skips', () => {
    expect(parseResult(' Test Files  1 failed | 4 passed (5)\n      Tests  1 failed | 74 passed | 1 skipped (76)\n'))
      .toMatchObject({ format: 'vitest-text', executed: 75, passed: 74, failed: 1, skipped: 1 });
  });

  it('reads a vitest JSON report and counts todo as not executed', () => {
    const report = JSON.stringify({ numTotalTests: 10, numPassedTests: 8, numFailedTests: 0, numPendingTests: 1, numTodoTests: 1, startTime: 1_700_000_000_000 });
    expect(parseResult(report)).toMatchObject({ format: 'vitest-json', executed: 8, passed: 8, skipped: 2, startedAt: 1_700_000_000_000 });
  });

  it('reads JUnit totals across suites', () => {
    const xml = '<testsuites><testsuite tests="4" failures="1" errors="0" skipped="1"/><testsuite tests="2" failures="0" skipped="0"/></testsuites>';
    expect(parseResult(xml)).toMatchObject({ format: 'junit', executed: 5, failed: 1, skipped: 1 });
  });

  it('refuses a log without any summary instead of guessing', () => {
    expect(() => parseResult('npm ERR! something else entirely')).toThrow('NO_TEST_SUMMARY_FOUND');
  });

  it.each([
    [{ executed: 0, passed: 0, failed: 0, skipped: 0 }, {}, 'NOT', ['nothing-executed']],
    [{ executed: 0, passed: 0, failed: 0, skipped: 7 }, {}, 'NOT', ['everything-skipped']],
    [{ executed: 5, passed: 4, failed: 1, skipped: 0 }, {}, 'NOT', ['failures']],
    [{ executed: 5, passed: 5, failed: 0, skipped: 0 }, { stale: true }, 'NOT', ['older-than-code']],
    [{ executed: 5, passed: 5, failed: 0, skipped: 2 }, {}, 'PARTLY', ['some-skipped']],
    [{ executed: 5, passed: 5, failed: 0, skipped: 0 }, {}, 'PROVEN', []],
  ])('maps %j %j to %s', (result, options, verdict, reasons) => {
    expect(verdictFor(result as any, options)).toEqual({ verdict, reasons });
  });

  it('carries a built-in negative control that sees every known-bad run as bad', () => {
    const checks = selfCheck();
    expect(checks.length).toBeGreaterThanOrEqual(5);
    expect(checks.every((item: { ok: boolean }) => item.ok)).toBe(true);
    expect(checks.filter((item: { expected: string }) => item.expected === 'NOT').length).toBeGreaterThanOrEqual(3);
  });
});
