export const OPERATOR_DIRECTIVE_TRUST_CLASSES = ['authenticated_user_explicit'] as const;
export const OPERATOR_DIRECTIVE_SCOPES = ['principal_global'] as const;
export const OPERATOR_DIRECTIVE_STATUSES = ['healthy', 'degraded', 'disabled'] as const;
export const OPERATOR_DIRECTIVE_EVENT_TYPES = ['granted', 'revised', 'revoked'] as const;

export type OperatorDirectiveTrustClass = (typeof OPERATOR_DIRECTIVE_TRUST_CLASSES)[number];
export type OperatorDirectiveScope = (typeof OPERATOR_DIRECTIVE_SCOPES)[number];
export type OperatorDirectiveStatusState = (typeof OPERATOR_DIRECTIVE_STATUSES)[number];
export type OperatorDirectiveEventType = (typeof OPERATOR_DIRECTIVE_EVENT_TYPES)[number];

export interface OperatorDirectiveCatalogEntryShape {
  directiveKey: string;
  category: 'standing_consent';
  scope: OperatorDirectiveScope;
  trustClass: OperatorDirectiveTrustClass;
  effect: string;
  effectVersion: number;
  expandsAgentCoreToolPermissions: false;
  bypassesSafetyPolicy: false;
  bypassesOsAuthorization: false;
  promptContext: string;
}
