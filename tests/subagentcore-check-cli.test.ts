import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(text?: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'subagentcore-check-')); roots.push(root);
  if (text !== undefined) writeFileSync(path.join(root, '.env'), text);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('SUBAGENTCORE_')));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/subagentcore-check.mjs', import.meta.url)), '--project-root', root], { env, encoding: 'utf8' });
  return { root, result };
}
it('reports absent env without creating it or calling a provider', () => {
  const { root, result } = fixture();
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ envFileExists: false, state: 'NEEDS_CONFIGURATION', liveInference: 'NOT_TESTED' });
  expect(existsSync(path.join(root, '.env'))).toBe(false);
  expect(existsSync(path.join(root, 'runtime'))).toBe(false);
});
it('reports configured team with no secret output or env mutation', () => {
  const text = [
    'SUBAGENTCORE_NVIDIA_API_KEY_1=synthetic-cli-secret',
    'SUBAGENTCORE_NVIDIA_DEFAULT_MODEL=nvidia/test-model',
    ...['ASTRA', 'FORGE', 'SENTINEL', 'SCRIBE'].map((id) => `SUBAGENTCORE_${id}_PROVIDER=nvidia`),
  ].join('\n');
  const { root, result } = fixture(text);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'CONFIGURED_NOT_LIVE_TESTED', configurationReady: true });
  expect(result.stdout + result.stderr).not.toContain('synthetic-cli-secret');
  expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe(text);
  expect(existsSync(path.join(root, 'runtime'))).toBe(false);
});
it('does not echo invalid configuration values in errors', () => {
  const { result } = fixture('SUBAGENTCORE_ENABLED=synthetic-invalid-secret');
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain('synthetic-invalid-secret');
  expect(JSON.parse(result.stdout)).toMatchObject({ error: 'SUBAGENTCORE_CHECK_FAILED' });
});
