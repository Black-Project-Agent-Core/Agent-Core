import { AppShell } from '../components/AppShell';
import { Sidebar } from '../components/Sidebar';
import { Workspace } from '../components/Workspace';
import { createInitialWorkspaceState } from './workspace-state';

export function AgentCodeApp() {
  const state = createInitialWorkspaceState();
  const activeSession = state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0];

  return (
    <AppShell
      collapsed={state.sidebarCollapsed}
      sidebar={(
        <Sidebar
          sessions={state.sessions}
          activeSessionId={state.activeSessionId}
          collapsed={state.sidebarCollapsed}
          onNewSession={() => undefined}
          onSelectSession={() => undefined}
          onToggleCollapse={() => undefined}
        />
      )}
      workspace={<Workspace session={activeSession} onSubmit={() => undefined} />}
    />
  );
}
