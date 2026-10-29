import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { WorkflowsPage } from './WorkflowsPage';
import { ProposalCards } from './ProposalCards';
import { ToolExecutionDetail } from './ToolExecutionDetail';
import { TaskChangesPanel } from './TaskChangesPanel';
import { ActivityList, ElapsedSeconds, formatStepDuration } from './AgentActivity';
import { Plus, Paperclip, FolderOpen, Target, ListTodo, Wrench, Send, Shield, Pause } from 'lucide-react';
import { PrototypeDashboard, PrototypeTools, PrototypeRuntime, PrototypeDiagnostics, PrototypeSettings, PrototypeSetup, PrototypeActivity } from './PrototypePages';
import { ArtifactsPage, GoalsPage, LearningPage, MemoryPage, ModelsPage } from './LauncherPages';
import type {
  ActivityEntry,
  AgentChatUiState,
  AgentRunState,
  DesktopSnapshot,
  ReasoningChoice,
  ReasoningEffort,
} from './host';
import { buildSystems, systemCounts } from './systems';
import { formatBytes, formatDuration, labelForTone, type SystemView, type Tone } from './model';
import {
  AppShell, FilterChip, IconWell, MetricCard, PageHero, Panel, RuntimeActions, SectionTitle,
  Sparkline, StatusBadge, SystemCard, Tabs, TinyButton, Toggle, toneClass, systemIcons, uiIcons,
  type PageId,
} from './components';

const {
  Activity, AlertTriangle, ArrowRight, BookOpen, Boxes, BrainCircuit, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleSlash, Clock3, Code2,
  Cpu, Database, Download, ExternalLink, FileText, Folder, Gamepad2, Gauge, HardDrive, HeartPulse,
  Info, KeyRound, LayoutDashboard, Link2, ListChecks, MessageSquarePlus, MoreHorizontal, Play, Power, Puzzle, RefreshCw,
  Search, Settings, ShieldCheck, Smartphone, Stethoscope, Terminal, Trash2, UserRound, Wifi, X, XCircle,
}=uiIcons;

type SharedProps = {
  snapshot?: DesktopSnapshot;
  logs: ActivityEntry[];
  onAction:(id:string)=>void;
  setPage:(id:PageId)=>void;
  agentRun: AgentRunState;
  onAgentRun:(prompt:string,workspace?:string)=>void;
  agentChat: AgentChatUiState;
  onChatCreate:(workspace?:string)=>void;
  onChatOpen:(conversationId:string)=>void;
  onChatSend:(conversationId:string,prompt:string,goalMode?:boolean)=>void;
  onChatCancel:(turnId:string)=>void;
  onChatResume?:(conversationId:string,turnId:string)=>void;
  onChatPause?:(conversationId:string,turnId:string)=>void;
  /** Loads the exact Input/Output of one persisted tool step (answered via agentChat.stepDetails). */
  onStepDetail?:(turnId:string,seq:number)=>void;
  onChatArchive:(conversationId:string)=>void;
  onChatProvider?:(choice:string)=>void;
  onChatModel?:(choice:string)=>void;
  onChatReasoning?:(choice:ReasoningChoice)=>void;
};

const statusTone=(status?:string, issues=0):Tone=>{
  const s=String(status??'').toLowerCase();
  if((s==='available'||s==='ok'||s==='current'||s==='running'||s==='online')&&issues===0)return'healthy';
  if(s==='degraded'||issues>0)return'degraded';
  if(s==='error'||s==='unavailable'||s==='failed')return'error';
  if(s==='offline'||s==='off'||s==='not-configured')return'offline';
  return'unknown';
};

const levelTone=(level:ActivityEntry['level']):Tone=>level==='error'?'error':level==='warn'?'warning':level==='success'?'healthy':level==='sys'?'unknown':'unknown';
const latest=(logs:ActivityEntry[],count=6)=>logs.slice(-count).reverse();
const memoryPercent=(snapshot?:DesktopSnapshot)=>{
  const used=snapshot?.core.workingSetBytes;
  const capacity=snapshot?.core.memoryCapacityBytes;
  if(!Number.isFinite(used)||!Number.isFinite(capacity)||Number(capacity)<=0)return 0;
  return Math.max(0,Math.min(100,(Number(used)/Number(capacity))*100));
};

function Breadcrumb({current}:{current:string}) {
  return <div className="breadcrumb"><LayoutDashboard size={16}/><span>Dashboard</span><ChevronRight size={14}/><b>{current}</b></div>;
}

function HealthCounts({systems}:{systems:SystemView[]}) {
  const c=systemCounts(systems);
  return <div className="kpi-grid">
    <MetricCard icon={ShieldCheck} value={c.healthy} label="Healthy" caption="Systems operational" tone="healthy"/>
    <MetricCard icon={AlertTriangle} value={c.degraded+c.warning} label="Degraded" caption="Attention required" tone="warning"/>
    <MetricCard icon={CircleAlert} value={c.error} label="Error" caption="Systems failing" tone="error"/>
    <MetricCard icon={CircleSlash} value={c.offline} label="Offline" caption="Not configured" tone="offline"/>
  </div>;
}

export function DashboardPage(props:SharedProps) {
  const systems=buildSystems(props.snapshot);
  const counts=systemCounts(systems);
  const [filter,setFilter]=useState<'all'|Tone>('all');
  const visible=filter==='all'?systems:systems.filter(s=>s.tone===filter||(filter==='warning'&&s.tone==='degraded'));
  return <div className="page dashboard-page">
    <Panel className="dashboard-hero">
      <div className="dashboard-hero-top"><div><h1>System Dashboard</h1><p>Monitor and manage all Agent Core internal systems in real-time.</p></div><RuntimeActions snapshot={props.snapshot} onAction={props.onAction}/></div>
      <HealthCounts systems={systems}/>
    </Panel>

    <ProposalCards/>

    <Panel className="systems-panel">
      <SectionTitle icon={Settings} title="Internal Systems" subtitle="Real-time status of all Agent Core subsystems." action={<div className="filter-row">
        <FilterChip active={filter==='all'} label="All" count={counts.all} onClick={()=>setFilter('all')}/>
        <FilterChip active={filter==='healthy'} label="Healthy" count={counts.healthy} tone="healthy" onClick={()=>setFilter('healthy')}/>
        <FilterChip active={filter==='warning'} label="Warning" count={counts.degraded+counts.warning} tone="warning" onClick={()=>setFilter('warning')}/>
        <FilterChip active={filter==='error'} label="Error" count={counts.error} tone="error" onClick={()=>setFilter('error')}/>
        <FilterChip active={filter==='offline'} label="Offline" count={counts.offline} tone="offline" onClick={()=>setFilter('offline')}/>
        <FilterChip active={filter==='unknown'} label="Unknown" count={counts.unknown} tone="unknown" onClick={()=>setFilter('unknown')}/>
      </div>}/>
      <div className="dashboard-system-grid">
        {visible.map(s=><SystemCard key={s.id} system={s} compact onClick={()=>props.setPage('systems')}/>)}
      </div>
    </Panel>

    <div className="dashboard-bottom-grid">
      <Panel>
        <SectionTitle icon={Activity} title="Recent Activity" action={<button className="link-button" onClick={()=>props.setPage('activity')}>View All Logs <ArrowRight size={14}/></button>}/>
        <div className="recent-list">{latest(props.logs,3).map(log=><div className="recent-row" key={log.id}><time>{log.time}</time><span className={`log-chip ${toneClass(levelTone(log.level))}`}>{log.module}</span><span>{log.message}</span></div>)}
          {!props.logs.length&&<div className="empty-copy">No activity recorded in this desktop session.</div>}
        </div>
      </Panel>
      <Panel>
        <SectionTitle icon={HeartPulse} title="System Health" subtitle="Overall system status and resource usage." action={<StatusBadge tone={!props.snapshot?'unknown':counts.error?'error':counts.degraded||counts.warning?'degraded':counts.offline||counts.unknown?'unknown':'healthy'} label={!props.snapshot?'WAITING':counts.error?'ERROR':counts.degraded||counts.warning?'DEGRADED':counts.offline||counts.unknown?'PARTIAL':'HEALTHY'}/>}/>
        <div className="mini-health-grid">
          <div><IconWell icon={Cpu}/><span>CPU</span><b>{props.snapshot?.core.cpuPercent===undefined?'-':`${Math.round(props.snapshot.core.cpuPercent)}%`}</b><div className="mini-bar"><i style={{width:`${Math.min(props.snapshot?.core.cpuPercent??0,100)}%`}}/></div></div>
          <div><IconWell icon={Database}/><span>Memory</span><b>{formatBytes(props.snapshot?.core.workingSetBytes)}</b><div className="mini-bar blue"><i style={{width:`${memoryPercent(props.snapshot)}%`}}/></div></div>
          <div><IconWell icon={Clock3}/><span>Uptime</span><b>{formatDuration(props.snapshot?.core.uptimeSeconds)}</b><div className="mini-bar purple"><i style={{width:props.snapshot?.core.httpHealthy?'100%':'0%'}}/></div></div>
        </div>
      </Panel>
    </div>
  </div>;
}

