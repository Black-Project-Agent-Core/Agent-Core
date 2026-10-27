import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ActivityLogPage } from './pages';
import type { ActivityEntry } from './host';

const fakePost=vi.fn();
const prefix:ActivityEntry={
  id:'fixture',time:'14:01:01',module:'MCP',level:'success',message:'start_process returned',
  invocationId:'abababababababababababababababab',
  status:'success',tool:'start_process',timestamp:'2026-10-21T14:01:01+07:00'
};
beforeEach(()=>{
  fakePost.mockReset();
  (window as any).chrome={webview:{
    postMessage:fakePost,addEventListener:vi.fn(),removeEventListener:vi.fn()
  }};
});
function show(entry:ActivityEntry) {
  return render(<ActivityLogPage logs={[entry]} onAction={()=>{}} setPage={()=>{}}
    agentRun={{status:'idle'}} agentChat={{conversations:[]}}
    onAgentRun={()=>{}} onChatCreate={()=>{}} onChatOpen={()=>{}}
    onChatSend={()=>{}} onChatCancel={()=>{}} onChatArchive={()=>{}}/>);
}
describe('Activity Log lifecycle is independent of terminal outcome',()=>{
  it('shows terminal success with incomplete lifecycle and unavailable start on card AND inspector',()=>{
    const {container}=show({...prefix,lifecycle:'incomplete',
      startedAt:null,terminalAt:'2026-10-21T14:01:01+07:00',durationMs:null});
    const marker=screen.getByText('Lifecycle incomplete · start unavailable');
    expect(marker).toBeVisible();
    expect(container.querySelector('.log-lifecycle-marker')).toBe(marker);
    expect(container.querySelector('.execution-lifecycle-warning')).toHaveTextContent('Lifecycle incomplete');
    expect(container.querySelector('.execution-lifecycle-warning')).toHaveTextContent('reason is unknown');
    expect(container.querySelector('.execution-status-card.call strong')).toHaveTextContent('success');
    expect(container).toHaveTextContent('Started: Unavailable');
    expect(container).toHaveTextContent('Duration: Unavailable');
    expect(container).toHaveTextContent('Terminal: 2026-10-21T14:01:01+07:00');
    expect(fakePost.mock.calls.every(([value])=>value.type==='activity-detail-get')).toBe(true);
  });
  it('retains observed start and terminal separately for complete lifecycle',()=>{
    const {container}=show({...prefix,lifecycle:'complete',startedAt:'2026-10-21T14:00:00+07:00',
      terminalAt:'2026-10-21T14:01:01+07:00',durationMs:61000});
    expect(container.querySelector('.log-lifecycle-marker')).toBeNull();
    expect(container.querySelector('.execution-lifecycle-warning')).toBeNull();
    expect(container).toHaveTextContent('Started: 2026-10-21T14:00:00+07:00');
    expect(container).toHaveTextContent('Duration: 61000 ms');
  });
  it('a start-only call does not claim present-time execution or terminal success',()=>{
    const {container}=show({...prefix,level:'info',status:'running',lifecycle:'start-only',
      startedAt:'2026-10-21T14:00:00+07:00',terminalAt:null,durationMs:null});
    expect(container.querySelector('.log-lifecycle-open')).toHaveTextContent('Start observed · terminal unavailable');
    expect(container.querySelector('.execution-lifecycle-open')).toHaveTextContent('current execution state is unknown');
    expect(container).toHaveTextContent('Terminal: Unavailable');
    expect(container.querySelector('.execution-status-card.call strong')).toHaveTextContent('running');
  });
  it('legacy rows remain readable with no invented start or lifecycle',()=>{
    const {container}=show({id:'legacy',time:'09:00:00',module:'SYSTEM',level:'info',message:'Historical event'});
    expect(container).toHaveTextContent('Historical event');
    expect(container).toHaveTextContent('Detail not recorded in this version');
    expect(container.querySelector('.log-lifecycle-marker')).toBeNull();
  });
});
