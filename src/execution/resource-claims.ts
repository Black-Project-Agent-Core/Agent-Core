import path from 'node:path';
import { realpath } from 'node:fs/promises';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import type { ExecutionResourceSpec } from './dag.js';

export interface ExecutionClaim { key: string; mode: 'read' | 'write'; kind: 'path' | 'named' }
export function hasExecutionResourceClaims(resources?: ExecutionResourceSpec): boolean {
  return Boolean(resources && ((resources.reads?.length ?? 0) + (resources.writes?.length ?? 0) + (resources.exclusive?.length ?? 0)));
}

export async function canonicalExecutionPath(target: string): Promise<string> {
  const suffix: string[] = [];
  let parent = path.resolve(target);
  for (;;) {
    try {
      const resolved = path.join(await realpath(parent), ...suffix);
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const next = path.dirname(parent);
      if (next === parent) throw error;
      suffix.unshift(path.basename(parent));
      parent = next;
    }
  }
}

function overlaps(left: ExecutionClaim, right: ExecutionClaim): boolean {
  if (left.kind !== right.kind || (left.mode === 'read' && right.mode === 'read')) return false;
  return left.key === right.key || (left.kind === 'path'
    && (left.key.startsWith(`${right.key}${path.sep}`) || right.key.startsWith(`${left.key}${path.sep}`)));
}

/** One runtime owns this registry: claims coordinate all its runs, independent of principal. */
export class ExecutionResourceClaims {
  private readonly owners = new Map<string, ExecutionClaim[]>();

  async resolve(workspace: WorkspacePolicy, cwd: string, resources?: ExecutionResourceSpec, inputs: string[] = []): Promise<ExecutionClaim[]> {
    const declared = hasExecutionResourceClaims(resources);
    const reads = [...(resources?.reads ?? []), ...inputs];
    const writes = declared ? resources?.writes ?? [] : [workspace.resolveProjectRoot({ candidatePaths: [cwd] })];
    const claims: ExecutionClaim[] = [];
    for (const [mode, targets] of [['read', reads], ['write', writes]] as const) {
      for (const target of targets) {
        const verified = await workspace.resolveTarget(path.resolve(cwd, target));
        claims.push({ kind: 'path', mode, key: await canonicalExecutionPath(verified) });
      }
    }
    for (const name of resources?.exclusive ?? []) claims.push({ kind: 'named', mode: 'write', key: name });
    return claims.sort((a, b) => a.key.localeCompare(b.key) || a.mode.localeCompare(b.mode));
  }

  acquire(owner: string, claims: ExecutionClaim[]): boolean {
    for (const [other, held] of this.owners) {
      if (other !== owner && claims.some((claim) => held.some((existing) => overlaps(claim, existing)))) return false;
    }
    this.owners.set(owner, claims);
    return true;
  }

  release(owner: string): void { this.owners.delete(owner); }
  get size(): number { return this.owners.size; }
}
