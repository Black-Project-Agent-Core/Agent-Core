import { operatorDirectiveCatalogEntry, type OperatorDirectiveKey } from './catalog.js';

export function buildOperatorDirectivePromptContext(directiveKeys: readonly OperatorDirectiveKey[]): string {
  return [...new Set(directiveKeys)]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => operatorDirectiveCatalogEntry(key).promptContext)
    .join('\n');
}
