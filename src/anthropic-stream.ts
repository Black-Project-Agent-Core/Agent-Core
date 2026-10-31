/**
 * Reassembles an Anthropic Messages server-sent-event stream into the object a non-streaming call returns, so the
 * provider keeps one response parser. Streaming keeps the connection busy (headers at once, events and pings
 * while the model thinks) instead of one silent wait that Node's fetch ends after about five minutes.
 */

/** The API reported an error inside an otherwise accepted stream (for example `overloaded_error`). */
export class AnthropicStreamError extends Error {
  constructor(readonly errorType: string, message: string) {
    super(message);
    this.name = 'AnthropicStreamError';
  }
}

const STATUS_BY_ERROR_TYPE: Record<string, number> = {
  invalid_request_error: 400, authentication_error: 401, billing_error: 402, permission_error: 403,
  not_found_error: 404, request_too_large: 413, rate_limit_error: 429, api_error: 500, timeout_error: 504,
  overloaded_error: 529,
};

/** HTTP status the same error would carry outside a stream, so failure classification stays unchanged. */
export function statusForStreamError(errorType: string): number {
  return STATUS_BY_ERROR_TYPE[errorType] ?? 500;
}

type Block = Record<string, any>;

function invalid(): Error {
  return new Error('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
}

/** A stream that ends before `message_stop` lost its connection: classified like any other transport cut. */
function incomplete(): Error {
  return new Error('AGENT_RUNTIME_PROVIDER_STREAM_INCOMPLETE', {
    cause: Object.assign(new Error('stream ended before message_stop'), { code: 'UND_ERR_SOCKET' }),
  });
}

export async function readAnthropicMessageStream(
  response: Response, options: { maxBytes: number; label: string; signal?: AbortSignal;
    onTextDelta?: (text: string) => void | Promise<void> },
): Promise<any> {
  const body = response.body;
  if (!body) throw invalid();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const blocks: Block[] = [];
  const partialJson = new Map<number, string>();
  let message: any;
  let stopped = false;
  let received = 0;
  let buffer = '';

  const emitText = async (text: unknown) => {
    options.signal?.throwIfAborted();
    if (typeof text !== 'string' || !text) return;
    try { await options.onTextDelta?.(text); } catch { /* Presentation cannot fail a model call. */ }
  };
  const apply = async (type: string, data: any) => {
    switch (type) {
      case 'message_start':
        if (!data?.message || typeof data.message !== 'object') throw invalid();
        message = { ...data.message, content: [], usage: { ...(data.message.usage ?? {}) } };
        return;
      case 'content_block_start':
        if (!message || !Number.isInteger(data?.index) || data.index < 0 || typeof data.content_block !== 'object') throw invalid();
        blocks[data.index] = { ...data.content_block };
        if (blocks[data.index]!.input !== undefined) partialJson.set(data.index, '');
        if (blocks[data.index]!.type === 'text') await emitText(blocks[data.index]!.text);
        return;
      case 'content_block_delta': {
        const block = blocks[data?.index];
        const delta = data?.delta;
        if (!block || !delta || typeof delta !== 'object') throw invalid();
        if (delta.type === 'text_delta') {
          if (block.type !== 'text' || typeof delta.text !== 'string') throw invalid();
          block.text = (block.text ?? '') + delta.text;
          await emitText(delta.text);
        }
        else if (delta.type === 'thinking_delta') block.thinking = (block.thinking ?? '') + String(delta.thinking ?? '');
        else if (delta.type === 'signature_delta') block.signature = String(delta.signature ?? '');
        else if (delta.type === 'input_json_delta') partialJson.set(data.index, (partialJson.get(data.index) ?? '') + String(delta.partial_json ?? ''));
        else if (delta.type === 'citations_delta' && delta.citation) block.citations = [...(block.citations ?? []), delta.citation];
        return;
      }
      case 'content_block_stop': {
        const json = partialJson.get(data?.index);
        if (json === undefined) return;
        partialJson.delete(data.index);
        try { blocks[data.index]!.input = json.trim() ? JSON.parse(json) : {}; } catch { throw invalid(); }
        return;
      }
      case 'message_delta':
        if (!message) throw invalid();
        if (data?.delta && 'stop_reason' in data.delta) message.stop_reason = data.delta.stop_reason;
        if (data?.delta && 'stop_sequence' in data.delta) message.stop_sequence = data.delta.stop_sequence;
        for (const [key, value] of Object.entries(data?.usage ?? {})) if (value !== null && value !== undefined) message.usage[key] = value;
        return;
      case 'message_stop':
        stopped = true;
        return;
      case 'error':
        throw new AnthropicStreamError(String(data?.error?.type ?? 'api_error'), String(data?.error?.message ?? 'stream error').slice(0, 500));
      default:
        // ping and event types added later by the API carry nothing this parser needs.
    }
  };

  const handleEvent = async (raw: string) => {
    let eventName = '';
    const data: string[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) return;
    let parsed: any;
    try { parsed = JSON.parse(data.join('\n')); } catch { throw invalid(); }
    await apply(typeof parsed?.type === 'string' ? parsed.type : eventName, parsed);
  };

  const drain = async () => {
    buffer = buffer.replace(/\r\n/g, '\n');
    for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      await handleEvent(raw);
    }
  };

  const abort = () => { void reader.cancel(options.signal?.reason).catch(() => {}); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      options.signal?.throwIfAborted();
      const item = await reader.read();
      options.signal?.throwIfAborted();
      if (item.done) break;
      received += item.value.byteLength;
      if (received > options.maxBytes) throw new Error(`${options.label} exceeded ${options.maxBytes} bytes`);
      buffer += decoder.decode(item.value, { stream: true });
      await drain();
    }
    buffer += decoder.decode();
    await drain();
    if (buffer.trim()) await handleEvent(buffer.replace(/\r\n/g, '\n'));
  } catch (error) {
    try { await reader.cancel(); } catch { /* keep the original failure */ }
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abort);
    try { reader.releaseLock(); } catch { /* best effort */ }
  }
  if (!message || !stopped) throw incomplete();
  message.content = blocks.filter(Boolean);
  return message;
}
