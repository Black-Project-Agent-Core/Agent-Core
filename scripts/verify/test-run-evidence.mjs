// Turns a test run log into a verdict that a script computes, not a model: PROVEN, PARTLY or NOT.
// Read-only, no dependencies. Reads a vitest text log, a vitest JSON report or a JUnit XML file (path or stdin).
//   node scripts/verify/test-run-evidence.mjs <result-file> [--code <path> ...] [--max-age-minutes N]
//   node scripts/verify/test-run-evidence.mjs --self-check
// Exit 1 for NOT: nothing executed, everything skipped, a failure, or a result older than the code it covers.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const count = (text, pattern) => Number(pattern.exec(text)?.[1] ?? 0);

export function parseResult(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed);
    return { format: 'vitest-json', executed: json.numTotalTests - (json.numPendingTests ?? 0) - (json.numTodoTests ?? 0),
      passed: json.numPassedTests ?? 0, failed: json.numFailedTests ?? 0,
      skipped: (json.numPendingTests ?? 0) + (json.numTodoTests ?? 0), startedAt: Number.isFinite(json.startTime) ? json.startTime : null };
  }
  if (trimmed.startsWith('<')) {
    const suites = [...trimmed.matchAll(/<testsuite\b([^>]*)>/g)].map(match => match[1]);
    const pick = (attrs, name) => Number(new RegExp(`\\b${name}="(\\d+)"`).exec(attrs)?.[1] ?? 0);
    const total = suites.reduce((sum, attrs) => sum + pick(attrs, 'tests'), 0);
    const failed = suites.reduce((sum, attrs) => sum + pick(attrs, 'failures') + pick(attrs, 'errors'), 0);
    const skipped = suites.reduce((sum, attrs) => sum + pick(attrs, 'skipped'), 0);
    return { format: 'junit', executed: total - skipped, passed: total - skipped - failed, failed, skipped, startedAt: null };
  }
  const line = /^\s*Tests\s+.*$/m.exec(text)?.[0];
  if (!line) throw new Error('NO_TEST_SUMMARY_FOUND');
  const failed = count(line, /(\d+) failed/);
  const passed = count(line, /(\d+) passed/);
  const skipped = count(line, /(\d+) skipped/) + count(line, /(\d+) todo/);
  return { format: 'vitest-text', executed: passed + failed, passed, failed, skipped, startedAt: null };
}

/** The verdict is a function of the counts and the age check alone. */
export function verdictFor(result, { stale = false } = {}) {
  const reasons = [];
  if (result.executed === 0) reasons.push(result.skipped > 0 ? 'everything-skipped' : 'nothing-executed');
  if (result.failed > 0) reasons.push('failures');
  if (stale) reasons.push('older-than-code');
  if (reasons.length) return { verdict: 'NOT', reasons };
  if (result.skipped > 0) return { verdict: 'PARTLY', reasons: ['some-skipped'] };
  return { verdict: 'PROVEN', reasons: [] };
}

async function newestMtime(target) {
  const info = await stat(target);
  if (!info.isDirectory()) return info.mtimeMs;
  let newest = 0;
  for (const entry of await readdir(target, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || /(?:^|[\\/])(?:node_modules|dist|\.git)(?:[\\/]|$)/.test(entry.parentPath)) continue;
    newest = Math.max(newest, (await stat(path.join(entry.parentPath, entry.name))).mtimeMs);
  }
  return newest;
}

// A verifier that cannot run, or that cannot see a known-bad run as bad, must fail rather than pass quietly.
export function selfCheck() {
  const cases = [
    ['nothing executed', ' Test Files  0 passed (0)\n      Tests  0 passed (0)\n', 'NOT'],
    ['everything skipped', '      Tests  12 skipped (12)\n', 'NOT'],
    ['a failure', '      Tests  1 failed | 9 passed (10)\n', 'NOT'],
    ['some skipped', '      Tests  1 skipped | 9 passed (10)\n', 'PARTLY'],
    ['clean', '      Tests  10 passed (10)\n', 'PROVEN'],
    ['junit failure', '<testsuites><testsuite tests="3" failures="1" skipped="0"></testsuite></testsuites>', 'NOT'],
  ];
  return cases.map(([name, text, expected]) => ({ name, expected, got: verdictFor(parseResult(text)).verdict }))
    .map(item => ({ ...item, ok: item.expected === item.got }));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-check')) {
    const results = selfCheck();
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = results.every(item => item.ok) ? 0 : 1;
    return;
  }
  const codeAt = args.indexOf('--code');
  const codePaths = codeAt < 0 ? [] : args.slice(codeAt + 1).filter(value => !value.startsWith('--'));
  const maxAgeAt = args.indexOf('--max-age-minutes');
  const maxAgeMinutes = maxAgeAt < 0 ? null : Number(args[maxAgeAt + 1]);
  const file = args.find((value, index) => !value.startsWith('--') && (codeAt < 0 || index < codeAt) && args[index - 1] !== '--max-age-minutes');
  if (!file) throw new Error('RESULT_FILE_REQUIRED');
  const text = await readFile(file, 'utf8');
  const result = parseResult(text);
  const resultAt = result.startedAt ?? (await stat(file)).mtimeMs;
  const codeNewest = codePaths.length ? Math.max(...await Promise.all(codePaths.map(newestMtime))) : null;
  const ageMinutes = (Date.now() - resultAt) / 60_000;
  const stale = (codeNewest !== null && codeNewest > resultAt) || (maxAgeMinutes !== null && ageMinutes > maxAgeMinutes);
  const { verdict, reasons } = verdictFor(result, { stale });
  console.log(JSON.stringify({ file: path.basename(file), ...result, resultAgeMinutes: Math.round(ageMinutes * 10) / 10,
    codeNewerThanResult: codeNewest === null ? 'not-checked' : codeNewest > resultAt, verdict, reasons }, null, 2));
  process.exitCode = verdict === 'NOT' ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(String(error?.message ?? error)); process.exitCode = 2; });
}
