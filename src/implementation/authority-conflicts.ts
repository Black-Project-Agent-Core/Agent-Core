import { createHash } from 'node:crypto';
import type { TransplantComponent } from './transplant-manifest.js';

export type ProtectedAuthorityId =
  | 'semantic_memory'
  | 'memory_lifecycle'
  | 'workspace_containment'
  | 'routing'
  | 'operational_execution'
  | 'github_operations'
  | 'operational_audit'
  | 'authentication'
  | 'runtime_health';

export interface ProtectedAuthority {
  authorityId: ProtectedAuthorityId;
  canonicalBinding: string;
}

export const PROTECTED_AUTHORITIES: Record<ProtectedAuthorityId, ProtectedAuthority> = {
  semantic_memory: { authorityId: 'semantic_memory', canonicalBinding: 'MemoryService' },
  memory_lifecycle: { authorityId: 'memory_lifecycle', canonicalBinding: 'MemoryLifecycle' },
  workspace_containment: { authorityId: 'workspace_containment', canonicalBinding: 'WorkspacePolicy' },
  routing: { authorityId: 'routing', canonicalBinding: 'CapabilityRouter/RouteContextStore' },
  operational_execution: { authorityId: 'operational_execution', canonicalBinding: 'ExecutionService/ProcessManager' },
  github_operations: { authorityId: 'github_operations', canonicalBinding: 'GitHubService' },
  operational_audit: { authorityId: 'operational_audit', canonicalBinding: 'AuditJournal/OperationalMemoryAudit' },
  authentication: { authorityId: 'authentication', canonicalBinding: 'AgentCoreAuth' },
  runtime_health: { authorityId: 'runtime_health', canonicalBinding: 'RuntimeHealthMetrics' },
};
export interface DonorAuthorityClaim {
  referenceId: string;
  sourcePath: string;
  symbol?: string;
  authorityId: ProtectedAuthorityId;
  role: 'owner' | 'adapter' | 'observer';
  targetBinding?: string;
}

export type AuthorityConflictStatus = 'resolved' | 'blocking';
export type AuthorityConflictReasonCode =
  | 'DUPLICATE_AUTHORITY_OWNER'
  | 'BOUND_TO_CANONICAL_AUTHORITY'
  | 'DONOR_AUTHORITY_DROPPED'
  | 'AUTHORITY_COMPONENT_NOT_FOUND';

export interface AuthorityConflict {
  conflictId: string;
  referenceId: string;
  sourcePath: string;
  symbol?: string;
  authorityId: ProtectedAuthorityId;
  status: AuthorityConflictStatus;
  reasonCode: AuthorityConflictReasonCode;
  targetBinding?: string;
}

export interface AuthorityConflictAssessment {
  ready: boolean;
  conflicts: AuthorityConflict[];
}

function componentKey(value: { referenceId: string; sourcePath: string; symbol?: string }): string {
  return [value.referenceId, value.sourcePath, value.symbol ?? ''].join('\u0000');
}

function conflictId(value: Omit<AuthorityConflict, 'conflictId'>): string {
  const text = JSON.stringify(value, Object.keys(value).sort());
  return `authority:${createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32)}`;
}
function makeConflict(
  claim: DonorAuthorityClaim,
  status: AuthorityConflictStatus,
  reasonCode: AuthorityConflictReasonCode,
  targetBinding?: string,
): AuthorityConflict {
  const body: Omit<AuthorityConflict, 'conflictId'> = {
    referenceId: claim.referenceId,
    sourcePath: claim.sourcePath,
    ...(claim.symbol ? { symbol: claim.symbol } : {}),
    authorityId: claim.authorityId,
    status,
    reasonCode,
    ...(targetBinding ? { targetBinding } : {}),
  };
  return { conflictId: conflictId(body), ...body };
}

export function evaluateAuthorityConflicts(
  components: TransplantComponent[],
  claims: DonorAuthorityClaim[],
): AuthorityConflictAssessment {
  const byKey = new Map(components.map((component) => [componentKey(component), component]));
  const conflicts: AuthorityConflict[] = [];

  for (const claim of claims) {
    if (claim.role !== 'owner') continue;
    const component = byKey.get(componentKey(claim));
    if (!component) {
      conflicts.push(makeConflict(claim, 'blocking', 'AUTHORITY_COMPONENT_NOT_FOUND'));
      continue;
    }
    if (component.action === 'DROP') {
      conflicts.push(makeConflict(claim, 'resolved', 'DONOR_AUTHORITY_DROPPED'));
      continue;
    }
    const canonical = PROTECTED_AUTHORITIES[claim.authorityId].canonicalBinding;
    const bound = component.targetBinding === canonical && claim.targetBinding === canonical;
    const transplantBoundary = component.action === 'ADAPT'
      || component.action === 'REPLACE'
      || component.action === 'REIMPLEMENT';
    if (bound && transplantBoundary) {
      conflicts.push(makeConflict(claim, 'resolved', 'BOUND_TO_CANONICAL_AUTHORITY', canonical));
      continue;
    }
    conflicts.push(makeConflict(
      claim,
      'blocking',
      'DUPLICATE_AUTHORITY_OWNER',
      component.targetBinding ?? claim.targetBinding,
    ));
  }

  conflicts.sort((left, right) => left.conflictId.localeCompare(right.conflictId));
  return { ready: conflicts.every((item) => item.status === 'resolved'), conflicts };
}