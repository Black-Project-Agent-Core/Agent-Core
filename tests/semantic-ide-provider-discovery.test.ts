import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverBuiltInProviders } from '../src/semantic-ide/provider-registry.js';

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-semantic-discovery-'));
  roots.push(root);
  const runtimeDir = path.join(root, 'runtime');
  await mkdir(runtimeDir, { recursive: true });
  return {
    root,
    runtimeDir,
    config: {
      enabled: true,
      projectRoot: root,
      runtimeDir,
      startupTimeoutMs: 5000,
      callTimeoutMs: 5000,
      typescriptServerPath: process.execPath,
      typescriptTsserverPath: process.execPath,
    },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Semantic IDE built-in provider discovery', () => {
  it('discovers project-local C#, PowerShell, and Python providers without global installation', async () => {
    const { runtimeDir, config } = await fixture();

    const pythonEntry = path.join(runtimeDir, 'providers', 'python', 'node_modules', 'pyright', 'langserver.index.js');
    await mkdir(path.dirname(pythonEntry), { recursive: true });
    await writeFile(pythonEntry, '// fixture\n', 'utf8');

    const csharpServer = path.join(runtimeDir, 'providers', 'csharp', 'roslyn', 'Microsoft.CodeAnalysis.LanguageServer.dll');
    const dotnet = path.join(runtimeDir, 'providers', 'csharp', 'dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
    await mkdir(path.dirname(csharpServer), { recursive: true });
    await mkdir(path.dirname(dotnet), { recursive: true });
    await writeFile(csharpServer, 'fixture\n', 'utf8');
    await writeFile(dotnet, 'fixture\n', 'utf8');

    const pses = path.join(runtimeDir, 'providers', 'powershell', 'PowerShellEditorServices', 'Start-EditorServices.ps1');
    const pwsh = path.join(runtimeDir, 'providers', 'powershell', 'pwsh', process.platform === 'win32' ? 'pwsh.exe' : 'pwsh');
    await mkdir(path.dirname(pses), { recursive: true });
    await mkdir(path.dirname(pwsh), { recursive: true });
    await writeFile(pses, '# fixture\n', 'utf8');
    await writeFile(pwsh, 'fixture\n', 'utf8');

    const result = await discoverBuiltInProviders(config);
    const ids = result.definitions.map(item => item.id).sort();
    expect(ids).toEqual(['csharp', 'powershell', 'python', 'typescript']);

    const python = result.definitions.find(item => item.id === 'python')!;
    expect(python.command).toBe(process.execPath);
    expect(python.args[0]).toBe(pythonEntry);

    const csharp = result.definitions.find(item => item.id === 'csharp')!;
    expect(csharp.command).toBe(dotnet);
    expect(csharp.args).toContain(csharpServer);
    expect(csharp.args.join(' ')).toContain(path.join(runtimeDir, 'state', 'csharp', 'logs'));
    expect(csharp.args.join(' ')).not.toContain(path.join(runtimeDir, 'providers', 'csharp', 'logs'));

    const powershell = result.definitions.find(item => item.id === 'powershell')!;
    expect(powershell.command).toBe(pwsh);
    expect(powershell.args.join(' ')).toContain('Start-EditorServices.ps1');
    expect(powershell.args.join(' ')).toContain(path.join(runtimeDir, 'state', 'powershell', 'session'));
    expect(powershell.args.join(' ')).not.toContain(path.join(runtimeDir, 'providers', 'powershell', 'session'));
    expect(result.issues).toHaveLength(0);
  });

  it('does not claim unavailable C#/PowerShell/Python providers are installed', async () => {
    const { config } = await fixture();
    const result = await discoverBuiltInProviders(config);
    expect(result.definitions.map(item => item.id)).toEqual(['typescript']);
    expect(result.issues).toHaveLength(0);
  });
});
