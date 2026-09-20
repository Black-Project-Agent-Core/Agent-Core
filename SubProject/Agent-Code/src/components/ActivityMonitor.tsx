import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Download, Pause, Play, Search, Terminal, X } from 'lucide-react';
import { captureLabel, exportActivity, isActivityError, mergeActivity, openActivityLnav, readActivity, setActivityEnabled, type ActivityBatch, type ActivityRecord, type CaptureState } from '../app/activity-monitor';
import '../styles/activity-monitor.css';
const time = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString([], { hour12: false }) : '--:--:--';
const string = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export function ActivityMonitor({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ActivityRecord[]>([]), [batch, setBatch] = useState<ActivityBatch | null>(null);
  const [desired, setDesired] = useState<CaptureState>({}), [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState<ActivityRecord[] | null>(null), [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const [error, setError] = useState(''), [actionError, setActionError] = useState(''), [notice, setNotice] = useState(''), [limit, setLimit] = useState(150);
  const dialog = useRef<HTMLElement>(null), closeButton = useRef<HTMLButtonElement>(null), pendingRevision = useRef<string | undefined>(undefined);
  const deferredQuery = useDeferredValue(query.toLowerCase());
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null; closeButton.current?.focus();
    return () => { prior?.focus(); };
  }, []);
  useEffect(() => {
    let disposed = false, cursor = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let delay = 800;
      try {
        const next = await readActivity(cursor); if (disposed) return;
        cursor = next.lastSequence; setRows(previous => mergeActivity(previous, next)); setBatch(next); setError('');
        if (!pendingRevision.current || next.desired.revision === pendingRevision.current) { setDesired(next.desired); pendingRevision.current = undefined; }
        if (next.pendingBytes) delay = 100;
      } catch (reason) { if (!disposed) setError(String(reason)); delay = 2000; }
      if (!disposed) timer = setTimeout(() => void tick(), delay);
    };
    void tick(); return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, []);
  const visible = useMemo(() => (paused ?? rows).filter(row => {
    if (filter === 'errors' && !isActivityError(row)) return false;
    if (filter === 'anomalies' && row.event !== 'anomaly') return false;
    return !deferredQuery || JSON.stringify(row).toLowerCase().includes(deferredQuery);
  }).reverse(), [paused, rows, filter, deferredQuery]);
  const run = async (operation: () => Promise<void>) => { setBusy(true); setActionError(''); try { await operation(); } catch (reason) { setActionError(String(reason)); } finally { setBusy(false); } };
  const toggle = () => void run(async () => { const next = await setActivityEnabled(!desired.enabled); pendingRevision.current = next.revision; setDesired(next); });
  const label = batch ? captureLabel(desired, batch.applied) : 'Connecting to native reader...';
  return createPortal(
    <div className="activity-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="activity-dialog" role="dialog" aria-modal="true" aria-label="Activity Monitor" ref={dialog} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') { const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,summary,[tabindex="0"]'); if (!elements?.length) return;
          const first = elements[0], last = elements[elements.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
        <header className="activity-heading"><div><Activity size={22} /><div><h2>Activity Monitor</h2><p>Agent Core / local request and runtime timeline</p></div></div><button ref={closeButton} type="button" aria-label="Close Activity Monitor" onClick={onClose}><X size={20} /></button></header>
        <div className="activity-capture"><div><span className="activity-dot" data-active={label === 'Capture active'} data-warning={label.endsWith('issues recorded') || label.endsWith('errors recorded')} /><strong role="status">{label}</strong><small>{batch?.applied.pid ? 'PID ' + batch.applied.pid + ' / ' + batch.applied.instanceId?.slice(0, 8) : 'Waiting for runtime acknowledgement'}</small></div>
          <button type="button" role="switch" aria-checked={Boolean(desired.enabled)} aria-label="Capture activity" disabled={busy || !batch || Boolean(error)} onClick={toggle}><span />{desired.enabled ? 'On' : 'Off'}</button></div>
        {batch ? <div className="activity-counters">
          <span>Capture errors: {batch.applied.captureErrors ?? 'unknown'} / Audit dropped: {batch.applied.audit?.dropped ?? 'unknown'} / write errors: {batch.applied.audit?.writeErrors ?? 'unknown'}</span>
          <p>Counters since runtime start; capture errors can include failed status updates. These totals do not determine current service health.</p>
        </div> : null}
        <div className="activity-toolbar"><label className="activity-search"><Search size={16} /><input aria-label="Search activity" placeholder="Search tool, request, route, task or error..." value={query} onChange={event => { setQuery(event.target.value); setLimit(150); }} /></label>
          <select aria-label="Activity filter" value={filter} onChange={event => { setFilter(event.target.value); setLimit(150); }}><option value="all">All activity</option><option value="errors">Errors</option><option value="anomalies">Anomalies</option></select>
          <button type="button" onClick={() => setPaused(paused ? null : [...rows])}>{paused ? <Play size={15} /> : <Pause size={15} />}{paused ? 'Resume view' : 'Pause view'}</button>
          <button type="button" disabled={busy} onClick={() => void run(async () => setNotice('Exported retained reader window: ' + await exportActivity()))}><Download size={15} />Export</button>
          <button type="button" disabled={busy} onClick={() => void run(async () => { await openActivityLnav(); setNotice('lnav launched separately; this panel keeps capturing.'); })}><Terminal size={15} />Open in lnav</button></div>
        {error || actionError ? <div className="activity-alert" role="alert">{error || actionError}</div> : null}
        {notice ? <div className="activity-notice">{notice}</div> : null}
        <div className="activity-stats"><span>{visible.length} matching / {rows.length} retained events</span><span>{paused ? 'View paused; capture continues' : 'Live view'} / {batch?.applied.activeCalls ?? 0} running calls</span><span>Reader omissions: {batch?.skipped ?? 0} / malformed: {batch?.malformed ?? 0}</span></div>
        <p className="activity-reader-note">Reader omissions include bounded history, size limits and sequence gaps. This is not a count of lost journal records.</p>
        <details className="activity-local-diagnostics">
          <summary>Local process diagnostics / {(batch?.localLogs ?? []).reduce((n, log) => n + (log.errorCount ?? 0), 0)} error lines in retained tails{batch?.crash ? ' / crash recorded' : ''}</summary>
          <div className="activity-local-body">
            <p>Bounded log tails, not current service health. Raw process text is omitted; historical errors may remain after recovery.</p>
            {(batch?.localLogs ?? []).map(log => <details key={log.source} className="activity-local-source">
              <summary><strong>{log.source}</strong><span>{log.available ? (log.errorCount ?? 0) + ' error lines' : 'Unavailable'}</span></summary>
              <p>{log.relativePath}{log.modifiedAtMs ? ' / updated ' + new Date(log.modifiedAtMs).toLocaleString() : ''}</p>
              {log.error ? <p>{log.error}</p> : null}
              <pre>{JSON.stringify(log.observations ?? [], null, 2)}</pre>
            </details>)}
            {batch?.crash ? <section className="activity-last-crash"><strong>Last recorded crash</strong><pre>{JSON.stringify(batch.crash, null, 2)}</pre></section> : null}
            {!batch?.localLogs?.length ? <p>Local process diagnostics have not been returned by the native reader.</p> : null}
          </div>
        </details>
        <div className="activity-records" aria-label="Activity events" tabIndex={0}>
          {!visible.length ? <div className="activity-empty"><Activity size={28} /><h3>{query || filter !== 'all' ? 'No matching activity' : 'Waiting for activity'}</h3><p>{desired.enabled ? 'Events appear when requests reach the local machine.' : 'Enable capture for protocol details. Existing audit remains visible.'}</p></div> : visible.slice(0, limit).map(row => <details key={row.sequence} className="activity-row" data-error={isActivityError(row)}><summary>
            <span className="activity-time">{time(row.timestamp)}</span><span className="activity-category">{row.category ?? 'runtime'}</span><strong>{row.event}</strong><span className="activity-tool">{string(row.data.toolName ?? row.data.code ?? row.data.route)}</span><span>{typeof row.data.durationMs === 'number' ? Math.round(row.data.durationMs) + ' ms' : ''}</span><span className="activity-seq">#{row.sequence}</span>
          </summary><div className="activity-detail"><p>Request: {row.requestId ?? 'not associated'} / Local audit sequence: {row.sequence}</p><pre>{JSON.stringify(row, null, 2)}</pre></div></details>)}
          {visible.length > limit ? <button className="activity-more" type="button" onClick={() => setLimit(n => n + 150)}>Show 150 older matching events</button> : null}
        </div>
        <footer className="activity-footer">{batch?.scope ?? 'Observes only instrumented local boundaries.'}<br />Credentials and large free-form payloads are omitted. An anomaly is an observed condition, not an automatic root-cause diagnosis.</footer>
      </section>
    </div>, document.body,
  );
}
