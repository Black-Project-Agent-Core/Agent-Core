import React, { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, BookOpen, Boxes, BrainCircuit, ChevronDown, ChevronLeft, ChevronRight,
  CircleAlert, CircleSlash, Clock3, Code2, Cpu, Database, Download, ExternalLink,
  FileText, Folder, FolderOpen, Gamepad2, Gauge, HardDrive, HeartPulse, Home, Info,
  KeyRound, LayoutDashboard, Link2, ListChecks, MoreHorizontal, Play, Power, Puzzle,
  RefreshCw, RotateCcw, Search, Settings, ShieldCheck, Smartphone, Square, Stethoscope,
  Terminal, Trash2, UserRound, Wifi, X, XCircle, type LucideIcon,
} from 'lucide-react';
import type { DesktopSnapshot, ActivityEntry } from './host';
import type { SystemId, SystemView, Tone } from './model';
import { formatDuration } from './model';

export type PageId = 'dashboard' | 'core' | 'systems' | 'activity' | 'diagnostics' | 'settings';

export const systemIcons: Record<SystemId, LucideIcon> = {
  core: Cpu,
  memory: Database,
  code: Link2,
  semantic: Code2,
  execution: Terminal,
  learning: BrainCircuit,
  partner: Link2,
  phone: Smartphone,
  game: Gamepad2,
  tunnel: Wifi,
  integrations: Puzzle,
  auth: KeyRound,
};

export const navItems: Array<{id:PageId; label:string; icon:LucideIcon}> = [
  {id:'dashboard',label:'Dashboard',icon:Home},
  {id:'core',label:'Core Runtime',icon:Cpu},
  {id:'systems',label:'Systems',icon:Boxes},
  {id:'activity',label:'Activity Log',icon:FileText},
  {id:'diagnostics',label:'Diagnostics',icon:Stethoscope},
  {id:'settings',label:'Settings',icon:Settings},
];

export function toneClass(tone: Tone) {
  return `tone-${tone}`;
}

export function StatusBadge({tone,label}:{tone:Tone;label:string}) {
  return <span className={`status-badge ${toneClass(tone)}`}><span className="status-dot"/>{label}</span>;
}

export function IconWell({icon:Icon,tone='unknown',large=false}:{icon:LucideIcon;tone?:Tone;large?:boolean}) {
  return <span className={`icon-well ${toneClass(tone)} ${large?'icon-well-lg':''}`}><Icon size={large?34:20}/></span>;
}

export function Panel({children,className=''}:{children:React.ReactNode;className?:string}) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function SectionTitle({icon:Icon,title,subtitle,action}:{icon:LucideIcon;title:string;subtitle?:string;action?:React.ReactNode}) {
  return <div className="section-title">
    <div className="section-title-copy"><Icon className="section-title-icon" size={23}/><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div></div>
    {action&&<div>{action}</div>}
  </div>;
}

export function MetricCard({icon:Icon,value,label,caption,tone='unknown'}:{icon:LucideIcon;value:string|number;label:string;caption?:string;tone?:Tone}) {
  return <div className="metric-card">
    <IconWell icon={Icon} tone={tone} large/>
    <div className="metric-copy"><strong>{value}</strong><span className={toneClass(tone)}>{label}</span>{caption&&<small>{caption}</small>}</div>
  </div>;
}

export function SystemCard({system,selected,compact=false,onClick}:{system:SystemView;selected?:boolean;compact?:boolean;onClick?:()=>void}) {
  const Icon=systemIcons[system.id];
  return <button type="button" className={`system-card ${compact?'compact':''} ${selected?'selected':''} ${toneClass(system.tone)}`} onClick={onClick}>
    <div className="system-card-top"><IconWell icon={Icon} tone={system.tone}/><div className="system-card-heading"><strong>{system.name}</strong><StatusBadge tone={system.tone} label={system.label}/></div><ChevronRight size={17} className="system-chevron"/></div>
    <p>{system.description}</p>
    <div className="system-card-meta">
      {system.meta.slice(0,compact?2:4).map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}
    </div>
  </button>;
}

