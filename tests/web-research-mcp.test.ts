import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerWebResearchTools } from '../src/mcp/web-research-tools.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';

const events: any[] = [];
const closers: Array<() => Promise<void>> = [];
beforeEach(() => {
  events.length = 0;
  vi.spyOn(activityTracker, 'record').mockImplementation((module, level, message, kind, context) => {
    events.push({ module, level, message, kind, context });
    return undefined as any;
  });
  vi.spyOn(activityTracker, 'captureFailure').mockImplementation((module, error, kind, context) => {
    events.push({ module, error: String(error), kind, context });
    return undefined as any;
  });
});
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  vi.restoreAllMocks();
});

const response = {
  provider: 'native', url: 'https://example.com/article', content: '# Article\nBody',
  truncated: false, returnedChars: 14,
  provenance: { kind: 'native-public', untrusted: true, contentSha256: 'a'.repeat(64) },
};
function fixture(options: Record<string, unknown> = {}) {
  const service = { open: vi.fn().mockResolvedValue(response), search: vi.fn().mockResolvedValue({ results: [] }) };
  const server = new McpServer({ name: 'web-test', version: '1.0.0' });
  registerWebResearchTools(server, service as any, options);
  return { service, registered: (server as any)._registeredTools };
}
const context = (signal = new AbortController().signal) => ({ mcpReq: { signal } });

