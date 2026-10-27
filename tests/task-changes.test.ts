import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHttpHandler } from '../src/http/app.js';
import { FileCheckpointService } from '../src/rdc/checkpoints/service.js';
import { computeTaskChanges } from '../src/rdc/checkpoints/task-changes.js';

// createAutomatic imports the filesystem tools lazily and has a 2 s capture budget; load them first.
beforeAll(async () => { await import('../src/rdc/tools/filesystem.js'); }, 120_000);

const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>(resolve => server.close(() => resolve()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
async function fixture(options: { repo?: boolean } = {}) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'agent-core-task-changes-')));
  roots.push(root);
  await writeFile(path.join(root, '.gitignore'), 'runtime/\n');
  await mkdir(path.join(root, 'runtime')); // the capture owner expects the runtime parent to exist
  if (options.repo !== false) {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'test@example.invalid');
    git(root, 'config', 'user.name', 'Test');
    git(root, 'config', 'core.autocrlf', 'false');
  }
  const service = new FileCheckpointService(root, path.join(root, 'runtime', 'checkpoints'));
  const capture = async (taskId: string | undefined, invocationId: string, ...files: string[]) => {
    const receipt = await service.createAutomatic(files.map(file => path.join(root, file)), {
      invocationId, ...(taskId ? { taskId } : {}), checkpointGranted: true, reportAutoCheckpoint: () => undefined,
    });
    expect(receipt, JSON.stringify(receipt)).toMatchObject({ status: 'captured' });
  };
  const write = (file: string, content: string | Buffer) => writeFile(path.join(root, file), content);
  const commit = () => { git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'base'); };
  return { root, service, capture, write, commit };
}
const find = <T extends { path: string }>(items: T[], file: string) => items.find(item => item.path === file);

