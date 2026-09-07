import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useReducer, useState } from 'react';
import { AppCloseDialog } from '../components/AppCloseDialog';
import { AppShell } from '../components/AppShell';
import { Sidebar } from '../components/Sidebar';
import { Workspace } from '../components/Workspace';
import { createInitialWorkspaceState, workspaceReducer } from './workspace-state';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function AgentCodeApp() {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, createInitialWorkspaceState);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeAction, setCloseAction] = useState<'hide' | 'close' | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const activeSession = state.sessions.find((session) => session.id === state.activeSessionId) ?? state.sessions[0];

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen('agent-code://close-requested', () => {
      setCloseError(null);
      setCloseDialogOpen(true);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!closeDialogOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeAction === null) setCloseDialogOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeAction, closeDialogOpen]);

  const hideToTray = async () => {
    setCloseAction('hide');
    setCloseError(null);
    try {
      await invoke('app_hide_to_tray');
      setCloseDialogOpen(false);
    } catch (error) {
      setCloseError(errorMessage(error));
    } finally {
      setCloseAction(null);
    }
  };

  const closeCompletely = async () => {
    setCloseAction('close');
    setCloseError(null);
    try {
      await invoke('app_close_completely');
      setCloseDialogOpen(false);
    } catch (error) {
      setCloseError(errorMessage(error));
      setCloseAction(null);
    }
  };

  return (
    <>
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
      <AppCloseDialog
        busyAction={closeAction}
        error={closeError}
        onCancel={() => setCloseDialogOpen(false)}
        onCloseCompletely={() => void closeCompletely()}
        onHideToTray={() => void hideToTray()}
        open={closeDialogOpen}
      />
    </>
  );
}