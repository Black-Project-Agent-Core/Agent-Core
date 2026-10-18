import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ControllerContractGate, installControllerContract } from '../src/mcp/controller-contract.js';
import { installCredentialToolGrant } from '../src/auth/tool-grant.js';
import { acknowledgeControllerContract } from './controller-contract-fixture.js';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), root: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('../src/portability/paths.js', () => ({ resolveModuleProjectRoot: mocks.root }));
let root: string;
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const closers: Array<() => Promise<void>> = [];
beforeEach(() => {
  vi.resetModules(); mocks.spawn.mockReset();
  Object.defineProperty(process, 'platform', { value: 'win32' });
  root = mkdtempSync(path.join(os.tmpdir(), 'agent-core-restart-'));
  mocks.root.mockReturnValue(root);
  for (const file of ['Restart-Agent-Core.cmd', 'Agent Core.exe', 'dist/index.js',
    'scripts/windows/Invoke-Agent-Core-Restart.ps1', 'scripts/windows/Restart-Agent-Core.ps1']) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, 'fixture');
  }
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { pid: 123, unref: vi.fn() });
    queueMicrotask(() => child.emit('spawn')); return child;
  });
});
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  Object.defineProperty(process, 'platform', platform);
  rmSync(root, { recursive: true, force: true });
});

it('launches the fixed portable CMD once for concurrent requests and reports request-only evidence', async () => {
  const { requestAgentCoreRestart } = await import('../src/mcp/restart-tool.js');
  const [first, duplicate] = await Promise.all([requestAgentCoreRestart(false), requestAgentCoreRestart(true)]);
  expect(mocks.spawn).toHaveBeenCalledOnce();
  expect(mocks.spawn.mock.calls[0]).toEqual([
    process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'Restart-Agent-Core.cmd'],
    { cwd: root, windowsHide: true, detached: true, stdio: ['ignore', expect.any(Number), expect.any(Number)] },
  ]);
  expect(first).toMatchObject({ status: 'requested', completed: false, alreadyRequested: false, refreshToolsRequired: false });
  expect(duplicate).toMatchObject({ alreadyRequested: true, refreshToolsRequired: true, logPath: first.logPath });
  expect(duplicate.next).toContain('https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6ad1239cdf308191a3ccb8ba0cd49503');
  expect(duplicate.next).toContain('scroll down again');
  expect(duplicate.next).toContain('click the visible Refresh tools text');
  expect(first.next).toContain('No Refresh tools is required');
  expect(first.evidence).toContain('never blindly repeat');
});

it('fails before spawning when the build is missing or the platform is unsupported', async () => {
  rmSync(path.join(root, 'dist/index.js'));
  let tool = await import('../src/mcp/restart-tool.js');
  await expect(tool.requestAgentCoreRestart(false)).rejects.toThrow();
  expect(mocks.spawn).not.toHaveBeenCalled();
  writeFileSync(path.join(root, 'dist/index.js'), 'repaired');
  await expect(tool.requestAgentCoreRestart(false)).resolves.toMatchObject({ alreadyRequested: false });
  expect(mocks.spawn).toHaveBeenCalledOnce(); mocks.spawn.mockClear();
  vi.resetModules(); Object.defineProperty(process, 'platform', { value: 'linux' });
  tool = await import('../src/mcp/restart-tool.js');
  await expect(tool.requestAgentCoreRestart(false)).rejects.toThrow('RESTART_WINDOWS_ONLY');
  expect(mocks.spawn).not.toHaveBeenCalled();
});

it('reports a failed spawn and allows an explicit corrected request without automatic retry', async () => {
  mocks.spawn.mockImplementationOnce(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('error', new Error('spawn denied'))); return child;
  });
  const { requestAgentCoreRestart } = await import('../src/mcp/restart-tool.js');
  await expect(requestAgentCoreRestart(true)).rejects.toThrow('spawn denied');
  expect(mocks.spawn).toHaveBeenCalledOnce();
  await expect(requestAgentCoreRestart(true)).resolves.toMatchObject({ status: 'requested', alreadyRequested: false });
  expect(mocks.spawn).toHaveBeenCalledTimes(2);
});

async function connect(allowedTools?: string[]) {
  const server = new McpServer({ name: 'restart-fixture', version: '1' });
  installControllerContract(server, { gate: new ControllerContractGate(() => '# Rules'), binding: 'fixture' });
  if (allowedTools) installCredentialToolGrant(server, { toolGrant: { version: 1, allowedTools } });
  const { registerRestartTool } = await import('../src/mcp/restart-tool.js'); registerRestartTool(server);
  const client = new Client({ name: 'restart-fixture', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  closers.push(async () => { await client.close(); await server.close(); });
  return { client, call: (name: string, args: any) => client.callTool({ name, arguments: args }) };
}

it('requires the contract before restart and rejects arbitrary command arguments', async () => {
  const f = await connect(['restart_agent_core']);
  const blocked = await f.call('restart_agent_core', { capabilitiesChanged: false });
  expect(blocked.isError).toBe(true); expect(JSON.stringify(blocked)).toContain('CONTRACT_READ_REQUIRED');
  expect(mocks.spawn).not.toHaveBeenCalled();
  const contractSession = await acknowledgeControllerContract(f.call);
  expect((await f.call('restart_agent_core', { capabilitiesChanged: false, contractSession, command: 'arbitrary' })).isError).toBe(true);
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect((await f.call('restart_agent_core', { capabilitiesChanged: true, contractSession })).isError).not.toBe(true);
  expect(mocks.spawn).toHaveBeenCalledOnce();
});

it('cannot expand a restricted credential grant through the handshake', async () => {
  const f = await connect([]);
  const contractSession = await acknowledgeControllerContract(f.call);
  expect((await f.client.listTools()).tools.map(tool => tool.name)).toEqual(['controller_contract']);
  await expect(f.call('restart_agent_core', { capabilitiesChanged: true, contractSession })).rejects.toThrow();
  expect(mocks.spawn).not.toHaveBeenCalled();
});