export function FilterChip({active,label,count,tone,onClick}:{active?:boolean;label:string;count?:number;tone?:Tone;onClick?:()=>void}) {
  return <button type="button" onClick={onClick} className={`filter-chip ${active?'active':''} ${tone?toneClass(tone):''}`}><span>{label}</span>{count!==undefined&&<b>{count}</b>}</button>;
}

export function TinyButton({children,onClick,kind='neutral',disabled=false,title}:{children:React.ReactNode;onClick?:()=>void;kind?:'neutral'|'primary'|'danger';disabled?:boolean;title?:string}) {
  return <button type="button" className={`tiny-button ${kind}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

export function Toggle({on,disabled,onChange}:{on:boolean;disabled?:boolean;onChange?:()=>void}) {
  return <button type="button" className={`toggle ${on?'on':''}`} onClick={onChange} disabled={disabled} aria-pressed={on}><span/></button>;
}

export function Sparkline({values,tone='healthy'}:{values:number[];tone?:Tone}) {
  const points=useMemo(()=>{
    if(!values.length) return '';
    const max=Math.max(...values,1), min=Math.min(...values,0), spread=Math.max(max-min,1);
    return values.map((v,i)=>`${(i/(values.length-1||1))*100},${30-((v-min)/spread)*24}`).join(' ');
  },[values]);
  return <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={`sparkline ${toneClass(tone)}`}><polyline points={points} fill="none" vectorEffect="non-scaling-stroke"/></svg>;
}

export function RestartMenu({open,onClose,onAction}:{open:boolean;onClose:()=>void;onAction:(id:string)=>void}) {
  if(!open) return null;
  const items=[
    {id:'restart-core',icon:RotateCcw,title:'Graceful Restart',desc:'Restart core with proper shutdown',enabled:true},
    {id:'force-restart',icon:RefreshCw,title:'Force Restart',desc:'Force restart (if unresponsive)',enabled:false},
    {id:'clean-restart',icon:RotateCcw,title:'Restart with Clean Cache',desc:'Clear cache and restart',enabled:false},
    {id:'open-runtime-folder',icon:FolderOpen,title:'Open Runtime Folder',desc:'Open dist/runtime directory',enabled:true},
    {id:'view-process-details',icon:Info,title:'View Process Details',desc:'Show process, port and resources',enabled:true},
  ];
  return <div className="restart-menu" onMouseLeave={onClose}>
    {items.map(({id,icon:Icon,title,desc,enabled})=><button type="button" key={id} disabled={!enabled} onClick={()=>{if(enabled){onAction(id);onClose();}}}><Icon size={19}/><span><b>{title}</b><small>{desc}</small></span></button>)}
  </div>;
}

export function RuntimeActions({snapshot,onAction}:{snapshot?:DesktopSnapshot;onAction:(id:string)=>void}) {
  const [open,setOpen]=useState(false);
  const running=snapshot?.core.httpHealthy ?? false;
  return <div className="runtime-actions">
    <div className="runtime-mini-state"><b>Core Runtime</b><span><i/> {running?'Running':'Stopped'}</span></div>
    <TinyButton kind="primary" onClick={()=>onAction('start-core')} disabled={running}><Play size={18}/>Start</TinyButton>
    <TinyButton onClick={()=>onAction('restart-core')} disabled={!running}><RotateCcw size={18}/>Restart</TinyButton>
    <TinyButton kind="danger" onClick={()=>onAction('stop-core')} disabled={!running}><Square size={17}/>Stop</TinyButton>
    <div className="restart-anchor"><TinyButton onClick={()=>setOpen(v=>!v)}><ChevronDown size={19}/></TinyButton><RestartMenu open={open} onClose={()=>setOpen(false)} onAction={onAction}/></div>
  </div>;
}

export function ProcessCard({snapshot}:{snapshot?:DesktopSnapshot}) {
  return <div className="process-card">
    <div className="process-title"><span className={snapshot?.core.httpHealthy?'dot-green':'dot-red'}/>Agent Core.exe</div>
    <strong>{snapshot?.core.httpHealthy?'Running':'Unavailable'}</strong>
    <span>PID {snapshot?.core.pid ?? '-'}</span>
    <span>Uptime {formatDuration(snapshot?.core.uptimeSeconds)}</span>
    <span>v{snapshot?.version ?? '-'}</span>
  </div>;
}

export function TopBar({page,snapshot,query,setQuery,setPage}:{page:PageId;snapshot?:DesktopSnapshot;query:string;setQuery:(v:string)=>void;setPage:(p:PageId)=>void}) {
  const now=new Date();
  const placeholders:Record<PageId,string>={
    dashboard:'Search systems, components, logs...',
    core:'Search systems, components, logs...',
    systems:'Search systems, components, dependencies...',
    activity:'Search systems, components, logs, commands...',
    diagnostics:'Search systems, components, logs, commands...',
    settings:'Search systems, settings, components...',
  };
  return <header className="topbar">
    <div className="brand"><span className="brand-logo-frame"><img src="./agent-core.png" alt="Agent Core"/></span><div><div className="brand-line"><b>AGENT CORE</b><span>v{snapshot?.version ?? '0.12.0'}</span></div><p><span>Local AI Runtime</span><i className="brand-separator"/><span>Your Machine. Your AI Partner.</span></p></div></div>
    <label className="global-search"><Search size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={placeholders[page]}/><kbd>Ctrl + K</kbd></label>
    <div className="top-right"><span className={`online-pill ${snapshot?.status.overall==='offline'?'offline':''}`}><i/> {snapshot?.status.overall==='offline'?'OFFLINE':'ONLINE'}</span><div className="date-block"><span>{now.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</span><b>{now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</b></div><span className="user-pill">AC</span><button type="button" className="top-icon-button" onClick={()=>setPage('settings')} aria-label="Settings"><Settings size={20}/></button></div>
  </header>;
}

export function Sidebar({page,setPage,snapshot,onAction}:{page:PageId;setPage:(p:PageId)=>void;snapshot?:DesktopSnapshot;onAction:(id:string)=>void}) {
  const shared={enabled:true} as const;
  const quickByPage:Record<PageId,Array<{id:string;label:string;icon:LucideIcon;enabled:boolean}>>={
    dashboard:[
      {id:'open-tunnel-admin',label:'Open Tunnel UI',icon:ExternalLink,...shared},
      {id:'open-folder',label:'Open Agent Core Folder',icon:FolderOpen,...shared},
      {id:'system-snapshot',label:'System Snapshot',icon:Gauge,...shared},
      {id:'reset-oauth',label:'Reset OAuth',icon:KeyRound,...shared},
      {id:'restart-all',label:'Restart All',icon:RefreshCw,...shared},
    ],
    core:[
      {id:'open-runtime-folder',label:'Open Runtime Folder',icon:FolderOpen,...shared},
      {id:'view-process-details',label:'View Process Details',icon:Info,...shared},
      {id:'system-snapshot',label:'System Snapshot',icon:Gauge,...shared},
      {id:'restart-core',label:'Restart Agent Core',icon:RotateCcw,...shared},
      {id:'restart-all',label:'Restart All',icon:RefreshCw,...shared},
    ],
    systems:[
      {id:'open-folder',label:'Open Agent Core Folder',icon:FolderOpen,...shared},
      {id:'system-snapshot',label:'System Snapshot',icon:Gauge,...shared},
      {id:'open-logs',label:'Open Logs Folder',icon:FileText,...shared},
      {id:'reset-oauth',label:'Reset OAuth',icon:KeyRound,...shared},
      {id:'restart-all',label:'Restart All',icon:RefreshCw,...shared},
    ],
    activity:[
      {id:'open-logs',label:'Open Logs Folder',icon:FileText,...shared},
      {id:'clear-logs',label:'Clear Activity Log',icon:Trash2,...shared},
      {id:'system-snapshot',label:'System Snapshot',icon:Gauge,...shared},
      {id:'open-folder',label:'Open Agent Core Folder',icon:FolderOpen,...shared},
    ],
    diagnostics:[
      {id:'system-snapshot',label:'Run System Snapshot',icon:Gauge,...shared},
      {id:'open-logs',label:'Open Logs Folder',icon:FileText,...shared},
      {id:'view-process-details',label:'View Process Details',icon:Info,...shared},
      {id:'open-folder',label:'Open Agent Core Folder',icon:FolderOpen,...shared},
    ],
    settings:[
      {id:'open-folder',label:'Open Agent Core Folder',icon:FolderOpen,...shared},
      {id:'open-memory-folder',label:'Open Memory Store',icon:Database,...shared},
      {id:'open-logs',label:'Open Logs Folder',icon:FileText,...shared},
      {id:'reset-oauth',label:'Reset OAuth',icon:KeyRound,...shared},
      {id:'restart-all',label:'Restart All',icon:RefreshCw,...shared},
    ],
  };
  const quick=quickByPage[page];
  return <aside className="sidebar">
    <nav>{navItems.map(({id,label,icon:Icon})=><button type="button" key={id} onClick={()=>setPage(id)} className={page===id?'active':''}><Icon size={20}/><span>{label}</span></button>)}</nav>
    <div className="sidebar-divider"/>
    <small className="sidebar-label">Quick Actions</small>
    <div className="quick-actions">{quick.map(({id,label,icon:Icon,enabled})=><button type="button" key={id} disabled={!enabled} onClick={()=>enabled&&onAction(id)}><Icon size={18}/><span>{label}</span></button>)}</div>
    <ProcessCard snapshot={snapshot}/>
  </aside>;
}

export function AppShell({page,setPage,snapshot,onAction,children}:{page:PageId;setPage:(p:PageId)=>void;snapshot?:DesktopSnapshot;onAction:(id:string)=>void;children:React.ReactNode}) {
  const [query,setQuery]=useState('');
  return <div className="app-shell"><TopBar page={page} snapshot={snapshot} query={query} setQuery={setQuery} setPage={setPage}/><div className="app-body"><Sidebar page={page} setPage={setPage} snapshot={snapshot} onAction={onAction}/><main className="main-content">{children}</main></div></div>;
}

export function PageHero({icon:Icon,title,subtitle,children}:{icon:LucideIcon;title:string;subtitle:string;children?:React.ReactNode}) {
  return <Panel className="page-hero"><div className="page-hero-copy"><Icon className="page-hero-icon" size={33}/><div><h1>{title}</h1><p>{subtitle}</p></div></div>{children&&<div className="page-hero-actions">{children}</div>}</Panel>;
}

export function Tabs({items,active,setActive}:{items:string[];active:string;setActive:(v:string)=>void}) {
  return <div className="tabs">{items.map(item=><button type="button" key={item} className={active===item?'active':''} onClick={()=>setActive(item)}>{item}</button>)}</div>;
}

export function EmptyAction({label}:{label:string}) {
  return <button className="empty-action" type="button" disabled><Info size={18}/>{label}</button>;
}

export const uiIcons = {
  Activity, AlertTriangle, ArrowRight, BookOpen, Boxes, BrainCircuit, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleSlash, Clock3,
  Code2, Cpu, Database, Download, ExternalLink, FileText, Folder, Gamepad2, Gauge, HardDrive,
  HeartPulse, Info, KeyRound, LayoutDashboard, Link2, ListChecks, MoreHorizontal, Play, Power,
  Puzzle, RefreshCw, Search, Settings, ShieldCheck, Smartphone, Stethoscope, Terminal, Trash2,
  UserRound, Wifi, X, XCircle,
};
