import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { writeExclusive, failure } from '../learning/report-io.mjs';

const MAX_BYTES=16*1024*1024;
const MAX_LINE_BYTES=256*1024;
const MAX_LINES=20000;
const MAX_KEYS=5000;
const MAX_RESULT_BYTES=2*1024*1024;
const TERMINAL_KINDS=new Set(['tool-call','handled-tool-failure','tool-exception']);
const sha256=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');

async function readSnapshot(file){
  const {assertSameFileIdentity}=await import('../../dist/security/file-identity.js');
  const pre=await fs.lstat(file,{bigint:true});
  if(!pre.isFile()||pre.isSymbolicLink()||pre.size>BigInt(MAX_BYTES))throw new Error('INVALID_JOURNAL_FILE');
  const handle=await fs.open(file,'r');
  try{
    const opened=await handle.stat({bigint:true});assertSameFileIdentity(pre,opened,'operation journal snapshot');
    const buffer=Buffer.alloc(Number(opened.size));let offset=0;
    while(offset<buffer.length){const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
    const after=await handle.stat({bigint:true}),current=await fs.lstat(file,{bigint:true});
    assertSameFileIdentity(after,current,'operation journal snapshot');
    if(offset!==buffer.length||pre.size!==after.size||pre.mtimeNs!==after.mtimeNs||current.isSymbolicLink())throw new Error('INPUT_CHANGED_DURING_READ');
    return buffer;
  }finally{await handle.close();}
}
function safeContext(row){return row&&typeof row==='object'&&row.context&&typeof row.context==='object'?row.context:{};}
function terminalStatus(row){
  const context=safeContext(row),explicit=context.outcome;
  if(['success','handled-failure','exception'].includes(explicit))return explicit;
  if(row.kind==='tool-call')return 'success';
  if(row.kind==='handled-tool-failure')return 'handled-failure';
  if(row.kind==='tool-exception')return 'exception';
  return 'terminal-unknown';
}

export function summarizeOperationCompleteness(bytes){
  if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
  if(bytes.length>MAX_BYTES)throw new Error('JOURNAL_TOO_LARGE');
  const finalLineTerminated=bytes.length===0||bytes.at(-1)===10;
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('INVALID_UTF8_JOURNAL');}
  let lines=text.split(/\n/);if(finalLineTerminated&&lines.at(-1)==='')lines.pop();
  const totalLines=lines.length,truncated=lines.length>MAX_LINES;
  lines=lines.slice(0,MAX_LINES);
  const groups=new Map(),legacy=[];
  let malformedLines=0,oversizedLines=0,duplicateBoundaries=0;
  for(let index=0;index<lines.length;index+=1){
    const raw=lines[index].endsWith('\r')?lines[index].slice(0,-1):lines[index];
    if(Buffer.byteLength(raw,'utf8')>MAX_LINE_BYTES){oversizedLines+=1;continue;}
    if(!raw)continue;
    let row;try{row=JSON.parse(raw);}catch{malformedLines+=1;continue;}
    const context=safeContext(row),invocationId=typeof context.invocationId==='string'?context.invocationId:'',
      processSessionId=typeof context.processSessionId==='string'?context.processSessionId:'',tool=typeof context.tool==='string'?context.tool:'';
    const relevant=row.kind==='tool-invocation-start'||TERMINAL_KINDS.has(row.kind);
    if(!relevant)continue;
    if(!invocationId||!processSessionId){legacy.push({line:index+1,eventId:String(row.id??''),kind:String(row.kind??''),tool});continue;}
    const key=processSessionId+'\0'+invocationId;
    let group=groups.get(key);
    if(!group){if(groups.size>=MAX_KEYS)throw new Error('ACTIVE_INVOCATION_LIMIT');group={invocationId,processSessionId,tool,starts:[],terminals:[]};groups.set(key,group);}
    const pointer={line:index+1,eventId:String(row.id??''),kind:String(row.kind??''),tool:tool||group.tool};
    if(row.kind==='tool-invocation-start')group.starts.push(pointer);
    else group.terminals.push({...pointer,outcome:terminalStatus(row)});
  }
  const invocations=[];
  for(const group of groups.values()){
    duplicateBoundaries+=Math.max(0,group.starts.length-1)+Math.max(0,group.terminals.length-1);
    let status;
    if(group.starts.length>1||group.terminals.length>1)status='ambiguous';
    else if(!group.starts.length)status='end-only';
    else if(!group.terminals.length)status='terminal-unobserved';
    else status=group.terminals[0].outcome;
    invocations.push({invocationId:group.invocationId,processSessionId:group.processSessionId,tool:group.tool||group.starts[0]?.tool||group.terminals[0]?.tool||'',status,starts:group.starts,terminals:group.terminals});
  }
  invocations.sort((a,b)=>(a.starts[0]?.line??a.terminals[0]?.line??0)-(b.starts[0]?.line??b.terminals[0]?.line??0));
  const inputComplete=!truncated&&malformedLines===0&&oversizedLines===0&&finalLineTerminated;
  const fullyPaired=invocations.every(item=>['success','handled-failure','exception'].includes(item.status));
  return {schemaVersion:1,kind:'operation-completeness',inputSha256:sha256(bytes),byteRange:{start:0,endExclusive:bytes.length},
    lineRange:{start:totalLines?1:0,end:Math.min(totalLines,MAX_LINES)},cutoff:{kind:'captured-file-end',byteOffset:bytes.length},
    finalLineTerminated,inputComplete,fullyPaired,truncated,omittedLines:Math.max(0,totalLines-MAX_LINES),malformedLines,oversizedLines,
    duplicateBoundaries,legacyUnpaired:legacy.length,legacy,invocations,historyClaim:'explicit-snapshot-only',processLiveness:'not-inferred'};
}
function parseCli(argv){
  let input,output;
  for(let i=0;i<argv.length;i+=2){const key=argv[i],value=argv[i+1];
    if(!value||value.startsWith('--'))throw new Error('INVALID_ARGUMENT');
    if(key==='--input'&&!input)input=path.resolve(value);else if(key==='--output'&&!output)output=path.resolve(value);else throw new Error('INVALID_ARGUMENT');}
  if(!input)throw new Error('MISSING_REQUIRED_ARGUMENT');
  if(output===input)throw new Error('OUTPUT_INPUT_COLLISION');
  return {input,output};
}

async function main(){
  const {input,output}=parseCli(process.argv.slice(2));
  const bytes=await readSnapshot(input),result=summarizeOperationCompleteness(bytes);
  const encoded=Buffer.from(JSON.stringify({...result,sourcePath:input},null,2)+'\n','utf8');
  if(encoded.length>MAX_RESULT_BYTES)throw new Error('RESULT_TOO_LARGE');
  if(output)await writeExclusive(output,encoded);else process.stdout.write(encoded);
}

const isMain=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));
if(isMain)main().catch(failure);
