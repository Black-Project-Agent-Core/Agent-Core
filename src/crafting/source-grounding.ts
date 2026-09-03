import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import type { CraftingModeDecision } from './types.js';
import {
  craftingReferenceIdentityHash,
  type ResolvedCraftingReference,
} from './reference-resolution.js';

export type SourceEvidenceRole =
  | 'entry_point'
  | 'dependency'
  | 'state'
  | 'config'
  | 'lifecycle'
  | 'test'
  | 'interface'
  | 'error_path';

export interface SourceEvidence {
  evidenceId: string;
  referenceId: string;
  referenceIdentityHash: string;
  sourcePath: string;
  symbol?: string;
  lineStart?: number;
  lineEnd?: number;
  contentHash: string;
  role: SourceEvidenceRole;
  observation: string;
}
export interface SourceGroundingReceipt {
  receiptId: string;
  referenceSetHash: string;
  featureContractHash: string;
  evidence: SourceEvidence[];
  inspectedSourceFiles: string[];
  inspectedTests: string[];
  completeness: 'sufficient' | 'insufficient';
  missingEvidence: string[];
}

export interface GroundingRequirements {
  tests: boolean;
  lifecycle: boolean;
  stateOrConfig: boolean;
}

export class GroundingError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'GroundingError';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}
function orientationOnlyPath(sourcePath: string): boolean {
  const normalized = normalizeRelative(sourcePath).toLowerCase();
  const base = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (/^readme(?:\.[^.]+)?$/.test(base)) return true;
  if (base === 'package.json' || base === 'package-lock.json') return true;
  return /(^|\/)docs?\//.test(normalized) && /\.(md|mdx|txt)$/.test(normalized);
}

function withinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function inspectSourceEvidence(input: {
  workspace: WorkspacePolicy;
  reference: ResolvedCraftingReference;
  relativePath: string;
  role: SourceEvidenceRole;
  observation: string;
  symbol?: string;
  lineStart?: number;
  lineEnd?: number;
}): Promise<SourceEvidence> {
  const relativePath = normalizeRelative(input.relativePath);
  const candidate = path.resolve(input.reference.localRoot, relativePath);
  if (!withinRoot(input.reference.localRoot, candidate)) {
    throw new GroundingError('SOURCE_PATH_OUTSIDE_REFERENCE', 'Source evidence must remain inside the resolved reference root');
  }
  const resolved = await input.workspace.resolveExisting(candidate);
  const bytes = await readFile(resolved);
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const observation = input.observation.trim();
  if (!observation) throw new GroundingError('SOURCE_OBSERVATION_REQUIRED', 'Source evidence requires a bounded factual observation');
  const identity = {
    referenceId: input.reference.referenceId,
    referenceIdentityHash: input.reference.identityHash,
    sourcePath: relativePath,
    symbol: input.symbol?.trim() || null,
    lineStart: input.lineStart ?? null,
    lineEnd: input.lineEnd ?? null,
    contentHash,
    role: input.role,
    observation,
  };
  const evidenceId = `source:${sha256(JSON.stringify(identity))}`;
  return {
    evidenceId,
    referenceId: input.reference.referenceId,
    referenceIdentityHash: input.reference.identityHash,
    sourcePath: relativePath,
    ...(input.symbol?.trim() ? { symbol: input.symbol.trim() } : {}),
    ...(input.lineStart !== undefined ? { lineStart: input.lineStart } : {}),
    ...(input.lineEnd !== undefined ? { lineEnd: input.lineEnd } : {}),
    contentHash,
    role: input.role,
    observation,
  };
}

