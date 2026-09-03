import type { ContinuityCheckpointRecord } from '../continuity/store.js';
import type { ContinuityCheckpointInput } from '../continuity/types.js';
import type { MemoryPostflightCandidate } from '../memory/types.js';
import type { RouteCraftingProjection } from '../runtime/route-context-store.js';
import type { CraftPlan } from './craft-plan.js';
import type { CraftingModeDecision, CraftingReference } from './types.js';
import type { CraftingVerificationResult } from './verification.js';

export interface CraftingContinuityReference {
  referenceId: string;
  kind: CraftingReference['kind'];
  repository?: string;
  commit?: string;
  tree?: string;
  bundleHash?: string;
}

export interface CraftingContinuityProjection {
  craftingId: string;
  mode: CraftingModeDecision['mode'];
  featureContractHash: string;
  referenceSetHash: string;
  craftPlanId: string;
  groundingReceiptId?: string;
  references: CraftingContinuityReference[];
  currentSparepartId?: string;
  executionRunId?: string;
  verificationStatus: 'pending' | 'verified' | 'blocked';
  blockingReason?: string;
}

const LEGACY_DECISION_KEY = 'real_steel_crafting_state';
export const CRAFTING_CONTINUITY_EVIDENCE_REF = 'agent-core:real-steel-crafting-state:v1';
const VERSION = 1;

function bounded(value: string | undefined, max = 5_000): string | undefined {
  const normalized = value?.normalize('NFKC').trim();
  if (!normalized) return undefined;
  if (normalized.length > max) throw new Error('CRAFTING_CONTINUITY_VALUE_TOO_LONG');
  return normalized;
}

function normalizeReferences(values: CraftingContinuityReference[]): CraftingContinuityReference[] {
  return values.map((reference) => ({
    referenceId: bounded(reference.referenceId, 200)!,
    kind: reference.kind,
    ...(bounded(reference.repository, 500) ? { repository: bounded(reference.repository, 500) } : {}),
    ...(bounded(reference.commit, 128) ? { commit: bounded(reference.commit, 128) } : {}),
    ...(bounded(reference.tree, 128) ? { tree: bounded(reference.tree, 128) } : {}),
    ...(bounded(reference.bundleHash, 128) ? { bundleHash: bounded(reference.bundleHash, 128) } : {}),
  })).sort((left, right) => left.referenceId.localeCompare(right.referenceId));
}

function normalizedProjection(input: CraftingContinuityProjection): CraftingContinuityProjection {
  const craftingId = bounded(input.craftingId, 500);
  const featureContractHash = bounded(input.featureContractHash, 128);
  const referenceSetHash = bounded(input.referenceSetHash, 128);
  const craftPlanId = bounded(input.craftPlanId, 500);
  if (!craftingId || !featureContractHash || !referenceSetHash || !craftPlanId) {
    throw new Error('CRAFTING_CONTINUITY_IDENTITY_REQUIRED');
  }
  return {
    craftingId,
    mode: input.mode,
    featureContractHash,
    referenceSetHash,
    craftPlanId,
    ...(bounded(input.groundingReceiptId, 500) ? { groundingReceiptId: bounded(input.groundingReceiptId, 500) } : {}),
    references: normalizeReferences(input.references),
    ...(bounded(input.currentSparepartId, 500) ? { currentSparepartId: bounded(input.currentSparepartId, 500) } : {}),
    ...(bounded(input.executionRunId, 500) ? { executionRunId: bounded(input.executionRunId, 500) } : {}),
    verificationStatus: input.verificationStatus,
    ...(bounded(input.blockingReason, 2_000) ? { blockingReason: bounded(input.blockingReason, 2_000) } : {}),
  };
}

export function buildCraftingCheckpointInput(
  routeContextId: string,
  projection: CraftingContinuityProjection,
  options: { status?: ContinuityCheckpointInput['status'] } = {},
): ContinuityCheckpointInput {
  const state = normalizedProjection(projection);
  const payload = JSON.stringify({ version: VERSION, ...state });
  return {
    routeContextId,
    status: options.status ?? (state.verificationStatus === 'verified' ? 'completed' : 'running'),
    summary: `Real Steel crafting checkpoint ${state.craftingId}`,
    evidence: [
      { type: 'tool', ref: CRAFTING_CONTINUITY_EVIDENCE_REF, result: payload },
      { type: 'hash', ref: `craft-plan:${state.craftPlanId}`, result: state.craftPlanId },
      { type: 'hash', ref: `reference-set:${state.referenceSetHash}`, result: state.referenceSetHash },
    ],
    ...(state.blockingReason ? { blockers: [{ code: 'CRAFTING_BLOCKED', detail: state.blockingReason }] } : {}),
    ...(state.verificationStatus === 'verified'
      ? { outcomes: [{ key: 'crafting_verified', value: state.craftPlanId, evidenceRefs: [`craft-plan:${state.craftPlanId}`] }] }
      : {}),
  };
}

