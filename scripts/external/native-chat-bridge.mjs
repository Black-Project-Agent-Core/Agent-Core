#!/usr/bin/env node
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { redactSensitiveString } from '../../dist/security/redaction.js';

const token=(process.env.AGENT_CORE_UI_TOKEN??'').trim();
const port=Number.parseInt(process.env.AGENT_CORE_PORT??'8765',10);
const defaultTimeout=Number.parseInt(process.env.AGENT_CORE_NATIVE_CHAT_TIMEOUT_MS??'600000',10);
const baseUrl=`http://127.0.0.1:${port}`;
const activeCommand=process.argv[2]??'';
const MAX_EVENTS=200;
const MAX_MESSAGE_CHARS=20_000;
const MAX_HTTP_BYTES=4*1024*1024;
const MAX_STREAM_LINE_BYTES=1024*1024;
const MAX_RECORD_BYTES=128*1024;
const MAX_OUTPUT_BYTES=512*1024;
const WAIT_POLL_MS=5000;
let outputBytes=0;

function sanitize(text){
  const value=redactSensitiveString(String(text??''));
  return token ? value.split(token).join('[REDACTED]') : value;
}
function emit(value){
  let serialized=sanitize(JSON.stringify(value));
  if(Buffer.byteLength(serialized)>MAX_RECORD_BYTES)
    serialized=JSON.stringify({type:value?.type??'truncated',truncated:true,
      preview:Buffer.from(serialized).subarray(0,64*1024).toString('utf8')});
  const bytes=Buffer.byteLength(serialized)+1;
  if(value?.type==='event'&&outputBytes+bytes>MAX_OUTPUT_BYTES-MAX_RECORD_BYTES)return;
  if(outputBytes+bytes>MAX_OUTPUT_BYTES)return;
  outputBytes+=bytes;
  process.stdout.write(serialized+'\n');
}
function clip(text,max=MAX_MESSAGE_CHARS){
  const value=String(text??'');
  return value.length<=max?value:value.slice(0,max)+`…[truncated ${value.length-max} chars]`;
}
function parseArgs(argv){
  const positionals=[],options={};
  for(let i=0;i<argv.length;i++){
    const value=argv[i];
    if(!value.startsWith('--')){positionals.push(value);continue;}
    const key=value.slice(2),next=argv[i+1];
    if(['stdin','archived','help','status'].includes(key)){options[key]=true;continue;}
    if(next!==undefined){options[key]=next;i++;}else options[key]=true;
  }
  return {positionals,options};
}

function validateRuntime(){
  if(!token)throw new Error('AGENT_CORE_UI_TOKEN_UNAVAILABLE');
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('AGENT_CORE_PORT_INVALID');
  if(!Number.isSafeInteger(defaultTimeout)||defaultTimeout<1000||defaultTimeout>1_800_000)
    throw new Error('AGENT_CORE_NATIVE_CHAT_TIMEOUT_INVALID');
}
async function requestJson(method,route,body,timeoutMs=20_000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(baseUrl+route,{
      method,
      headers:{
        'X-Agent-Core-UI-Token':token,
        ...(body===undefined?{}:{'content-type':'application/json'}),
      },
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      signal:controller.signal,
    });
    const text=await boundedResponseText(response);
    let parsed=null;
    if(text.trim())try{parsed=JSON.parse(text);}catch{parsed={raw:clip(text,2000)};}
    if(!response.ok)throw new Error(parsed?.error||`HTTP_${response.status}`);
    return parsed;
  }finally{clearTimeout(timer);}
}
async function boundedResponseText(response){
  if(!response.body)return '';
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let text='',bytes=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_HTTP_BYTES)throw new Error('AGENT_CHAT_RESPONSE_TOO_LARGE');
      text+=decoder.decode(value,{stream:true});
    }
    return text+decoder.decode();
  }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
