import type { RuntimeAuditLogger } from '../logging/audit-log.js';
import { redactMemoryText } from '../memory/redaction.js';
import { AgentCoreRouteError, type RouteContextStore } from '../runtime/route-context-store.js';
import type { BlastRadiusResult, CodeIntelligenceProvider } from './code-intelligence.js';
import type { ImplementationStrategyResolution } from './strategy.js';
import type { TransplantManifest } from './transplant-manifest.js';

export type DonorBehaviorDisposition =
  | 'preserved'
  | 'intentionally_changed'
  | 'dropped'
  | 'unverified';

export interface DonorBehaviorVerification {
  behaviorId: string;
  disposition: DonorBehaviorDisposition;
  evidenceRefs: string[];
  planReasonCode?: string;
}

export interface HostIntegrationVerification {
  verificationId: string;
  status: 'passed' | 'failed';
  evidenceRefs: string[];
}

export type ReusePosture =
  | 'COMPATIBLE'
  | 'REQUIRES_ATTRIBUTION'
  | 'REIMPLEMENT_ONLY'
  | 'UNKNOWN_BLOCKING';

export interface ImplementationVerificationRequest {
  strategy: ImplementationStrategyResolution;
  manifest?: TransplantManifest;
  projectRoot: string;
  changedPaths?: string[];
  changedSymbols?: string[];
  provider: CodeIntelligenceProvider;
  verificationMode: 'stable' | 'canary';
  reusePosture: ReusePosture;
  donorBehavior: DonorBehaviorVerification[];
  hostIntegration: HostIntegrationVerification[];
}
export interface SafeImplementationProvenance {
  donors: Array<{
    referenceId: string;
    kind: string;
    repository?: string;
    commit?: string;
    tree?: string;
    bundleHash?: string;
  }>;
  components: Array<{
    referenceId: string;
    sourcePath: string;
    symbol?: string;
    action: string;
    rationaleCode: string;
    targetPath?: string;
    targetBinding?: string;
    evidenceRefs: string[];
  }>;
  reusePosture: ReusePosture;
}

export interface ImplementationContinuityProjection {
  strategyId: string;
  mode: ImplementationStrategyResolution['mode'];
  referenceIds: string[];
  manifestId: string | null;
  verificationStatus: 'verified' | 'blocked';
  blockingReasonCodes: string[];
}

export interface ImplementationMemoryCandidate {
  kind: 'decision';
  canonicalKey: string;
  value: Record<string, unknown>;
  importance: number;
  sourceType: 'implementation_strategy';
  sourceRef: string;
}

export interface ImplementationVerificationResult {
  status: 'verified' | 'blocked';
  strategyId: string;
  planFingerprint: string;
  referenceSetFingerprint: string;
  manifestId: string | null;
  donorParity: 'passed' | 'blocked' | 'not_applicable';
  hostIntegration: 'passed' | 'failed';
  blastRadius: Pick<BlastRadiusResult, 'providerId' | 'completeness'> & { affectedCount: number };
  reasonCodes: string[];
  provenance: SafeImplementationProvenance;
  continuity: ImplementationContinuityProjection;
  memoryCandidate: ImplementationMemoryCandidate | null;
}
function boundedRedacted(value: string, max = 512): string {
  return redactMemoryText(value.slice(0, max)).text;
}

function safeEvidenceRefs(values: string[]): string[] {
  return [...new Set(values.map((value) => boundedRedacted(value)).filter(Boolean))].sort();
}

function provenance(request: ImplementationVerificationRequest): SafeImplementationProvenance {
  return {
    donors: request.strategy.approvedReferences.map((reference) => ({
      referenceId: reference.referenceId,
      kind: reference.kind,
      ...(reference.repository ? { repository: reference.repository } : {}),
      ...(reference.commit ? { commit: reference.commit } : {}),
      ...(reference.tree ? { tree: reference.tree } : {}),
      ...(reference.bundleHash ? { bundleHash: reference.bundleHash } : {}),
    })),
    components: (request.manifest?.components ?? []).map((component) => ({
      referenceId: component.referenceId,
      sourcePath: component.sourcePath,
      ...(component.symbol ? { symbol: component.symbol } : {}),
      action: component.action,
      rationaleCode: component.rationaleCode,
      ...(component.targetPath ? { targetPath: component.targetPath } : {}),
      ...(component.targetBinding ? { targetBinding: component.targetBinding } : {}),
      evidenceRefs: safeEvidenceRefs(component.evidenceRefs),
    })),
    reusePosture: request.reusePosture,
  };
}

