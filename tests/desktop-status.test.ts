import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startAgentCoreService } from '../src/index.js';
import { loadConfig } from '../src/config.js';

describe('desktop status truth model', () => {
  it('reports direct RDC execution and file-native memory as available when the bridge is healthy', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-desktop-status-'));
    const memoryDir = path.join(root, 'memory');
    await mkdir(memoryDir, { recursive: true });
    await writeFile(path.join(memoryDir, '00-agent-core-memory.md'), '# Test Agent Core Foundational Memory\n', 'utf8');
    const config = loadConfig({
      AGENT_CORE_PORT: '18976',
      AGENT_CORE_DATA_DIR: path.join(root, 'auth'),
      AGENT_CORE_MEMORY_DIR: memoryDir,
      AGENT_CORE_PHONE_ENABLED: 'false',
      AGENT_CORE_CODE_INTELLIGENCE_ENABLED: 'false',
    }, process.cwd());
    const service = await startAgentCoreService(config);
    try {
      const response = await fetch('http://127.0.0.1:18976/health');
      const body = await response.json() as any;
      expect(body.execution).toEqual({ status: 'available', mode: 'rdc-direct' });
      expect(body.memory.status).toBe('available');
      expect(body.memory.mode).toBe('file-native');
    } finally {
      await service.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
