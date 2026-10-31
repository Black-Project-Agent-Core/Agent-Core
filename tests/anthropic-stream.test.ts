import { describe, expect, it, vi } from 'vitest';
import { AnthropicStreamError, readAnthropicMessageStream, statusForStreamError } from '../src/anthropic-stream.js';

type Event = [string, Record<string, unknown>];
const frame = (events: Event[], eol = '\n') => events
  .map(([name, data]) => `event: ${name}${eol}data: ${JSON.stringify({ type: name, ...data })}${eol}${eol}`).join('');
const responseOf = (text: string, chunkSize = text.length) => {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += chunkSize) controller.enqueue(bytes.slice(at, at + chunkSize));
      controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream' } });
};
const OPTIONS = { maxBytes: 1_000_000, label: 'test stream' };

const start: Event = ['message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
  content: [], stop_reason: null, usage: { input_tokens: 10, cache_creation_input_tokens: 2, cache_read_input_tokens: 5, output_tokens: 1 } } }];
const complete: Event[] = [
  start,
  ['ping', {}],
  ['content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } }],
  ['content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'sig-abc' } }],
  ['content_block_stop', { index: 0 }],
  ['content_block_start', { index: 1, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { index: 1, delta: { type: 'text_delta', text: 'Halo, ' } }],
  ['content_block_delta', { index: 1, delta: { type: 'text_delta', text: 'dünya' } }],
  ['content_block_stop', { index: 1 }],
  ['content_block_start', { index: 2, content_block: { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: {} } }],
  ['content_block_delta', { index: 2, delta: { type: 'input_json_delta', partial_json: '{"path":"E:\\\\a' } }],
  ['content_block_delta', { index: 2, delta: { type: 'input_json_delta', partial_json: '.ts"}' } }],
  ['content_block_stop', { index: 2 }],
  ['message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 42 } }],
  ['message_stop', {}],
];
const expected = {
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'tool_use', stop_sequence: null,
  content: [
    { type: 'thinking', thinking: '', signature: 'sig-abc' },
    { type: 'text', text: 'Halo, dünya' },
    { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'E:\\a.ts' } },
  ],
  usage: { input_tokens: 10, cache_creation_input_tokens: 2, cache_read_input_tokens: 5, output_tokens: 42 },
};

describe('Anthropic stream reassembly', () => {
  it('delivers only text blocks before message completion, keeping thinking and tool inputs private', async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { source = controller; } }));
    const text: string[] = [];
    let finished = false;
    const result = readAnthropicMessageStream(response, { ...OPTIONS, onTextDelta: (delta: string) => { text.push(delta); } })
      .then(value => { finished = true; return value; });
    source.enqueue(new TextEncoder().encode(frame([...complete.slice(0, 3),
      ['content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'private reasoning' } }],
      ...complete.slice(3, 8)])));
    await vi.waitFor(() => expect(text).toEqual(['Halo, ', 'dünya']));
    expect(finished).toBe(false);
    source.enqueue(new TextEncoder().encode(frame(complete.slice(8))));
    source.close();
    expect(await result).toEqual({ ...expected, content: [{ ...expected.content[0], thinking: 'private reasoning' }, ...expected.content.slice(1)] });
    expect(text.join('')).toBe('Halo, dünya');
  });

  it('cancels an idle body after partial text without delivering more fragments', async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { source = controller; }, cancel }));
    const abort = new AbortController(), onTextDelta = vi.fn();
    const outcome = readAnthropicMessageStream(response, { ...OPTIONS, signal: abort.signal, onTextDelta }).catch(error => error);
    source.enqueue(new TextEncoder().encode(frame(complete.slice(0, 7))));
    await vi.waitFor(() => expect(onTextDelta).toHaveBeenCalledWith('Halo, '));
    abort.abort(new Error('fixture-cancel'));
    expect((await outcome).message).toBe('fixture-cancel');
    expect(cancel).toHaveBeenCalledOnce();
    expect(onTextDelta).toHaveBeenCalledTimes(1);
  });

  it('never treats a text delta in a thinking block as public text', async () => {
    const onTextDelta = vi.fn();
    await expect(readAnthropicMessageStream(responseOf(frame([...complete.slice(0, 3),
      ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'private reasoning' } }],
    ])), { ...OPTIONS, onTextDelta })).rejects.toThrow('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
    expect(onTextDelta).not.toHaveBeenCalled();
  });

  it('rebuilds the non-streaming message, also when events are cut at arbitrary bytes or use CRLF', async () => {
    expect(await readAnthropicMessageStream(responseOf(frame(complete)), OPTIONS)).toEqual(expected);
    expect(await readAnthropicMessageStream(responseOf(frame(complete), 7), OPTIONS)).toEqual(expected);
    expect(await readAnthropicMessageStream(responseOf(frame(complete, '\r\n'), 5), OPTIONS)).toEqual(expected);
  });

  it('turns an error event into AnthropicStreamError and maps it to the status the same error has outside a stream', async () => {
    const text = frame([start, ['error', { error: { type: 'overloaded_error', message: 'Overloaded' } }]]);
    const failure = await readAnthropicMessageStream(responseOf(text), OPTIONS).catch(error => error);
    expect(failure).toBeInstanceOf(AnthropicStreamError);
    expect(failure).toMatchObject({ errorType: 'overloaded_error', message: 'Overloaded' });
    expect([statusForStreamError('overloaded_error'), statusForStreamError('rate_limit_error'), statusForStreamError('something_new')])
      .toEqual([529, 429, 500]);
  });

  it('treats a stream that ends before message_stop as a transport cut', async () => {
    const failure = await readAnthropicMessageStream(responseOf(frame(complete.slice(0, 8))), OPTIONS).catch(error => error);
    expect(failure.message).toBe('AGENT_RUNTIME_PROVIDER_STREAM_INCOMPLETE');
    expect(failure.cause).toMatchObject({ code: 'UND_ERR_SOCKET' });
  });

  it('rejects oversize, malformed tool input and malformed events', async () => {
    await expect(readAnthropicMessageStream(responseOf(frame(complete)), { ...OPTIONS, maxBytes: 100 })).rejects.toThrow('exceeded 100 bytes');
    const brokenInput = complete.map(item => (item[0] === 'content_block_delta' && item[1].index === 2 ? ['content_block_delta',
      { index: 2, delta: { type: 'input_json_delta', partial_json: '{"path":' } }] as Event : item));
    await expect(readAnthropicMessageStream(responseOf(frame(brokenInput)), OPTIONS)).rejects.toThrow('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
    await expect(readAnthropicMessageStream(responseOf('event: message_start\ndata: {not json\n\n'), OPTIONS))
      .rejects.toThrow('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
  });
});
