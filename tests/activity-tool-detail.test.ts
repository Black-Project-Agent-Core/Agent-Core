import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/tracker/activity-tracker.js',()=>({activityTracker:{record:vi.fn()}}));
import { activityTracker } from '../src/tracker/activity-tracker.js';
import { recordExternalToolDetail, DETAIL_REQUEST_LIMIT, DETAIL_RESPONSE_LIMIT } from '../src/tracker/tool-detail.js';

const call = vi.mocked(activityTracker.record);
const one='11111111111111111111111111111111';
const two='22222222222222222222222222222222';
const entries = () => call.mock.calls.map(args => ({kind:args[3],context:args[4] as Record<string,any>}));
const body = (id:string,phase:string) => entries().filter(v=>v.context?.invocationId===id&&v.context?.detailPhase===phase)
  .sort((a,b)=>a.context.detailSegment-b.context.detailSegment).map(v=>v.context.detailText).join('');

describe('sanitized Activity Log detail before journal persistence',()=>{
  beforeEach(()=>call.mockReset());
  it('does not store fake secrets in argument/output chunks or copy payload',()=>{
    const secret='sk-proj-SYNTHETICONLY999999999999';
    recordExternalToolDetail({tool:'start_process',invocationId:one,phase:'request',value:{
      command:`echo safe; --api-key ${secret}; password=hunter2; Authorization: Bearer ${secret}`,
      cookie:'session=SYNTHETICCOOKIE',authorization:'Bearer fakevalue',contractSession:'fake-contract',
      nested:{apiKey:secret,token:secret,stdout:`password=hunter2`},shell:'powershell.exe'
    }});
    recordExternalToolDetail({tool:'start_process',invocationId:one,phase:'response',value:{
      content:[{type:'text',text:`hello\nSet-Cookie: session=SYNTHETICCOOKIE\nAuthorization: Bearer ${secret}`}]
    }});
    const serialized=JSON.stringify(entries());
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('SYNTHETICCOOKIE');
    expect(serialized).not.toContain('fake-contract');
    expect(serialized).toContain('[REDACTED]');
    expect(body(one,'request')).toContain('powershell.exe');
    expect(entries().every(v=>v.kind==='tool-detail')).toBe(true);
  });
  it('preserves exact independent concurrent invocation identities',()=>{
    recordExternalToolDetail({tool:'write_file',invocationId:one,phase:'request',value:{path:'a',content:'first'}});
    recordExternalToolDetail({tool:'write_file',invocationId:two,phase:'request',value:{path:'b',content:'second'}});
    recordExternalToolDetail({tool:'write_file',invocationId:two,phase:'response',value:{content:[{type:'text',text:'second ok'}]}});
    recordExternalToolDetail({tool:'write_file',invocationId:one,phase:'response',value:{content:[{type:'text',text:'first error'}],isError:true}});
    expect(body(one,'request')).toContain('first');
    expect(body(two,'request')).toContain('second');
    expect(body(one,'response')).toContain('first error');
    expect(body(two,'response')).toContain('second ok');
  });
  it('marks omission, binary media and stored truncation without inventing missing bytes',()=>{
    recordExternalToolDetail({tool:'read_file',invocationId:one,phase:'request',value:{path:'secret.txt'},disposition:'metadata-only'});
    expect(entries()[0]?.context.detailState).toBe('omitted');
    expect(entries()[0]?.context.detailText).toBe('');
    recordExternalToolDetail({tool:'read_process_output',invocationId:two,phase:'response',value:{content:[{type:'text',text:'Y'.repeat(DETAIL_RESPONSE_LIMIT+1)}]}});
    expect(entries().filter(v=>v.context.invocationId===two).every(v=>v.context.detailState==='truncated')).toBe(true);
    expect(body(two,'response')).toHaveLength(DETAIL_RESPONSE_LIMIT);
    expect(DETAIL_REQUEST_LIMIT).toBeLessThan(DETAIL_RESPONSE_LIMIT);
    recordExternalToolDetail({tool:'read_file',invocationId:one,phase:'response',value:{content:[{type:'image',data:'BINARY_BYTES'}]}});
    expect(body(one,'response')).not.toContain('BINARY_BYTES');
  });
  it('preserves safe multiline command text after redacting Authorization before JSON serialization',()=>{
    const fake='FAKE_ACTIVITY_ACCEPTANCE_SECRET_DUMMY_20261021';
    const suffix='SAFE_COMMAND_TAIL_20261021';
    const command=[
      "Write-Output 'BEGIN'", "Authorization: Bearer "+fake,
      "Write-Output 'AFTER_SECRET'", 'Write-Output "'+'K'.repeat(5200)+'"',
      "Write-Output '"+suffix+"'",
    ].join('\n');
    recordExternalToolDetail({tool:'start_process',invocationId:one,phase:'request',value:{
      command,shell:'powershell.exe', workingDirectory:'C:\\fixture',
      ['Authorization: Bearer '+fake]:'should not persist'
    }});
    const detail=body(one,'request');
    const parsed=JSON.parse(detail);
    expect(detail).not.toContain(fake);
    expect(parsed.command).toContain('Authorization: [REDACTED]');
    expect(parsed.command).toContain(suffix);
    expect(parsed.command).toContain("Write-Output 'AFTER_SECRET'");
    expect(detail.length).toBeGreaterThan(4096);
    expect(entries().every(x=>x.context.detailRedacted===true)).toBe(true);
  });
  it('does not offer lost bytes through pagination after bounded sanitized capture',()=>{
    const command=['BEGIN','Authorization: Bearer fake_secret_1234567890','A'.repeat(16000)].join('\n');
    recordExternalToolDetail({tool:'start_process',invocationId:two,phase:'request',value:{command}});
    const stored=body(two,'request');
    expect(stored.length).toBe(DETAIL_REQUEST_LIMIT);
    expect(entries().every(x=>x.context.detailState==='truncated')).toBe(true);
    expect(stored).not.toContain('fake_secret_1234567890');
  });
});