function donorParity(request: ImplementationVerificationRequest): 'passed' | 'blocked' | 'not_applicable' {
  if (request.strategy.mode === 'GREENFIELD') return 'not_applicable';
  if (request.donorBehavior.length === 0) return 'blocked';
  for (const behavior of request.donorBehavior) {
    if (behavior.disposition === 'unverified' || safeEvidenceRefs(behavior.evidenceRefs).length === 0) return 'blocked';
    if ((behavior.disposition === 'intentionally_changed' || behavior.disposition === 'dropped')
      && !behavior.planReasonCode?.trim()) return 'blocked';
  }
  return 'passed';
}

function hostIntegration(request: ImplementationVerificationRequest): 'passed' | 'failed' {
  if (request.hostIntegration.length === 0) return 'failed';
  return request.hostIntegration.every((item) => item.status === 'passed' && safeEvidenceRefs(item.evidenceRefs).length > 0)
    ? 'passed'
    : 'failed';
}
function classificationCounts(value: SafeImplementationProvenance): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const component of value.components) counts[component.action] = (counts[component.action] ?? 0) + 1;
  return counts;
}

function manifestReasonCodes(request: ImplementationVerificationRequest): string[] {
  if (request.strategy.mode !== 'FEATURE_GRAFT') return [];
  const manifest = request.manifest;
  if (!manifest) return ['IMPLEMENTATION_MANIFEST_REQUIRED'];
  if (manifest.strategyId !== request.strategy.strategyId
    || manifest.donorSetHash !== request.strategy.referenceSetFingerprint) {
    return ['IMPLEMENTATION_MANIFEST_STALE'];
  }
  if (manifest.readiness === 'blocked') return ['IMPLEMENTATION_AUTHORITY_CONFLICT'];
  return [];
}

function licenseReasonCodes(request: ImplementationVerificationRequest): string[] {
  if (request.reusePosture === 'UNKNOWN_BLOCKING') return ['IMPLEMENTATION_LICENSE_BLOCKED'];
  if (request.reusePosture === 'REIMPLEMENT_ONLY') {
    const directReuse = (request.manifest?.components ?? [])
      .some((component) => component.action === 'KEEP' || component.action === 'ADAPT');
    if (directReuse) return ['IMPLEMENTATION_LICENSE_BLOCKED'];
  }
  return [];
}

function provenanceComplete(request: ImplementationVerificationRequest, safe: SafeImplementationProvenance): boolean {
  if (request.strategy.mode === 'GREENFIELD') return true;
  if (!request.manifest || safe.donors.length === 0 || safe.components.length === 0) return false;
  if (safe.components.some((component) => component.evidenceRefs.length === 0)) return false;
  return safe.donors.every((donor) => {
    if (donor.kind === 'source_bundle') return Boolean(donor.bundleHash);
    return donor.kind === 'git_repo' ? Boolean(donor.commit && donor.tree) : true;
  });
}
export class ImplementationVerificationCoordinator {
  constructor(private readonly audit?: RuntimeAuditLogger) {}