export function CoreRuntimePage(props:SharedProps) {
  const snap=props.snapshot;
  const cpu=snap?.core.cpuPercent;
  const memory=snap?.core.workingSetBytes;
  const capacity=snap?.core.memoryCapacityBytes;
  const [samples,setSamples]=useState<Array<{cpu:number;memory:number}>>([]);
  useEffect(()=>{
    if(!snap?.capturedAt)return;
    const nextCpu=Number.isFinite(snap.core.cpuPercent)?Number(snap.core.cpuPercent):0;
    const nextMemory=memoryPercent(snap);
    setSamples(prev=>[...prev,{cpu:nextCpu,memory:nextMemory}].slice(-24));
  },[snap?.capturedAt,snap?.core.cpuPercent,snap?.core.workingSetBytes,snap?.core.memoryCapacityBytes]);
  const cpuData=samples.map(item=>item.cpu);
  const memData=samples.map(item=>item.memory);
  return <div className="page core-page">
    <Breadcrumb current="Core Runtime"/>
    <Panel className="runtime-hero">
      <div className="runtime-hero-main"><IconWell icon={Cpu} tone={snap?.core.httpHealthy?'healthy':'error'} large/><div><div className="title-with-badge"><h1>Core Runtime</h1><StatusBadge tone={snap?.core.httpHealthy?'healthy':'error'} label={snap?.core.httpHealthy?'Running':'Stopped'}/></div><h3>Main agent process and runtime environment</h3><p>The Core Runtime manages the agent process, memory, tools, and coordinates all internal services. It runs locally on your machine.</p></div></div>
      <RuntimeActions snapshot={snap} onAction={props.onAction}/>
      <div className="runtime-metric-row">
        <div><IconWell icon={Info}/><span>Version</span><b>v{snap?.version??'-'}</b></div>
        <div><IconWell icon={Clock3}/><span>Uptime</span><b>{formatDuration(snap?.core.uptimeSeconds)}</b></div>
        <div><IconWell icon={Cpu}/><span>PID</span><b>{snap?.core.pid??'-'}</b></div>
        <div><IconWell icon={Link2}/><span>Port</span><b>{snap?.core.port??8765}</b></div>
        <div><IconWell icon={HeartPulse} tone={snap?.core.httpHealthy?'healthy':'error'}/><span>HTTP Health</span><b className={snap?.core.httpHealthy?'text-green':'text-red'}>{snap?.core.httpHealthy?'Responding':'Unavailable'}</b></div>
      </div>
    </Panel>
    <div className="runtime-middle">
      <Panel>
        <SectionTitle icon={Activity} title="Resource Usage" subtitle="Real-time resource consumption"/>
        <div className="resource-grid">
          <div className="resource-card"><div className="resource-head"><IconWell icon={Cpu}/><div><span>CPU Usage</span><b>{cpu===undefined?'-':`${Math.round(cpu)}%`}</b></div><small>100%</small></div><div className="resource-bar"><i style={{width:`${Math.min(cpu??0,100)}%`}}/></div><Sparkline values={cpuData} tone="healthy"/></div>
          <div className="resource-card"><div className="resource-head"><IconWell icon={Database}/><div><span>Memory Usage</span><b>{formatBytes(memory)}{capacity?<> <small>/ {formatBytes(capacity)}</small></>:null}</b></div><small>{capacity?'Capacity':'Process'}</small></div><div className="resource-bar blue"><i style={{width:`${memoryPercent(snap)}%`}}/></div><Sparkline values={memData} tone="unknown"/></div>
        </div>
      </Panel>
      <Panel>
        <SectionTitle icon={HeartPulse} title="Runtime Health" subtitle="Live status of core services"/>
        <div className="health-rows">
          {[
            ['Main Process',snap?.core.httpHealthy?'Running':'Unavailable'],
            [`HTTP Server (localhost:${snap?.core.port??8765})`,snap?.core.httpHealthy?'Responding':'Unavailable'],
            ['Memory Management',snap?.health.memory.status??'Unknown'],
            ['Tool Registry',snap?.health.execution.status??'Unknown'],
            ['Code Intelligence',snap?.health.codeIntelligence.status??'Unknown'],
            ['IPC / Internal Services',snap?.status.connection==='on'?'Healthy':'Unavailable'],
          ].map(([name,state])=><div key={name}><span><i className={String(state).toLowerCase().includes('unavailable')?'bad':''}/>{name}</span><b>{state}</b></div>)}
        </div>
      </Panel>
    </div>
    <Panel>
      <SectionTitle icon={Activity} title="Recent Activity" subtitle="Latest runtime events and logs" action={<button className="link-button" onClick={()=>props.setPage('activity')}>View All Logs <ArrowRight size={14}/></button>}/>
      <table className="simple-table"><thead><tr><th>Time</th><th>Level</th><th>Message</th></tr></thead><tbody>{latest(props.logs,6).map(log=><tr key={log.id}><td>{log.time}</td><td><span className={`log-chip ${toneClass(levelTone(log.level))}`}>{log.level.toUpperCase()}</span></td><td>{log.message}</td></tr>)}</tbody></table>
    </Panel>
  </div>;
}

