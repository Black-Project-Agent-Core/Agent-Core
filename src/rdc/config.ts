import path from 'node:path';

export const CONFIG_DIR = path.resolve(
  process.env.AGENT_CORE_RDC_CONFIG_DIR?.trim() || path.join(process.cwd(), 'runtime', 'rdc'),
);
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const TOOL_CALL_FILE = path.join(CONFIG_DIR, 'claude_tool_call.log');
export const TOOL_CALL_FILE_MAX_SIZE = 10 * 1024 * 1024;
export const DEFAULT_COMMAND_TIMEOUT = 1000;
