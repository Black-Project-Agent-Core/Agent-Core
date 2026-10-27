import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ActivityLogPage } from './pages';
import type { ActivityDetailPage, ActivityEntry } from './host';

const listenerSet=new Set<(event:{data:any})=>void>();
const sent=vi.fn();
const versions={
  multiline:'11111111111111111111111111111111',
  diff:'22222222222222222222222222222222',
  longWrite:'33333333333333333333333333333333',
  oversized:'44444444444444444444444444444444',
  incomplete:'55555555555555555555555555555555',
} as const;
type FixtureName=keyof typeof versions;
const ps='$user = "fixture"\n# no external command executes\nWrite-Output $user\nStart-Sleep -Seconds 1';
const longWrite=('const color = "aqua";\n').repeat(360);
const oversizedLines=Array.from({length:180},(_,i)=>'line '+i.toString().padStart(3,'0')+' : '+('x'.repeat(160))).join('\n');
const fixtureCases:Record<FixtureName,{
  tool:string;status:ActivityEntry['status'];request:string;response:string;
  responseState?:ActivityDetailPage['state'];
}>={
  multiline:{tool:'start_process',status:'success',
    request:JSON.stringify({command:ps,shell:'powershell.exe',workdir:'C:\\fixture',contractSession:'[REDACTED]'}),
    response:'Process started with PID 24680\nstdout: demo\nstderr: (empty)\nexit code: not known'},
  diff:{tool:'edit_block',status:'error',
    request:JSON.stringify({file_path:'demo.txt',old_string:'alpha\nold line\nomega',new_string:'alpha\nnew line\nomega'}),
    response:'Tool error: edit rejected, no change applied'},
  longWrite:{tool:'write_file',status:'success',
    request:JSON.stringify({path:'docs/preview.ts',mode:'append',content:longWrite}),
    response:'Success: 7,920 bytes written (fake fixture; not actually written)'},
  oversized:{tool:'read_process_output',status:'success',
    request:JSON.stringify({pid:24680,offset:0,length:4096}),
    response:oversizedLines.slice(0,24000),responseState:'truncated'},
  incomplete:{tool:'start_process',status:'success',
    request:JSON.stringify({command:'Write-Output "safe fixture"',shell:'powershell.exe'}),
    response:'Tool response: success observed, start event not available in the current journal window'},
};
beforeEach(()=>{
  listenerSet.clear(); sent.mockReset();
  (window as any).chrome={webview:{
    postMessage:sent,addEventListener:(_type:string,handler:(event:{data:any})=>void)=>listenerSet.add(handler),
    removeEventListener:(_type:string,handler:(event:{data:any})=>void)=>listenerSet.delete(handler),
  }};
});
function saveSafePreview(container:HTMLElement,name:FixtureName) {
  if(process.env.AGENT_CORE_ACTIVITY_FIXTURE_CAPTURE!=='1')return;
  const output=path.resolve(process.cwd(),'../../runtime/tmp/activity-log-'+name+'-fixture.html');
  mkdirSync(path.dirname(output),{recursive:true});
  const css=readFileSync(path.resolve(process.cwd(),'src/index.css'),'utf8').replace(/^\uFEFF/,'');
  const header='<div style="background:#114264;border:1px solid #3977a7;padding:9px;color:#c5efff;font:700 12px Consolas;letter-spacing:.04em">SAFE FIXTURE · '+name.toUpperCase()+' · NOT LIVE DATA · NO EXECUTION</div>';
  writeFileSync(output,'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+
    '\nbody{margin:0;background:#06101b}#snapshot{padding:14px}.activity-layout{min-height:620px}.log-inspector{min-height:600px}</style></head><body>'+
    header+'<div id="snapshot">'+container.innerHTML+'</div></body></html>','utf8');
}
for(const name of Object.keys(versions) as FixtureName[]) {
  it('captures safe readable Activity Log fixture: '+name,async()=>{
    const current=fixtureCases[name],id=versions[name];
    const row:ActivityEntry={
      id:name,time:'11:30:00',module:'MCP',level:current.status==='error'?'error':'success',
      message:current.tool+' returned (fixture)',tool:current.tool,status:current.status,
      invocationId:id,target:name, durationMs:name==='incomplete'?null:137,
      lifecycle:name==='incomplete'?'incomplete':undefined,
      startedAt:name==='incomplete'?null:undefined,
      terminalAt:name==='incomplete'?'2026-10-21T11:30:00+07:00':undefined,
      timestamp:'2026-10-21T11:30:00+07:00',
    };
    const {container}=render(<ActivityLogPage logs={[row]} snapshot={undefined}
      agentRun={{status:'idle'}} agentChat={{conversations:[]}} onAction={()=>{}} setPage={()=>{}}
      onAgentRun={()=>{}} onChatCreate={()=>{}} onChatOpen={()=>{}} onChatSend={()=>{}}
      onChatCancel={()=>{}} onChatArchive={()=>{}}/>);
    await waitFor(()=>expect(sent).toHaveBeenCalledWith({type:'activity-detail-get',invocationId:id,phase:'request',offset:0}));
    await act(async()=>{
      const emit=(phase:'request'|'response',text:string,state:ActivityDetailPage['state'])=>{
        const result:ActivityDetailPage={invocationId:id,phase,state,
          redacted:phase==='request'&&name==='multiline',text,offset:0,nextOffset:null,totalChars:text.length};
        for(const listener of listenerSet)listener({data:{type:'activity-detail-result',result}});
      };
      emit('request',current.request,'complete');
      emit('response',current.response,current.responseState??'complete');
    });
    if(name==='multiline'){
      fireEvent.click(screen.getByRole('button',{name:'Expand Activity Log inspector'}));
      expect(screen.getByLabelText('Submitted command / script')).toHaveClass('syntax-powershell');
    }
    if(name==='diff')expect(screen.getByLabelText('Proposed edit diff · not proof of an applied change')).toBeInTheDocument();
    if(name==='longWrite')expect(screen.getByLabelText('Proposed file content · not proof of a successful write')).toHaveClass('syntax-typescript');
    if(name==='oversized')expect(container.textContent).toContain('original remainder is unavailable');
    if(name==='incomplete'){
      expect(screen.getByText('Lifecycle incomplete · start unavailable')).toBeVisible();
      expect(container.querySelector('.execution-lifecycle-warning')).toHaveTextContent('Lifecycle incomplete');
      expect(container).toHaveTextContent('Started: Unavailable');
      expect(container.querySelector('.execution-status-card.call strong')).toHaveTextContent('success');
    }
    saveSafePreview(container,name);
  });
}
