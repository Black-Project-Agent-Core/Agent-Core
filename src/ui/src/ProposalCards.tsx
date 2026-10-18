import { useEffect, useRef, useState } from 'react';
import { BookOpen, FileText, RefreshCw, X } from 'lucide-react';
import { Panel, SectionTitle } from './components';
import { postHost, subscribeHost, type ProposalDocumentItem, type ProposalDocumentList, type ProposalDocumentRead } from './host';

const empty: ProposalDocumentList = { items: [], guides: [], warnings: [] };
const requestId = () => globalThis.crypto?.randomUUID?.() ?? `proposal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const same = (a: ProposalDocumentItem, b: ProposalDocumentItem) => a.id === b.id && a.revisionDigest === b.revisionDigest && a.documentDigest === b.documentDigest;

/** Read/review only: this component never sends a decision, build, run or activation request. */
export function ProposalCards() {
  const [catalog, setCatalog] = useState<ProposalDocumentList>(empty);
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState<ProposalDocumentItem>();
  const [opened, setOpened] = useState<ProposalDocumentRead>();
  const [error, setError] = useState<string>();
  const refresh = useRef(() => {}), read = useRef((_item: ProposalDocumentItem) => {});
  useEffect(() => {
    let active = true, listing: string | undefined, selected: { requestId: string; item: ProposalDocumentItem } | undefined;
    let listTimer: ReturnType<typeof setTimeout> | undefined, readTimer: ReturnType<typeof setTimeout> | undefined;
    const list = () => {
      if (!active || listing) return;
      listing = requestId(); setPending(true); setError(undefined);
      listTimer = setTimeout(() => { listing = undefined; setPending(false); setError('Proposal list timed out. Use Refresh to retry.'); }, 12000);
      postHost({ type: 'proposals-get', requestId: listing });
    };
    const open = (item: ProposalDocumentItem) => {
      if (!active || item.readStatus !== 'available' || !item.documentDigest) return;
      clearTimeout(readTimer); selected = { requestId: requestId(), item };
      setReading(item); setOpened(undefined); setError(undefined);
      readTimer = setTimeout(() => { selected = undefined; setReading(undefined); setError('Proposal read timed out. Open the card again to retry.'); }, 12000);
      postHost({ type: 'proposal-read', requestId: selected.requestId, id: item.id,
        revisionDigest: item.revisionDigest, documentDigest: item.documentDigest });
    };
    const unsubscribe = subscribeHost(message => {
      if (!active) return;
      if ((message.type === 'proposals-result' || message.type === 'proposals-error') && message.requestId === listing) {
        clearTimeout(listTimer); listing = undefined; setPending(false);
        if (message.type === 'proposals-error') { setError(message.error); return; }
        const value = message.result;
        if (!value || !Array.isArray(value.items) || !Array.isArray(value.guides) || !Array.isArray(value.warnings)) { setError('Invalid proposal list.'); return; }
        setCatalog({ items: value.items.slice(0, 100), guides: value.guides.slice(0, 100), warnings: value.warnings });
        if (selected && ![...value.items, ...value.guides].some(item => same(item, selected!.item) && item.readStatus === 'available')) {
          clearTimeout(readTimer); selected = undefined; setReading(undefined);
          setError('Proposal revision changed. Read the current card again.');
        }
        setOpened(current => current && [...value.items, ...value.guides].some(item => same(item, current) && item.readStatus === 'available') ? current : undefined);
        return;
      }
      if ((message.type === 'proposal-read-result' || message.type === 'proposal-read-error') && message.requestId === selected?.requestId) {
        clearTimeout(readTimer); const requested = selected!.item; selected = undefined; setReading(undefined);
        if (message.type === 'proposal-read-error') { setError(message.error); return; }
        if (!message.result || !same(message.result, requested) || typeof message.result.text !== 'string' || typeof message.result.decisionGuidance !== 'string') {
          setError('Proposal revision changed. Refresh the list and read again.'); return;
        }
        setOpened(message.result);
      }
    });
    refresh.current = list; read.current = open; list();
    const poll = setInterval(list, 30000);
    return () => { active = false; listing = undefined; selected = undefined; clearTimeout(listTimer); clearTimeout(readTimer); clearInterval(poll); unsubscribe(); };
  }, []);
  return <Panel className="proposal-panel">
    <SectionTitle icon={FileText} title="Proposals to review" subtitle="Read the current document before making a decision. Cards never approve or run changes."
      action={<button type="button" className="tiny-button" disabled={pending} onClick={() => refresh.current()}><RefreshCw size={15}/>{pending ? 'Checking…' : 'Refresh proposals'}</button>}/>
    {error && <p className="proposal-error" role="alert">{error}</p>}
    {catalog.warnings.length > 0 && <p className="proposal-warning">Some documents are unavailable or outside the scan budget. {catalog.warnings.join(', ')}</p>}
    {catalog.guides.length > 0 && <div className="proposal-guides"><BookOpen size={16}/><span>Review guides</span>{catalog.guides.map(item => <button type="button" className="link-button" key={item.id} onClick={() => read.current(item)}>{item.title}</button>)}</div>}
    <div className="proposal-card-grid">{catalog.items.map(item => <article className="proposal-card" key={item.id}>
      <div className="proposal-card-heading"><span className="proposal-kind">{item.kind === 'skill-revision' ? 'Skill revision' : item.kind === 'skill' ? 'Skill' : 'Improvement'}</span><span className="proposal-status">{item.status}</span></div>
      <h3>{item.title}</h3><p className="proposal-path">{item.path}</p>
      <div className="proposal-revision"><span>Revision</span><code>{item.revisionDigest}</code></div>
      {item.projection === 'legacy-runtime' && <p className="proposal-warning">Existing runtime document; an external docs projection has not been published.</p>}
      {item.readStatus !== 'available' && <p className="proposal-warning">{item.readStatus === 'drift' ? 'Document differs from the current proposal state. Review the file drift before deciding.' : 'Document is unavailable. Refresh after explicit publication or repair.'}</p>}
      <button type="button" className="tiny-button" aria-label={`Read ${item.title}`} disabled={item.readStatus !== 'available' || !item.documentDigest || reading?.id === item.id}
        onClick={() => read.current(item)}><FileText size={15}/>{reading?.id === item.id ? 'Reading…' : 'Read proposal'}</button>
    </article>)}</div>
    {!pending && !catalog.items.length && <p className="empty-copy">No proposal documents are currently available.</p>}
    {opened && <section className="proposal-reader" aria-label="Proposal Markdown reader">
      <div className="proposal-reader-heading"><div><h3>{opened.title}</h3><p>{opened.path}</p><code>{opened.revisionDigest}</code></div>
        <button type="button" className="tiny-button" aria-label="Close proposal reader" onClick={() => setOpened(undefined)}><X size={16}/></button></div>
      <pre tabIndex={0}>{opened.text}</pre><p className="proposal-decision-guidance">{opened.decisionGuidance}</p>
    </section>}
  </Panel>;
}