// The profile avatar is an inline image the controller never needs; it made every read about 2.5 KB larger.
function withoutAvatar(turn){
  const identity=turn?.agentProfile?.identity;
  if(typeof identity?.avatar!=='string')return turn;
  const {avatar:_avatar,...rest}=identity;
  return {...turn,agentProfile:{...turn.agentProfile,identity:rest}};
}
function projectDetail(detail,maxMessages=50){
  return {
    conversation:detail.conversation,
    turns:Array.isArray(detail.turns)?detail.turns.slice(-maxMessages).map(withoutAvatar):[],
    messages:Array.isArray(detail.messages)?detail.messages.slice(-maxMessages)
      .map(item=>({...item,content:clip(item.content)})):[],
  };
}
// Polling view: the newest turn's small scalar fields (status, iterations, tokens, times) and the message count.
// The brief and the reply are left out while the turn runs; the reply is included once it has ended.
function projectStatus(detail){
  const turns=Array.isArray(detail.turns)?detail.turns:[],messages=Array.isArray(detail.messages)?detail.messages:[];
  const last=turns[turns.length-1];
  const turn=last&&Object.fromEntries(Object.entries(last).filter(([,value])=>
    typeof value==='number'||typeof value==='boolean'||(typeof value==='string'&&value.length<=200)));
  const reply=turn?.status==='running'?undefined:[...messages].reverse().find(item=>item.role==='assistant');
  const conversation=detail.conversation??{};
  return {conversation:{id:conversation.id,status:conversation.status,updatedAtMs:conversation.updatedAtMs},
    messageCount:messages.length,...(turn?{turn}:{}),
    ...(reply?{reply:{id:reply.id,turnId:reply.turnId,content:clip(reply.content)}}:{})};
}