describe('web MCP controller wiring', () => {
  it('describes both read-only tools without exposing an argument signal', () => {
    const { registered } = fixture();
    for (const name of ['web_search', 'web_open']) {
      expect(registered[name].annotations?.readOnlyHint).toBe(true);
      expect(registered[name].description?.length).toBeGreaterThan(50);
      expect(registered[name].inputSchema?.shape?.signal).toBeUndefined();
    }
  });

  it.each(['web_open', 'web_search'])('forwards the SDK mcpReq.signal and records metadata once for %s', async name => {
    const recordToolOutcome = vi.fn().mockResolvedValue(undefined);
    const { registered, service } = fixture({ externalLearning: { recordToolOutcome }, controllerSessionId: 'host-session' });
    const signal = new AbortController().signal;
    const args = name === 'web_open' ? { url: 'https://example.com/?token=PRIVATE' } : { query: 'PRIVATE query' };
    const result = await registered[name].executor(args, context(signal));
    expect(result.isError).not.toBe(true);
    expect(service[name === 'web_open' ? 'open' : 'search']).toHaveBeenCalledWith({ ...args, signal });
    const boundaries = events.filter(event => ['tool-invocation-start', 'tool-call'].includes(event.kind));
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0].context.readOnlyHint).toBe(true);
    expect(boundaries[1].context).toMatchObject({ outcome: 'success', argumentKeys: Object.keys(args), invocationId: boundaries[0].context.invocationId });
    expect(recordToolOutcome).toHaveBeenCalledTimes(1);
    expect(recordToolOutcome).toHaveBeenCalledWith({ sessionId: 'host-session', tool: name, argumentKeys: Object.keys(args), outcome: 'success', readOnly: true, invocationId: boundaries[0].context.invocationId });
    expect(JSON.stringify([events, recordToolOutcome.mock.calls])).not.toMatch(/PRIVATE|https:\/\//);
    if (name === 'web_open') expect(JSON.parse(result.content[0].text)).toEqual(response);
  });

  it.each([
    ['PUBLIC_URL_ADDRESS', 'PUBLIC_URL_ADDRESS'],
    ['WEB_RESEARCH_OPEN_FAILED_ALL:provider https://example.com/?token=PRIVATE raw body', 'WEB_RESEARCH_OPEN_FAILED_ALL'],
    ['PUBLIC_URL_PRIVATE_SECRET', 'WEB_RESEARCH_FAILED'],
    ['PRIVATE raw body\n    at hidden stack', 'WEB_RESEARCH_FAILED'],
  ])('bounds handled errors without persisting raw exceptions (%s)', async (message, code) => {
    const recordToolOutcome = vi.fn().mockRejectedValue(new Error('PRIVATE observer failure'));
    const { registered, service } = fixture({ externalLearning: { recordToolOutcome }, controllerSessionId: 'host-session' });
    service.open.mockRejectedValue(new Error(message));
    const result = await registered.web_open.executor({ url: 'https://example.com/?token=PRIVATE' }, context());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(code);
    expect(result.content[0].text.length).toBeLessThan(500);
    expect(JSON.stringify([result, events, recordToolOutcome.mock.calls])).not.toMatch(/PRIVATE|hidden stack|https:\/\//);
    expect(events.filter(event => event.kind === 'tool-invocation-start')).toHaveLength(1);
    expect(events.filter(event => event.kind === 'handled-tool-failure')).toHaveLength(1);
    expect(recordToolOutcome).toHaveBeenCalledTimes(1);
    expect(recordToolOutcome.mock.calls[0][0].outcome).toBe('handled-failure');
  });

  it('reports validation failures without recording unknown argument keys or fabricating a host session', async () => {
    const recordToolOutcome = vi.fn();
    const { registered, service } = fixture({ externalLearning: { recordToolOutcome } });
    const result = await registered.web_open.executor({ url: 42, PRIVATE: 'secret' }, context());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('WEB_RESEARCH_ARGUMENTS_INVALID');
    expect(service.open).not.toHaveBeenCalled();
    expect(recordToolOutcome).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });

  it('keeps successful output when outcome observation fails', async () => {
    const recordToolOutcome = vi.fn().mockRejectedValue(new Error('PRIVATE observer exception'));
    const { registered } = fixture({ externalLearning: { recordToolOutcome }, controllerSessionId: 'host-session' });
    const result = await registered.web_open.executor({ url: 'https://example.com/' }, context());
    expect(JSON.parse(result.content[0].text)).toEqual(response);
    expect(events.filter(event => event.kind === 'tool-call')).toHaveLength(1);
    expect(events.filter(event => event.kind === 'handled-tool-failure')).toHaveLength(0);
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });

  it('passes cancellation through the SDK callback without leaking its reason', async () => {
    const { registered, service } = fixture();
    const controller = new AbortController();
    service.open.mockImplementation(({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const pending = registered.web_open.executor({ url: 'https://example.com/' }, context(controller.signal));
    controller.abort(new Error('PRIVATE abort reason'));
    const result = await pending;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('WEB_RESEARCH_ABORTED');
    expect(JSON.stringify([result, events])).not.toContain('PRIVATE');
  });

  it('forwards the existing service and host Learning session through HTTP while retaining credential grants', async () => {
    const service = { open: vi.fn().mockResolvedValue(response), search: vi.fn() };
    const external = { bootstrapInstructions: vi.fn().mockResolvedValue(undefined), recordToolOutcome: vi.fn().mockResolvedValue(undefined) };
    const handler = createMcpHttpHandler({ webResearch: service as any, externalControllerLearning: external as any });
    const key = { id: 'owner', toolGrant: { version: 1, allowedTools: ['web_open'] } };
    const http = createServer((request, result) => void handler(request, result, key as any));
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
    closers.push(async () => { http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())); });
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('Test listener missing');
    const rpc = async (method: string, params: object) => {
      const result = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json,text/event-stream', 'x-agent-core-session-id': 'host' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      return result.json();
    };
    const listed = await rpc('tools/list', {});
    expect(listed.result.tools.map((tool: any) => tool.name)).toEqual(['web_open']);
    const opened = await rpc('tools/call', { name: 'web_open', arguments: { url: 'https://example.com/' } });
    expect(opened.result.isError).not.toBe(true);
    expect(JSON.parse(opened.result.content[0].text)).toEqual(response);
    expect(service.open.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(external.recordToolOutcome).toHaveBeenCalledTimes(1);
    expect(external.recordToolOutcome.mock.calls[0][0].sessionId).toBe(external.bootstrapInstructions.mock.calls[0][0]);
    const denied = await rpc('tools/call', { name: 'web_search', arguments: { query: 'blocked' } });
    expect(denied.error ?? denied.result?.isError).toBeTruthy();
    expect(service.search).not.toHaveBeenCalled();
  });
});
