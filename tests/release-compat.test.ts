import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const script = path.resolve('scripts/release/release-compat.mjs');
afterEach(() => { vi.restoreAllMocks(); });

async function compat() {
  // Fail before importing the old CLI, whose top-level execution is the regression.
  expect((await readFile(script, 'utf8')).includes('export async function main')).toBe(true);
  return import('../scripts/release/release-compat.mjs');
}

describe('release compatibility tooling contract', () => {
  it('imports helpers without running the CLI or printing a report', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const before = process.exitCode;
    const module = await compat();
    expect(module.main).toBeTypeOf('function');
    expect(module.builtManifestBudget).toBeTypeOf('function');
    expect(log).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(before);
  });

  it('keeps every mandatory registration/schema inventory path real', async () => {
    const module = await compat();
    expect(module.mcpFiles).not.toContain('src/mcp/partner-tools.ts');
    expect(module.schemaFiles).not.toContain('src/mcp/partner-schemas.ts');
    for (const file of [...module.mcpFiles, ...module.schemaFiles]) await expect(access(path.resolve(file))).resolves.toBeUndefined();
  });

  it('compares dynamic route patterns without executing them', async () => {
    const { publicRoutes } = await compat();
    const regex = String.raw`/^\/agent\/chat\/([^/]+)\/turns$/`;
    const routes = publicRoutes(`if (route === '/health') {} const m = route.match(${regex});`);
    expect(routes).toContain('/health');
    expect(routes).toContain(`regex:${regex}`);
    expect(publicRoutes(`const m = route.match(${regex});`)).toEqual([`regex:${regex}`]);
    expect(publicRoutes(null)).toEqual([]);
  });

  it('accepts valid named cohorts rather than a count from a different cohort', async () => {
    const { manifestBudgetExitCode } = await compat();
    for (const toolCount of [79, 80, 83]) {
      expect(manifestBudgetExitCode({ available: true, stale: false, exceeded: false, toolCount })).toBe(0);
    }
  });

  it('fails closed for unavailable, stale, over-budget or rejected image baselines', async () => {
    const { manifestBudgetExitCode } = await compat();
    const valid = { available: true, stale: false, exceeded: false, toolCount: 80 };
    for (const broken of [{ available: false }, { stale: true }, { exceeded: true }, { imageBaseline: { withinDelta: false } }]) {
      expect(manifestBudgetExitCode({ ...valid, ...broken })).toBe(2);
    }
  });
});
