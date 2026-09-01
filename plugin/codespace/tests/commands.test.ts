import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeCommand } from '../src/commands.js';

let base: string;
let root: string;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'codespace-command-'));
  root = path.join(base, 'repo');
  await fs.mkdir(root);
});

afterEach(async () => {
  for (const key of [
    'CONTROL_PLANE_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'AGENT_CORE_MEMORY_REMOTE_KEY_HEX',
    'AGENT_CORE_MEMORY_REMOTE_KEY_FILE', 'AGENT_CORE_GITHUB_TOKEN_FILE', 'AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE',
    'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_WRANGLER_OAUTH_CONFIG_B64',
  ]) delete process.env[key];
  await fs.rm(base, { recursive: true, force: true });
});

describe('sanitized foreground commands', () => {
  it('strips the tunnel runtime key', async () => {
    process.env.CONTROL_PLANE_API_KEY = 'do-not-leak';
    const result = await executeCommand(root, {
      command: 'printf %s "${CONTROL_PLANE_API_KEY-unset}"',
      timeoutMs: 5000,
    }, base);
    expect(result.stdout).toBe('unset');
  });

  it('strips root GitHub, Memory Remote, and Cloudflare credentials from child shells', async () => {
    const secretKeys = [
      'GITHUB_TOKEN', 'GH_TOKEN', 'AGENT_CORE_MEMORY_REMOTE_KEY_HEX', 'AGENT_CORE_MEMORY_REMOTE_KEY_FILE',
      'AGENT_CORE_GITHUB_TOKEN_FILE', 'AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE', 'CLOUDFLARE_API_TOKEN',
      'CLOUDFLARE_WRANGLER_OAUTH_CONFIG_B64',
    ];
    for (const key of secretKeys) process.env[key] = `secret-${key}`;
    const result = await executeCommand(root, {
      command: `env | grep -E '^(${secretKeys.join('|')})=' || true`,
      timeoutMs: 5000,
    }, base);
    expect(result.stdout).toBe('');
  });

  it('enforces cwd containment', async () => {
    await expect(executeCommand(root, { command: 'pwd', cwd: '..' }, base)).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_WORKSPACE',
    });
  });

  it('reports timeout', async () => {
    const result = await executeCommand(root, { command: 'sleep 2', timeoutMs: 50 }, base);
    expect(result.timedOut).toBe(true);
  });
});