describe('task changes (read-only actual changes)', { timeout: 60_000 }, () => {
  it('separates applied checkpoint diffs from pre-existing dirty and shell-made files', async () => {
    const { root, service, capture, write, commit } = await fixture();
    await write('a.txt', 'one\ntwo\n'); await write('dirty.txt', 'clean\n'); commit();
    await write('dirty.txt', 'dirty before the task\n'); // pre-existing dirty tree
    await capture('task-1', 'inv-1', 'a.txt');
    await write('a.txt', 'one\nTWO\n');
    await write('shell-made.txt', 'created outside any checkpoint\n');

    const result = await computeTaskChanges(service, 'task-1');
    const applied = find(result.applied.items, 'a.txt')!;
    expect(applied).toMatchObject({ state: 'modified', attribution: 'checkpoint-baseline', invocationIds: ['inv-1'], otherCheckpointTasks: [] });
    expect(applied.diff).toMatchObject({ state: 'text', additions: 1, deletions: 1 });
    expect(applied.diff.text).toContain('-two');
    expect(applied.diff.text).toContain('+TWO');
    expect(applied.diff.text).not.toMatch(/^diff --git|^index |^--- |^\+\+\+ /m);
    expect(find(result.external.items, 'a.txt')).toBeUndefined();
    expect(find(result.external.items, 'dirty.txt')).toMatchObject({ state: 'modified', attribution: 'unattributed', modifiedAfterTaskStart: false });
    expect(find(result.external.items, 'shell-made.txt')).toMatchObject({ state: 'untracked', attribution: 'unattributed', modifiedAfterTaskStart: true });
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({ invocationId: 'inv-1', paths: [{ path: 'a.txt', afterwards: 'differs' }] });
  });

  it('does not show a failed or no-op request as applied', async () => {
    const { service, capture, write, commit } = await fixture();
    await write('b.txt', 'unchanged\n'); commit();
    await capture('task-2', 'inv-failed', 'b.txt'); // the mutation then failed: nothing was written
    const result = await computeTaskChanges(service, 'task-2');
    expect(result.applied).toMatchObject({ items: [], unchanged: 1 });
    expect(result.requests[0].paths).toEqual([{ path: 'b.txt', afterwards: 'same' }]);
  });

  it('reports added, deleted and exact-content renamed files', async () => {
    const { root, service, capture, write, commit } = await fixture();
    await write('old-name.txt', 'moved bytes\n'); await write('gone.txt', 'will be deleted\n'); commit();
    await capture('task-3', 'inv-3', 'old-name.txt', 'new-name.txt', 'gone.txt', 'fresh.txt');
    await rename(path.join(root, 'old-name.txt'), path.join(root, 'new-name.txt'));
    await rm(path.join(root, 'gone.txt'));
    await write('fresh.txt', 'brand new\n');
    const { applied } = await computeTaskChanges(service, 'task-3');
    expect(find(applied.items, 'new-name.txt')).toMatchObject({ state: 'renamed', oldPath: 'old-name.txt', diff: { state: 'none' } });
    expect(find(applied.items, 'old-name.txt')).toBeUndefined();
    expect(find(applied.items, 'gone.txt')).toMatchObject({ state: 'deleted', diff: { state: 'text', deletions: 1, additions: 0 } });
    expect(find(applied.items, 'fresh.txt')).toMatchObject({ state: 'added', diff: { state: 'text', additions: 1, deletions: 0 } });
  });

  it('gives binary, oversized and secret-looking content explicit non-text states', async () => {
    const { service, capture, write, commit } = await fixture();
    await write('image.bin', Buffer.from([0, 1, 2, 3])); await write('big.txt', 'x\n'); await write('conf.txt', 'name = value\n'); commit();
    await capture('task-4', 'inv-4', 'image.bin', 'big.txt', 'conf.txt');
    await write('image.bin', Buffer.from([0, 9, 9, 9]));
    await write('big.txt', 'line\n'.repeat(120_000)); // > 512 KiB
    await write('conf.txt', 'password = "hunter2-not-a-real-secret"\n');
    const { applied } = await computeTaskChanges(service, 'task-4');
    expect(find(applied.items, 'image.bin')!.diff).toEqual({ state: 'binary' });
    expect(find(applied.items, 'big.txt')!.diff).toEqual({ state: 'too-large' });
    const secret = find(applied.items, 'conf.txt')!;
    expect(secret.diff).toEqual({ state: 'sensitive-not-shown' });
    expect(JSON.stringify(applied)).not.toContain('hunter2');
  });

  it('truncates long diffs and flags files another task checkpointed later', async () => {
    const { service, capture, write, commit } = await fixture();
    await write('long.txt', 'start\n'); commit();
    await capture('task-5', 'inv-5', 'long.txt');
    await write('long.txt', Array.from({ length: 2000 }, (_, index) => `line ${index}`).join('\n') + '\n');
    await capture('task-other', 'inv-other', 'long.txt');
    const item = find((await computeTaskChanges(service, 'task-5')).applied.items, 'long.txt')!;
    expect(item.diff.state).toBe('truncated');
    expect(item.diff.additions).toBeNull();
    expect(item.diff.text!.split('\n').length).toBeLessThanOrEqual(600);
    expect(item.otherCheckpointTasks).toEqual(['task-other']);
  });

  it('keeps working without Git and without any checkpoint store', async () => {
    const { service, root } = await fixture({ repo: false });
    const result = await computeTaskChanges(service, 'task-none');
    expect(result.checkpointCount).toBe(0);
    expect(result.applied).toMatchObject({ items: [], unchanged: 0, truncated: false });
    expect(result.external).toMatchObject({ state: 'unavailable', items: [] });
    await expect(stat(path.join(root, 'runtime', 'checkpoints', 'state.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('is read-only: files, Git index and checkpoint state are byte-identical afterwards', async () => {
    const { root, service, capture, write, commit } = await fixture();
    await write('r.txt', 'before\n'); commit();
    await capture('task-ro', 'inv-ro', 'r.txt');
    await write('r.txt', 'after\n'); await write('loose.txt', 'loose\n');
    const fingerprint = async () => {
      const hash = createHash('sha256');
      const walk = async (dir: string): Promise<void> => {
        for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(full); else hash.update(full).update(await readFile(full));
        }
      };
      await walk(root);
      return hash.digest('hex') + git(root, 'status', '--porcelain=v1', '--untracked-files=all');
    };
    const before = await fingerprint();
    await computeTaskChanges(service, 'task-ro');
    await computeTaskChanges(new FileCheckpointService(root, path.join(root, 'runtime', 'checkpoints')), 'task-ro');
    expect(await fingerprint()).toBe(before);
  });
});

describe('task changes HTTP route', () => {
  const auth = { 'x-agent-core-ui-token': 'test-ui-token' };
  async function serve(taskChanges: (taskId: string) => Promise<any>) {
    const server = createServer(createHttpHandler({ keyStore: {} as any, mcpHandler: async () => {}, agentUiToken: 'test-ui-token', taskChanges }));
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return 'http://127.0.0.1:' + (server.address() as any).port + '/agent/task-changes';
  }

  it('requires the UI token, only accepts GET and rejects anything except one valid taskId', async () => {
    const calls: string[] = [];
    const url = await serve(async taskId => { calls.push(taskId); return { taskId }; });
    expect((await fetch(url + '?taskId=task-1')).status).toBe(401);
    expect((await fetch(url + '?taskId=task-1', { method: 'POST', headers: auth })).status).toBe(405);
    for (const query of ['', '?taskId=', '?taskId=../secret', '?taskId=a%20b', '?taskId=a&path=C:%5Cx', '?taskId=a&taskId=b', '?path=..%5C..']) {
      expect((await fetch(url + query, { headers: auth })).status, query).toBe(400);
    }
    const ok = await fetch(url + '?taskId=native%3Atask-1', { headers: auth });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(await ok.json()).toEqual({ taskId: 'native:task-1' });
    expect(calls).toEqual(['native:task-1']);
  });

  it('hides internal failure detail', async () => {
    const url = await serve(async () => { throw new Error('C:\\private\\path leaked'); });
    const response = await fetch(url + '?taskId=task-1', { headers: auth });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'TASK_CHANGES_UNAVAILABLE' });
  });
});


