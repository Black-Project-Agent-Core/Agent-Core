import { describe, expect, it } from 'vitest';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { toolArgSchemas } from '../src/rdc/tools/schemas.js';

const RDC_LOCAL_TOOLS = [
  'get_config', 'set_config_value', 'read_file', 'read_multiple_files',
  'write_file', 'write_pdf', 'create_directory', 'list_directory', 'move_file',
  'file_checkpoint', 'browser_control',
  'start_search', 'get_more_search_results', 'stop_search', 'list_searches',
  'get_file_info', 'edit_block', 'start_process', 'read_process_output',
  'interact_with_process', 'force_terminate', 'list_sessions', 'list_processes',
  'kill_process', 'get_usage_stats', 'get_recent_tool_calls',
  'give_feedback_to_desktop_commander', 'get_prompts',
] as const;

const MEMORY_TOOLS = [
  'memory_list', 'memory_page', 'memory_read', 'memory_search', 'memory_retrieval_diagnostics',
  'memory_export', 'memory_import', 'memory_remember', 'memory_update', 'memory_delete',
  'memory_batch', 'memory_feedback', 'memory_retirement_review', 'memory_status', 'memory_reindex',
  'memory_evolve', 'memory_consolidate',
] as const;

const runtimeStub = {
  memoryService: {} as any,
} as any;

describe('RDC local parity', () => {
  it('preserves all 28 RDC tools and adds memory tools as a separate capability set', () => {
    const server = createAgentCoreMcpServer({ id: 'parity', name: 'parity', authentication: 'bearer-api-key' } as any, runtimeStub);
    const registrations = (server as any)._registeredTools ?? (server as any).registeredTools;
    const names = registrations instanceof Map ? [...registrations.keys()] : Object.keys(registrations ?? {});
    expect(names).toHaveLength(RDC_LOCAL_TOOLS.length + MEMORY_TOOLS.length + 5);
    expect(names).toContain('controller_contract');
    expect(names).toContain('native_chat_bridge');
    expect(names).toContain('restart_agent_core');
    expect(names).toContain('image_inspect');
    expect(names).toContain('reconstruction_harness');
    expect(RDC_LOCAL_TOOLS.every((name) => names.includes(name))).toBe(true);
    expect(MEMORY_TOOLS.every((name) => names.includes(name))).toBe(true);
    expect(names.includes('capability_route')).toBe(false);
  });
  it('keeps RDC schema dispatch metadata aligned with the public RDC tool surface', () => {
    expect(Object.keys(toolArgSchemas).sort()).toEqual([...RDC_LOCAL_TOOLS].sort());
  });
});
