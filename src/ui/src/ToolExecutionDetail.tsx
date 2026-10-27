import React, { useEffect, useMemo, useState } from 'react';
import { postHost, subscribeHost, type ActivityDetailPage, type ActivityEntry } from './host';
import { ReadableCode, requestPresentations } from './ToolReadableCode';

type Phase = 'request' | 'response';
type PageState = { text:string; nextOffset:number|null; totalChars:number;
  state:ActivityDetailPage['state']; redacted:boolean; loading:boolean };
const empty = ():PageState => ({text:'',nextOffset:null,totalChars:0,state:'unavailable',redacted:false,loading:true});
const phases:Phase[]=['request','response'];
const isProcessTool = (name?:string) =>
  name === 'start_process' || name === 'interact_with_process' || name === 'read_process_output';
const captureLimit:Record<Phase,number>={request:12000,response:24000};

function statusDescription(phase:Phase, data:PageState, running:boolean):string {
  if(data.loading)return 'Loading stored sanitized evidence…';
  if(data.state==='unavailable' && phase==='response' && running)return 'No terminal event recorded; current execution state is unknown';
  if(data.state==='unavailable')return 'Detail not recorded in this version';
  if(data.state==='expired')return 'Previously stored detail expired or its chunks are incomplete';
  if(data.state==='omitted')return 'Omitted under evidence/credential policy; no raw copy retained';
  if(data.state==='truncated')return 'Capture truncated: original remainder is unavailable';
  return data.redacted?'Redacted before persistence':'Available stored sanitized detail';
}
function DetailSection({phase, data, tool, status, load, copy}:{
  phase:Phase; data:PageState; tool?:string; status?:ActivityEntry['status'];
  load:()=>void; copy:(text:string)=>void;
}) {
  const complete = !data.loading && data.nextOffset === null && data.state === 'complete';
  const presentations = useMemo(()=>phase==='request' && data.text
    ? requestPresentations(tool, data.text, complete) : [],[phase,tool,data.text,complete]);
  const countText = data.loading && !data.text ? 'Waiting for first page' :
    'Loaded '+data.text.length.toLocaleString()+' / '+data.totalChars.toLocaleString()+' stored characters';
  return <section className="execution-section" aria-label={phase}>
    <header>
      <h3>{phase==='request'?'Request':'Response'}</h3>
      <button type="button" disabled={!data.text} onClick={()=>copy(data.text)}>Copy sanitized</button>
      <span className={'execution-state ' + (data.state==='truncated'?'is-truncated':'')}>
        {statusDescription(phase,data,status==='running')}
      </span>
    </header>
    <div className="execution-section-body">
      {data.text ? <>
        {phase === 'request' ? presentations.map((item,i)=>
          <div className="execution-presentation" key={i}>
            <div className="execution-code-head">
              <b>{item.title}</b><small>{item.language}</small>
              <button type="button" onClick={()=>copy(item.content)}>Copy shown code</button>
            </div>
            <ReadableCode text={item.content} language={item.language} label={item.title}/>
          </div>
        ):<div className="execution-presentation">
          <div className="execution-code-head"><b>Captured tool response</b><small>snapshot</small></div>
          <ReadableCode text={data.text} language="text" label="Sanitized tool response"/>
        </div>}
        <details className="execution-json">
          <summary>Raw sanitized {phase==='request'?'Request':'Response'} (stored preview)</summary>
          <ReadableCode text={data.text} language={phase==='request'?'json':'text'}
            label={'Stored sanitized raw '+phase}/>
        </details>
      </> : <p className="execution-placeholder">{statusDescription(phase,data,status==='running')}</p>}
      <div className="execution-page-footer">
        <span>{countText}</span>
        <span>Capture limit: {captureLimit[phase].toLocaleString()} chars</span>
      </div>
      {data.nextOffset!==null&&<button className="execution-load" type="button" disabled={data.loading}
        onClick={load}>Load more stored detail</button>}
      {data.state==='truncated'&&<p className="execution-storage-warning">
        The journal retained only the sanitized first {captureLimit[phase].toLocaleString()} characters.
        Additional pages contain only saved chunks, never missing original output.
      </p>}
      {data.state==='complete'&&data.nextOffset===null&&data.text&&
        <small className="execution-stored-end">End of stored detail; upstream tool output may have separate limits.</small>}
    </div>
  </section>;
}
export function ToolExecutionDetail({entry}:{entry?:ActivityEntry}) {
  const [details,setDetails]=useState<Record<Phase,PageState>>({request:empty(),response:empty()});
  const [copyNotice,setCopyNotice]=useState('');
  const id=entry?.invocationId;
  useEffect(()=>{
    setCopyNotice('');
    setDetails({request:empty(),response:empty()});
    if (!id) return;
    const unsubscribe=subscribeHost(message=>{
      if(message.type!=='activity-detail-result'||message.result.invocationId!==id)return;
      const result=message.result;
      setDetails(prev=>{
        const previous=prev[result.phase];
        if(result.offset!==0 && result.offset!==previous.text.length)return prev;
        if(result.offset===0 && result.text===previous.text && previous.state===result.state &&
          !previous.loading && previous.nextOffset===result.nextOffset)return prev;
        return {...prev,[result.phase]:{
          text:result.offset===0?result.text:previous.text+result.text,
          nextOffset:result.nextOffset,totalChars:result.totalChars,
          state:result.state,redacted:result.redacted,loading:false,
        }};
      });
    });
    for(const phase of phases) postHost({type:'activity-detail-get',invocationId:id,phase,offset:0});
    return unsubscribe;
  },[id]);
  useEffect(()=>{
    if(id && entry?.status && entry.status!=='running')
      postHost({type:'activity-detail-get',invocationId:id,phase:'response',offset:0});
  },[id,entry?.status]);
  const copy=async(text:string)=>{
    try {await navigator.clipboard.writeText(text);setCopyNotice('Copied only currently loaded sanitized text');}
    catch {setCopyNotice('Copy unavailable');}
  };
  if(!entry)return <div className="log-inspector-empty">Select an activity to view its execution evidence.</div>;
  const duration=entry.durationMs==null?'Unavailable':Math.round(entry.durationMs)+' ms';
  const startTime=entry.startedAt??'Unavailable';
  const terminalTime=entry.terminalAt??'Unavailable';
  const processTool=isProcessTool(entry.tool);
  return <div className="execution-detail">
    <div className="execution-detail-top">
      <h2>Execution Details</h2>
      <span className="execution-target">{entry.tool??entry.module}</span>
    </div>
    <div className="execution-statuses">
      <div className="execution-status-card call">
        <small>TOOL CALL</small>
        <strong>{entry.status??'unknown'}</strong>
        <span>Duration: {duration}</span>
        <span>Started: {startTime}</span>
        <span>Terminal: {terminalTime}</span>
      </div>
      <div className="execution-status-card process">
        <small>CHILD PROCESS</small>
        <strong>{processTool?'Unverified':'Not applicable'}</strong>
        <span>{processTool?'No validated instance identity or exit state':'This tool has no child-process lifecycle'}</span>
      </div>
    </div>
    {entry.lifecycle==='incomplete'&&<div className="execution-lifecycle-warning" role="note">
      <strong>Lifecycle incomplete</strong> · Start unavailable. Terminal outcome: {entry.status??'unknown'}.
      The start event is absent from this view; its reason is unknown. No start or duration is reconstructed.
    </div>}
    {entry.lifecycle==='start-only'&&<div className="execution-lifecycle-open" role="note">
      <strong>Start observed, terminal unavailable.</strong> The current execution state is unknown; a start event is not evidence that the tool is still running.
    </div>}
    <div className="execution-metadata">
      <span>Target: {entry.target??'Not recorded'}</span>
      <span>Invocation: {id??'not recorded'}</span>
      {processTool&&<span>Process association: not established across calls.
        PID alone can be reused; no output or status is merged using it.</span>}
    </div>
    {id?<div className="execution-layers">{phases.map(phase=>
      <DetailSection key={phase} phase={phase} tool={entry.tool} status={entry.status}
        data={details[phase]} copy={copy} load={()=>{
          const offset=details[phase].nextOffset;
          if(offset===null || details[phase].loading)return;
          setDetails(prev=>({...prev,[phase]:{...prev[phase],loading:true}}));
          postHost({type:'activity-detail-get',invocationId:id,phase,offset});
        }}/>)}</div>:
      <p className="execution-placeholder">Detail not recorded in this version.</p>}
    <p className="execution-notice">
      Capture budget: 12,000 Request / 24,000 Response characters after sanitization.
      Pagination reads only the retained journal preview; discarded bytes cannot be retrieved.
      Tool-call success never establishes child-process exit or file mutation success.
      This is a stored snapshot, not verified live streaming.
    </p>
    <div role="status" aria-live="polite">{copyNotice}</div>
  </div>;
}
