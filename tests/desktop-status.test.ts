import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
vi.mock('../src/rdc/tools/pdf/markdown.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/rdc/tools/pdf/markdown.js')>(), ensureChromeAvailable() {},
}));

describe('desktop status truth model', () => {
  it('reports direct RDC execution and file-native memory as available when the bridge is healthy', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-desktop-status-'));
    const previousRdc = process.env.AGENT_CORE_RDC_CONFIG_DIR;
    process.env.AGENT_CORE_RDC_CONFIG_DIR = path.join(root, 'rdc');
    vi.resetModules();
    const { startAgentCoreService } = await import('../src/index.js');
    const memoryDir = path.join(root, 'runtime/memory');
    await (await import('../src/memory/host-activation.js')).activateCanonicalMemory(root, { operation: 'fresh' });
    const config = loadConfig({
      AGENT_CORE_PORT: '18976',
      AGENT_CORE_DATA_DIR: path.join(root, 'auth'),
      AGENT_CORE_MEMORY_DIR: memoryDir,
      AGENT_CORE_PHONE_ENABLED: 'false',
      AGENT_CORE_CODE_INTELLIGENCE_ENABLED: 'false',
      AGENT_CORE_SEMANTIC_IDE_ENABLED: 'false',
      AGENT_CORE_LEARNING_ENABLED: 'false',
    }, root);
    config.port = 0;
    const service = await startAgentCoreService(config);
    try {
      const response = await fetch(`http://127.0.0.1:${service.port}/health`);
      const body = await response.json() as any;
      expect(body.execution).toEqual({ status: 'available', mode: 'rdc-direct' });
      expect(body.memory.status).toBe('available');
      expect(body.memory.mode).toBe('file-native');
    } finally {
      await service.close();
      await rm(root, { recursive: true, force: true });
      if (previousRdc === undefined) delete process.env.AGENT_CORE_RDC_CONFIG_DIR; else process.env.AGENT_CORE_RDC_CONFIG_DIR = previousRdc;
    }
  });
});
