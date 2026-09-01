import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');
const read = (root: string, relative: string) => readFileSync(path.join(root, relative), 'utf8');

describe('Phase 7 Codespace memory lifecycle startup contract', () => {
  it('reuses the root Phase-2 hydration gate before the mutation-capable loopback MCP server', () => {
    const startup = read(pluginRoot, 'scripts/ensure-running.sh');
    const lifecyclePreflight = read(pluginRoot, 'scripts/memory-lifecycle-preflight.sh');
    const preflightIndex = startup.indexOf('memory-lifecycle-preflight.sh');
    const mcpIndex = startup.indexOf('ensure-http-mcp.sh');
    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(mcpIndex).toBeGreaterThan(preflightIndex);
    expect(lifecyclePreflight).toContain('$REPO_ROOT/scripts/codespace/common.sh');
    expect(lifecyclePreflight).toContain('$REPO_ROOT/scripts/codespace/memory-hydration-gate.sh');
    expect(lifecyclePreflight).toContain('agent_core_service_port');
    expect(lifecyclePreflight).toContain('/internal/memory-context-lease');
    expect(lifecyclePreflight).not.toContain('memory-hydrate ');
    expect(lifecyclePreflight).not.toContain('remote-hydration.json');
  });

  it('propagates only the non-secret lifecycle mode and exact loopback endpoint into the HTTP MCP child', () => {
    const ensureHttp = read(pluginRoot, 'scripts/ensure-http-mcp.sh');
    const startHttp = read(pluginRoot, 'scripts/start-http-mcp.sh');
    expect(ensureHttp).toContain('CODESPACE_MEMORY_LIFECYCLE_MODE');
    expect(ensureHttp).toContain('CODESPACE_AGENT_CORE_MEMORY_LEASE_URL');
    expect(startHttp).toContain('CODESPACE_MEMORY_LIFECYCLE_MODE');
    expect(startHttp).toContain('CODESPACE_AGENT_CORE_MEMORY_LEASE_URL');
    expect(startHttp).toContain('unset GITHUB_TOKEN');
    expect(startHttp).toContain('unset AGENT_CORE_MEMORY_REMOTE_KEY_HEX');
    expect(startHttp).toContain('unset AGENT_CORE_MEMORY_REMOTE_KEY_FILE');
    expect(startHttp).toContain('unset AGENT_CORE_GITHUB_TOKEN_FILE');
    expect(startHttp).toContain('unset AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE');
    expect(startHttp).toContain('unset CLOUDFLARE_API_TOKEN');
    const startup = read(pluginRoot, 'scripts/ensure-running.sh');
    expect(startup).toContain('unset GITHUB_TOKEN GH_TOKEN');
    expect(startup).toContain('unset AGENT_CORE_MEMORY_REMOTE_KEY_HEX AGENT_CORE_MEMORY_REMOTE_KEY_FILE');
    expect(startup.indexOf('memory-lifecycle-preflight.sh')).toBeLessThan(startup.indexOf('unset GITHUB_TOKEN GH_TOKEN'));
  });

  it('keeps the managed Agent Core and bridge on the same configured lifecycle mode', () => {
    const rootLauncher = read(repoRoot, 'scripts/codespace/start-agent-core.sh');
    const rootEnsure = read(repoRoot, 'scripts/codespace/ensure-running.sh');
    expect(rootLauncher).toContain('AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE');
    expect(rootEnsure).toContain('CODESPACE_MEMORY_LIFECYCLE_MODE=');
    expect(rootEnsure).toContain('AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE');
    expect(rootEnsure).toContain('plugin/codespace/scripts/ensure-running.sh');
  });

  it('does not introduce any .vscode mutation into Phase-7 lifecycle scripts', () => {
    for (const relative of [
      'scripts/ensure-running.sh',
      'scripts/ensure-http-mcp.sh',
      'scripts/start-http-mcp.sh',
      'scripts/memory-lifecycle-preflight.sh',
    ]) {
      expect(read(pluginRoot, relative)).not.toContain('.vscode');
    }
  });
});
