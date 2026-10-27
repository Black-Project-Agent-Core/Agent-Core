import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import {
  createProcessIdentityReader, describeProcess, judgeBuild, newestFileModifiedMs,
} from '../src/http/process-identity.js';

// The "is the running process the dist on disk?" answer. The decision is pure (judgeBuild); the scan
// and the HTTP shape are checked against a real temporary tree and a real handler.

const roots: string[] = [];
const servers: Server[] = [];
async function scratch() { const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-core-identity-')); roots.push(dir); return dir; }
async function touch(file: string, whenMs: number) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, 'x');
  await utimes(file, whenMs / 1000, whenMs / 1000);
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
  await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('judgeBuild', () => {
  const started = Date.parse('2026-10-25T10:00:00.000Z');
  it('is stale only when a file was written after the process started', () => {
    expect(judgeBuild(started, started + 1)).toMatchObject({ stale: true });
    expect(judgeBuild(started, started)).toMatchObject({ stale: false });
    expect(judgeBuild(started, started - 60_000)).toMatchObject({ stale: false, distNewestModifiedAt: '2026-10-25T09:59:00.000Z' });
  });
  it('treats an unreadable dist as unknown, not as fresh', () => {
    expect(judgeBuild(started, null)).toEqual({ stale: null, issue: 'DIST_NOT_FOUND' });
  });
});

describe('describeProcess', () => {
  const root = path.resolve(os.tmpdir(), 'identity-root');
  it('derives the start from uptime and reports the entry relative to the project root', () => {
    const identity = describeProcess(root, {
      now: Date.parse('2026-10-25T10:00:30.000Z'), uptimeSeconds: 30, pid: 4242, argv1: path.join(root, 'dist', 'index.js'),
    });
    expect(identity).toEqual({ pid: 4242, startedAt: '2026-10-25T10:00:00.000Z', uptimeSeconds: 30, entry: 'dist/index.js' });
  });
  it('never reports a path outside the project root', () => {
    expect(describeProcess(root, { argv1: path.resolve(root, '..', 'elsewhere', 'index.js') }).entry).toBeNull();
    expect(describeProcess(root, { argv1: undefined }).entry).toBeNull();
  });
});

describe('newestFileModifiedMs', () => {
  it('returns the newest mtime across nested directories', async () => {
    const dir = await scratch();
    await touch(path.join(dir, 'a.js'), 1_700_000_000_000);
    await touch(path.join(dir, 'deep', 'er', 'b.js'), 1_700_000_500_000);
    await touch(path.join(dir, 'deep', 'c.js'), 1_700_000_100_000);
    expect(await newestFileModifiedMs(dir)).toBe(1_700_000_500_000);
  });
  it('answers null for a missing directory and for one with no files', async () => {
    const dir = await scratch();
    expect(await newestFileModifiedMs(path.join(dir, 'missing'))).toBeNull();
    await mkdir(path.join(dir, 'empty', 'inner'), { recursive: true });
    expect(await newestFileModifiedMs(path.join(dir, 'empty'))).toBeNull();
  });
});

describe('/health process identity', () => {
  it('serves the identity and flips build.stale after dist is rewritten', async () => {
    const projectRoot = await scratch();
    const startedBefore = Date.now() - 60_000;
    await touch(path.join(projectRoot, 'dist', 'index.js'), startedBefore);
    const reader = createProcessIdentityReader(projectRoot, { cacheMs: 0 });
    const server = createServer(createHttpHandler({
      keyStore: new FileKeyStore(path.join(await scratch(), 'data')),
      mcpHandler: async () => { throw new Error('must not dispatch'); },
      healthProvider: async () => ({ ...(await reader()) }),
    }));
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/health`;

    const fresh = await (await fetch(url)).json() as any;
    expect(fresh).toMatchObject({ status: 'ok', process: { pid: process.pid }, build: { stale: false } });
    expect(typeof fresh.process.startedAt).toBe('string');
    expect(Date.parse(fresh.process.startedAt)).toBeLessThanOrEqual(Date.now());

    await touch(path.join(projectRoot, 'dist', 'later', 'x.js'), Date.now() + 60_000);
    const stale = await (await fetch(url)).json() as any;
    expect(stale.build.stale).toBe(true);
    expect(Date.parse(stale.build.distNewestModifiedAt)).toBeGreaterThan(Date.parse(stale.process.startedAt));
  });

  it('reports unknown, not fresh, when there is no dist to compare', async () => {
    const reader = createProcessIdentityReader(await scratch(), { cacheMs: 0 });
    expect((await reader()).build).toEqual({ stale: null, issue: 'DIST_NOT_FOUND' });
  });
});
