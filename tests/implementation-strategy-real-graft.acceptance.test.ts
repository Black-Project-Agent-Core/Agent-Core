import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VerifiedKey } from '../src/auth/key-types.js';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import { loadConfig } from '../src/config.js';
import { GitHubCredentialProvider } from '../src/github/credentials.js';
import { GitHubGitService } from '../src/github/git-service.js';
import { evaluateAuthorityConflicts } from '../src/implementation/authority-conflicts.js';
import { NativeSearchFallbackProvider } from '../src/implementation/code-intelligence.js';
import { GitWorkingTreeCodeIntelligenceSource } from '../src/implementation/git-working-tree-source.js';
import { validateImplementationStrategyBeforeOperation } from '../src/mcp/implementation-strategy-guard.js';
import { resolveImplementationStrategy, type ApprovedReference, type FeatureContract } from '../src/implementation/strategy.js';
import { buildTransplantManifest, type TransplantComponent } from '../src/implementation/transplant-manifest.js';
import { ImplementationVerificationCoordinator } from '../src/implementation/verification.js';
import { createRuntimeServices } from '../src/runtime/services.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const graftRoot = process.env.AGENT_CORE_GRAFT_DONOR_ROOT;
const cbmRoot = process.env.AGENT_CORE_CBM_DONOR_ROOT;
const targetRoot = process.env.AGENT_CORE_GRAFT_TARGET_ROOT;
const canaryIt = graftRoot && cbmRoot && targetRoot ? it : it.skip;
const gitExe = process.platform === 'win32' ? 'git.exe' : 'git';

function git(root: string, ...args: string[]): string {
  return execFileSync(gitExe, args, { cwd: root, encoding: 'utf8' }).trim();
}

const key: VerifiedKey = {
  id: 'implementation-canary', name: 'implementation-canary',
  createdAt: new Date(0).toISOString(), lastUsedAt: null, expiresAt: null, revokedAt: null,
};
const expectedGraftCommit = '65c29667bd59d7137caba8f6f5b5790e2d1f9404';
const expectedGraftTree = 'fbfcd728b6ebe587678996b20053c81bfd4da3ad';
const expectedCbmCommit = '4d8ac9e1cea0d645a02f876f47536c54a5bfa406';
const expectedCbmTree = 'afccfb0e1d82ffb0690e01b19c9f7fd4ec446ad2';

const feature: FeatureContract = {
  featureId: 'working-tree-freshness-fingerprint',
  title: 'Working Tree Freshness Fingerprint',
  objective: 'Detect source drift from current Git-visible working-tree bytes without direct donor Git ownership.',
  requiredBehaviors: [
    'fingerprint Git-visible working-tree bytes',
    'detect uncommitted byte changes',
    'provide bounded search evidence',
  ],
  requiredInvariants: [
    'Git process ownership remains GitHubGitService',
    'native blast evidence never claims complete graph coverage',
  ],
  explicitNonGoals: ['run donor daemon', 'install donor hooks', 'add model/network provider'],
  targetAuthorities: ['github_operations', 'workspace_containment'],
  verificationRequirements: ['working-tree drift', 'host-boundary replacement', 'bounded blast canary'],
  targetPaths: ['src/implementation/git-working-tree-source.ts', 'src/github/git-service.ts'],
  planFingerprint: '8'.repeat(64),
};

function plan(): RoutePlan {
  return {
    tier: 'structured', mode: 'capability_guided', domain: 'implementation', confidence: 1, risk: 'medium',
    recommendedCapabilities: [], requiredSkillLoads: [], allowedTools: ['write_file'],
    verification: { required: true, suggestedTools: ['read_file'] }, reasonCodes: ['real_graft_canary'],
  };
}

