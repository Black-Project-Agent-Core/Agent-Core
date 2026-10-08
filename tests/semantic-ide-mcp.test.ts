import { describe, expect, it } from 'vitest';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';

function registered(runtime: Record<string, unknown>) {
  const server = createAgentCoreMcpServer(undefined, runtime as any);
  return (server as any)._registeredTools as Record<string, { description?: string }>;
}

describe('Semantic IDE MCP surface', () => {
  it('adds exactly code_symbol and code_refactor to the current production contract', () => {
    const dummy = {};
    const base = registered({
      memoryService: dummy,
      learningService: dummy,
      phoneController: { enabled: true },
      codeIntelligence: dummy,
    });
    const tools = registered({
      memoryService: dummy,
      learningService: dummy,
      semanticIde: dummy,
      phoneController: { enabled: true },
      codeIntelligence: dummy,
    });
    const baseNames = new Set(Object.keys(base));
    const names = Object.keys(tools);
    const added = names.filter(name => !baseNames.has(name)).sort();
    expect(added).toEqual(['code_refactor', 'code_symbol']);
    expect(names).toHaveLength(baseNames.size + 2);
    expect(names).toContain('read_file');
    expect(names).toContain('memory_search');
    expect(names).not.toContain('partner');
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
