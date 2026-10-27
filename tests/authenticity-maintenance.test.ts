import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const originalRdcConfigDir = process.env.AGENT_CORE_RDC_CONFIG_DIR;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let productionBuilt = false;
let compiledFixture: string;
function buildProduction(): void {
  if (productionBuilt) return;
  const parent = path.join(repoRoot, 'runtime/tmp'); mkdirSync(parent, { recursive: true });
  compiledFixture = mkdtempSync(path.join(parent, 'authenticity-compiled-'));
  execFileSync(process.execPath, [path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json', '--outDir', compiledFixture, '--incremental', 'false'], { cwd: repoRoot, stdio: 'pipe' });
  productionBuilt = true;
}
afterAll(async () => { if (compiledFixture) await rm(compiledFixture, { recursive: true, force: true }); });

async function restoreEnvironment(): Promise<void> {
  if (originalRdcConfigDir === undefined) delete process.env.AGENT_CORE_RDC_CONFIG_DIR;
  else process.env.AGENT_CORE_RDC_CONFIG_DIR = originalRdcConfigDir;
  vi.resetModules();
}

afterEach(async () => {
  await restoreEnvironment();
});

function text(result: any): string {
  return (result.content ?? [])
    .filter((item: any) => item.type === 'text')
    .map((item: any) => item.text)
    .join('\n');
}
describe('Agent Core authenticity maintenance', () => {
  it('fails closed when RDC config persistence cannot initialize', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-auth-config-'));
    const configDir = path.join(root, 'rdc');
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'config.json'), '{invalid-json', 'utf8');
    process.env.AGENT_CORE_RDC_CONFIG_DIR = configDir;
    vi.resetModules();

    const { getConfig } = await import('../src/rdc/tools/config.js');
    const result = await getConfig() as any;

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Error getting configuration');

    const { configManager } = await import('../src/rdc/config-manager.js');
    await configManager.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });

  it('reports execution unavailable when RDC config readiness is broken', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-auth-health-'));
    const configDir = path.join(root, 'rdc');
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'config.json'), '{invalid-json', 'utf8');
    const fakeChrome = path.join(configDir, 'puppeteer-cache', 'chrome', 'win64-test', 'chrome-win64', 'chrome.exe');
    await mkdir(path.dirname(fakeChrome), { recursive: true });
    await writeFile(fakeChrome, '', 'utf8');

    const memoryDir = path.join(root, 'runtime/memory');
    const { activateCanonicalMemory } = await import('../src/memory/host-activation.js');
    await activateCanonicalMemory(root, { operation: 'fresh' });
    process.env.AGENT_CORE_RDC_CONFIG_DIR = configDir;
    vi.resetModules();

    const { startAgentCoreService } = await import('../src/index.js');
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig({ AGENT_CORE_DATA_DIR: path.join(root, 'auth'), AGENT_CORE_MEMORY_DIR: memoryDir,
      AGENT_CORE_PHONE_ENABLED: 'false', AGENT_CORE_CODE_INTELLIGENCE_ENABLED: 'false',
      AGENT_CORE_SEMANTIC_IDE_ENABLED: 'false', AGENT_CORE_LEARNING_ENABLED: 'false' }, root);
    config.port = 0;
    const service = await startAgentCoreService(config);
    try {
      const body = await (await fetch(`http://127.0.0.1:${service.port}/health`)).json() as any;
      expect(body.execution.status).toBe('unavailable');
    } finally {
      await service.close();
      await rm(root, { recursive: true, force: true });
    }
  }, process.platform === 'win32' ? 180_000 : 15_000); // boots the whole service; module loading alone exceeds 60 s on a slow Windows machine
  it('ships get_prompts with all production runtime data', async () => {
    buildProduction();
    const moduleUrl = `${pathToFileURL(path.join(compiledFixture, 'rdc', 'tools', 'prompts.js')).href}?audit=${Date.now()}`;
    const { getPrompts } = await import(moduleUrl);
    const result = await getPrompts({ action: 'get_prompt', promptId: 'onb2_01' }) as any;

    expect(result.isError).not.toBe(true);
    expect(text(result)).toContain('Organize my Downloads folder');
  });

  it('marks fuzzy edit advice as an error when no edit was applied', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-auth-edit-'));
    process.env.AGENT_CORE_RDC_CONFIG_DIR = path.join(root, 'rdc');
    vi.resetModules();
    const target = path.join(root, 'sample.txt');
    await writeFile(target, 'alpha beta gamma\n', 'utf8');

    buildProduction();
    const editModuleUrl = `${pathToFileURL(path.join(compiledFixture, 'rdc', 'tools', 'edit.js')).href}?audit=${Date.now()}`;
    const { handleEditBlock } = await import(editModuleUrl);
    const result = await handleEditBlock({
      file_path: target,
      old_string: 'alpha delta gamma',
      new_string: 'replacement',
      expected_replacements: 1,
    }) as any;
    expect(result.isError).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('alpha beta gamma\n');

    const { configManager } = await import('../src/rdc/config-manager.js');
    await configManager.close();
    await rm(root, { recursive: true, force: true });
  });

  it('counts current process and PDF tools in the correct usage categories', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-auth-usage-'));
    process.env.AGENT_CORE_RDC_CONFIG_DIR = path.join(root, 'rdc');
    vi.resetModules();

    const { usageTracker } = await import('../src/rdc/utils/usageTracker.js');
    await usageTracker.trackSuccess('start_process');
    await usageTracker.trackSuccess('read_process_output');
    await usageTracker.trackSuccess('interact_with_process');
    await usageTracker.trackSuccess('write_pdf');
    const stats = await usageTracker.getStats();

    expect(stats.terminalOperations).toBe(3);
    expect(stats.filesystemOperations).toBe(1);

    const { configManager } = await import('../src/rdc/config-manager.js');
    await configManager.close();
    await rm(root, { recursive: true, force: true });
  });
  it('marks no-target stop and terminate operations as errors', async () => {
    vi.resetModules();
    const { handleStopSearch } = await import('../src/rdc/handlers/search-handlers.js');
    const { forceTerminate } = await import('../src/rdc/tools/improved-process-tools.js');

    const stopped = await handleStopSearch({ sessionId: 'missing-session' }) as any;
    const terminated = await forceTerminate({ pid: 2_147_483_000 }) as any;

    expect(stopped.isError).toBe(true);
    expect(terminated.isError).toBe(true);
  });
});

