import { createHash } from 'node:crypto';

export type ImplementationStrategyMode = 'GREENFIELD' | 'FEATURE_GRAFT';
export type ReferenceKind = 'git_repo' | 'local_repo' | 'source_bundle';
export type ReferenceAvailability = 'available' | 'unavailable' | 'ambiguous';

export interface ApprovedReference {
  referenceId: string;
  kind: ReferenceKind;
  repository?: string;
  localPath?: string;
  commit?: string;
  tree?: string;
  bundleHash?: string;
  featureScope: string;
  approvalSource: string;
  availability?: ReferenceAvailability;
  required?: boolean;
}

export interface FeatureContract {
  featureId: string;
  title: string;
  objective: string;
  requiredBehaviors: string[];
  requiredInvariants: string[];
  explicitNonGoals: string[];
  targetAuthorities: string[];
  verificationRequirements: string[];
  targetPaths?: string[];
  planFingerprint: string;
}
export type ImplementationStrategyReasonCode =
  | 'NO_APPROVED_REFERENCE'
  | 'APPROVED_REFERENCE_PRESENT'
  | 'MULTIPLE_APPROVED_REFERENCES'
  | 'PLAN_REQUIRES_REFERENCE'
  | 'REFERENCE_UNAVAILABLE'
  | 'REFERENCE_AMBIGUOUS';

export interface ResolveImplementationStrategyRequest {
  planRef: string;
  feature: FeatureContract;
  approvedReferences?: ApprovedReference[];
  referencePolicy?: 'optional' | 'required';
}

export interface ImplementationStrategyResolution {
  mode: ImplementationStrategyMode;
  planRef: string;
  featureId: string;
  approvedReferences: ApprovedReference[];
  reasonCodes: ImplementationStrategyReasonCode[];
  planFingerprint: string;
  referenceSetFingerprint: string;
  strategyFingerprint: string;
}

export class ImplementationStrategyResolutionError extends Error {
  constructor(readonly code: ImplementationStrategyReasonCode, message: string) {
    super(message);
    this.name = 'ImplementationStrategyResolutionError';
  }
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

function text(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function assertHash(value: string | undefined, label: string): string {
  const normalized = text(value);
  if (!normalized || !/^[0-9a-f]{40,64}$/i.test(normalized)) {
    throw new ImplementationStrategyResolutionError(
      'REFERENCE_AMBIGUOUS', `${label} must be an immutable Git/hash identity`,
    );
  }
  return normalized.toLowerCase();
}
function normalizeReference(reference: ApprovedReference): ApprovedReference {
  const referenceId = text(reference.referenceId);
  const featureScope = text(reference.featureScope);
  const approvalSource = text(reference.approvalSource);
  if (!referenceId || !featureScope || !approvalSource) {
    throw new ImplementationStrategyResolutionError(
      'REFERENCE_AMBIGUOUS', 'Approved reference metadata is incomplete',
    );
  }

  const availability = reference.availability ?? 'available';
  if (availability === 'unavailable') {
    throw new ImplementationStrategyResolutionError(
      'REFERENCE_UNAVAILABLE', `Approved reference ${referenceId} is unavailable`,
    );
  }
  if (availability === 'ambiguous') {
    throw new ImplementationStrategyResolutionError(
      'REFERENCE_AMBIGUOUS', `Approved reference ${referenceId} is ambiguous`,
    );
  }

  const base = {
    referenceId,
    kind: reference.kind,
    featureScope,
    approvalSource,
    availability: 'available' as const,
    required: reference.required === true,
  };
  if (reference.kind === 'git_repo') {
    const repository = text(reference.repository);
    if (!repository) {
      throw new ImplementationStrategyResolutionError(
        'REFERENCE_AMBIGUOUS', `Git reference ${referenceId} is missing repository identity`,
      );
    }
    return {
      ...base,
      repository,
      commit: assertHash(reference.commit, `${referenceId}.commit`),
      tree: assertHash(reference.tree, `${referenceId}.tree`),
    };
  }

  if (reference.kind === 'source_bundle') {
    return {
      ...base,
      bundleHash: assertHash(reference.bundleHash, `${referenceId}.bundleHash`),
    };
  }

  const localPath = text(reference.localPath);
  if (!localPath) {
    throw new ImplementationStrategyResolutionError(
      'REFERENCE_AMBIGUOUS', `Local reference ${referenceId} is missing localPath`,
    );
  }
  const hasGitIdentity = Boolean(reference.commit || reference.tree);
  if (hasGitIdentity) {
    return {
      ...base,
      localPath,
      commit: assertHash(reference.commit, `${referenceId}.commit`),
      tree: assertHash(reference.tree, `${referenceId}.tree`),
    };
  }
  return {
    ...base,
    localPath,
    bundleHash: assertHash(reference.bundleHash, `${referenceId}.bundleHash`),
  };
}
function normalizeReferences(references: ApprovedReference[]): ApprovedReference[] {
  const normalized = references.map(normalizeReference)
    .sort((left, right) => left.referenceId.localeCompare(right.referenceId));
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (previous && current && previous.referenceId === current.referenceId) {
      throw new ImplementationStrategyResolutionError(
        'REFERENCE_AMBIGUOUS', `Duplicate referenceId: ${current.referenceId}`,
      );
    }
  }
  return normalized;
}

export function resolveImplementationStrategy(
  request: ResolveImplementationStrategyRequest,
): ImplementationStrategyResolution {
  const planRef = text(request.planRef);
  const featureId = text(request.feature.featureId);
  const planFingerprint = text(request.feature.planFingerprint);
  if (!planRef || !featureId || !planFingerprint) {
    throw new Error('Implementation strategy requires planRef, featureId, and planFingerprint');
  }

  const approvedReferences = normalizeReferences(request.approvedReferences ?? []);
  if (approvedReferences.length === 0 && request.referencePolicy === 'required') {
    throw new ImplementationStrategyResolutionError(
      'PLAN_REQUIRES_REFERENCE', 'The plan requires an approved implementation reference',
    );
  }

  const mode: ImplementationStrategyMode = approvedReferences.length === 0
    ? 'GREENFIELD'
    : 'FEATURE_GRAFT';
  const reasonCodes: ImplementationStrategyReasonCode[] = mode === 'GREENFIELD'
    ? ['NO_APPROVED_REFERENCE']
    : ['APPROVED_REFERENCE_PRESENT'];
  if (approvedReferences.length > 1) reasonCodes.push('MULTIPLE_APPROVED_REFERENCES');

  const referenceSetFingerprint = sha256(approvedReferences);
  const strategyFingerprint = sha256({
    mode,
    planRef,
    featureId,
    planFingerprint,
    referenceSetFingerprint,
  });

  return {
    mode,
    planRef,
    featureId,
    approvedReferences,
    reasonCodes,
    planFingerprint,
    referenceSetFingerprint,
    strategyFingerprint,
  };
}