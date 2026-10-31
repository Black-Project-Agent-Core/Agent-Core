import { useEffect, useState } from 'react';
import { ArrowRight, Boxes, BrainCircuit, Code2, Database, FileText, Folder, RefreshCw, Search, Sparkles, Target } from 'lucide-react';
import { MetricCard, PageHero, Panel, StatusBadge, TinyButton, Toggle, type PageId } from './components';
import { TaskChangesPanel } from './TaskChangesPanel';
import { Plus, Moon, ListTodo, Lock } from 'lucide-react';
import { PrototypeHeader, PrototypeCard, UpgradeControl } from './PrototypePages';
import type { AgentChatUiState, DesktopSnapshot } from './host';

type Props = {
  dreaming?: import('./host').DreamingUiState;
  onDreaming?: (run?: boolean) => void;
  snapshot?: DesktopSnapshot; agentChat: AgentChatUiState; setPage: (page: PageId) => void;
  onAction: (action: string) => void; onChatProvider?: (provider: string) => void;
  onChatModel?: (model: string) => void;
  /** Skills page: turns one skill on or off for Native / asks the host for the skill list again. */
  onSkillSet?: (name: string, enabled: boolean) => void;
  onSkillsReload?: () => void;
};

export function ModelsPage(props: Props) {
  const providers = props.agentChat.providers;
  const busy = Boolean(props.agentChat.runningRequestId)
    || props.agentChat.active?.turns.some(turn => turn.status === 'running' || turn.status === 'resumable');
  return <div className="prototype-page launcher-data-page">
    <PrototypeHeader title="AI Model & Inference Management" badge="Multi-Provider" description="Choose a session model from providers configured in Agent Core."><UpgradeControl reason="Provider and credential editing has no desktop write contract."><Plus size={14}/>Add Provider</UpgradeControl></PrototypeHeader>
    {!providers && <Panel><p role="status">Waiting for provider information from the desktop host.</p></Panel>}
    {providers?.length === 0 && <Panel><p>No providers are configured.</p></Panel>}
    <div className="launcher-provider-grid">{providers?.flatMap(provider => {
      const models = provider.models?.length ? provider.models : [{ id: provider.model || 'Model unavailable' }];
      return models.map(model => <PrototypeCard key={provider.id+model.id} className="launcher-provider-card">
        <div className="launcher-card-title"><Boxes size={20}/><h2>{model.id}</h2><StatusBadge
          tone={!provider.configured ? 'offline' : provider.available ? 'healthy' : 'warning'}
          label={!provider.configured ? 'Not configured' : provider.available ? 'Available' : 'Waiting'}/></div>
        <p>Provider: {provider.id}</p>
        {provider.issue && <p>{provider.issue}</p>}
        {provider.retryAt && <small>Eligible after {new Date(provider.retryAt).toLocaleString()}</small>}
        <dl className="prototype-model-facts"><dt>Context Window</dt><dd>Not reported</dd><dt>Reasoning Support</dt><dd>{provider.id === 'anthropic' ? (provider.models?.find(item => item.id === model.id)?.reasoningEfforts ?? provider.reasoningEfforts ?? []).join(' · ') || 'Automatic' : 'Provider default'}</dd><dt>Provider Configuration</dt><dd>{provider.configured?'Configured':'Needs setup'}</dd><dt>Estimated Pricing</dt><dd>Not reported</dd></dl>
        <div className="prototype-model-footer"><span><Lock size={12}/>Credentials stay in the host</span><UpgradeControl reason="No inference-test command is available in the desktop bridge.">Test Inference</UpgradeControl>
          <TinyButton kind="primary" disabled={busy || !provider.configured || !provider.model || !props.onChatProvider || (Boolean(provider.models?.length) && !props.onChatModel)}
            onClick={() => { props.onChatProvider?.(provider.id); if (provider.models?.some(item => item.id === model.id)) props.onChatModel?.(model.id); props.setPage('chat'); }}>Use <ArrowRight size={13}/></TinyButton>
        </div>
      </PrototypeCard>);
    })}</div>
  </div>;
}

