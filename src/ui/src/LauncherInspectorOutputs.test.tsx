import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LauncherInspector } from './LauncherInspector';
import type { AgentChatUiState, TaskChanges, TaskChangesApplied } from './host';

const hook = vi.hoisted(() => ({ value: { data: undefined, state: 'idle', error: undefined, reload: () => {} } as { data?: unknown; state: string; error?: string; reload: () => void } }));
vi.mock('./useTaskChanges', () => ({ useTaskChanges: () => hook.value }));
vi.mock('./host', async importOriginal => ({ ...(await importOriginal<typeof import('./host')>()), postHost: vi.fn() }));

const applied = (path: string, state: TaskChangesApplied['state'], additions: number | null = 1, deletions: number | null = 1): TaskChangesApplied => ({
  path, state, attribution: 'checkpoint-baseline', checkpointIds: [], invocationIds: [], otherCheckpointTasks: [],
  before: { exists: true, size: 10 }, after: { exists: true, size: 12 }, diff: { state: 'text', additions, deletions },
});
const changes = (items: TaskChangesApplied[], external: TaskChanges['external']['items'] = []): TaskChanges => ({
  taskId: 'task-1', generatedAt: '2026-10-30T10:00:00.000Z', checkpointCount: 1, requests: [],
  applied: { unchanged: 0, truncated: false, items }, external: { state: 'ok', truncated: false, total: external.length, items: external },
} as TaskChanges);

const chatWithTurn = (withTurn = true) => ({
  conversations: [], modelChoice: '', providers: [],
  active: { conversation: { id: 'c1' }, messages: [], steps: [],
    turns: withTurn ? [{ id: 't1', conversationId: 'c1', clientRequestId: 'r1', runtimeTaskId: 'task-1', status: 'finalized', createdAtMs: 1, model: 'm', memoryUse: [{}, {}] }] : [] },
}) as unknown as AgentChatUiState;

const outputs = (chat = chatWithTurn()) => {
  render(<LauncherInspector chat={chat} logs={[]} open onToggle={vi.fn()}/>);
  return within(screen.getByText('Outputs').closest('details') as HTMLElement);
};

beforeEach(() => { hook.value = { data: undefined, state: 'idle', error: undefined, reload: () => {} }; });

describe('Inspector Outputs card', () => {
  it('lists applied then Git-only files once, with name, folder, state and diff counts', () => {
    hook.value = { ...hook.value, state: 'ready', data: changes(
      [applied('src/a.ts', 'modified'), applied('src/b.ts', 'added', 5, 0)],
      [{ path: 'src/a.ts', state: 'modified', binary: false, additions: 9, deletions: 9, modifiedAfterTaskStart: true, attribution: 'unattributed' },
        { path: 'shell.txt', state: 'untracked', binary: null, additions: null, deletions: null, modifiedAfterTaskStart: true, attribution: 'unattributed' }]) };
    const card = outputs();
    expect(card.getByText('Outputs (3)')).toBeInTheDocument();
    expect(card.getAllByText('a.ts')).toHaveLength(1);
    expect(card.getAllByText('src/')).toHaveLength(2);
    expect(card.getByText('+1')).toBeInTheDocument();
    expect(card.getByText('+5')).toBeInTheDocument();
    expect(card.getByText('untracked')).toBeInTheDocument();
    expect(card.getByText('Memory records used').nextSibling).toHaveTextContent('2');
  });

  it('shows at most eight rows and counts the rest', () => {
    hook.value = { ...hook.value, state: 'ready', data: changes(Array.from({ length: 10 }, (_, i) => applied(`src/file${i}.ts`, 'modified'))) };
    const card = outputs();
    expect(card.getByText('Outputs (10)')).toBeInTheDocument();
    expect(card.getAllByRole('listitem')).toHaveLength(8);
    expect(card.getByText('2 more')).toBeInTheDocument();
  });

  it('explains the no-turn, loading, empty and error states', () => {
    expect(outputs(chatWithTurn(false)).getByText('Select a conversation to see its outputs.')).toBeInTheDocument();
    for (const [state, error, text] of [['loading', undefined, 'Reading task changes…'], ['ready', undefined, 'No file changes recorded for this task.'], ['error', 'TASK_CHANGES_UNAVAILABLE', 'TASK_CHANGES_UNAVAILABLE']] as const) {
      hook.value = { ...hook.value, state, error, data: state === 'ready' ? changes([]) : undefined };
      const view = render(<LauncherInspector chat={chatWithTurn()} logs={[]} open onToggle={vi.fn()}/>);
      expect(view.getByText(text)).toBeInTheDocument();
      view.unmount();
    }
  });
});
