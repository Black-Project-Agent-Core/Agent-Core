import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, statSync } from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveModuleProjectRoot } from '../portability/paths.js';

const root = resolveModuleProjectRoot(import.meta.url);
let requested: Promise<{ pid: number; logPath: string }> | undefined;

async function launchOnce() {
  if (process.platform !== 'win32') throw new Error('RESTART_WINDOWS_ONLY');
  for (const file of ['Restart-Agent-Core.cmd', 'Agent Core.exe', 'dist/index.js',
    'scripts/windows/Invoke-Agent-Core-Restart.ps1', 'scripts/windows/Restart-Agent-Core.ps1']) {
    if (!statSync(path.join(root, file)).isFile()) throw new Error('RESTART_FILE_UNAVAILABLE: ' + file);
  }
  const directory = path.join(root, 'runtime', 'restart');
  mkdirSync(directory, { recursive: true });
  const logPath = path.join(directory, 'mcp-' + randomUUID() + '.log');
  const output = openSync(logPath, 'wx');
  try {
    // The existing Scheduled Task escapes launcher ownership; detaching this requester alone does not.
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'Restart-Agent-Core.cmd'], {
      cwd: root, windowsHide: true, detached: true, stdio: ['ignore', output, output],
    });
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('spawn', resolve);
    });
    child.unref();
    return { pid: child.pid!, logPath };
  } finally {
    // Closing the parent's duplicate descriptor must not turn a started restart into a retryable failure.
    try { closeSync(output); } catch { /* Child owns its inherited descriptors. */ }
  }
}

export async function requestAgentCoreRestart(capabilitiesChanged: boolean) {
  const alreadyRequested = Boolean(requested);
  // One request per resident; a lost response or unknown script outcome must not launch another restart.
  requested ??= launchOnce().catch(error => { requested = undefined; throw error; });
  const launch = await requested;
  return {
    status: 'requested', alreadyRequested, completed: false, ...launch,
    scriptPath: path.join(root, 'Restart-Agent-Core.cmd'),
    refreshToolsRequired: capabilitiesChanged,
    next: capabilitiesChanged
      ? 'After Agent Core returns, use browser use: https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6ad1239cdf308191a3ccb8ba0cd49503 → scroll down; if Refresh tools is not visible, scroll down again → click the visible Refresh tools text. Reconnect, read/acknowledge AGENTS.md and verify discovery. Do not restart again for cached tools.'
      : 'After Agent Core returns: reconnect and read/acknowledge AGENTS.md again. No Refresh tools is required for an ordinary build without exposed tool/skill/capability/plugin changes.',
    evidence: 'Request started, not proof of restart completion or Core/tunnel health. If disconnected or uncertain, inspect this log and runtime/restart receipts; never blindly repeat the CMD.',
  };
}

export function registerRestartTool(server: McpServer) {
  server.registerTool('restart_agent_core', {
    description: 'After successful build, restart once. capabilitiesChanged=true requires browser use → https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6ad1239cdf308191a3ccb8ba0cd49503 → scroll down until Refresh tools is visible → click it. Unknown/disconnect: inspect runtime/restart; never retry blindly. Request is not health proof.',
    inputSchema: z.strictObject({ capabilitiesChanged: z.boolean() }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async args => {
    try { return { content: [{ type: 'text' as const, text: JSON.stringify(await requestAgentCoreRestart(args.capabilitiesChanged)) }] }; }
    catch (error) { return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'RESTART_REQUEST_FAILED' }] }; }
  });
}
