import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_CERTIFICATION_MATRIX } from './core-certification-contract.mjs';
import { npmInvocation } from './build-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

export const CORE_CERTIFICATION_BASE_GATES = Object.freeze([
  Object.freeze({ id: 'contract', command: process.execPath, args: Object.freeze(['scripts/release/check-core-certification.mjs']), json: true }),
  Object.freeze({ id: 'release_verification', command: npmExecutable, args: Object.freeze(['run', 'verify:release']), json: false }),
  Object.freeze({
    id: 'memory_100k',
    command: process.execPath,
    args: Object.freeze(['scripts/benchmark-memory.mjs', '--count=100000', '--samples=5', '--warmup=2', '--target-p95-ms=150']),
    json: true,
  }),
  Object.freeze({
    id: 'execution_performance',
    command: process.execPath,
    args: Object.freeze(['scripts/benchmark-execution.mjs', '--samples=20', '--warmup=3']),
    json: true,
  }),
]);

export const CORE_CERTIFICATION_STABLE_PARITY_GATE = Object.freeze({ id: 'stable_release_parity', command: process.execPath, args: Object.freeze(['scripts/release/check-stable-parity.mjs']), json: true });
export const CORE_CERTIFICATION_GATES = Object.freeze([...CORE_CERTIFICATION_BASE_GATES, CORE_CERTIFICATION_STABLE_PARITY_GATE]);

function git(args, stdio = ['ignore', 'pipe', 'pipe']) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio }).trim();
}

function trackedTreeIsClean() {
  const unstaged = spawnSync('git', ['-C', root, 'diff', '--quiet'], { stdio: 'ignore' });
  const staged = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'ignore' });
  return unstaged.status === 0 && staged.status === 0;
}

function selectedGates(prepublish) {
  return prepublish ? CORE_CERTIFICATION_BASE_GATES : CORE_CERTIFICATION_GATES;
}

function safePlan(prepublish) {
  return {
    schema: 'agent-core-core-certification-plan/1',
    mode: prepublish ? 'prepublish' : 'postpublish',
    matrixCount: CORE_CERTIFICATION_MATRIX.length,
    gates: selectedGates(prepublish).map((gate) => ({
      id: gate.id,
      command: gate.command === process.execPath ? 'node' : 'npm',
      args: [...gate.args],
    })),
  };
}

function parseGateJson(gate, stdout) {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    throw new Error(`CORE_CERTIFICATION_GATE_JSON_INVALID:${gate.id}`);
  }
}

export function runGate(gate, { cwd = root } = {}) {
  process.stderr.write(`[core-certification] ${gate.id}: start\n`);
  const started = Date.now();
  const invocation = gate.command === npmExecutable ? npmInvocation() : { executable: gate.command, prefix: [] };
  const result = spawnSync(invocation.executable, [...invocation.prefix, ...gate.args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`CORE_CERTIFICATION_GATE_FAILED:${gate.id}:${result.status ?? 'unknown'}`);
  process.stderr.write(`[core-certification] ${gate.id}: pass (${Date.now() - started} ms)\n`);
  return gate.json ? parseGateJson(gate, result.stdout) : null;
}

export function assertCertificationSource(projectRoot, expectedCommit) {
  const options = { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], options).trim();
  if (actual !== expectedCommit) throw new Error('CORE_CERTIFICATION_SOURCE_CHANGED_DURING_RUN');
  for (const args of [['diff', '--quiet'], ['diff', '--cached', '--quiet']]) {
    if (spawnSync('git', args, { cwd: projectRoot, stdio: 'ignore' }).status !== 0) {
      throw new Error('CORE_CERTIFICATION_TRACKED_TREE_DIRTY');
    }
  }
  const untrackedInputs = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z', '--',
    'src', 'scripts', 'tests', 'docs', 'supabase', 'plugin', 'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts'], options);
  if (untrackedInputs) throw new Error('CORE_CERTIFICATION_UNTRACKED_INPUTS');
}

export function runCertifiedGate(gate, sourceCommit, projectRoot = root) {
  assertCertificationSource(projectRoot, sourceCommit);
  const result = runGate(gate, { cwd: projectRoot });
  assertCertificationSource(projectRoot, sourceCommit);
  return result;
}

