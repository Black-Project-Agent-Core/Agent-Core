import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BRIDGE_NAME = 'codespace';
export const BRIDGE_VERSION = '0.1.0';
export const WORKSPACES_ROOT = '/workspaces';
export const MAX_TEXT_BYTES = 5 * 1024 * 1024;
export const MAX_COMMAND_OUTPUT_BYTES = 2 * 1024 * 1024;

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(sourceDir, '..');
export const RUNTIME_DIR = path.join(PACKAGE_ROOT, 'runtime');

const SECRET_ENV_KEYS = new Set([
  'CONTROL_PLANE_API_KEY',
  'OPENAI_ADMIN_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'AGENT_CORE_GITHUB_TOKEN_FILE',
  'AGENT_CORE_GITHUB_PACKAGES_TOKEN_FILE',
  'AGENT_CORE_GITHUB_PACKAGES_TOKEN',
  'AGENT_CORE_MEMORY_REMOTE_KEY_HEX',
  'AGENT_CORE_MEMORY_REMOTE_KEY_FILE',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_WRANGLER_OAUTH_CONFIG_B64',
  'CODESPACE_MEMORY_CONTEXT_LEASE',
  'AGENT_CORE_MEMORY_CONTEXT_LEASE',
]);

export function clearSecretEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of SECRET_ENV_KEYS) delete env[key];
}

export function sanitizeEnvironment(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !SECRET_ENV_KEYS.has(key)),
  );
}
