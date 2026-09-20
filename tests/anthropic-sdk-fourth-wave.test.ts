import { lstat, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodePatternLearningSink } from '../src/learning/code-pattern-sink.js';
import { collectBoundedGraphTouches } from '../src/mcp/code-intelligence-tools.js';
import { parseCallToolResultJson } from '../src/mcp/call-tool-result.js';
import { parseJsonRpcHttpResponse } from '../src/mcp/streamable-http.js';
import { readResponseTextBounded } from '../src/net/bounded-response.js';
import { fetchWithPolicy, type OutboundAttemptEvent } from '../src/net/outbound-request.js';
import { GatewayTransport } from '../src/phone/gateway.js';
import { writeOwnedFileAtomic } from '../src/persistence/atomic-file.js';
import { readRegularFileBounded } from '../src/rdc/utils/files/safe-regular-file.js';
import { assertSameFileIdentity } from '../src/security/file-identity.js';
import { readSensitiveTextFile } from '../src/security/sensitive-file.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-anthropic4-'));
  roots.push(root);
  return root;
}

describe('Anthropic fourth-wave MCP convergence', () => {
  it('keeps text JSON precedence and accepts structured-only results', () => {
    expect(parseCallToolResultJson({
      content: [{ type: 'text', text: '{"source":"text"}' }],
      structuredContent: { source: 'structured' },
    })).toEqual({ source: 'text' });
    expect(parseCallToolResultJson({
      content: [],
      structuredContent: { source: 'structured' },
    })).toEqual({ source: 'structured' });
  });

  it('collects graph touches from structured-only provider results', () => {
    const touches = collectBoundedGraphTouches({
      content: [],
      structuredContent: { items: [{ id: 'repo::structured', edge_id: 'edge-1' }] },
    } as any, {});
    expect(touches.entityIds).toContain('repo::structured');
    expect(touches.edgeIds).toContain('edge-1');
  });

  it('lets the Learning Grafel sink consume structured-only payloads', async () => {
    const code: any = {
      enabled: true,
      capabilities: () => ({ patterns: true }),
      health: async () => ({ status: 'available', index: 'current' }),
      callProviderTool: async () => ({
        content: [],
        structuredContent: {
          patterns: [{
            id: 'p1',
            trigger: { natural_language: 'Use exact source' },
            steps: ['Inspect source'],
          }],
        },
      }),
    };
    const sink = new CodePatternLearningSink(code);
    const duplicate = await sink.findDuplicates({
      kind: 'code-pattern',
      content: 'Use exact source',
      title: 'Use exact source',
      reuseCondition: 'Use exact source',
      evidenceRefs: [],
      verified: true,
      workspace: 'agent-core',
      steps: ['Inspect source'],
      exemplars: ['agent-core::x'],
    } as any);
    expect(duplicate).toEqual([{ id: 'p1', reason: 'equivalent Grafel pattern already exists' }]);
  });

  it('lets Phone status consume structuredContent without changing image handling', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1,
      result: { content: [], structuredContent: { online: true } },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const transport = new GatewayTransport(
      { url: 'https://example.invalid/mcp', token: undefined } as any,
      'device-1',
      { width: 1080, height: 2400 } as any,
    );
    expect(await transport.status()).toMatchObject({ available: true, online: true });
  });
});

