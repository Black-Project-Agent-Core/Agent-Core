import { createHash } from 'node:crypto';
import type { AnalysisCompleteness } from './code-intelligence.js';
import type { AuthorityConflict } from './authority-conflicts.js';
import type {
  FeatureContract,
  ImplementationStrategyResolution,
} from './strategy.js';

export type TransplantAction = 'KEEP' | 'ADAPT' | 'REPLACE' | 'DROP' | 'REIMPLEMENT';

export interface TransplantComponent {
  referenceId: string;
  sourcePath: string;
  symbol?: string;
  action: TransplantAction;
  rationaleCode: string;
  targetPath?: string;
  targetBinding?: string;
  evidenceRefs: string[];
}

export interface DonorTestMapping {
  referenceId: string;
  sourcePath: string;
  targetTest?: string;
  behavior: string;
}

export interface TransplantManifest {
  manifestId: string;
  strategyId: string;
  featureContractHash: string;
  donorSetHash: string;
  analysisCompleteness: AnalysisCompleteness;
  components: TransplantComponent[];
  authorityConflicts: AuthorityConflict[];
  readiness: 'ready' | 'blocked';
  donorTests: DonorTestMapping[];
  hostVerification: string[];
  createdAt: number;
}
export type TransplantManifestErrorCode =
  | 'FEATURE_GRAFT_MANIFEST_REQUIRED'
  | 'DONOR_ANALYSIS_INSUFFICIENT'
  | 'TRANSPLANT_COMPONENT_INVALID'
  | 'TRANSPLANT_COMPONENT_DUPLICATE'
  | 'TRANSPLANT_REFERENCE_NOT_APPROVED';

export class TransplantManifestError extends Error {
  constructor(readonly code: TransplantManifestErrorCode, message: string) {
    super(message);
    this.name = 'TransplantManifestError';
  }
}

export interface BuildTransplantManifestRequest {
  strategy: ImplementationStrategyResolution;
  feature: FeatureContract;
  analysisCompleteness: AnalysisCompleteness;
  components: TransplantComponent[];
  donorTests: DonorTestMapping[];
  hostVerification: string[];
  authorityConflicts?: AuthorityConflict[];
  createdAt: number;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}
function normalizeComponent(component: TransplantComponent): TransplantComponent {
  const referenceId = component.referenceId.trim();
  const sourcePath = component.sourcePath.trim();
  const symbol = component.symbol?.trim();
  const rationaleCode = component.rationaleCode.trim();
  const evidenceRefs = [...new Set(component.evidenceRefs.map((item) => item.trim()).filter(Boolean))].sort();
  if (!referenceId || !sourcePath || !rationaleCode || evidenceRefs.length === 0) {
    throw new TransplantManifestError(
      'TRANSPLANT_COMPONENT_INVALID',
      'Every transplant component requires donor identity, source path, rationale, and evidence',
    );
  }
  return {
    referenceId,
    sourcePath,
    ...(symbol ? { symbol } : {}),
    action: component.action,
    rationaleCode,
    ...(component.targetPath?.trim() ? { targetPath: component.targetPath.trim() } : {}),
    ...(component.targetBinding?.trim() ? { targetBinding: component.targetBinding.trim() } : {}),
    evidenceRefs,
  };
}

function componentKey(component: TransplantComponent): string {
  return [component.referenceId, component.sourcePath, component.symbol ?? ''].join('\u0000');
}

function normalizeComponents(components: TransplantComponent[]): TransplantComponent[] {
  const normalized = components.map(normalizeComponent)
    .sort((left, right) => componentKey(left).localeCompare(componentKey(right)));
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (previous && current && componentKey(previous) === componentKey(current)) {
      throw new TransplantManifestError('TRANSPLANT_COMPONENT_DUPLICATE', `Duplicate donor component: ${current.sourcePath}`);
    }
  }
  return normalized;
}
export function buildTransplantManifest(
  request: BuildTransplantManifestRequest,
): TransplantManifest {
  if (request.strategy.mode !== 'FEATURE_GRAFT') {
    throw new TransplantManifestError(
      'FEATURE_GRAFT_MANIFEST_REQUIRED',
      'A transplant manifest can only be built for FEATURE_GRAFT strategy',
    );
  }
  if (request.analysisCompleteness === 'insufficient') {
    throw new TransplantManifestError(
      'DONOR_ANALYSIS_INSUFFICIENT',
      'Donor anatomy evidence is insufficient for transplant manifest readiness',
    );
  }
  if (!Number.isFinite(request.createdAt) || request.createdAt < 0) {
    throw new TransplantManifestError('TRANSPLANT_COMPONENT_INVALID', 'Manifest createdAt must be finite');
  }

  const components = normalizeComponents(request.components);
  const approvedReferenceIds = new Set(request.strategy.approvedReferences.map((entry) => entry.referenceId));
  for (const component of components) {
    if (!approvedReferenceIds.has(component.referenceId)) {
      throw new TransplantManifestError(
        'TRANSPLANT_REFERENCE_NOT_APPROVED',
        `Transplant component references an unapproved donor: ${component.referenceId}`,
      );
    }
  }

  const donorTests = [...request.donorTests]
    .map((item) => ({ ...item, referenceId: item.referenceId.trim(), sourcePath: item.sourcePath.trim(), behavior: item.behavior.trim() }))
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
  const hostVerification = [...new Set(request.hostVerification.map((item) => item.trim()).filter(Boolean))].sort();
  const authorityConflicts = [...(request.authorityConflicts ?? [])].sort((left, right) => left.conflictId.localeCompare(right.conflictId));
  const featureContractHash = sha256(request.feature);
  const donorSetHash = request.strategy.referenceSetFingerprint;
  const identity = {
    strategyId: request.strategy.strategyId,
    featureContractHash,
    donorSetHash,
    analysisCompleteness: request.analysisCompleteness,
    components,
    donorTests,
    hostVerification,
    authorityConflicts,
  };
  const manifestId = `manifest:${sha256(identity)}`;

  return {
    manifestId,
    strategyId: request.strategy.strategyId,
    featureContractHash,
    donorSetHash,
    analysisCompleteness: request.analysisCompleteness,
    components,
    readiness: authorityConflicts.some((item) => item.status === 'blocking') ? 'blocked' : 'ready',
    donorTests,
    hostVerification,
    authorityConflicts,
    createdAt: request.createdAt,
  };
}
