import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentCodeApp } from '../app/AgentCodeApp';

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }));

let closeRequestedHandler: ((event: { payload: null }) => void) | undefined;

const runningStatus = {
  overall: 'Running',
  mcpServer: 'Running',
  memory: 'Healthy',
  execution: 'Healthy',
  tunnel: 'Running',
  projectRoot: 'E:\\Projects\\Agent-Core',
  nativeControlEnabled: true,
  legacyControllerDetected: false,
  autostartEnabled: true,
};

beforeEach(() => {
  closeRequestedHandler = undefined;
  invokeMock.mockReset();
  listenMock.mockReset();
  invokeMock.mockImplementation((command: string) => {
    if (command === 'agent_core_control_status') return Promise.resolve(runningStatus);
    return Promise.resolve(undefined);
  });
  listenMock.mockImplementation((eventName: string, handler: (event: { payload: null }) => void) => {
    if (eventName === 'agent-code://close-requested') closeRequestedHandler = handler;
    return Promise.resolve(() => {});
  });
});

async function requestNativeClose() {
  await waitFor(() => expect(listenMock).toHaveBeenCalledWith('agent-code://close-requested', expect.any(Function)));
  act(() => closeRequestedHandler?.({ payload: null }));
}

describe('Agent Code window lifecycle', () => {
  it('opens a two-choice close dialog only after the native X close request and Escape cancels it', async () => {
    const user = userEvent.setup();
    render(<AgentCodeApp />);
    expect(screen.queryByRole('dialog', { name: 'Close Agent Code' })).not.toBeInTheDocument();

    await requestNativeClose();

    expect(screen.getByRole('dialog', { name: 'Close Agent Code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Completely' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide to Tray' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Close Agent Code' })).not.toBeInTheDocument();
  });

  it('hides to tray through the narrow native command and dismisses the dialog', async () => {
    const user = userEvent.setup();
    render(<AgentCodeApp />);
    await requestNativeClose();

    await user.click(screen.getByRole('button', { name: 'Hide to Tray' }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('app_hide_to_tray'));
    expect(screen.queryByRole('dialog', { name: 'Close Agent Code' })).not.toBeInTheDocument();
  });

  it('requests a full native shutdown when Close Completely is chosen', async () => {
    const user = userEvent.setup();
    render(<AgentCodeApp />);
    await requestNativeClose();

    await user.click(screen.getByRole('button', { name: 'Close Completely' }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('app_close_completely'));
  });
});