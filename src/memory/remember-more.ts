import { createHash } from 'node:crypto';
import { MemoryCognitionLedger } from './cognition-ledger.js';
import {
  MEMORY_REMEMBER_MORE_DEFAULTS,
  MEMORY_REMEMBER_MORE_LIMITS,
  MEMORY_REMEMBER_MORE_REASONS,
  type MemoryKind,
  type MemoryRelation,
  type MemoryRememberMoreEntry,
  type MemoryRememberMoreReason,
  type MemoryRememberMoreRequest,
  type MemoryRememberMoreResult,
  type MemoryState,
} from './types.js';
import { MemoryWorkerClient } from './worker-client.js';

interface AuthorizedSeedRow extends Record<string, unknown> {
  memory_id: string;
  canonical_key: string;
  kind: string;
  state: string;
  current_revision_id: string;
  current_revision_no: number;
}

interface RevisionRow extends Record<string, unknown> {
  revision_id: string;
  revision_no: number;
  value_text: string;
}

interface NormalizedRequest {
  scope: MemoryRememberMoreRequest['scope'];
  contextId: string;
  seedMemoryIds: string[];
  reason: MemoryRememberMoreReason;
  maxHops: number;
  maxItems: number;
  characterBudget: number;
}

const REASONS = new Set<string>(MEMORY_REMEMBER_MORE_REASONS);