function assertReportShape(contract, memory, execution, parity, prepublish) {
  if (!contract?.ok || contract.matrixCount !== 18) throw new Error('CORE_CERTIFICATION_CONTRACT_NOT_READY');
  const memoryGate = memory?.gateSummary?.memoryRecall100k;
  if (!memoryGate?.passed) throw new Error('CORE_CERTIFICATION_MEMORY_GATE_NOT_PASSED');
  if (!execution?.success || !execution?.dagValidation?.passed || !execution?.readyDispatch?.passed || !execution?.wakeDelivery?.passed || !execution?.concurrencyPassed) {
    throw new Error('CORE_CERTIFICATION_EXECUTION_GATE_NOT_PASSED');
  }
  if (!prepublish && !parity?.ok) throw new Error('CORE_CERTIFICATION_STABLE_PARITY_NOT_PASSED');
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--plan', '--prepublish']);
  if (args.some((value) => !allowed.has(value)) || new Set(args).size !== args.length) throw new Error('CORE_CERTIFICATION_ARGUMENT_INVALID');
  const prepublish = args.includes('--prepublish');
  if (args.includes('--plan')) {
    process.stdout.write(`${JSON.stringify(safePlan(prepublish), null, 2)}\n`);
    return;
  }
  if (!trackedTreeIsClean()) throw new Error('CORE_CERTIFICATION_TRACKED_TREE_DIRTY');

  const sourceCommit = git(['rev-parse', 'HEAD']);
  const reports = new Map();
  for (const gate of selectedGates(prepublish)) reports.set(gate.id, runCertifiedGate(gate, sourceCommit));
  const finalCommit = git(['rev-parse', 'HEAD']);
  if (finalCommit !== sourceCommit) throw new Error('CORE_CERTIFICATION_SOURCE_CHANGED_DURING_RUN');
  assertCertificationSource(root, sourceCommit);

  const contract = reports.get('contract');
  const memory = reports.get('memory_100k');
  const execution = reports.get('execution_performance');
  const parity = reports.get('stable_release_parity');
  assertReportShape(contract, memory, execution, parity, prepublish);

  const report = {
    schema: 'agent-core-core-certification/1',
    mode: prepublish ? 'prepublish' : 'postpublish',
    sourceCommit,
    version: String(packageJson.version),
    matrixCount: CORE_CERTIFICATION_MATRIX.length,
    matrix: contract.matrix.map((entry) => ({ id: entry.id, label: entry.label, status: 'pass' })),
    releaseVerification: 'pass',
    qualityGate: 'pass',
    memoryRecall100k: {
      observedP95Ms: memory.gateSummary.memoryRecall100k.observedP95Ms,
      targetP95Ms: memory.gateSummary.memoryRecall100k.targetP95Ms,
      passed: memory.gateSummary.memoryRecall100k.passed,
    },
    executionPerformance: {
      dagP95Ms: execution.dagValidation.p95Ms,
      dagTargetP95Ms: execution.dagValidation.targetP95Ms,
      dispatchP95Ms: execution.readyDispatch.p95Ms,
      dispatchTargetP95Ms: execution.readyDispatch.targetP95Ms,
      wakeP95Ms: execution.wakeDelivery.p95Ms,
      wakeTargetP95Ms: execution.wakeDelivery.targetP95Ms,
      maxObservedConcurrency: execution.maxObservedConcurrency,
      configuredMaxConcurrency: execution.maxConcurrency,
      passed: execution.success,
    },
    stableRelease: prepublish ? {
      checked: false,
      passed: null,
    } : {
      checked: true,
      version: parity.version,
      tag: parity.tag,
      tagCommit: parity.tagCommit,
      requiredAssetCount: Array.isArray(parity.requiredAssets) ? parity.requiredAssets.length : 0,
      passed: parity.ok,
    },
    noExternalAiModelApiDependency: {
      dependencyViolations: contract.dependencyViolations.length,
      sourceMarkerViolations: contract.sourceMarkerViolations.length,
      passed: contract.dependencyViolations.length === 0 && contract.sourceMarkerViolations.length === 0,
    },
    ok: true,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const entry = process.argv[1];
const comparable = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
if (entry && comparable(entry) === comparable(fileURLToPath(import.meta.url))) main().catch((error) => {
  process.stderr.write(`[core-certification] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
