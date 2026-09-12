import { safeDerivedText } from '../runtime/safe-derived-text.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';
import type { ExecutionLogAnalysisCoverage, ExecutionLogStore, ExecutionResultMarker } from './log-store.js';
import type { ExecutionStore } from './store.js';
import type { ExecutionScope } from './types.js';
import { projectExecutionOutput, type ExecutionOutputProjection, type OutputTextSegment } from './output-projection.js';

export const EXECUTION_OUTPUT_PARSER_VERSION = '2.0.0';

export interface ExecutionOutputCoverage {
  version: 1;
  state: 'complete' | 'partial';
  integrity: 'verified';
  streams: { stdout: ExecutionLogAnalysisCoverage; stderr: ExecutionLogAnalysisCoverage };
}

export interface ExecutionOutputBinding {
  runId: string;
  attemptId: string;
  planHash?: string;
  planRevision?: string;
}

export interface ExecutionOutputRawAccess {
  tool: 'execution_logs';
  runId: string;
  nodeId: string;
  attemptId: string;
  attemptNo: number;
  requiresRouteContext: true;
}

export interface ParsedExecutionTestResults {
  passed: number;
  failed: number;
  skipped: number;
}

export interface ParsedExecutionErrorPattern {
  type: string;
  count: number;
  sample: string;
}

export interface ParsedExecutionOutput {
  version: 1;
  parserVersion: string;
  nodeId: string;
  attemptNo: number;
  exitCode: number | null;
  source: { stdoutSha256: string; stderrSha256: string };
  raw: { stdoutBytes: number; stderrBytes: number };
  structured: {
    filePathsCreated?: string[];
    directoriesCreated?: string[];
    testResults?: ParsedExecutionTestResults;
    buildStatus?: 'success' | 'failure' | 'partial';
    deploymentStatus?: 'deployed' | 'failed' | 'rolled_back';
    errorPatterns?: ParsedExecutionErrorPattern[];
    performanceMetrics?: Record<string, number>;
    warningCount?: number;
    securityIssueCount?: number;
  };
  confidence: number;
  binding?: ExecutionOutputBinding;
  coverage?: ExecutionOutputCoverage;
  projection?: ExecutionOutputProjection;
  rawAccess?: ExecutionOutputRawAccess;
}

export interface ParseExecutionOutputInput {
  nodeId: string;
  attemptNo: number;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  stdoutSha256: string;
  stderrSha256: string;
  stdoutBytes?: number;
  stderrBytes?: number;
  segments?: readonly OutputTextSegment[];
  coverage?: ExecutionOutputCoverage;
  binding?: ExecutionOutputBinding;
  rawAccess?: ExecutionOutputRawAccess;
}

function parseBuildStatus(text: string, exitCode: number | null): 'success' | 'failure' | 'partial' | undefined {
  const buildContext = /(?:^|\n)\s*>[^\n]*\bbuild\b|\btsc\b|\bbuild (?:completed|succeeded|failed)\b/i.test(text);
  if (!buildContext) return undefined;
  if (exitCode !== 0) return 'failure';
  if (/\b(?:error TS\d+|build failed|compilation failed)\b/i.test(text)) return 'failure';
  if (/\b(?:build completed successfully|build succeeded)\b/i.test(text) || /(?:^|\n)\s*>[^\n]*\bbuild\b/i.test(text)) return 'success';
  return 'partial';
}

function parseDeployment(text: string): 'deployed' | 'failed' | 'rolled_back' | undefined {
  const match = text.match(/Deployment status:\s*(deployed|failed|rolled[_ -]?back)\b/i);
  if (!match) return undefined;
  const value = match[1]!.toLowerCase().replace(/[ -]/g, '_');
  return value === 'rolled_back' ? 'rolled_back' : value as 'deployed' | 'failed';
}

function parsePerformance(text: string): Record<string, number> | undefined {
  const values: Record<string, number> = {};
  const pattern = /(?:^|\n)\s*PERF\s+([A-Za-z][A-Za-z0-9_.-]{0,63})\s*=\s*(-?\d+(?:\.\d+)?)\b/g;
  for (const match of text.matchAll(pattern)) {
    if (Object.keys(values).length >= 32) break;
    const number = Number(match[2]);
    if (Number.isFinite(number)) values[match[1]!] = number;
  }
  const keys = Object.keys(values).sort();
  return keys.length ? Object.fromEntries(keys.map((key) => [key, values[key]!])) : undefined;
}

function warningCount(text: string): number {
  return (text.match(/(?:^|\n)\s*warning\b[^\n]*/gi) ?? []).length;
}

function errorType(line: string): string {
  if (/\berror TS\d+\b/i.test(line)) return 'typescript';
  if (/\b(?:security|vulnerability|cve-)\b/i.test(line)) return 'security';
  if (/\btimeout|timed out\b/i.test(line)) return 'timeout';
  if (/\bpermission denied|eacces\b/i.test(line)) return 'permission';
  return 'generic';
}

function parseErrors(text: string): ParsedExecutionErrorPattern[] | undefined {
  const byType = new Map<string, { count: number; sample: string }>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !/\b(?:error(?:\s+TS\d+)?|fatal|exception|failed|failure)\b/i.test(line)) continue;
    const type = errorType(line);
    const current = byType.get(type) ?? { count: 0, sample: safeDerivedText(line) };
    current.count += 1;
    byType.set(type, current);
  }
  if (!byType.size) return undefined;
  return [...byType.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([type, value]) => ({ type, ...value }));
}

