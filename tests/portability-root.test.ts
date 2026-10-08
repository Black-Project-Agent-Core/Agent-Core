import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { resolvePortableProjectPath, resolveProjectRoot } from '../src/portability/paths.js';

const roots: string[] = [];
async function projectRoot(name: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), name));
  roots.push(root);
  await writeFile(path.join(root, 'package.json'), '{"name":"agent-core"}');
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('portable Agent Core root resolution', () => {
  it('falls back from a stale absolute AGENT_CORE_PROJECT_ROOT to the current module/launcher root', async () => {
    const current = await projectRoot('agent-core-current-');
    const stale = path.join(path.parse(current).root, 'missing-drive-copy', 'Agent-Core');
    expect(resolveProjectRoot({ AGENT_CORE_PROJECT_ROOT: stale }, current)).toBe(path.resolve(current));
  });

  it('resolves relative and project-token overrides against the current root', async () => {
    const root = await projectRoot('agent-core-relative-');
    expect(resolvePortableProjectPath(root, 'runtime/custom-memory', 'runtime/memory'))
      .toBe(path.join(root, 'runtime', 'custom-memory'));
    expect(resolvePortableProjectPath(root, '@project/runtime/memory', 'runtime/memory'))
      .toBe(path.join(root, 'runtime', 'memory'));
  });
  it('rebases stale absolute project-owned paths while preserving unrelated external paths', async () => {
    const root = await projectRoot('agent-core-rebase-');
    const staleMemory = path.join('E:\\OldMachine\\Agent-Core', 'runtime', 'memory');
    const external = path.join('D:\\SharedState', 'memory-store');
    expect(resolvePortableProjectPath(root, staleMemory, path.join('runtime', 'memory')))
      .toBe(path.join(root, 'runtime', 'memory'));
    expect(resolvePortableProjectPath(root, external, path.join('runtime', 'memory')))
      .toBe(path.resolve(external));
  });

  it('loadConfig rebases all project-owned subsystem paths to the new root', async () => {
    const root = await projectRoot('agent-core-config-');
    const old = 'E:\\OldMachine\\Agent-Core';
    const config = loadConfig({
      AGENT_CORE_PROJECT_ROOT: old,
      AGENT_CORE_DATA_DIR: path.join(old, 'runtime', 'bridge-auth'),
      AGENT_CORE_MEMORY_DIR: path.join(old, 'runtime', 'memory'),
      AGENT_CORE_CODE_INTELLIGENCE_RUNTIME_DIR: path.join(old, 'runtime', 'grafel'),
      AGENT_CORE_GRAFEL_BINARY: path.join(old, 'runtime', 'grafel', 'bin', 'grafel.exe'),
      AGENT_CORE_LEARNING_STATE_DIR: path.join(old, 'runtime', 'learning'),
      AGENT_CORE_SEMANTIC_IDE_RUNTIME_DIR: path.join(old, 'runtime', 'semantic-ide'),
      AGENT_CORE_SEMANTIC_IDE_TYPESCRIPT_SERVER: path.join(old, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
      AGENT_CORE_SEMANTIC_IDE_TYPESCRIPT_TSSERVER: path.join(old, 'node_modules', 'typescript-lsp-runtime', 'lib', 'tsserver.js'),
      AGENT_CORE_SEMANTIC_IDE_PYTHON_SERVER: path.join(old, 'runtime', 'semantic-ide', 'providers', 'python', 'node_modules', 'pyright', 'langserver.index.js'),
      AGENT_CORE_SEMANTIC_IDE_CSHARP_SERVER: path.join(old, 'runtime', 'semantic-ide', 'providers', 'csharp', 'roslyn', 'Microsoft.CodeAnalysis.LanguageServer.dll'),
      AGENT_CORE_SEMANTIC_IDE_DOTNET: path.join(old, 'runtime', 'semantic-ide', 'providers', 'csharp', 'dotnet', 'dotnet.exe'),
      AGENT_CORE_SEMANTIC_IDE_POWERSHELL_EDITOR_SERVICES: path.join(old, 'runtime', 'semantic-ide', 'providers', 'powershell', 'PowerShellEditorServices', 'Start-EditorServices.ps1'),
      AGENT_CORE_PHONE_DATA_DIR: path.join(old, 'runtime', 'phone'),
    }, root);
    expect(config.projectRoot).toBe(path.resolve(root));
    expect(config.dataDir).toBe(path.join(root, 'runtime', 'bridge-auth'));
    expect(config.memoryDir).toBe(path.join(root, 'runtime', 'memory'));
    expect(config.codeIntelligence?.runtimeDir).toBe(path.join(root, 'runtime', 'grafel'));
    expect(config.codeIntelligence?.binaryPath).toBe(path.join(root, 'runtime', 'grafel', 'bin', 'grafel.exe'));    expect(config.learning.stateDir).toBe(path.join(root, 'runtime', 'learning'));
    expect(config.semanticIde.runtimeDir).toBe(path.join(root, 'runtime', 'semantic-ide'));
    expect(config.semanticIde.typescriptServerPath).toBe(path.join(root, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'));
    expect(config.semanticIde.typescriptTsserverPath).toBe(path.join(root, 'node_modules', 'typescript-lsp-runtime', 'lib', 'tsserver.js'));
    expect(config.semanticIde.pythonServerPath).toBe(path.join(root, 'runtime', 'semantic-ide', 'providers', 'python', 'node_modules', 'pyright', 'langserver.index.js'));
    expect(config.semanticIde.csharpServerPath).toBe(path.join(root, 'runtime', 'semantic-ide', 'providers', 'csharp', 'roslyn', 'Microsoft.CodeAnalysis.LanguageServer.dll'));
    expect(config.semanticIde.dotnetPath).toBe(path.join(root, 'runtime', 'semantic-ide', 'providers', 'csharp', 'dotnet', 'dotnet.exe'));
    expect(config.semanticIde.powershellEditorServicesPath).toBe(path.join(root, 'runtime', 'semantic-ide', 'providers', 'powershell', 'PowerShellEditorServices', 'Start-EditorServices.ps1'));
    expect(config.phone?.dataDir).toBe(path.join(root, 'runtime', 'phone'));
  });
});