// Persistence-failure truthfulness: a failed config write must not claim a committed/in-memory change.
describe('configuration persistence truthfulness', () => {
  it('does not claim a failed config write changed the in-memory value', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-auth-config-write-'));
    const configDir = path.join(root, 'rdc');
    process.env.AGENT_CORE_RDC_CONFIG_DIR = configDir;
    vi.resetModules();

    const { configManager } = await import('../src/rdc/config-manager.js');
    const { setConfigValue } = await import('../src/rdc/tools/config.js');
    const before = (await configManager.getConfig()).fileReadLineLimit;
    await configManager.close();

    const saved = `${configDir}-saved`;
    await (await import('node:fs/promises')).rename(configDir, saved);
    await writeFile(configDir, 'blocks-directory-recreation', 'utf8');

    const result = await setConfigValue({ key: 'fileReadLineLimit', value: 321 }) as any;
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('not committed');
    expect(text(result)).not.toContain('changed in memory');
    expect((await configManager.getConfig()).fileReadLineLimit).toBe(before);

    await rm(root, { recursive: true, force: true });
  });
});

// Retained feedback support must not claim a survey was submitted when Agent Core only opened the form.
describe('feedback state truthfulness', () => {
  it('records feedback-form opening without claiming feedback submission', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-auth-feedback-'));
    process.env.AGENT_CORE_RDC_CONFIG_DIR = path.join(root, 'rdc');
    vi.resetModules();

    const { usageTracker } = await import('../src/rdc/utils/usageTracker.js');
    const { configManager } = await import('../src/rdc/config-manager.js');
    await usageTracker.markFeedbackFormOpened();

    const summary = await usageTracker.getUsageSummary();
    expect(summary).toContain('Feedback form opened: Yes');
    expect(summary).not.toContain('Feedback given: Yes');
    expect(await configManager.getValue('feedbackGiven')).not.toBe(true);

    await configManager.close();
    await rm(root, { recursive: true, force: true });
  });
});
