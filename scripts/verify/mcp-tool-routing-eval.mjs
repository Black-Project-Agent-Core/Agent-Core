import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MAX_QUERIES=200, MAX_RUNS=10, MAX_OUTPUT=1024*1024;
const sha256=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');

function parseCli(argv){
  const out={args:[],guards:[]};
  for(let i=0;i<argv.length;i+=1){
    const key=argv[i], value=argv[i+1];
    if(key==='--fixture'){out.fixture=value;i++;continue;}
    if(key==='--command'){out.command=value;i++;continue;}
    if(key==='--arg'){out.args.push(value??'');i++;continue;}
    if(key==='--guard'){out.guards.push(value);i++;continue;}
    if(key==='--output'){out.output=value;i++;continue;}
    throw new Error('INVALID_ARGUMENT');
  }
  if(!out.fixture||!out.command)throw new Error('FIXTURE_AND_COMMAND_REQUIRED');
  if(!out.guards.length)throw new Error('AT_LEAST_ONE_GUARD_REQUIRED');
  return out;
}

function stringList(value,name){
  if(!Array.isArray(value)||!value.length||value.some(item=>typeof item!=='string'||!item.trim()))throw new Error(`${name}_REQUIRED`);
  return value.map(item=>item.trim());
}

function cohort(value,name){
  if(!value)return null;
  return {positive:stringList(value.positive,`${name}_POSITIVE`),negative:stringList(value.negative,`${name}_NEGATIVE`)};
}

function validateFixture(raw){
  if(!raw||typeof raw!=='object')throw new Error('FIXTURE_INVALID');
  const tool=String(raw.tool??'').trim();
  if(!/^[A-Za-z0-9_.-]{1,160}$/.test(tool))throw new Error('TOOL_INVALID');
  const train=cohort(raw.train,'TRAIN');
  if(!train)throw new Error('TRAIN_REQUIRED');
  const holdout=cohort(raw.holdout,'HOLDOUT');
  const repetitions=Math.max(1,Math.min(MAX_RUNS,Number(raw.repetitions??3)));
  const timeoutMs=Math.max(1000,Math.min(120000,Number(raw.timeoutMs??30000)));
  if(!Number.isSafeInteger(repetitions)||!Number.isSafeInteger(timeoutMs))throw new Error('FIXTURE_NUMERIC_INVALID');
  const rows=[];
  for(const [cohortName,set] of [['train',train],['holdout',holdout]]){
    if(!set)continue;
    for(const query of set.positive)rows.push({query,shouldTrigger:true,cohort:cohortName});
    for(const query of set.negative)rows.push({query,shouldTrigger:false,cohort:cohortName});
  }
  if(rows.length>MAX_QUERIES)throw new Error('QUERY_LIMIT');
  const seen=new Map();
  for(const row of rows){
    const key=row.query.toLowerCase();
    const prior=seen.get(key);
    if(prior!==undefined&&prior!==row.shouldTrigger)throw new Error('OVERLAPPING_LABELS');
    if(prior!==undefined)throw new Error('DUPLICATE_QUERY');
    seen.set(key,row.shouldTrigger);
  }
  return {tool,repetitions,timeoutMs,rows};
}

async function guardHashes(paths){
  const rows=[];
  for(const value of paths){
    const file=path.resolve(value);
    rows.push({file,digest:sha256(await readFile(file))});
  }
  return rows;
}

async function runController(command,args,request,timeoutMs){
  return new Promise(resolve=>{
    const rendered=args.map(value=>value.replaceAll('{query}',request.query).replaceAll('{tool}',request.tool));
    const child=spawn(command,rendered,{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
    const stdout=[],stderr=[];let bytes=0,settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>{try{child.kill();}catch{}finish({ok:false,failure:'timeout'});},timeoutMs);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_OUTPUT){try{child.kill();}catch{}finish({ok:false,failure:'output-limit'});return;}stdout.push(Buffer.from(chunk));});
    child.stderr.on('data',chunk=>{if(stderr.reduce((n,b)=>n+b.length,0)<MAX_OUTPUT)stderr.push(Buffer.from(chunk));});
    child.once('error',()=>finish({ok:false,failure:'spawn-error'}));
    child.once('close',code=>{
      if(settled)return;
      if(code!==0)return finish({ok:false,failure:`exit-${code}`});
      try{
        const parsed=JSON.parse(Buffer.concat(stdout).toString('utf8').trim());
        const selected=Array.isArray(parsed.selectedTools)?parsed.selectedTools.filter(v=>typeof v==='string'):[];
        finish({ok:true,selectedTools:selected.slice(0,100)});
      }catch{finish({ok:false,failure:'invalid-json'});}
    });
    child.stdin.end(JSON.stringify(request)+'\n');
  });
}

async function evaluateRow(row,fixture,cli){
  const trials=[];
  for(let run=0;run<fixture.repetitions;run+=1){
    const response=await runController(cli.command,cli.args,{query:row.query,tool:fixture.tool,run},fixture.timeoutMs);
    trials.push({run,ok:response.ok,triggered:response.ok?response.selectedTools.includes(fixture.tool):false,...(!response.ok?{failure:response.failure}:{})});
  }
  const complete=trials.every(item=>item.ok);
  const triggerRate=trials.filter(item=>item.triggered).length/trials.length;
  const pass=complete&&(row.shouldTrigger?triggerRate>=0.5:triggerRate<0.5);
  return {...row,triggerRate,trials,complete,pass};
}

async function main(){
  const cli=parseCli(process.argv.slice(2));
  const fixture=validateFixture(JSON.parse(await readFile(path.resolve(cli.fixture),'utf8')));
  const before=await guardHashes(cli.guards);
  const results=[];
  for(const row of fixture.rows)results.push(await evaluateRow(row,fixture,cli));
  const after=await guardHashes(cli.guards);
  const guardUnchanged=before.every((item,index)=>after[index]?.digest===item.digest);
  const summarize=cohortName=>{
    const rows=results.filter(item=>item.cohort===cohortName);
    return {total:rows.length,passed:rows.filter(item=>item.pass).length,incomplete:rows.filter(item=>!item.complete).length};
  };
  const report={
    schemaVersion:1,
    kind:'mcp-tool-routing-evaluation',
    tool:fixture.tool,
    repetitions:fixture.repetitions,
    train:summarize('train'),
    holdout:summarize('holdout'),
    guardUnchanged,
    guards:before.map((item,index)=>({file:path.basename(item.file),unchanged:after[index]?.digest===item.digest})),
    results,
    complete:guardUnchanged&&results.every(item=>item.complete),
    sourceMutated:!guardUnchanged,
  };
  const bytes=JSON.stringify(report,null,2)+'\n';
  if(cli.output)await writeFile(path.resolve(cli.output),bytes,{encoding:'utf8',flag:'wx'});
  else process.stdout.write(bytes);
  if(!report.complete)process.exitCode=2;
  else if(results.some(item=>!item.pass))process.exitCode=1;
}

main().catch(error=>{
  process.stderr.write(`mcp routing evaluation failed: ${error instanceof Error?error.message:String(error)}\n`);
  process.exitCode=2;
});