export function SystemsPage(props:SharedProps) {
  const systems=buildSystems(props.snapshot);
  const counts=systemCounts(systems);
  const [selectedId,setSelectedId]=useState<string|undefined>();
  const [filter,setFilter]=useState<'all'|Tone>('all');
  const [search,setSearch]=useState('');
  const selected=systems.find(s=>s.id===selectedId)??systems.find(s=>s.tone==='degraded'||s.tone==='warning'||s.tone==='error')??systems[0];
  const shown=systems.filter(s=>(filter==='all'||s.tone===filter||(filter==='warning'&&s.tone==='degraded'))&&(`${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase())));
  return <div className="page systems-page">
    <Breadcrumb current="Tools Hub & MCP"/>
    <PageHero icon={Boxes} title="Tools Hub & MCP" subtitle="Inspect connected subsystems, capability status, and issue hotspots.">
      <div className="systems-toolbar"><label><Search size={17}/><input placeholder="Search systems..." value={search} onChange={e=>setSearch(e.target.value)}/></label><FilterChip active={filter==='all'} label="All" count={counts.all} onClick={()=>setFilter('all')}/><FilterChip active={filter==='healthy'} label="Healthy" count={counts.healthy} tone="healthy" onClick={()=>setFilter('healthy')}/><FilterChip active={filter==='warning'} label="Warning" count={counts.degraded+counts.warning} tone="warning" onClick={()=>setFilter('warning')}/><FilterChip active={filter==='error'} label="Error" count={counts.error} tone="error" onClick={()=>setFilter('error')}/><FilterChip active={filter==='offline'} label="Offline" count={counts.offline} tone="offline" onClick={()=>setFilter('offline')}/></div>
    </PageHero>
    <div className="systems-summary">{[
      ['Total Systems',counts.all,Boxes,'unknown'],['Healthy',counts.healthy,HeartPulse,'healthy'],['Warning',counts.degraded+counts.warning,AlertTriangle,'warning'],['Error',counts.error,CircleAlert,'error'],['Offline',counts.offline,CircleSlash,'offline'],
    ].map(([l,v,I,t]:any)=><MetricCard key={l} icon={I} value={v} label={l} tone={t}/>)}</div>
    <div className="systems-layout">
      <div className="systems-catalog">{shown.map(s=><SystemCard key={s.id} system={s} selected={s.id===selected?.id} onClick={()=>setSelectedId(s.id)}/>)}</div>
      {selected&&<SystemInspector system={selected} onDiagnostics={()=>props.setPage('diagnostics')} onLogs={()=>props.setPage('activity')}/>}
    </div>
  </div>;
}

function SystemInspector({system,onDiagnostics,onLogs}:{system:SystemView;onDiagnostics:()=>void;onLogs:()=>void}) {
  const Icon=systemIcons[system.id];
  const [tab,setTab]=useState('Overview');
  return <Panel className="system-inspector">
    <div className="inspector-heading"><IconWell icon={Icon} tone={system.tone} large/><div><h2>{system.name}</h2><p>{system.description}</p></div><StatusBadge tone={system.tone} label={system.label}/></div>
    <Tabs items={['Overview','Components','Logs','Dependencies']} active={tab} setActive={setTab}/>
    {tab==='Overview'?<>
      <div className={`status-callout ${toneClass(system.tone)}`}><IconWell icon={system.tone==='healthy'?ShieldCheck:AlertTriangle} tone={system.tone}/><div><small>System Status</small><b>{system.label}</b><span>{system.issue??(system.tone==='healthy'?'All observed components are healthy':'Attention required')}</span></div><strong>{system.issue?'1 issue':'0 issues'}</strong></div>
      <div className="detail-list">{system.meta.map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      <h3 className="mini-heading">Component Status</h3>
      <div className="component-status">{system.meta.slice(0,4).map(([k,v])=><div key={k}><span><i className={system.tone==='healthy'?'':'warn'}/>{k}</span><b>{v}</b></div>)}</div>
      {system.issue&&<div className="issue-card"><div><CircleAlert size={18}/><b>Latest Issue</b></div><strong>{system.issue}</strong><p>Review diagnostics and current system configuration for details.</p></div>}
    </>:<div className="empty-tab"><Info size={24}/><b>{tab}</b><p>This view only exposes evidence currently available from Agent Core.</p></div>}
    <div className="inspector-actions"><TinyButton onClick={onDiagnostics}><Settings size={17}/>Open Diagnostics</TinyButton><TinyButton onClick={onLogs}><FileText size={17}/>View Logs</TinyButton></div>
  </Panel>;
}


export function ActivityLogPage(props:SharedProps) {
  const [auto,setAuto]=useState(true);
  const [level,setLevel]=useState<'all'|'info'|'success'|'warn'|'error'|'sys'>('all');
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState<ActivityEntry|undefined>();
  const [inspectorWidth,setInspectorWidth]=useState(440);
  const [inspectorExpanded,setInspectorExpanded]=useState(false);
  useEffect(()=>{
    if(!props.logs.length){ if(selected)setSelected(undefined); return; }
    const current=selected?props.logs.find(log=>log.id===selected.id):undefined;
    const next=current??latest(props.logs,1)[0];
    if(next&&selected!==next)setSelected(next);
  },[props.logs,selected]);
  const filtered=props.logs.slice().reverse().filter(log=>(level==='all'||log.level===level)&&(`${log.module} ${log.message} ${log.tool??''} ${log.target??''} ${log.status??''}`.toLowerCase().includes(search.toLowerCase())));
  const counts=props.logs.reduce((acc,log)=>{acc[log.level]=(acc[log.level]??0)+1;return acc;},{} as Record<string,number>);
  return <div className="page activity-page">
    <PageHero icon={FileText} title="Activity Log" subtitle="Session journal snapshots. Open a call to inspect its stored, sanitized Request/Response.">
      <div className="activity-header-actions"><StatusBadge tone="unknown" label="Snapshot"/><span className="toggle-label">Auto Scroll <Toggle on={auto} onChange={()=>setAuto(v=>!v)}/></span><TinyButton onClick={()=>props.onAction('clear-logs')}><Trash2 size={17}/>Clear</TinyButton></div>
    </PageHero>
    <div className={'activity-layout'+(inspectorExpanded?' inspector-expanded':'')}
      style={{'--activity-inspector-width':inspectorWidth+'px'} as React.CSSProperties}>
      <Panel className="log-panel">
        <div className="log-toolbar"><label className="search-control"><Search size={18}/><input placeholder="Search logs (keywords, systems, messages...)" value={search} onChange={e=>setSearch(e.target.value)}/></label><button disabled>All Systems <ChevronDownIcon/></button><button disabled>All Levels <ChevronDownIcon/></button><button disabled>Last 200 <ChevronDownIcon/></button><TinyButton disabled><Download size={17}/>Export</TinyButton></div>
        <div className="log-chips"><FilterChip active={level==='all'} label="All" count={props.logs.length} onClick={()=>setLevel('all')}/><FilterChip active={level==='info'} label="Info" count={counts.info??0} onClick={()=>setLevel('info')}/><FilterChip active={level==='success'} label="Success" count={counts.success??0} tone="healthy" onClick={()=>setLevel('success')}/><FilterChip active={level==='warn'} label="Warning" count={counts.warn??0} tone="warning" onClick={()=>setLevel('warn')}/><FilterChip active={level==='error'} label="Error" count={counts.error??0} tone="error" onClick={()=>setLevel('error')}/></div>
        <div className="log-table-wrap"><table className="log-table"><thead><tr><th>Time</th><th>Level</th><th>System</th><th>Message</th><th>Duration</th><th/></tr></thead><tbody>{filtered.slice(0,24).map(log=><tr key={log.id} className={`${selected?.id===log.id?'selected':''} ${log.level}`} onClick={()=>setSelected(log)}><td>{log.time}</td><td><span className={`log-chip ${toneClass(levelTone(log.level))}`}>{(log.status??log.level).toUpperCase()}</span></td><td><span className="log-system"><i/><b>{log.tool??prettyModule(log.module)}</b></span></td><td>{log.target?`${log.message} · ${log.target}`:log.message}{log.lifecycle==='incomplete'&&<span className="log-lifecycle-marker" role="note">Lifecycle incomplete · start unavailable</span>}{log.lifecycle==='start-only'&&<span className="log-lifecycle-open">Start observed · terminal unavailable</span>}</td><td>{log.durationMs==null?'Unavailable':`${Math.round(log.durationMs)} ms`}</td><td><MoreHorizontal size={16}/></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty-copy large">No matching activity in this desktop session.</div>}</div>
        <div className="pagination"><button aria-label="Previous"><ChevronLeft size={14}/></button><button className="active">1</button><button disabled>2</button><button disabled>3</button><span>...</span><button disabled aria-label="Next"><ChevronRight size={14}/></button><small>Showing {Math.min(filtered.length,24)} of {filtered.length} logs</small></div>
      </Panel>
      <LogInspector entry={selected} width={inspectorWidth} setWidth={setInspectorWidth}
        expanded={inspectorExpanded} setExpanded={setInspectorExpanded}/>
    </div>
  </div>;
}

function ChevronDownIcon(){return <ChevronDown className="select-chevron" size={14}/>}

function prettyModule(value:string) {
  return value.replace(/_/g,' ').toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());
}

function LogInspector({entry,width,setWidth,expanded,setExpanded}:{
  entry?:ActivityEntry; width:number; setWidth:(next:number)=>void;
  expanded:boolean; setExpanded:(next:boolean)=>void;
}) {
  return <Panel className="log-inspector">
    <div className="activity-inspector-controls">
      <label htmlFor="activity-inspector-size">Inspector width
        <input id="activity-inspector-size" type="range" min={320} max={760} step={20}
          disabled={expanded} value={width} onChange={event=>setWidth(Number(event.target.value))}
          aria-label="Resize Activity Log inspector"/>
      </label>
      <button type="button" onClick={()=>setExpanded(!expanded)}
        aria-label={expanded?'Restore Activity Log inspector':'Expand Activity Log inspector'}>
        {expanded?'Restore panel':'Expand panel'}
      </button>
    </div>
    <ToolExecutionDetail entry={entry}/>
  </Panel>;
}

type DiagnosticCheck={name:string;category:string;tone:Tone;duration:string;detail:string};
function buildChecks(snapshot?:DesktopSnapshot):DiagnosticCheck[] {
  if(!snapshot)return[];
  const h=snapshot.health;
  const items:DiagnosticCheck[]=[
    {name:'Agent Core Process',category:'Core',tone:snapshot.core.httpHealthy?'healthy':'error',duration:'-',detail:snapshot.core.httpHealthy?`Process is running normally. PID: ${snapshot.core.pid??'-'}.`:'Core process is not responding.'},
    {name:'Configuration Files',category:'Core',tone:snapshot.status.connection==='on'?'healthy':'error',duration:'-',detail:'Runtime root and data paths resolved by the native launcher.'},
    {name:'Memory System',category:'Memory',tone:statusTone(h.memory.status,h.memory.issueCount),duration:'-',detail:`Canonical store: ${h.memory.canonicalStore??'unknown'}; index: ${h.memory.index??'unknown'}.`},
    {name:'Embedding Models',category:'Memory',tone:statusTone(h.memory.embedding),duration:'-',detail:`Embedding status: ${h.memory.embedding??'unknown'}.`},
    {name:'Grafel Index',category:'Code Intelligence',tone:statusTone(h.codeIntelligence.index,h.codeIntelligence.issueCount),duration:'-',detail:`Provider: ${h.codeIntelligence.provider??'unknown'}; index: ${h.codeIntelligence.index??'unknown'}.`},
    ...h.semanticIde.configuredServers.map(server=>({name:`LSP ${server.id==='csharp'?'C#':server.id==='typescript'?'TypeScript':server.id==='powershell'?'PowerShell':server.id==='python'?'Python':server.id}`,category:'Semantic IDE',tone:server.compatibility==='compatible'?'healthy':'warning' as Tone,duration:'-',detail:`Version ${server.observedVersion??'unknown'}; compatibility ${server.compatibility??'unknown'}.`})),
    {name:'Execution Environment',category:'Execution',tone:statusTone(h.execution.status),duration:'-',detail:`Execution mode: ${h.execution.mode??'unknown'}.`},
    {name:'Tunnel Connection',category:'Tunnel',tone:snapshot.tunnel.ready?'healthy':'error',duration:'-',detail:snapshot.tunnel.ready?`Tunnel ready on port ${snapshot.tunnel.port}.`:'Tunnel is unavailable.'},
    {name:'Agent Core AI',category:'AI Agent',tone:h.agentRuntime?statusTone(h.agentRuntime.status,h.agentRuntime.issueCount):'offline',duration:'-',detail:h.agentRuntime?`Native runtime ${h.agentRuntime.status}; providers ${h.agentRuntime.configuredProviderCount}/${h.agentRuntime.providerCount}; sessions ${h.agentRuntime.sessionCount}; running ${h.agentRuntime.runningSessionCount}; skills ${h.agentRuntime.skillCount}. ${h.agentRuntime.issue??''}`.trim():'Native Agent Core AI runtime is not active yet; UI placeholder remains Coming Soon.'},
    {name:'Phone Integration',category:'Phone',tone:statusTone(h.phone.status),duration:'-',detail:`Transport ${h.phone.transport??'unknown'}; device ${h.phone.deviceOnline?'online':'offline'}.`},
  ];
  return items;
}

export function DiagnosticsPage(props:SharedProps) {
  const checks=buildChecks(props.snapshot);
  const [selected,setSelected]=useState(0);
  const [tab,setTab]=useState('Overview');
  const passed=checks.filter(c=>c.tone==='healthy').length,warnings=checks.filter(c=>c.tone==='warning'||c.tone==='degraded').length,errors=checks.filter(c=>c.tone==='error').length,skipped=checks.filter(c=>c.tone==='offline'||c.tone==='unknown').length;
  const current=checks[selected]??checks[0];
  return <div className="page diagnostics-page">
    <PageHero icon={Stethoscope} title="Diagnostics" subtitle="Deep system diagnostics, health checks, and troubleshooting tools for Agent Core.">
      <TinyButton kind="primary" onClick={()=>props.onAction('system-snapshot')}><Play size={17}/>Run All Diagnostics</TinyButton><TinyButton disabled><FileText size={17}/>Generate Report</TinyButton><TinyButton><MoreHorizontal size={18}/></TinyButton>
    </PageHero>
    <Tabs items={['Overview','Health Checks','System Info','Performance','Logs & Traces','Troubleshooting','Export / Report']} active={tab} setActive={setTab}/>
    <div className="diagnostic-summary"><MetricCard icon={ShieldCheck} value={passed} label="Passed" caption="Healthy evidence" tone="healthy"/><MetricCard icon={AlertTriangle} value={warnings} label="Warnings" caption="Needs attention" tone="warning"/><MetricCard icon={CircleAlert} value={errors} label="Error" caption="Requires action" tone="error"/><MetricCard icon={CircleSlash} value={skipped} label="Skipped" caption="Not applicable" tone="offline"/><Panel className="overall-status"><SectionTitle icon={HeartPulse} title="Overall Status"/><b className={(errors?'text-red':warnings?'text-amber':'text-green')}>{errors?'Error':warnings?'Attention Required':'Healthy'}</b><p>{errors?'One or more checks require action':warnings?'Most systems operational':'All observed systems operational'}</p></Panel></div>
    <div className="diagnostic-layout">
      <Panel className="diagnostic-checks"><SectionTitle icon={ListChecks} title="Diagnostic Checks"/><div className="diagnostic-filters"><label className="search-control"><Search size={17}/><input placeholder="Search diagnostics..."/></label><FilterChip active label="All" count={checks.length}/><FilterChip label="Passed" count={passed} tone="healthy"/><FilterChip label="Warning" count={warnings} tone="warning"/><FilterChip label="Error" count={errors} tone="error"/><FilterChip label="Skipped" count={skipped} tone="offline"/></div><table className="diagnostic-table"><thead><tr><th>Name</th><th>Category</th><th>Status</th><th>Duration</th><th>Last Run</th><th/></tr></thead><tbody>{checks.map((c,i)=><tr key={c.name} className={selected===i?'selected':''} onClick={()=>setSelected(i)}><td>{c.name}</td><td>{c.category}</td><td><StatusBadge tone={c.tone} label={labelForTone(c.tone)}/></td><td>{c.duration}</td><td>{new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</td><td><ChevronRight size={15}/></td></tr>)}</tbody></table></Panel>
      <div className="diagnostic-right">{current&&<Panel><div className="inspector-title"><h2>Selected Check Details</h2><StatusBadge tone={current.tone} label={labelForTone(current.tone)}/></div><div className="selected-check-title"><IconWell icon={Stethoscope} tone={current.tone}/><div><b>{current.name}</b><span>Verify current runtime evidence</span></div></div><div className="detail-list"><div><span>Category</span><b>{current.category}</b></div><div><span>Status</span><b className={toneClass(current.tone)}>{labelForTone(current.tone)}</b></div><div><span>Duration</span><b>{current.duration}</b></div><div><span>Last Run</span><b>{new Date().toLocaleString()}</b></div></div><pre className={`check-detail ${toneClass(current.tone)}`}>{current.detail}</pre></Panel>}
        <Panel><SectionTitle icon={CircleAlert} title="Recent Diagnostic Issues"/><div className="issue-list">{checks.filter(c=>c.tone!=='healthy').slice(0,4).map(c=><div key={c.name}><span className={toneClass(c.tone)}><CircleAlert size={15}/></span><div><b>{c.name}</b><small>{c.detail}</small></div></div>)}{!checks.some(c=>c.tone!=='healthy')&&<div className="empty-copy">No current diagnostic issues.</div>}</div></Panel>
        <Panel><SectionTitle icon={Play} title="Quick Actions"/><div className="quick-grid"><TinyButton onClick={()=>props.onAction('system-snapshot')}><Play size={14}/>Run All</TinyButton><TinyButton><HeartPulse size={14}/>Check Health</TinyButton><TinyButton onClick={()=>props.setPage('activity')}><FileText size={14}/>Open Logs</TinyButton><TinyButton onClick={()=>props.onAction('system-snapshot')}><Gauge size={14}/>System Snapshot</TinyButton><TinyButton disabled><Download size={14}/>Export Results</TinyButton></div></Panel>
      </div>
    </div>
  </div>;
}


export function SettingsPage(props:SharedProps) {
  const [tab,setTab]=useState('General');
  const root=props.snapshot?.paths.root??'-';
  const paths=[
    ['Agent Core Folder',root,'open-folder'],
    ['Memory Store',props.snapshot?.paths.memory??'-','open-memory-folder'],
    ['Runtime Cache',props.snapshot?.paths.runtimeCache??'-','open-runtime-folder'],
    ['Logs Directory',props.snapshot?.paths.logs??'-','open-logs'],
  ] as const;
  return <div className="page settings-page">
    <PageHero icon={Settings} title="Settings" subtitle="Configure Agent Core, manage preferences, integrations, and system behavior.">
      <TinyButton disabled><RotateCcwIcon/>Reset to Default</TinyButton>
    </PageHero>
    <Tabs items={['General','Core Runtime','Systems','Integrations','Security','Appearance','Advanced']} active={tab} setActive={setTab}/>
    {tab!=='General'?<Panel className="settings-placeholder"><IconWell icon={Settings}/><h2>{tab}</h2><p>This reference tab is reserved for current Agent Core-owned settings. No unsupported setting is persisted.</p></Panel>:<div className="settings-layout">
      <div className="settings-main">
        <Panel>
          <SectionTitle icon={Settings} title="Application" subtitle="Basic application settings and behavior."/>
          <div className="application-grid">
            <div className="form-stack"><label><span>App Name</span><input value="Agent Core" readOnly/></label><label><span>Version</span><input value={`v${props.snapshot?.version??'-'}`} readOnly disabled/></label><label><span>Language</span><select value="English" disabled><option>English</option></select></label></div>
            <div className="toggle-stack">
              <SettingToggle title="Start with Windows" text="Launch Agent Core when Windows starts" on={props.snapshot?.status.autostart??false} onChange={()=>props.onAction('toggle-autostart')}/>
              <SettingToggle title="Minimize to Tray" text="Keep running in system tray when closed" on={false} disabled/>
              <SettingToggle title="Check for Updates" text="Notify when a new version is available" on={false} disabled/>
              <SettingToggle title="Send Anonymous Usage Data" text="No telemetry is enabled by this UI" on={false} disabled/>
            </div>
          </div>
        </Panel>
        <Panel>
          <SectionTitle icon={Folder} title="Paths & Directories" subtitle="Main directories used by Agent Core."/>
          <div className="path-list">{paths.map(([label,value,action])=><div className="path-row" key={label}><span>{label}</span><input readOnly value={value}/><TinyButton onClick={()=>props.onAction(action)}><Folder size={17}/></TinyButton><TinyButton onClick={()=>props.onAction(action)}>Open</TinyButton></div>)}</div>
        </Panel>
        <Panel>
          <SectionTitle icon={FileText} title="Logging" subtitle="Configure log level and log behavior."/>
          <div className="application-grid">
            <div className="form-stack"><label><span>Log Level</span><select disabled value="Info"><option>Info</option></select></label><label><span>Max Log Files</span><input readOnly value="Session managed"/></label><label><span>Max File Size</span><input readOnly value="Bounded by runtime policy"/></label></div>
            <div className="toggle-stack"><SettingToggle title="Enable File Logging" text="Activity journal persistence" on disabled/><SettingToggle title="Enable Console Logging" text="Launcher-managed logging policy" on={false} disabled/><SettingToggle title="Enable Activity Tracking" text="Track tool calls and system events" on disabled/><SettingToggle title="Include Debug Details" text="Verbose information for debugging" on={false} disabled/></div>
          </div>
        </Panel>
      </div>
      <div className="settings-side">
        <Panel className="settings-status"><SectionTitle icon={HeartPulse} title="System Status"/><div className="settings-big-state"><StatusBadge tone={props.snapshot?.status.overall==='online'?'healthy':'degraded'} label={props.snapshot?.status.overall==='online'?'All systems operational':'Attention required'}/><IconWell icon={ShieldCheck} tone={props.snapshot?.status.overall==='online'?'healthy':'degraded'} large/></div><p>Settings reflect the current native Agent Core runtime.</p></Panel>
        <Panel><SectionTitle icon={ShieldCheck} title="Configuration Profile" subtitle="Profile persistence is not currently an Agent Core authority."/><select disabled><option>Default</option></select><div className="two-buttons"><TinyButton disabled kind="primary">Save Profile</TinyButton><TinyButton disabled>Load Profile</TinyButton></div></Panel>
        <Panel className="danger-zone"><SectionTitle icon={AlertTriangle} title="Danger Zone" subtitle="These actions require dedicated contracts."/><button disabled><RotateCcwIcon/><span><b>Reset All Settings</b><small>Not enabled by visual parity</small></span></button><button disabled><Trash2 size={18}/><span><b>Clear Cache</b><small>Not enabled by visual parity</small></span></button><button disabled><AlertTriangle size={18}/><span><b>Factory Reset</b><small>Not authorized</small></span></button></Panel>
        <Panel><SectionTitle icon={BookOpen} title="Help & Documentation" subtitle="Need help with settings?"/><button className="doc-button" disabled>Open Documentation <ExternalLink size={16}/></button><button className="doc-button" disabled>View Configuration Guide <ExternalLink size={16}/></button></Panel>
      </div>
    </div>}
  </div>;
}

function ReasoningMenu({choice,levels,disabled,onChange}:{choice:ReasoningChoice;levels:ReasoningEffort[];disabled:boolean;onChange?:(choice:ReasoningChoice)=>void}) {
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const id=useId();
  const options:ReasoningChoice[]=['auto',...(['low','medium','high','xhigh','max'] as const).filter(level=>levels.includes(level))];
  const label=(value:ReasoningChoice)=>value==='xhigh'?'XHigh':value[0].toUpperCase()+value.slice(1);
  useEffect(()=>{
    if(disabled){setOpen(false);return;}
    if(!open)return;
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const outside=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('mousedown',outside);
    return()=>document.removeEventListener('mousedown',outside);
  },[open,disabled]);
  return <div className="chat-reasoning" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <button ref={trigger} type="button" className="chat-bar-button" aria-label={'Reasoning: '+label(choice)} title={disabled?'Reasoning requires an explicitly selected provider with reasoning levels':'Reasoning: '+label(choice)}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} disabled={disabled} onClick={()=>setOpen(!open)}
      onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);}}}><BrainCircuit size={14}/><span>Reasoning: {label(choice)}</span><ChevronDown size={12}/></button>
    {open&&<div id={id} className="chat-reasoning-menu" role="menu" aria-label="Reasoning effort" onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();}
      if(event.key==='Tab')setOpen(false);
      const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
      const index=items.indexOf(document.activeElement as HTMLButtonElement);
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(index+1)%items.length:event.key==='ArrowUp'?(index-1+items.length)%items.length:-1;
      if(next>=0){event.preventDefault();items[next]?.focus();}
    }}>
      {options.map(option=><button type="button" key={option} role="menuitemradio" aria-checked={choice===option} tabIndex={-1}
        onClick={()=>{onChange?.(option);setOpen(false);trigger.current?.focus();}}>{label(option)}</button>)}
    </div>}
  </div>;
}

import { resolveSelection } from './chatSelection';

export function ChatPage(props:SharedProps) {
  const [actionsOpen,setActionsOpen]=useState(false);
  const actionsRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!actionsOpen)return;
    const close=(e:MouseEvent)=>{if(!actionsRef.current?.contains(e.target as Node))setActionsOpen(false);};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setActionsOpen(false);};
    document.addEventListener('mousedown',close);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',key);};
  },[actionsOpen]);
  const active=props.agentChat.active;
  const draftKey=active?.conversation.id??'draft';
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [goalModes,setGoalModes]=useState<Record<string,boolean>>({});
  const [goalExpanded,setGoalExpanded]=useState(false);
  const [hiddenGoal,setHiddenGoal]=useState<string>();
  const prompt=drafts[draftKey]??'';
  const setPrompt=(value:string)=>setDrafts(prev=>({...prev,[draftKey]:value}));
  const [workspace,setWorkspace]=useState('agent-core');
  const [historyOpen,setHistoryOpen]=useState(false);
  const [pending,setPending]=useState<{prompt:string;goalMode:boolean}>();
  const pendingDelivered=useRef(false);
  const runtime=props.snapshot?.health.agentRuntime;
  const providerChoice=props.agentChat.providerChoice??'auto';
  const modelChoice=props.agentChat.modelChoice;
  const selectedProvider=props.agentChat.providers?.find(item=>item.id===providerChoice);
  // Derived for display/send only; the saved choice is never rewritten here.
  const selection=resolveSelection(props.agentChat.providers,{providerId:providerChoice,model:modelChoice,reasoningEffort:props.agentChat.reasoningChoice??'auto'});
  const reasoningLevels=selection.levels;
  const reasoningSupported=Boolean(selectedProvider&&(selectedProvider.reasoningEfforts!==undefined||selectedProvider.models?.some(item=>item.reasoningEfforts!==undefined)));
  const selectValue=providerChoice!=='auto'&&modelChoice&&modelChoice!==selectedProvider?.model?`${providerChoice}:${modelChoice}`:providerChoice;
  const lastUsed=(value:string)=>props.agentChat.selectionSaved&&value===selectValue?' · Terakhir dipakai':'';
  const chatHealth=props.snapshot?.health.agentChat;
  const configured=(runtime?.configuredProviderCount??0)>0;
  const running=Boolean(props.agentChat.runningRequestId)
    || Boolean(active?.turns.some(turn=>turn.status==='running'));
  const runningTurn=active?.turns.find(turn=>turn.status==='running');
  const pausedTurn=active?.turns.find(turn=>turn.status==='resumable');
  const latestTurn=active?.turns.at(-1);
  const goalTurn=[...(active?.turns??[])].reverse().find(turn=>turn.goalMode);
  const goalMode=goalModes[draftKey]??Boolean(goalTurn&&['running','resumable'].includes(goalTurn.status));
  const goalMessage=active?.messages.find(message=>message.turnId===goalTurn?.id&&message.role==='user');
  const goalLabel=goalTurn?.pauseRequested?'Pausing goal':goalTurn?({running:'Running goal',resumable:'Paused goal',finalized:'Finished goal',failed:'Failed goal',interrupted:'Interrupted goal',stopped:'Stopped goal'}[goalTurn.status]):'';
  const decisionEvidence=active?.decisionEvidence?.taskId===latestTurn?.runtimeTaskId?active?.decisionEvidence:undefined;
  const event=props.agentChat.lastEvent?.conversationId===active?.conversation.id
    ? props.agentChat.lastEvent
    : undefined;
  const runningTurnId=runningTurn?.id
    ?? pausedTurn?.id
    ?? (props.agentChat.runningRequestId ? event?.turnId : undefined);
  const latestNarration=[...(props.agentChat.activity??[])].reverse().find(item=>item.kind==='note')?.text;
  const budgetWarning=props.agentChat.activity?.find(item=>item.kind==='budget');
  const progressLabels:Record<string,string>={
    'turn.accepted':'Task accepted',
    'memory.recall.started':'Finding relevant context',
    'memory.recall.completed':'Context ready',
    'agent.planning':'Planning the next action',
    'agent.budget':'Planning the next action',
    'assistant.progress':event?.text||'Working',
    'tool.started':event?.toolName
      ?`Using ${event.toolName}`+(event.iteration&&event.maxIterations?` · langkah ${event.iteration}/${event.maxIterations}`:'')
      :'Using a tool',
    'tool.completed':event?.toolName
      ?(event.success===false
        ?`Tool failed · ${event.toolName}`+(event.resultSummary?` · ${event.resultSummary}`:'')
        :`Tool finished · ${event.toolName}`+(event.resultSummary?` · ${event.resultSummary}`:'')+(event.durationMs!==undefined?` · ${formatStepDuration(event.durationMs)}`:''))
      :(event?.success===false?'Tool failed; checking recovery':'Tool finished'),
    'verification.started':'Checking the result',
    'verification.completed':'Result check finished',
    'learning.finalization.started':'Reviewing learning',
    'learning.finalization.completed':'Learning review finished',
    'provider.route.changed':'Switching provider',
    'provider.route.decision':'Rotating provider route',
    'provider.waiting':'Waiting for an eligible provider',
    'assistant.final':'Response saved',
    'turn.failed':'Task failed',
    'turn.cancelled':'Task stopped',
    'turn.paused':'Paused — Continue required',
  };
  const turnLabels:Record<string,string>={
    finalized:'Response saved',resumable:'Paused — Continue required',failed:'Task failed',
    interrupted:'Interrupted; no safe checkpoint',stopped:'Task stopped',
  };
  const pendingFinalization=runtime?.pendingFinalizationCount??0;
  const runtimeTitle=`Runtime ${runtime?.status??'unavailable'} · Providers ${runtime?runtime.configuredProviderCount+'/'+runtime.providerCount:'0/0'} · Chats ${chatHealth?.activeConversationCount??props.agentChat.conversations.length} · Pending finalization ${pendingFinalization}`;

  // A new chat is a draft: the conversation is created by the first send, so
  // opening the launcher never leaves an empty thread behind.
  const submit=()=>{
    const value=prompt.trim();
    if(!value||running||pausedTurn||!configured||pending)return;
    if(!active){
      pendingDelivered.current=false;
      setPending({prompt:value,goalMode});
      setPrompt('');
      props.onChatCreate(workspace.trim()||undefined);
      return;
    }
    if(goalMode)props.onChatSend(active.conversation.id,value,true);
    else props.onChatSend(active.conversation.id,value);
    setPrompt('');
  };

  useEffect(()=>{
    if(!pending)return;
    if(active){
      if(pendingDelivered.current)return;
      pendingDelivered.current=true;
      setPending(undefined);
      setGoalModes(prev=>({...prev,[active.conversation.id]:pending.goalMode}));
      if(pending.goalMode)props.onChatSend(active.conversation.id,pending.prompt,true);
      else props.onChatSend(active.conversation.id,pending.prompt);
    }else if(props.agentChat.error){
      setPrompt(pending.prompt);
      setPending(undefined);
    }
  },[pending,active,props.agentChat.error]);

  return <div className={'chat-page'+(active?'':' draft')}>
    <div className="chat-bar">
      <button type="button" className="chat-bar-button" aria-label="Chat history" title="Chat history" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(open=>!open)}><Clock3 size={16}/></button>
      {active
        ? <><h2>{active.conversation.title}</h2><span className="chat-bar-sub">{active.conversation.workspace}</span></>
        : <span className="chat-bar-title">New Chat</span>}
      <span className="chat-bar-spacer"/>
      {active&&(active.conversation.preferredProviderId||active.conversation.preferredModel)&&<span className="chat-route-label">{active.conversation.preferredProviderId??'auto'}{active.conversation.preferredModel?' · '+active.conversation.preferredModel:''}</span>}
      {pendingFinalization>0&&<span className="chat-route-label">Finalizing {pendingFinalization}</span>}
      <span className={`chat-ready ${toneClass(statusTone(runtime?.status,runtime?.issueCount??0))}`} title={runtimeTitle}><i aria-hidden="true"/>{configured?'Agent Ready':'Provider Not Configured'}</span>
      {active&&<TinyButton disabled={running} onClick={()=>props.onChatArchive(active.conversation.id)}><Trash2 size={14}/>Archive</TinyButton>}
    </div>

    {historyOpen&&<div className="chat-history">
      {props.agentChat.conversations.map(item=><button
        type="button"
        key={item.id}
        className={active?.conversation.id===item.id?'active':''}
        onClick={()=>{props.onChatOpen(item.id);setHistoryOpen(false);}}
        disabled={Boolean(pending)}
      >
        <b>{item.title}</b>
        <small>{item.workspace} · {new Date(item.updatedAtMs).toLocaleString()}</small>
      </button>)}
      {!props.agentChat.conversations.length&&<div className="empty-copy">No conversations yet.</div>}
    </div>}

    <div className="chat-response chat-transcript" aria-live="polite">
      {decisionEvidence&&<details className="chat-decision-evidence">
        <summary>Decision evidence</summary>
        <p>Recorded explanations and findings. Goal verification is separate.</p>
        {decisionEvidence.status==='unavailable'&&<p>{running?'Investigation in progress; evidence is not yet available.':'No decision evidence is available for this turn.'}</p>}
        {decisionEvidence.records.map(record=><section key={record.id}>
          <h3>{record.question}</h3>
          {record.assumptions.length>0&&<ul aria-label="Assumptions">{record.assumptions.map((row,index)=><li key={index}>{row.statement} <small>({row.basis})</small></li>)}</ul>}
          {record.alternatives.map(row=><div key={row.id}>
            <b>{row.claim}</b><span>Declared finding: {row.status}</span>
            <p>Check: {row.check}</p><p>Would change the conclusion: {row.falsifier}</p>
          </div>)}
          <p>{record.summary}</p>
          {record.evidenceRefs.length>0&&<ul aria-label="Decision sources">{record.evidenceRefs.map(ref=><li key={ref}><code>{ref}</code></li>)}</ul>}
        </section>)}
        {decisionEvidence.truncated&&<p>The bounded summary omits some detail; the original decision history is preserved.</p>}
      </details>}
      {!active&&!pending&&<div className="chat-empty launcher-welcome"><img src="./agent-core.png" alt=""/><h2>Agent Core Workspace</h2><p>Describe any goal in natural language. Agent Core uses verified capabilities, executes tools within your permissions, and delivers traceable results.</p>
        <div className="launcher-prompt-grid">{[
          ['Research Trends','Find Indonesian trends from the last three days and show sources.',Search],
          ['Presentation Deck','Create an editable PowerPoint presentation for system architecture.',BookOpen],
          ['Code Inspection','Inspect my workspace code and verify the root cause of the problem.',Code2],
          ['First-Task Golden Path','Audit workspace storage boundaries and verify a local markdown deliverable.',ShieldCheck],
        ].map(([title,text,Icon]:any)=><button type="button" key={title} onClick={()=>setPrompt(text)}><Icon size={17}/><span>{title}</span><ArrowRight size={14}/></button>)}</div>
      </div>}
      {!active&&pending&&<div className="chat-progress" role="status"><RefreshCw className="spin" size={16}/><span>Starting chat…</span></div>}
      {active&&<div className="chat-message-list">
        {active.messages.map(message=>{
          const messageTurn=message.role==='assistant'?active.turns.find(turn=>turn.id===message.turnId):undefined;
          const memoryUse=messageTurn?.memoryUse??[];
          return <React.Fragment key={message.id}><div className={'chat-message '+message.role}>
            <div className="chat-message-avatar" aria-label={message.role==='user'?'You':'Agent Core'}>{message.role==='user'?<UserRound size={16}/>:<img src="./agent-core.png" alt=""/>}</div>
            <div className="chat-message-body">
            <pre>{message.content}</pre>
            {messageTurn&&<small className="chat-turn-reasoning">Reasoning · {messageTurn.reasoningEffort??'auto'}</small>}
            {memoryUse.length>0&&<details className="chat-memory-use">
              <summary>Memory use · {memoryUse.length} {memoryUse.length===1?'record':'records'}</summary>
              <p>Declared use with checked outcomes. Causal benefit is not established by these records.</p>
              <ul>{memoryUse.map((use,index)=><li key={use.memoryId+':'+index}>
                <b>{use.title}</b><span>{use.applicability} · {use.verification==='pass'?'Outcome check passed':use.verification==='fail'?'Outcome check failed':'Outcome check unavailable'}</span>
                <small>{use.memoryId}</small>
                {use.evidenceRefs.length>0&&<ul aria-label={'Evidence for '+use.title}>{use.evidenceRefs.map(ref=><li key={ref}><code>{ref}</code></li>)}</ul>}
              </li>)}</ul>
            </details>}
            <time className="chat-message-time">{new Date(message.createdAtMs).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time>
            </div>
          </div>{messageTurn?.runtimeTaskId&&<div className="chat-message-changes"><TaskChangesPanel key={messageTurn.runtimeTaskId} taskId={messageTurn.runtimeTaskId} presentation="popover"/></div>}</React.Fragment>;
        })}
        {((props.agentChat.activity?.length??0)>0||(active?.steps?.length??0)>0)&&<ActivityList items={props.agentChat.activity??[]}
          steps={active?.steps} stepDetails={props.agentChat.stepDetails} onStepDetail={props.onStepDetail} currentTurnId={latestTurn?.id}/>}
        {running&&<div className="chat-message assistant pending">
          <div className="chat-message-role">Agent Core</div>
          {event?.type!=='assistant.progress'&&latestNarration&&<p className="chat-narration">{latestNarration}</p>}
          {budgetWarning&&<div className="chat-progress chat-budget" role="status"><span>Mendekati batas langkah ({budgetWarning.iteration}/{budgetWarning.maxIterations})</span></div>}
          <div className="chat-progress"><RefreshCw className="spin" size={17}/><span>{progressLabels[event?.type??'turn.accepted']??'Working'}</span>{event?.toolName&&!event.type.startsWith('tool.')&&<b>{event.toolName}</b>}{event?.type==='tool.started'&&<ElapsedSeconds since={event.at}/>}</div>
        </div>}
        {!running&&latestTurn&&<div className="chat-progress" role="status">
          <span>{latestTurn.errorCode==='AGENT_RUNTIME_CONTINUATION_PROVIDER_WAIT'?'Waiting for an eligible provider':turnLabels[latestTurn.status]??'Working'}</span>
          {latestTurn.errorCode&&<span>{latestTurn.errorCode}</span>}
        </div>}
        {!running&&pausedTurn&&<p>{pausedTurn.errorCode==='AGENT_RUNTIME_CONTINUATION_PROVIDER_WAIT'
          ? 'The task is safely paused. It resumes when the provider is eligible and the existing attempt budget permits. Stop recovery to end it.'
          : 'Task paused. Choose Continue to resume it, or Stop recovery to end it.'}</p>}
      </div>}
      {props.agentChat.error&&<div className="chat-error"><AlertTriangle size={20}/><div><b>Agent chat turn failed</b><p>{props.agentChat.error}</p></div></div>}
    </div>

    {goalTurn&&hiddenGoal!==goalTurn.id&&<section className={'launcher-goal-bar'+(goalExpanded?' expanded':'')} aria-label="Current goal">
      <div className="launcher-goal-row"><Target size={14}/><b>{goalLabel}</b><span className="launcher-goal-title" title={goalMessage?.content}>{goalMessage?.content??'Goal task'}</span>
        <time title="Elapsed since goal started, including pauses">{formatDuration(Math.max(0,((goalTurn.completedAtMs??Date.now())-goalTurn.startedAtMs)/1000))}</time>
        {goalTurn.status==='running'&&<button type="button" aria-label="Pause goal" title="Pause after the current operation" disabled={goalTurn.pauseRequested||!props.onChatPause} onClick={()=>props.onChatPause?.(active!.conversation.id,goalTurn.id)}><Pause size={14}/></button>}
        {goalTurn.status==='resumable'&&<button type="button" aria-label="Continue goal" title="Continue goal" disabled={running||!props.onChatResume} onClick={()=>props.onChatResume?.(active!.conversation.id,goalTurn.id)}><Play size={14}/></button>}
        <button type="button" aria-label={['running','resumable'].includes(goalTurn.status)?'Stop goal':'Hide finished goal'} title={['running','resumable'].includes(goalTurn.status)?'Stop goal':'Hide finished goal'} onClick={()=>['running','resumable'].includes(goalTurn.status)?props.onChatCancel(goalTurn.id):setHiddenGoal(goalTurn.id)}><Trash2 size={13}/></button>
        <button type="button" aria-label="Expand goal" title="Expand goal" aria-expanded={goalExpanded} onClick={()=>setGoalExpanded(value=>!value)}><ChevronDown size={14}/></button>
      </div>{goalExpanded&&<p className="launcher-goal-detail">{goalMessage?.content??'Goal task'}</p>}
    </section>}
    <div className="chat-composer">
      <textarea
        value={prompt}
        onChange={e=>setPrompt(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}}}
        aria-label="Message Agent Core"
        placeholder={!configured?'No configured provider.':'Ask Agent Core to research, code, analyze data, create presentations, or manage tools…'}
        disabled={!configured||running||Boolean(pausedTurn)||Boolean(pending)}
        rows={2}
      />
      <div className="chat-composer-footer">
        <div className="prototype-composer-actions" ref={actionsRef}><button type="button" aria-label="Composer actions" aria-expanded={actionsOpen} className="prototype-plus" onClick={()=>setActionsOpen(v=>!v)}>{actionsOpen?<X size={15}/>:<Plus size={15}/>}</button>{actionsOpen&&<div className="prototype-composer-menu">
          <button disabled title="Attachment transport is a planned upgrade"><Paperclip size={16}/>Add files or photos <small>Planned</small></button>
          <button disabled title="Folder import is a planned upgrade"><FolderOpen size={16}/>Add folder / imports <small>Planned</small></button>
          <button onClick={()=>{props.setPage('goals');setActionsOpen(false);}}><ListTodo size={16}/>Step-by-Step Plan <small>View</small></button>
          <button onClick={()=>{props.setPage('systems');setActionsOpen(false);}}><Wrench size={16}/>Tools Hub & MCP <ChevronRight size={14}/></button>
          {!active&&<label>Workspace<input aria-label="Workspace" value={workspace} onChange={e=>setWorkspace(e.target.value)} disabled={running||Boolean(pending)} maxLength={200}/></label>}
        </div>}</div>
        <button type="button" className="prototype-goal-toggle" aria-label="Goals mode" aria-pressed={goalMode} title="Run the next instruction as a goal" disabled={running||Boolean(pausedTurn)||Boolean(pending)} onClick={()=>setGoalModes(prev=>({...prev,[draftKey]:!goalMode}))}><Target size={14}/><span>Goals</span></button>
        {props.agentChat.providers&&props.agentChat.providers.length>0&&props.onChatProvider&&<select
          aria-label="Provider dan model"
          title="Provider dan model"
          value={selectValue}
          disabled={running||Boolean(pausedTurn)||Boolean(pending)}
          onChange={e=>{
            // Models come from the catalog of every configured provider; no model id is hardcoded here.
            const hit=props.onChatModel
              ? props.agentChat.providers?.flatMap(provider=>provider.configured?(provider.models??[]).map(model=>({provider,model})):[])
                .find(({provider,model})=>`${provider.id}:${model.id}`===e.target.value) : undefined;
            props.onChatProvider?.(hit?hit.provider.id:e.target.value);
            if(hit)props.onChatModel?.(hit.model.id);
          }}
        >
          <option value="auto">{'Auto (rotasi otomatis)'+lastUsed('auto')}</option>
          {providerChoice!=='auto'&&!selectedProvider&&<option value={providerChoice} disabled>{providerChoice+' (tidak tersedia)'}</option>}
          {props.agentChat.providers.map(item=><React.Fragment key={item.id}><option value={item.id} disabled={!item.configured}>
            {(item.configured
              ? item.id+' · '+(item.model??'model belum diatur')+(item.available?'':' (cooldown)')
              : item.id+' (belum dikonfigurasi)')+lastUsed(item.id)}
          </option>{item.id===providerChoice&&selection.modelMissing&&<option value={selectValue}>
            {item.id+' · '+modelChoice+' (tidak tersedia di katalog)'+lastUsed(selectValue)}
          </option>}{item.configured&&props.onChatModel&&item.models?.filter(model=>model.id!==item.model).map(model=><option key={model.id} value={`${item.id}:${model.id}`}>
            {item.id+' · '+model.id+(item.available?'':' (cooldown)')+lastUsed(`${item.id}:${model.id}`)}
          </option>)}</React.Fragment>)}
        </select>}
        <ReasoningMenu choice={selection.effectiveReasoning}
          levels={reasoningLevels}
          disabled={providerChoice==='auto'||!selectedProvider?.configured||!reasoningSupported||running||Boolean(pausedTurn)||Boolean(pending)||!props.onChatReasoning}
          onChange={props.onChatReasoning}/>
        <span className="prototype-permissions" title="Permissions remain controlled by the existing runtime grants"><Shield size={12}/>Runtime permissions</span>
        {pausedTurn&&goalTurn?.id!==pausedTurn.id&&pausedTurn.errorCode!=='AGENT_RUNTIME_CONTINUATION_PROVIDER_WAIT'&&<TinyButton disabled={running||!props.onChatResume} onClick={()=>props.onChatResume?.(active!.conversation.id,pausedTurn.id)}><Play size={16}/>Continue</TinyButton>}
        {(running||pausedTurn)&&runningTurnId&&runningTurnId!==goalTurn?.id
          ? <TinyButton onClick={()=>props.onChatCancel(runningTurnId)}><X size={16}/>{pausedTurn?'Stop recovery':'Stop'}</TinyButton>
          : <button className="prototype-send" aria-label="Send" title="Send · Enter (Shift+Enter for a new line)" disabled={!configured||!prompt.trim()||running||Boolean(pausedTurn)||Boolean(pending)||selection.sendBlocked} onClick={submit}><Send size={16}/></button>}
      </div>
      {selection.notice&&<small role="status">{selection.notice}</small>}
    </div>
  </div>;
}

function RotateCcwIcon(){return <RefreshCw size={18}/>}

function SettingToggle({title,text,on,disabled,onChange}:{title:string;text:string;on:boolean;disabled?:boolean;onChange?:()=>void}) {
  return <div className="setting-toggle"><div><b>{title}</b><span>{text}</span></div><Toggle on={on} disabled={disabled} onChange={onChange}/></div>;
}

export function ReferenceUi({page,setPage,snapshot,logs,onAction,agentRun,onAgentRun,agentChat,onChatCreate,onChatOpen,onChatSend,onChatCancel,onChatResume,onChatPause,onStepDetail,onChatArchive,onChatProvider,onChatModel,onChatReasoning,onChatDraft}:SharedProps & {page:PageId;onChatDraft?:()=>void}) {
  const props={snapshot,logs,onAction,setPage,agentRun,onAgentRun,agentChat,onChatCreate,onChatOpen,onChatSend,onChatCancel,onChatResume,onChatPause,onStepDetail,onChatArchive,onChatProvider,onChatModel,onChatReasoning};
  const content=page==='workflows'?<WorkflowsPage/>:page==='chat'?<ChatPage {...props}/>:page==='dashboard'?<PrototypeDashboard {...props}/>:page==='core'?<PrototypeRuntime {...props}/>:page==='systems'?<PrototypeTools {...props}/>:page==='models'?<ModelsPage {...props}/>:page==='memory'?<MemoryPage {...props}/>:page==='learning'?<LearningPage {...props}/>:page==='goals'?<GoalsPage {...props}/>:page==='artifacts'?<ArtifactsPage {...props}/>:page==='activity'?<PrototypeActivity {...props}/>:page==='diagnostics'?<PrototypeDiagnostics {...props}/>:page==='wizard'?<PrototypeSetup {...props}/>:<PrototypeSettings {...props}/>;
  return <AppShell page={page} setPage={setPage} snapshot={snapshot} onAction={onAction} onNewChat={onChatDraft} agentChat={agentChat} logs={logs}>{content}</AppShell>;
}


