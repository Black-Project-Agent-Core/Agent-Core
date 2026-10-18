import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { acknowledgeControllerContract } from './controller-contract-fixture.js';

vi.mock('../src/rdc/tools/pdf/markdown.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/rdc/tools/pdf/markdown.js')>(), ensureChromeAvailable() {},
}));
vi.mock('@puppeteer/browsers', async importOriginal => ({
  ...await importOriginal<typeof import('@puppeteer/browsers')>(),
  install: async () => { throw new Error('Browser installation is outside this fixture; use an installed browser'); },
}));

const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-rdc-bridge-'));
const originalEnvironment = { rdc: process.env.AGENT_CORE_RDC_CONFIG_DIR, cache: process.env.AGENT_CORE_PUPPETEER_CACHE_DIR, project: process.env.AGENT_CORE_PROJECT_ROOT };
process.env.AGENT_CORE_PROJECT_ROOT = root;
process.env.AGENT_CORE_RDC_CONFIG_DIR = path.join(root, 'rdc-config');
process.env.AGENT_CORE_PUPPETEER_CACHE_DIR = path.join(root, 'browser-cache');
const { startAgentCoreService } = await import('../src/index.js');
const dataDir = path.join(root, 'auth');
const memoryDir = path.join(root, 'runtime/memory');
await (await import('../src/memory/host-activation.js')).activateCanonicalMemory(root, { operation: 'fresh' });
const keyStore = new FileKeyStore(dataDir);
const key = await keyStore.create('acceptance');
const { loadConfig } = await import('../src/config.js');
const config = loadConfig({ AGENT_CORE_DATA_DIR: dataDir, AGENT_CORE_MEMORY_DIR: memoryDir,
  AGENT_CORE_PHONE_ENABLED: 'false', AGENT_CORE_CODE_INTELLIGENCE_ENABLED: 'false',
  AGENT_CORE_SEMANTIC_IDE_ENABLED: 'false', AGENT_CORE_LEARNING_ENABLED: 'false' }, root);
config.port = 0;
const service = await startAgentCoreService(config);
const base = `http://127.0.0.1:${service.port}`;
let id = 0;
let contractSession: string;
async function rpc(method: string, params: Record<string, unknown>) {
  const response = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key.key}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  expect(response.status).toBe(200);
  return await response.json() as any;
}
async function call(name: string, args: Record<string, unknown> = {}) {
  contractSession ??= await acknowledgeControllerContract(async (tool, input) => (await rpc('tools/call', { name: tool, arguments: input })).result);
  const response = await rpc('tools/call', { name, arguments: { ...args, contractSession } });
  expect(response.error).toBeUndefined();
  expect(response.result?.isError).not.toBe(true);
  return response.result;
}
function text(result: any): string {
  return (result.content ?? []).filter((item: any) => item.type === 'text').map((item: any) => item.text).join('\n');
}
function totalCalls(result: any): number {
  const match = /Total calls:\s*(\d+)/.exec(text(result));
  if (!match) throw new Error('Total calls missing from usage stats');
  return Number(match[1]);
}
afterAll(async () => {
  await service.close();
  await rm(root, { recursive: true, force: true });
  for (const [key, value] of [['AGENT_CORE_RDC_CONFIG_DIR', originalEnvironment.rdc], ['AGENT_CORE_PUPPETEER_CACHE_DIR', originalEnvironment.cache], ['AGENT_CORE_PROJECT_ROOT', originalEnvironment.project]]) {
    if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
  }
});

