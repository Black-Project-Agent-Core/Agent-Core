import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MCP SDK v2 core migration contract', () => {
  it('uses split MCP v2 server/node packages in the core', async () => {
    const rootPackage = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(rootPackage.dependencies?.['@modelcontextprotocol/server']).toBe('2.0.0');
    expect(rootPackage.dependencies?.['@modelcontextprotocol/node']).toBe('2.0.0');
    expect(rootPackage.dependencies?.['@modelcontextprotocol/sdk']).toBeUndefined();
    expect(rootPackage.devDependencies?.['@modelcontextprotocol/client']).toBe('2.0.0');

  });
});
