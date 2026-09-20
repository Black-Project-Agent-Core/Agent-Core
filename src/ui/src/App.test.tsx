import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

let messageHandler: ((event: { data: any }) => void) | undefined;
const postMessage = vi.fn();

beforeEach(() => {
  messageHandler = undefined;
  postMessage.mockReset();
  (window as any).chrome = {
    webview: {
      addEventListener: (_name: string, handler: (event: { data: any }) => void) => { messageHandler = handler; },
      removeEventListener: vi.fn(),
      postMessage,
    },
  };
});

function pushOnlineStatus() {
  act(() => messageHandler!({ data: {
    type: 'status',
    status: {
      overall: 'online', connection: 'on', memory: 'available', tunnel: 'on',
      execution: 'available', autostart: true, root: 'E:\\Projects\\Agent-Core',
    },
  }}));
}

describe('Agent Core desktop UI host integration', () => {
  it('renders truthful raw-layout module states from the desktop host', () => {
    render(<App />);
    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
    expect(messageHandler).toBeTypeOf('function');
    pushOnlineStatus();

    expect(screen.getByText('ONLINE')).toBeInTheDocument();
    expect(screen.getByLabelText('Connection ON')).toHaveAttribute('data-active', 'true');
    expect(screen.getByLabelText('Memory ON')).toHaveAttribute('data-active', 'true');
    expect(screen.getByLabelText('Tunnel ON')).toHaveAttribute('data-active', 'true');
    expect(screen.getByLabelText('Execution ON')).toHaveAttribute('data-active', 'true');

    act(() => messageHandler!({ data: {
      type: 'status',
      status: { overall: 'offline', connection: 'off', memory: 'not-used', tunnel: 'off', execution: 'unavailable', autostart: false, root: 'E:\\Projects\\Agent-Core' },
    }}));
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
    expect(screen.getByLabelText('Execution OFF')).toHaveAttribute('data-active', 'true');
  });

  it('sends lifecycle actions to the desktop host', () => {
    render(<App />);
    postMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Restart Agent Core' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'restart-core' });
    fireEvent.click(screen.getByRole('button', { name: 'Open Agent Core Folder' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'open-folder' });
    fireEvent.click(screen.getByRole('button', { name: 'Open Tunnel Admin UI' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'open-tunnel-admin' });
    fireEvent.click(screen.getByRole('button', { name: 'System Snapshot' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'activity-monitor' });
  });

  it('keeps module indicators host-driven and non-interactive', () => {
    render(<App />);
    pushOnlineStatus();
    postMessage.mockClear();

    const executionOn = screen.getByLabelText('Execution ON');
    const executionOff = screen.getByLabelText('Execution OFF');

    expect(executionOn.tagName).toBe('DIV');
    expect(executionOff.tagName).toBe('DIV');
    expect(executionOn).toHaveAttribute('data-active', 'true');
    expect(executionOff).toHaveAttribute('data-active', 'false');
    expect(postMessage).not.toHaveBeenCalled();
  });
});
