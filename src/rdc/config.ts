import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePortableProjectPath, resolveProjectRoot } from '../portability/paths.js';

const MODULE_PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECT_ROOT = resolveProjectRoot(process.env, MODULE_PROJECT_ROOT);

export const CONFIG_DIR = resolvePortableProjectPath(
  PROJECT_ROOT,
  process.env.AGENT_CORE_RDC_CONFIG_DIR,
  path.join('runtime', 'rdc'),
);
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const TOOL_CALL_FILE = path.join(CONFIG_DIR, 'claude_tool_call.log');
export const TOOL_CALL_FILE_MAX_SIZE = 10 * 1024 * 1024;
export const DEFAULT_COMMAND_TIMEOUT = 1000;
