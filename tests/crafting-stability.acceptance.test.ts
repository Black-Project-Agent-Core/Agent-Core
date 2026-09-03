import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const root = process.cwd();
const legacyType = 'Implementation' + 'Strategy';
const legacyProperty = 'implementation' + 'Strategy';
const legacyEnv = 'AGENT_CORE_' + 'IMPLEMENTATION_STRATEGY_MODE';
const legacyModeA = 'GREEN' + 'FIELD';
const legacyModeB = 'FEATURE_' + 'GRAFT';

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

async function exists(target: string): Promise<boolean> {
  try { await stat(target); return true; }
  catch { return false; }
}

describe('Real Steel final stability contract', () => {
  it('contains no legacy implementation-strategy runtime vocabulary in production source', async () => {
    const sourceFiles = (await filesUnder(path.join(root, 'src'))).filter((file) => file.endsWith('.ts'));
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const content = await readFile(file, 'utf8');
      if ([legacyType, legacyProperty, legacyEnv, legacyModeA, legacyModeB].some((token) => content.includes(token))) {
        offenders.push(path.relative(root, file).replace(/\\/g, '/'));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('removes deferred prototype modules and old reference-specific acceptance fixtures', async () => {
    const removed = [
      ['src', 'implementation'].join(path.sep),
      ['src', 'mcp', 'implementation-' + 'strategy-guard.ts'].join(path.sep),
      ['tests', 'implementation-' + 'strategy.test.ts'].join(path.sep),
      ['tests', 'implementation-' + 'strategy-guard.test.ts'].join(path.sep),
      ['tests', 'implementation-' + 'strategy-real-graft.acceptance.test.ts'].join(path.sep),
      ['tests', 'implementation-verification.test.ts'].join(path.sep),
      ['tests', 'code-intelligence-provider.test.ts'].join(path.sep),
      ['tests', 'git-working-tree-code-intelligence.test.ts'].join(path.sep),
      ['tests', 'transplant-manifest.test.ts'].join(path.sep),
      ['tests', 'authority-conflicts.test.ts'].join(path.sep),
    ];
    for (const relative of removed) expect(await exists(path.join(root, relative))).toBe(false);
  });

  it('keeps Real Steel as the only coding-governance runtime surface', async () => {
    const config = await readFile(path.join(root, 'src', 'config.ts'), 'utf8');
    const services = await readFile(path.join(root, 'src', 'runtime', 'services.ts'), 'utf8');
    const routeStore = await readFile(path.join(root, 'src', 'runtime', 'route-context-store.ts'), 'utf8');
    const tools = await readFile(path.join(root, 'src', 'mcp', 'tools.ts'), 'utf8');
    expect(config).toContain('AGENT_CORE_CRAFTING_ENFORCEMENT');
    expect(config).not.toContain(legacyEnv);
    expect(services).not.toContain(legacyProperty);
    expect(routeStore).not.toContain(legacyProperty);
    expect(tools).not.toContain('implementation-' + 'strategy-guard');
  });

  it('defaults Real Steel enforcement to disabled and changes it only through the explicit crafting environment control', () => {
    expect(loadConfig({}, root).crafting.enforcement).toBe('disabled');
    expect(loadConfig({ AGENT_CORE_CRAFTING_ENFORCEMENT: 'advisory' }, root).crafting.enforcement).toBe('advisory');
    expect(loadConfig({ AGENT_CORE_CRAFTING_ENFORCEMENT: 'enforce' }, root).crafting.enforcement).toBe('enforce');
  });
  it('removes reference-specific attribution when no adapted third-party implementation remains', async () => {
    expect(await exists(path.join(root, 'THIRD_PARTY_NOTICES.md'))).toBe(false);
  });
});
