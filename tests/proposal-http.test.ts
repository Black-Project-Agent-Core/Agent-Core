import { afterEach, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHttpHandler } from '../src/http/app.js';

const servers: Server[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await new Promise<void>(resolve => server.close(() => resolve())); });
async function server() {
  const app = createHttpHandler({ keyStore: {} as any, mcpHandler: async () => {}, agentUiToken: 'test-ui-token',
    proposals: { list: async () => ({ items: [{ id: 'doc:one', revisionDigest: 'sha256:' + 'a'.repeat(64) }, { id: 'doc:done', revisionDigest: 'sha256:' + 'c'.repeat(64) }], guides: [], warnings: [] }),
      listForReview: async () => ({ items: [{ id: 'doc:one', revisionDigest: 'sha256:' + 'a'.repeat(64) }], guides: [], warnings: [] }),
      read: async (input: any) => { if (input.revisionDigest.endsWith('b'.repeat(64))) throw new Error('PROPOSAL_DOCUMENT_CHANGED'); return { text: '# Read only\n<script>literal</script>', ...input }; } } } as any);
  const value = createServer(app); servers.push(value);
  await new Promise<void>(resolve => value.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + (value.address() as any).port;
}
const auth = { 'x-agent-core-ui-token': 'test-ui-token' };
test('proposal GETs require the existing UI token and never accept mutation methods', async () => {
  const base = await server();
  expect((await fetch(base + '/agent/proposals')).status).toBe(401);
  expect((await fetch(base + '/agent/proposals', { headers: auth })).status).toBe(200);
  expect((await fetch(base + '/agent/proposals', { method: 'POST', headers: auth })).status).toBe(405);
});
test('dashboard list route returns only proposals that still wait for a decision', async () => {
  const base = await server();
  const body = await (await fetch(base + '/agent/proposals', { headers: auth })).json();
  expect(body.items.map((item: any) => item.id)).toEqual(['doc:one']);
});
test('exact read rejects arbitrary path fields and translates revision drift to conflict', async () => {
  const base = await server(); const query = new URLSearchParams({ id: 'doc:' + '1'.repeat(32), revisionDigest: 'sha256:' + 'a'.repeat(64), documentDigest: 'sha256:' + 'a'.repeat(64) });
  const read = await fetch(base + '/agent/proposals/read?' + query, { headers: auth });
  expect(read.status).toBe(200); expect((await read.json()).text).toContain('<script>literal</script>');
  expect(read.headers.get('cache-control')).toBe('no-store');
  expect((await fetch(base + '/agent/proposals/read?' + query + '&path=../private', { headers: auth })).status).toBe(400);
  query.set('revisionDigest', 'sha256:' + 'b'.repeat(64));
  expect((await fetch(base + '/agent/proposals/read?' + query, { headers: auth })).status).toBe(409);
});
