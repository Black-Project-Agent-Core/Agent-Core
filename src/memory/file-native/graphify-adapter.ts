import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { atomicReplaceValidated } from './atomic-writer.js';
import type { FileNativeMemoryPaths } from './paths.js';
import type { GraphRecallHit, GraphRecallProvider, GraphRecallResults } from './retriever.js';
import { FileNativeMemoryRepository } from './vault-repository.js';

const execFileAsync=promisify(execFile);

function graphifyProcessEnv():NodeJS.ProcessEnv {
  const env:NodeJS.ProcessEnv={ GRAPHIFY_QUERY_LOG_DISABLE:'1' };
  for(const key of ['PATH','Path','SYSTEMROOT','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA']) {
    const value=process.env[key]; if(value) env[key]=value;
  }
  return env;
}
export interface GraphifyAdapterOptions { pythonPath:string; bridgePath:string; nodeCap?:number; edgeCap?:number; maxHops?:number; processTimeoutMs?:number }
export interface GraphifyHealth { healthy:boolean; checkedAt:number; errorCode?:string; snapshotHash?:string }
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
interface GraphLink { source:string; target:string; relation?:string; confidence?:string; confidence_score?:number }
interface GraphDocument { nodes?:Array<Record<string,unknown>>;links?:GraphLink[];edges?:GraphLink[] }

export class GraphifyAdapter implements GraphRecallProvider {
  private readonly repo:FileNativeMemoryRepository;
  /** Links plus a node count, never the parsed node objects: 100k of those parked in the heap tax every GC pause on the recall path. */
  private graphCache:{file:string;size:number;mtimeMs:number;ctimeMs:number;nodes:number;links:GraphLink[];hash:string}|undefined;
  private runtimeCheck:{signature:string;checkedAt:number}|undefined;
  private updateQueue:Promise<unknown>=Promise.resolve();
  constructor(readonly paths:FileNativeMemoryPaths,readonly options:GraphifyAdapterOptions){this.repo=new FileNativeMemoryRepository(paths);}

  async update(changedFiles:readonly string[]):Promise<{nodes:number;edges:number;graphPath:string}>{
    const next=this.updateQueue.catch(()=>undefined).then(()=>this.build(changedFiles));
    this.updateQueue=next;
    return next;
  }

