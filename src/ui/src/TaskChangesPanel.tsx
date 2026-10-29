import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FileCode, RefreshCw, X } from 'lucide-react';
import { postHost, subscribeHost, type TaskChanges, type TaskChangesApplied, type TaskChangesDiff, type TaskChangesExternal } from './host';
import { formatBytes } from './model';

const requestId = () => globalThis.crypto?.randomUUID?.() ?? `task-changes-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const REPLY_TIMEOUT_MS = 25000;

const appliedLabel: Record<TaskChangesApplied['state'], string> = {
  added: 'Added', modified: 'Modified', deleted: 'Deleted', renamed: 'Renamed', unverified: 'Not verified',
};
const externalLabel: Record<TaskChangesExternal['state'], string> = {
  added: 'Added', modified: 'Modified', deleted: 'Deleted', renamed: 'Renamed', untracked: 'Untracked', conflicted: 'Conflicted', other: 'Changed',
};
const afterwardsLabel = {
  differs: 'File differs afterwards',
  same: 'No difference observed afterwards (failed, reverted or no-op)',
  unknown: 'Not checked',
} as const;

function diffNote(diff: TaskChangesDiff): string | undefined {
  switch (diff.state) {
    case 'binary': return 'Binary file: content not shown.';
    case 'too-large': return 'Too large to diff (limit 512 KB per side): content not shown.';
    case 'sensitive-not-shown': return 'Content withheld: the path or the changed text looks sensitive.';
    case 'budget': return 'Diff skipped: the per-response diff budget was reached.';
    case 'none': return 'Identical content: the file only moved.';
    case 'truncated': return 'Diff truncated: only the first part is shown.';
    case 'unavailable': return `Diff unavailable${diff.reason ? ` (${diff.reason})` : ''}.`;
    default: return undefined;
  }
}

function DiffBlock({ path, text }: { path: string; text: string }) {
  // +/- signs stay in the text, so added and removed lines are distinguishable without colour.
  return <pre className="execution-code task-changes-diff" tabIndex={0} aria-label={`Diff for ${path}`}><code>
    {text.split('\n').map((line, index) => <span key={index} className={line.startsWith('+') ? 'diff-added' : line.startsWith('-') ? 'diff-removed' : ''}>{line || ' '}{'\n'}</span>)}
  </code></pre>;
}

function Group({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  const id = useId();
  return <section className="task-changes-group" aria-labelledby={id}>
    <h4 id={id}>{title}</h4><p className="task-changes-summary">{summary}</p>{children}
  </section>;
}

function counts(additions: number | null | undefined, deletions: number | null | undefined) {
  return typeof additions === 'number' && typeof deletions === 'number' ? ` · +${additions} −${deletions}` : '';
}

function Result({ data }: { data: TaskChanges }) {
  const { applied, external } = data;
  return <div className="task-changes-result">
    <Group title="Proposed requests" summary={data.requests.length
      ? 'File-changing requests this task made with an automatic checkpoint. The request text is in the Activity Log under the same invocation id. A request is not proof of a change.'
      : 'No file-changing request with an automatic checkpoint was recorded for this task.'}>
      {data.requests.length > 0 && <ul>{data.requests.map(request => <li key={request.checkpointId}>
        <code>{request.invocationId}</code> <time dateTime={request.at}>{new Date(request.at).toLocaleString()}</time>
        <ul>{request.paths.map(file => <li key={file.path}><code>{file.path}</code> · {afterwardsLabel[file.afterwards]}</li>)}</ul>
      </li>)}</ul>}
    </Group>
    <Group title="Applied changes" summary={data.checkpointCount
      ? `Checked against the files now on disk and the first checkpoint this task took of each file. ${applied.unchanged} checkpointed file${applied.unchanged === 1 ? '' : 's'} unchanged. Other writers after that checkpoint cannot be excluded.`
      : 'No automatic checkpoint exists for this task, so nothing can be attributed to it here. Changes made by shell commands or by calls without a checkpoint appear under external changes.'}>
      {applied.items.length === 0 && data.checkpointCount > 0 && <p className="task-changes-empty">No checkpointed file differs from its baseline.</p>}
      {applied.truncated && <p className="task-changes-warning" role="note">Only the first {applied.items.length} files are listed.</p>}
      {applied.items.map(item => {
        const note = diffNote(item.diff);
        return <article className="task-changes-item" key={item.path}>
          <h5><span className="task-changes-state">{appliedLabel[item.state]}</span> <code>{item.path}</code>
            {item.oldPath && <span> (from <code>{item.oldPath}</code>)</span>}<span className="task-changes-counts">{counts(item.diff.additions, item.diff.deletions)}</span></h5>
          <p className="task-changes-meta">Via checkpoint · {formatBytes(item.before.size)} → {item.after.size === null ? 'unknown' : formatBytes(item.after.size)}
            {item.otherCheckpointTasks.length > 0 && <strong> · Also checkpointed later by: {item.otherCheckpointTasks.join(', ')}</strong>}</p>
          {item.state === 'unverified' && item.diff.reason && <p className="task-changes-warning">Current file could not be verified ({item.diff.reason}).</p>}
          {item.state !== 'unverified' && note && <p className="task-changes-warning" role="note">{note}</p>}
          {item.diff.text && <DiffBlock path={item.path} text={item.diff.text} />}
        </article>;
      })}
    </Group>
    <Group title="External or unattributed changes" summary={external.state === 'ok'
      ? 'Files Git reports as changed that this task did not change through a checkpoint. They may be uncommitted work from before the task, shell commands, or other tasks. Ownership is not claimed.'
      : `Git status is unavailable (${external.reason ?? 'unknown reason'}), so external changes cannot be listed.`}>
      {external.state === 'ok' && external.items.length === 0 && <p className="task-changes-empty">No other changed files.</p>}
      {external.truncated && <p className="task-changes-warning" role="note">Showing {external.items.length} of {external.total} files.</p>}
      {external.items.length > 0 && <ul className="task-changes-external">{external.items.map(item => <li key={item.path}>
        <span className="task-changes-state">{externalLabel[item.state]}</span> <code>{item.path}</code>
        {item.oldPath && <span> (from <code>{item.oldPath}</code>)</span>}
        {item.binary ? ' · binary' : counts(item.additions, item.deletions)}
        <span className="task-changes-hint"> · Unattributed{item.modifiedAfterTaskStart === true ? ' · modified after this task started (hint only)' : item.modifiedAfterTaskStart === false ? ' · not modified since this task started' : ''}</span>
      </li>)}</ul>}
    </Group>
  </div>;
}

/** Read-only: never sends anything except a lookup by task id; it cannot stage, commit or restore. */
export function TaskChangesPanel({ taskId, presentation = 'inline' }: { taskId: string; presentation?: 'inline' | 'popover' }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [data, setData] = useState<TaskChanges>();
  const [error, setError] = useState<string>();
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>();
  const regionId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const pending = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | undefined>(undefined);
  const load = useRef(() => {});

  useEffect(() => {
    const finish = () => { if (pending.current) clearTimeout(pending.current.timer); pending.current = undefined; };
    load.current = () => {
      finish();
      const id = requestId();
      setState('loading'); setError(undefined);
      pending.current = { id, timer: setTimeout(() => { pending.current = undefined; setState('error'); setError('The request timed out. Use Refresh to retry.'); }, REPLY_TIMEOUT_MS) };
      postHost({ type: 'task-changes-get', requestId: id, taskId });
    };
    const unsubscribe = subscribeHost(message => {
      if ((message.type !== 'task-changes-result' && message.type !== 'task-changes-error') || message.requestId !== pending.current?.id) return;
      finish();
      if (message.type === 'task-changes-error') { setState('error'); setError(message.error); return; }
      const value = message.result;
      if (!value || value.taskId !== taskId || !Array.isArray(value.requests) || !value.applied || !Array.isArray(value.applied.items) || !value.external || !Array.isArray(value.external.items)) {
        setState('error'); setError('The response was not a valid task changes report.'); return;
      }
      setData(value); setState('ready');
    });
    return () => { finish(); unsubscribe(); };
  }, [taskId]);

  useLayoutEffect(() => {
    if (!open || presentation !== 'popover') return;
    const position = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(520, window.innerWidth - 32);
      const above = rect.top - 56, below = window.innerHeight - rect.bottom - 16;
      const placeAbove = above >= 180 || above >= below;
      setPopoverStyle({ left: Math.max(width / 2 + 16, Math.min(window.innerWidth - width / 2 - 16, rect.left + rect.width / 2)),
        ...(placeAbove ? { bottom: window.innerHeight - rect.top + 12 } : { top: rect.bottom + 12 }),
        maxHeight: Math.max(60, Math.min(380, (placeAbove ? above : below) - 12)) });
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open, presentation]);
  useEffect(() => { if (open && presentation === 'popover') region.current?.focus({ preventScroll: true }); }, [open, presentation]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && state === 'idle') load.current();
  };
  const empty = state === 'ready' && data && !data.requests.length && !data.applied.items.length && !data.applied.unchanged
    && data.external.state === 'ok' && !data.external.items.length;

  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className={'task-changes'+(presentation === 'popover' ? ' task-changes-popover' : '')}>
    <div className="task-changes-bar">
      <button ref={trigger} type="button" className="tiny-button" aria-expanded={open} aria-controls={regionId} onClick={toggle}>
        {open ? 'Hide actual changes' : 'Show actual changes'}
      </button>
      {open && presentation === 'inline' && <button type="button" className="tiny-button" disabled={state === 'loading'} onClick={() => load.current()}>
        <RefreshCw size={14} aria-hidden="true" />{state === 'loading' ? 'Checking…' : 'Refresh'}
      </button>}
    </div>
    <div ref={region} id={regionId} hidden={!open} role="region" aria-label="Actual changes for this task" style={presentation === 'popover' ? popoverStyle : undefined} tabIndex={presentation === 'popover' ? -1 : undefined} onKeyDown={event => { if (presentation === 'popover' && event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      {open && presentation === 'popover' && <div className="task-changes-popover-heading"><FileCode size={15}/><b>Modified files · task evidence</b><button type="button" aria-label="Refresh file changes" disabled={state === 'loading'} onClick={() => load.current()}><RefreshCw size={14}/></button><button type="button" aria-label="Close file changes" onClick={close}><X size={15}/></button></div>}
      {open && <p className="task-changes-note">Read-only comparison of the files on disk with this task's checkpoints and Git. Nothing is staged, committed or restored.</p>}
      {open && state === 'loading' && <p role="status" className="task-changes-status">Reading checkpoints and Git…</p>}
      {open && state === 'error' && <p role="alert" className="task-changes-error">{error ?? 'Actual changes are unavailable.'}</p>}
      {open && empty && <p className="task-changes-empty" role="status">No changes were recorded for this task and the working tree is clean.</p>}
      {open && state === 'ready' && data && !empty && <Result data={data} />}
      {open && state === 'ready' && data && <p className="task-changes-meta">Generated {new Date(data.generatedAt).toLocaleString()}</p>}
    </div>
  </div>;
}
