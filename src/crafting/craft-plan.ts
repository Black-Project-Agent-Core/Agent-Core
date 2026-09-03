import { createHash } from 'node:crypto';
import type { FeatureAnatomy, FeatureSparepart } from './feature-anatomy.js';
import type { SourceGroundingReceipt } from './source-grounding.js';
import type { CraftingMode, CraftingModeDecision } from './types.js';

export type CraftingAction = 'KEEP' | 'ADAPT' | 'REPLACE' | 'DROP' | 'REIMPLEMENT';
export type ReimplementationReason =
  | 'LICENSE_BLOCKED'
  | 'RUNTIME_NON_PORTABLE'
  | 'DONOR_BROKEN'
  | 'IRREDUCIBLE_HOST_CONFLICT';

export interface CraftingDecision {
  sparepartId: string;
  action: CraftingAction;
  rationaleCode: string;
  targetPath?: string;
  targetBinding?: string;
  preservedBehaviors: string[];
  intentionallyChangedBehaviors: string[];
  evidenceRefs: string[];
  reimplementationReason?: ReimplementationReason;
}

export interface CraftPlan {
  craftPlanId: string;
  craftingId: string;
  mode: CraftingMode;
  featureContractHash: string;
  referenceSetHash: string;
  groundingReceiptId?: string;
  anatomyId?: string;
  decisions: CraftingDecision[];
  hostVerification: string[];
  donorVerification: string[];
  status: 'draft' | 'ready' | 'blocked';
  blockingReasons: string[];
}
export class CraftPlanError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CraftPlanError';
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

function normalizedStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizeDecision(item: CraftingDecision, sparepart: FeatureSparepart): CraftingDecision {
  const sparepartId = item.sparepartId.trim();
  const rationaleCode = item.rationaleCode.trim();
  const evidenceRefs = normalizedStrings(item.evidenceRefs);
  if (!sparepartId || !rationaleCode || evidenceRefs.length === 0) {
    throw new CraftPlanError('CRAFT_DECISION_INVALID', `Crafting decision requires sparepart, rationale, and evidence: ${sparepartId || '<missing>'}`);
  }
  for (const evidenceId of evidenceRefs) {
    if (!sparepart.evidenceRefs.includes(evidenceId)) {
      throw new CraftPlanError('CRAFT_DECISION_EVIDENCE_INVALID', `Decision ${sparepartId} cites evidence outside its sparepart anatomy`);
    }
  }
  if (item.action === 'REIMPLEMENT' && !item.reimplementationReason) {
    throw new CraftPlanError('REIMPLEMENT_REASON_REQUIRED', `REIMPLEMENT requires factual exception reason: ${sparepartId}`);
  }
  return {
    sparepartId,
    action: item.action,
    rationaleCode,
    ...(item.targetPath?.trim() ? { targetPath: item.targetPath.trim() } : {}),
    ...(item.targetBinding?.trim() ? { targetBinding: item.targetBinding.trim() } : {}),
    preservedBehaviors: normalizedStrings(item.preservedBehaviors),
    intentionallyChangedBehaviors: normalizedStrings(item.intentionallyChangedBehaviors),
    evidenceRefs,
    ...(item.reimplementationReason ? { reimplementationReason: item.reimplementationReason } : {}),
  };
}

