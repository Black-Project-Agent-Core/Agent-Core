import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readOptional = (relativePath: string) => {
  const filePath = path.join(pluginRoot, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
};

const startup = readOptional('scripts/ensure-running.sh');
const reconciliation = readOptional('scripts/runtime-reconciliation.sh');
const ensureHttp = readOptional('scripts/ensure-http-mcp.sh');
const startHttp = readOptional('scripts/start-http-mcp.sh');

describe('codespace managed Streamable HTTP lifecycle contract', () => {
  it('owns loopback HTTP MCP supervisor scripts that never expose credentials or inherit lifecycle locks', () => {
    expect(ensureHttp).not.toBe('');
    expect(startHttp).not.toBe('');
    expect(ensureHttp).toContain('codespace-mcp-http');
    expect(ensureHttp).toContain('127.0.0.1');
    expect(ensureHttp).toContain('dist/http-probe.js');
    expect(startHttp).toContain('exec 9>&-');
    expect(startHttp).toContain('unset CONTROL_PLANE_API_KEY');
    expect(startHttp).toContain('exec node "$ROOT/dist/http-server.js"');
  });

  it('restarts a protocol-healthy server when compiled output is newer than its URL state', () => {
    expect(ensureHttp).toContain('build_is_current');
    expect(ensureHttp).toContain('find "$ROOT/dist" -type f -newer "$URL_FILE"');
    expect(ensureHttp).toContain('health_ok && url_file_matches && lifecycle_config_matches && build_is_current && protocol_ok');
  });

  it('probes the local MCP protocol before invoking managed runtime reconciliation', () => {
    const ensureIndex = startup.indexOf('ensure-http-mcp.sh');
    const reconcileIndex = startup.indexOf('runtime-reconciliation.sh');
    const stopIndex = reconciliation.indexOf('runtimes stop "$alias_name"');
    const connectIndex = reconciliation.indexOf('runtimes connect');
    expect(ensureIndex).toBeGreaterThanOrEqual(0);
    expect(reconcileIndex).toBeGreaterThan(ensureIndex);
    expect(stopIndex).toBeGreaterThanOrEqual(0);
    expect(connectIndex).toBeGreaterThan(stopIndex);
    expect(startup).toContain('MCP_SERVER_URL');
    expect(startup).toContain('dist/http-probe.js');
  });

  it('connects tunnel-client to a loopback HTTP MCP URL instead of readiness-blind stdio', () => {
    expect(reconciliation).toContain('--mcp-server-url "$mcp_server_url"');
    expect(reconciliation).not.toContain('--mcp-command');
    expect(reconciliation).toContain('payload.process.target_kind === "server_url"');
    expect(reconciliation).toContain('payload.process.target_value === process.env.EXPECTED_MCP_SERVER_URL');
  });

  it('treats all compiled HTTP lifecycle entrypoints as rebuild requirements', () => {
    expect(startup).toContain('$ROOT/dist/http-server.js');
    expect(startup).toContain('$ROOT/dist/http-probe.js');
  });
});