export function parseExecutionOutput(input: ParseExecutionOutputInput): ParsedExecutionOutput {
  const stdout = input.stdout ?? '';
  const stderr = input.stderr ?? '';
  const text = `${stdout}\n${stderr}`;
  const structured: ParsedExecutionOutput['structured'] = {};
  const segments = input.segments ?? [
    { stream: 'stdout' as const, start: 0, end: Buffer.byteLength(stdout), text: stdout },
    { stream: 'stderr' as const, start: 0, end: Buffer.byteLength(stderr), text: stderr },
  ];
  const projection = projectExecutionOutput({ segments, exitCode: input.exitCode,
    complete: input.coverage ? input.coverage.state === 'complete'
      : (input.stdoutBytes === undefined || input.stdoutBytes === Buffer.byteLength(stdout))
        && (input.stderrBytes === undefined || input.stderrBytes === Buffer.byteLength(stderr)),
    totalBytes: (input.stdoutBytes ?? Buffer.byteLength(stdout)) + (input.stderrBytes ?? Buffer.byteLength(stderr)) });
  const tests = projection.testResults && {
    passed: projection.testResults.passed, failed: projection.testResults.failed, skipped: projection.testResults.skipped,
  };
  if (tests) structured.testResults = tests;
  const build = parseBuildStatus(text, input.exitCode);
  if (build) structured.buildStatus = build === 'success' && input.coverage?.state === 'partial' ? 'partial' : build;
  const deployment = parseDeployment(text);
  if (deployment) structured.deploymentStatus = deployment;
  const performance = parsePerformance(text);
  if (performance) structured.performanceMetrics = performance;
  const warnings = warningCount(text);
  if (warnings > 0) structured.warningCount = warnings;
  const errors = parseErrors(text);
  if (errors) structured.errorPatterns = errors;
  const securityIssueCount = errors?.filter((entry) => entry.type === 'security').reduce((sum, entry) => sum + entry.count, 0) ?? 0;
  if (securityIssueCount > 0) structured.securityIssueCount = securityIssueCount;

  const confidenceSignals = [
    tests ? 0.95 : 0,
    build ? 0.90 : 0,
    deployment ? 0.95 : 0,
    performance ? 0.90 : 0,
    warnings > 0 ? 0.80 : 0,
    errors ? 0.85 : 0,
  ];
  const confidence = Math.min(input.coverage?.state === 'partial' ? 0.5 : 1, Math.max(...confidenceSignals));
  return {
    version: 1,
    parserVersion: EXECUTION_OUTPUT_PARSER_VERSION,
    nodeId: input.nodeId,
    attemptNo: input.attemptNo,
    exitCode: input.exitCode,
    source: { stdoutSha256: input.stdoutSha256, stderrSha256: input.stderrSha256 },
    raw: {
      stdoutBytes: input.stdoutBytes ?? Buffer.byteLength(stdout, 'utf8'),
      stderrBytes: input.stderrBytes ?? Buffer.byteLength(stderr, 'utf8'),
    },
    structured,
    confidence,
    projection,
    ...(input.binding ? { binding: input.binding } : {}),
    ...(input.coverage ? { coverage: input.coverage } : {}),
    ...(input.rawAccess ? { rawAccess: input.rawAccess } : {}),
  };
}

export interface ExecutionOutputParserLike {
  readonly parserVersion?: string;
  parseAttempt(scope: ExecutionScope, marker: ExecutionResultMarker): Promise<ParsedExecutionOutput>;
}

export class ExecutionOutputParserService implements ExecutionOutputParserLike {
  readonly parserVersion = EXECUTION_OUTPUT_PARSER_VERSION;

  constructor(
    private readonly store: ExecutionStore,
    private readonly logs: ExecutionLogStore,
    private readonly metrics?: RuntimeMetricRegistry,
    private readonly maxBytesPerStream = 128 * 1024,
  ) {}

  async parseAttempt(scope: ExecutionScope, marker: ExecutionResultMarker): Promise<ParsedExecutionOutput> {
    const started = performance.now();
    try {
      const [stdout, stderr] = await Promise.all([
        this.logs.readAnalysis(marker, 'stdout', this.maxBytesPerStream),
        this.logs.readAnalysis(marker, 'stderr', this.maxBytesPerStream),
      ]);
      const workflow = marker.provenance?.workflowBinding;
      const parsed = parseExecutionOutput({
        nodeId: marker.nodeId,
        attemptNo: marker.attemptNo,
        stdout: stdout.segments.map(segment => segment.text).join('\n'),
        stderr: stderr.segments.map(segment => segment.text).join('\n'),
        exitCode: marker.exitCode,
        stdoutSha256: marker.stdoutSha256,
        stderrSha256: marker.stderrSha256,
        stdoutBytes: marker.stdoutBytes,
        stderrBytes: marker.stderrBytes,
        segments: [...stdout.segments, ...stderr.segments],
        coverage: { version: 1, integrity: 'verified',
          state: stdout.coverage.omittedBytes || stderr.coverage.omittedBytes ? 'partial' : 'complete',
          streams: { stdout: stdout.coverage, stderr: stderr.coverage } },
        binding: { runId: marker.runId, attemptId: marker.attemptId,
          ...(workflow?.planHash ? { planHash: workflow.planHash } : {}),
          ...(workflow?.planRevision ? { planRevision: workflow.planRevision } : {}) },
        rawAccess: { tool: 'execution_logs', runId: marker.runId, nodeId: marker.nodeId,
          attemptId: marker.attemptId, attemptNo: marker.attemptNo, requiresRouteContext: true },
      });
      await this.store.persistParsedOutput(scope, marker, parsed);
      return parsed;
    } catch (error) {
      this.metrics?.failure('execution.output_parse.duration_ms', error instanceof Error ? error.name : 'EXECUTION_OUTPUT_PARSE_FAILED');
      throw error;
    } finally {
      this.metrics?.observe('execution.output_parse.duration_ms', Math.max(0, performance.now() - started));
    }
  }
}
