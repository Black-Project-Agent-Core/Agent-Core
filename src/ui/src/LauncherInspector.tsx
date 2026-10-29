import { Activity, BrainCircuit, ChevronRight, FileText, Paperclip, Folder, Gauge } from 'lucide-react';
import type { ActivityEntry, AgentChatUiState, DesktopSnapshot } from './host';
import { selectContextUsage } from './host';
import { ContextMeter, contextMeterModel, formatTokenCount } from './ContextMeter';

export function LauncherInspector({ snapshot, chat, logs, open, onToggle, onArtifacts }: {
  snapshot?: DesktopSnapshot; chat?: AgentChatUiState; logs: ActivityEntry[];
  open: boolean; onToggle: () => void; onArtifacts?: () => void;
}) {
  const turn = chat?.active?.turns.at(-1);
  const calls = logs.filter(entry => entry.tool).slice(-6).reverse();
  const usage = selectContextUsage(chat);
  const stepText = turn?.status === 'running' && usage?.iteration !== undefined && usage.maxIterations !== undefined
    ? `${usage.iteration}/${usage.maxIterations}` : undefined;
  const model = turn?.model ?? chat?.active?.conversation.preferredModel ?? chat?.modelChoice;
  const meter = usage ? contextMeterModel(usage.contextTokens, usage.contextWindow) : undefined;
  const usedOfCapacity = usage && meter ? (meter.known ? `${formatTokenCount(usage.contextTokens)} / ${formatTokenCount(usage.contextWindow!)}` : meter.label) : undefined;
  const iterationText = turn?.iterations === undefined ? undefined
    : turn.maxIterations === undefined ? String(turn.iterations) : `${turn.iterations} / ${turn.maxIterations}`;
  const provider = chat?.providers?.find(item => item.id === chat.providerChoice);
  if (!open) return <aside className="launcher-inspector collapsed" aria-label="Context inspector">
    <button type="button" className="inspector-toggle" aria-label="Open context inspector" onClick={onToggle}><Gauge size={17}/></button>
  </aside>;
  return <aside className="launcher-inspector" aria-label="Context and execution inspector">
    <div className="launcher-inspector-heading"><Gauge size={16}/><h2>Context & Execution Inspector</h2>
      <button type="button" className="inspector-toggle" aria-label="Collapse context inspector" onClick={onToggle}><ChevronRight size={16}/></button>
    </div>
    <div className="launcher-inspector-content">
      <details open><summary><BrainCircuit size={15}/>Context Window{meter?.known ? ` (${Math.round(meter.fillPercent)}%)` : ''}</summary>
        <div className="inspector-context-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
          <span>Model: {model || provider?.model || 'Automatic routing'}</span><span>{usedOfCapacity ?? 'Not recorded'}</span>
        </div>
        {usage && <ContextMeter tokens={usage.contextTokens} capacity={usage.contextWindow} hideLabel/>}
        <dl>
        <dt>Reasoning</dt><dd>{turn?.reasoningEffort ?? chat?.reasoningChoice ?? 'auto'}</dd>
        <dt>State</dt><dd>{turn?.status ?? 'New conversation'}</dd>
        <dt>Iterations</dt><dd>{iterationText ?? stepText ?? 'Not recorded'}</dd>
        <dt>Context recall</dt><dd>{turn?.retrievalCount ?? 'Not recorded'}</dd>
      </dl>{!usage&&<p>Token usage and capacity are not reported by this desktop bridge.</p>}</details>
      <details open><summary><Activity size={15}/>Desktop tool activity <span>{calls.length}</span></summary>
        <p>Recent desktop activity; association with this chat is not established.</p>
        {calls.length ? <ul className="inspector-call-list">{calls.map(entry => <li key={entry.id}>
          <div><b>{entry.tool}</b><span>{entry.status ?? entry.level}</span></div>
          <small>{entry.durationMs == null ? 'Duration unavailable' : `${Math.round(entry.durationMs)} ms`}</small>
        </li>)}</ul> : <p>No desktop tool activity recorded.</p>}
      </details>
      <details open><summary><Paperclip size={15}/>Imported Files</summary><p>File and folder attachments are a planned upgrade. No files are imported by the composer.</p></details>
      <details open><summary><FileText size={15}/>Workspace Artifacts</summary><p>{turn?'Inspect the actual changes recorded for this task.':'Select a conversation to inspect task changes.'}</p><button className="prototype-link" disabled={!onArtifacts} onClick={onArtifacts}>Open Artifacts →</button><dl><dt>Memory records used</dt><dd>{turn?.memoryUse?.length ?? 'Not recorded'}</dd></dl></details>
      <div className="inspector-workspace"><Folder size={15}/><div><span>Workspace</span><code>{chat?.active?.conversation.workspace ?? 'agent-core'}</code>
        <small>{snapshot?.paths.root ?? 'Waiting for the desktop host'}</small></div></div>
    </div>
  </aside>;
}
