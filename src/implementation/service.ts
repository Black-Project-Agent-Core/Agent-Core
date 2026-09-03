import { randomUUID } from 'node:crypto';
import type { ImplementationStrategyConfig } from '../config.js';
import type { RouteImplementationStrategyProjection } from '../runtime/route-context-store.js';

export type ImplementationStrategyErrorCode =
  | 'IMPLEMENTATION_STRATEGY_REQUIRED'
  | 'IMPLEMENTATION_STRATEGY_STATE_INVALID'
  | 'IMPLEMENTATION_STRATEGY_LEASE_INVALID'
  | 'IMPLEMENTATION_STRATEGY_STALE'
  | 'IMPLEMENTATION_MANIFEST_REQUIRED';

export class ImplementationStrategyError extends Error {
  constructor(
    readonly code: ImplementationStrategyErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ImplementationStrategyError';
  }
}

export interface ImplementationStrategyLease {
  leaseId: string;
  principalId: string;
  projectId?: string;
  routeContextId: string;
  strategyId: string;
  planFingerprint: string;
  referenceSetFingerprint: string;
  manifestId?: string;
  issuedAt: number;
  expiresAt: number;
}

export interface IssueImplementationStrategyLeaseRequest {
  principalId: string;
  projectId?: string;
  routeContextId: string;
  strategy: RouteImplementationStrategyProjection;
  routeExpiresAt: number;
}
export interface ValidateImplementationStrategyLeaseRequest {
  principalId: string;
  projectId?: string;
  routeContextId: string;
  strategy: RouteImplementationStrategyProjection;
}

function scopeEqual(left: string | undefined, right: string | undefined): boolean {
  return (left ?? '') === (right ?? '');
}

export class ImplementationStrategyService {
  readonly config: ImplementationStrategyConfig;
  private readonly leases = new Map<string, ImplementationStrategyLease>();

  constructor(config: ImplementationStrategyConfig, private readonly now: () => number = Date.now) {
    this.config = { ...config };
  }

  issueLease(request: IssueImplementationStrategyLeaseRequest): ImplementationStrategyLease {
    const now = this.now();
    if (request.strategy.state !== 'ready') {
      throw new ImplementationStrategyError(
        'IMPLEMENTATION_STRATEGY_STATE_INVALID',
        `Strategy lease requires ready state, received ${request.strategy.state}`,
      );
    }
    if (request.strategy.mode === 'FEATURE_GRAFT' && !request.strategy.manifestId) {
      throw new ImplementationStrategyError(
        'IMPLEMENTATION_MANIFEST_REQUIRED',
        'FEATURE_GRAFT strategy requires a transplant manifest before mutation lease issuance',
      );
    }
    if (!Number.isFinite(request.routeExpiresAt) || request.routeExpiresAt <= now) {
      throw new ImplementationStrategyError(
        'IMPLEMENTATION_STRATEGY_LEASE_INVALID',
        'Route expiry must be in the future for strategy lease issuance',
      );
    }

    const lease: ImplementationStrategyLease = {
      leaseId: randomUUID(),
      principalId: request.principalId,
      ...(request.projectId ? { projectId: request.projectId } : {}),
      routeContextId: request.routeContextId,
      strategyId: request.strategy.strategyId,
      planFingerprint: request.strategy.planFingerprint,
      referenceSetFingerprint: request.strategy.referenceSetFingerprint,
      ...(request.strategy.manifestId ? { manifestId: request.strategy.manifestId } : {}),
      issuedAt: now,
      expiresAt: Math.min(request.routeExpiresAt, now + this.config.leaseTtlMs),
    };
    this.leases.set(lease.leaseId, lease);
    return structuredClone(lease);
  }
  validateLease(request: ValidateImplementationStrategyLeaseRequest): ImplementationStrategyLease {
    const leaseId = request.strategy.leaseId;
    if (!leaseId) {
      throw new ImplementationStrategyError(
        'IMPLEMENTATION_STRATEGY_REQUIRED',
        'Implementation-bearing work requires a scoped strategy lease',
      );
    }
    const lease = this.leases.get(leaseId);
    if (!lease || lease.expiresAt <= this.now()) {
      if (lease) this.leases.delete(leaseId);
      throw new ImplementationStrategyError(
        'IMPLEMENTATION_STRATEGY_LEASE_INVALID',
        'Implementation strategy lease is missing or expired',
      );
    }
    if (lease.principalId !== request.principalId
      || !scopeEqual(lease.projectId, request.projectId)
      || lease.routeContextId !== request.routeContextId) {
      throw new ImplementationStrategyError(
        'IMPLEMENTATION_STRATEGY_LEASE_INVALID',
        'Implementation strategy lease scope does not match the active route',
      );
    }
    const stale = lease.strategyId !== request.strategy.strategyId
      || lease.planFingerprint !== request.strategy.planFingerprint
      || lease.referenceSetFingerprint !== request.strategy.referenceSetFingerprint
      || (lease.manifestId ?? '') !== (request.strategy.manifestId ?? '');
    if (stale) {
      throw new ImplementationStrategyError(
        'IMPLEMENTATION_STRATEGY_STALE',
        'Implementation strategy lease no longer matches current plan/reference/manifest identity',
      );
    }
    if (request.strategy.state === 'closed' || request.strategy.state === 'analysis') {
      throw new ImplementationStrategyError(
        'IMPLEMENTATION_STRATEGY_STATE_INVALID',
        `Implementation work is not allowed while strategy state is ${request.strategy.state}`,
      );
    }
    return structuredClone(lease);
  }

  revoke(leaseId: string): void {
    this.leases.delete(leaseId);
  }
}