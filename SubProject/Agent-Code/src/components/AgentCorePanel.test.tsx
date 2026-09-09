import { render, screen, waitFor } from '@testing-library/react';
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
  desiredRunning: true,
  root: 'D:\\Games-kuyhAa\\Agent-Core',
};

const stoppedStatus = { ...runningStatus, overall: 'Stopped', mcpServer: 'Stopped', tunnel: 'Stopped', desiredRunning: false };

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

  it('wires every lifecycle button to its own native Tauri command', async () => {
    // Stopped keeps the conditional Start button rendered for the whole loop.
    invokeMock.mockImplementation((command: string) =>
      Promise.resolve(command === 'agent_core_control_status' ? stoppedStatus : { ok: true, message: 'done', status: stoppedStatus }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<AgentCorePanel />);
    await user.click(screen.getByRole('button', { name: 'Expand Agent Core controls' }));
    await screen.findByRole('button', { name: 'Start Agent Core' });

    for (const [name, command] of [
      ['Start Agent Core', 'agent_core_start'],
      ['Restart Agent Core', 'agent_core_restart_mcp'],
      ['Restart Tunnel', 'agent_core_restart_tunnel'],
      ['Restart All', 'agent_core_restart_all'],
      ['Reset OAuth / Re-auth', 'agent_core_reset_oauth'],
      ['Start with Windows: Off', 'agent_core_toggle_autostart'],
      ['Exit Agent Core', 'agent_core_exit'],
    ] as const) {
      invokeMock.mockClear();
      const button = screen.getByRole('button', { name });
      await waitFor(() => expect(button).toBeEnabled());
      await user.click(button);
      expect(invokeMock, `${name} must invoke ${command}`).toHaveBeenCalledWith(command);
    }
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
