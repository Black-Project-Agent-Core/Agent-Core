export type CraftingMode = 'BUILD_FROM_ZERO' | 'FEATURE_TRANSPLANTATION';
export type CraftingReferenceKind = 'git_repo' | 'local_repo' | 'source_bundle';
export type CraftingReferenceAvailability = 'available' | 'unavailable' | 'ambiguous';

export interface CraftingReference {
  referenceId: string;
  kind: CraftingReferenceKind;
  repository?: string;
  localPath?: string;
  commit?: string;
  tree?: string;
  bundleHash?: string;
  featureScope: string;
  approvalSource: string;
  availability?: CraftingReferenceAvailability;
  required?: boolean;
}

export interface CraftingFeatureContract {
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
export type CraftingReasonCode =
  | 'NO_APPROVED_REFERENCE'
  | 'APPROVED_REFERENCE_PRESENT'
  | 'MULTIPLE_APPROVED_REFERENCES'
  | 'REFERENCE_REQUIRED'
  | 'REFERENCE_UNAVAILABLE'
  | 'REFERENCE_AMBIGUOUS';

export interface CraftingModeDecision {
  craftingId: string;
  routeContextId: string;
  projectId: string;
  mode: CraftingMode;
  featureContractHash: string;
  references: CraftingReference[];
  referenceSetHash: string;
  reasonCodes: CraftingReasonCode[];
}

export interface ResolveCraftingModeRequest {
  routeContextId: string;
  projectId: string;
  feature: CraftingFeatureContract;
  references?: CraftingReference[];
  referencePolicy?: 'optional' | 'required';
}