// Source-contract coverage only. WebView2/WinForms execution requires Windows.
describe('task changes launcher boundary', () => {
  const main = readFileSync(new URL('../src/launcher/MainForm.cs', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../src/launcher/AgentCoreRuntime.cs', import.meta.url), 'utf8');

  it('forwards only a validated task id over a bounded read-only loopback GET', () => {
    const get = runtime.match(/public async Task<JsonElement> GetTaskChangesAsync\(string taskId\)[\s\S]*?\n    }/)?.[0] ?? '';
    expect(get).toContain('IsMatch(taskId, @"^[A-Za-z0-9._:-]{1,200}$")');
    expect(get).toContain('CreateAgentChatRequest(HttpMethod.Get, "/agent/task-changes?taskId=" + Uri.EscapeDataString(taskId))');
    expect(get).toContain('maxBytes = 2 * 1024 * 1024');
    expect(get).toContain('HttpCompletionOption.ResponseHeadersRead');
    expect(get).toContain('CancellationTokenSource(TimeSpan.FromSeconds(22))');
    expect(runtime).toContain('request.Headers.TryAddWithoutValidation("X-Agent-Core-UI-Token", _agentUiToken)');
  });

  it('bounds the correlation id before any request and answers with typed result or error', () => {
    const handler = main.slice(main.indexOf('if (type == "task-changes-get")'), main.indexOf('if (type == "proposals-get"'));
    expect(handler).toContain('changesRequestId.Length > 128');
    expect(handler.indexOf('changesRequestId.Length > 128')).toBeLessThan(handler.indexOf('_runtime.GetTaskChangesAsync'));
    expect(handler).toContain('type = "task-changes-result", requestId = changesRequestId, result');
    expect(handler).toContain('type = "task-changes-error", requestId = changesRequestId, error = error.Message');
  });
});
