import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { NativeSkillSettings } from '../src/native-skill-settings.js';

const roots: string[] = [];
const servers: Server[] = [];
const TOKEN = 'fixture-ui-token';
const headers = { 'x-agent-core-ui-token': TOKEN };

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

/** The Skill panel routes need neither a chat service nor a model: only the catalog and the Native switches. */
async function setup(options: { withSkills?: boolean } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-skills-http-'));
  roots.push(root);
  const settings = new NativeSkillSettings(path.join(root, 'data'));
  const catalog = [
    { name: 'beta', description: 'Beta skill', digest: 'sha256:' + 'b'.repeat(64) },
    { name: 'alpha', description: 'Alpha skill', digest: 'sha256:' + 'a'.repeat(64) },
  ];
  const server = createServer(createHttpHandler({
    keyStore: new FileKeyStore(path.join(root, 'auth')),
    security: new HttpSecurityPolicy({ publicBaseUrl: null, protectedResourceUrl: null, trustProxy: true, allowedOrigins: [] }),
    agentUiToken: TOKEN,
    skills: options.withSkills === false ? undefined : ({ list: async () => catalog } as any),
    nativeSkillSettings: settings,
    mcpHandler: async (_request, response) => { response.writeHead(200); response.end('{}'); },
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, settings };
}

const post = (url: string, body: unknown, extra: Record<string, string> = {}) => fetch(url, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('Skill panel HTTP routes', () => {
  it('lists the active catalog sorted by name with an 8-character digest and the Native switch', async () => {
    const { baseUrl, settings } = await setup();
    settings.setEnabled('beta', false);
    const response = await fetch(`${baseUrl}/agent/skills`, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ skills: [
      { name: 'alpha', description: 'Alpha skill', digest: 'aaaaaaaa', enabled: true },
      { name: 'beta', description: 'Beta skill', digest: 'bbbbbbbb', enabled: false },
    ] });
  });

  it('switches a Skill off and on for Native and rejects bad requests', async () => {
    const { baseUrl, settings } = await setup();
    const off = await post(`${baseUrl}/agent/skills/alpha/native-enabled`, { enabled: false });
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ name: 'alpha', enabled: false });
    expect(settings.isDisabled('alpha')).toBe(true);
    const on = await post(`${baseUrl}/agent/skills/alpha/native-enabled`, { enabled: true });
    expect(on.status).toBe(200);
    expect(settings.isDisabled('alpha')).toBe(false);
    expect((await post(`${baseUrl}/agent/skills/missing/native-enabled`, { enabled: false })).status).toBe(404);
    expect((await post(`${baseUrl}/agent/skills/alpha/native-enabled`, { enabled: 'no' })).status).toBe(400);
    expect((await post(`${baseUrl}/agent/skills/alpha/native-enabled`, '{not json')).status).toBe(400);
    const wrongMethod = await fetch(`${baseUrl}/agent/skills/alpha/native-enabled`, { headers });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('POST');
    const listWrongMethod = await post(`${baseUrl}/agent/skills`, {});
    expect(listWrongMethod.status).toBe(405);
    expect(listWrongMethod.headers.get('allow')).toBe('GET');
  });

  it('requires the launcher token and refuses to run without the Skill services', async () => {
    const { baseUrl } = await setup();
    expect((await fetch(`${baseUrl}/agent/skills`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/agent/skills`, { headers: { 'x-agent-core-ui-token': 'wrong' } })).status).toBe(401);
    expect((await fetch(`${baseUrl}/agent/skills/alpha/native-enabled`, { method: 'POST' })).status).toBe(401);
    const missing = await setup({ withSkills: false });
    const unavailable = await fetch(`${missing.baseUrl}/agent/skills`, { headers });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: 'agent_skills_unavailable' });
  });
});
