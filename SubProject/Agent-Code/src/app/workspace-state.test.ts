import { describe, expect, it } from 'vitest';
import { createInitialWorkspaceState, workspaceReducer } from './workspace-state';

describe('workspaceReducer', () => {
  it('creates and selects a fresh local session', () => {
    const state = createInitialWorkspaceState();
    const next = workspaceReducer(state, { type: 'new-session' });
    expect(next.sessions).toHaveLength(3);
    expect(next.activeSessionId).toBe('session-3');
    expect(next.sessions[2].title).toBe('New session');
  });

  it('ignores whitespace-only submission', () => {
    const state = createInitialWorkspaceState();
    const next = workspaceReducer(state, { type: 'submit-message', text: '   ' });
    expect(next).toEqual(state);
  });

  it('appends only a local user message to the active session', () => {
    const state = createInitialWorkspaceState();
    const next = workspaceReducer(state, { type: 'submit-message', text: 'Build a parser' });
    expect(next.sessions[0].messages).toEqual([
      { id: 'message-1', role: 'user', text: 'Build a parser' },
    ]);
  });

  it('toggles sidebar collapse deterministically', () => {
    const state = createInitialWorkspaceState();
    expect(workspaceReducer(state, { type: 'toggle-sidebar' }).sidebarCollapsed).toBe(true);
  });
});
