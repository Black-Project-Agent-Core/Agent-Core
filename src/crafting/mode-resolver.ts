import { createHash } from 'node:crypto';
import type {
  CraftingFeatureContract,
  CraftingMode,
  CraftingModeDecision,
  CraftingReasonCode,
  CraftingReference,
  ResolveCraftingModeRequest,
} from './types.js';

export type {
  CraftingFeatureContract,
  CraftingMode,
  CraftingModeDecision,
  CraftingReference,
  ResolveCraftingModeRequest,
} from './types.js';

export class CraftingModeResolutionError extends Error {
  constructor(readonly code: CraftingReasonCode, message: string) {
    super(message);
    this.name = 'CraftingModeResolutionError';
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
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

function immutableHash(value: string | undefined, label: string): string {
  const normalized = text(value)?.toLowerCase();
  if (!normalized || !/^[0-9a-f]{40,64}$/.test(normalized)) {
    throw new CraftingModeResolutionError(
      'REFERENCE_AMBIGUOUS',
      `${label} must be an immutable Git/hash identity`,
    );
  }
  return normalized;
}

function normalizedTextList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
function normalizeFeature(feature: CraftingFeatureContract): CraftingFeatureContract {
  const featureId = text(feature.featureId);
  const title = text(feature.title);
  const objective = text(feature.objective);
  const planFingerprint = text(feature.planFingerprint)?.toLowerCase();
  if (!featureId || !title || !objective || !planFingerprint || !/^[0-9a-f]{64}$/.test(planFingerprint)) {
    throw new Error('Crafting feature requires featureId, title, objective, and 64-char planFingerprint');
  }
  return {
    featureId,
    title,
    objective,
    requiredBehaviors: normalizedTextList(feature.requiredBehaviors),
    requiredInvariants: normalizedTextList(feature.requiredInvariants),
    explicitNonGoals: normalizedTextList(feature.explicitNonGoals),
    targetAuthorities: normalizedTextList(feature.targetAuthorities),
    verificationRequirements: normalizedTextList(feature.verificationRequirements),
    ...(feature.targetPaths ? { targetPaths: normalizedTextList(feature.targetPaths) } : {}),
    planFingerprint,
  };
}

function normalizeReference(reference: CraftingReference): CraftingReference {
  const referenceId = text(reference.referenceId);
  const featureScope = text(reference.featureScope);
  const approvalSource = text(reference.approvalSource);
  if (!referenceId || !featureScope || !approvalSource) {
    throw new CraftingModeResolutionError('REFERENCE_AMBIGUOUS', 'Approved reference metadata is incomplete');
  }
  const availability = reference.availability ?? 'available';
  if (availability === 'unavailable') {
    throw new CraftingModeResolutionError('REFERENCE_UNAVAILABLE', `Reference ${referenceId} is unavailable`);
  }
  if (availability === 'ambiguous') {
    throw new CraftingModeResolutionError('REFERENCE_AMBIGUOUS', `Reference ${referenceId} is ambiguous`);
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
    if (!repository) throw new CraftingModeResolutionError('REFERENCE_AMBIGUOUS', `${referenceId} has no repository`);
    return {
      ...base,
      repository,
      commit: immutableHash(reference.commit, `${referenceId}.commit`),
      tree: immutableHash(reference.tree, `${referenceId}.tree`),
    };
  }
  if (reference.kind === 'source_bundle') {
    return { ...base, bundleHash: immutableHash(reference.bundleHash, `${referenceId}.bundleHash`) };
  }
  const localPath = text(reference.localPath);
  if (!localPath) throw new CraftingModeResolutionError('REFERENCE_AMBIGUOUS', `${referenceId} has no localPath`);
  if (reference.commit || reference.tree) {
    return {
      ...base,
      localPath,
      commit: immutableHash(reference.commit, `${referenceId}.commit`),
      tree: immutableHash(reference.tree, `${referenceId}.tree`),
    };
  }
  return { ...base, localPath, bundleHash: immutableHash(reference.bundleHash, `${referenceId}.bundleHash`) };
}

function normalizeReferences(references: CraftingReference[]): CraftingReference[] {
  const normalized = references.map(normalizeReference)
    .sort((left, right) => left.referenceId.localeCompare(right.referenceId));
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (previous && current && previous.referenceId === current.referenceId) {
      throw new CraftingModeResolutionError('REFERENCE_AMBIGUOUS', `Duplicate referenceId: ${current.referenceId}`);
    }
  }
  return normalized;
}

export function resolveCraftingMode(request: ResolveCraftingModeRequest): CraftingModeDecision {
  const routeContextId = text(request.routeContextId);
  const projectId = text(request.projectId);
  if (!routeContextId || !projectId) throw new Error('Crafting mode requires routeContextId and projectId');
  const feature = normalizeFeature(request.feature);
  const references = normalizeReferences(request.references ?? []);
  if (references.length === 0 && request.referencePolicy === 'required') {
    throw new CraftingModeResolutionError('REFERENCE_REQUIRED', 'The task requires an approved implementation reference');
  }
  const mode: CraftingMode = references.length === 0 ? 'BUILD_FROM_ZERO' : 'FEATURE_TRANSPLANTATION';
  const reasonCodes: CraftingReasonCode[] = mode === 'BUILD_FROM_ZERO'
    ? ['NO_APPROVED_REFERENCE']
    : ['APPROVED_REFERENCE_PRESENT'];
  if (references.length > 1) reasonCodes.push('MULTIPLE_APPROVED_REFERENCES');
  const featureContractHash = sha256(feature);
  const referenceSetHash = sha256(references);
  // Crafting identity represents the durable coding objective, not a single route/session.
  // Route context is intentionally excluded so resumed sessions can obtain fresh leases.
  const craftingHash = sha256({ projectId, mode, featureContractHash, referenceSetHash });
  return {
    craftingId: `craft:${craftingHash.slice(0, 32)}`,
    routeContextId,
    projectId,
    mode,
    featureContractHash,
    references,
    referenceSetHash,
    reasonCodes,
  };
}