  async verify(request: ImplementationVerificationRequest): Promise<ImplementationVerificationResult> {
    const parity = donorParity(request);
    const integration = hostIntegration(request);
    const blast = await request.provider.blastRadius({
      projectRoot: request.projectRoot,
      changedPaths: request.changedPaths,
      changedSymbols: request.changedSymbols,
      maxDepth: 4,
      maxResults: 200,
    });
    const safe = provenance(request);
    const reasons = [
      ...manifestReasonCodes(request),
      ...licenseReasonCodes(request),
    ];
    if (parity === 'blocked') reasons.push('IMPLEMENTATION_DONOR_PARITY_UNVERIFIED');
    if (integration === 'failed') reasons.push('IMPLEMENTATION_HOST_INTEGRATION_FAILED');
    if (!provenanceComplete(request, safe)) reasons.push('IMPLEMENTATION_PROVENANCE_INCOMPLETE');

    if (blast.completeness === 'insufficient'
      || (blast.completeness === 'partial' && request.verificationMode === 'stable')) {
      reasons.push('BLAST_RADIUS_INCOMPLETE');
    } else if (blast.completeness === 'partial') {
      reasons.push('BLAST_RADIUS_PARTIAL_CANARY');
    }

    const blockingReasons = reasons.filter((code) => code !== 'BLAST_RADIUS_PARTIAL_CANARY');
    const status: 'verified' | 'blocked' = blockingReasons.length === 0 ? 'verified' : 'blocked';
    const manifestId = request.manifest?.manifestId ?? null;
    const continuity: ImplementationContinuityProjection = {
      strategyId: request.strategy.strategyId,
      mode: request.strategy.mode,
      referenceIds: request.strategy.approvedReferences.map((entry) => entry.referenceId),
      manifestId,
      verificationStatus: status,
      blockingReasonCodes: [...blockingReasons].sort(),
    };    const memoryCandidate: ImplementationMemoryCandidate | null = status === 'verified'
      ? {
        kind: 'decision',
        canonicalKey: `implementation.strategy.${request.strategy.strategyId}`,
        value: {
          strategyId: request.strategy.strategyId,
          mode: request.strategy.mode,
          manifestId,
          donors: safe.donors,
          componentCounts: classificationCounts(safe),
          donorParity: parity,
          hostIntegration: integration,
          blastRadius: {
            providerId: blast.providerId,
            completeness: blast.completeness,
            affectedCount: blast.affected.length,
          },
          reusePosture: request.reusePosture,
        },
        importance: 0.8,
        sourceType: 'implementation_strategy',
        sourceRef: request.strategy.strategyId,
      }
      : null;

    const result: ImplementationVerificationResult = {
      status,
      strategyId: request.strategy.strategyId,
      planFingerprint: request.strategy.planFingerprint,
      referenceSetFingerprint: request.strategy.referenceSetFingerprint,
      manifestId,
      donorParity: parity,
      hostIntegration: integration,
      blastRadius: {
        providerId: blast.providerId,
        completeness: blast.completeness,
        affectedCount: blast.affected.length,
      },
      reasonCodes: [...new Set(reasons)].sort(),
      provenance: safe,
      continuity,
      memoryCandidate,
    };
    this.audit?.logRuntime(
      'implementation',
      status === 'verified' ? 'verification_completed' : 'verification_blocked',
      {
        strategyId: request.strategy.strategyId,
        mode: request.strategy.mode,
        manifestId,
        donorCount: safe.donors.length,
        componentCounts: classificationCounts(safe),
        donorParity: parity,
        hostIntegration: integration,
        blastProvider: blast.providerId,
        blastCompleteness: blast.completeness,
        blastAffectedCount: blast.affected.length,
        reusePosture: request.reusePosture,
        status,
        reasonCodes: result.reasonCodes,
      },
    );
    return result;
  }
}

export function applyImplementationVerificationToRoute(
  store: RouteContextStore,
  routeContextId: string,
  principalId: string,
  result: ImplementationVerificationResult,
) {
  const route = store.getOwned(routeContextId, principalId);
  const strategy = route.implementationStrategy;
  const identityMatches = strategy
    && strategy.strategyId === result.strategyId
    && strategy.planFingerprint === result.planFingerprint
    && strategy.referenceSetFingerprint === result.referenceSetFingerprint
    && (strategy.manifestId ?? null) === result.manifestId;
  if (!identityMatches) {
    throw new AgentCoreRouteError(
      'ROUTE_IMPLEMENTATION_STRATEGY_STALE',
      'Verification result does not match the active route strategy identity',
    );
  }
  return store.updateImplementationStrategy(routeContextId, principalId, {
    state: result.status === 'verified' ? 'closed' : 'verification_pending',
  });
}