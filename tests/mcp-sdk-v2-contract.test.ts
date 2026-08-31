import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MCP SDK v2 core migration contract', () => {
  it('uses split MCP v2 server/node packages in the core while preserving the Codespace legacy SDK', async () => {
    const rootPackage = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const codespacePackage = JSON.parse(await readFile(path.resolve('plugin', 'codespace', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(rootPackage.dependencies?.['@modelcontextprotocol/server']).toBe('2.0.0');
    expect(rootPackage.dependencies?.['@modelcontextprotocol/node']).toBe('2.0.0');
    expect(rootPackage.dependencies?.['@modelcontextprotocol/sdk']).toBeUndefined();
    expect(rootPackage.devDependencies?.['@modelcontextprotocol/client']).toBe('2.0.0');

    expect(codespacePackage.dependencies?.['@modelcontextprotocol/sdk']).toBe('1.30.0');
    expect(codespacePackage.dependencies?.['@modelcontextprotocol/server']).toBeUndefined();
  });

  it('checks the v2 core packages during root Codespace bootstrap without rewriting the plugin dependency contract', async () => {
    const bootstrap = await readFile(path.resolve('scripts', 'codespace', 'bootstrap.sh'), 'utf8');
    const ensureRunning = await readFile(path.resolve('scripts', 'codespace', 'ensure-running.sh'), 'utf8');
    const pluginEnsureRunning = await readFile(path.resolve('plugin', 'codespace', 'scripts', 'ensure-running.sh'), 'utf8');

    for (const source of [bootstrap, ensureRunning]) {
      expect(source).toContain('node_modules/@modelcontextprotocol/server/package.json');
      expect(source).toContain('node_modules/@modelcontextprotocol/node/package.json');
      expect(source).not.toContain('node_modules/@modelcontextprotocol/sdk/package.json');
    }

    expect(pluginEnsureRunning).toContain('node_modules/@modelcontextprotocol/sdk/package.json');
    expect(pluginEnsureRunning).not.toContain('node_modules/@modelcontextprotocol/server/package.json');
  });
});
