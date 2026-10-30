import { describe, expect, it } from 'vitest';
import { deriveActivity } from './activityPhase';
import type { AgentChatEvent, AgentChatStepMeta, AgentChatTurn } from './host';

const ev = (over: Partial<AgentChatEvent> & { type: string }): AgentChatEvent => ({ at: '2026-10-30T10:00:00.000Z', conversationId: 'c', turnId: 't', ...over });
const running = (event?: AgentChatEvent, steps: AgentChatStepMeta[] = []) => deriveActivity({ turnStatus: 'running', event, steps });
const settled = (turnStatus: AgentChatTurn['status'], errorCode?: string) => deriveActivity({ turnStatus, errorCode, steps: [] });
const toolState = (toolName: string, argsSummary?: string) => running(ev({ type: 'tool.started', toolName, argsSummary })).state;

describe('deriveActivity', () => {
  it('maps a settled turn to one state and keeps the recovery code visible', () => {
    expect(settled('finalized').state).toBe('complete');
    expect(settled('failed', 'AGENT_RUNTIME_X')).toMatchObject({ state: 'error', description: 'AGENT_RUNTIME_X' });
    expect(settled('stopped')).toMatchObject({ state: 'error', title: 'Task stopped' });
    expect(settled('interrupted').title).toBe('Interrupted; no safe checkpoint');
    expect(settled('resumable', 'AGENT_CHAT_RESUME_X')).toMatchObject({ state: 'waiting', title: 'Paused — Continue required' });
    expect(settled('resumable', 'AGENT_CHAT_RESUME_X').description).toContain('(AGENT_CHAT_RESUME_X)');
    expect(settled('resumable', 'AGENT_CHAT_TURN_RESUMABLE').description).not.toContain('AGENT_CHAT_TURN_RESUMABLE');
    expect(settled('resumable', 'AGENT_RUNTIME_CONTINUATION_PROVIDER_WAIT')).toMatchObject({ state: 'waiting', title: 'Waiting for an eligible provider' });
  });

  it('maps each Native tool to its activity state', () => {
    const table: Array<[string, string | undefined, string]> = [
      ['read_file', 'path="a.ts"', 'reading'], ['read_file', 'path="logo.PNG"', 'viewing_image'], ['start_search', undefined, 'reading'],
      ['image_inspect', undefined, 'analyzing_image'], ['skills', undefined, 'using_skill'], ['web_search', undefined, 'web_search'],
      ['web_open', undefined, 'browsing'], ['memory_search', undefined, 'memory_search'], ['memory_remember', undefined, 'memory_write'],
      ['start_process', 'npm run build', 'command'], ['start_process', 'node vitest run x', 'testing'],
      ['write_file', 'path="a.ts"', 'coding'], ['write_file', 'path="notes.md"', 'creating'], ['edit_block', undefined, 'editing'],
      ['write_pdf', undefined, 'exporting'], ['code_graph', undefined, 'data_analysis'], ['mystery_tool', undefined, 'using_tool'],
    ];
    for (const [name, args, state] of table) expect(toolState(name, args), `${name} ${args ?? ''}`).toBe(state);
  });

  it('derives the state of a running turn from its latest event and narration', () => {
    expect(running().state).toBe('thinking');
    expect(running(ev({ type: 'memory.recall.started' })).state).toBe('memory_search');
    expect(running(ev({ type: 'agent.planning' })).state).toBe('planning');
    expect(running(ev({ type: 'verification.started' })).state).toBe('verifying');
    expect(running(ev({ type: 'provider.route.changed' })).state).toBe('retrying');
    expect(running(ev({ type: 'provider.waiting' })).state).toBe('waiting');
    expect(running(ev({ type: 'tool.started', toolName: 'read_file', argsSummary: 'path="a.ts"' })).description).toBe('path="a.ts"');
    expect(running(ev({ type: 'tool.completed', toolName: 'read_file', success: true, resultSummary: 'read 3 lines' })))
      .toMatchObject({ state: 'thinking', description: 'read_file finished: read 3 lines' });
    expect(running(ev({ type: 'tool.completed', toolName: 'start_search', success: false, resultSummary: 'boom' })))
      .toMatchObject({ state: 'debugging', description: 'start_search failed: boom' });
    expect(running(ev({ type: 'assistant.progress', text: 'Saya cek dulu.' })).description).toBe('Saya cek dulu.');
    const note: AgentChatStepMeta = { turnId: 't', seq: 1, kind: 'note', toolName: '', status: 'ok', startedAtMs: 0, resultSummary: 'Narasi terakhir.' };
    const tool: AgentChatStepMeta = { turnId: 't', seq: 2, toolName: 'read_file', status: 'ok', startedAtMs: 0 };
    expect(running(ev({ type: 'turn.accepted' }), [note, tool])).toMatchObject({ state: 'thinking', description: 'Narasi terakhir.', stepCount: 1 });
  });
});
