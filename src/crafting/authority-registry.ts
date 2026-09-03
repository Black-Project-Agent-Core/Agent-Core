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

export interface ProtectedCraftingAuthority {
  authorityId: ProtectedAuthorityId;
  canonicalBinding: string;
}

export const PROTECTED_CRAFTING_AUTHORITIES: Record<ProtectedAuthorityId, ProtectedCraftingAuthority> = {
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
  sparepartId: string;
  authorityId: ProtectedAuthorityId;
  role: 'owner' | 'adapter' | 'observer';
}
export type CraftingAuthorityConflictReason =
  | 'DUPLICATE_AUTHORITY_OWNER'
  | 'BOUND_TO_CANONICAL_AUTHORITY'
  | 'DONOR_AUTHORITY_DROPPED'
  | 'AUTHORITY_SPAREPART_NOT_FOUND';

export interface CraftingAuthorityConflict {
  conflictId: string;
  sparepartId: string;
  authorityId: ProtectedAuthorityId;
  status: 'resolved' | 'blocking';
  reasonCode: CraftingAuthorityConflictReason;
  targetBinding?: string;
}
