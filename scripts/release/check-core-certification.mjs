import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORE_CERTIFICATION_MATRIX,
  CORE_CERTIFICATION_SCHEMA,
  CORE_SOURCE_EXCLUDES,
  CORE_SOURCE_PREFIXES,
  FORBIDDEN_DEPENDENCY_PATTERNS,
  FORBIDDEN_SOURCE_MARKERS,
  REQUIRED_PACKAGE_SCRIPTS,
} from './core-certification-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(args, options = {}) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function parseJson(relative) {
  return JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

const tracked = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean).map((file) => file.replaceAll('\\', '/')));
const workingFiles = uniqueSorted(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
  .split('\0')
  .filter(Boolean)
  .map((file) => file.replaceAll('\\', '/')));
const sourceCommit = git(['rev-parse', 'HEAD']).trim();

const ids = CORE_CERTIFICATION_MATRIX.map((entry) => entry.id);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
const missingEvidence = [];
for (const entry of CORE_CERTIFICATION_MATRIX) {
  for (const evidence of entry.evidence) {
    if (!tracked.has(evidence)) missingEvidence.push({ matrixId: entry.id, evidence });
  }
}

const pkg = parseJson('package.json');
const pluginPkg = parseJson('plugin/codespace/package.json');
const missingPackageScripts = REQUIRED_PACKAGE_SCRIPTS.filter((name) => typeof pkg.scripts?.[name] !== 'string' || !pkg.scripts[name].trim());

const dependencyViolations = [];
for (const [manifest, manifestPkg] of [['package.json', pkg], ['plugin/codespace/package.json', pluginPkg]]) {
  const dependencyNames = uniqueSorted([
    ...Object.keys(manifestPkg.dependencies ?? {}),
    ...Object.keys(manifestPkg.devDependencies ?? {}),
    ...Object.keys(manifestPkg.optionalDependencies ?? {}),
    ...Object.keys(manifestPkg.peerDependencies ?? {}),
  ]);
  for (const dependency of dependencyNames) {
    for (const policy of FORBIDDEN_DEPENDENCY_PATTERNS) {
      if (new RegExp(policy.pattern, 'i').test(dependency)) {
        dependencyViolations.push({ manifest, dependency, policyId: policy.id });
      }
    }
  }
}

const excluded = new Set(CORE_SOURCE_EXCLUDES);
const sourceMarkerViolations = [];
const sourceFiles = workingFiles.filter((file) =>
  CORE_SOURCE_PREFIXES.some((prefix) => file.startsWith(prefix))
  && !excluded.has(file)
  && /\.(?:ts|tsx|js|mjs|cjs|json|sh|ps1)$/i.test(file));
for (const relative of sourceFiles) {
  let text;
  try { text = readFileSync(path.join(root, relative), 'utf8'); }
  catch { continue; }
  for (const policy of FORBIDDEN_SOURCE_MARKERS) {
    if (new RegExp(policy.pattern, 'i').test(text)) {
      sourceMarkerViolations.push({ file: relative, policyId: policy.id });
    }
  }
}

let diffCheck = 'pass';
try { git(['diff', '--check']); }
catch { diffCheck = 'fail'; }

const structuralViolations = [];
if (CORE_CERTIFICATION_SCHEMA !== 'agent-core-core-certification-contract/1') structuralViolations.push('schema_invalid');
if (CORE_CERTIFICATION_MATRIX.length !== 18) structuralViolations.push('matrix_count_invalid');
if (duplicateIds.length > 0) structuralViolations.push('duplicate_matrix_ids');

const report = {
  schema: 'agent-core-core-certification-contract-report/1',
  contractSchema: CORE_CERTIFICATION_SCHEMA,
  sourceCommit,
  matrixCount: CORE_CERTIFICATION_MATRIX.length,
  matrix: CORE_CERTIFICATION_MATRIX.map((entry) => ({ id: entry.id, label: entry.label, evidenceCount: entry.evidence.length })),
  structuralViolations,
  missingEvidence,
  missingPackageScripts,
  dependencyViolations,
  sourceMarkerViolations,
  scannedCoreFiles: sourceFiles.length,
  diffCheck,
};
report.ok = structuralViolations.length === 0
  && missingEvidence.length === 0
  && missingPackageScripts.length === 0
  && dependencyViolations.length === 0
  && sourceMarkerViolations.length === 0
  && diffCheck === 'pass';

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
