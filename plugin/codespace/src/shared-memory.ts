import { CodespaceError } from './errors.js';

export interface SharedMemoryRuntimeConfig {
  endpoint: string | null;
  timeoutMs: number;
}

const ENDPOINT_PATH = '/internal/codespace-memory';
const DEFAULT_TIMEOUT_MS = 2000;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;

function parseEndpoint(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  let url: URL;
  try { url = new URL(value); }
  catch {
    throw new CodespaceError('SHARED_MEMORY_CONFIG_INVALID', 'CODESPACE_AGENT_CORE_SHARED_MEMORY_URL must be an exact loopback Agent Core shared-memory endpoint.');
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
    throw new CodespaceError('SHARED_MEMORY_CONFIG_INVALID', 'CODESPACE_AGENT_CORE_SHARED_MEMORY_URL must be an exact loopback Agent Core shared-memory endpoint.');
  }
  return url.toString();
}

function parseTimeout(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 100 || parsed > 10_000) {
    throw new CodespaceError('SHARED_MEMORY_CONFIG_INVALID', 'CODESPACE_SHARED_MEMORY_TIMEOUT_MS must be an integer between 100 and 10000.');
  }
  return parsed;
}

export function parseSharedMemoryRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): SharedMemoryRuntimeConfig {
  return {
    endpoint: parseEndpoint(env.CODESPACE_AGENT_CORE_SHARED_MEMORY_URL),
    timeoutMs: parseTimeout(env.CODESPACE_SHARED_MEMORY_TIMEOUT_MS),
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new CodespaceError('SHARED_MEMORY_RESPONSE_INVALID', 'Agent Core shared-memory response was empty.');
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
        throw new CodespaceError('SHARED_MEMORY_RESPONSE_INVALID', 'Agent Core shared-memory response exceeded the bounded size.');
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
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new CodespaceError('SHARED_MEMORY_RESPONSE_INVALID', 'Agent Core shared-memory response was invalid JSON.');
  }
}

function remoteErrorCode(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>).error;
  if (typeof raw !== 'string' || !/^[A-Z][A-Z0-9_]{2,127}$/.test(raw)) return null;
  return raw;
}

export class CodespaceSharedMemoryClient {
  constructor(readonly config: SharedMemoryRuntimeConfig) {}

  status(workspaceRoot: string): Promise<unknown> {
    return this.request('status', workspaceRoot, {});
  }

  openContext(workspaceRoot: string, input: Record<string, unknown>): Promise<unknown> {
    return this.request('open_context', workspaceRoot, input);
  }

  search(workspaceRoot: string, input: Record<string, unknown>): Promise<any> {
    return this.request('search', workspaceRoot, input);
  }

  get(workspaceRoot: string, memoryId: string): Promise<unknown> {
    return this.request('get', workspaceRoot, { memoryId });
  }

  explain(workspaceRoot: string, memoryId: string, query?: string): Promise<unknown> {
    return this.request('explain', workspaceRoot, { memoryId, ...(query ? { query } : {}) });
  }

  rememberMore(workspaceRoot: string, input: Record<string, unknown>): Promise<unknown> {
    return this.request('remember_more', workspaceRoot, input);
  }

  checkpoint(workspaceRoot: string, input: Record<string, unknown>): Promise<unknown> {
    return this.request('checkpoint', workspaceRoot, input);
  }

  private async request(action: string, workspaceRoot: string, input: Record<string, unknown>): Promise<any> {
    if (!this.config.endpoint) {
      throw new CodespaceError('SHARED_MEMORY_UNAVAILABLE', 'Agent Core shared-memory authority is not configured for this Codespace bridge.');
    }
    const body = JSON.stringify({ action, workspaceRoot, ...input });
    if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) {
      throw new CodespaceError('SHARED_MEMORY_REQUEST_TOO_LARGE', 'Shared-memory request exceeded the bounded size.');
    }
    let response: Response;
    try {
      response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch {
      throw new CodespaceError('SHARED_MEMORY_UNAVAILABLE', 'Agent Core shared-memory authority is unavailable.');
    }

    const parsed = await readBoundedJson(response);
    if (!response.ok) {
      throw new CodespaceError(remoteErrorCode(parsed) ?? 'SHARED_MEMORY_UNAVAILABLE', 'Agent Core shared-memory request failed.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new CodespaceError('SHARED_MEMORY_RESPONSE_INVALID', 'Agent Core shared-memory response shape was invalid.');
    }
    const row = parsed as Record<string, unknown>;
    if (row.ok !== true || !('result' in row)) {
      throw new CodespaceError('SHARED_MEMORY_RESPONSE_INVALID', 'Agent Core shared-memory response shape was invalid.');
    }
    return row.result;
  }
}
