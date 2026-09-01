import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const startup = readFileSync(path.join(pluginRoot, 'scripts', 'ensure-running.sh'), 'utf8');
const reconciliation = readFileSync(path.join(pluginRoot, 'scripts', 'runtime-reconciliation.sh'), 'utf8');
const defaults = JSON.parse(readFileSync(path.join(pluginRoot, 'config', 'tunnel.defaults.json'), 'utf8')) as { tunnelId?: string };

describe('codespace restart self-recovery contract', () => {
  it('uses the persistent repository-local runtime credential as a fallback when lifecycle env injection is absent', () => {
    expect(startup).toContain('RUNTIME_API_KEY_FILE="$REPO_ROOT/secrets/github/CONTROL_PLANE_API_KEY"');
    expect(startup).toContain('RUNTIME_API_KEY_REF="file:$RUNTIME_API_KEY_FILE"');
    expect(reconciliation).toContain('--runtime-api-key "$runtime_api_key_ref"');
  });

  it('ships a tracked non-secret tunnel identity so an empty runtime directory can be reconstructed', () => {
    expect(defaults.tunnelId).toMatch(/^tunnel_[A-Za-z0-9_-]+$/);
    expect(startup).toContain('TRACKED_TUNNEL_ID');
    expect(startup).toContain('config/tunnel.defaults.json');
    expect(startup).toContain('TUNNEL_SOURCE="config/tunnel.defaults.json"');
    expect(startup).toContain('TUNNEL_ID="$TRACKED_TUNNEL_ID"');
    expect(startup).toContain('unset CODESPACE_TUNNEL_ID CONTROL_PLANE_TUNNEL_ID');
    expect(startup).not.toContain('env:CONTROL_PLANE_TUNNEL_ID (legacy fallback)');
    expect(startup).not.toContain('TUNNEL_ID="${CODESPACE_TUNNEL_ID:-}"');
  });

  it('keeps stdio, HTTP MCP, and watchdog children isolated from the control-plane credential', () => {
    const stdioStartup = readFileSync(path.join(pluginRoot, 'scripts', 'start-mcp.sh'), 'utf8');
    const httpStartup = readFileSync(path.join(pluginRoot, 'scripts', 'start-http-mcp.sh'), 'utf8');
    const watchdogStartup = readFileSync(path.join(pluginRoot, 'scripts', 'start-watchdog.sh'), 'utf8');
    for (const script of [stdioStartup, httpStartup, watchdogStartup]) {
      for (const key of [
        'CONTROL_PLANE_API_KEY', 'OPENAI_ADMIN_KEY', 'GITHUB_TOKEN', 'GH_TOKEN',
        'AGENT_CORE_GITHUB_TOKEN_FILE', 'AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE',
        'AGENT_CORE_MEMORY_REMOTE_KEY_HEX', 'AGENT_CORE_MEMORY_REMOTE_KEY_FILE',
        'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_WRANGLER_OAUTH_CONFIG_B64',
      ]) expect(script).toContain(`unset ${key}`);
    }
  });
});
