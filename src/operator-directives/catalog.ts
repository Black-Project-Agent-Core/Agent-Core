import type { OperatorDirectiveCatalogEntryShape } from './types.js';

export const OPERATOR_DIRECTIVE_KEYS = ['dev_tool_install_consent'] as const;
export type OperatorDirectiveKey = (typeof OPERATOR_DIRECTIVE_KEYS)[number];

export const OPERATOR_DIRECTIVE_CATALOG = {
  dev_tool_install_consent: {
    directiveKey: 'dev_tool_install_consent',
    category: 'standing_consent',
    scope: 'principal_global',
    trustClass: 'authenticated_user_explicit',
    effect: 'allow_benign_development_dependency_install_without_chat_reconfirmation',
    effectVersion: 1,
    expandsAgentCoreToolPermissions: false,
    bypassesSafetyPolicy: false,
    bypassesOsAuthorization: false,
    promptContext: 'The authenticated operator has an active persistent standing consent allowing benign development/build dependencies genuinely required for the current development task to be installed without asking for another chat-level confirmation. This standing consent does not bypass Agent Core routing/tool policy, system safety policy, UAC/OS authorization, destructive-operation gates, credential protection, unrelated software boundaries, financial actions, or remote publishing/deployment authorization.',
  },
} as const satisfies Record<OperatorDirectiveKey, OperatorDirectiveCatalogEntryShape>;

export function isOperatorDirectiveKey(value: string): value is OperatorDirectiveKey {
  return (OPERATOR_DIRECTIVE_KEYS as readonly string[]).includes(value);
}

export function operatorDirectiveCatalogEntry(key: OperatorDirectiveKey) {
  return OPERATOR_DIRECTIVE_CATALOG[key];
}
