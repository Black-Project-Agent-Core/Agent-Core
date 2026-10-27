import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolExecutionDetail } from './ToolExecutionDetail';
import type { ActivityEntry, ActivityDetailPage } from './host';

const listeners=new Set<(value:{data:unknown})=>void>();
const post=vi.fn();
const id='1234567890abcdef1234567890abcdef';
const row: ActivityEntry = {
  id:'visible-event',time:'10:00:00',module:'MCP',level:'info',message:'start_process started',
  timestamp:'2026-10-21T10:00:00+07:00',kind:'tool-invocation-start',invocationId:id,tool:'start_process',status:'running'
};
const send=(result:ActivityDetailPage)=>act(()=>{
  for(const listener of listeners) listener({data:{type:'activity-detail-result',result}});
});
beforeEach(()=>{
  post.mockReset(); listeners.clear();
  (window as any).chrome={webview:{
    postMessage:post, addEventListener:(_name:string,fn:(value:{data:unknown})=>void)=>listeners.add(fn),
    removeEventListener:(_name:string,fn:(value:{data:unknown})=>void)=>listeners.delete(fn),
  }};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}});
});

describe('existing Activity Log execution inspector',()=>{
  it('requests only stored details; never invokes or replays a tool',()=>{
    render(<ToolExecutionDetail entry={row}/>);
    expect(post).toHaveBeenCalledWith({type:'activity-detail-get',invocationId:id,phase:'request',offset:0});
    expect(post).toHaveBeenCalledWith({type:'activity-detail-get',invocationId:id,phase:'response',offset:0});
    expect(post.mock.calls.every(([value])=>value.type==='activity-detail-get')).toBe(true);
    expect(screen.getByText(/Tool-call success never establishes/)).toBeInTheDocument();
  });
  it('renders hostile output as text, loads once by offset and copies only displayed safe bytes',async()=>{
    const {container}=render(<ToolExecutionDetail entry={{...row,status:'success'}}/>);
    const malicious='<img src=x onerror="window.__bad=1"><script>alert(1)</script>';
    send({invocationId:id,phase:'request',state:'complete',redacted:false,text:'{"command":"echo hello"}',offset:0,nextOffset:null,totalChars:24});
    send({invocationId:id,phase:'response',state:'complete',redacted:true,text:malicious,offset:0,nextOffset:malicious.length,totalChars:malicious.length+4});
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain(malicious);
    fireEvent.click(screen.getByText('Load more stored detail'));
    expect(post).toHaveBeenCalledWith({type:'activity-detail-get',invocationId:id,phase:'response',offset:malicious.length});
    send({invocationId:id,phase:'response',state:'complete',redacted:true,text:'END!',offset:malicious.length,nextOffset:null,totalChars:malicious.length+4});
    expect(container.textContent).toContain(malicious+'END!');
    const copies=screen.getAllByText('Copy sanitized');
    fireEvent.click(copies[1]!);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(malicious+'END!');
    expect(post.mock.calls.every(([value])=>value.type==='activity-detail-get')).toBe(true);
  });
  it('labels legacy unknowns and proposed diffs without assuming successful write',()=>{
    const {rerender,container}=render(<ToolExecutionDetail entry={{...row,invocationId:undefined}}/>);
    expect(screen.getByText('Detail not recorded in this version.')).toBeInTheDocument();
    rerender(<ToolExecutionDetail entry={{...row,tool:'edit_block',invocationId:id,status:'error'}}/>);
    send({invocationId:id,phase:'request',state:'complete',redacted:false,text:JSON.stringify({old_string:'old',new_string:'new'}),offset:0,nextOffset:null,totalChars:41});
    expect(container.textContent).toContain('Proposed edit diff · not proof of an applied change');
    expect(container.textContent).toContain('- old');
    expect(container.textContent).toContain('+ new');
    send({invocationId:id,phase:'response',state:'omitted',redacted:false,text:'',offset:0,nextOffset:null,totalChars:0});
    expect(container.textContent).toContain('Omitted under evidence/credential policy');
  });
});