export function buildCraftPlan(input: {
  decision: CraftingModeDecision;
  groundingReceipt?: SourceGroundingReceipt;
  anatomy?: FeatureAnatomy;
  decisions: CraftingDecision[];
  hostVerification: string[];
  donorVerification: string[];
}): CraftPlan {
  if (input.decision.mode === 'BUILD_FROM_ZERO') {
    if (input.groundingReceipt || input.anatomy || input.decisions.length > 0) {
      throw new CraftPlanError('DONOR_STATE_FORBIDDEN', 'BUILD_FROM_ZERO craft plan cannot contain donor grounding/anatomy decisions');
    }
    const hostVerification = normalizedStrings(input.hostVerification);
    const identity = {
      craftingId: input.decision.craftingId,
      mode: input.decision.mode,
      featureContractHash: input.decision.featureContractHash,
      referenceSetHash: input.decision.referenceSetHash,
      hostVerification,
    };
    const craftPlanId = `craft-plan:${createHash('sha256').update(stableJson(identity), 'utf8').digest('hex').slice(0, 32)}`;
    return {
      craftPlanId,
      craftingId: input.decision.craftingId,
      mode: input.decision.mode,
      featureContractHash: input.decision.featureContractHash,
      referenceSetHash: input.decision.referenceSetHash,
      decisions: [],
      hostVerification,
      donorVerification: [],
      status: 'ready',
      blockingReasons: [],
    };
  }

  const groundingReceipt = input.groundingReceipt;
  const anatomy = input.anatomy;
  if (!groundingReceipt || groundingReceipt.completeness !== 'sufficient'
    || groundingReceipt.referenceSetHash !== input.decision.referenceSetHash
    || groundingReceipt.featureContractHash !== input.decision.featureContractHash) {
    throw new CraftPlanError('GROUNDING_REQUIRED', 'FEATURE_TRANSPLANTATION requires current sufficient grounding');
  }
  if (!anatomy || anatomy.status !== 'ready' || anatomy.groundingReceiptId !== groundingReceipt.receiptId) {
    throw new CraftPlanError('ANATOMY_REQUIRED', 'FEATURE_TRANSPLANTATION requires ready feature anatomy');
  }

  const spareparts = new Map(anatomy.spareparts.map((item) => [item.sparepartId, item]));
  const normalized: CraftingDecision[] = [];
  const decided = new Set<string>();
  for (const item of input.decisions) {
    const sparepart = spareparts.get(item.sparepartId.trim());
    if (!sparepart) throw new CraftPlanError('CRAFT_DECISION_UNKNOWN_SPAREPART', `Decision targets unknown sparepart: ${item.sparepartId}`);
    if (decided.has(sparepart.sparepartId)) throw new CraftPlanError('CRAFT_DECISION_DUPLICATE', `Sparepart has multiple decisions: ${sparepart.sparepartId}`);
    decided.add(sparepart.sparepartId);
    normalized.push(normalizeDecision(item, sparepart));
  }
  const missing = anatomy.spareparts.map((item) => item.sparepartId).filter((id) => !decided.has(id));
  if (missing.length > 0) {
    throw new CraftPlanError('CRAFT_DECISION_MISSING', `Spareparts are missing crafting decisions: ${missing.join(', ')}`);
  }
  normalized.sort((left, right) => left.sparepartId.localeCompare(right.sparepartId));
  const hostVerification = normalizedStrings(input.hostVerification);
  const donorVerification = normalizedStrings(input.donorVerification);
  const identity = {
    craftingId: input.decision.craftingId,
    mode: input.decision.mode,
    featureContractHash: input.decision.featureContractHash,
    referenceSetHash: input.decision.referenceSetHash,
    groundingReceiptId: groundingReceipt.receiptId,
    anatomyId: anatomy.anatomyId,
    decisions: normalized,
    hostVerification,
    donorVerification,
  };
  const craftPlanId = `craft-plan:${createHash('sha256').update(stableJson(identity), 'utf8').digest('hex').slice(0, 32)}`;
  return {
    craftPlanId,
    craftingId: input.decision.craftingId,
    mode: input.decision.mode,
    featureContractHash: input.decision.featureContractHash,
    referenceSetHash: input.decision.referenceSetHash,
    groundingReceiptId: groundingReceipt.receiptId,
    anatomyId: anatomy.anatomyId,
    decisions: normalized,
    hostVerification,
    donorVerification,
    status: 'ready',
    blockingReasons: [],
  };
}
