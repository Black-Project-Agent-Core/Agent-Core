import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentCapabilityResolver } from '../src/agent-capability-resolver.js';
import { AgentRuntimeToolSession } from '../src/agent-tool-session.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('Native Agent capability execution parity', () => {
  it('turns a dynamic file/process capability resolution into real existing MCP tool execution', async () => {
    const parent = fileURLToPath(new URL('../runtime/tmp', import.meta.url));
    const root = await mkdtemp(path.join(parent, 'nacp-exec-'));
    roots.push(root);
    const availableTools = await AgentRuntimeToolSession.discoverAvailableTools({});
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic',
      allowedTools: [],
      allowedCapabilities: ['observe.local', 'files.mutate', 'process.execute'],
    });
    const grant = resolver.resolve({
      requestedFamilies: ['observe.local', 'files.mutate', 'process.execute'],
      userPrompt: 'inspect, create a temporary file, then run a harmless command',
      availableTools,
    });
    expect(grant.approvedFamilies).toEqual([
      'observe.local',
      'files.mutate',
      'process.execute',
    ]);
    expect(grant.tools).toEqual(expect.arrayContaining([
      'read_file', 'write_file', 'start_process',
    ]));

    const session = await AgentRuntimeToolSession.open(
      'nacp-execution-parity',
      grant.tools,
      {},
      grant.restrictions,
    );
    try {
      const target = path.join(root, 'parity.txt');
      const written = await session.call('write_file', {
        path: target,
        content: 'NACP_FILE_OK',
        mode: 'rewrite',
      });
      expect(written.isError).toBe(false);

      const read = await session.call('read_file', { path: target });
      expect(read.isError).toBe(false);
      expect(read.text).toContain('NACP_FILE_OK');

      const process = await session.call('start_process', {
        command: 'echo NACP_PROCESS_OK',
        timeout_ms: 5_000,
        shell: 'cmd',
      });
      expect(process.isError).toBe(false);
      expect(process.text).toContain('NACP_PROCESS_OK');
      await expect(session.call('kill_process', { pid: 1 }))
        .rejects.toThrow('AGENT_RUNTIME_TOOL_NOT_GRANTED');
    } finally {
      await session.close();
    }
  }, 30_000);
});
