export type LocalMessage = {
  id: string;
  role: 'user';
  text: string;
};

export type LocalSession = {
  id: string;
  title: string;
  messages: LocalMessage[];
};

export type WorkspaceState = {
  projectName: 'Agent Code';
  sessions: LocalSession[];
  activeSessionId: string;
  sidebarCollapsed: boolean;
  nextSessionNumber: number;
  nextMessageNumber: number;
};

export type WorkspaceAction =
  | { type: 'new-session' }
  | { type: 'select-session'; sessionId: string }
  | { type: 'submit-message'; text: string }
  | { type: 'toggle-sidebar' };

export function createInitialWorkspaceState(): WorkspaceState {
  return {
    projectName: 'Agent Code',
    sessions: [
      { id: 'session-1', title: 'General coding session', messages: [] },
      { id: 'session-2', title: 'Design system review', messages: [] },
    ],
    activeSessionId: 'session-1',
    sidebarCollapsed: false,
    nextSessionNumber: 3,
    nextMessageNumber: 1,
  };
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'new-session': {
      const id = `session-${state.nextSessionNumber}`;
      const session: LocalSession = { id, title: 'New session', messages: [] };
      return {
        ...state,
        sessions: [...state.sessions, session],
        activeSessionId: id,
        nextSessionNumber: state.nextSessionNumber + 1,
      };
    }

    case 'select-session': {
      if (!state.sessions.some((session) => session.id === action.sessionId)) {
        return state;
      }
      if (state.activeSessionId === action.sessionId) {
        return state;
      }
      return { ...state, activeSessionId: action.sessionId };
    }

    case 'submit-message': {
      const text = action.text.trim();
      if (text.length === 0) {
        return state;
      }
      const message: LocalMessage = {
        id: `message-${state.nextMessageNumber}`,
        role: 'user',
        text,
      };
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === state.activeSessionId
            ? { ...session, messages: [...session.messages, message] }
            : session,
        ),
        nextMessageNumber: state.nextMessageNumber + 1,
      };
    }

    case 'toggle-sidebar':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
  }
}
