import { createHash } from 'node:crypto';
import path from 'node:path';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import type { CraftingReference } from './types.js';

export interface ResolvedCraftingReference {
  referenceId: string;
  localRoot: string;
  identityHash: string;
  reference: CraftingReference;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

export function craftingReferenceIdentityHash(reference: CraftingReference): string {
  const identity = reference.kind === 'git_repo'
    ? { kind: reference.kind, repository: reference.repository, commit: reference.commit, tree: reference.tree }
    : reference.commit || reference.tree
      ? { kind: reference.kind, commit: reference.commit, tree: reference.tree }
      : { kind: reference.kind, bundleHash: reference.bundleHash };
  return createHash('sha256').update(stableJson(identity), 'utf8').digest('hex');
}
export async function resolveReferenceSource(
  reference: CraftingReference,
  localPath: string,
  workspace: WorkspacePolicy,
): Promise<ResolvedCraftingReference> {
  const localRoot = await workspace.resolveExisting(localPath);
  if (reference.kind === 'local_repo' && reference.localPath) {
    const declared = path.resolve(reference.localPath);
    const actual = path.resolve(localRoot);
    const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
    if (normalize(declared) !== normalize(actual)) {
      throw new Error(`Resolved local reference path does not match locked reference: ${reference.referenceId}`);
    }
  }
  return {
    referenceId: reference.referenceId,
    localRoot,
    identityHash: craftingReferenceIdentityHash(reference),
    reference: structuredClone(reference),
  };
}
