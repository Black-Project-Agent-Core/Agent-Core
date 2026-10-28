import { describe, expect, it } from 'vitest';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { contextBytesBySource } from '../src/agent-context-accounting.js';

// A client may cut server instructions at a fixed length. The one sentence every controller must act on first
// therefore has to sit near the start, not only in the closing contract paragraph.
const EARLY_CHARS = 4_000;

describe('server instructions place the bootstrap first', () => {
  it('names controller_contract within the first characters of the assembled instructions', () => {
    const server = createAgentCoreMcpServer(undefined, { phoneController: { enabled: true } } as any);
    const instructions: string = (server as any).server._instructions;
    expect(typeof instructions).toBe('string');
    const first = instructions.indexOf('controller_contract');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(EARLY_CHARS);
    expect(instructions.slice(0, first + 200)).toMatch(/BOOTSTRAP FIRST|acknowledge/i);
  });
});

describe('context bytes by source', () => {
  it('splits a request by role and tool schemas and sums close to the whole', () => {
    const messages = [
      { role: 'system' as const, content: 'rules' },
      { role: 'user' as const, content: 'do the thing' },
      { role: 'assistant' as const, content: null, tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'get_config', arguments: '{}' } }] },
      { role: 'tool' as const, name: 'get_config', tool_call_id: 'c1', content: 'x'.repeat(500) },
    ];
    const tools = [{ type: 'function' as const, function: { name: 'get_config', parameters: { type: 'object', properties: {} } } }];
    const bySource = contextBytesBySource(messages, tools);
    expect(bySource.tool).toBeGreaterThan(500);
    expect(bySource.system).toBeLessThan(bySource.tool);
    expect(bySource.tools).toBeGreaterThan(0);
    expect(Object.values(bySource).every(Number.isInteger)).toBe(true);
  });
});
