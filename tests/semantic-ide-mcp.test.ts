import { describe, expect, it } from 'vitest';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';

function registered(runtime: Record<string, unknown>) {
  const server = createAgentCoreMcpServer(undefined, runtime as any);
  return (server as any)._registeredTools as Record<string, { description?: string }>;
}

describe('Semantic IDE MCP surface', () => {
  it('adds exactly code_symbol and code_refactor to the current production contract', () => {
    const dummy = {};
    const tools = registered({
      memoryService: dummy,
      learningService: dummy,
      hermesPartner: dummy,
      semanticIde: dummy,
      phoneController: { enabled: true },
      codeIntelligence: dummy,
    });
    const names = Object.keys(tools);
    expect(names).toHaveLength(62);
    expect(names).toContain('code_symbol');
    expect(names).toContain('code_refactor');
    expect(names).toContain('read_file');
    expect(names).toContain('memory_search');
    expect(names).toContain('partner');
    expect(names).toContain('code_workspace');
  });
  it('keeps Serena generic tool families out of the public surface', () => {
    const tools = registered({ semanticIde: {} });
    const names = Object.keys(tools);
    for (const forbidden of [
      'serena_memory',
      'serena_shell',
      'serena_repl',
      'serena_file',
      'serena_dashboard',
    ]) {
      expect(names).not.toContain(forbidden);
    }
    expect(names.filter(name => name.startsWith('code_')).sort())
      .toEqual(['code_refactor', 'code_symbol']);
  });

  it('describes Semantic IDE as a sibling semantic provider rather than an execution gate', () => {
    const tools = registered({ semanticIde: {} });
    expect(tools.code_symbol?.description).toMatch(/semantic|language-server|LSP/i);
    expect(tools.code_refactor?.description).toMatch(/semantic|language-server|LSP/i);
  });
});
