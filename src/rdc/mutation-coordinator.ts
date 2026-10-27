import path from 'node:path';
import type { ExternalInvocationContext } from '../learning/external-controller.js';

export type AutoCheckpointReason = 'grant-unavailable' | 'path-not-eligible' | 'unsupported-operation'
  | 'dry-run' | 'no-change' | 'budget-exceeded' | 'quota-reached' | 'quota-unavailable' | 'capture-failed';
export type AutoCheckpointReceipt = Readonly<{
  status: 'captured' | 'not-captured'; checkpointId?: string; reason?: AutoCheckpointReason;
  pathCount?: number; capturedBytes?: number;
}>;
/** Host-only execution input. No public schema accepts this object or grants. */
export interface MutationExecutionContext {
  readonly invocationId: string;
  readonly taskId?: string;
  readonly invocationContext?: ExternalInvocationContext;
  readonly checkpointGranted: boolean;
  readonly signal?: AbortSignal;
  readonly reportAutoCheckpoint: (receipt: AutoCheckpointReceipt) => void;
}
export function appendAutoCheckpointReceipt<T>(result: T, receipt: AutoCheckpointReceipt): T {
  if (!result || typeof result !== 'object') return result;
  const value = result as T & { content?: unknown[]; autoCheckpoint?: AutoCheckpointReceipt };
  if (value.autoCheckpoint) return result;
  return { ...value, autoCheckpoint: receipt,
    content: [...(Array.isArray(value.content) ? value.content : []),
      { type: 'text', text: 'AUTO_CHECKPOINT ' + JSON.stringify(receipt) }] } as T;
}
export function attachAutoCheckpointError(error: unknown, receipt: AutoCheckpointReceipt): unknown {
  if (error instanceof Error && Object.isExtensible(error)) {
    const value = error as Error & { autoCheckpoint?: AutoCheckpointReceipt };
    if (!value.autoCheckpoint) {
      value.autoCheckpoint = receipt;
      value.message += '\nAUTO_CHECKPOINT ' + JSON.stringify(receipt);
    }
  }
  return error;
}

import { realpath } from 'node:fs/promises';

function platformKey(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function canonicalMutationKey(input: string): Promise<string> {
  const resolved = path.resolve(input);
  try {
    return platformKey(await realpath(resolved));
  } catch {
    try {
      const parent = await realpath(path.dirname(resolved));
      return platformKey(path.join(parent, path.basename(resolved)));
    } catch {
      return platformKey(resolved);
    }
  }
}

export class PathMutationCoordinator {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(paths: string[], action: () => Promise<T>): Promise<T> {
    const keys = [...new Set(await Promise.all(paths.map(canonicalMutationKey)))].sort();
    const releases: Array<() => void> = [];
    try {
      for (const key of keys) {
        const previous = this.tails.get(key) ?? Promise.resolve();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const tail = previous.catch(() => undefined).then(() => gate);
        this.tails.set(key, tail);
        await previous.catch(() => undefined);
        releases.push(() => {
          release();
          if (this.tails.get(key) === tail) this.tails.delete(key);
        });
      }
      return await action();
    } finally {
      for (let index = releases.length - 1; index >= 0; index -= 1) releases[index]();
    }
  }
}

export const fileMutationCoordinator = new PathMutationCoordinator();