describe('Phone Streamable-HTTP framing', () => {
  it('parses plain JSON unchanged', () => {
    expect(parseJsonRpcHttpResponse(
      '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}',
      'application/json',
    )).toMatchObject({ result: { ok: true } });
  });

  it('parses multi-line SSE data and selects a complete RPC response', () => {
    const body = [
      'event: progress',
      'data: {"jsonrpc":"2.0","method":"progress"}',
      '',
      'event: message',
      'data: {"jsonrpc":"2.0",',
      'data: "id":1,',
      'data: "result":{"ok":true}}',
      '',
      '',
    ].join('\n');
    expect(parseJsonRpcHttpResponse(body, 'text/event-stream'))
      .toMatchObject({ id: 1, result: { ok: true } });
  });

  it.each(['\n', '\r\n', '\r'])('supports SSE delimiter %j', (newline) => {
    const body = 'data: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}' + newline + newline;
    expect(parseJsonRpcHttpResponse(body, 'text/event-stream'))
      .toMatchObject({ result: { ok: true } });
  });

  it('rejects an incomplete trailing SSE frame', () => {
    expect(() => parseJsonRpcHttpResponse(
      'data: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}',
      'text/event-stream',
    )).toThrow(/NOT_FOUND_OR_INCOMPLETE/);
  });
});
describe('outbound cancellation and body lifecycle', () => {
  it('treats caller abort as terminal instead of retryable network failure', async () => {
    const controller = new AbortController();
    const events: OutboundAttemptEvent[] = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject((init.signal as AbortSignal).reason), { once: true });
        setTimeout(() => controller.abort(new Error('caller cancelled')), 10);
      });
    });

    await expect(fetchWithPolicy('https://example.invalid/x', { signal: controller.signal }, {
      safety: 'safe', maxAttempts: 3, onAttempt: event => events.push(event),
    })).rejects.toThrow('caller cancelled');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.retry).toBe(false);
  });

  it('aborts during retry backoff without issuing a second fetch or duplicate hook', async () => {
    const controller = new AbortController();
    const events: OutboundAttemptEvent[] = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('retry', { status: 503, headers: { 'retry-after-ms': '10000' } }),
    );
    setTimeout(() => controller.abort(new Error('stop backoff')), 20);
    await expect(fetchWithPolicy('https://example.invalid/x', { signal: controller.signal }, {
      safety: 'safe', maxAttempts: 3, onAttempt: event => events.push(event),
    })).rejects.toThrow('stop backoff');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ attempt: 1, outcome: 'response', retry: true });
  });
  it('cancels discarded retry response bodies before the next attempt', async () => {
    let cancelled = false;
    const retryBody = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('retry')); },
      cancel() { cancelled = true; },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(retryBody, { status: 503, headers: { 'retry-after-ms': '0' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const response = await fetchWithPolicy('https://example.invalid/x', {}, { safety: 'safe', maxAttempts: 2 });
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(cancelled).toBe(true);
  });

  it('cancels a bounded reader when the byte limit fails', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('too-large')); },
      cancel() { cancelled = true; },
    });
    await expect(readResponseTextBounded(new Response(body), 4, 'bounded-test'))
      .rejects.toThrow(/exceeded 4 bytes/);
    expect(cancelled).toBe(true);
  });
});

describe('race-bound file I/O', () => {
  it('reads sensitive content from the identity-validated handle', async () => {
    const root = await fixture();
    const file = path.join(root, 'secret.json');
    await writeFile(file, '{"ok":true}', 'utf8');
    expect(await readSensitiveTextFile(file)).toBe('{"ok":true}');
  });
  it('detects mismatched file identities', async () => {
    const root = await fixture();
    const a = path.join(root, 'a.txt');
    const b = path.join(root, 'b.txt');
    await writeFile(a, 'a', 'utf8');
    await writeFile(b, 'b', 'utf8');
    const aStats = await lstat(a, { bigint: true });
    const bStats = await lstat(b, { bigint: true });
    expect(() => assertSameFileIdentity(aStats, bStats, 'fixture'))
      .toThrow(/REGULAR_FILE_IDENTITY_CHANGED/);
  });

  it('refuses Windows junction/reparse leaves for no-follow and sensitive reads', async () => {
    const root = await fixture();
    const target = path.join(root, 'target-dir');
    const link = path.join(root, 'link-dir');
    await import('node:fs/promises').then(fs => fs.mkdir(target));
    await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(readRegularFileBounded(link, 64, { followSymlinks: false }))
      .rejects.toThrow(/SAFE_REGULAR_FILE_REFUSED/);
    await expect(readSensitiveTextFile(link)).rejects.toThrow(/SENSITIVE_FILE_SYMLINK_REFUSED/);
  });

  it('owned atomic persistence refuses replacing a reparse destination', async () => {
    const root = await fixture();
    const target = path.join(root, 'target-dir');
    const link = path.join(root, 'config.json');
    await import('node:fs/promises').then(fs => fs.mkdir(target));
    await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(writeOwnedFileAtomic(link, '{"new":true}'))
      .rejects.toThrow(/ATOMIC_OWNED_FILE_SYMLINK_REFUSED/);
  });
});