function binaryCompare(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function scopeProject(scope: MemoryRememberMoreRequest['scope']): string {
  return scope.projectId ?? '';
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(binaryCompare)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function snapshotHash(value: Omit<MemoryRememberMoreResult, 'snapshotHash'>): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new Error('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
  }
  return resolved;
}

function normalizeRequest(request: MemoryRememberMoreRequest): NormalizedRequest {
  if (
    !request
    || !request.scope?.principalId?.trim()
    || !request.contextId?.trim()
    || !REASONS.has(request.reason)
    || !Array.isArray(request.seedMemoryIds)
    || request.seedMemoryIds.length < 1
    || request.seedMemoryIds.length > MEMORY_REMEMBER_MORE_LIMITS.seedMemoryIds
    || request.seedMemoryIds.some((memoryId) => typeof memoryId !== 'string' || !memoryId.trim())
  ) {
    throw new Error('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
  }

  const seedMemoryIds = [...new Set(request.seedMemoryIds.map((memoryId) => memoryId.trim()))].sort(binaryCompare);
  if (seedMemoryIds.length < 1 || seedMemoryIds.length > MEMORY_REMEMBER_MORE_LIMITS.seedMemoryIds) {
    throw new Error('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
  }

  return {
    scope: request.scope,
    contextId: request.contextId.trim(),
    seedMemoryIds,
    reason: request.reason,
    maxHops: boundedInteger(
      request.maxHops,
      MEMORY_REMEMBER_MORE_DEFAULTS.maxHops,
      MEMORY_REMEMBER_MORE_LIMITS.maxHops,
    ),
    maxItems: boundedInteger(
      request.maxItems,
      MEMORY_REMEMBER_MORE_DEFAULTS.maxItems,
      MEMORY_REMEMBER_MORE_LIMITS.maxItems,
    ),
    characterBudget: boundedInteger(
      request.characterBudget,
      MEMORY_REMEMBER_MORE_DEFAULTS.characterBudget,
      MEMORY_REMEMBER_MORE_LIMITS.characterBudget,
    ),
  };
}

function revisionCandidate(
  seed: AuthorizedSeedRow,
  revision: RevisionRow,
  depth: number,
): MemoryRememberMoreEntry {
  const relationPath = Array.from({ length: depth }, () => 'supersedes' as MemoryRelation);
  const valueText = String(revision.value_text);
  return {
    memoryId: seed.memory_id,
    revisionId: String(revision.revision_id),
    revisionNo: Number(revision.revision_no),
    canonicalKey: seed.canonical_key,
    kind: seed.kind as MemoryKind,
    state: seed.state as MemoryState,
    valueText,
    sourceSeedMemoryId: seed.memory_id,
    depth,
    relationPath,
    memoryPath: [seed.memory_id],
    reasonCode: 'revision_predecessor',
    score: Math.max(0, Math.min(1, 1 - (0.05 * (depth - 1)))),
    historicalRevision: true,
    characterCount: valueText.length,
  };
}

function compareRevisionCandidates(left: MemoryRememberMoreEntry, right: MemoryRememberMoreEntry): number {
  if (left.depth !== right.depth) return left.depth - right.depth;
  if (left.score !== right.score) return right.score - left.score;
  const seedOrder = binaryCompare(left.sourceSeedMemoryId, right.sourceSeedMemoryId);
  if (seedOrder !== 0) return seedOrder;
  const memoryOrder = binaryCompare(left.memoryId, right.memoryId);
  if (memoryOrder !== 0) return memoryOrder;
  if (left.revisionNo !== right.revisionNo) return right.revisionNo - left.revisionNo;
  return binaryCompare(left.revisionId, right.revisionId);
}

export class MemoryRememberMore {
  constructor(
    readonly client: MemoryWorkerClient,
    readonly cognition: MemoryCognitionLedger,
  ) {}

  async expand(request: MemoryRememberMoreRequest): Promise<MemoryRememberMoreResult> {
    const normalized = normalizeRequest(request);
    const now = Date.now();

    const contexts = await this.client.query<{ id: string }>(
      `SELECT id
         FROM memory_contexts
        WHERE id = ? AND principal_id = ? AND expires_at > ?
        LIMIT 1`,
      [normalized.contextId, normalized.scope.principalId, now],
    );
    if (contexts.length !== 1) throw new Error('MEMORY_REMEMBER_MORE_CONTEXT_INVALID');

    const placeholders = normalized.seedMemoryIds.map(() => '?').join(', ');
    const authorizedRows = await this.client.query<AuthorizedSeedRow>(
      `SELECT item.id AS memory_id,
              item.canonical_key,
              item.kind,
              item.state,
              item.current_revision_id,
              revision.revision_no AS current_revision_no
         FROM memory_access_log AS access
         JOIN memory_contexts AS context ON context.id = access.context_id
         JOIN memory_items AS item ON item.id = access.memory_id
         JOIN memory_revisions AS revision ON revision.id = item.current_revision_id
        WHERE context.id = ?
          AND context.principal_id = ?
          AND context.expires_at > ?
          AND item.principal_id = ?
          AND IFNULL(item.project_id, '') = ?
          AND item.state <> 'tombstoned'
          AND item.id IN (${placeholders})
        ORDER BY item.id COLLATE BINARY ASC`,
      [
        normalized.contextId,
        normalized.scope.principalId,
        now,
        normalized.scope.principalId,
        scopeProject(normalized.scope),
        ...normalized.seedMemoryIds,
      ],
    );

    const authorizedIds = authorizedRows.map((row) => row.memory_id).sort(binaryCompare);
    if (
      authorizedIds.length !== normalized.seedMemoryIds.length
      || authorizedIds.some((memoryId, index) => memoryId !== normalized.seedMemoryIds[index])
    ) {
      throw new Error('MEMORY_REMEMBER_MORE_SEED_NOT_RECALLED');
    }

    const candidates: MemoryRememberMoreEntry[] = [];
    let truncated = false;
    for (const seed of authorizedRows) {
      const revisions = await this.client.query<RevisionRow>(
        `SELECT revision.id AS revision_id,
                revision.revision_no,
                revision.value_text
           FROM memory_revisions AS revision
           JOIN memory_items AS item ON item.id = revision.memory_id
          WHERE revision.memory_id = ?
            AND revision.revision_no < ?
            AND item.principal_id = ?
            AND IFNULL(item.project_id, '') = ?
            AND item.state <> 'tombstoned'
          ORDER BY revision.revision_no DESC
          LIMIT ?`,
        [
          seed.memory_id,
          seed.current_revision_no,
          normalized.scope.principalId,
          scopeProject(normalized.scope),
          normalized.maxHops + 1,
        ],
      );
      if (revisions.length > normalized.maxHops) truncated = true;
      revisions.slice(0, normalized.maxHops).forEach((revision, index) => {
        candidates.push(revisionCandidate(seed, revision, index + 1));
      });
    }

    candidates.sort(compareRevisionCandidates);
    const expansions: MemoryRememberMoreEntry[] = [];
    let characterBudgetConsumed = 0;
    for (const candidate of candidates) {
      if (expansions.length >= normalized.maxItems) {
        truncated = true;
        break;
      }
      if (characterBudgetConsumed + candidate.characterCount > normalized.characterBudget) {
        truncated = true;
        continue;
      }
      expansions.push(candidate);
      characterBudgetConsumed += candidate.characterCount;
    }

    const resultWithoutHash: Omit<MemoryRememberMoreResult, 'snapshotHash'> = {
      contextId: normalized.contextId,
      reason: normalized.reason,
      seedMemoryIds: normalized.seedMemoryIds,
      expansions,
      characterBudgetConsumed,
      truncated,
    };
    return {
      ...resultWithoutHash,
      snapshotHash: snapshotHash(resultWithoutHash),
    };
  }
}
