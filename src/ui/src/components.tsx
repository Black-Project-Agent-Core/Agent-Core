import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AGENT_CORE_VERSION } from '../../version';
import { LauncherInspector } from './LauncherInspector';
import {
  Activity, AlertTriangle, ArrowRight, BookOpen, Boxes, BrainCircuit, ChevronDown, ChevronLeft, ChevronRight,
  CircleAlert, CircleSlash, Clock3, Code2, Cpu, Database, Download, ExternalLink,
  FileText, Folder, FolderOpen, Gamepad2, Gauge, HardDrive, HeartPulse, Home, Info,
  KeyRound, LayoutDashboard, Link2, ListChecks, MessageSquarePlus, MoreHorizontal, Play, Power, Puzzle,
  RefreshCw, RotateCcw, Search, Settings, ShieldCheck, Smartphone, Square, Stethoscope,
  Terminal, Trash2, UserRound, Wifi, X, XCircle, Target, FolderArchive, Moon, Wrench, SlidersHorizontal, Minimize2, type LucideIcon,
} from 'lucide-react';
import { postHost, subscribeHost, type DesktopSnapshot, type ActivityEntry, type AgentChatUiState, type LauncherWindowSize } from './host';
import type { SystemId, SystemView, Tone } from './model';
import { formatDuration } from './model';

export type PageId = 'chat' | 'dashboard' | 'goals' | 'artifacts' | 'models' | 'memory' | 'learning' | 'core' | 'systems' | 'workflows' | 'activity' | 'diagnostics' | 'settings' | 'wizard';

export const systemIcons: Record<SystemId, LucideIcon> = {
  core: Cpu,
  memory: Database,
  code: Link2,
  semantic: Code2,
  execution: Terminal,
  learning: BrainCircuit,
  skills: BookOpen,
  'external-learning': ListChecks,
  'web-research': Search,
  'mutation-safety': ShieldCheck,
  partner: Link2,
  phone: Smartphone,
  game: Gamepad2,
  tunnel: Wifi,
  integrations: Puzzle,
  auth: KeyRound,
};

