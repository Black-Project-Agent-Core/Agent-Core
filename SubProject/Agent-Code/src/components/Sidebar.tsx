import {
  Folder,
  KeyRound,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from 'lucide-react';
import type { LocalSession } from '../app/workspace-state';
import { BrandMark } from './BrandMark';

export type SidebarProps = {
  sessions: LocalSession[];
  activeSessionId: string;
  collapsed: boolean;
  onNewSession(): void;
  onSelectSession(sessionId: string): void;
  onToggleCollapse(): void;
  onOpenVault(): void;
  vaultActive: boolean;
};

export function Sidebar({
  sessions,
  activeSessionId,
  collapsed,
  onNewSession,
  onSelectSession,
  onToggleCollapse,
  onOpenVault,
  vaultActive,
}: SidebarProps) {
  return (
    <nav
      aria-label="Agent Code workspace"
      className="sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="sidebar-brand-row">
        <div className="sidebar-brand-text" aria-label="Agent Code brand">
          <BrandMark variant="app" className="sidebar-brand-mark" />
          <span className="sidebar-label">Agent Code</span>
        </div>
        <button
          type="button"
          className="icon-button sidebar-collapse"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <button type="button" className="new-session-button" onClick={onNewSession} aria-label="New session">
        <Plus size={16} strokeWidth={1.8} />
        <span className="sidebar-label">New</span>
      </button>

      <div className="sidebar-section">
        <p className="sidebar-section-label sidebar-label">PROJECTS</p>
        <button type="button" className="sidebar-row project-row" aria-label="Agent Code project">
          <Folder size={15} strokeWidth={1.7} />
          <span className="sidebar-label">Agent Code</span>
        </button>
      </div>

      <div className="sidebar-section">
        <p className="sidebar-section-label sidebar-label">LOCAL</p>
        <button
          type="button"
          className="sidebar-row vault-row"
          aria-label="API Keys"
          aria-current={vaultActive ? 'page' : undefined}
          onClick={onOpenVault}
        >
          <KeyRound size={15} strokeWidth={1.7} />
          <span className="sidebar-label">API Keys</span>
        </button>
      </div>

      <div className="sidebar-section sidebar-recents">
        <p className="sidebar-section-label sidebar-label">RECENT</p>
        <div className="sidebar-list">
          {sessions.map((session) => {
            const selected = session.id === activeSessionId;
            return (
              <button
                type="button"
                key={session.id}
                className="sidebar-row session-row"
                aria-current={selected ? 'page' : undefined}
                aria-label={selected ? `${session.title}, selected` : session.title}
                onClick={() => onSelectSession(session.id)}
              >
                <MessageSquare size={14} strokeWidth={1.7} />
                <span className="sidebar-label session-title">{session.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
