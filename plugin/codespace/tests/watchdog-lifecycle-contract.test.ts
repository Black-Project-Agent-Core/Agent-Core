import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const startup = readFileSync(path.join(pluginRoot, 'scripts', 'ensure-running.sh'), 'utf8');
const reconciliation = readFileSync(path.join(pluginRoot, 'scripts', 'runtime-reconciliation.sh'), 'utf8');
const watchdogStartPath = path.join(pluginRoot, 'scripts', 'start-watchdog.sh');
const watchdogStart = existsSync(watchdogStartPath)
  ? readFileSync(watchdogStartPath, 'utf8')
  : '';

describe('codespace automatic watchdog lifecycle contract', () => {
  it('provides a sanitized long-running watchdog entrypoint without inheriting lifecycle locks', () => {
    expect(watchdogStart).not.toBe('');
    expect(watchdogStart).toContain('exec 9>&-');
    expect(watchdogStart).toContain('unset CONTROL_PLANE_API_KEY');
    expect(watchdogStart).toContain('unset OPENAI_ADMIN_KEY');
    expect(watchdogStart).toContain('exec node "$ROOT/dist/watchdog.js"');
  });

  it('accepts a forced reconnect mode used only by self-healing', () => {
    expect(startup).toContain('FORCE_RECONNECT=false');
    expect(startup).toContain('--force-reconnect)');
    expect(startup).toContain('FORCE_RECONNECT=true');
    expect(startup).toContain('if [[ "$FORCE_RECONNECT" == true ]]');
    expect(startup).toContain('CODESPACE_WATCHDOG_ACTIVE');
  });

  it('retries transient initial tunnel registration before giving up', () => {
    expect(reconciliation).toContain('CODESPACE_CONNECT_MAX_ATTEMPTS');
    expect(reconciliation).toContain('connect_attempt');
    expect(reconciliation).toContain('managed runtime connect attempt');
    expect(reconciliation).toContain('connect_rc');
  });

  it('retries transient doctor failures before watchdog startup without weakening diagnostics', () => {
    expect(reconciliation).toContain('CODESPACE_DOCTOR_MAX_ATTEMPTS');
    expect(reconciliation).toContain('doctor_attempt');
    expect(reconciliation).toContain('doctor failed after');
    expect(reconciliation).toContain('doctor_rc');
  });

  it('preflights and starts an owned watchdog tmux session before declaring READY', () => {
    const preflightIndex = startup.indexOf('start-watchdog.sh" --once');
    const startIndex = startup.lastIndexOf('start-watchdog.sh');
    const readyIndex = startup.indexOf('[codespace] READY:');
    expect(startup).toContain('codespace-bridge-watchdog');
    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(startIndex).toBeGreaterThan(preflightIndex);
    expect(readyIndex).toBeGreaterThan(startIndex);
    expect(startup).toContain('exec 9>&-');
    expect(startup).toContain('tmux has-session -t "$WATCHDOG_SESSION"');
  });

  it('treats the compiled watchdog as a rebuild requirement', () => {
    expect(startup).toContain('$ROOT/dist/watchdog.js');
  });
});
