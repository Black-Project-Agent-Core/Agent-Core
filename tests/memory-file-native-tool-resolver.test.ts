import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { resolvePrivateMemoryTool } from '../src/memory/file-native/tool-resolver.js';
import { loadConfig } from '../src/config.js';

const exe = (name: string) => process.platform === 'win32' ? `${name}.exe` : name;

describe('file-native memory portable paths and tools', () => {
  it('derives every memory path from the relocated Agent Core root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-file-native-paths-'));
    const p = resolveFileNativeMemoryPaths(root);
    expect(p.vaultRoot).toBe(path.join(root, 'runtime', 'memory', 'vault'));
    expect(p.graphRoot).toBe(path.join(root, 'runtime', 'memory', 'graph'));
    expect(p.transactionRoot).toBe(path.join(root, 'runtime', 'memory', 'transactions'));
    expect(p.syncRoot).toBe(path.join(root, 'runtime', 'memory', 'sync'));
    expect(p.ripgrepRoot).toBe(path.join(root, '.tools', 'ripgrep'));
    expect(p.pythonRoot).toBe(path.join(root, '.tools', 'python'));
    expect(p.graphifyToolRoot).toBe(path.join(root, '.tools', 'graphify'));
  });

  it('does not certify a system-only executable and prefers the project-local tool', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-file-native-tools-'));
    const p = resolveFileNativeMemoryPaths(root);
    await expect(resolvePrivateMemoryTool(p, 'rg')).rejects.toThrow('MEMORY_PRIVATE_TOOL_MISSING');
    const local = path.join(p.ripgrepRoot, exe('rg'));
    await mkdir(path.dirname(local), { recursive: true });
    await writeFile(local, 'fixture');
    expect(await resolvePrivateMemoryTool(p, 'rg')).toBe(local);
  });

  it('publishes file-native paths in MemoryConfig and rejects overrides escaping the project root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-file-native-config-'));
    const cfg = loadConfig({}, root).memory;
    expect(cfg.fileNative.vaultRoot).toBe(path.join(root, 'runtime', 'memory', 'vault'));
    expect(() => loadConfig({ AGENT_CORE_MEMORY_VAULT_ROOT: path.resolve(root, '..', 'escape') }, root))
      .toThrow('AGENT_CORE_MEMORY_VAULT_ROOT must stay inside the Agent Core root');
  });
});
