import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const startup = readFileSync(path.join(pluginRoot, 'scripts', 'ensure-running.sh'), 'utf8');
const reconciliation = readFileSync(path.join(pluginRoot, 'scripts', 'runtime-reconciliation.sh'), 'utf8');

describe('codespace full rebuild contract', () => {
  it('owns the runtime dependencies required by its MCP server and tests', () => {
    expect(packageJson.dependencies?.['@modelcontextprotocol/sdk']).toBe('1.30.0');
    expect(packageJson.dependencies?.zod).toBe('4.4.3');
    expect(packageJson.devDependencies?.typescript).toBe('7.0.2');
    expect(packageJson.devDependencies?.vitest).toBe('4.1.11');
    expect(packageJson.devDependencies?.['@types/node']).toBe('24.13.3');
  });

  it('restores build dependencies without making operational startup depend on Vitest', () => {
    expect(startup).toContain('npm ci');
    expect(startup).toContain('$ROOT/node_modules/.bin/tsc');
    expect(startup).not.toContain('$ROOT/node_modules/.bin/vitest');
    expect(startup).toContain('$ROOT/dist/http-server.js');
    expect(startup).toContain('$ROOT/dist/http-probe.js');
    expect(startup).toContain('$ROOT/dist/watchdog.js');
  });

  it('persists an injected lifecycle credential into ignored workspace state for later restarts', () => {
    expect(startup).toContain('mkdir -p "$(dirname "$RUNTIME_API_KEY_FILE")"');
    expect(startup).toContain('chmod 600 "$RUNTIME_API_KEY_FILE"');
    expect(startup).toContain('RUNTIME_API_KEY_REF="file:$RUNTIME_API_KEY_FILE"');
  });

  it('serializes lifecycle recovery and delegates classification to the executable reconciliation seam', () => {
    expect(startup).toContain('flock -w 120 9');
    expect(startup).toContain('source "$ROOT/scripts/runtime-reconciliation.sh"');
    expect(startup).toContain('codespace_runtime_reconcile');
    expect(reconciliation).toContain('EXPECTED_RUNTIME_API_KEY_REF');
    expect(reconciliation).toContain('codespace_runtime_close_lifecycle_fd');
  });

  it('preflights watchdog observation without permitting recursive repair', () => {
    expect(startup).toContain('start-watchdog.sh" --once --check-only');
  });
});
