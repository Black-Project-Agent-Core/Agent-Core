import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { FileKeyStore } from '../src/auth/key-store.js';
import { OAuthService } from '../src/oauth/service.js';
const dirs: string[] = [], closers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closers.splice(0)) await close();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });
async function store() { const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-core-grants-')); dirs.push(dir); return new FileKeyStore(dir); }
const grant = (allowedTools: string[]) => ({ version: 1, allowedTools });
async function connected(key: any, runtime: any = {}) {
  const server = createAgentCoreMcpServer(key, runtime);
  const client = new Client({ name: 'isolated-grant-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
  closers.push(async () => { await client.close(); await server.close(); }); return { client, server };
}
it('preserves legacy full discovery, while explicit empty grants deny all tools', async () => {
  const legacy = await connected({ id: 'old' }); const denied = await connected({ id: 'none', toolGrant: grant([]) });
  expect((await legacy.client.listTools()).tools.length).toBe(29);
  expect((await denied.client.listTools()).tools).toEqual([]);
  await expect(denied.client.callTool({ name: 'browser_control', arguments: { action: 'status' } })).rejects.toThrow(/disabled|GRANT_DENIED/);
});
it('restricts actual SDK discovery and dispatch before mutation admission', async () => {
  const safety = { runMutation: vi.fn(async (_id, _tool, _args, _ctx, execute) => execute()) };
  const { client } = await connected({ id: 'browser-only', toolGrant: grant(['browser_control']) }, { mutationSafety: safety });
  expect((await client.listTools()).tools.map(x => x.name)).toEqual(['browser_control']);
  await expect(client.callTool({ name: 'write_file', arguments: { path: 'never-written', content: 'no' },
    _meta: { toolGrant: grant(['write_file']) } } as any)).rejects.toThrow(/disabled|GRANT_DENIED/);
  expect(safety.runMutation).not.toHaveBeenCalled();
  const result: any = await client.callTool({ name: 'browser_control', arguments: { action: 'status', origin: 'ui' } });
  expect(result.isError).not.toBe(true); expect(safety.runMutation).toHaveBeenCalledOnce();
});
it('the same restriction covers all sibling tool families', async () => {
  const marker = vi.fn(); const runtime: any = { memoryService: { status: marker }, learningService: {},
    skillsService: {}, semanticIde: {}, phoneController: {}, codeIntelligence: {},
    webResearch: { search: marker, open: marker } };
  const { client } = await connected({ id: 'restricted', toolGrant: grant(['browser_control']) }, runtime);
  const list = await client.listTools(); expect(list.tools.map(x => x.name)).toEqual(['browser_control']);
  for (const name of ['memory_status', 'learning', 'skills', 'code_symbol', 'code_workspace', 'phone_status', 'web_search', 'web_open'])
    await expect(client.callTool({ name, arguments: {} })).rejects.toThrow();
  expect(marker).not.toHaveBeenCalled();
});
it('snapshots trusted grants and never treats unknown names as broad access', async () => {
  const key: any = { id: 'snapshot', toolGrant: grant(['browser_control', 'missing_tool']) };
  const { client } = await connected(key); key.toolGrant.allowedTools.push('write_file');
  expect((await client.listTools()).tools.map(x => x.name)).toEqual(['browser_control']);
  await expect(client.callTool({ name: 'write_file', arguments: {} })).rejects.toThrow();
});
it.each([null, { version: 2, allowedTools: [] }, { version: 1, allowedTools: ['*'] },
  { version: 1, allowedTools: ['code_*'] }, { version: 1, allowedTools: ['browser_control', 'browser_control'] },
  { version: 1, allowedTools: ['a'.repeat(65)] }, { version: 1, allowedTools: [], extra: true }])
('malformed supplied metadata fails closed: %j', value => {
  expect(() => createAgentCoreMcpServer({ id: 'bad', toolGrant: value })).toThrow();
});
it('preserves scope across storage, usage, import and rotation with no live key fixture', async () => {
  const keys = await store();
  const created = await keys.create('scoped', { toolGrant: grant(['browser_control']), availableTools: ['browser_control'] } as any);
  expect((created.metadata as any).toolGrant).toEqual(grant(['browser_control']));
  expect((await keys.verify(created.key) as any).toolGrant).toEqual(grant(['browser_control']));
  expect((await keys.importSecret('same secret', created.key) as any).toolGrant).toEqual(grant(['browser_control']));
  const next = await keys.rotate(created.metadata.id);
  expect((next.metadata as any).toolGrant).toEqual(grant(['browser_control'])); expect(await keys.verify(created.key)).toBeNull();
  expect((await keys.list()).every((m: any) => m.toolGrant.allowedTools[0] === 'browser_control')).toBe(true);
  await keys.revoke(next.metadata.id); expect(await keys.verify(next.key)).toBeNull();
});
it('requires an issuance catalogue and rejects unknown names without creating a key', async () => {
  const keys = await store();
  await expect(keys.create('missing catalogue', { toolGrant: grant(['browser_control']) } as any)).rejects.toThrow();
  await expect(keys.create('unknown', { toolGrant: grant(['missing_tool']), availableTools: ['browser_control'] } as any)).rejects.toThrow();
  expect(await keys.list()).toEqual([]);
  const denied = await keys.create('none', { toolGrant: grant([]) } as any);
  expect((denied.metadata as any).toolGrant).toEqual(grant([]));
});
it('does not widen a revoked scoped secret by importing it again', async () => {
  const keys = await store(); const key = await keys.create('none', { toolGrant: grant([]) } as any);
  await keys.revoke(key.metadata.id);
  await expect(keys.importSecret('resurrection', key.key)).rejects.toThrow();
  expect(await keys.verify(key.key)).toBeNull(); expect(await keys.list()).toHaveLength(1);
});
it('expiry and malformed stored scope remain authentication refusals', async () => {
  const keys = await store(); const key = await keys.create('expired', { expiresAt: new Date(0), toolGrant: grant([]) } as any);
  expect(await keys.verify(key.key)).toBeNull();
  const good = await keys.create('corrupt-test'); const data = JSON.parse(await readFile(keys.filePath, 'utf8'));
  data.keys.find((k: any) => k.id === good.metadata.id).toolGrant = { version: 1, allowedTools: '*' };
  await writeFile(keys.filePath, JSON.stringify(data), { mode: 0o600 });
  await expect(keys.verify(good.key)).rejects.toThrow();
});
it('OAuth inherits the current backing-key grant, revocation and expiry', async () => {
  const keys = await store(), created = await keys.create('oauth-fixture', { toolGrant: grant([]) } as any);
  const oauth = new OAuthService(keys, { verifyAccessToken: vi.fn(async () => ({ keyId: created.metadata.id,
    scopes: ['mcp:tools'], resource: 'http://fixture/mcp' })) } as any,
    { protectedResource: () => 'http://fixture/mcp' } as any);
  const value: any = await oauth.authenticateAccessToken('agent_core_oauth_fixture', {} as any);
  expect(value?.toolGrant).toEqual(grant([])); expect(value.authentication).toBe('oauth2');
  await keys.revoke(created.metadata.id);
  expect(await oauth.authenticateAccessToken('agent_core_oauth_fixture', {} as any)).toBeNull();
});
