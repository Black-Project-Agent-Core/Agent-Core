import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const tmpRoot=path.join(root,'runtime','tmp');
const argv=process.argv.slice(2);
let label='verification',maxLines=80,maxCaptureBytes=1024*1024,debug=false;
let split=argv.indexOf('--');
if(split<0)split=argv.findIndex(value=>!value.startsWith('--'));
const options=split<0?argv:argv.slice(0,split);
const command=split<0?[]:argv.slice(split+(argv[split]==='--'?1:0));
for(let i=0;i<options.length;i++){
  const value=options[i];
  if(value==='--debug'){debug=true;continue;}
  if(value==='--label'){label=String(options[++i]??'').slice(0,120);continue;}
  if(value==='--max-lines'){maxLines=Number(options[++i]);continue;}
  if(value==='--max-capture-bytes'){maxCaptureBytes=Number(options[++i]);continue;}
  throw new Error('UNKNOWN_OPTION: '+value);
}
if(!command.length)throw new Error('COMMAND_REQUIRED');
if(!Number.isSafeInteger(maxLines)||maxLines<1||maxLines>1000)throw new Error('INVALID_MAX_LINES');
if(!Number.isSafeInteger(maxCaptureBytes)||maxCaptureBytes<4096||maxCaptureBytes>16*1024*1024)throw new Error('INVALID_MAX_CAPTURE_BYTES');
await mkdir(tmpRoot,{recursive:true});
const tempDir=await mkdtemp(path.join(tmpRoot,'verify-output-'));
const capturePath=path.join(tempDir,'capture.log');
const file=await open(capturePath,'w');
const hash=createHash('sha256');
let totalBytes=0,newlines=0,lastByte=-1,written=0,captureTruncated=false;
let stdoutTail=Buffer.alloc(0),stderrTail=Buffer.alloc(0);
const tailCap=Math.min(maxCaptureBytes,512*1024);
let child;
let interrupted;
const feed=async(chunk,stream)=>{
  const value=Buffer.from(chunk);totalBytes+=value.length;hash.update(value);
  for(const byte of value)if(byte===10)newlines+=1;
  if(value.length)lastByte=value[value.length-1];
  if(stream==='stderr'){
    stderrTail=Buffer.concat([stderrTail,value]);if(stderrTail.length>tailCap)stderrTail=stderrTail.subarray(stderrTail.length-tailCap);
  }else{
    stdoutTail=Buffer.concat([stdoutTail,value]);if(stdoutTail.length>tailCap)stdoutTail=stdoutTail.subarray(stdoutTail.length-tailCap);
  }
  const remaining=maxCaptureBytes-written;
  if(remaining>0){const slice=value.subarray(0,remaining);await file.write(slice);written+=slice.length;}
  if(value.length>remaining)captureTruncated=true;
  if(debug)(stream==='stderr'?process.stderr:process.stdout).write(value);
};
try{
  child=spawn(command[0],command.slice(1),{cwd:root,env:process.env,stdio:['inherit','pipe','pipe'],windowsHide:true,shell:false});
  const pending=[];
  child.stdout.on('data',chunk=>pending.push(feed(chunk,'stdout')));
  child.stderr.on('data',chunk=>pending.push(feed(chunk,'stderr')));
  for(const signal of ['SIGINT','SIGTERM']){
    process.once(signal,()=>{interrupted=signal;try{child.kill(signal);}catch{}});
  }
  const outcome=await new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('close',(code,signal)=>resolve({code,signal}));
  });
  await Promise.allSettled(pending);
  await file.sync();await file.close();
  const lines=totalBytes===0?0:newlines+(lastByte===10?0:1);
  const digest='sha256:'+hash.digest('hex');
  const exitCode=Number.isInteger(outcome.code)?outcome.code:(interrupted==='SIGINT'?130:interrupted==='SIGTERM'?143:1);
  if(exitCode===0){
    process.stdout.write('PASS: '+label+' — '+lines+' lines / '+totalBytes+' bytes suppressed; '+digest+(captureTruncated?' (capture capped)':'')+'\n');
  }else{
    const toLines=buffer=>{
      const text=buffer.toString('utf8'),values=text.split(/\r?\n/);
      if(text.endsWith('\n'))values.pop();
      return values;
    };
    const errorLines=toLines(stderrTail).slice(-maxLines);
    const outputBudget=Math.max(0,maxLines-errorLines.length);
    const outputLines=outputBudget?toLines(stdoutTail).slice(-outputBudget):[];
    const selected=[...outputLines,...errorLines];
    if(lines>selected.length)process.stderr.write('--- output truncated: last '+selected.length+' of '+lines+' lines; stderr preserved first ---\n');
    if(selected.length)process.stderr.write(selected.join('\n')+'\n');
    process.stderr.write('FAIL('+exitCode+'): '+label+' — '+lines+' lines / '+totalBytes+' bytes; '+digest+(outcome.signal?' signal='+outcome.signal:'')+'\n');
  }
  process.exitCode=exitCode;
}finally{
  try{await file.close();}catch{}
  await rm(tempDir,{recursive:true,force:true}).catch(()=>undefined);
}