export const navItems: Array<{id:PageId; label:string; icon:LucideIcon; group:string}> = [
  {id:'chat',label:'AI Workspace',icon:MessageSquarePlus,group:'Workspace'},
  {id:'dashboard',label:'Dashboard',icon:LayoutDashboard,group:'Workspace'},
  {id:'goals',label:'Goals & Plans',icon:Target,group:'Workspace'},
  {id:'artifacts',label:'Artifacts',icon:FolderArchive,group:'Workspace'},
  {id:'systems',label:'Tools Hub & MCP',icon:Wrench,group:'AI Capabilities'},
  {id:'models',label:'AI Models',icon:Boxes,group:'AI Capabilities'},
  {id:'memory',label:'Memory Explorer',icon:Database,group:'AI Capabilities'},
  {id:'learning',label:'Dreaming Review',icon:Moon,group:'AI Capabilities'},
  {id:'core',label:'Core Runtime',icon:Cpu,group:'System'},
  {id:'activity',label:'Activity Log',icon:FileText,group:'System'},
  {id:'diagnostics',label:'Diagnostics & Recovery',icon:Stethoscope,group:'System'},
  {id:'settings',label:'Settings',icon:Settings,group:'System'},
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
    {id:'restart-tunnel',icon:Wifi,title:'Restart Tunnel Only',desc:'Restart tunnel without restarting core',enabled:true},
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

export function Sidebar({page,setPage,snapshot,onAction,onNewChat,newChatPending=false,collapsed=false,onToggleCollapse}:{page:PageId;setPage:(p:PageId)=>void;snapshot?:DesktopSnapshot;onAction:(id:string)=>void;onNewChat?:()=>void;newChatPending?:boolean;collapsed?:boolean;onToggleCollapse?:()=>void}) {
  const [menuOpen,setMenuOpen]=useState(false);
  const footRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!menuOpen)return;
    const onDown=(event:MouseEvent)=>{if(!footRef.current?.contains(event.target as Node))setMenuOpen(false);};
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenuOpen(false);};
    document.addEventListener('mousedown',onDown);
    document.addEventListener('keydown',onKey);
    return()=>{
      document.removeEventListener('mousedown',onDown);
      document.removeEventListener('keydown',onKey);
    };
  },[menuOpen]);
  const shared={enabled:true} as const;
  const quickByPage:Partial<Record<PageId,Array<{id:string;label:string;icon:LucideIcon;enabled:boolean}>>>={
    workflows:[],
    chat:[
      {id:'open-memory-folder',label:'Open Memory Store',icon:Database,...shared},
      {id:'open-logs',label:'Open Logs Folder',icon:FileText,...shared},
      {id:'system-snapshot',label:'System Snapshot',icon:Gauge,...shared},
    ],
    dashboard:[
      {id:'open-tunnel-admin',label:'Open Tunnel UI',icon:ExternalLink,...shared},
      {id:'restart-tunnel',label:'Restart Tunnel Only',icon:Wifi,...shared},
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
      {id:'restart-tunnel',label:'Restart Tunnel Only',icon:Wifi,...shared},
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
  const quick=quickByPage[page]??quickByPage.chat!;
  const state=!snapshot?'CONNECTING':snapshot.status.overall==='offline'?'OFFLINE':snapshot.status.overall==='degraded'?'DEGRADED':'ONLINE';
  return <aside className={'rail launcher-nav'+(collapsed?' collapsed':'')}>
    <button type="button" className="launcher-new-chat" aria-label="New Chat" title="New AI Conversation" disabled={newChatPending} onClick={()=>{onNewChat?.();setPage('chat');}}><MessageSquarePlus size={17}/><span>New Session</span></button>
    <nav aria-label="Agent Core pages">
      {['Workspace','AI Capabilities','System'].map(group=><div className="launcher-nav-group" key={group}><h2>{group}</h2>
        {navItems.filter(item=>item.group===group).map(({id,label,icon:Icon})=><button type="button" key={id} className={`rail-button ${page===id?'active':''}`} aria-label={label} title={label} aria-current={page===id?'page':undefined} onClick={()=>setPage(id)}><Icon size={16}/><span>{label}</span></button>)}
      </div>)}
    </nav>
    <div className="rail-foot" ref={footRef}>
      <button type="button" className="launcher-setup-link" onClick={()=>setPage('wizard')}><Wrench size={13}/><span>Setup Wizard</span></button>
      <button type="button" className={`rail-button ${menuOpen?'active':''}`} aria-label="Quick Actions" title="Quick Actions" aria-haspopup="true" aria-expanded={menuOpen} onClick={()=>setMenuOpen(open=>!open)}><MoreHorizontal size={18}/></button>
      {menuOpen&&<div className="rail-menu">
        <ProcessCard snapshot={snapshot}/>
        {quick.map(({id,label,icon:Icon,enabled})=><button type="button" key={id} disabled={!enabled} onClick={()=>{if(enabled){onAction(id);setMenuOpen(false);}}}><Icon size={16}/><span>{label}</span></button>)}
      </div>}
      {onToggleCollapse&&<button type="button" className="rail-button launcher-collapse" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed} onClick={onToggleCollapse}>{collapsed?<ChevronRight size={16}/>:<ChevronLeft size={16}/>}</button>}
    </div>
  </aside>;
}

