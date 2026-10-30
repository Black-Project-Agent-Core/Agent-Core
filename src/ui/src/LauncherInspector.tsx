import { Activity, BrainCircuit, ChevronRight, FileText, Paperclip, Gauge, Server, ListTodo, Cable } from 'lucide-react';
import type { ActivityEntry, AgentChatUiState, DesktopSnapshot } from './host';
import { postHost, selectContextUsage } from './host';
import { COMPACT_BUTTON_PERCENT, ContextMeter, SEGMENT_COLORS, contextBreakdownRows, contextMeterModel, formatTokenCount } from './ContextMeter';
import { STEP_GLYPH, formatStepDuration } from './AgentSteps';

export function LauncherInspector({ snapshot, chat, logs, open, onToggle, onArtifacts }: {
  snapshot?: DesktopSnapshot; chat?: AgentChatUiState; logs: ActivityEntry[];
  open: boolean; onToggle: () => void; onArtifacts?: () => void;
}) {
  const turn = chat?.active?.turns.at(-1);
  const calls = (chat?.active?.steps ?? []).filter(step => step.turnId === turn?.id && step.kind !== 'note');
  const usage = selectContextUsage(chat);
  const stepText = turn?.status === 'running' && usage?.iteration !== undefined && usage.maxIterations !== undefined
    ? `${usage.iteration}/${usage.maxIterations}` : undefined;
  const model = turn?.model ?? chat?.active?.conversation.preferredModel ?? chat?.modelChoice;
  const meter = usage ? contextMeterModel(usage.contextTokens, usage.contextWindow) : undefined;
  const breakdownRows = usage ? contextBreakdownRows(usage.contextBreakdown, usage.contextTokens, usage.contextWindow) : [];
  const segments = breakdownRows.map(row => ({ key: row.key, tokens: row.tokens }));
  const usedOfCapacity = usage && meter ? (meter.known ? `${formatTokenCount(usage.contextTokens)} / ${formatTokenCount(usage.contextWindow!)}` : meter.label) : undefined;
  const iterationText = turn?.iterations === undefined ? undefined
    : turn.maxIterations === undefined ? String(turn.iterations) : `${turn.iterations} / ${turn.maxIterations}`;
  const provider = chat?.providers?.find(item => item.id === chat.providerChoice);
  const compactResult = chat?.compactResult?.turnId === turn?.id ? chat?.compactResult : undefined;
  // Shown only past the Compact threshold, like the reference: remaining room before automatic compaction, then the button.
  const untilAutoCompact = usage && meter?.known && meter.fillPercent >= COMPACT_BUTTON_PERCENT
    ? formatTokenCount(Math.max(0, usage.contextWindow! - usage.contextTokens)) : undefined;
  if (!open) return <aside className="launcher-inspector collapsed" aria-label="Context inspector">
    <button type="button" className="inspector-toggle" aria-label="Open context inspector" onClick={onToggle}><Gauge size={17}/></button>
  </aside>;
  return <aside className="launcher-inspector" aria-label="Context and execution inspector">
    <div className="launcher-inspector-heading"><Gauge size={16}/><h2>Context & Execution Inspector</h2>
      <button type="button" className="inspector-toggle" aria-label="Collapse context inspector" onClick={onToggle}><ChevronRight size={16}/></button>
    </div>
    <div className="launcher-inspector-content">
      <details open><summary><BrainCircuit size={15}/>Context</summary>
        <div className="inspector-context-head">
          {meter?.known && <b>{Math.round(meter.fillPercent)}% used</b>}
          <span>{usedOfCapacity ?? 'Not recorded'}</span>
        </div>
        {usage && <div className="inspector-context-meter">
          <ContextMeter tokens={usage.contextTokens} capacity={usage.contextWindow} segments={segments} hideLabel/>
        </div>}
        {breakdownRows.length > 0 && <ul className="inspector-context-breakdown" aria-label="Rincian context (estimasi)">
          {breakdownRows.map(row => <li key={row.key}>
            <span className="inspector-swatch" aria-hidden="true" style={{ backgroundColor: SEGMENT_COLORS[row.key] }}/>
            <span>{row.label}</span>
            <span>{formatTokenCount(row.tokens)}</span>
            <span>{row.percentOfWindow !== undefined ? row.percentOfWindow.toFixed(1) : row.percent}%</span>
          </li>)}
        </ul>}
        {untilAutoCompact && <div className="inspector-compact">
          <div className="inspector-compact-row">
            <span>{untilAutoCompact} until auto-compact</span>
            <button type="button" disabled={turn?.status !== 'running'}
              title={turn?.status === 'running' ? undefined : 'Hanya untuk giliran yang sedang berjalan'}
              onClick={() => { if (turn) postHost({ type: 'agent-chat-compact', turnId: turn.id }); }}>Compact session</button>
          </div>
          {compactResult && <small role="status">{compactResult.status === 'scheduled' ? 'Kompaksi dijadwalkan'
            : compactResult.status === 'not-running' ? 'Tidak ada giliran berjalan' : 'Gagal menjadwalkan'}</small>}
        </div>}
        <dl>
        <dt>Model</dt><dd>{model || provider?.model || 'Automatic routing'}</dd>
        <dt>Reasoning</dt><dd>{turn?.reasoningEffort ?? chat?.reasoningChoice ?? 'auto'}</dd>
        <dt>State</dt><dd>{turn?.status ?? 'New conversation'}</dd>
        <dt>Iterations</dt><dd>{iterationText ?? stepText ?? 'Not recorded'}</dd>
        <dt>Context recall</dt><dd>{turn?.retrievalCount ?? 'Not recorded'}</dd>
      </dl>{!usage&&<p>Token usage and capacity are not reported by this desktop bridge.</p>}</details>
      <details open><summary><Activity size={15}/>Tool Calls ({calls.length})</summary>
        {calls.length ? <ul className="inspector-call-list">{calls.map(step => <li key={step.turnId + ':' + step.seq}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{step.toolName}</b>
            <span aria-label={STEP_GLYPH[step.status].label}>{STEP_GLYPH[step.status].glyph}{step.durationMs !== undefined && ' ' + formatStepDuration(step.durationMs)}</span></div>
          {step.argsSummary && <small style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.argsSummary}</small>}
        </li>)}</ul> : <p>Belum ada tool call di percakapan ini</p>}
      </details>
      <details open><summary><ListTodo size={15}/>Background tasks ({calls.filter(s => s.status === 'running').length} running)</summary>
        {(() => {
          const running = calls.filter(s => s.status === 'running');
          const finished = calls.filter(s => s.status !== 'running').length;
          if (running.length === 0) return <><p>Tidak ada tugas berjalan</p>{finished > 0 && <small className="inspector-bg-finished">{finished} finished</small>}</>;
          return <>
            <ul className="inspector-bg-list">
              {running.map(step => <li key={step.turnId + ':' + step.seq}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{step.toolName}</b>
                  <span aria-label={STEP_GLYPH[step.status].label}>{STEP_GLYPH[step.status].glyph}{step.durationMs !== undefined && ' ' + formatStepDuration(step.durationMs)}</span></div>
                {step.argsSummary && <small style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.argsSummary}</small>}
              </li>)}
            </ul>
            <small className="inspector-bg-finished">{finished} finished</small>
          </>;
        })()}
      </details>
      <details open><summary><Server size={15}/>Connectors <span className="inspector-conn-sub">Subsistem Agent Core</span></summary>
        {snapshot?.health ? <>
          <ul className="inspector-conn-list">
            {(() => {
              const rows = [];
              const h = snapshot.health;
              if (h.memory) rows.push({ name: 'Memory', status: h.memory.status });
              if (h.skills) rows.push({ name: 'Skills', status: h.skills.status });
              if (h.codeIntelligence) rows.push({ name: 'Code Intelligence', status: h.codeIntelligence.status });
              if (h.phone) rows.push({ name: 'Phone', status: h.phone.status });
              if (h.webResearch) rows.push({ name: 'Web research', status: h.webResearch.status });
              if (h.execution) rows.push({ name: 'Execution', status: h.execution.status });
              return rows.map((r, i) => <li key={i}><span className={'inspector-dot ' + (['available','ok','ready','healthy'].includes(r.status.toLowerCase()) ? 'ok' : ['degraded','warn'].includes(r.status.toLowerCase()) ? 'warn' : ['error','unavailable','failed'].includes(r.status.toLowerCase()) ? 'bad' : 'idle')}/>{r.name}<span>{r.status}</span></li>);
            })()}
          </ul>
        </> : <p>Menunggu host desktop</p>}
      </details>
      <details open><summary><Cable size={15}/>Environment</summary>
        <dl className="inspector-env-list">
          <dt>Workspace</dt><dd>{chat?.active?.conversation.workspace ?? 'agent-core'}</dd>
          <dt>Root</dt><dd>{snapshot?.paths.root ?? 'Waiting for the desktop host'}</dd>
          <dt>Core</dt><dd>{snapshot ? `${snapshot.core.port} · ${snapshot.core.httpHealthy ? 'healthy' : 'tidak sehat'}` : '—'}</dd>
          <dt>Versi</dt><dd>{snapshot?.version ?? '—'}</dd>
        </dl>
      </details>
      <details open><summary><Paperclip size={15}/>Imported Files</summary><p>File and folder attachments are a planned upgrade. No files are imported by the composer.</p></details>
      <details open><summary><FileText size={15}/>Workspace Artifacts</summary><p>{turn?'Inspect the actual changes recorded for this task.':'Select a conversation to inspect task changes.'}</p><button className="prototype-link" disabled={!onArtifacts} onClick={onArtifacts}>Open Artifacts →</button><dl><dt>Memory records used</dt><dd>{turn?.memoryUse?.length ?? 'Not recorded'}</dd></dl></details>
    </div>
  </aside>;
}
