import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolExecutionDetail } from './ToolExecutionDetail';
import { ActivityLogPage } from './pages';
import { requestPresentations } from './ToolReadableCode';
import type { ActivityDetailPage, ActivityEntry } from './host';

const listeners = new Set<(event:{data:any})=>void>();
const post = vi.fn();
const id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const entry:ActivityEntry={
  id:'a',time:'12:01:20',module:'MCP',level:'success',message:'Tool returned',
  invocationId:id,tool:'start_process',status:'success',timestamp:'2026-10-21T12:01:20+07:00',durationMs:25,
};
const emit=(phase:'request'|'response',text:string,options?:Partial<ActivityDetailPage>)=>{
  const result:ActivityDetailPage={
    invocationId:id,phase,state:'complete',redacted:false,text,offset:0,
    nextOffset:null,totalChars:text.length,...options,
  };
  act(()=>{for(const listener of listeners)listener({data:{type:'activity-detail-result',result}});});
};
beforeEach(()=>{
  listeners.clear();post.mockReset();
  (window as any).chrome={webview:{
    postMessage:post,addEventListener:(_name:string,fn:(event:{data:any})=>void)=>listeners.add(fn),
    removeEventListener:(_name:string,fn:(event:{data:any})=>void)=>listeners.delete(fn),
  }};
  Object.defineProperty(navigator,'clipboard',{
    configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)},
  });
});
describe('expanded and readable Activity Log candidate',()=>{
  it('offers accessible resize and expand/restore without invoking tools',()=>{
    const {container}=render(<ActivityLogPage
      logs={[entry]} onAction={()=>{}} setPage={()=>{}}
      agentRun={{status:'idle'}} agentChat={{conversations:[],modelChoice:''}}
      onAgentRun={()=>{}} onChatCreate={()=>{}} onChatOpen={()=>{}}
      onChatSend={()=>{}} onChatCancel={()=>{}} onChatArchive={()=>{}}
    />);
    const slider=screen.getByRole('slider',{name:'Resize Activity Log inspector'});
    fireEvent.change(slider,{target:{value:'680'}});
    expect(container.querySelector('.activity-layout')).toHaveStyle('--activity-inspector-width: 680px');
    fireEvent.click(screen.getByRole('button',{name:'Expand Activity Log inspector'}));
    expect(container.querySelector('.activity-layout')).toHaveClass('inspector-expanded');
    expect(slider).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Restore Activity Log inspector'}));
    expect(container.querySelector('.activity-layout')).not.toHaveClass('inspector-expanded');
    expect(slider).toBeEnabled();
    expect(post.mock.calls.every(([v])=>v.type==='activity-detail-get')).toBe(true);
  });
  it('renders multiline PowerShell script, highlights keywords and retains optional JSON',()=>{
    const {container}=render(<ToolExecutionDetail entry={entry}/>);
    const command='$name = "fixture"\n# comment\nWrite-Output $name\nStart-Sleep -Seconds 1';
    emit('request',JSON.stringify({command,shell:'powershell.exe',workingDirectory:'C:\\fixture',
      contractSession:'[REDACTED]'}));
    const code=screen.getByLabelText('Submitted command / script');
    expect(code).toHaveClass('syntax-powershell');
    expect(code.textContent).toContain('\n# comment\nWrite-Output $name\n');
    expect(code.querySelector('.syntax-keyword')?.textContent).toContain('Write-Output');
    expect(code.querySelector('.syntax-variable')?.textContent).toContain('$name');
    expect(screen.getByText('Raw sanitized Request (stored preview)')).toBeInTheDocument();
    expect(container.textContent).toContain('[REDACTED]');
    expect(container.textContent).toContain('CHILD PROCESS');
    expect(container.textContent).toContain('Unverified');
    expect(container.textContent).toContain('PID alone can be reused');
    expect(post.mock.calls.every(([v])=>v.type==='activity-detail-get')).toBe(true);
  });
  it('highlights long write_file content that is retained and never claims application',()=>{
    const {container}=render(<ToolExecutionDetail entry={{...entry,tool:'write_file',status:'error'}}/>);
    const content=('const feature = 42;\n').repeat(430);
    const request=JSON.stringify({path:'docs/example.ts',mode:'append',content});
    expect(request.length).toBeLessThan(12000);
    emit('request',request);
    const code=screen.getByLabelText('Proposed file content · not proof of a successful write');
    expect(code).toHaveClass('syntax-typescript');
    expect(code.textContent).toContain('const feature = 42');
    expect(container.textContent).toContain('not proof of a successful write');
    emit('response','Tool error: write denied');
    expect(container.textContent).toContain('Tool error: write denied');
    expect(container.textContent).not.toContain('successfully applied');
  });
  it('renders proposed edit_block diff separately from failed response',()=>{
    const {container}=render(<ToolExecutionDetail entry={{...entry,tool:'edit_block',status:'error'}}/>);
    emit('request',JSON.stringify({file_path:'demo.txt',old_string:'alpha\nold',new_string:'alpha\nnew'}));
    const code=screen.getByLabelText('Proposed edit diff · not proof of an applied change');
    expect(code).toHaveClass('syntax-diff');
    expect(code.querySelector('.diff-added')).not.toBeNull();
    expect(code.querySelector('.diff-removed')).not.toBeNull();
    emit('response','Could not find matching old_string; nothing applied');
    expect(container.textContent).toContain('Could not find matching old_string');
    expect(container.textContent).toContain('not proof of an applied change');
  });
  it('paginates only retained truncated content and copies only loaded sanitized bytes',async()=>{
    const {container}=render(<ToolExecutionDetail entry={{...entry,tool:'read_process_output'}}/>);
    const first='A'.repeat(4096), second='B'.repeat(700);
    emit('response',first,{state:'truncated',redacted:true,totalChars:4796,nextOffset:4096});
    expect(container.textContent).toContain('Capture truncated: original remainder is unavailable');
    expect(container.textContent).toContain('Additional pages contain only saved chunks');
    fireEvent.click(screen.getAllByText('Copy sanitized')[1]!);
    await act(async()=>{await Promise.resolve();});
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(first);
    const pre=screen.getByLabelText('Sanitized tool response') as HTMLElement;
    pre.scrollTop=90;
    fireEvent.click(screen.getByText('Load more stored detail'));
    expect(post).toHaveBeenCalledWith({
      type:'activity-detail-get',invocationId:id,phase:'response',offset:4096,
    });
    emit('response',second,{state:'truncated',redacted:true,totalChars:4796,offset:4096,nextOffset:null});
    expect(pre.scrollTop).toBe(90);
    expect(screen.queryByText('Load more stored detail')).toBeNull();
    fireEvent.click(screen.getAllByText('Copy sanitized')[1]!);
    await act(async()=>{await Promise.resolve();});
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(first+second);
    expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls.every(
      ([s]:[string])=>s.length<=4796
    )).toBe(true);
  });
  it('keeps an over-budget write_file preview visibly truncated instead of reconstructing content',()=>{
    const {container}=render(<ToolExecutionDetail entry={{...entry,tool:'write_file'}}/>);
    const large=JSON.stringify({path:'output.txt',content:'X'.repeat(19000)});
    const retained=large.slice(0,12000);
    emit('request',retained,{state:'truncated',totalChars:12000,nextOffset:null});
    expect(screen.getByLabelText('Captured request preview').textContent).toContain('output.txt');
    expect(container.textContent).toContain('12,000');
    expect(container.textContent).toContain('original remainder is unavailable');
    expect(container.textContent).not.toContain('Proposed file content · not proof');
    expect(screen.queryByText('Load more stored detail')).toBeNull();
  });
  it('treats identical PID values across different calls as unverified rather than linked',()=>{
    const {rerender,container}=render(<ToolExecutionDetail entry={{...entry,target:'24680'}}/>);
    expect(container.textContent).toContain('Process association: not established across calls');
    rerender(<ToolExecutionDetail entry={{...entry,id:'b',invocationId:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      tool:'interact_with_process',target:'24680',status:'success'}}/>);
    expect(container.textContent).toContain('Unverified');
    expect(container.textContent).toContain('PID alone can be reused');
    expect(container.textContent).not.toContain('Linked session');
  });
});
