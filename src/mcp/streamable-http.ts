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