  private async build(changedFiles:readonly string[]):Promise<{nodes:number;edges:number;graphPath:string}>{
    await mkdir(this.paths.graphRoot,{recursive:true});
    const snapshotHash=await this.vaultFingerprint(true);
    const segments=await this.repo.listSegments();const nodes:Array<Record<string,unknown>>=[],edges:Array<Record<string,unknown>>=[];
    const grouped=new Map<string,{source:string;target:string;sourceFile:string;relations:Array<{relation:string;weight:number;evidenceEventId?:string}>}>();
    for(const segment of segments.sort((a,b)=>a.relativePath.localeCompare(b.relativePath))){
      for(const entry of [...segment.entries].sort((a,b)=>a.memoryId.localeCompare(b.memoryId))){
        nodes.push({id:entry.memoryId,label:entry.title??entry.canonicalKey,source_file:segment.relativePath,source_location:'L1',file_type:'document',kind:entry.kind,state:entry.state,canonical_key:entry.canonicalKey,_origin:'ast'});
        for(const relation of [...entry.relations].sort((a,b)=>`${a.relation}\0${a.targetMemoryId}`.localeCompare(`${b.relation}\0${b.targetMemoryId}`))){
          const key=`${entry.memoryId}\0${relation.targetMemoryId}`;const bucket=grouped.get(key)??{source:entry.memoryId,target:relation.targetMemoryId,sourceFile:segment.relativePath,relations:[]};bucket.relations.push({relation:relation.relation,weight:relation.weight,...(relation.evidenceEventId?{evidenceEventId:relation.evidenceEventId}:{})});grouped.set(key,bucket);
        }
      }
    }
    for(const bucket of [...grouped.values()].sort((a,b)=>`${a.source}\0${a.target}`.localeCompare(`${b.source}\0${b.target}`))){
      const byType=new Map<string,{relation:string;weight:number;count:number;evidenceEventIds:string[]}>();for(const rel of bucket.relations){const current=byType.get(rel.relation)??{relation:rel.relation,weight:rel.weight,count:0,evidenceEventIds:[]};current.weight=Math.max(current.weight,rel.weight);current.count+=1;if(rel.evidenceEventId&&!current.evidenceEventIds.includes(rel.evidenceEventId))current.evidenceEventIds.push(rel.evidenceEventId);byType.set(rel.relation,current);}
      const relationSet=[...byType.values()].map(r=>({...r,evidenceEventIds:r.evidenceEventIds.sort()})).sort((a,b)=>b.weight-a.weight||a.relation.localeCompare(b.relation));const primary=relationSet[0]!;
      edges.push({source:bucket.source,target:bucket.target,relation:primary.relation,confidence:'EXTRACTED',confidence_score:1,source_file:bucket.sourceFile,source_location:'L1',_origin:'ast',agent_core_relation_types:relationSet.map(r=>r.relation).sort(),agent_core_relations:relationSet,agent_core_relation_count:bucket.relations.length});
    }
    nodes.sort((a,b)=>String(a.id).localeCompare(String(b.id)));edges.sort((a,b)=>`${a.source}\0${a.target}\0${a.relation}`.localeCompare(`${b.source}\0${b.target}\0${b.relation}`));
    const extraction={nodes,edges,hyperedges:[],directed:true,agent_core:{schema_version:1,changed_files:[...changedFiles].sort()}};
    const extractionPath=path.join(this.paths.graphRoot,'extraction.json'),graphPath=path.join(this.paths.graphRoot,'graph.json');
    await atomicReplaceValidated(extractionPath,JSON.stringify(extraction,null,2)+'\n',(text)=>{const parsed=JSON.parse(text);if(!Array.isArray(parsed.nodes)||!Array.isArray(parsed.edges))throw new Error('MEMORY_GRAPH_EXTRACTION_INVALID');});
    const temporaryGraph=path.join(this.paths.graphRoot,`graph.${randomUUID()}.tmp.json`);
    try{
      await execFileAsync(this.options.pythonPath,[this.options.bridgePath,'build',extractionPath,temporaryGraph,this.paths.vaultRoot],{windowsHide:true,maxBuffer:4*1024*1024,timeout:this.options.processTimeoutMs??30_000,env:graphifyProcessEnv()});
      await this.loadGraph(temporaryGraph);
      if(await this.vaultFingerprint(true)!==snapshotHash)throw new Error('MEMORY_GRAPH_STALE');
      await atomicReplaceValidated(graphPath,await readFile(temporaryGraph,'utf8'),text=>{JSON.parse(text);});
    }catch(error){throw new Error(`MEMORY_GRAPHIFY_BUILD_FAILED:${error instanceof Error?error.message:String(error)}`);}
    finally{await unlink(temporaryGraph).catch(()=>undefined);}
    const graph=await this.loadGraph(graphPath);
    await atomicReplaceValidated(path.join(this.paths.graphRoot,'projection.json'),JSON.stringify({schemaVersion:1,snapshotHash,graphHash:graph.hash})+'\n',text=>{JSON.parse(text);});
    return{nodes:graph.nodes,edges:graph.links.length,graphPath};
  }

  private async vaultFingerprint(verifyContent=false):Promise<string>{
    const snapshot=await this.repo.readSnapshot({verifyContent});
    if(snapshot.malformedFiles.length)throw new Error('MEMORY_VAULT_INVALID');
    return hash(JSON.stringify(snapshot.spines.map(s=>[s.relativePath,s.contentHash])));
  }

  private async checkRuntime():Promise<void>{
    const files=await Promise.all([this.options.pythonPath,this.options.bridgePath].map(file=>stat(file)));
    const signature=JSON.stringify(files.map(s=>[s.size,s.mtimeMs]));
    if(this.runtimeCheck?.signature===signature&&Date.now()-this.runtimeCheck.checkedAt<30_000)return;
    const {stdout}=await execFileAsync(this.options.pythonPath,['-c','import graphify.build, graphify.export, graphify.serve, networkx; print("GRAPHIFY_OK")'],{windowsHide:true,maxBuffer:1024*1024,timeout:this.options.processTimeoutMs??15_000,env:graphifyProcessEnv()});
    if(stdout.trim()!=='GRAPHIFY_OK')throw new Error('MEMORY_GRAPHIFY_RUNTIME_INVALID');
    this.runtimeCheck={signature,checkedAt:Date.now()};
  }

  async health(options:{verifyContent?:boolean}={}):Promise<GraphifyHealth>{
    try{await this.checkRuntime();}catch{return{healthy:false,checkedAt:Date.now(),errorCode:'MEMORY_GRAPHIFY_RUNTIME_UNAVAILABLE'};}
    let snapshotHash:string;
    try{snapshotHash=await this.vaultFingerprint(options.verifyContent);}catch{return{healthy:false,checkedAt:Date.now(),errorCode:'MEMORY_VAULT_INVALID'};}
    try{
      const graph=await this.loadGraph(path.join(this.paths.graphRoot,'graph.json'),options.verifyContent);
      const receipt=JSON.parse(await readFile(path.join(this.paths.graphRoot,'projection.json'),'utf8'));
      if(receipt.schemaVersion!==1||receipt.snapshotHash!==snapshotHash||receipt.graphHash!==graph.hash)return{healthy:false,checkedAt:Date.now(),errorCode:'MEMORY_GRAPH_STALE',snapshotHash};
      return{healthy:true,checkedAt:Date.now(),snapshotHash};
    }catch{return{healthy:false,checkedAt:Date.now(),errorCode:'MEMORY_GRAPH_INDEX_UNAVAILABLE',snapshotHash};}
  }

