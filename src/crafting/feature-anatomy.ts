import { createHash } from 'node:crypto';
import type { SourceGroundingReceipt } from './source-grounding.js';
import { EvidenceLedger, EvidenceLedgerError } from './evidence-ledger.js';

export type SparepartRelation =
  | 'DEFINES'
  | 'CALLS'
  | 'IMPORTS'
  | 'IMPLEMENTS'
  | 'CONFIGURES'
  | 'READS_STATE'
  | 'WRITES_STATE'
  | 'STARTS'
  | 'STOPS'
  | 'TESTS'
  | 'OWNS';

export interface FeatureSparepart {
  sparepartId: string;
  referenceId: string;
  sourcePath: string;
  symbol?: string;
  role: string;
  evidenceRefs: string[];
}

export interface FeatureConnection {
  from: string;
  to: string;
  relation: SparepartRelation;
  evidenceRefs: string[];
}
export interface FeatureCoverageDecision {
  evidenceId: string;
  status: 'unknown' | 'not_required';
  reason: string;
}

export interface FeatureAnatomy {
  anatomyId: string;
  groundingReceiptId: string;
  spareparts: FeatureSparepart[];
  connections: FeatureConnection[];
  unknownEvidence: string[];
  notRequiredEvidence: string[];
  status: 'ready' | 'blocked';
}

export interface FeatureAnatomyLimits {
  maxSpareparts: number;
  maxConnections: number;
}

export class FeatureAnatomyError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'FeatureAnatomyError';
  }
}

const DEFAULT_LIMITS: FeatureAnatomyLimits = { maxSpareparts: 500, maxConnections: 2_000 };
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function normalizeRefs(refs: string[]): string[] {
  return [...new Set(refs.map((item) => item.trim()).filter(Boolean))].sort();
}

function sparepartKey(item: FeatureSparepart): string {
  return item.sparepartId.trim();
}

function connectionKey(item: FeatureConnection): string {
  return [item.from, item.to, item.relation, ...normalizeRefs(item.evidenceRefs)].join('\u0000');
}

function normalizeSparepart(item: FeatureSparepart, ledger: EvidenceLedger): FeatureSparepart {
  const sparepartId = item.sparepartId.trim();
  const referenceId = item.referenceId.trim();
  const sourcePath = item.sourcePath.replace(/\\/g, '/').trim();
  const role = item.role.trim();
  const evidenceRefs = normalizeRefs(item.evidenceRefs);
  if (!sparepartId || !referenceId || !sourcePath || !role) {
    throw new FeatureAnatomyError('SPAREPART_INVALID', 'Feature spareparts require id, reference, path, and role');
  }
  ledger.require(evidenceRefs, `Sparepart ${sparepartId}`);
  return {
    sparepartId,
    referenceId,
    sourcePath,
    ...(item.symbol?.trim() ? { symbol: item.symbol.trim() } : {}),
    role,
    evidenceRefs,
  };
}

export function buildFeatureAnatomy(input: {
  receipt: SourceGroundingReceipt;
  spareparts: FeatureSparepart[];
  connections: FeatureConnection[];
  coverage: FeatureCoverageDecision[];
  limits?: Partial<FeatureAnatomyLimits>;
}): FeatureAnatomy {
  if (input.receipt.completeness !== 'sufficient') {
    throw new FeatureAnatomyError('GROUNDING_INSUFFICIENT', 'Feature anatomy requires sufficient source grounding');
  }
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  if (input.spareparts.length > limits.maxSpareparts || input.connections.length > limits.maxConnections) {
    throw new FeatureAnatomyError('ANATOMY_BOUNDS_EXCEEDED', 'Feature anatomy exceeded bounded analysis limits');
  }
  const ledger = new EvidenceLedger(input.receipt);
  let spareparts: FeatureSparepart[];
  try {
    spareparts = input.spareparts.map((item) => normalizeSparepart(item, ledger))
      .sort((left, right) => sparepartKey(left).localeCompare(sparepartKey(right)));
  } catch (error) {
    if (error instanceof EvidenceLedgerError) throw new FeatureAnatomyError('EVIDENCE_UNKNOWN', error.message);
    throw error;
  }
  const ids = new Set<string>();
  for (const item of spareparts) {
    if (ids.has(item.sparepartId)) throw new FeatureAnatomyError('SPAREPART_DUPLICATE', `Duplicate sparepart: ${item.sparepartId}`);
    ids.add(item.sparepartId);
  }

  const connections = input.connections.map((item) => {
    if (!ids.has(item.from) || !ids.has(item.to)) {
      throw new FeatureAnatomyError('CONNECTION_NODE_UNKNOWN', `Connection references unknown sparepart: ${item.from} -> ${item.to}`);
    }
    const evidenceRefs = normalizeRefs(item.evidenceRefs);
    try { ledger.require(evidenceRefs, `Connection ${item.from} -> ${item.to}`); }
    catch (error) {
      if (error instanceof EvidenceLedgerError) throw new FeatureAnatomyError('EVIDENCE_UNKNOWN', error.message);
      throw error;
    }
    return { from: item.from, to: item.to, relation: item.relation, evidenceRefs };
  }).sort((left, right) => connectionKey(left).localeCompare(connectionKey(right)));

  const selectedEvidence = new Set(spareparts.flatMap((item) => item.evidenceRefs));
  const coverage = [...input.coverage]
    .map((item) => ({ evidenceId: item.evidenceId.trim(), status: item.status, reason: item.reason.trim() }))
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const coverageIds = new Set<string>();
  for (const item of coverage) {
    if (!item.evidenceId || !item.reason) throw new FeatureAnatomyError('COVERAGE_INVALID', 'Coverage decisions require evidenceId and reason');
    if (!ledger.has(item.evidenceId)) throw new FeatureAnatomyError('EVIDENCE_UNKNOWN', `Coverage cites unknown evidence: ${item.evidenceId}`);
    if (selectedEvidence.has(item.evidenceId)) throw new FeatureAnatomyError('COVERAGE_CONFLICT', `Selected evidence cannot also be ${item.status}: ${item.evidenceId}`);
    if (coverageIds.has(item.evidenceId)) throw new FeatureAnatomyError('COVERAGE_DUPLICATE', `Duplicate coverage decision: ${item.evidenceId}`);
    coverageIds.add(item.evidenceId);
  }

  const unaccounted = ledger.ids().filter((id) => !selectedEvidence.has(id) && !coverageIds.has(id));
  if (unaccounted.length > 0) {
    throw new FeatureAnatomyError('EVIDENCE_UNACCOUNTED', `Grounding evidence is not represented in anatomy: ${unaccounted.join(', ')}`);
  }
  const unknownEvidence = coverage.filter((item) => item.status === 'unknown').map((item) => item.evidenceId);
  const notRequiredEvidence = coverage.filter((item) => item.status === 'not_required').map((item) => item.evidenceId);
  const identity = {
    groundingReceiptId: input.receipt.receiptId,
    spareparts,
    connections,
    coverage,
  };
  const anatomyId = `anatomy:${createHash('sha256').update(stableJson(identity), 'utf8').digest('hex').slice(0, 32)}`;
  return {
    anatomyId,
    groundingReceiptId: input.receipt.receiptId,
    spareparts,
    connections,
    unknownEvidence,
    notRequiredEvidence,
    status: unknownEvidence.length > 0 ? 'blocked' : 'ready',
  };
}