export function AppShell({page,setPage,snapshot,onAction,onNewChat,agentChat,logs=[],children}:{page:PageId;setPage:(p:PageId)=>void;snapshot?:DesktopSnapshot;onAction:(id:string)=>void;onNewChat?:()=>void;agentChat?:AgentChatUiState;logs?:ActivityEntry[];children:React.ReactNode}) {
  const [sizeOpen,setSizeOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem('agentcore.launcher.sidebarCollapsed')==='true';}catch{return false;}});
  const [inspectorOpen,setInspectorOpen]=useState(true);
  const toggleSidebar=()=>setCollapsed(value=>{try{localStorage.setItem('agentcore.launcher.sidebarCollapsed',String(!value));}catch{/* optional preference */}return !value;});
  const running=snapshot?.core.httpHealthy??false;
  const state=!snapshot?'Connecting':running?'Ready':snapshot.core.pid?'Degraded':'Unavailable';
  return <div className={'app-shell launcher-shell'+(collapsed?' nav-collapsed':'')}>
    <header className="launcher-topbar">
      <button type="button" className="launcher-brand" aria-label="Agent Core home" onClick={()=>setPage('chat')}><img src="./agent-core.png" alt="Agent Core"/><b>AGENT CORE</b><small>v{snapshot?.version??AGENT_CORE_VERSION}</small></button>
      <button type="button" className="launcher-root" title={snapshot?.paths.root??'Waiting for workspace'} onClick={()=>onAction('open-folder')} disabled={!snapshot}><Folder size={14}/><span>{snapshot?.paths.root??'Connecting to workspace'}</span></button>
      <div className="launcher-topbar-status">
        <button type="button" className={'launcher-core-state '+(running?'ready':'waiting')} onClick={()=>setPage('core')}><i/>{`Core: ${state}`}</button>
        <button type="button" className="launcher-icon-button" aria-label={running?'Restart Core':'Start Core'} disabled={!snapshot} onClick={()=>onAction(running?'restart-core':'start-core')}>{running?<RefreshCw size={14}/>:<Power size={14}/>}</button>
        <button type="button" className="launcher-icon-button stop" aria-label="Stop Core" disabled={!running} onClick={()=>onAction('stop-core')}><Square size={13}/></button>
        {agentChat?.active?.turns.some(turn=>turn.status==='resumable')&&<button className="prototype-attention" onClick={()=>setPage('chat')}><ShieldCheck size={13}/>Action Required (1)</button>}
      </div>
      <button type="button" className="launcher-recovery" onClick={()=>setPage('diagnostics')}><Stethoscope size={14}/><span>Recovery</span></button>
      <button type="button" className="launcher-recovery launcher-setup-top" onClick={()=>setPage('wizard')}><Wrench size={14}/><span>Setup Wizard</span></button>
      <button className="launcher-icon-button" aria-label="Edit Window Size" onClick={()=>setSizeOpen(true)}><SlidersHorizontal size={13}/></button>
      <div className="prototype-window-controls" title="Use the native window frame; in-app window controls are a planned upgrade"><button disabled aria-label="Minimize window"><Minimize2 size={12}/></button><button disabled aria-label="Maximize window"><Square size={11}/></button><button disabled aria-label="Close window"><X size={13}/></button></div>
    </header>
    <Sidebar page={page} setPage={setPage} snapshot={snapshot} onAction={onAction} onNewChat={onNewChat} newChatPending={agentChat?.creating} collapsed={collapsed} onToggleCollapse={toggleSidebar}/>
    <div className="launcher-stage"><main id="launcher-main" className="main-content">{children}</main>
      {page==='chat'&&<LauncherInspector snapshot={snapshot} chat={agentChat} logs={logs} onArtifacts={()=>setPage('artifacts')} open={inspectorOpen} onToggle={()=>setInspectorOpen(open=>!open)}/>}
    </div>
    {sizeOpen&&<WindowSizeDialog onClose={()=>setSizeOpen(false)}/>}
  </div>;
}

