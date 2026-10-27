import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ActivityLogPage } from './pages';
import type { ActivityDetailPage, ActivityEntry } from './host';

const id='abababababababababababababababab';
const entries: ActivityEntry[]=[
  {id:'file1',time:'10:32:01',module:'MCP',level:'success',message:'write_file completed',
   invocationId:'cccccccccccccccccccccccccccccccc',tool:'write_file',status:'success',durationMs:112,target:'docs/demo.md'},
  {id:'output1',time:'10:32:05',module:'MCP',level:'success',message:'read_process_output completed',
   invocationId:'dddddddddddddddddddddddddddddddd',tool:'read_process_output',status:'success',durationMs:18,target:'24680'},
  {id:'cmd1',time:'10:32:11',module:'MCP',level:'success',message:'start_process completed',
   invocationId:id,tool:'start_process',status:'success',durationMs:253,target:'node --version',
   timestamp:'2026-10-21T10:32:11+07:00'},
];
it('renders Activity Log fixture with actual React component for screenshot verification',async()=>{
  const listeners=new Set<(event:{data:unknown})=>void>();
  const sent=vi.fn();
  (window as any).chrome={webview:{
    postMessage:sent,addEventListener:(_name:string,fn:(event:{data:unknown})=>void)=>listeners.add(fn),
    removeEventListener:(_name:string,fn:(event:{data:unknown})=>void)=>listeners.delete(fn),
  }};
  const {container}=render(<ActivityLogPage snapshot={undefined} logs={entries}
    agentRun={{status:'idle'}} agentChat={{conversations:[]}}
    onAction={()=>{}} setPage={()=>{}} onAgentRun={()=>{}}
    onChatCreate={()=>{}} onChatOpen={()=>{}} onChatSend={()=>{}}
    onChatCancel={()=>{}} onChatArchive={()=>{}}/>);
  await waitFor(()=>expect(sent).toHaveBeenCalledWith({
    type:'activity-detail-get',invocationId:id,phase:'request',offset:0
  }));
  const emit=(result:ActivityDetailPage)=>{for(const listener of listeners)listener({data:{type:'activity-detail-result',result}});};
  await act(async()=>{
    emit({invocationId:id,phase:'request',state:'complete',redacted:true,
      text:'{\n  "command": "node --version",\n  "shell": "powershell.exe",\n  "contractSession": "[REDACTED]"\n}',
      offset:0,nextOffset:null,totalChars:90});
    emit({invocationId:id,phase:'response',state:'complete',redacted:false,
      text:'Process started with PID 24680\nstdout: v24.21.0\nstderr: (empty)\nExit code: unavailable (process still running)',
      offset:0,nextOffset:null,totalChars:103});
  });
  expect(screen.getByText('Request')).toBeInTheDocument();
  expect(screen.getByText('Response')).toBeInTheDocument();
  expect(container.textContent).toContain('contractSession');
  if(process.env.AGENT_CORE_ACTIVITY_FIXTURE_CAPTURE==='1'){
    const output=path.resolve(process.cwd(),'../../runtime/tmp/activity-log-request-response-fixture.html');
    mkdirSync(path.dirname(output),{recursive:true});
    const css=readFileSync(path.resolve(process.cwd(),'src/index.css'),'utf8').replace(/^\uFEFF/,'');
    const banner='<div style="background:#143851;border:1px solid #4078a2;padding:10px 18px;color:#c2eeff;letter-spacing:.08em;font:700 12px Consolas">SAFE FIXTURE · NOT LIVE DATA · NO EXECUTION</div>';
    const markup='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\nbody{margin:0;background:#06101b}#snapshot{padding:16px 18px}.activity-layout{min-height:590px}.log-inspector{min-height:500px}</style></head><body>'+banner+'<div id="snapshot">'+container.innerHTML+'</div></body></html>';
    writeFileSync(output,markup,'utf8');
  }
});
