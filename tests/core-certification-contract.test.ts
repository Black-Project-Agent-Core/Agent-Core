import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORE_CERTIFICATION_MATRIX,
  CORE_CERTIFICATION_SCHEMA,
  CORE_SOURCE_PREFIXES,
  FORBIDDEN_DEPENDENCY_PATTERNS,
  FORBIDDEN_SOURCE_MARKERS,
  REQUIRED_PACKAGE_SCRIPTS,
} from '../scripts/release/core-certification-contract.mjs';

const expected = [
  ['authentication_oauth', 'Authentication / OAuth'],
  ['mcp_legacy_compatibility', 'MCP legacy compatibility'],
  ['mcp_modern_compatibility', 'MCP modern compatibility'],
  ['principal_isolation', 'Principal isolation'],
  ['project_isolation', 'Project isolation'],
  ['operational_audit_isolation', 'Operational audit isolation'],
  ['dmf_integrity_quality', 'DMF integrity + quality'],
  ['continuity', 'Continuity'],
  ['execution_durability', 'Execution durability'],
  ['execution_policy_resource_control', 'Execution policy/resource control'],
  ['backup_restore', 'Backup/restore'],
  ['evidence_retention', 'Evidence retention'],
  ['audit_integrity', 'Audit integrity'],
  ['observability', 'Observability'],
  ['github_fabric_regression', 'GitHub Fabric regression'],
  ['release_parity', 'Release parity'],
  ['performance', 'Performance'],
  ['no_external_ai_model_api_dependency', 'No external AI model/API dependency'],
] as const;

describe('Wave G core certification contract', () => {
  it('preserves the exact 18-area roadmap matrix with unique IDs and tracked evidence', () => {
    expect(CORE_CERTIFICATION_SCHEMA).toBe('agent-core-core-certification-contract/1');
    expect(CORE_CERTIFICATION_MATRIX.map((entry: any) => [entry.id, entry.label])).toEqual(expected);
    expect(new Set(CORE_CERTIFICATION_MATRIX.map((entry: any) => entry.id)).size).toBe(18);

    for (const entry of CORE_CERTIFICATION_MATRIX as any[]) {
      expect(entry.evidence.length).toBeGreaterThan(0);
      for (const relative of entry.evidence) {
        expect(path.isAbsolute(relative)).toBe(false);
        expect(() => execFileSync('git', ['ls-files', '--error-unmatch', relative], { stdio: 'pipe' })).not.toThrow();
      }
    }
  });

  it('defines a bounded core-source and dependency policy instead of a generic repository-wide AI keyword ban', () => {
    expect(CORE_SOURCE_PREFIXES).toEqual(expect.arrayContaining(['src/', 'scripts/', 'plugin/codespace/src/']));
    expect(FORBIDDEN_DEPENDENCY_PATTERNS.length).toBeGreaterThanOrEqual(8);
    expect(FORBIDDEN_SOURCE_MARKERS.length).toBeGreaterThanOrEqual(8);
    expect(REQUIRED_PACKAGE_SCRIPTS).toEqual([
      'verify:release',
      'benchmark:memory',
      'benchmark:execution',
      'verify:stable-parity',
      'certify:core',
    ]);
  });

  it('runs the deterministic checker and emits an 18-area safe zero-violation contract report', () => {
    const result = spawnSync(process.execPath, ['scripts/release/check-core-certification.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      schema: 'agent-core-core-certification-contract-report/1',
      ok: true,
      matrixCount: 18,
      missingEvidence: [],
      missingPackageScripts: [],
      dependencyViolations: [],
      sourceMarkerViolations: [],
      diffCheck: 'pass',
    });
    expect(report.matrix).toHaveLength(18);
    expect(report.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/ghp_[A-Za-z0-9]+/);
    expect(serialized).not.toContain('Bearer ');
    expect(serialized).not.toContain('/workspaces/.agent-core-codespace/secrets/');
  });

  it('exposes one canonical certify:core command with the exact fail-fast gate order', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts?.['certify:core']).toBe('node scripts/release/certify-core.mjs');

    const result = spawnSync(process.execPath, ['scripts/release/certify-core.mjs', '--plan'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const plan = JSON.parse(result.stdout);
    expect(plan).toMatchObject({
      schema: 'agent-core-core-certification-plan/1',
      matrixCount: 18,
    });
    expect(plan.gates.map((gate: any) => gate.id)).toEqual([
      'contract',
      'release_verification',
      'memory_100k',
      'execution_performance',
      'stable_release_parity',
    ]);
    expect(plan.gates.find((gate: any) => gate.id === 'memory_100k')?.args).toEqual([
      'scripts/benchmark-memory.mjs',
      '--count=100000',
      '--samples=5',
      '--warmup=2',
      '--target-p95-ms=150',
    ]);
    expect(plan.gates.find((gate: any) => gate.id === 'execution_performance')?.args).toEqual([
      'scripts/benchmark-execution.mjs',
      '--samples=20',
      '--warmup=3',
    ]);
  });

  it('keeps the core certification policy data-only and independent of model SDK dependencies', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const plugin = JSON.parse(readFileSync('plugin/codespace/package.json', 'utf8'));
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(plugin.dependencies ?? {}),
      ...Object.keys(plugin.devDependencies ?? {}),
    ];
    for (const name of names) {
      for (const item of FORBIDDEN_DEPENDENCY_PATTERNS as any[]) {
        expect(new RegExp(item.pattern, 'i').test(name), `${name} matched ${item.id}`).toBe(false);
      }
    }
  });
});
