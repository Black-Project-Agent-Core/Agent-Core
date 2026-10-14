import { useEffect, useRef, useState } from 'react';
import { Link2, RefreshCw } from 'lucide-react';
import { PageHero, Panel, StatusBadge } from './components';
import { postHost, subscribeHost, type WorkflowsSnapshot } from './host';

const POLL_MS = 3000;
const REQUEST_TIMEOUT_MS = 12000;

export function WorkflowsPage() {
  const [snapshot, setSnapshot] = useState<WorkflowsSnapshot>({ status: 'building', limitations: [] });
  const [canvas, setCanvas] = useState<WorkflowsSnapshot>();
  const [pending, setPending] = useState(false);
  const refresh = useRef(() => {});

  useEffect(() => {
    let active = true;
    let pendingId: string | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      clearTimeout(requestTimer);
      pendingId = undefined;
      setPending(false);
      pollTimer = setTimeout(request, POLL_MS);
    };
    const fail = (error: string) => {
      setSnapshot(previous => ({ ...previous, status: 'error', error }));
      finish();
    };
    function request() {
      if (!active || pendingId) return;
      clearTimeout(pollTimer);
      pendingId = globalThis.crypto?.randomUUID?.() ?? `workflows-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setPending(true);
      requestTimer = setTimeout(() => fail('Workflows request timed out. Retrying the local service.'), REQUEST_TIMEOUT_MS);
      try {
        postHost({ type: 'workflows-get', requestId: pendingId });
      } catch {
        fail('Could not reach the desktop host. Retrying.');
      }
    }
    const unsubscribe = subscribeHost(message => {
      if (!active || !pendingId || (message.type !== 'workflows-result' && message.type !== 'workflows-error')) return;
      if (message.requestId !== pendingId) return;
      if (message.type === 'workflows-error') {
        fail(message.error);
        return;
      }
      const result = message.result;
      if (!result || !['building', 'ready', 'stale', 'error'].includes(result.status) || !Array.isArray(result.limitations)) {
        fail('The desktop host returned an invalid workflows snapshot.');
        return;
      }
      setSnapshot(result);
      if (typeof result.html === 'string' && result.html.trim()) setCanvas(result);
      finish();
    });
    refresh.current = request;
    request();
    return () => {
      active = false;
      pendingId = undefined;
      refresh.current = () => {};
      clearTimeout(pollTimer);
      clearTimeout(requestTimer);
      unsubscribe();
    };
  }, []);

  const shown = canvas ?? snapshot;
  const stale = snapshot.status !== 'ready';
  const tone = snapshot.status === 'ready' ? 'healthy' : snapshot.status === 'error' ? 'error' : 'warning';
  const status = snapshot.status === 'ready' ? 'Current source map' : snapshot.status === 'stale' ? 'Updating source map' : snapshot.status === 'error' ? 'Source map unavailable' : 'Building source map';
  const limitations = [...new Set([...(canvas?.limitations ?? []), ...snapshot.limitations])];

  return <div className="page workflows-page">
    <PageHero icon={Link2} title="Workflows" subtitle="One interactive source map of Agent Core, including Memory and its connections.">
      <button type="button" className="tiny-button" aria-label="Refresh workflows" onClick={() => refresh.current()} disabled={pending}>
        <RefreshCw size={16}/>{pending ? 'Checking…' : 'Refresh'}
      </button>
    </PageHero>
    <Panel className="workflows-summary">
      <div className="workflows-status-row"><StatusBadge tone={tone} label={status}/><span>Source analysis, not live execution</span><small>Automatically checks for source changes</small></div>
      {(snapshot.status === 'error' || snapshot.error) && <p role="alert" className="workflows-error">{snapshot.error || 'Source analysis is unavailable. Retrying automatically.'}</p>}
      {canvas && stale && <p className="workflows-stale">Showing the last successful source map while the current source is unavailable or rebuilding.</p>}
      <div className="workflows-counts" aria-label="Source map counts">
        <span>{shown.sourceFiles ?? '—'} source files</span><span>{shown.nodes ?? '—'} nodes</span><span>{shown.edges ?? '—'} edges</span><span>{shown.unknowns ?? '—'} unresolved</span>
      </div>
      <details className="workflows-details">
        <summary>Snapshot provenance and limitations</summary>
        <dl>
          <div><dt>Git HEAD (reference only)</dt><dd>{shown.revision || 'Unavailable'}</dd></div>
          <div><dt>Working-tree fingerprint</dt><dd>{shown.fingerprint || 'Unavailable'}</dd></div>
          <div><dt>Generated</dt><dd>{shown.generatedAt ? <time dateTime={shown.generatedAt}>{shown.generatedAt}</time> : 'Pending'}</dd></div>
        </dl>
        <p>Connections are extracted from source. They do not prove that a path ran or that every dynamic call was resolved.</p>
        {limitations.length > 0 && <ul>{limitations.map(item => <li key={item}>{item}</li>)}</ul>}
      </details>
    </Panel>
    <section className="workflows-canvas" aria-label="Unified system and Memory source map">
      {canvas?.html
        ? <iframe title="Agent Core unified workflows canvas" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={canvas.html}/>
        : <div className="workflows-empty"><Link2 size={32}/><strong>{snapshot.status === 'error' ? 'Waiting for source analysis' : 'Building the source map…'}</strong><p>The interactive canvas will appear here when a source snapshot is ready.</p></div>}
    </section>
  </div>;
}