async function donorContains(root: string, file: string, needles: string[]) {
  const content = await readFile(path.join(root, file), 'utf8');
  for (const needle of needles) expect(content).toContain(needle);
}
async function fileSha256(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function exerciseGuardMode(
  mode: 'advisory' | 'enforce',
  strategy: ReturnType<typeof resolveImplementationStrategy>,
  manifestId: string,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-real-graft-${mode}-`));
  try {
    const defaults = loadConfig({}, root);
    const runtime = createRuntimeServices(
      [root], path.join(root, 'capabilities'), undefined,
      { ...defaults.memory, enabled: false, dbPath: path.join(root, 'memory.sqlite') },
      { ...defaults.execution, enabled: false },
      defaults.github, undefined, defaults.observability, 'canary', defaults.maintenance,
      { mode, leaseTtlMs: 60_000 },
    );
    try {
      const projection = {
        strategyId: strategy.strategyId,
        mode: strategy.mode,
        planFingerprint: strategy.planFingerprint,
        referenceSetFingerprint: strategy.referenceSetFingerprint,
        manifestId,
        state: 'ready' as const,
      };
      if (mode === 'advisory') {
        const route = runtime.routes.create(key.id, plan(), { projectId: root });
        const decision = await validateImplementationStrategyBeforeOperation(
          runtime, key, route, 'write_file', { path: path.join(root, 'src', 'canary.ts') },
        );
        expect(decision).toMatchObject({ mode: 'advisory', required: true, valid: false });
        return;
      }

      let route = runtime.routes.create(key.id, plan(), { projectId: root, implementationStrategy: projection });
      const lease = runtime.implementationStrategy.issueLease({
        principalId: key.id, projectId: root, routeContextId: route.routeContextId,
        strategy: projection, routeExpiresAt: Date.parse(route.expiresAt),
      });
      route = runtime.routes.updateImplementationStrategy(route.routeContextId, key.id, { leaseId: lease.leaseId });
      await expect(validateImplementationStrategyBeforeOperation(
        runtime, key, route, 'write_file', { path: path.join(root, 'src', 'canary.ts') },
      )).resolves.toMatchObject({ mode: 'enforce', required: true, valid: true, leaseId: lease.leaseId });
    } finally {
      await runtime.execution.close().catch(() => undefined);
      await runtime.memory.close().catch(() => undefined);
    }
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}
describe('real FEATURE_GRAFT canary', () => {
  canaryIt('transplants working-tree freshness through Agent Core host authorities', async () => {
    const gRoot = graftRoot!;
    const cRoot = cbmRoot!;
    const tRoot = targetRoot!;
    const statusBefore = git(tRoot, 'status', '--porcelain=v1');

    expect(git(gRoot, 'rev-parse', 'HEAD')).toBe(expectedGraftCommit);
    expect(git(gRoot, 'rev-parse', 'HEAD^{tree}')).toBe(expectedGraftTree);
    expect(git(cRoot, 'rev-parse', 'HEAD')).toBe(expectedCbmCommit);
    expect(git(cRoot, 'rev-parse', 'HEAD^{tree}')).toBe(expectedCbmTree);
    await donorContains(gRoot, 'src/graph/fingerprint.ts', ['export function probeDrift', 'contentHash(source)']);
    await donorContains(gRoot, 'src/ingest/fs.ts', ['gitVisibleFilesShallow', 'ls-files']);
    await donorContains(gRoot, 'test/graph-refresh.test.ts', ['probeDrift: clean after a build', 'uncommitted edit']);
    await donorContains(cRoot, 'src/daemon/service.c', ['cbm_daemon_build_fingerprint_file', 'cbm_sha256_update']);
    expect(await readFile(path.join(gRoot, 'LICENSE'), 'utf8')).toContain('MIT License');
    expect(await readFile(path.join(cRoot, 'LICENSE'), 'utf8')).toContain('MIT License');
    const notices = await readFile(path.join(tRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    expect(notices).toContain(expectedGraftCommit);
    expect(notices).toContain(expectedCbmCommit);
    expect(notices).toContain('Context Graph Engine contributors');
    expect(notices).toContain('Copyright (c) 2025 DeusData');

    const planFingerprint = await fileSha256(path.join(
      tRoot, 'docs', 'roadmap', 'agent-core-plan-driven-implementation-strategy-gate.md',
    ));
    const canaryFeature = { ...feature, planFingerprint };
    const references: ApprovedReference[] = [
      {
        referenceId: 'graft', kind: 'git_repo', repository: 'Black-Project-Agent-Core/Graft',
        commit: expectedGraftCommit, tree: expectedGraftTree,
        featureScope: 'working-tree freshness and Git-visible enumeration', approvalSource: 'operator',
      },
      {
        referenceId: 'cbm', kind: 'git_repo', repository: 'Black-Project-Agent-Core/codebase-memory-mcp',
        commit: expectedCbmCommit, tree: expectedCbmTree,
        featureScope: 'streamed SHA-256 fingerprint identity', approvalSource: 'operator',
      },
    ];
    const strategy = resolveImplementationStrategy({
      planRef: 'docs/roadmap/agent-core-plan-driven-implementation-strategy-gate.md',
      feature: canaryFeature,
      approvedReferences: references,
      referencePolicy: 'required',
    });
    expect(strategy.mode).toBe('FEATURE_GRAFT');
    const components: TransplantComponent[] = [
      {
        referenceId: 'graft', sourcePath: 'src/graph/fingerprint.ts', symbol: 'probeDrift',
        action: 'ADAPT', rationaleCode: 'WORKING_TREE_FRESHNESS_PATTERN',
        targetPath: 'src/implementation/git-working-tree-source.ts',
        evidenceRefs: ['graft:src/graph/fingerprint.ts#probeDrift'],
      },
      {
        referenceId: 'graft', sourcePath: 'src/util/id.ts', symbol: 'contentHash',
        action: 'ADAPT', rationaleCode: 'STABLE_SHA256_CONTENT_IDENTITY',
        targetPath: 'src/implementation/git-working-tree-source.ts',
        evidenceRefs: ['graft:src/util/id.ts#contentHash'],
      },
      {
        referenceId: 'graft', sourcePath: 'src/ingest/fs.ts', symbol: 'gitVisibleFilesShallow',
        action: 'REPLACE', rationaleCode: 'PRESERVE_HOST_GIT_AUTHORITY',
        targetPath: 'src/github/git-service.ts', targetBinding: 'GitHubService',
        evidenceRefs: ['graft:src/ingest/fs.ts#gitVisibleFilesShallow'],
      },
      {
        referenceId: 'cbm', sourcePath: 'src/daemon/service.c', symbol: 'cbm_daemon_build_fingerprint_file',
        action: 'ADAPT', rationaleCode: 'STREAMED_SHA256_FAIL_CLOSED',
        targetPath: 'src/implementation/git-working-tree-source.ts',
        evidenceRefs: ['cbm:src/daemon/service.c#cbm_daemon_build_fingerprint_file'],
      },
    ];
    const authority = evaluateAuthorityConflicts(components, [{
      referenceId: 'graft', sourcePath: 'src/ingest/fs.ts', symbol: 'gitVisibleFilesShallow',
      authorityId: 'github_operations', role: 'owner', targetBinding: 'GitHubService',
    }]);
    expect(authority.ready).toBe(true);
    expect(authority.conflicts[0]).toMatchObject({
      status: 'resolved', reasonCode: 'BOUND_TO_CANONICAL_AUTHORITY', targetBinding: 'GitHubService',
    });

    const manifest = buildTransplantManifest({
      strategy, feature: canaryFeature, analysisCompleteness: 'complete', components,
      donorTests: [{
        referenceId: 'graft', sourcePath: 'test/graph-refresh.test.ts',
        targetTest: 'tests/git-working-tree-code-intelligence.test.ts',
        behavior: 'working-tree bytes change freshness before commit',
      }],
      hostVerification: ['git-working-tree-source', 'github-git-authority'],
      authorityConflicts: authority.conflicts,
      createdAt: Date.now(),
    });
    expect(manifest.readiness).toBe('ready');
    const workspace = new WorkspacePolicy([tRoot]);
    const githubConfig = loadConfig({}, tRoot).github;
    const gitService = new GitHubGitService(
      githubConfig,
      new GitHubCredentialProvider(githubConfig),
      workspace,
    );
    const source = new GitWorkingTreeCodeIntelligenceSource(workspace, gitService, { maxFiles: 50_000 });
    const provider = new NativeSearchFallbackProvider(source);
    const fingerprint = await source.fingerprint(tRoot);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    await expect(source.fingerprint(tRoot)).resolves.toBe(fingerprint);

    const featureHits = await provider.findFeature({
      projectRoot: tRoot,
      query: 'GitWorkingTreeCodeIntelligenceSource',
      maxResults: 20,
    });
    expect(featureHits.completeness).toBe('partial');
    expect(featureHits.entryPoints.some((hit) => hit.path === 'src/implementation/git-working-tree-source.ts')).toBe(true);

    const verification = await new ImplementationVerificationCoordinator().verify({
      strategy,
      manifest,
      projectRoot: tRoot,
      changedPaths: ['src/implementation/git-working-tree-source.ts', 'src/github/git-service.ts'],
      changedSymbols: ['GitWorkingTreeCodeIntelligenceSource', 'listWorkingTreeFiles'],
      provider,
      verificationMode: 'canary',
      reusePosture: 'REQUIRES_ATTRIBUTION',
      donorBehavior: [
        {
          behaviorId: 'working-tree-byte-freshness', disposition: 'preserved',
          evidenceRefs: ['graft:test/graph-refresh.test.ts#probeDrift', 'target:git-working-tree-code-intelligence'],
        },
        {
          behaviorId: 'direct-git-spawn', disposition: 'intentionally_changed',
          planReasonCode: 'PRESERVE_GITHUB_AUTHORITY',
          evidenceRefs: ['graft:src/ingest/fs.ts#gitVisibleFilesShallow', 'target:GitHubGitService#listWorkingTreeFiles'],
        },
      ],
      hostIntegration: [
        { verificationId: 'git-working-tree-source', status: 'passed', evidenceRefs: ['vitest:git-working-tree-code-intelligence'] },
        { verificationId: 'github-git-authority', status: 'passed', evidenceRefs: ['vitest:github-git'] },
      ],
    });
    expect(verification.status).toBe('verified');
    expect(verification.reasonCodes).toContain('BLAST_RADIUS_PARTIAL_CANARY');
    expect(verification.blastRadius).toMatchObject({ providerId: 'native-search-fallback', completeness: 'partial' });
    expect(verification.blastRadius.affectedCount).toBeGreaterThan(0);
    expect(verification.provenance.reusePosture).toBe('REQUIRES_ATTRIBUTION');
    await exerciseGuardMode('advisory', strategy, manifest.manifestId);
    await exerciseGuardMode('enforce', strategy, manifest.manifestId);

    const serialized = JSON.stringify(verification);
    expect(serialized).not.toContain('Permission is hereby granted');
    expect(serialized).not.toContain('cbm_sha256_update(&context');
    expect(verification.memoryCandidate?.value).toMatchObject({
      strategyId: strategy.strategyId,
      manifestId: manifest.manifestId,
      reusePosture: 'REQUIRES_ATTRIBUTION',
    });

    const statusAfter = git(tRoot, 'status', '--porcelain=v1');
    expect(statusAfter).toBe(statusBefore);
  }, 60_000);
});