function WindowSizeDialog({onClose}:{onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  const pending=useRef<{id:string;timer:ReturnType<typeof setTimeout>;widthRevision:number;heightRevision:number} | null>(null);
  const revisions=useRef({width:0,height:0});
  const [size,setSize]=useState<LauncherWindowSize>();
  const [width,setWidth]=useState(''), [height,setHeight]=useState('');
  const [waiting,setWaiting]=useState(false), [error,setError]=useState('');
  const request=(next?:{width:number;height:number})=>{
    if(pending.current)return;
    const id=globalThis.crypto?.randomUUID?.() ?? `window-size-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setWaiting(true);setError('');
    pending.current={id,widthRevision:revisions.current.width,heightRevision:revisions.current.height,timer:setTimeout(()=>{if(pending.current?.id!==id)return;pending.current=null;setWaiting(false);setError('No confirmation from the launcher. Reopen this dialog to check the current size.');},8000)};
    postHost(next?{type:'window-size-set',requestId:id,...next}:{type:'window-size-get',requestId:id});
  };
  useEffect(()=>{
    ref.current?.showModal();
    const unsubscribe=subscribeHost(message=>{
      if((message.type!=='window-size-state'&&message.type!=='window-size-error')||message.requestId!==pending.current?.id)return;
      const sent=pending.current;clearTimeout(sent.timer);pending.current=null;setWaiting(false);
      const value=message.size;
      if(!value||![value.width,value.height,value.defaultWidth,value.defaultHeight,value.minWidth,value.minHeight,value.maxDimension].every(Number.isInteger)){
        setError('The launcher returned an invalid window size.');return;
      }
      setSize(value);if(revisions.current.width===sent.widthRevision)setWidth(String(value.width));if(revisions.current.height===sent.heightRevision)setHeight(String(value.height));
      setError(message.type==='window-size-error'?message.error:message.warning??'');
    });
    request();
    return()=>{unsubscribe();if(pending.current)clearTimeout(pending.current.timer);pending.current=null;};
  },[]);
  const w=Number(width),h=Number(height);
  const valid=Boolean(size && /^\d+$/.test(width) && /^\d+$/.test(height) && Number.isSafeInteger(w) && Number.isSafeInteger(h)
    && w>=size.minWidth && h>=size.minHeight && w<=size.maxDimension && h<=size.maxDimension);
  const presets=[{name:'Default',width:size?.defaultWidth??1202,height:size?.defaultHeight??811},{name:'Compact',width:1024,height:768},{name:'Laptop',width:1280,height:800},{name:'Wide',width:1440,height:900}];
  return <dialog ref={ref} className="prototype-window-dialog" aria-labelledby="window-size-title" onClose={onClose} onClick={event=>{if(event.target===ref.current)ref.current?.close();}}>
    <div className="prototype-section-title"><h2 id="window-size-title"><SlidersHorizontal size={16}/>Edit Window Size</h2><button type="button" aria-label="Close window size dialog" onClick={()=>ref.current?.close()}><X size={17}/></button></div>
    <div className="prototype-columns"><label className="prototype-field">Width (Lebar)<span className="prototype-size-input"><input type="number" min={size?.minWidth} max={size?.maxDimension} value={width} disabled={!size} onChange={e=>{revisions.current.width++;setWidth(e.target.value);}} aria-label="Window width"/><span aria-hidden="true">px</span></span></label><label className="prototype-field">Height (Tinggi)<span className="prototype-size-input"><input type="number" min={size?.minHeight} max={size?.maxDimension} value={height} disabled={!size} onChange={e=>{revisions.current.height++;setHeight(e.target.value);}} aria-label="Window height"/><span aria-hidden="true">px</span></span></label></div>
    <h3>PRESETS</h3><div className="prototype-size-presets">{presets.map(preset=><button type="button" key={preset.name} disabled={!size||waiting} aria-pressed={size?.width===preset.width&&size?.height===preset.height} onClick={()=>request({width:preset.width,height:preset.height})}>{preset.name} ({preset.width} × {preset.height})</button>)}</div>
    <p>{size?`Successfully applied sizes are saved automatically. Minimum: ${size.minWidth} × ${size.minHeight} px.`:'Reading window size from the launcher…'}</p>{error&&<p role="alert">{error}</p>}
    <div className="prototype-actions"><button type="button" disabled={!size||waiting} onClick={()=>size&&request({width:size.defaultWidth,height:size.defaultHeight})}>Reset Default</button><button type="button" onClick={()=>ref.current?.close()}>Cancel</button><button type="button" disabled={!valid||waiting} onClick={()=>request({width:w,height:h})}>Apply</button></div>
  </dialog>;
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
  HeartPulse, Info, KeyRound, LayoutDashboard, Link2, ListChecks, MessageSquarePlus, MoreHorizontal, Play, Power,
  Puzzle, RefreshCw, Search, Settings, ShieldCheck, Smartphone, Stethoscope, Terminal, Trash2,
  UserRound, Wifi, X, XCircle,
};
