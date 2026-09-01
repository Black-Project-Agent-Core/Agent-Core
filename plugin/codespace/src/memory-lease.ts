import { CodespaceError } from './errors.js';

export type CodespaceMemoryLifecycleMode = 'disabled' | 'advisory' | 'enforce';

export interface MemoryLeaseRuntimeConfig {
  mode: CodespaceMemoryLifecycleMode;
  endpoint: string | null;
  timeoutMs: number;
}

export interface MemoryLeaseDecision {
  mode: CodespaceMemoryLifecycleMode;
  required: boolean;
  valid: boolean;
  mutationClass: string;
  advisoryCode?: 'MEMORY_PREFLIGHT_REQUIRED' | 'MEMORY_POSTFLIGHT_REQUIRED';
  postflightState?: 'POSTFLIGHT_PENDING';
}

export interface MemoryLeaseRequest {
  toolName: string;
  workspaceRoot: string;
  lease?: string;
  input?: Record<string, unknown>;
}

const ENDPOINT_PATH = '/internal/memory-context-lease';
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_LEASE_CHARS = 4096;
const DEFAULT_TIMEOUT_MS = 2000;

function parseMode(value: string | undefined): CodespaceMemoryLifecycleMode {
  const normalized = value?.trim().toLowerCase() || 'disabled';
  if (normalized === 'disabled' || normalized === 'advisory' || normalized === 'enforce') return normalized;
  throw new CodespaceError(
    'MEMORY_LIFECYCLE_CONFIG_INVALID',
    'CODESPACE_MEMORY_LIFECYCLE_MODE must be disabled, advisory, or enforce.',
  );
}

function parseEndpoint(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CodespaceError(
      'MEMORY_LIFECYCLE_CONFIG_INVALID',
      'CODESPACE_AGENT_CORE_MEMORY_LEASE_URL must be an exact loopback Agent Core lease endpoint.',
    );
  }
  if (
    url.protocol !== 'http:'
    || url.hostname !== '127.0.0.1'
    || !url.port
    || url.pathname !== ENDPOINT_PATH
    || url.search
    || url.hash
    || url.username
    || url.password
  ) {
    throw new CodespaceError(
      'MEMORY_LIFECYCLE_CONFIG_INVALID',
      'CODESPACE_AGENT_CORE_MEMORY_LEASE_URL must be an exact loopback Agent Core lease endpoint.',
    );
  }
  return url.toString();
}

function parseTimeout(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 100 || parsed > 10_000) {
    throw new CodespaceError(
      'MEMORY_LIFECYCLE_CONFIG_INVALID',
      'CODESPACE_MEMORY_LEASE_TIMEOUT_MS must be an integer between 100 and 10000.',
    );
  }
  return parsed;
}

export function parseMemoryLeaseRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): MemoryLeaseRuntimeConfig {
  return {
    mode: parseMode(env.CODESPACE_MEMORY_LIFECYCLE_MODE),
    endpoint: parseEndpoint(env.CODESPACE_AGENT_CORE_MEMORY_LEASE_URL),
    timeoutMs: parseTimeout(env.CODESPACE_MEMORY_LEASE_TIMEOUT_MS),
  };
}

function fixedFailure(
  phase: 'before' | 'after',
  mutationCommitted = false,
): CodespaceError {
  const after = phase === 'after';
  return new CodespaceError(
    after ? 'MEMORY_POSTFLIGHT_REQUIRED' : 'MEMORY_PREFLIGHT_REQUIRED',
    after
      ? 'Workspace mutation completed but Agent Core could not record the required memory postflight.'
      : 'A valid Agent Core Memory Context Lease is required before this workspace mutation.',
    mutationCommitted ? { mutationCommitted: true } : undefined,
  );
}

function unavailableDecision(
  phase: 'before' | 'after',
): MemoryLeaseDecision {
  return {
    mode: 'advisory',
    required: true,
    valid: false,
    mutationClass: 'authority_unavailable',
    advisoryCode: phase === 'after' ? 'MEMORY_POSTFLIGHT_REQUIRED' : 'MEMORY_PREFLIGHT_REQUIRED',
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('MEMORY_LEASE_RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('MEMORY_LEASE_RESPONSE_INVALID');
  }
}

function parseDecision(value: unknown, mode: CodespaceMemoryLifecycleMode): MemoryLeaseDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('MEMORY_LEASE_RESPONSE_INVALID');
  const row = value as Record<string, unknown>;
  if (row.ok !== true || row.mode !== mode || typeof row.required !== 'boolean' || typeof row.valid !== 'boolean') {
    throw new Error('MEMORY_LEASE_RESPONSE_INVALID');
  }
  if (typeof row.mutationClass !== 'string' || row.mutationClass.length < 1 || row.mutationClass.length > 128) {
    throw new Error('MEMORY_LEASE_RESPONSE_INVALID');
  }
  const decision: MemoryLeaseDecision = {
    mode,
    required: row.required,
    valid: row.valid,
    mutationClass: row.mutationClass,
  };
  if (row.advisoryCode !== undefined) {
    if (row.advisoryCode !== 'MEMORY_PREFLIGHT_REQUIRED' && row.advisoryCode !== 'MEMORY_POSTFLIGHT_REQUIRED') {
      throw new Error('MEMORY_LEASE_RESPONSE_INVALID');
    }
    decision.advisoryCode = row.advisoryCode;
  }
  if (row.postflightState !== undefined) {
    if (row.postflightState !== 'POSTFLIGHT_PENDING') throw new Error('MEMORY_LEASE_RESPONSE_INVALID');
    decision.postflightState = row.postflightState;
  }
  return decision;
}

export class CodespaceMemoryLeaseClient {
  constructor(readonly config: MemoryLeaseRuntimeConfig) {}

  async before(request: MemoryLeaseRequest): Promise<MemoryLeaseDecision> {
    return this.request('before', request);
  }

  async after(request: MemoryLeaseRequest): Promise<MemoryLeaseDecision> {
    return this.request('after', request);
  }

  private async request(
    phase: 'before' | 'after',
    request: MemoryLeaseRequest,
  ): Promise<MemoryLeaseDecision> {
    if (this.config.mode === 'disabled') {
      return { mode: 'disabled', required: false, valid: true, mutationClass: 'disabled' };
    }
    if (request.lease !== undefined && (request.lease.length < 16 || request.lease.length > MAX_LEASE_CHARS)) {
      if (this.config.mode === 'advisory') return unavailableDecision(phase);
      throw fixedFailure(phase, phase === 'after');
    }
    if (!this.config.endpoint) {
      if (this.config.mode === 'advisory') return unavailableDecision(phase);
      throw fixedFailure(phase, phase === 'after');
    }

    let response: Response;
    try {
      response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          action: phase,
          toolName: request.toolName,
          workspaceRoot: request.workspaceRoot,
          ...(request.lease ? { lease: request.lease } : {}),
          input: request.input ?? {},
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch {
      if (this.config.mode === 'advisory') return unavailableDecision(phase);
      throw fixedFailure(phase, phase === 'after');
    }

    if (!response.ok) {
      // Deliberately discard the authority body. It must never become a token-reflection channel.
      await response.body?.cancel().catch(() => undefined);
      if (this.config.mode === 'advisory') return unavailableDecision(phase);
      throw fixedFailure(phase, phase === 'after');
    }

    try {
      return parseDecision(await readBoundedJson(response), this.config.mode);
    } catch {
      if (this.config.mode === 'advisory') return unavailableDecision(phase);
      throw fixedFailure(phase, phase === 'after');
    }
  }
}
