import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentCorePanel } from './AgentCorePanel';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

const runningStatus = {
  overall: 'Running',
  mcpServer: 'Running',
  memory: 'Not Used',
  execution: 'Available',
  tunnel: 'Running',
  autostart: false,
  desiredRunning: true,
  root: 'D:\\Games-kuyhAa\\Agent-Core',
};

const stoppedStatus = { ...runningStatus, overall: 'Stopped', mcpServer: 'Stopped', tunnel: 'Stopped', desiredRunning: false };

describe('AgentCorePanel', () => {
  afterEach(() => vi.useRealTimers());

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

  it('opens the native activity monitor without restarting services', async () => {
    const user = userEvent.setup();
    render(<AgentCorePanel />);
    await user.click(screen.getByRole('button', { name: 'Expand Agent Core controls' }));
    await user.click(screen.getByRole('button', { name: 'Activity Monitor' }));
    expect(await screen.findByRole('dialog', { name: 'Activity Monitor' })).toBeInTheDocument();
    expect(invokeMock.mock.calls.some(([name]) => String(name).includes('restart'))).toBe(false);
  });

  it('expands the Agent Core launcher controls in the sidebar', async () => {
    const user = userEvent.setup();
    render(<AgentCorePanel />);

    expect(screen.queryByText(/MCP Server:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Agent Core controls' }));

    expect(await screen.findByText('Agent Core', { selector: '.agent-core-status-primary span:first-child' })).toBeInTheDocument();
    expect(screen.getByText(/MCP Server: Running \| Memory: Not Used \| Execution: Available/)).toBeInTheDocument();
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

  it('retains a restart permission error while immediate and periodic refreshes update health', async () => {
    vi.useFakeTimers();
    const permissionError = 'Refused to restart Agent Core because Windows process identity is unavailable. Run Agent Code with the same permissions as the runtime.';
    let statusQueries = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_core_control_status') {
        statusQueries += 1;
        return Promise.resolve(statusQueries === 2
          ? { ...runningStatus, overall: 'Degraded', mcpServer: 'Identity unavailable', memory: 'Unavailable' }
          : runningStatus);
      }
      return Promise.reject(permissionError);
    });
    render(<AgentCorePanel />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Expand Agent Core controls' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart All' })));

    expect(screen.getByRole('alert')).toHaveTextContent(permissionError);
    expect(screen.getByLabelText('Agent Core runtime status')).toHaveTextContent('MCP Server: Identity unavailable | Memory: Unavailable');
    expect(screen.getByRole('button', { name: 'Restart All' })).toBeEnabled();

    await act(async () => vi.advanceTimersByTimeAsync(6000));

    expect(screen.getByLabelText('Agent Core runtime status')).toHaveTextContent('MCP Server: Running | Memory: Not Used');
    expect(screen.getByRole('alert')).toHaveTextContent(permissionError);
    expect(statusQueries).toBe(3);
  });

  it('shows unavailable after an initial status failure and recovers on the next refresh', async () => {
    vi.useFakeTimers();
    invokeMock.mockRejectedValueOnce('Windows process query failed');
    render(<AgentCorePanel />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Expand Agent Core controls' })));

    const runtimeStatus = screen.getByLabelText('Agent Core runtime status');
    expect(runtimeStatus).toHaveTextContent('— Unavailable');
    expect(runtimeStatus).toHaveTextContent('MCP Server: Unavailable | Memory: Unavailable | Execution: Unavailable');
    expect(runtimeStatus).toHaveTextContent('Tunnel: Unavailable');
    expect(runtimeStatus).not.toHaveTextContent('Checking');
    expect(screen.getByRole('alert')).toHaveTextContent('Windows process query failed');

    await act(async () => vi.advanceTimersByTimeAsync(6000));

    expect(runtimeStatus).toHaveTextContent('— Running');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
