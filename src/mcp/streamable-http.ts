function isRpcResponseEnvelope(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && ('result' in value || 'error' in value),
  );
}

export function parseJsonRpcHttpResponse(text: string, contentType: string): Record<string, unknown> {
  if (contentType.toLowerCase().includes('application/json')) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('MCP_JSON_RESPONSE_NOT_OBJECT');
    }
    return parsed as Record<string, unknown>;
  }

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const complete = normalized.endsWith('\n\n')
    ? normalized.split('\n\n').slice(0, -1)
    : normalized.split('\n\n').slice(0, -1);

  let envelope: Record<string, unknown> | undefined;
  for (const event of complete) {
    const data: string[] = [];
    for (const rawLine of event.split('\n')) {
      if (!rawLine || rawLine.startsWith(':')) continue;
      const colon = rawLine.indexOf(':');
      const field = colon >= 0 ? rawLine.slice(0, colon) : rawLine;
      let value = colon >= 0 ? rawLine.slice(colon + 1) : '';
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'data') data.push(value);
    }
    if (!data.length) continue;
    try {
      const parsed = JSON.parse(data.join('\n'));
      if (isRpcResponseEnvelope(parsed)) envelope = parsed;
    } catch {
      // Ignore non-JSON/progress events and keep scanning for the response envelope.
    }
  }

  if (!envelope) throw new Error('MCP_SSE_JSONRPC_RESPONSE_NOT_FOUND_OR_INCOMPLETE');
  return envelope;
}

export interface JsonRpcResponseOptions {
  expectedId: string | number;
  maxBytes: number;
  maxFrameBytes: number;
  signal?: AbortSignal;
}
class McpResponseError extends Error {}
function responseFailure(code: string): never { throw new McpResponseError(code); }
function matchingResponse(value: unknown, expectedId: string | number): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return responseFailure('MCP_RESPONSE_ENVELOPE_INVALID');
  const v = value as Record<string, unknown>;
  const result = Object.hasOwn(v, 'result'), error = Object.hasOwn(v, 'error');
  if (v.jsonrpc !== '2.0') return responseFailure('MCP_RESPONSE_VERSION_INVALID');
  if (!result && !error && typeof v.method === 'string') return undefined;
  if (result === error) return responseFailure('MCP_RESPONSE_ENVELOPE_INVALID');
  if (v.id === null && error) return responseFailure('MCP_JSONRPC_UNSCOPED_ERROR');
  if (typeof v.id !== 'string' && !(typeof v.id === 'number' && Number.isFinite(v.id))) {
    return responseFailure('MCP_RESPONSE_ID_INVALID');
  }
  if (v.id !== expectedId) return undefined;
  if (error) {
    const code = (v.error as { code?: unknown } | null)?.code;
    return responseFailure('MCP_JSONRPC_ERROR' + (typeof code === 'number' && Number.isSafeInteger(code) ? ':' + code : ''));
  }
  return v;
}

/** Bounded incremental consumption; owns only this response reader, never request replay. */
export async function readJsonRpcHttpResponse(response: Response, options: JsonRpcResponseOptions): Promise<Record<string, unknown>> {
  const { expectedId, maxBytes, maxFrameBytes, signal } = options;
  if ((typeof expectedId !== 'string' && !(typeof expectedId === 'number' && Number.isFinite(expectedId)))
    || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1) {
    return responseFailure('MCP_RESPONSE_OPTIONS_INVALID');
  }
  if (!response.body) return responseFailure('MCP_RESPONSE_BODY_MISSING');
  const reader = response.body.getReader();
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    // A broken upstream cancellation hook must not hold a completed result forever.
    void reader.cancel().catch(() => undefined);
  };
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => { cancel(); rejectAbort(new McpResponseError('MCP_RESPONSE_ABORTED')); };
  const checkAbort = () => { if (signal?.aborted) responseFailure('MCP_RESPONSE_ABORTED'); };
  let total = 0, frameBytes = 0, lineBytes = 0;
  let skipLf = false, firstLine = true;
  let lineParts: Uint8Array[] = [], data: string[] = [];
  const jsonParts: Uint8Array[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const json = (response.headers.get('content-type') ?? '').toLowerCase().includes('application/json');
  const charge = (count: number) => {
    frameBytes += count;
    if (frameBytes > maxFrameBytes) responseFailure('MCP_RESPONSE_FRAME_LIMIT_EXCEEDED');
  };
  const finishLine = (): Record<string, unknown> | undefined => {
    let line = decoder.decode(Buffer.concat(lineParts, lineBytes));
    lineParts = []; lineBytes = 0;
    if (firstLine) { firstLine = false; if (line.startsWith('\uFEFF')) line = line.slice(1); }
    if (!line) {
      const payload = data.join('\n'); data = []; frameBytes = 0;
      if (!payload) return undefined;
      let parsed: unknown;
      try { parsed = JSON.parse(payload); } catch { return undefined; }
      return matchingResponse(parsed, expectedId);
    }
    if (line.startsWith(':')) return undefined;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    return undefined;
  };
  try {
    checkAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (!response.ok) return responseFailure('MCP_HTTP_ERROR:' + response.status);
    for (;;) {
      const item = await Promise.race([reader.read(), aborted]);
      checkAbort();
      if (item.done) break;
      const bytes = item.value;
      if (!(bytes instanceof Uint8Array)) return responseFailure('MCP_RESPONSE_CHUNK_INVALID');
      total += bytes.byteLength;
      if (total > maxBytes) return responseFailure('MCP_RESPONSE_TOTAL_LIMIT_EXCEEDED');
      if (json) { charge(bytes.byteLength); jsonParts.push(bytes); continue; }
      let start = 0;
      for (let index = 0; index < bytes.length; index += 1) {
        const byte = bytes[index];
        if (skipLf) {
          skipLf = false;
          if (byte === 10) { if (frameBytes) charge(1); start = index + 1; continue; }
        }
        if (byte !== 10 && byte !== 13) continue;
        charge(index - start + 1);
        if (index > start) { lineParts.push(bytes.subarray(start, index)); lineBytes += index - start; }
        const matched = finishLine();
        if (matched) return matched;
        start = index + 1; skipLf = byte === 13;
      }
      if (start < bytes.length) {
        charge(bytes.length - start);
        lineParts.push(bytes.subarray(start)); lineBytes += bytes.length - start;
      }
    }
    if (json) {
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(jsonParts, total))); }
      catch { return responseFailure('MCP_RESPONSE_JSON_INVALID'); }
      const matched = matchingResponse(parsed, expectedId);
      if (matched) return matched;
    }
    return responseFailure('MCP_RESPONSE_NOT_FOUND_OR_INCOMPLETE');
  } catch (error) {
    if (signal?.aborted) return responseFailure('MCP_RESPONSE_ABORTED');
    if (error instanceof McpResponseError) throw error;
    return responseFailure('MCP_RESPONSE_READ_FAILED');
  } finally {
    signal?.removeEventListener('abort', onAbort);
    cancel();
    try { reader.releaseLock(); } catch { /* owned reader only */ }
  }
}
