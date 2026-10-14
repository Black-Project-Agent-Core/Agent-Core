import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterEach, expect } from 'vitest';
import { evaluateRetrieval } from '../../src/learning/retrieval-evaluation.js';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const cliRoot=process.env.AGENT_CORE_TEST_CLI_ROOT||root;
export const hash=(x:Uint8Array|string)=>'sha256:'+createHash('sha256').update(x).digest('hex');
export const bytes=(x:unknown)=>Buffer.from(JSON.stringify(x));
const temporary:string[]=[];
afterEach(async()=>{for(const dir of temporary.splice(0))await rm(dir,{recursive:true,force:true});});
export async function temp(){const dir=await mkdtemp(path.join(process.cwd(),'report-fixture-'));temporary.push(dir);return dir;}
export function input(baseline=[true,true,false,false],candidate=[false,false,true,true],patch:any={}){
  const cohort:any={schemaVersion:1,domain:'memory-retrieval-hit-at-k',revision:'cohort-v1',corpusRevision:'corpus-v1',topK:1,minimumSamples:1,
    queries:baseline.map((_,i)=>({id:'q'+i,expectedIds:['m'+i]}))};
  const c=bytes(cohort);
  const observation:any={schemaVersion:1,experimentId:'experiment-v1',cohortDigest:hash(c),corpusRevision:'corpus-v1',evaluatorRevision:'agent-core-retrieval-hit-at-k/v1',
    candidateRevision:'candidate-v1',baselineRevision:'baseline-v1',testsPassed:true,attributionComplete:true,eligibleIdentityVerified:true,substantiveActions:1,
    results:baseline.map((hit,i)=>({queryId:'q'+i,baselineIds:hit?['m'+i]:[],candidateIds:candidate[i]?['m'+i]:[]})),...patch};
  const o=bytes(observation);return {cohort,observation,c,o,score:evaluateRetrieval(c,o)};
}
export const run=(name:string,args:string[],extra:Record<string,string>={})=>spawnSync(process.execPath,[path.join(cliRoot,'scripts/learning',name),...args],
  {cwd:process.cwd(),encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,...extra}});
export async function report(data=input(),extra:Record<string,string>={}){
  const dir=await temp(),cohort=path.join(dir,'c.json'),observations=path.join(dir,'o.json'),output=path.join(dir,'report');
  await writeFile(cohort,data.c);await writeFile(observations,data.o);
  const args=['--cohort',cohort,'--observations',observations,'--output',output];
  return {dir,output,args,result:run('evaluate-retrieval.mjs',args,extra),data};
}
export const readJSON=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const sources=import.meta.glob('../../src/learning/retrieval-*.ts');
export async function load(name:string):Promise<any>{
  if(process.env.AGENT_CORE_TEST_DIST)return import(/* @vite-ignore */pathToFileURL(path.join(process.env.AGENT_CORE_TEST_DIST,'learning',name+'.js')).href);
  const loader=sources['../../src/learning/'+name+'.ts'];expect(loader,`missing selected module ${name}`).toBeTypeOf('function');return loader();
}
