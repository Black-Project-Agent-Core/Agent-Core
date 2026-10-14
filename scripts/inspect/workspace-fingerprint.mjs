import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readArtifact, writeExclusive, failure } from '../learning/report-io.mjs';

const MAX_REPOS=16, MAX_GIT_BYTES=8*1024*1024, MAX_STATUS_ENTRIES=10000, MAX_PATH_EVIDENCE=256, GIT_TIMEOUT_MS=5000;
const PROTECTED_SEGMENT='do not touch without instruction explicit';
const sha256=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const normalizeRoot=value=>path.resolve(value);
const isProtected=value=>normalizeRoot(value).toLowerCase().split(/[\\/]+/).includes(PROTECTED_SEGMENT);
const stableBytes=value=>Buffer.from(JSON.stringify(value),'utf8');

async function git(root,args,{allowFailure=false}={}){
  const safe=normalizeRoot(root).replace(/\\/g,'/');
  return new Promise((resolve,reject)=>{
    const child=spawn('git',['-c',`safe.directory=${safe}`,'-C',root,...args],{
      stdio:['ignore','pipe','pipe'],windowsHide:true,
    });
    const out=[],err=[];let bytes=0,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{try{child.kill();}catch{}finish(new Error('GIT_COMMAND_TIMEOUT'));},GIT_TIMEOUT_MS);
    child.stdout.on('data',chunk=>{const b=Buffer.from(chunk);bytes+=b.length;if(bytes>MAX_GIT_BYTES){try{child.kill();}catch{}finish(new Error('GIT_OUTPUT_LIMIT'));}else out.push(b);});
    child.stderr.on('data',chunk=>err.push(Buffer.from(chunk)));
    child.once('error',error=>finish(error));
    child.once('close',code=>{
      if(settled)return;
      const stdout=Buffer.concat(out),stderr=Buffer.concat(err).toString('utf8').trim();
      if(code!==0&&!allowFailure)return finish(new Error(`GIT_COMMAND_FAILED:${code}:${stderr.slice(0,500)}`));
      finish(null,{code,stdout,stderr});
    });
  });
}
function parseStatus(bytes){
  const fields=bytes.toString('utf8').split('\0').filter(Boolean);
  if(fields.length>MAX_STATUS_ENTRIES)throw new Error('GIT_STATUS_ENTRY_LIMIT');
  const pathStates=[];
  for(const field of fields){
    if(field.length<4)continue;
    const status=field.slice(0,2), file=field.slice(3).replace(/\\/g,'/').slice(0,1000);
    if(!file)continue;
    pathStates.push({path:file,status});
  }
  const unique=new Map(pathStates.map(item=>[item.path,item]));
  const bounded=[...unique.values()].sort((a,b)=>a.path.localeCompare(b.path)).slice(0,MAX_STATUS_ENTRIES);
  return {entryCount:bounded.length,pathStates:bounded,untrackedPaths:bounded.filter(item=>item.status==='??').map(item=>item.path)};
}
function noiseClass(file){
  const value=file.toLowerCase();
  if(/(^|\/)(node_modules|vendor|dist|build|coverage)\//.test(value))return 'generated-or-vendor';
  if(/(^|\/)(__tests__|tests?|specs?)\//.test(value)||/\.(test|spec)\.[^.]+$/.test(value))return 'test';
  if(/\.(map|min\.js|min\.css|lock)$/.test(value)||/(^|\/)(generated|gen)\//.test(value))return 'generated';
  return 'source';
}
async function pathEvidence(root,pathStates){
  const rows=[];
  for(const item of pathStates.slice(0,MAX_PATH_EVIDENCE)){
    const result=await git(root,['hash-object','--no-filters','--',item.path],{allowFailure:true});
    rows.push({path:item.path,status:item.status,contentHash:result.code===0?result.stdout.toString('utf8').trim():null,noiseClass:noiseClass(item.path)});
  }
  return rows;
}

export async function fingerprintWorkspace(repoRoot){
  const requestedRoot=normalizeRoot(repoRoot);
  if(isProtected(requestedRoot))throw new Error('WORKSPACE_FINGERPRINT_PROTECTED_PATH');
  try { await lstat(path.join(requestedRoot,'.git')); }
  catch { throw new Error('WORKSPACE_FINGERPRINT_REPO_ROOT_REQUIRED'); }
  const top=await git(requestedRoot,['rev-parse','--show-toplevel']);
  const resolvedRoot=normalizeRoot(top.stdout.toString('utf8').trim());
  if(resolvedRoot!==requestedRoot)throw new Error('WORKSPACE_FINGERPRINT_REPO_ROOT_REQUIRED');
  if(isProtected(resolvedRoot))throw new Error('WORKSPACE_FINGERPRINT_PROTECTED_PATH');
  const headResult=await git(resolvedRoot,['rev-parse','--verify','HEAD'],{allowFailure:true});
  const head=headResult.code===0?headResult.stdout.toString('utf8').trim():null;
  const status=await git(resolvedRoot,['status','--porcelain=v1','-z','--untracked-files=all','--no-renames']);
  const diff=await git(resolvedRoot,['diff','--no-ext-diff','--no-textconv','HEAD'],{allowFailure:head===null});
  const statusInfo=parseStatus(status.stdout);
  const paths=await pathEvidence(resolvedRoot,statusInfo.pathStates);
  const dimensions={
    head,
    statusDigest:sha256(status.stdout),
    statusBytes:status.stdout.length,
    statusEntryCount:statusInfo.entryCount,
    trackedDiffDigest:sha256(diff.stdout),
    trackedDiffBytes:diff.stdout.length,
    pathEvidenceDigest:sha256(stableBytes(paths)),
  };
  return {
    schemaVersion:1,kind:'workspace-session-fingerprint',resolvedRoot,...dimensions,
    fingerprint:sha256(stableBytes(dimensions)),
    pathEvidence:paths,
    untrackedPathEvidence:statusInfo.untrackedPaths,
    limitations:['path-content-is-hashed-not-emitted','fingerprint-change-does-not-establish-causality'],
    sourceMutated:false,
  };
}

export function compareWorkspaceFingerprints(before,after){
  if(!before||!after||before.schemaVersion!==1||after.schemaVersion!==1)throw new Error('WORKSPACE_FINGERPRINT_SCHEMA');
  if(normalizeRoot(before.resolvedRoot)!==normalizeRoot(after.resolvedRoot)){
    return {status:'not-comparable',reason:'different-repo-root',changedDimensions:[]};
  }
  const keys=['head','statusDigest','statusBytes','statusEntryCount','trackedDiffDigest','trackedDiffBytes','pathEvidenceDigest'];
  const changedDimensions=keys.filter(key=>before[key]!==after[key]);
  const beforePaths=new Map((before.pathEvidence??[]).map(item=>[item.path,item]));
  const afterPaths=new Map((after.pathEvidence??[]).map(item=>[item.path,item]));
  const preExisting=[...beforePaths.values()].sort((a,b)=>a.path.localeCompare(b.path));
  const introduced=[...afterPaths.values()].filter(item=>!beforePaths.has(item.path)).sort((a,b)=>a.path.localeCompare(b.path));
  const modifiedSinceBaseline=[...afterPaths.values()].filter(item=>{const prior=beforePaths.get(item.path);return prior&&(prior.status!==item.status||prior.contentHash!==item.contentHash);}).sort((a,b)=>a.path.localeCompare(b.path));
  const resolved=[...beforePaths.values()].filter(item=>!afterPaths.has(item.path)).sort((a,b)=>a.path.localeCompare(b.path));
  const untracked=[...afterPaths.values()].filter(item=>item.status==='??').sort((a,b)=>a.path.localeCompare(b.path));
  return {status:changedDimensions.length?'changed':'unchanged',changedDimensions,preExisting,introduced,modifiedSinceBaseline,resolved,untracked,limitations:['task-local-path-evidence-does-not-establish-causality']};
}
export async function fingerprintWorkspaces(roots){
  if(!Array.isArray(roots)||roots.length<1||roots.length>MAX_REPOS)throw new Error('WORKSPACE_FINGERPRINT_REPO_LIMIT');
  const reports=[];
  for(const root of roots)reports.push(await fingerprintWorkspace(root));
  return {
    schemaVersion:1,kind:'workspace-session-fingerprint-set',reports,
    aggregateFingerprint:sha256(stableBytes(reports.map(({resolvedRoot,fingerprint})=>({resolvedRoot,fingerprint})))),
    sourceMutated:false,
  };
}

function parseCli(argv){
  const repos=[];let output;let compare;
  for(let i=0;i<argv.length;i+=1){
    const key=argv[i];
    if(key==='--repo'){const value=argv[++i];if(!value)throw new Error('INVALID_ARGUMENT');repos.push(value);continue;}
    if(key==='--output'){const value=argv[++i];if(!value||output)throw new Error('INVALID_ARGUMENT');output=path.resolve(value);continue;}
    if(key==='--compare'){
      const a=argv[++i],b=argv[++i];if(!a||!b||compare)throw new Error('INVALID_ARGUMENT');compare=[path.resolve(a),path.resolve(b)];continue;
    }
    throw new Error('INVALID_ARGUMENT');
  }
  if(compare&&repos.length)throw new Error('COMPARE_REPO_CONFLICT');
  return {repos,output,compare};
}

async function main(){
  const {repos,output,compare}=parseCli(process.argv.slice(2));
  let result;
  if(compare){
    const [a,b]=await Promise.all(compare.map(async file=>JSON.parse((await readArtifact(file,4*1024*1024)).toString('utf8'))));
    result={schemaVersion:1,kind:'workspace-session-fingerprint-comparison',comparison:compareWorkspaceFingerprints(a,b),sourceMutated:false};
  }else result=await fingerprintWorkspaces(repos);
  const bytes=Buffer.from(JSON.stringify(result,null,2)+'\n','utf8');
  if(output)await writeExclusive(output,bytes);else process.stdout.write(bytes);
}

const isMain=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));
if(isMain)main().catch(failure);