describe('RDC-compatible local bridge runtime', () => {
  it('publishes the external RDC, memory and controller tools over authenticated MCP', async () => {
    const initialized = await rpc('initialize', {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'bridge-test', version: '1.0.0' },
    });
    expect(initialized.result?.serverInfo?.name).toBe('agent-core');
    const listed = await rpc('tools/list', {});
    expect(listed.result.tools).toHaveLength(66);
    for (const name of ['controller_contract', 'learning', 'skills', 'image_inspect', 'reconstruction_harness'])
      expect(listed.result.tools.some((tool: any) => tool.name === name)).toBe(true);
    expect(listed.result.tools.some((tool: any) => tool.name === 'memory_search')).toBe(true);
    expect(listed.result.tools.some((tool: any) => tool.name === 'capability_route')).toBe(false);
    const writeTool = listed.result.tools.find((tool: any) => tool.name === 'write_file');
    expect(writeTool.inputSchema.properties.mode.default).toBe('rewrite');
    expect(writeTool.inputSchema.required ?? []).not.toContain('mode');
  });
  it('performs direct config, file read/write/edit and metadata operations', async () => {
    await call('set_config_value', { key: 'allowedDirectories', value: [root] });
    const target = path.join(root, 'work', 'sample.txt');
    await call('create_directory', { path: path.dirname(target) });
    await call('write_file', { path: target, content: 'alpha\nbeta\n', mode: 'rewrite' });
    expect(await readFile(target, 'utf8')).toBe('alpha\nbeta\n');
    const accidentalOverwrite = await rpc('tools/call', {
      name: 'write_file', arguments: { path: target, content: 'must-not-overwrite', contractSession },
    });
    expect(accidentalOverwrite.result?.isError).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('alpha\nbeta\n');
    expect(text(await call('read_file', { path: target }))).toContain('beta');
    await call('edit_block', { file_path: target, old_string: 'beta', new_string: 'gamma', expected_replacements: 1 });
    expect(await readFile(target, 'utf8')).toContain('gamma');
    const info = text(await call('get_file_info', { path: target }));
    expect(info).toContain('isFile: true');
    const config = text(await call('get_config'));
    expect(config).toContain(root.replace(/\\/g, '\\\\'));
  });

  it('runs progressive content search like RDC', async () => {
    const started = text(await call('start_search', {
      path: root, pattern: 'gamma', searchType: 'content', literalSearch: true, timeout_ms: 5000,
    }));
    const sessionId = /session:\s*(\S+)/i.exec(started)?.[1];
    expect(sessionId).toBeTruthy();
    let results = '';
    const deadline = Date.now() + 5_000;
    do {
      results = text(await call('get_more_search_results', { sessionId, offset: 0, length: 20 }));
      if (results.includes('sample.txt')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    expect(results).toContain('sample.txt');
    expect(results).toContain('gamma');
  });
  it('starts a terminal process directly with no route/workflow/memory gate', async () => {
    const result = text(await call('start_process', {
      command: `"${process.execPath}" -e "console.log('rdc-process-ok')"`,
      timeout_ms: 5000,
    }));
    expect(result).toContain('Process started with PID');
    expect(result).toContain('rdc-process-ok');
  });

  it('tracks tool usage and recent calls locally', async () => {
    const usage = text(await call('get_usage_stats'));
    expect(usage).toContain('Total calls:');
    const history = text(await call('get_recent_tool_calls', { maxResults: 10 }));
    expect(history).toContain('Tool Call History');
    expect(history).toContain('start_process');
  });
  it('excludes UI-origin calls from usage accounting', async () => {
    const before = totalCalls(await call('get_usage_stats'));
    await call('get_config', { origin: 'ui' });
    const after = totalCalls(await call('get_usage_stats'));
    expect(after).toBe(before + 1);
  });
});


// PDF parity is intentionally exercised through the same MCP surface as other RDC tools.
describe('RDC PDF parity', () => {
  it('creates, reads, and modifies a PDF through write_pdf/read_file', async () => {
    const source = path.join(root, 'work', 'source.pdf');
    const created = path.join(root, 'work', 'created.pdf');
    const modified = path.join(root, 'work', 'modified.pdf');
    await call('write_pdf', {
      path: source,
      outputPath: created,
      content: '# Bridge PDF\n\nPage one.\n\n<div style="page-break-before: always;"></div>\n\nPage two.',
    });
    const readCreated = text(await call('read_file', { path: created }));
    expect(readCreated).toContain('Bridge PDF');
    expect(readCreated).toContain('Page two');
    await call('write_pdf', {
      path: created,
      outputPath: modified,
      content: [{ type: 'delete', pageIndexes: [1] }],
    });
    const readModified = text(await call('read_file', { path: modified }));
    expect(readModified).toContain('Bridge PDF');
    expect(readModified).not.toContain('Page two');
  }, 120000);
});
