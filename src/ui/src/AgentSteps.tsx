import React, { useEffect, useState } from 'react';
import type { AgentChatStepMeta, StepDetailState } from './host';

/** 1,2 s style for >= 1 s (comma decimal, as in the product copy); whole ms below that. */
export function formatStepDuration(ms: number): string {
  return ms < 1000 ? Math.max(0, Math.round(ms)) + ' ms' : (ms / 1000).toFixed(1).replace('.', ',') + ' s';
}

export const STEP_GLYPH: Record<AgentChatStepMeta['status'], { glyph: string; label: string }> = {
  ok: { glyph: '✓', label: 'Berhasil' },
  error: { glyph: '✗', label: 'Gagal' },
  running: { glyph: '…', label: 'Berjalan' },
};

const boxStyle: React.CSSProperties = { maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 };

function StepText({ title, text, truncated, action }: { title: string; text?: string; truncated?: boolean; action?: React.ReactNode }) {
  return <section className="chat-step-section">
    <h4>{title}{action}</h4>
    <pre style={boxStyle}>{text ?? ''}</pre>
    {truncated && <small>{title} dipotong 16 KB</small>}
  </section>;
}

/** One persisted tool step: a single line that opens into the exact Input and Output (fetched on first open). */
export function AgentStepRow({ step, detail, onOpen, readOnly }: {
  step: AgentChatStepMeta; detail?: StepDetailState; onOpen?: (turnId: string, seq: number) => void; readOnly?: boolean;
}) {
  const [opened, setOpen] = useState(false);
  // A read-only row never opens and never requests its detail.
  const open = opened && !readOnly;
  const status = STEP_GLYPH[step.status];
  const settled = step.status !== 'running';
  // Fetch on open, but not while the step still runs: its Output is not final and would stay cached.
  useEffect(() => {
    if (open && settled && (!detail || detail.status === 'error')) onOpen?.(step.turnId, step.seq);
  }, [open, settled]);
  const toggle = () => { if (!readOnly) setOpen(value => !value); };
  return <li className={'chat-step chat-step-' + step.status}>
    <button type="button" className="chat-step-toggle" aria-expanded={open} onClick={toggle} disabled={readOnly}
      style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'baseline', textAlign: 'left' }}>
      <b>{step.status === 'running' ? 'Using ' : 'Used '}{step.toolName}</b>
      <span aria-label={status.label} title={status.label}>{status.glyph}</span>
      {step.durationMs !== undefined && <span>{formatStepDuration(step.durationMs)}</span>}
    </button>
    {step.argsSummary && <code style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.argsSummary}</code>}
    {open && <div className="chat-step-detail">
      {!settled && <p>langkah masih berjalan...</p>}
      {settled && (!detail || detail.status === 'loading') && <p>memuat...</p>}
      {settled && detail?.status === 'error' && <p role="alert">{detail.error ?? 'Gagal memuat langkah'}</p>}
      {settled && detail?.status === 'ready' && <>
        <StepText title="Input" text={detail.inputText} truncated={detail.inputTruncated}
          action={<button type="button" aria-label="Copy input" onClick={() => { void navigator.clipboard?.writeText(detail.inputText ?? ''); }}>Copy</button>}/>
        <StepText title="Output" text={detail.outputText} truncated={detail.outputTruncated}/>
      </>}
    </div>}
  </li>;
}