function projectEvent(event){
  if(!event||typeof event!=='object')return {type:'unknown'};
  const projected={type:event.type,at:event.at};
  for(const key of ['toolName','success','itemCount','providerId','model','code','routing','requestId']){
    if(event[key]!==undefined)projected[key]=event[key];
  }
  if(event.response!==undefined)projected.response=clip(event.response,8000);
  return projected;
}
function projectResult(result){
  if(!result||typeof result!=='object')return result;
  return {
    conversationId:result.conversationId,
    turnId:result.turnId,
    taskId:result.taskId,
    status:result.status,
    ...(result.response!==undefined?{response:clip(result.response,100_000)}:{}),
    ...(result.providerId?{providerId:result.providerId}:{}),
    ...(result.model?{model:result.model}:{}),
    ...(result.iterations!==undefined?{iterations:result.iterations}:{}),
    ...(result.replayed!==undefined?{replayed:result.replayed}:{}),
    ...Object.fromEntries(['learningStatus','jobVerification','memoryUse','evaluation','learnedLesson','metrics','modelIdentity','settingsDigest','toolContractDigest','retrievalAttemptIds','errorCode','finalFailure']
      .filter(key=>result[key]!==undefined).map(key=>[key,result[key]])),
  };
}
async function sendTurn(conversationId,prompt,clientRequestId,evaluation,providerId,model){
  const startedAt=Date.now();
  let result;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),defaultTimeout);
  timer.unref?.();
  let reader;
  try{
  const response=await fetch(baseUrl+`/agent/chat/conversations/${encodeURIComponent(conversationId)}/turns`,{
    method:'POST',
    headers:{'X-Agent-Core-UI-Token':token,'X-Agent-Core-Chat-Origin':'external-controller','content-type':'application/json'},
    body:JSON.stringify({clientRequestId,prompt,...(evaluation?{evaluation}:{}),...(providerId?{providerId}:{}),...(model?{model}:{})}),
    signal:controller.signal,
  });
  if(!response.ok){
    const raw=await boundedResponseText(response);
    let message=`HTTP_${response.status}`;
    try{message=JSON.parse(raw)?.error||message;}catch{}
    throw new Error(message);
  }

  if(!response.body)throw new Error('AGENT_CHAT_STREAM_UNAVAILABLE');
  reader=response.body.getReader();
  const decoder=new TextDecoder();
  let buffer='',eventCount=0,truncated=false;
  for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    let newline;
    while((newline=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,newline).trim();
      buffer=buffer.slice(newline+1);
      if(!line)continue;
      if(Buffer.byteLength(line)>MAX_STREAM_LINE_BYTES)throw new Error('AGENT_CHAT_STREAM_LINE_TOO_LARGE');
      let envelope;
      try{envelope=JSON.parse(line);}catch{throw new Error('AGENT_CHAT_STREAM_INVALID_JSON');}
      if(envelope.type==='event'){
        if(eventCount<MAX_EVENTS)emit({type:'event',event:projectEvent(envelope.event)});
        else if(!truncated){emit({type:'event-truncated',limit:MAX_EVENTS});truncated=true;}
        eventCount++;
      }else if(envelope.type==='result'){
        result=envelope.result;
      }else if(envelope.type==='error'){
        throw new Error(envelope.error||'agent_chat_turn_failed');
      }
    }
    if(Buffer.byteLength(buffer)>MAX_STREAM_LINE_BYTES)throw new Error('AGENT_CHAT_STREAM_LINE_TOO_LARGE');
  }
  if(buffer.trim()){
    let envelope;
    try{envelope=JSON.parse(buffer.trim());}catch{throw new Error('AGENT_CHAT_STREAM_INVALID_JSON');}
    if(envelope.type==='result')result=envelope.result;
    else if(envelope.type==='error')throw new Error(envelope.error||'agent_chat_turn_failed');
  }
  clearTimeout(timer);
  if(result?.status==='resumable'){
    emit({type:'waiting',conversationId,turnId:result.turnId});
    while(Date.now()-startedAt<defaultTimeout){
      await new Promise(resolve=>setTimeout(resolve,1000));
      const detail=await requestJson('GET',`/agent/chat/conversations/${encodeURIComponent(conversationId)}`);
      const turn=detail?.turns?.find(item=>item.id===result.turnId);
      if(turn?.status==='finalized'){
        // The exact request is confirmed terminal; this POST reads its existing deduplicated result.
        await sendTurn(conversationId,prompt,clientRequestId,evaluation,providerId,model);
        return;
      }
      if(turn&&['failed','stopped','interrupted'].includes(turn.status))throw new Error(turn.errorCode||'AGENT_CHAT_WAIT_ENDED');
    }
    throw new Error('AGENT_CHAT_PROVIDER_WAIT_TIMEOUT');
  }
  if(!result)throw new Error('AGENT_CHAT_STREAM_RESULT_MISSING');
  emit({type:'result',result:projectResult(result)});
  }finally{
    clearTimeout(timer);
    if(reader){await reader.cancel().catch(()=>undefined);reader.releaseLock();}
  }
}
function usage(){
  return [
    'Usage: native-chat-bridge.mjs list [--archived]',
    '       native-chat-bridge.mjs read <conversationId> [--max-messages N | --status]',
    '       native-chat-bridge.mjs wait <conversationId> [--timeout-ms 1000..540000]',
    '       native-chat-bridge.mjs create [--workspace name] [--title title]',

    '       native-chat-bridge.mjs send <conversationId> --prompt text [--client-request-id id] [--provider id [--model id]]',
    '       native-chat-bridge.mjs send <conversationId> --stdin [--client-request-id id] [--provider id [--model id]]',
    '       native-chat-bridge.mjs cancel <turnId>',
  ].join('\n');
}
async function main(){
  const {positionals,options}=parseArgs(process.argv.slice(2));
  const [command,id,...rest]=positionals;
  if(!command||command==='help'||options.help){process.stdout.write(usage()+'\n');return;}
  validateRuntime();
  if(command==='list'){
    const result=await requestJson('GET','/agent/chat/conversations'+(options.archived?'?archived=1':''));
    emit({type:'list',count:Array.isArray(result?.conversations)?result.conversations.length:0,
      conversations:Array.isArray(result?.conversations)?result.conversations.slice(0,100):[]});
    return;
  }
  if(command==='read'){
    if(!id)throw new Error('conversationId is required');
    const max=Number.parseInt(String(options['max-messages']??'50'),10);
    if(!Number.isSafeInteger(max)||max<1||max>200)throw new Error('max-messages must be 1..200');
    const result=await requestJson('GET',`/agent/chat/conversations/${encodeURIComponent(id)}`);
    emit(options.status===true?{type:'status',...projectStatus(result)}:{type:'conversation',...projectDetail(result,max)});
    return;
  }
  if(command==='wait'){
    if(!id)throw new Error('conversationId is required');
    const timeout=Number.parseInt(String(options['timeout-ms']??'45000'),10);
    if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>540_000)throw new Error('timeout-ms must be 1000..540000');
    const deadline=Date.now()+timeout;
    let status;
    for(;;){
      status=projectStatus(await requestJson('GET',`/agent/chat/conversations/${encodeURIComponent(id)}`));
      if(status.turn?.status!=='running'||Date.now()+WAIT_POLL_MS>deadline)break;
      await new Promise(resolve=>setTimeout(resolve,WAIT_POLL_MS));
    }
    emit({type:'status',waiting:status.turn?.status==='running',...status});
    return;
  }
  if(command==='create'){
    const body={};
    if(typeof options.workspace==='string')body.workspace=options.workspace;
    if(typeof options.title==='string')body.title=options.title;
    emit({type:'created',...projectDetail(await requestJson('POST','/agent/chat/conversations',body),50)});
    return;
  }

  if(command==='send'){
    if(!id)throw new Error('conversationId is required');
    let prompt='';
    if(options.stdin===true)prompt=fs.readFileSync(0,'utf8').trim();
    else if(typeof options.prompt==='string')prompt=options.prompt.trim();
    else if(rest.length)prompt=rest.join(' ').trim();
    if(!prompt)throw new Error('prompt is required');
    if(prompt.length>200_000)throw new Error('prompt exceeds 200000 characters');
    const requestId=typeof options['client-request-id']==='string'
      ? options['client-request-id'].trim()
      : `external-native-chat:${randomUUID()}`;
    if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(requestId))
      throw new Error('client-request-id is invalid');
    emit({type:'send-start',conversationId:id,clientRequestId:requestId,promptChars:prompt.length});
    let evaluation;
    if(typeof options['evaluation-file']==='string'){
      const file=options['evaluation-file'];
      if(fs.statSync(file).size>16_384)throw new Error('evaluation file exceeds 16384 bytes');
      evaluation=JSON.parse(fs.readFileSync(file,'utf8'));
      if(!evaluation||typeof evaluation!=='object'||Array.isArray(evaluation))throw new Error('evaluation file must contain an object');
    }
    // Optional route pin from GET /agent/chat/providers; the server validates it (absent or auto = rotation).
    const providerId=typeof options.provider==='string'?options.provider.trim():undefined;
    if(providerId!==undefined&&!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(providerId))throw new Error('provider is invalid');
    // Optional model for the pinned route; the server checks it against that route's models.
    const model=typeof options.model==='string'?options.model.trim():undefined;
    if(model!==undefined&&providerId===undefined)throw new Error('model requires provider');
    if(model!==undefined&&!/^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,99}$/.test(model))throw new Error('model is invalid');
    await sendTurn(id,prompt,requestId,evaluation,providerId,model);
    return;
  }
  if(command==='cancel'){
    if(!id)throw new Error('turnId is required');
    emit({type:'cancel',turnId:id,
      result:await requestJson('POST',`/agent/chat/turns/${encodeURIComponent(id)}/cancel`)});
    return;
  }
  throw new Error(`unknown command: ${command}`);
}
main().catch(error=>{
  const message=clip(sanitize(error instanceof Error?error.message:String(error)),2000);
  const uncertain=['send','create','cancel'].includes(activeCommand)
    && (error?.name==='AbortError'||error instanceof TypeError
      || /^AGENT_CHAT_(STREAM_|RESPONSE_TOO_LARGE|PROVIDER_WAIT_TIMEOUT)/.test(message));
  emit({type:'error',error:message,...(uncertain?{outcome:'unknown',
    recovery:'Read the conversation/turn before retrying; reuse the exact clientRequestId. Disconnect does not stop a Native turn.'}:{})});
  process.exitCode=1;
});
