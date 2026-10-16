import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareWorkersAIEmbedder, type MemoryEmbedder } from '../../src/memory/embedder.js';

function embedder(): MemoryEmbedder {
  return new CloudflareWorkersAIEmbedder({
    accountId: 'test-account', apiToken: 'test-token', model: 'test-model', dimensions: 2,
  });
}

function response(count = 1): Response {
  return Response.json({ data: Array.from({ length: count }, (_, index) => ({ index, embedding: [3, 4] })) });
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('host Memory embedder cancellation', () => {
  it('preserves normalized embeddings and empty input for callers without options', async () => {
    const send = vi.fn(async (_input: unknown, _init?: RequestInit) => response(2));
    vi.stubGlobal('fetch', send);
    const host = embedder();
    expect(await host.embedDocuments([])).toEqual([]);
    expect(send).not.toHaveBeenCalled();
    expect(await host.embedDocuments(['first', 'second'])).toEqual([[0.6, 0.8], [0.6, 0.8]]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][1]!.body as string)).toEqual({ model: 'test-model', input: ['first', 'second'] });
  });

  it('does not send an already cancelled embedding request', async () => {
    const send = vi.fn(async () => response());
    vi.stubGlobal('fetch', send);
    const abort = new AbortController();
    const reason = new Error('cancelled before send');
    abort.abort(reason);
    await expect(embedder().embedDocuments(['query'], { signal: abort.signal })).rejects.toBe(reason);
    expect(send).not.toHaveBeenCalled();
  });

  it('aborts the in-flight fetch without retrying it', async () => {
    let requestSignal: AbortSignal | null | undefined;
    let finish!: (value: Response) => void;
    const send = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      requestSignal = init?.signal;
      finish = resolve;
      requestSignal?.addEventListener('abort', () => reject(requestSignal!.reason), { once: true });
    }));
    vi.stubGlobal('fetch', send);
    const abort = new AbortController();
    const reason = new Error('cancelled during send');
    const pending = embedder().embedDocuments(['query'], { signal: abort.signal }).catch(error => error);
    abort.abort(reason);
    finish(response());
    expect(await pending).toBe(reason);
    expect(requestSignal?.aborted).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps cancellation attached while consuming the response body', async () => {
    let requestSignal: AbortSignal | null | undefined;
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const send = vi.fn(async (_input: unknown, init?: RequestInit) => {
      requestSignal = init?.signal;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller;
          requestSignal?.addEventListener('abort', () => controller.error(requestSignal!.reason), { once: true });
        },
      }));
    });
    vi.stubGlobal('fetch', send);
    const abort = new AbortController();
    const reason = new Error('cancelled during body');
    const pending = embedder().embedDocuments(['query'], { signal: abort.signal }).catch(error => error);
    await Promise.resolve();
    await Promise.resolve();
    abort.abort(reason);
    if (!requestSignal?.aborted) {
      stream.enqueue(new TextEncoder().encode('{"data":[{"embedding":[3,4]}]}'));
      stream.close();
    }
    expect(await pending).toBe(reason);
    expect(requestSignal?.aborted).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('cancels retry backoff without sending another attempt', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => new Response('', { status: 503, headers: { 'retry-after': '2' } }));
    vi.stubGlobal('fetch', send);
    const abort = new AbortController();
    const reason = new Error('cancelled during backoff');
    const pending = embedder().embedDocuments(['query'], { signal: abort.signal }).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    abort.abort(reason);
    await vi.runAllTimersAsync();
    expect(await pending).toBe(reason);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not return vectors or send a following batch after cancellation', async () => {
    const abort = new AbortController();
    const reason = new Error('cancelled after response');
    const send = vi.fn(async () => {
      abort.abort(reason);
      return response(32);
    });
    vi.stubGlobal('fetch', send);
    await expect(embedder().embedDocuments(Array(33).fill('query'), { signal: abort.signal })).rejects.toBe(reason);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
