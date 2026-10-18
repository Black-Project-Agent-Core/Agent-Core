import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { analyzeSources } from './analyzer.js';
import { renderWorkflowGraph } from './renderer.js';
import type { WorkflowGraph } from './types.js';

export interface WorkflowSnapshot {
  status: 'building' | 'ready' | 'stale' | 'error';
  fingerprint?: string;
  revision?: string;
  generatedAt?: string;
  checkedAt?: string;
  observedFingerprint?: string;
  sourceFiles?: number;
  nodes?: number;
  edges?: number;
  unknowns?: number;
  error?: string;
  html?: string;
  limitations: string[];
}
interface Options {
  pollMs?: number;
  debounceMs?: number;
  render?: (graph: WorkflowGraph) => Promise<string>;
}
const execFileAsync=promisify(execFile);

/** Serialized bounded source polling also catches atomic file replacement and
 * new/deleted folders without following recursive watcher links. No user data
 * directories or generated JSON are watched. Last-good output survives failure. */
export class WorkflowService {
  private state: WorkflowSnapshot = {status:'building',limitations:['Static source dependencies only; live execution is not observed.']};
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = true;
  private candidate?: {fingerprint:string;since:number};
  private readonly pollMs: number;
  private readonly debounceMs: number;
  private readonly render: (graph:WorkflowGraph)=>Promise<string>;
  constructor(private readonly root:string,options:Options={}) {
    this.pollMs=options.pollMs??3000;
    this.debounceMs=options.debounceMs??750;
    this.render=options.render??renderWorkflowGraph;
  }
  start():void {
    if(!this.stopped)return;
    this.stopped=false;
    this.schedule(0);
  }
  snapshot():WorkflowSnapshot {return {...this.state,limitations:[...this.state.limitations]};}
  async close():Promise<void> {
    this.stopped=true;
    if(this.timer)clearTimeout(this.timer);
    this.timer=undefined;
    await this.running;
  }
  private schedule(delay:number):void {
    if(this.stopped)return;
    this.timer=setTimeout(()=>{
      this.running=this.refresh().finally(()=>{
        this.running=undefined;
        this.schedule(this.pollMs);
      });
    },delay);
    this.timer.unref();
  }
  private async revision():Promise<string> {
    try {
      const {stdout}=await execFileAsync('git',['-C',this.root,'rev-parse','--verify','HEAD'],
        {timeout:2000,maxBuffer:4096,windowsHide:true,env:{PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??'',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'}});
      const value=stdout.trim();return /^[a-f0-9]{40,64}$/.test(value)?value:'unknown';
    }catch{return 'unknown';}
  }
  private async analyze():Promise<WorkflowGraph> {
    let sourceRoot=this.root;
    try { await lstat(path.join(this.root,'src')); }
    catch(error) {
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
      sourceRoot=path.join(this.root,'source');
    }
    const graph=await analyzeSources(sourceRoot);
    if(!graph.files)throw new Error('Supported source is unavailable');
    if(sourceRoot!==this.root)graph.limitations.unshift('Packaged source snapshot; changes here do not prove changes to compiled binaries or live runtime.');
    return graph;
  }
  private async refresh():Promise<void> {
    try {
      const graph=await this.analyze();
      if(this.stopped)return;
      this.state={...this.state,checkedAt:new Date().toISOString(),observedFingerprint:graph.fingerprint};
      if(graph.fingerprint===this.state.fingerprint&&this.state.html){
        this.state={...this.state,status:'ready',error:undefined};
        this.candidate=undefined;
        return;
      }
      if(this.state.html){
        this.state={...this.state,status:'stale'};
        if(this.candidate?.fingerprint!==graph.fingerprint){
          this.candidate={fingerprint:graph.fingerprint,since:Date.now()};
          return;
        }
        if(Date.now()-this.candidate.since<this.debounceMs)return;
      }
      const html=await this.render(graph);
      if(this.stopped)return;
      // A source edit during rendering must not label an old graph current.
      const after=await this.analyze();
      if(this.stopped)return;
      this.state={
        status:after.fingerprint===graph.fingerprint?'ready':'stale',
        fingerprint:graph.fingerprint,revision:await this.revision(),generatedAt:new Date().toISOString(),
        checkedAt:new Date().toISOString(),observedFingerprint:after.fingerprint,
        sourceFiles:graph.files,nodes:graph.nodes.length,edges:graph.edges.length,unknowns:graph.unknowns,
        html,limitations:graph.limitations,
      };
      this.candidate=after.fingerprint===graph.fingerprint?undefined:{fingerprint:after.fingerprint,since:Date.now()};
    }catch{
      if(!this.stopped)this.state={...this.state,status:this.state.html?'stale':'error',
        error:'Supported source is unavailable, or source analysis/canvas generation failed. The last successful canvas is retained; automatic retry is pending.'};
    }
  }
}
