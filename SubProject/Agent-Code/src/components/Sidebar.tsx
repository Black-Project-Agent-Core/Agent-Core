import { useState } from 'react';
import {
  ChevronDown,
  Folder,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from 'lucide-react';
import type { LocalSession } from '../app/workspace-state';
import { AgentCorePanel } from './AgentCorePanel';
import { BrandMark } from './BrandMark';

export type SidebarProps = {
  sessions: LocalSession[];
  activeSessionId: string;
  collapsed: boolean;
  onNewSession(): void;
  onSelectSession(sessionId: string): void;
  onToggleCollapse(): void;
};

export function Sidebar({
  sessions,
  activeSessionId,
  collapsed,
  onNewSession,
  onSelectSession,
  onToggleCollapse,
}: SidebarProps) {
  const [recentsExpanded, setRecentsExpanded] = useState(true);
  const visibleSessions = recentsExpanded
    ? sessions
    : sessions.filter((session) => session.id === activeSessionId);

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

      <div className="sidebar-section sidebar-recents">
        <button
          type="button"
          className="sidebar-section-toggle"
          aria-expanded={recentsExpanded}
          aria-controls="recent-session-list"
          aria-label={recentsExpanded ? 'Collapse recent conversations' : 'Expand recent conversations'}
          onClick={() => setRecentsExpanded((expanded) => !expanded)}
        >
          <span className="sidebar-label">RECENT</span>
          <ChevronDown
            aria-hidden="true"
            className="sidebar-section-chevron"
            data-expanded={recentsExpanded ? 'true' : 'false'}
            size={12}
            strokeWidth={1.8}
          />
        </button>
        <div className="sidebar-list" id="recent-session-list">
          {visibleSessions.map((session) => {
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

      <AgentCorePanel />
    </nav>
  );
}