export function MemoryPage(props: Props) {
  const [search, setSearch] = useState('');
  const memory = props.snapshot?.health.memory;
  const uses = [...new Map((props.agentChat.active?.turns ?? []).flatMap(turn => turn.memoryUse ?? []).map(use => [use.memoryId, use])).values()];
  const shown = uses.filter(use => `${use.title} ${use.memoryId}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="prototype-page launcher-data-page">
    <PrototypeHeader title="Canonical Memory & Vector Explorer" badge="Deterministic Store" description="Canonical Memory health and recorded use in the selected conversation.">
      <UpgradeControl reason="Index rebuilding has no launcher command."><RefreshCw size={14}/>Rebuild Derived Index</UpgradeControl>
      <TinyButton disabled={!props.snapshot} onClick={() => props.onAction('open-memory-folder')}><Folder size={15}/>Open Memory Store</TinyButton>
    </PrototypeHeader>
    <div className="fidelity-filter-row"><label className="prototype-search"><Search size={16}/><input aria-label="Search conversation memory" placeholder="Search used memory by title or ID…" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <div className="fidelity-filter-chips"><button aria-pressed="true">Conversation Records</button>{['Project Architecture','User Preference','Technical Fact','Workflow Pattern'].map(category=><button key={category} disabled title="Full-store category browsing is a planned upgrade">{category}</button>)}</div></div>
    {shown.length ? <div className="fidelity-memory-grid">{shown.map(use => <PrototypeCard key={use.memoryId} className="fidelity-memory-card"><div className="fidelity-memory-head"><div><h2>{use.title}</h2><small>Conversation record</small></div><span className="fidelity-record-status">{use.verification === 'unavailable' ? 'Outcome unavailable' : `Outcome ${use.verification}`}</span></div><p>{use.applicability} · {use.verification === 'unavailable' ? 'Outcome unavailable' : `Outcome ${use.verification}`}</p><div className="fidelity-record-meta"><span>Record ID: {use.memoryId}</span><span>Scope: selected conversation</span><span>Evidence references: {use.evidenceRefs?.length ?? 'Not recorded'}</span></div></PrototypeCard>)}</div>
      : <div className="fidelity-empty-card" role="status"><Database size={18}/><div><h2>{search ? 'No matching records' : 'No recorded memory use'}</h2><p>{search ? 'Try another title or record ID.' : 'Select a conversation to review the Memory records it used.'}</p></div></div>}
    <p className="fidelity-scope-note">Conversation memory use · Full-store browsing, categories, editing, and import/export are planned upgrades. Recorded use does not establish causal benefit.<br/>Canonical records: {memory?.noteCount ?? '—'} · Index: {memory?.index ?? 'Unavailable'} · Used in this chat: {uses.length}</p>
  </div>;
}

export function GoalsPage(props: Props) {
  const active = props.agentChat.active;
  const turn = active?.turns.at(-1);
  const prompt = active?.messages.find(message => message.turnId === turn?.id && message.role === 'user');
  const evidence = turn && active?.decisionEvidence?.taskId === turn.runtimeTaskId ? active.decisionEvidence : undefined;
  return <div className="prototype-page launcher-data-page prototype-goals">
    <PrototypeHeader title="Goals & Execution Plans" badge="Goal-Oriented Harness" description="Link task objectives to recorded decisions and verifiable deliverables.">
      <UpgradeControl reason="Strategic goal and milestone management is not connected."><Plus size={14}/>New Goal</UpgradeControl>
      <TinyButton onClick={() => props.setPage('chat')}>Open AI Workspace <ArrowRight size={15}/></TinyButton>
    </PrototypeHeader>
    <div className="fidelity-goal-columns"><section><h2 className="fidelity-column-title"><Target size={16}/>Active Strategic Goals</h2>
    {turn ? <PrototypeCard><div className="launcher-card-title"><h2>Current task</h2><StatusBadge tone={turn.status === 'failed' ? 'error' : turn.status === 'running' ? 'warning' : 'unknown'} label={turn.status}/></div>
        {prompt && <p className="launcher-task-prompt">{prompt.content}</p>}
        <dl className="launcher-definition-list"><dt>Task</dt><dd>{turn.runtimeTaskId}</dd><dt>Workspace</dt><dd>{active?.conversation.workspace}</dd>
          <dt>Reasoning</dt><dd>{turn.reasoningEffort ?? 'auto'}</dd><dt>Iterations</dt><dd>{turn.iterations ?? 'Not recorded'}</dd></dl>
        <div className="fidelity-milestones"><b>Milestones &amp; Evidence</b><p>Persistent strategic goals and milestone checklists are a planned upgrade.</p></div>
      </PrototypeCard> : <div className="fidelity-empty-card"><Target size={18}/><div><h2>No task selected</h2><p>Open a conversation or start a task in the AI Workspace. Persistent strategic goals and milestone checklists are a planned upgrade.</p></div></div>}</section>
      <section><h2 className="fidelity-column-title"><ListTodo size={16}/>Decomposed Task Plan Steps</h2>
      <div className="fidelity-empty-card"><ListTodo size={18}/><div><h2>Plan steps are not connected</h2><p>Structured plan steps are a planned upgrade. Available task evidence appears below.</p></div></div>
      {turn && <PrototypeCard><h2>Recorded decisions</h2><p>Agent-declared checks are separate from verification of the task result.</p>
        {evidence?.status === 'available' ? evidence.records.map(record => <section className="launcher-decision" key={record.id}><h3>{record.question}</h3><p>{record.summary}</p>
          {record.alternatives.map(row => <div key={row.id}><b>{row.claim}</b><span>Declared: {row.status}</span><p>Check: {row.check}</p></div>)}</section>)
          : <p>No decision evidence is available for this task.</p>}
        {evidence?.truncated && <p>The summary omits some detail; full history is preserved.</p>}
      </PrototypeCard>}</section></div>
  </div>;
}

export function ArtifactsPage(props: Props) {
  const turn = props.agentChat.active?.turns.at(-1);
  return <div className="prototype-page launcher-data-page">
    <PrototypeHeader title="Artifacts & Deliverables Management" badge="Traceable Outputs" description="Inspect file-changing requests and observed changes for the selected task.">
      <UpgradeControl reason="Attachment transport is not connected."><Plus size={14}/>Import File</UpgradeControl>
      <TinyButton disabled={!props.snapshot} onClick={() => props.onAction('open-folder')}><Folder size={15}/>Open Workspace</TinyButton>
    </PrototypeHeader>
    <div className="fidelity-filter-row"><label className="prototype-search"><Search size={16}/><input aria-label="Search artifacts" placeholder="Search artifacts by name…" disabled title="Artifact catalog search is a planned upgrade"/></label><div className="fidelity-filter-chips"><button aria-pressed="true">Task Changes</button><button disabled title="Typed artifact catalog is a planned upgrade">AI Generated</button><button disabled>Code</button><button disabled>Report</button><button disabled>User Import</button></div></div>
    <p className="fidelity-scope-note">Artifact catalog and search are planned upgrades. Task changes below use recorded checkpoints and Git evidence.</p>
    <div className="fidelity-artifact-grid"><PrototypeCard className="fidelity-artifact-card"><div className="fidelity-artifact-top"><FileText size={20}/><span>Task evidence</span></div><h2>Task changes</h2><p>{turn ? 'Inspect recorded file changes for the selected task.' : 'Select a conversation to inspect its file changes.'}</p>{turn ? <TaskChangesPanel key={turn.runtimeTaskId} taskId={turn.runtimeTaskId}/> : <TinyButton onClick={() => props.setPage('chat')}>Open AI Workspace</TinyButton>}</PrototypeCard>
      <PrototypeCard className="fidelity-artifact-card"><div className="fidelity-artifact-top"><Code2 size={20}/><span>Planned upgrade</span></div><h2>Code artifacts</h2><p>Artifact library and editor are not connected.</p></PrototypeCard>
      <PrototypeCard className="fidelity-artifact-card"><div className="fidelity-artifact-top"><Folder size={20}/><span>Planned upgrade</span></div><h2>Reports &amp; imports</h2><p>Artifact catalog and file imports are not connected.</p></PrototypeCard></div>
  </div>;
}

export function LearningPage(props: Props) {
  const health = props.snapshot?.health;
  const state = props.dreaming;
  const data = state?.data;
  const cycle = data?.lastCycle;
  const waiting = state?.state === 'loading' || state?.state === 'running';
  useEffect(() => { props.onDreaming?.(false); }, []);
  const reasonNames: Record<string, string> = { unchanged: 'Unchanged plans', sourceChanged: 'Source changed', sourceUnavailable: 'Source unavailable',
    ineligible: 'Ineligible sources/plans', unsafe: 'Unsafe sources', budgetDeferred: 'Deferred by cycle limit', commitFailed: 'Commit failed', legacyUnknown: 'Legacy needs review' };
  return <div className="prototype-page launcher-data-page fidelity-dreaming">
    <PrototypeHeader title="Dreaming: REM Memory Consolidation" badge="REM" description="Consolidate eligible episodic memories from current sources. Status and results come from the active Memory engine.">
      <TinyButton disabled={!props.onDreaming || !data?.enabled || data.busy || waiting} onClick={() => props.onDreaming?.(true)}><Moon size={14}/>{state?.state === 'running' ? 'Running REM…' : 'Run Dreaming Now'}</TinyButton>
      <TinyButton disabled={!props.onDreaming || waiting} onClick={() => props.onDreaming?.(false)}><RefreshCw size={15}/>Refresh status</TinyButton>
    </PrototypeHeader>
    {state?.error && <p role="alert">Dreaming failed: {state.error}</p>}
    {data?.loopError && <p role="alert">The automatic cycle reported an error. Check Activity Log.</p>}
    <div className="launcher-summary-grid">
      <MetricCard icon={BrainCircuit} value={data ? data.enabled ? 'Enabled' : 'Disabled' : '—'} label="REM consolidation"/>
      <MetricCard icon={Target} value={data ? data.busy ? 'Running' : data.loopRunning ? 'On' : 'Off' : '—'} label="Automatic loop"/>
      <MetricCard icon={FileText} value={data ? `${data.intervalMs / 60000} min` : '—'} label="Cycle interval"/>
    </div>
    <section className="fidelity-dream-section"><h2 className="fidelity-column-title"><Sparkles size={16}/>Last REM cycle</h2>{cycle ? <>
      <p>Started: <time dateTime={cycle.startedAt}>{new Date(cycle.startedAt).toLocaleString()}</time> · Completed: <time dateTime={cycle.completedAt}>{new Date(cycle.completedAt).toLocaleString()}</time> · {cycle.mode === 'applied' ? 'Applied' : 'Preview'}</p>
      <div className="launcher-summary-grid"><MetricCard icon={FileText} value={cycle.planned ?? '—'} label="Planned digests"/><MetricCard icon={Database} value={cycle.created ?? '—'} label="Created"/><MetricCard icon={RefreshCw} value={cycle.updated ?? '—'} label="Updated"/></div>
      <p role={cycle.failed || cycle.errors || cycle.indexIssues ? 'alert' : 'status'}>Failed: {cycle.failed ?? '—'} · Cycle errors: {cycle.errors} · Index issues: {cycle.indexIssues ?? '—'}</p>
      <ul className="launcher-record-list">{Object.entries(cycle.reasons).map(([reason,count])=><li key={reason}><span>{reasonNames[reason] ?? reason}</span><b>{count}</b></li>)}</ul>
      <p>Unchanged or excluded sources do not create a new digest. Source exclusions and plan decisions have separate counts.</p>
    </> : <p>{waiting ? 'Reading the active REM engine…' : data ? 'No REM cycle recorded since this Core started.' : 'REM status has not been read.'}</p>}</section>
    <section className="fidelity-dream-section fidelity-audit"><h2 className="fidelity-column-title">Consolidation Audit Trail · Knowledge sinks</h2>{health?.learning.sinkStatus.length ? <ul className="launcher-record-list">{health.learning.sinkStatus.map(sink => <li key={sink.name}><b>{sink.name}</b><StatusBadge tone={sink.available ? 'healthy' : 'error'} label={sink.available ? 'Available' : 'Unavailable'}/></li>)}</ul>
      : <p>Waiting for Learning status from the desktop host.</p>}<div className="launcher-inline-actions"><TinyButton onClick={() => props.setPage('chat')}>Current conversation</TinyButton><TinyButton onClick={() => props.setPage('activity')}>Activity Log</TinyButton></div></section>
  </div>;
}

/** First 8 hex digits of a skill digest ("sha256:0123abcd…" -> "0123abcd"). */
const shortDigest = (digest: string) => digest.replace(/^[^:]*:/, '').slice(0, 8);

export function SkillsPage(props: Props) {
  const [search, setSearch] = useState('');
  const skills = props.agentChat.skills;
  const items = skills?.items ?? [];
  const activeCount = items.filter(skill => skill.enabled).length;
  const needle = search.trim().toLowerCase();
  const shown = needle ? items.filter(skill => `${skill.name} ${skill.description}`.toLowerCase().includes(needle)) : items;
  // Nothing to show yet: no answer from the host so far (a reload over an existing list keeps the list visible).
  const loading = !skills || skills.state === 'idle' || (skills.state === 'loading' && items.length === 0);
  const failure = skills && (skills.error || skills.state === 'error') ? skills.error || 'Daftar skill tidak dapat dimuat.' : undefined;
  return <div className="prototype-page launcher-data-page">
    <PrototypeHeader title="Skill" badge="Native hard block" description="Daftar skill terpasang. OFF = Native dilarang membaca atau memakainya. Native hanya boleh meminta kamu mengaktifkannya lewat jawabannya."/>
    {failure && <div className="skill-page-alert" role="alert"><span>{failure}</span><TinyButton onClick={() => props.onSkillsReload?.()}>Muat ulang</TinyButton></div>}
    {loading && !failure && <Panel><p role="status">Memuat daftar skill…</p></Panel>}
    {!loading && items.length > 0 && <>
      <p className="skill-page-summary">{`${activeCount} aktif · ${items.length - activeCount} nonaktif`}</p>
      <div className="fidelity-filter-row"><label className="prototype-search"><Search size={16}/><input aria-label="Cari skill" placeholder="Cari skill berdasarkan nama atau deskripsi…" value={search} onChange={event => setSearch(event.target.value)}/></label></div>
      {shown.length > 0
        ? <ul className="launcher-record-list">{shown.map(skill => <li key={skill.name} className="skill-page-row">
          <div><b className="skill-page-name">{skill.name}</b><p className="skill-page-desc">{skill.description}</p><small className="skill-page-meta">{shortDigest(skill.digest)}</small></div>
          <Toggle on={skill.enabled} disabled={Boolean(skills?.pending?.[skill.name]) || !props.onSkillSet} label={`Skill ${skill.name} untuk Native`} onChange={() => props.onSkillSet?.(skill.name, !skill.enabled)}/>
        </li>)}</ul>
        : <div className="fidelity-empty-card" role="status"><Sparkles size={18}/><div><h2>Tidak ada skill yang cocok</h2><p>Coba nama atau kata lain dari deskripsi skill.</p></div></div>}
    </>}
    {!loading && !failure && items.length === 0 && <div className="fidelity-empty-card" role="status"><Sparkles size={18}/><div><h2>Belum ada skill terpasang</h2><p>Agent Core belum memiliki skill aktif yang bisa diatur dari sini.</p></div></div>}
  </div>;
}
