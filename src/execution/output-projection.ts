import { createHash } from 'node:crypto';
import { safeDerivedText } from '../runtime/safe-derived-text.js';

export interface OutputTextSegment {
  stream: 'stdout' | 'stderr';
  start: number;
  end: number;
  text: string;
}

type ProjectionFormat = 'vitest' | 'jest' | 'json_test_report' | 'tap' | 'typescript' | 'repeated_lines' | 'mixed' | 'unknown';
type TestFormat = Exclude<ProjectionFormat, 'typescript' | 'repeated_lines' | 'mixed' | 'unknown'>;
interface LogRange { stream: 'stdout' | 'stderr'; start: number; end: number }
interface RangeEvidence { logRanges: LogRange[]; omittedRanges: number; firstOffset: LogRange; lastOffset: LogRange }

export interface ProjectionTestResults {
  format: TestFormat;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface ExecutionOutputProjection {
  version: 1;
  format: ProjectionFormat;
  quality: 'full' | 'degraded' | 'unknown';
  exitCode: number | null;
  testResults?: ProjectionTestResults;
  diagnostics: {
    total: number;
    errors: number;
    warnings: number;
    groups: Array<{ id: string; file: string; fileTruncated: boolean; severity: 'error' | 'warning'; code: string; count: number; locations: Array<{ line: number; column: number }>; samples: string[]; omittedSamples: number; sampleTruncated: boolean } & RangeEvidence>;
    omittedGroups: number;
    omittedLocations: number;
  };
  repeatedLines: {
    groups: Array<{ id: string; stream: 'stdout' | 'stderr'; count: number; sample: string; sampleTruncated: boolean } & RangeEvidence>;
    omittedGroups: number;
  };
  presentation: { mode: 'summary' | 'raw_excerpt'; text: string; bytes: number; sourceBytes: number; measurement: 'utf8_bytes' };
  omissions: { sampledBytes: number; presentationBytes: number };
  limitations: string[];
}

const MAX_PRESENTATION_BYTES = 8192;
const MAX_DIAGNOSTIC_GROUPS = 16;
const MAX_LOCATIONS = 8;
const MAX_SAMPLES = 3;
const MAX_REPEATED_GROUPS = 12;
const MAX_LOG_RANGES = 8;
const ansi = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const bytes = (value: string) => Buffer.byteLength(value, 'utf8');
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function safeSnippet(value: string, maxChars = 240): string {
  // The shared character cap can cut a surrogate pair. Remove only unpaired
  // code units after redaction so later UTF-8 encoding never invents a glyph.
  return safeDerivedText(value, maxChars).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

function results(format: TestFormat, passed: number, failed: number, skipped: number, total: number): ProjectionTestResults | undefined {
  if (![passed, failed, skipped, total].every(nonnegative) || passed + failed + skipped !== total) return undefined;
  return { format, passed, failed, skipped, total };
}

function textTest(line: string): ProjectionTestResults | undefined {
  const clean = line.replace(ansi, '').trim();
  const jest = /^Tests:\s*(.+)$/.exec(clean);
  const vitest = /^Tests\s+(.+?)(?:\s+\((\d+)\))?$/.exec(clean);
  const match = jest ?? vitest;
  if (!match) return undefined;
  const terms = match[1]!.split(jest ? /\s*,\s*/ : /\s*\|\s*/);
  const counts = new Map<string, number>();
  for (const term of terms) {
    const item = /^(\d+)\s+(passed|failed|skipped|pending|todo|total)$/.exec(term.trim());
    if (!item || counts.has(item[2]!)) return undefined;
    const count = Number(item[1]);
    if (!nonnegative(count)) return undefined;
    counts.set(item[2]!, count);
  }
  const passed = counts.get('passed') ?? 0;
  const failed = counts.get('failed') ?? 0;
  const skipped = (counts.get('skipped') ?? 0) + (counts.get('pending') ?? 0) + (counts.get('todo') ?? 0);
  const total = jest ? counts.get('total') : vitest?.[2] ? Number(vitest[2]) : passed + failed + skipped;
  if (total === undefined || counts.size === 0 || (counts.size === 1 && counts.has('total'))) return undefined;
  return results(jest ? 'jest' : 'vitest', passed, failed, skipped, total);
}

function jsonTests(text: string): ProjectionTestResults | undefined {
  let report: unknown;
  try { report = JSON.parse(text); } catch { return undefined; }
  if (!report || typeof report !== 'object' || Array.isArray(report)) return undefined;
  const data = report as Record<string, unknown>;
  const fields = ['numPassedTests', 'numFailedTests', 'numPendingTests', 'numTotalTests'] as const;
  if (!fields.every(field => nonnegative(data[field])) || !Array.isArray(data.testResults)) return undefined;
  const todo = data.numTodoTests === undefined ? 0 : data.numTodoTests;
  if (!nonnegative(todo)) return undefined;
  const parsed = results('json_test_report', data.numPassedTests as number, data.numFailedTests as number,
    (data.numPendingTests as number) + todo, data.numTotalTests as number);
  if (!parsed) return undefined;
  let passed = 0; let failed = 0; let skipped = 0;
  for (const suite of data.testResults) {
    if (!suite || typeof suite !== 'object' || !Array.isArray(suite.assertionResults)) return undefined;
    for (const assertion of suite.assertionResults) {
      if (!assertion || typeof assertion !== 'object') return undefined;
      if (assertion.status === 'passed') passed += 1;
      else if (assertion.status === 'failed') failed += 1;
      else if (['pending', 'skipped', 'todo', 'disabled'].includes(assertion.status)) skipped += 1;
      else return undefined;
    }
  }
  return passed === parsed.passed && failed === parsed.failed && skipped === parsed.skipped ? parsed : undefined;
}

function tapTests(text: string): ProjectionTestResults | undefined {
  const counts = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^#\s+(tests|pass|fail|skipped|todo|cancelled)\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    if (counts.has(match[1]!)) return undefined;
    counts.set(match[1]!, Number(match[2]));
  }
  if (!['tests', 'pass', 'fail'].every(key => counts.has(key)) || (counts.get('cancelled') ?? 0) !== 0) return undefined;
  return results('tap', counts.get('pass')!, counts.get('fail')!, (counts.get('skipped') ?? 0) + (counts.get('todo') ?? 0), counts.get('tests')!);
}

function clipUtf8(value: string, limit: number): string {
  if (bytes(value) <= limit) return value;
  const buffer = Buffer.from(value, 'utf8');
  let end = Math.min(limit, buffer.length);
  while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end -= 1;
  return buffer.subarray(0, end).toString('utf8');
}

function addRange(evidence: RangeEvidence, range: LogRange): void {
  evidence.lastOffset = range;
  if (evidence.logRanges.length < MAX_LOG_RANGES) evidence.logRanges.push(range);
  else evidence.omittedRanges += 1;
}

export function projectExecutionOutput(input: {
  segments: readonly OutputTextSegment[];
  exitCode: number | null;
  complete: boolean;
  totalBytes: number;
}): ExecutionOutputProjection {
  const limitations = new Set<string>();
  const segments = [...input.segments].sort((a, b) => a.stream.localeCompare(b.stream) || a.start - b.start);
  const valid: OutputTextSegment[] = [];
  const ends = new Map<string, number>();
  let contiguous = true;
  for (const segment of segments) {
    const previous = ends.get(segment.stream) ?? 0;
    if (!nonnegative(segment.start) || !nonnegative(segment.end) || segment.start < previous
      || segment.end - segment.start !== bytes(segment.text)) {
      limitations.add('Invalid or overlapping source ranges were excluded.');
      contiguous = false;
      continue;
    }
    if (segment.start !== previous) contiguous = false;
    valid.push(segment);
    ends.set(segment.stream, segment.end);
  }
  const sampledBytes = valid.reduce((sum, segment) => sum + bytes(segment.text), 0);
  const complete = input.complete && contiguous && nonnegative(input.totalBytes) && sampledBytes === input.totalBytes;
  if (!complete) limitations.add('Only the supplied source ranges were examined; omitted output may contain additional results.');

  const formats = new Set<ProjectionFormat>();
  const testCandidates: ProjectionTestResults[] = [];
  const diagnostics: ExecutionOutputProjection['diagnostics'] = { total: 0, errors: 0, warnings: 0, groups: [], omittedGroups: 0, omittedLocations: 0 };
  const diagnosticGroups = new Map<string, ExecutionOutputProjection['diagnostics']['groups'][number]>();
  const omittedDiagnosticIds = new Set<string>();
  const repeats = new Map<string, { stream: 'stdout' | 'stderr'; count: number; raw: string } & RangeEvidence>();
  const safeLines: Array<{ id: string; text: string }> = [];
  const recognizedLines = new Set<string>();
  let parserIssue = false;

  // JSON needs a complete stream from offset zero. Adjacent ranges may be joined,
  // but never a gap or the other output stream.
  const jsonStreams = new Set<string>();
  for (const stream of ['stdout', 'stderr'] as const) {
    const pieces = valid.filter(segment => segment.stream === stream);
    const first = pieces[0];
    if (!first || !/^[\s\uFEFF]*[\[{]/.test(first.text)) continue;
    jsonStreams.add(stream);
    const joined = complete && first.start === 0 ? pieces.map(piece => piece.text).join('') : undefined;
    const parsed = joined === undefined ? undefined : jsonTests(joined.trim().replace(/^\uFEFF/, ''));
    if (parsed) { testCandidates.push(parsed); formats.add(parsed.format); }
    else {
      parserIssue = true;
      limitations.add('JSON was incomplete, malformed, unsupported, or had inconsistent test counts; its contents were not interpreted as test evidence.');
    }
  }

  for (const segment of valid) {
    const lines = segment.text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    let offset = segment.start;
    for (const [index, raw] of lines.entries()) {
      const end = offset + bytes(raw) + (index < lines.length - 1 || segment.text.endsWith('\n') ? 1 : 0);
      const range: LogRange = { stream: segment.stream, start: offset, end };
      offset = end;
      if (!raw.trim()) continue;
      const id = digest(`${segment.stream}\0${raw}`);
      const repeat = repeats.get(id);
      if (repeat) { repeat.count += 1; addRange(repeat, range); }
      else repeats.set(id, { stream: segment.stream, count: 1, raw, logRanges: [range], omittedRanges: 0, firstOffset: range, lastOffset: range });
      safeLines.push({ id, text: safeSnippet(raw, Number.MAX_SAFE_INTEGER) });
      if (jsonStreams.has(segment.stream)) { if (!parserIssue) recognizedLines.add(id); continue; }
      const parsed = textTest(raw);
      if (parsed) { testCandidates.push(parsed); formats.add(parsed.format); recognizedLines.add(id); }
      const clean = raw.replace(ansi, '').replace(/\r$/, '');
      const diagnostic = /^(.*?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.*)$/.exec(clean)
        ?? /^(.*?):(\d+):(\d+)\s*-\s*(error|warning)\s+(TS\d+):\s*(.*)$/.exec(clean);
      if (!diagnostic) continue;
      const [, file, lineText, columnText, severityText, code, message] = diagnostic;
      const severity = severityText as 'error' | 'warning';
      const line = Number(lineText); const column = Number(columnText);
      if (!file || !nonnegative(line) || !nonnegative(column) || line === 0 || column === 0) continue;
      diagnostics.total += 1;
      if (severity === 'error') diagnostics.errors += 1;
      else diagnostics.warnings += 1;
      formats.add('typescript');
      recognizedLines.add(id);
      const groupId = digest(`${file}\0${severity}\0${code}`);
      let group = diagnosticGroups.get(groupId);
      if (!group) {
        if (diagnosticGroups.size >= MAX_DIAGNOSTIC_GROUPS) { omittedDiagnosticIds.add(groupId); diagnostics.omittedLocations += 1; continue; }
        const safeFile = safeSnippet(file);
        group = { id: groupId, file: safeFile, fileTruncated: safeFile !== safeSnippet(file, Number.MAX_SAFE_INTEGER), severity, code: code!, count: 0, locations: [], samples: [], omittedSamples: 0, sampleTruncated: false,
          logRanges: [], omittedRanges: 0, firstOffset: range, lastOffset: range };
        diagnosticGroups.set(groupId, group);
      }
      group.count += 1;
      addRange(group, range);
      if (!group.locations.some(location => location.line === line && location.column === column)) {
        if (group.locations.length < MAX_LOCATIONS) group.locations.push({ line, column });
        else diagnostics.omittedLocations += 1;
      }
      const sample = safeSnippet(message ?? '');
      group.sampleTruncated ||= sample !== safeSnippet(message ?? '', Number.MAX_SAFE_INTEGER);
      if (!group.samples.includes(sample)) {
        if (group.samples.length < MAX_SAMPLES) group.samples.push(sample);
        else group.omittedSamples += 1;
      }
    }
    if (!jsonStreams.has(segment.stream)) {
      const tap = tapTests(segment.text);
      if (tap) { testCandidates.push(tap); formats.add('tap'); }
    }
  }

  diagnostics.groups = [...diagnosticGroups.values()];
  diagnostics.omittedGroups = omittedDiagnosticIds.size;
  const repeated = [...repeats.entries()].filter(([, group]) => group.count > 1);
  if (!formats.size && repeated.length && !parserIssue) formats.add('repeated_lines');
  const repeatedLines: ExecutionOutputProjection['repeatedLines'] = {
    groups: repeated.slice(0, MAX_REPEATED_GROUPS).map(([id, group]) => ({ id, stream: group.stream, count: group.count, sample: safeSnippet(group.raw),
      sampleTruncated: safeSnippet(group.raw) !== safeSnippet(group.raw, Number.MAX_SAFE_INTEGER),
      logRanges: group.logRanges, omittedRanges: group.omittedRanges, firstOffset: group.firstOffset, lastOffset: group.lastOffset })),
    omittedGroups: Math.max(0, repeated.length - MAX_REPEATED_GROUPS),
  };
  const testResults = testCandidates[0];
  const conflictingTests = testCandidates.some(candidate => testResults &&
    (candidate.passed !== testResults.passed || candidate.failed !== testResults.failed || candidate.skipped !== testResults.skipped || candidate.total !== testResults.total));
  if (conflictingTests) { parserIssue = true; limitations.add('Conflicting test summaries were observed; no aggregate test result was selected.'); }
  if (diagnostics.omittedGroups || diagnostics.omittedLocations || repeatedLines.omittedGroups
    || diagnostics.groups.some(group => group.omittedRanges || group.omittedSamples || group.fileTruncated || group.sampleTruncated)
    || repeatedLines.groups.some(group => group.omittedRanges || group.sampleTruncated)) limitations.add('Group, sample, location, or log range limits were reached; counts describe examined output only.');
  if (input.exitCode !== 0 && testResults?.failed === 0) limitations.add('Printed test results do not override the process exit code.');
  if (formats.size === 0) limitations.add('No supported test or diagnostic format was recognized.');
  limitations.add('This derived view does not certify process success or exhaustive semantic analysis.');

  const format: ProjectionFormat = formats.size > 1 ? 'mixed' : [...formats][0] ?? 'unknown';
  const quality = format === 'unknown' ? 'unknown' : complete && !parserIssue ? 'full' : 'degraded';
  const summaryLines: string[] = [];
  if (testResults && !conflictingTests) summaryLines.push(`Tests (${testResults.format}): ${testResults.passed} passed, ${testResults.failed} failed, ${testResults.skipped} skipped, ${testResults.total} total. Exit: ${input.exitCode ?? 'unknown'}.`);
  if (diagnostics.total) {
    summaryLines.push(`TypeScript diagnostics: ${diagnostics.errors} errors, ${diagnostics.warnings} warnings observed.`);
    for (const group of diagnostics.groups) summaryLines.push(`${group.file} ${group.severity} ${group.code} (${group.count}): ${group.samples[0] ?? ''}`);
  }
  for (const group of repeatedLines.groups) summaryLines.push(`${group.stream} repeated ${group.count}x: ${group.sample}`);
  const shownRepeats = new Set(repeatedLines.groups.map(group => group.id));
  for (const line of safeLines) if (!recognizedLines.has(line.id) && !shownRepeats.has(line.id)) summaryLines.push(line.text);
  const safeRaw = safeLines.map(line => line.text).join('\n');
  const summary = summaryLines.map(line => safeSnippet(line, Number.MAX_SAFE_INTEGER)).join('\n');
  const limit = Math.min(MAX_PRESENTATION_BYTES, sampledBytes);
  const mode = summary && !parserIssue && format !== 'unknown' && bytes(summary) < bytes(safeRaw) && bytes(summary) <= limit ? 'summary' : 'raw_excerpt';
  const chosen = mode === 'summary' ? summary : safeRaw;
  const text = clipUtf8(chosen, limit);
  return {
    version: 1, format, quality, exitCode: input.exitCode,
    ...(testResults && !conflictingTests ? { testResults } : {}), diagnostics, repeatedLines,
    presentation: { mode, text, bytes: bytes(text), sourceBytes: sampledBytes, measurement: 'utf8_bytes' },
    omissions: { sampledBytes: Math.max(0, input.totalBytes - sampledBytes), presentationBytes: Math.max(0, bytes(chosen) - bytes(text)) },
    limitations: [...limitations],
  };
}
