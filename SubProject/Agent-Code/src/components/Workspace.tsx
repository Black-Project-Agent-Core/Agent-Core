import type { LocalSession } from '../app/workspace-state';
import { Composer } from './Composer';

export type WorkspaceProps = {
  session: LocalSession;
  onSubmit(text: string): void;
};

export function Workspace({ session, onSubmit }: WorkspaceProps) {
  return (
    <section className="workspace" aria-label="Coding workspace">
      <div className="workspace-content">
        <div className="welcome-state">
          <div className="welcome-symbol" aria-hidden="true">AC</div>
          <h1>What are we building?</h1>
        </div>

        {session.messages.length > 0 ? (
          <div className="conversation-preview" aria-label="Local conversation">
            {session.messages.map((message) => (
              <p key={message.id} className="local-message" data-testid="local-message">
                {message.text}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="workspace-composer-zone">
        <Composer onSubmit={onSubmit} />
        <div className="runtime-status" aria-label="Runtime status">
          <span>Local</span>
          <span className="status-dot" aria-hidden="true" />
          <span>Ready</span>
        </div>
      </div>
    </section>
  );
}