function stableEvidence(evidence: SourceEvidence[]): SourceEvidence[] {
  return [...new Map(evidence.map((item) => [item.evidenceId, structuredClone(item)])).values()]
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}
function assertEvidenceMatchesDecision(decision: CraftingModeDecision, evidence: SourceEvidence[]): void {
  const identities = new Map(decision.references.map((reference) => [
    reference.referenceId,
    craftingReferenceIdentityHash(reference),
  ]));
  for (const item of evidence) {
    const expected = identities.get(item.referenceId);
    if (!expected || expected !== item.referenceIdentityHash) {
      throw new GroundingError(
        'REFERENCE_IDENTITY_MISMATCH',
        `Source evidence no longer matches the locked reference identity: ${item.referenceId}`,
      );
    }
    if (!/^[0-9a-f]{64}$/.test(item.contentHash)) {
      throw new GroundingError('SOURCE_HASH_INVALID', `Source evidence has invalid content hash: ${item.sourcePath}`);
    }
  }
}

export function buildSourceGroundingReceipt(input: {
  decision: CraftingModeDecision;
  evidence: SourceEvidence[];
  requirements: GroundingRequirements;
}): SourceGroundingReceipt {
  if (input.decision.mode !== 'FEATURE_TRANSPLANTATION') {
    throw new GroundingError('GROUNDING_NOT_ALLOWED', 'BUILD_FROM_ZERO cannot accept donor-derived source grounding');
  }
  const evidence = stableEvidence(input.evidence);
  assertEvidenceMatchesDecision(input.decision, evidence);
  const actual = evidence.filter((item) => !orientationOnlyPath(item.sourcePath));
  const missing: string[] = [];
  if (!actual.some((item) => item.role === 'entry_point')) missing.push('entry_point');
  if (!actual.some((item) => item.role === 'dependency' || item.role === 'interface')) {
    missing.push('dependency_or_interface');
  }
  if (input.requirements.tests && !actual.some((item) => item.role === 'test')) missing.push('test');
  if (input.requirements.lifecycle && !actual.some((item) => item.role === 'lifecycle')) missing.push('lifecycle');
  if (input.requirements.stateOrConfig
    && !evidence.some((item) => item.role === 'state' || item.role === 'config')) {
    missing.push('state_or_config');
  }
  if (missing.length > 0) {
    throw new GroundingError(
      'SOURCE_GROUNDING_INSUFFICIENT',
      `Source grounding is insufficient: ${missing.join(', ')}`,
    );
  }
  const inspectedTests = [...new Set(actual.filter((item) => item.role === 'test').map((item) => item.sourcePath))].sort();
  const inspectedSourceFiles = [...new Set(actual
    .filter((item) => item.role !== 'test')
    .map((item) => item.sourcePath))].sort();
  const receiptIdentity = JSON.stringify({
    referenceSetHash: input.decision.referenceSetHash,
    featureContractHash: input.decision.featureContractHash,
    evidence: evidence.map((item) => item.evidenceId),
    inspectedSourceFiles,
    inspectedTests,
  });
  return {
    receiptId: `grounding:${sha256(receiptIdentity).slice(0, 32)}`,
    referenceSetHash: input.decision.referenceSetHash,
    featureContractHash: input.decision.featureContractHash,
    evidence,
    inspectedSourceFiles,
    inspectedTests,
    completeness: 'sufficient',
    missingEvidence: [],
  };
}

export function validateGroundingReceipt(
  decision: CraftingModeDecision,
  receipt: SourceGroundingReceipt,
): SourceGroundingReceipt {
  if (decision.mode !== 'FEATURE_TRANSPLANTATION') {
    throw new GroundingError('GROUNDING_NOT_ALLOWED', 'Only transplantation mode may validate donor grounding');
  }
  if (receipt.completeness !== 'sufficient'
    || receipt.referenceSetHash !== decision.referenceSetHash
    || receipt.featureContractHash !== decision.featureContractHash) {
    throw new GroundingError('GROUNDING_STALE', 'Grounding receipt does not match the locked crafting decision');
  }
  assertEvidenceMatchesDecision(decision, receipt.evidence);
  return structuredClone(receipt);
}
