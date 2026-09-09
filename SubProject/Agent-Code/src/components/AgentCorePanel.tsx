import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ExternalLink,
  FolderOpen,
  KeyRound,
  Power,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import {
  getAgentCoreStatus,
  runAgentCoreAction,
  runAgentCoreUtility,
  type AgentCoreControlStatus,
} from '../app/agent-core-control';

export function AgentCorePanel() {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<AgentCoreControlStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const refresh = useCallback(async () => {
    try {
      setStatus(await getAgentCoreStatus());
      setError('');
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  useEffect(() => {
    if (!expanded) return undefined;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 6000);
    return () => window.clearInterval(timer);
  }, [expanded, refresh]);

  const runLifecycle = async (command: string, label: string) => {
    setBusy(label);
    setMessage('');
    setError('');
    try {
      const result = await runAgentCoreAction(command);
      setStatus(result.status);
      setMessage(result.message);
    } catch (reason) {
      setError(String(reason));
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const runUtility = async (command: string, label: string) => {
    setBusy(label);
    setMessage('');
    setError('');
    try {
      await runAgentCoreUtility(command);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(null);
    }
  };

  const confirmOAuthReset = () => {
    if (!window.confirm('Reset OAuth sessions and prepare Agent Core for re-authentication? Custom Agent Core API keys are preserved.')) {
      return;
    }
    void runLifecycle('agent_core_reset_oauth', 'Reset OAuth / Re-auth');
  };

  const confirmExit = () => {
    if (!window.confirm('Stop the Agent Core MCP server and tunnel? Agent Code will remain open.')) {
      return;
    }
    void runLifecycle('agent_core_exit', 'Exit Agent Core');
  };

  return (
    <section className="agent-core-panel" aria-label="Agent Core controls">
      <button
        type="button"
        className="agent-core-toggle"
        aria-expanded={expanded}
        aria-controls="agent-core-control-list"
        aria-label={expanded ? 'Collapse Agent Core controls' : 'Expand Agent Core controls'}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="agent-core-toggle-title sidebar-label">Agent Core</span>
        <ChevronDown
          aria-hidden="true"
          className="agent-core-chevron"
          data-expanded={expanded ? 'true' : 'false'}
          size={12}
          strokeWidth={1.8}
        />
      </button>

      {expanded ? (
        <div id="agent-core-control-list" className="agent-core-control-list">
          <div className="agent-core-status-block" aria-label="Agent Core runtime status">
            <div className="agent-core-status-line agent-core-status-primary">
              <span>Agent Core</span>
              <span>— {status?.overall ?? 'Checking'}</span>
            </div>
            <div className="agent-core-status-line">
              MCP Server: {status?.mcpServer ?? 'Checking'} | Memory: {status?.memory ?? 'Checking'} | Execution: {status?.execution ?? 'Checking'}
            </div>
            <div className="agent-core-status-line">Tunnel: {status?.tunnel ?? 'Checking'}</div>
          </div>

          <div className="agent-core-control-group">
            <button type="button" className="agent-core-action" onClick={() => void runUtility('agent_core_open_folder', 'Open Agent Core Folder')} disabled={Boolean(busy)}>
              <FolderOpen size={13} />
              <span>Open Agent Core Folder</span>
            </button>
            <button type="button" className="agent-core-action" onClick={() => void runUtility('agent_core_open_tunnel_admin', 'Open Tunnel Admin UI')} disabled={Boolean(busy)}>
              <ExternalLink size={13} />
              <span>Open Tunnel Admin UI</span>
            </button>
          </div>

          <div className="agent-core-control-group">
            {status?.overall === 'Stopped' || status?.desiredRunning === false ? (
              <button type="button" className="agent-core-action" onClick={() => void runLifecycle('agent_core_start', 'Start Agent Core')} disabled={Boolean(busy)}>
                <Power size={13} />
                <span>Start Agent Core</span>
              </button>
            ) : null}
            <button type="button" className="agent-core-action" onClick={() => void runLifecycle('agent_core_restart_mcp', 'Restart Agent Core')} disabled={Boolean(busy)}>
              <RotateCcw size={13} />
              <span>Restart Agent Core</span>
            </button>
            <button type="button" className="agent-core-action" onClick={() => void runLifecycle('agent_core_restart_tunnel', 'Restart Tunnel')} disabled={Boolean(busy)}>
              <RefreshCw size={13} />
              <span>Restart Tunnel</span>
            </button>
            <button type="button" className="agent-core-action" onClick={() => void runLifecycle('agent_core_restart_all', 'Restart All')} disabled={Boolean(busy)}>
              <RotateCcw size={13} />
              <span>Restart All</span>
            </button>
            <button type="button" className="agent-core-action" onClick={confirmOAuthReset} disabled={Boolean(busy)}>
              <KeyRound size={13} />
              <span>Reset OAuth / Re-auth</span>
            </button>
          </div>

          <div className="agent-core-control-group">
            <button type="button" className="agent-core-action" onClick={() => void runLifecycle('agent_core_toggle_autostart', 'Start with Windows')} disabled={Boolean(busy)}>
              <Power size={13} />
              <span>Start with Windows: {status?.autostart ? 'On' : 'Off'}</span>
            </button>
          </div>

          <div className="agent-core-control-group agent-core-danger-group">
            <button type="button" className="agent-core-action agent-core-danger" onClick={confirmExit} disabled={Boolean(busy)}>
              <Power size={13} />
              <span>Exit Agent Core</span>
            </button>
          </div>

          {busy ? <div className="agent-core-feedback">Working: {busy}…</div> : null}
          {message ? <div className="agent-core-feedback" role="status">{message}</div> : null}
          {error ? <div className="agent-core-feedback agent-core-error" role="alert">{error}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
