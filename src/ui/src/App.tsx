import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Folder,
  ExternalLink,
  RotateCcw,
  RefreshCw,
  Key,
  Power,
} from 'lucide-react';
import { postHost, subscribeHost } from './host';

type ModuleStatus = 'on' | 'off' | 'degraded';

interface ModuleItem {
  id: string;
  name: string;
  num: string;
}

interface LogEntry {
  id: string;
  time: string;
  module: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'sys';
  message: string;
}

const MODULES: ModuleItem[] = [
  { id: 'connection', name: 'Connection', num: '01' },
  { id: 'memory', name: 'Memory', num: '02' },
  { id: 'tunnel', name: 'Tunnel', num: '03' },
  { id: 'execution', name: 'Execution', num: '04' },
  { id: 'gamemode', name: 'Game Mode', num: '05' },
];

function getCurrentTimeStr(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function App() {
  const [statuses, setStatuses] = useState<Record<string, ModuleStatus>>({
    connection: 'off',
    memory: 'off',
    tunnel: 'off',
    execution: 'off',
    gamemode: 'off',
  });

  const [overall, setOverall] = useState<'online' | 'degraded' | 'offline'>('offline');
  const [startWithWindows, setStartWithWindows] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<string>('tunnel-admin');

  const [logs, setLogs] = useState<LogEntry[]>([]);

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const unsubscribe = subscribeHost((message) => {
      if (message.type === 'status') {
        setOverall(message.status.overall);
        setStatuses({
          connection: message.status.connection,
          memory: message.status.memory === 'available' ? 'on' : message.status.memory === 'degraded' ? 'degraded' : 'off',
          tunnel: message.status.tunnel,
          execution: message.status.execution === 'available' ? 'on' : 'off',
          // Passive indicator: reflects phone controller transport health (on = stable, off = disrupted).
          gamemode: message.status.gameMode === 'on' ? 'on' : 'off',
        });
        setStartWithWindows(message.status.autostart);
        return;
      }
      if (message.type === 'logs') { setLogs(message.entries); return; }
      if (message.type === 'log') { setLogs((prev) => [...prev, message.entry]); return; }
      if (message.type === 'error') {
        setLogs((prev) => [...prev, { id: `error-${Date.now()}`, time: getCurrentTimeStr(), module: 'SYSTEM', level: 'warn', message: message.message }]);
      }
    });
    postHost({ type: 'ready' });
    return unsubscribe;
  }, []);

  const clearLogs = () => {
    postHost({ type: 'action', action: 'clear-logs' });
  };

  const handleActionClick = (actionId: string, _label: string) => {
    setActiveAction(actionId);
    const actions: Record<string, string> = {
      'activity-monitor': 'activity-monitor',
      'core-folder': 'open-folder',
      'tunnel-admin': 'open-tunnel-admin',
      'restart-core': 'restart-core',
      'restart-tunnel': 'restart-tunnel',
      'restart-all': 'restart-all',
      'reset-oauth': 'reset-oauth',
      'toggle-windows': 'toggle-autostart',
    };
    const action = actions[actionId];
    if (action) postHost({ type: 'action', action });
  };

  return (
    <div
      id="app-root"
      className="w-screen h-screen bg-[#070b13] font-sans select-none overflow-hidden"
    >
      {/* Main Frame */}
      <div
        id="monitor-frame"
        className="relative w-full h-full bg-[#0b1322] border border-[#1b263b]/80 rounded-none p-6 sm:p-8 md:p-10 overflow-hidden shadow-none"
      >
        {/* Sleek subtle diagonal glass sheen on the right */}
        <div
          id="monitor-glass-sheen"
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          {/* Diagonal cut sheen */}
          <div
            className="absolute top-0 right-0 h-full w-[45%] opacity-70"
            style={{
              background:
                'linear-gradient(125deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.015) 30%, transparent 65%)',
              clipPath: 'polygon(25% 0%, 100% 0%, 100% 100%, 75% 100%)',
            }}
          />
          {/* Subtle line along the diagonal seam */}
          <div
            className="absolute top-0 right-0 h-full w-[45%] opacity-30"
            style={{
              background:
                'linear-gradient(125deg, rgba(147, 197, 253, 0.15) 0%, rgba(147, 197, 253, 0.03) 50%, transparent 80%)',
              clipPath: 'polygon(24.5% 0%, 25.5% 0%, 75.5% 100%, 74.5% 100%)',
            }}
          />
        </div>

        {/* Header: Agent Core Brand Info + 3x2 Grid of Quick Action Cards */}
        <header
          id="monitor-header"
          className="relative z-10 mb-6 sm:mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6"
        >
          {/* Brand Info */}
          <div id="brand-block" className="flex flex-col shrink-0">
            <div className="flex items-center gap-3">
              <h1
                id="monitor-title"
                className="text-white font-bold text-[18px] sm:text-[20px] md:text-[22px] tracking-[0.03em] uppercase leading-tight"
              >
                AGENT CORE
              </h1>
              <span
                id="status-live-pill"
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase border ${
                  overall === 'online'
                    ? 'bg-[#0f2d1e] text-[#4ade80] border-[#22c55e]/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]'
                    : overall === 'degraded'
                      ? 'bg-[#34290d] text-[#facc15] border-[#eab308]/30 shadow-[0_0_10px_rgba(234,179,8,0.2)]'
                      : 'bg-[#331114] text-[#f87171] border-[#ef4444]/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  overall === 'online' ? 'bg-[#22c55e] animate-pulse' : overall === 'degraded' ? 'bg-[#facc15]' : 'bg-[#ef4444]'
                }`} />
                {overall.toUpperCase()}
              </span>
            </div>
            <p
              id="monitor-subtitle"
              className="text-[#597597] font-semibold text-[11px] sm:text-[12px] tracking-[0.08em] uppercase mt-1"
            >
              REAL-TIME METRICS
            </p>
          </div>

          {/* Top Actions: 3 columns x 2 rows of Standalone Cards */}
          <div
            id="top-actions-grid"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 flex-1 max-w-[660px]"
          >
            {/* Row 1, Col 1: System Snapshot */}
            <button
              id="action-card-activity-monitor"
              type="button"
              onClick={() => handleActionClick('activity-monitor', 'System Snapshot')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] border text-left transition-all cursor-pointer shadow-sm ${
                activeAction === 'activity-monitor'
                  ? 'bg-[#15243b] border-[#3b82f6]/60 text-white shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                  : 'bg-[#0c1424] border-[#18263c] text-[#cbd5e1] hover:border-[#223859] hover:bg-[#101b2f] hover:text-white'
              }`}
            >
              <Activity className="w-4 h-4 text-[#8ea4c2] shrink-0" />
              <span className="text-[12.5px] font-medium tracking-wide truncate">
                System Snapshot
              </span>
            </button>

            {/* Row 1, Col 2: Open Tunnel Admin UI */}
            <button
              id="action-card-tunnel-admin"
              type="button"
              onClick={() => handleActionClick('tunnel-admin', 'Open Tunnel Admin UI')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] border text-left transition-all cursor-pointer shadow-sm ${
                activeAction === 'tunnel-admin'
                  ? 'bg-[#15243b] border-[#38d39f]/60 text-white shadow-[0_0_12px_rgba(56,211,159,0.25)]'
                  : 'bg-[#0c1424] border-[#18263c] text-[#cbd5e1] hover:border-[#223859] hover:bg-[#101b2f] hover:text-white'
              }`}
            >
              <ExternalLink className="w-4 h-4 text-[#8ea4c2] shrink-0" />
              <span className="text-[12.5px] font-medium tracking-wide truncate">
                Open Tunnel Admin UI
              </span>
            </button>

            {/* Row 1, Col 3: Restart Tunnel */}
            <button
              id="action-card-restart-tunnel"
              type="button"
              onClick={() => handleActionClick('restart-tunnel', 'Restart Tunnel')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] border text-left transition-all cursor-pointer shadow-sm ${
                activeAction === 'restart-tunnel'
                  ? 'bg-[#15243b] border-[#38bdf8]/60 text-white shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                  : 'bg-[#0c1424] border-[#18263c] text-[#cbd5e1] hover:border-[#223859] hover:bg-[#101b2f] hover:text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4 text-[#8ea4c2] shrink-0" />
              <span className="text-[12.5px] font-medium tracking-wide truncate">
                Restart Tunnel
              </span>
            </button>

            {/* Row 2, Col 1: Open Agent Core Folder */}
            <button
              id="action-card-core-folder"
              type="button"
              onClick={() => handleActionClick('core-folder', 'Open Agent Core Folder')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] border text-left transition-all cursor-pointer shadow-sm ${
                activeAction === 'core-folder'
                  ? 'bg-[#15243b] border-[#f472b6]/60 text-white shadow-[0_0_12px_rgba(244,114,182,0.25)]'
                  : 'bg-[#0c1424] border-[#18263c] text-[#cbd5e1] hover:border-[#223859] hover:bg-[#101b2f] hover:text-white'
              }`}
            >
              <Folder className="w-4 h-4 text-[#8ea4c2] shrink-0" />
              <span className="text-[12.5px] font-medium tracking-wide truncate">
                Open Agent Core Folder
              </span>
            </button>

            {/* Row 2, Col 2: Restart Agent Core */}
            <button
              id="action-card-restart-core"
              type="button"
              onClick={() => handleActionClick('restart-core', 'Restart Agent Core')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] border text-left transition-all cursor-pointer shadow-sm ${
                activeAction === 'restart-core'
                  ? 'bg-[#15243b] border-[#facc15]/60 text-white shadow-[0_0_12px_rgba(250,204,21,0.25)]'
                  : 'bg-[#0c1424] border-[#18263c] text-[#cbd5e1] hover:border-[#223859] hover:bg-[#101b2f] hover:text-white'
              }`}
            >
              <RotateCcw className="w-4 h-4 text-[#8ea4c2] shrink-0" />
              <span className="text-[12.5px] font-medium tracking-wide truncate">
                Restart Agent Core
              </span>
            </button>

            {/* Row 2, Col 3: Restart All */}
            <button
              id="action-card-restart-all"
              type="button"
              onClick={() => handleActionClick('restart-all', 'Restart All')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] border text-left transition-all cursor-pointer shadow-sm ${
                activeAction === 'restart-all'
                  ? 'bg-[#15243b] border-[#ef4444]/60 text-white shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                  : 'bg-[#0c1424] border-[#18263c] text-[#cbd5e1] hover:border-[#223859] hover:bg-[#101b2f] hover:text-white'
              }`}
            >
              <RotateCcw className="w-4 h-4 text-[#8ea4c2] shrink-0" />
              <span className="text-[12.5px] font-medium tracking-wide truncate">
                Restart All
              </span>
            </button>
          </div>
        </header>

        {/* Content Layout: Left Sized Cards + Indicators + Right Activity Log */}
        <div
          id="monitor-content"
          className="relative z-10 flex flex-col md:flex-row gap-5 lg:gap-6 items-stretch"
        >
          {/* Left Column: Utility Cards + Module Cards with Indicators */}
          <div
            id="metrics-column"
            className="flex flex-col gap-3.5 shrink-0 justify-between"
          >
            {/* Utility Card 1: Start with Windows: On / Off (White Box from Screenshot) */}
            <div id="row-start-with-windows" className="flex items-center">
              <button
                id="card-start-with-windows"
                type="button"
                onClick={() => handleActionClick('toggle-windows', 'Start with Windows')}
                className="bg-[#0c1626] border border-[#1e2e48] hover:border-[#2b446a] rounded-[16px] px-4 py-3 shadow-sm flex items-center justify-between gap-3 w-[185px] sm:w-[205px] md:w-[215px] shrink-0 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Power
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      startWithWindows ? 'text-[#38d39f]' : 'text-[#ef4444]'
                    }`}
                  />
                  <span className="text-white text-[13px] font-semibold tracking-wide truncate">
                    Start Windows
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                    startWithWindows
                      ? 'bg-[#0f2d1e] text-[#4ade80] border-[#22c55e]/40 shadow-[0_0_8px_rgba(34,197,94,0.3)]'
                      : 'bg-[#331114] text-[#f87171] border-[#ef4444]/40'
                  }`}
                >
                  {startWithWindows ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            {/* Utility Card 2: Reset OAuth / Re-auth (Blue Box from Screenshot) */}
            <div id="row-reset-oauth" className="flex items-center">
              <button
                id="card-reset-oauth"
                type="button"
                onClick={() => handleActionClick('reset-oauth', 'Reset OAuth / Re-auth')}
                className="bg-[#0c1626] border border-[#1e2e48] hover:border-[#3b82f6]/60 rounded-[16px] px-4 py-3 shadow-sm flex items-center gap-2.5 w-[185px] sm:w-[205px] md:w-[215px] shrink-0 transition-all cursor-pointer text-left group"
              >
                <Key className="w-4 h-4 text-[#60a5fa] shrink-0 group-hover:rotate-12 transition-transform" />
                <span className="text-white text-[13px] font-semibold tracking-wide truncate">
                  Reset OAuth / Re-auth
                </span>
              </button>
            </div>

            {/* Module Rows: 01 to 04 */}
            {MODULES.map((module) => {
              const currentStatus = statuses[module.id];
              return (
                <div
                  key={module.id}
                  id={`row-${module.id}`}
                  className="flex items-center gap-3 sm:gap-3.5"
                >
                  {/* Sized Card: Encapsulates Module Number & Name */}
                  <div
                    id={`card-${module.id}`}
                    className="bg-[#0c1626] border border-[#16253c] rounded-[16px] px-5 py-3.5 shadow-sm flex items-center gap-3.5 w-[185px] sm:w-[205px] md:w-[215px] shrink-0 transition-colors hover:border-[#1e3352]"
                  >
                    <span
                      id={`card-number-${module.id}`}
                      className="text-[#4b6585] text-xs font-mono font-medium shrink-0"
                    >
                      {module.num}
                    </span>
                    <span
                      id={`label-${module.id}`}
                      className="text-white text-[15px] sm:text-[16px] font-semibold tracking-wide whitespace-nowrap"
                    >
                      {module.name}
                    </span>
                  </div>

                  {/* Indicators: Bulat Hijau (ON) dan tepat di sampingnya Bulat Merah (OFF) */}
                  <div
                    id={`indicators-${module.id}`}
                    className="flex items-center gap-2 shrink-0"
                  >
                    {/* Indikator bulat hijau - ON */}
                    <div
                      id={`indicator-${module.id}-on`}
                      aria-label={`${module.name} ON`}
                      data-active={currentStatus === 'on'}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
                        currentStatus === 'on'
                          ? 'bg-[#0f2d1e] border-[#22c55e]/60 text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                          : 'bg-[#0a1320] border-[#182a40] text-[#5d7593]'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full transition-all shrink-0 ${
                          currentStatus === 'on'
                            ? 'bg-[#22c55e] shadow-[0_0_8px_#22c55e]'
                            : 'bg-[#154628] opacity-60'
                        }`}
                      />
                      <span className="text-[11px] font-bold tracking-wider">ON</span>
                    </div>

                    {currentStatus === 'degraded' && (
                      <div
                        id={`indicator-${module.id}-degraded`}
                        aria-label={`${module.name} DEGRADED`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-[#34290d] border-[#eab308]/60 text-white shadow-[0_0_10px_rgba(234,179,8,0.25)]"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#facc15] shadow-[0_0_8px_#facc15] shrink-0" />
                        <span className="text-[11px] font-bold tracking-wider">DEG</span>
                      </div>
                    )}

                    {/* Indikator bulat merah tepat di sampingnya - OFF */}
                    <div
                      id={`indicator-${module.id}-off`}
                      aria-label={`${module.name} OFF`}
                      data-active={currentStatus === 'off'}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
                        currentStatus === 'off'
                          ? 'bg-[#331114] border-[#ef4444]/60 text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                          : 'bg-[#0a1320] border-[#182a40] text-[#5d7593]'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full transition-all shrink-0 ${
                          currentStatus === 'off'
                            ? 'bg-[#ef4444] shadow-[0_0_8px_#ef4444]'
                            : 'bg-[#5e191b] opacity-60'
                        }`}
                      />
                      <span className="text-[11px] font-bold tracking-wider">OFF</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Activity Log filling remaining area and matching total height */}
          <div
            id="activity-log-card"
            className="flex-1 bg-[#0c1626] border border-[#16253c] rounded-[18px] p-5 sm:p-6 shadow-sm flex flex-col justify-between min-h-[360px]"
          >
            {/* Activity Log Header */}
            <div
              id="activity-log-header"
              className="flex items-center justify-between pb-3.5 border-b border-[#16253c] mb-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#38d39f] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#38d39f]" />
                </span>
                <h2
                  id="activity-log-title"
                  className="text-white font-bold text-[13px] sm:text-[14px] tracking-[0.05em] uppercase"
                >
                  ACTIVITY LOG
                </h2>
              </div>

              <button
                id="btn-clear-logs"
                type="button"
                onClick={clearLogs}
                className="text-[#597597] hover:text-[#93a9c7] text-[11px] font-semibold tracking-wider uppercase transition-colors px-2 py-0.5 rounded hover:bg-[#121f33] cursor-pointer"
              >
                CLEAR
              </button>
            </div>

            {/* Terminal Log Stream */}
            <div
              id="activity-log-stream"
              className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-1 text-xs font-mono select-text scrollbar-thin"
              style={{ scrollbarWidth: 'thin' }}
            >
              {logs.map((log) => {
                let badgeStyle = 'bg-[#14263d] text-[#6cb4f8] border-[#1f3a5e]';
                if (log.level === 'success') {
                  badgeStyle = 'bg-[#0f2d1e] text-[#4ade80] border-[#22c55e]/30';
                } else if (log.level === 'warn' || log.level === 'error') {
                  badgeStyle = 'bg-[#331114] text-[#f87171] border-[#ef4444]/30';
                } else if (log.level === 'sys') {
                  badgeStyle = 'bg-[#192233] text-[#a5b4fc] border-[#374563]';
                }

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-2.5 leading-relaxed hover:bg-[#111e33]/60 p-1.5 rounded transition-colors"
                  >
                    <span className="text-[#4b6585] shrink-0 font-medium">{log.time}</span>
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border shrink-0 ${badgeStyle}`}
                    >
                      {log.module}
                    </span>
                    <span className="text-[#cbd5e1] break-words">{log.message}</span>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
