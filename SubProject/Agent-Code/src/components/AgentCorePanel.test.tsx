import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentCorePanel } from './AgentCorePanel';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

const runningStatus = {
  overall: 'Running',
  mcpServer: 'Running',
  memory: 'Healthy',
  execution: 'Healthy',
  tunnel: 'Running',
  autostart: false,
  legacyAutostart: false,
  legacyControllerDetected: false,
  nativeControlEnabled: true,
  desiredRunning: true,
  root: 'D:\\Games-kuyhAa\\Agent-Core',
};

describe('AgentCorePanel', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_core_control_status') {
        return Promise.resolve(runningStatus);
      }
      if (command === 'agent_core_open_folder' || command === 'agent_core_open_tunnel_admin') {
        return Promise.resolve();
      }
      return Promise.resolve({ ok: true, message: 'done', status: runningStatus });
    });
  });

  it('expands the Agent Core launcher controls in the sidebar', async () => {
    const user = userEvent.setup();
    render(<AgentCorePanel />);

    expect(screen.queryByText(/MCP Server:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Agent Core controls' }));

    expect(await screen.findByText('Agent Core', { selector: '.agent-core-status-primary span:first-child' })).toBeInTheDocument();
    expect(screen.getByText(/MCP Server: Running \| Memory: Healthy \| Execution: Healthy/)).toBeInTheDocument();
    expect(screen.getByText('Tunnel: Running')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Agent Core Folder' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Open Tunnel Admin UI' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restart Agent Core' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restart Tunnel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restart All' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset OAuth / Re-auth' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Start with Windows: Off' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Exit Agent Core' })).toBeEnabled();
  });

  it('keeps lifecycle mutations locked while the legacy tray controller is still active', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_core_control_status') {
        return Promise.resolve({
          ...runningStatus,
          legacyControllerDetected: true,
          nativeControlEnabled: false,
        });
      }
      return Promise.resolve();
    });

    const user = userEvent.setup();
    render(<AgentCorePanel />);
    await user.click(screen.getByRole('button', { name: 'Expand Agent Core controls' }));

    expect(await screen.findByText(/Legacy tray controller is still running/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart Agent Core' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restart Tunnel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restart All' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset OAuth / Re-auth' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start with Windows: Off' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exit Agent Core' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open Agent Core Folder' })).toBeEnabled();
  });

  it('uses native Tauri commands instead of a BAT launcher for utilities', async () => {
    const user = userEvent.setup();
    render(<AgentCorePanel />);
    await user.click(screen.getByRole('button', { name: 'Expand Agent Core controls' }));
    await screen.findByText('Tunnel: Running');

    await user.click(screen.getByRole('button', { name: 'Open Agent Core Folder' }));
    expect(invokeMock).toHaveBeenCalledWith('agent_core_open_folder');
  });
});
