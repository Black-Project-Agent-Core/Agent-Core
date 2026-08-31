import { useReducer } from 'react';
import { AppShell } from '../components/AppShell';
import { Sidebar } from '../components/Sidebar';
import { Workspace } from '../components/Workspace';
import { createInitialWorkspaceState, workspaceReducer } from './workspace-state';

export function AgentCodeApp() {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, createInitialWorkspaceState);
  const activeSession = state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0];

  return (
    <AppShell
      collapsed={state.sidebarCollapsed}
      sidebar={(
        <Sidebar
          sessions={state.sessions}
          activeSessionId={state.activeSessionId}
          collapsed={state.sidebarCollapsed}
          onNewSession={() => dispatch({ type: 'new-session' })}
          onSelectSession={(sessionId) => dispatch({ type: 'select-session', sessionId })}
          onToggleCollapse={() => dispatch({ type: 'toggle-sidebar' })}
        />
      )}
      workspace={(
        <Workspace
          session={activeSession}
          onSubmit={(text) => dispatch({ type: 'submit-message', text })}
        />
      )}
    />
  );
}
