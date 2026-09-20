import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityMonitor } from './ActivityMonitor';
const {invokeMock}=vi.hoisted(()=>({invokeMock:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:invokeMock}));
function fixture(){return {records:[{sequence:1,event:'tool.result',timestamp:'2026-09-14T00:00:00Z',requestId:'fixture-request',data:{toolName:'capability_route',outcome:'ok'}},{sequence:2,event:'anomaly',data:{code:'RETURNED_ROUTE_UNAVAILABLE'}}],lastSequence:2,reset:false,skipped:0,malformed:0,pendingBytes:false,desired:{enabled:false,revision:'one'},applied:{enabled:false,revision:'one',updatedAt:new Date().toISOString()},scope:'Local evidence only'};}
describe('native activity monitor',()=>{
  beforeEach(()=>{invokeMock.mockReset();invokeMock.mockImplementation((name:string)=>name==='agent_core_activity_read'?Promise.resolve(fixture()):Promise.resolve());});
  it('renders actual records and offers expanded structured details',async()=>{
    render(<ActivityMonitor onClose={()=>{}}/>);await screen.findByText('capability_route');
    expect(screen.getByText('RETURNED_ROUTE_UNAVAILABLE')).toBeInTheDocument();
    const summary=screen.getByText('tool.result').closest('summary')!;fireEvent.click(summary);
    expect(screen.getByText(/Request: fixture-request/)).toBeInTheDocument();
  });
  it('filters, searches and pauses the view without disabling capture',async()=>{
    const user=userEvent.setup();render(<ActivityMonitor onClose={()=>{}}/>);await screen.findByText('capability_route');
    await user.selectOptions(screen.getByLabelText('Activity filter'),'errors');expect(screen.queryByText('capability_route')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Search activity'),'missing-query');expect(await screen.findByText('No matching activity')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Pause view'}));expect(screen.getByRole('button',{name:'Resume view'})).toBeInTheDocument();
    expect(invokeMock.mock.calls.some(([name])=>name==='agent_core_activity_set')).toBe(false);
  });
  it('writes the requested capture toggle and waits for runtime acknowledgement',async()=>{
    const user=userEvent.setup();invokeMock.mockImplementation((name:string)=>name==='agent_core_activity_set'?Promise.resolve({enabled:true,revision:'two'}):Promise.resolve(fixture()));
    render(<ActivityMonitor onClose={()=>{}}/>);await screen.findByText('capability_route');
    await user.click(screen.getByRole('switch',{name:'Capture activity'}));expect(invokeMock).toHaveBeenCalledWith('agent_core_activity_set',{enabled:true});
    expect(screen.getByText('Applying capture setting...')).toBeInTheDocument();expect(screen.queryByText('Capture active')).not.toBeInTheDocument();
  });
  it('shows native failures honestly and closes with Escape',async()=>{
    invokeMock.mockRejectedValue(new Error('ACTIVITY_READ_FAILED'));const onClose=vi.fn();render(<ActivityMonitor onClose={onClose}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('ACTIVITY_READ_FAILED');
    fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(onClose).toHaveBeenCalledOnce();
  });
  it('does not overlap slow native reads or update an unmounted panel',async()=>{
    let finish!:(v:unknown)=>void;invokeMock.mockImplementation(()=>new Promise(r=>{finish=r;}));const view=render(<ActivityMonitor onClose={()=>{}}/>);
    expect(invokeMock).toHaveBeenCalledOnce();view.unmount();await act(async()=>finish(fixture()));expect(invokeMock).toHaveBeenCalledOnce();
  });
});

it('shows local tunnel failures and crash metadata independently of core health',async()=>{
  invokeMock.mockResolvedValue({...fixture(),localLogs:[{source:'tunnel.stderr',available:true,errorCount:1,relativePath:'runtime/tray/tunnel.stderr.log',observations:[{severity:'error',codes:['ECONNRESET'],textOmitted:true}]}],crash:{event:'runtime.fatal',error:{code:'CRASH_TEST'},pid:7}});
  render(<ActivityMonitor onClose={()=>{}}/>);expect(await screen.findByText('tunnel.stderr')).toBeInTheDocument();expect(screen.getByText(/Last recorded crash/)).toBeInTheDocument();
});

it('explains the reported capture counters and bounded reader omissions without claiming recording gaps',async()=>{
  const state={enabled:true,revision:'one'};
  invokeMock.mockResolvedValue({...fixture(),skipped:19458,desired:state,applied:{...state,updatedAt:new Date().toISOString(),captureErrors:2,audit:{dropped:0,writeErrors:0}}});
  render(<ActivityMonitor onClose={()=>{}}/>);
  expect(await screen.findByRole('status')).toHaveTextContent('Capture on - capture errors recorded');
  expect(screen.getByText(/Capture errors: 2/)).toHaveTextContent('Audit dropped: 0 / write errors: 0');
  expect(screen.getByText(/Counters since runtime start/)).toBeInTheDocument();
  expect(screen.getByText(/Reader omissions: 19458/)).toBeInTheDocument();
  expect(screen.getByText(/Reader omissions include bounded history/)).toBeInTheDocument();
  expect(screen.queryByText(/recording gaps detected|Omitted\/gaps/)).not.toBeInTheDocument();
});

it('displays actual audit loss and write failures alongside capture errors',async()=>{
  const state={enabled:false,revision:'one'};
  invokeMock.mockResolvedValue({...fixture(),desired:state,applied:{...state,updatedAt:new Date().toISOString(),captureErrors:2,audit:{dropped:3,writeErrors:4}}});
  render(<ActivityMonitor onClose={()=>{}}/>);
  expect(await screen.findByRole('status')).toHaveTextContent('Capture off - audit issues recorded');
  expect(screen.getByText(/Capture errors: 2/)).toHaveTextContent('Audit dropped: 3 / write errors: 4');
  expect(screen.getByRole('switch')).not.toBeChecked();
});