export function parseCraftingContinuityCheckpoint(
  checkpoint: ContinuityCheckpointRecord,
): CraftingContinuityProjection {
  const evidenceRecord = checkpoint.evidence.find((item) => item.ref === CRAFTING_CONTINUITY_EVIDENCE_REF);
  const legacyRecord = checkpoint.decisions.find((item) => item.key === LEGACY_DECISION_KEY);
  const payload = evidenceRecord?.result ?? legacyRecord?.value;
  if (!payload) throw new Error('CRAFTING_CONTINUITY_STATE_MISSING');
  let parsed: unknown;
  try { parsed = JSON.parse(payload); }
  catch { throw new Error('CRAFTING_CONTINUITY_STATE_INVALID'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('CRAFTING_CONTINUITY_STATE_INVALID');
  }
  const value = parsed as Record<string, unknown>;
  if (value.version !== VERSION || !Array.isArray(value.references)) {
    throw new Error('CRAFTING_CONTINUITY_VERSION_INVALID');
  }
  return normalizedProjection({
    craftingId: String(value.craftingId ?? ''),
    mode: value.mode as CraftingModeDecision['mode'],
    featureContractHash: String(value.featureContractHash ?? ''),
    referenceSetHash: String(value.referenceSetHash ?? ''),
    craftPlanId: String(value.craftPlanId ?? ''),
    ...(value.groundingReceiptId ? { groundingReceiptId: String(value.groundingReceiptId) } : {}),
    references: value.references as CraftingContinuityReference[],
    ...(value.currentSparepartId ? { currentSparepartId: String(value.currentSparepartId) } : {}),
    ...(value.executionRunId ? { executionRunId: String(value.executionRunId) } : {}),
    verificationStatus: value.verificationStatus as CraftingContinuityProjection['verificationStatus'],
    ...(value.blockingReason ? { blockingReason: String(value.blockingReason) } : {}),
  });
}

function stale(message: string): never {
  throw new Error(`CRAFTING_CONTINUITY_STALE: ${message}`);
}

export function resumeCraftingProjection(
  savedInput: CraftingContinuityProjection,
  currentDecision: CraftingModeDecision,
  currentPlan: CraftPlan,
): RouteCraftingProjection {
  const saved = normalizedProjection(savedInput);
  if (saved.craftingId !== currentDecision.craftingId
    || saved.mode !== currentDecision.mode
    || saved.featureContractHash !== currentDecision.featureContractHash
    || saved.referenceSetHash !== currentDecision.referenceSetHash) {
    stale('mode/plan/reference identity changed');
  }
  if (currentPlan.status !== 'ready'
    || currentPlan.craftingId !== currentDecision.craftingId
    || currentPlan.mode !== currentDecision.mode
    || currentPlan.featureContractHash !== currentDecision.featureContractHash
    || currentPlan.referenceSetHash !== currentDecision.referenceSetHash
    || currentPlan.craftPlanId !== saved.craftPlanId
    || (currentPlan.groundingReceiptId ?? '') !== (saved.groundingReceiptId ?? '')) {
    stale('craft plan or grounding identity changed');
  }
  const state: RouteCraftingProjection['state'] = saved.verificationStatus === 'verified'
    ? 'closed'
    : saved.verificationStatus === 'blocked'
      ? 'verification_pending'
      : 'ready';
  return {
    craftingId: currentDecision.craftingId,
    mode: currentDecision.mode,
    featureContractHash: currentDecision.featureContractHash,
    referenceSetHash: currentDecision.referenceSetHash,
    ...(saved.groundingReceiptId ? { groundingReceiptId: saved.groundingReceiptId } : {}),
    craftPlanId: currentPlan.craftPlanId,
    state,
  };
}

export function toMemoryPostflightCandidate(
  result: CraftingVerificationResult,
): MemoryPostflightCandidate | null {
  const candidate = result.status === 'verified' ? result.memoryCandidate : null;
  if (!candidate) return null;
  return {
    canonicalKey: candidate.canonicalKey,
    kind: candidate.kind,
    value: structuredClone(candidate.value),
    importance: candidate.importance,
    sourceType: candidate.sourceType,
    sourceRef: candidate.sourceRef,
  };
}