  /** Repair only the derived projection; unavailable runtime or malformed vault still blocks recall. */
  async ensureFresh(options:{verifyContent?:boolean}={}):Promise<GraphifyHealth>{
    await this.updateQueue.catch(()=>undefined);
    let status=await this.health(options);
    if(status.errorCode==='MEMORY_GRAPH_STALE'||status.errorCode==='MEMORY_GRAPH_INDEX_UNAVAILABLE'){
      await this.update([]);
      status=await this.health(options);
    }
    if(!status.healthy)throw new Error(status.errorCode??'MEMORY_GRAPH_UNAVAILABLE');
    return status;
  }

  async queryRelated(memoryIds:string[],budget:number):Promise<GraphRecallResults>{
    await this.ensureFresh();
    const links=(await this.loadGraph(path.join(this.paths.graphRoot,'graph.json'))).links;
    if(!Number.isSafeInteger(budget)||budget<1)throw new Error('MEMORY_GRAPH_BUDGET_INVALID');
    const limit=Math.min(budget,this.options.nodeCap??budget),edgeLimit=this.options.edgeCap??Number.MAX_SAFE_INTEGER,maxHops=this.options.maxHops??3;
    const seedSet=new Set(memoryIds),scores:GraphRecallResults=new Map<string,GraphRecallHit>();scores.truncated=false;
    const queue=[...seedSet].sort().slice(0,limit).map(id=>({id,depth:0,path:[id]})),visited=new Set(memoryIds),usedEdges=new Set<GraphLink>();
    if(seedSet.size>limit)scores.truncated=true;
    const ordered=[...links].sort((a,b)=>`${a.source}\0${a.target}\0${a.relation??''}`.localeCompare(`${b.source}\0${b.target}\0${b.relation??''}`));
    const adjacent=new Map<string,GraphLink[]>();
    for(const edge of ordered){
      for(const id of new Set([edge.source,edge.target])){const bucket=adjacent.get(id)??[];bucket.push(edge);adjacent.set(id,bucket);}
    }
    while(queue.length){
      const current=queue.shift()!;if(current.depth>=maxHops)continue;
      for(const e of adjacent.get(current.id)??[]){
        let target:string|undefined;if(e.source===current.id)target=e.target;else if(e.target===current.id)target=e.source;
        if(!target||seedSet.has(target))continue;
        if(!usedEdges.has(e)){if(usedEdges.size>=edgeLimit){scores.truncated=true;continue;}usedEdges.add(e);}
        if(!scores.has(target)&&scores.size>=limit){scores.truncated=true;continue;}
        const confidence=e.confidence==='EXTRACTED'?1:e.confidence==='INFERRED'?Math.max(.5,Number(e.confidence_score??.75)):.4;
        const score=confidence/(current.depth+1),path=[...current.path,target],prior=scores.get(target);
        if(!prior||score>prior.score)scores.set(target,{score,path});
        if(!visited.has(target)){visited.add(target);queue.push({id:target,depth:current.depth+1,path});}
      }
    }
    return scores;
  }
  scoreRelated(memoryIds:string[],budget:number){return this.queryRelated(memoryIds,budget);}
  async queryText(question:string,budget=2000):Promise<string>{await this.ensureFresh();const graphPath=path.join(this.paths.graphRoot,'graph.json');const {stdout}=await execFileAsync(this.options.pythonPath,[this.options.bridgePath,'query',graphPath,question,String(budget)],{windowsHide:true,maxBuffer:4*1024*1024,timeout:this.options.processTimeoutMs??30_000,env:graphifyProcessEnv()});return stdout.trim();}
  private async loadGraph(file:string,verifyContent=false):Promise<{nodes:number;links:GraphLink[];hash:string}>{
    const info=await stat(file),cached=this.graphCache;
    if(!verifyContent&&cached&&cached.file===file&&cached.size===info.size&&cached.mtimeMs===info.mtimeMs&&cached.ctimeMs===info.ctimeMs)return cached;
    const text=await readFile(file,'utf8'),graph=JSON.parse(text) as GraphDocument;
    if(!Array.isArray(graph.nodes)||(!Array.isArray(graph.links)&&!Array.isArray(graph.edges)))throw new Error('MEMORY_GRAPH_INVALID');
    this.graphCache={file,size:info.size,mtimeMs:info.mtimeMs,ctimeMs:info.ctimeMs,nodes:graph.nodes.length,links:graph.links??graph.edges??[],hash:hash(text)};return this.graphCache;
  }
}
