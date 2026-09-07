import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSubAgentCoreConfig } from '../src/subagentcore/env.js';
import { inspectSubAgentCoreReadiness } from '../src/subagentcore/readiness.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup(env: Record<string, string> = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'subagentcore-readiness-'));
  roots.push(root);
  return { root, report: inspectSubAgentCoreReadiness(loadSubAgentCoreConfig(env, root), root) };
}

describe('SubAgentCore configuration readiness, not live certification', () => {
  it('reports the env location and missing keys/models', () => {
    const { root, report } = setup();
    expect(report.envPath).toBe(path.join(root, '.env'));
    expect(report.state).toBe('NEEDS_CONFIGURATION');
    expect(report.configurationReady).toBe(false);
    expect(report.liveInference).toBe('NOT_TESTED');
    expect(report.workers).toHaveLength(4);
    for (const worker of report.workers) expect(worker.blockers).toEqual(['API_KEY_MISSING', 'MODEL_MISSING']);
  });
  it('resolves sparse slots and defaults without leaking secrets', () => {
    const { report } = setup({
      SUBAGENTCORE_OPENROUTER_API_KEY_7: 'synthetic-secret-seven',
      SUBAGENTCORE_OPENROUTER_DEFAULT_MODEL: 'vendor/test-model',
    });
    expect(report.providers.find((p) => p.id === 'openrouter')?.configuredKeySlots).toEqual([7]);
    expect(report.workers.find((w) => w.id === 'astra')).toMatchObject({ model: 'vendor/test-model', configured: true });
    expect(JSON.stringify(report)).not.toContain('synthetic-secret-seven');
    expect(report.state).toBe('NEEDS_CONFIGURATION');
  });
  it('honors a worker model and checks an explicitly selected slot', () => {
    const { report } = setup({
      SUBAGENTCORE_OPENROUTER_API_KEY_2: 'synthetic-only-two',
      SUBAGENTCORE_ASTRA_MODEL: 'vendor/worker-specific',
      SUBAGENTCORE_ASTRA_KEY_SLOT: '1',
    });
    expect(report.workers.find((w) => w.id === 'astra')).toMatchObject({
      model: 'vendor/worker-specific', keySlot: 1, configured: false, blockers: ['KEY_SLOT_UNAVAILABLE'],
    });
  });
  it('permits the whole team on one provider without claiming live success', () => {
    const env: Record<string, string> = {
      SUBAGENTCORE_NVIDIA_API_KEY_1: 'synthetic-nvidia',
      SUBAGENTCORE_NVIDIA_DEFAULT_MODEL: 'nvidia/test-model',
    };
    for (const worker of ['ASTRA', 'FORGE', 'SENTINEL', 'SCRIBE']) env[`SUBAGENTCORE_${worker}_PROVIDER`] = 'nvidia';
    const { report } = setup(env);
    expect(report.configurationReady).toBe(true);
    expect(report.state).toBe('CONFIGURED_NOT_LIVE_TESTED');
    expect(report.liveInference).toBe('NOT_TESTED');
  });
  it('reports disabled independently from missing configuration', () => {
    const { report } = setup({ SUBAGENTCORE_ENABLED: 'false' });
    expect(report.state).toBe('DISABLED');
    expect(report.configurationReady).toBe(false);
    for (const worker of report.workers) expect(worker.blockers).toContain('SUBAGENTCORE_DISABLED');
  });
});
