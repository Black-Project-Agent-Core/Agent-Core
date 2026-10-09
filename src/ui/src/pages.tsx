import React, { useEffect, useMemo, useState } from 'react';
import { WorkflowsPage } from './WorkflowsPage';
import type {
  ActivityEntry,
  AgentChatUiState,
  AgentRunState,
  DesktopSnapshot,
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
  onChatSend:(conversationId:string,prompt:string)=>void;
  onChatCancel:(turnId:string)=>void;
  onChatArchive:(conversationId:string)=>void;
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

    <Panel className="systems-panel">
      <SectionTitle icon={Settings} title="Internal Systems" subtitle="Real-time status of all Agent Core subsystems." action={<div className="filter-row">
        <FilterChip active={filter==='all'} label="All" count={counts.all} onClick={()=>setFilter('all')}/>
        <FilterChip active={filter==='healthy'} label="Healthy" count={counts.healthy} tone="healthy" onClick={()=>setFilter('healthy')}/>
        <FilterChip active={filter==='warning'} label="Warning" count={counts.degraded+counts.warning} tone="warning" onClick={()=>setFilter('warning')}/>
        <FilterChip active={filter==='error'} label="Error" count={counts.error} tone="error" onClick={()=>setFilter('error')}/>
        <FilterChip active={filter==='offline'} label="Offline" count={counts.offline} tone="offline" onClick={()=>setFilter('offline')}/>
      </div>}/>
      <div className="dashboard-system-grid">
        {visible.filter(s=>s.id!=='auth').map(s=><SystemCard key={s.id} system={s} compact onClick={()=>props.setPage('systems')}/>)}
        <button type="button" className="add-system" disabled><span>+</span><b>Add System</b><small>Future integrations</small></button>
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
        <SectionTitle icon={HeartPulse} title="System Health" subtitle="Overall system status and resource usage." action={<StatusBadge tone={counts.error?'error':counts.degraded?'degraded':'healthy'} label={counts.error?'ERROR':counts.degraded?'DEGRADED':'HEALTHY'}/>}/>
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
    <Breadcrumb current="Systems"/>
    <PageHero icon={Boxes} title="Systems" subtitle="Browse subsystem status, dependencies, and issue hotspots.">
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
  useEffect(()=>{
    if(!props.logs.length){ if(selected)setSelected(undefined); return; }
    if(!selected||!props.logs.some(log=>log.id===selected.id))setSelected(latest(props.logs,1)[0]);
  },[props.logs,selected]);
  const filtered=props.logs.slice().reverse().filter(log=>(level==='all'||log.level===level)&&(`${log.module} ${log.message}`.toLowerCase().includes(search.toLowerCase())));
  const counts=props.logs.reduce((acc,log)=>{acc[log.level]=(acc[log.level]??0)+1;return acc;},{} as Record<string,number>);
  return <div className="page activity-page">
    <PageHero icon={FileText} title="Activity Log" subtitle="Real-time events from all Agent Core systems. Monitor, filter, and investigate issues.">
      <div className="activity-header-actions"><StatusBadge tone="healthy" label="Live"/><span className="toggle-label">Auto Scroll <Toggle on={auto} onChange={()=>setAuto(v=>!v)}/></span><TinyButton onClick={()=>props.onAction('clear-logs')}><Trash2 size={17}/>Clear</TinyButton></div>
    </PageHero>
    <div className="activity-layout">
      <Panel className="log-panel">
        <div className="log-toolbar"><label className="search-control"><Search size={18}/><input placeholder="Search logs (keywords, systems, messages...)" value={search} onChange={e=>setSearch(e.target.value)}/></label><button disabled>All Systems <ChevronDownIcon/></button><button disabled>All Levels <ChevronDownIcon/></button><button disabled>Last 200 <ChevronDownIcon/></button><TinyButton disabled><Download size={17}/>Export</TinyButton></div>
        <div className="log-chips"><FilterChip active={level==='all'} label="All" count={props.logs.length} onClick={()=>setLevel('all')}/><FilterChip active={level==='info'} label="Info" count={counts.info??0} onClick={()=>setLevel('info')}/><FilterChip active={level==='success'} label="Success" count={counts.success??0} tone="healthy" onClick={()=>setLevel('success')}/><FilterChip active={level==='warn'} label="Warning" count={counts.warn??0} tone="warning" onClick={()=>setLevel('warn')}/><FilterChip active={level==='error'} label="Error" count={counts.error??0} tone="error" onClick={()=>setLevel('error')}/></div>
        <div className="log-table-wrap"><table className="log-table"><thead><tr><th>Time</th><th>Level</th><th>System</th><th>Message</th><th>Duration</th><th/></tr></thead><tbody>{filtered.slice(0,24).map(log=><tr key={log.id} className={`${selected?.id===log.id?'selected':''} ${log.level}`} onClick={()=>setSelected(log)}><td>{log.time}</td><td><span className={`log-chip ${toneClass(levelTone(log.level))}`}>{log.level==='warn'?'WARNING':log.level.toUpperCase()}</span></td><td><span className="log-system"><i/><b>{prettyModule(log.module)}</b></span></td><td>{log.message}</td><td>-</td><td><MoreHorizontal size={16}/></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty-copy large">No matching activity in this desktop session.</div>}</div>
        <div className="pagination"><button aria-label="Previous"><ChevronLeft size={14}/></button><button className="active">1</button><button disabled>2</button><button disabled>3</button><span>...</span><button disabled aria-label="Next"><ChevronRight size={14}/></button><small>Showing {Math.min(filtered.length,24)} of {filtered.length} logs</small></div>
      </Panel>
      <LogInspector entry={selected}/>
    </div>
  </div>;
}

function ChevronDownIcon(){return <ChevronDown className="select-chevron" size={14}/>}

function prettyModule(value:string) {
  return value.replace(/_/g,' ').toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());
}

function LogInspector({entry}:{entry?:ActivityEntry}) {
  if(!entry)return <Panel className="log-inspector"><div className="empty-tab"><FileText size={30}/><b>Log Details</b><p>Select an activity row to inspect its safe session evidence.</p></div></Panel>;
  const tone=levelTone(entry.level);
  return <Panel className="log-inspector">
    <div className="inspector-title"><h2>Log Details</h2><X size={19}/></div>
    <div className="log-detail-meta"><span className={`log-chip ${toneClass(tone)}`}>{entry.module}</span><span>{new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} {entry.time}</span><span className="duration-placeholder"><Clock3 size={13}/>-</span></div>
    <h2 className="log-detail-title">{entry.message}</h2><p>Activity Journal event from the current Agent Core desktop session.</p>
    <div className="detail-list boxed"><div><span>System</span><b>{prettyModule(entry.module)}</b></div><div><span>Component</span><b>{entry.module}</b></div><div><span>Level</span><b className={toneClass(tone)}>{entry.level}</b></div><div><span>Duration</span><b>-</b></div><div><span>Request ID</span><b>-</b></div><div><span>Session ID</span><b>Desktop session</b></div></div>
    <h3 className="mini-heading">Additional Data</h3>
    <Tabs items={['Details','Raw Data','Related']} active="Details" setActive={()=>{}}/>
    <pre className="json-box">{JSON.stringify({id:entry.id,module:entry.module,level:entry.level,message:entry.message,time:entry.time},null,2)}</pre>
    <h3 className="mini-heading">Related Actions</h3>
    <div className="related-actions"><button disabled><Folder size={20}/>Open File</button><button disabled><Code2 size={20}/>View in Editor</button><button><Search size={20}/>Search Logs</button></div>
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

export function ChatPage(props:SharedProps) {
  const [prompt,setPrompt]=useState('');
  const [workspace,setWorkspace]=useState('agent-core');
  const runtime=props.snapshot?.health.agentRuntime;
  const chatHealth=props.snapshot?.health.agentChat;
  const configured=(runtime?.configuredProviderCount??0)>0;
  const active=props.agentChat.active;
  const running=Boolean(props.agentChat.runningRequestId)
    || Boolean(active?.turns.some(turn=>turn.status==='running'));
  const runningTurn=active?.turns.find(turn=>turn.status==='running');
  const event=props.agentChat.lastEvent?.conversationId===active?.conversation.id
    ? props.agentChat.lastEvent
    : undefined;
  const runningTurnId=runningTurn?.id
    ?? (props.agentChat.runningRequestId ? event?.turnId : undefined);

  const submit=()=>{
    const value=prompt.trim();
    if(!value||!active||running||!configured)return;
    props.onChatSend(active.conversation.id,value);
    setPrompt('');
  };

  return <div className="page chat-page">
    <PageHero icon={MessageSquarePlus} title="Agent Core AI" subtitle="Persistent Native Agent conversations with Memory-first context, existing tools, and Learning finalization on every turn.">
      <StatusBadge tone={statusTone(runtime?.status,runtime?.issueCount??0)} label={configured?'Agent Ready':'Provider Not Configured'}/>
    </PageHero>

    <div className="chat-shell">
      <Panel className="chat-thread-rail">
        <div className="chat-thread-head">
          <TinyButton kind="primary" disabled={!configured||running} onClick={()=>props.onChatCreate(workspace.trim()||undefined)}>
            <MessageSquarePlus size={16}/>New Chat
          </TinyButton>
          <label><span>Workspace</span><input value={workspace} onChange={e=>setWorkspace(e.target.value)} disabled={running||Boolean(active)} maxLength={200}/></label>
        </div>
        <div className="chat-thread-list">
          {props.agentChat.conversations.map(item=><button
            key={item.id}
            className={active?.conversation.id===item.id?'active':''}
            onClick={()=>props.onChatOpen(item.id)}
            disabled={running&&active?.conversation.id!==item.id}
          >
            <b>{item.title}</b>
            <small>{item.workspace} · {new Date(item.updatedAtMs).toLocaleString()}</small>
          </button>)}
          {!props.agentChat.conversations.length&&<div className="empty-copy">No conversations yet.</div>}
        </div>
      </Panel>

      <Panel className="chat-main chat-conversation-main">
        <div className="chat-runtime-strip">
          <span><b>Runtime</b>{runtime?.status??'unavailable'}</span>
          <span><b>Providers</b>{runtime?runtime.configuredProviderCount+'/'+runtime.providerCount:'0/0'}</span>
          <span><b>Chats</b>{chatHealth?.activeConversationCount??props.agentChat.conversations.length}</span>
          <span><b>Pending finalization</b>{runtime?.pendingFinalizationCount??0}</span>
        </div>

        <div className="chat-response chat-transcript" aria-live="polite">
          {!active&&<div className="chat-empty"><BrainCircuit size={34}/><h2>Start or open a conversation.</h2><p>Each thread keeps one durable Agent Runtime session. Every user turn still verifies and finalizes Learning independently.</p></div>}
          {active&&<>
            <div className="chat-conversation-title">
              <div><h2>{active.conversation.title}</h2><p>{active.conversation.workspace}</p></div>
              <div className="chat-conversation-actions">
                {(active.conversation.preferredProviderId||active.conversation.preferredModel)&&<span className="chat-route-label">{active.conversation.preferredProviderId??'auto'}{active.conversation.preferredModel?' · '+active.conversation.preferredModel:''}</span>}
                <TinyButton disabled={running} onClick={()=>props.onChatArchive(active.conversation.id)}><Trash2 size={15}/>Archive</TinyButton>
              </div>
            </div>
            <div className="chat-message-list">
              {active.messages.map(message=><div key={message.id} className={'chat-message '+message.role}>
                <div className="chat-message-role">{message.role==='user'?'You':'Agent Core'}</div>
                <pre>{message.content}</pre>
              </div>)}
              {running&&<div className="chat-message assistant pending">
                <div className="chat-message-role">Agent Core</div>
                <div className="chat-progress"><RefreshCw className="spin" size={17}/><span>{event?.type??'turn.accepted'}</span>{event?.toolName&&<b>{event.toolName}</b>}</div>
              </div>}
            </div>
          </>}
          {props.agentChat.error&&<div className="chat-error"><AlertTriangle size={22}/><div><b>Agent chat turn failed</b><p>{props.agentChat.error}</p></div></div>}
        </div>

        <div className="chat-composer">
          <textarea
            value={prompt}
            onChange={e=>setPrompt(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}}}
            placeholder={!configured?'No configured provider.':active?'Message Agent Core…':'Create or open a chat first.'}
            disabled={!configured||!active||running}
            rows={4}
          />
          <div className="chat-composer-footer">
            <span className="chat-composer-hint">Enter to send · Shift+Enter for newline</span>
            {running&&runningTurnId
              ? <TinyButton onClick={()=>props.onChatCancel(runningTurnId)}><X size={16}/>Stop</TinyButton>
              : <TinyButton kind="primary" disabled={!configured||!active||!prompt.trim()||running} onClick={submit}><Play size={17}/>Send</TinyButton>}
          </div>
        </div>
      </Panel>
    </div>
  </div>;
}

function RotateCcwIcon(){return <RefreshCw size={18}/>}

function SettingToggle({title,text,on,disabled,onChange}:{title:string;text:string;on:boolean;disabled?:boolean;onChange?:()=>void}) {
  return <div className="setting-toggle"><div><b>{title}</b><span>{text}</span></div><Toggle on={on} disabled={disabled} onChange={onChange}/></div>;
}

export function ReferenceUi({page,setPage,snapshot,logs,onAction,agentRun,onAgentRun,agentChat,onChatCreate,onChatOpen,onChatSend,onChatCancel,onChatArchive}:{page:PageId;setPage:(p:PageId)=>void;snapshot?:DesktopSnapshot;logs:ActivityEntry[];onAction:(id:string)=>void;agentRun:AgentRunState;onAgentRun:(prompt:string,workspace?:string)=>void;agentChat:AgentChatUiState;onChatCreate:(workspace?:string)=>void;onChatOpen:(conversationId:string)=>void;onChatSend:(conversationId:string,prompt:string)=>void;onChatCancel:(turnId:string)=>void;onChatArchive:(conversationId:string)=>void}) {
  const props={snapshot,logs,onAction,setPage,agentRun,onAgentRun,agentChat,onChatCreate,onChatOpen,onChatSend,onChatCancel,onChatArchive};
  const content=page==='workflows'?<WorkflowsPage/>:page==='chat'?<ChatPage {...props}/>:page==='dashboard'?<DashboardPage {...props}/>:page==='core'?<CoreRuntimePage {...props}/>:page==='systems'?<SystemsPage {...props}/>:page==='activity'?<ActivityLogPage {...props}/>:page==='diagnostics'?<DiagnosticsPage {...props}/>:<SettingsPage {...props}/>;
  return <AppShell page={page} setPage={setPage} snapshot={snapshot} onAction={onAction}>{content}</AppShell>;
}


