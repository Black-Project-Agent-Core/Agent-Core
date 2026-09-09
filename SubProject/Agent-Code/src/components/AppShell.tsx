import type { ReactNode } from 'react';

export type AppShellProps = {
  sidebar: ReactNode;
  workspace: ReactNode;
  collapsed: boolean;
};

export function AppShell({ sidebar, workspace, collapsed }: AppShellProps) {
  return (
    <main
      role="application"
      aria-label="Agent Code"
      className="app-shell"
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
    >
      {sidebar}
      {workspace}
    </main>
  );
}
