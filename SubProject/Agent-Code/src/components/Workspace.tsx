import type { LocalSession } from '../app/workspace-state';
import { Composer } from './Composer';
import { BrandMark } from './BrandMark';

export type WorkspaceProps = {
  session: LocalSession;
  onSubmit(text: string): void;
};

export function Workspace({ session, onSubmit }: WorkspaceProps) {
  const hasMessages = session.messages.length > 0;

  return (
    <section className="workspace" aria-label="Coding workspace">
      <div className="workspace-content">
        {!hasMessages ? (
          <div className="welcome-state">
            <BrandMark variant="monogram" className="welcome-brand-mark" />
            <h1>What are we building?</h1>
          </div>
        ) : (
          <div className="conversation-preview" aria-label="Local conversation" aria-live="polite">
            {session.messages.map((message) => (
              <p key={message.id} className="local-message" data-testid="local-message">
                {message.text}
              </p>
            ))}
          </div>
        )}
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
