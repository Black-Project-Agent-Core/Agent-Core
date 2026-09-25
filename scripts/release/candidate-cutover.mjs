import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHA=/^[a-f0-9]{64}$/;
const PROTECTED='do not touch without instruction explicit';
const shaBytes=value=>createHash('sha256').update(value).digest('hex');
const comparable=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
const inside=(child,parent)=>{const c=comparable(child),p=comparable(parent);return c===p||c.startsWith(p.endsWith(path.sep)?p:p+path.sep);};
const protectedPath=value=>comparable(value).split(/[\\/]+/).includes(PROTECTED);
function relativeArtifact(value){
  if(typeof value!=='string'||!value.trim())throw new Error('CUTOVER_ARTIFACT_PATH_REQUIRED');
  const normalized=value.replace(/\\/g,'/').replace(/^\.\//,'');
  if(path.posix.isAbsolute(normalized)||normalized.split('/').includes('..')||protectedPath(normalized))throw new Error('CUTOVER_ARTIFACT_PATH_UNSAFE');
  return normalized;
}
function identity(stats){return [String(stats.dev),String(stats.ino),String(stats.size),String(stats.mtimeNs),String(stats.ctimeNs)].join(':');}
async function hashHandle(handle){
  const before=await handle.stat({bigint:true});if(!before.isFile())throw new Error('CUTOVER_NOT_REGULAR_FILE');
  const hash=createHash('sha256');
  for await(const chunk of createReadStream('',{fd:handle.fd,autoClose:false}))hash.update(chunk);
  const after=await handle.stat({bigint:true});
  if(identity(before)!==identity(after))throw new Error('CUTOVER_FILE_CHANGED_DURING_HASH');
  return {sha256:hash.digest('hex'),identity:identity(after),bytes:Number(after.size)};
}
async function inspectFile(root,relative,{allowAbsent=false}={}){
  const base=await fs.realpath(root),target=path.resolve(base,relativeArtifact(relative));
  if(!inside(target,base)||protectedPath(target))throw new Error('CUTOVER_PATH_OUTSIDE_ROOT');
  const parent=await fs.realpath(path.dirname(target));
  if(!inside(parent,base)||protectedPath(parent))throw new Error('CUTOVER_PARENT_OUTSIDE_ROOT');
  let stat;
  try{stat=await fs.lstat(target,{bigint:true});}catch(error){
    if(allowAbsent&&error?.code==='ENOENT')return {exists:false,target,parent};
    throw error;
  }
  if(stat.isSymbolicLink())throw new Error('CUTOVER_SYMLINK_REFUSED');
  if(!stat.isFile())throw new Error('CUTOVER_NOT_REGULAR_FILE');
  const handle=await fs.open(target,'r');
  try{return {exists:true,target,parent,...await hashHandle(handle)};}finally{await handle.close();}
}
function validateManifest(value){
  if(!value||value.schemaVersion!==1||typeof value.qualificationId!=='string'||!value.qualificationId.trim())throw new Error('CUTOVER_MANIFEST_INVALID');
  if(!Array.isArray(value.artifacts)||value.artifacts.length<1||value.artifacts.length>128)throw new Error('CUTOVER_ARTIFACT_LIMIT');
  const seen=new Set();
  const artifacts=value.artifacts.map(item=>{
    const artifactPath=relativeArtifact(item?.path);
    if(seen.has(artifactPath))throw new Error('CUTOVER_DUPLICATE_ARTIFACT');seen.add(artifactPath);
    if(!SHA.test(item?.candidateSha256??''))throw new Error('CUTOVER_CANDIDATE_HASH_INVALID');
    const expected=item?.expectedActive;
    if(!expected||!['sha256','absent'].includes(expected.kind))throw new Error('CUTOVER_EXPECTED_ACTIVE_INVALID');
    if(expected.kind==='sha256'&&!SHA.test(expected.sha256??''))throw new Error('CUTOVER_EXPECTED_ACTIVE_HASH_INVALID');
    return {path:artifactPath,candidateSha256:item.candidateSha256,expectedActive:expected.kind==='absent'?{kind:'absent'}:{kind:'sha256',sha256:expected.sha256}};
  });
  return {schemaVersion:1,qualificationId:value.qualificationId,artifacts};
}
async function preflight(manifest,activeRoot,candidateRoot){
  const rows=[];
  for(const artifact of manifest.artifacts){
    const candidate=await inspectFile(candidateRoot,artifact.path);
    if(candidate.sha256!==artifact.candidateSha256)throw new Error('CUTOVER_CANDIDATE_HASH_MISMATCH:'+artifact.path);
    const active=await inspectFile(activeRoot,artifact.path,{allowAbsent:true});
    if(artifact.expectedActive.kind==='absent'){
      if(active.exists)throw new Error('CUTOVER_EXPECTED_ABSENT_COLLISION:'+artifact.path);
    }else if(!active.exists||active.sha256!==artifact.expectedActive.sha256){
      throw new Error('CUTOVER_STALE_ACTIVE:'+artifact.path);
    }
    rows.push({artifact,candidate,active});
  }
  return rows;
}
async function copyAndSync(source,target){
  await fs.copyFile(source,target);
  const handle=await fs.open(target,'r+');
  try{await handle.sync();}finally{await handle.close();}
  try{const dir=await fs.open(path.dirname(target),'r');try{await dir.sync();}finally{await dir.close();}}catch{}
}
async function verifyExpected(row,activeRoot){
  const current=await inspectFile(activeRoot,row.artifact.path,{allowAbsent:true});
  if(row.artifact.expectedActive.kind==='absent')return !current.exists;
  return Boolean(current.exists&&current.sha256===row.artifact.expectedActive.sha256);
}
export async function cutoverCandidate(input,options={}){
  const manifest=validateManifest(input);
  const activeRoot=path.resolve(options.activeRoot??'');
  const candidateRoot=path.resolve(options.candidateRoot??'');
  const backupRoot=path.resolve(options.backupRoot??'');
  if(!options.activeRoot||!options.candidateRoot||!options.backupRoot)throw new Error('CUTOVER_ROOTS_REQUIRED');
  if(protectedPath(activeRoot)||protectedPath(candidateRoot)||protectedPath(backupRoot))throw new Error('CUTOVER_PROTECTED_PATH');
  const first=await preflight(manifest,activeRoot,candidateRoot);
  if(options.beforeCommit)await options.beforeCommit();
  const second=await preflight(manifest,activeRoot,candidateRoot);
  if(first.some((row,index)=>row.active.exists!==second[index].active.exists||row.active.sha256!==second[index].active.sha256)){
    throw new Error('CUTOVER_ACTIVE_CHANGED_AFTER_QUALIFICATION');
  }
  await fs.mkdir(path.dirname(backupRoot),{recursive:true});
  await fs.mkdir(backupRoot);
  const changed=[];
  try{
    for(const row of second){
      const backupPath=path.join(backupRoot,row.artifact.path);
      if(row.active.exists){await fs.mkdir(path.dirname(backupPath),{recursive:true});await copyAndSync(row.active.target,backupPath);}
      await copyAndSync(row.candidate.target,row.active.target);
      const installed=await inspectFile(activeRoot,row.artifact.path);
      if(installed.sha256!==row.artifact.candidateSha256)throw new Error('CUTOVER_READBACK_HASH_MISMATCH:'+row.artifact.path);
      changed.push({row,backupPath,installed});
      if(options.afterWrite)await options.afterWrite(row.artifact.path,changed.length);
    }
  }catch(error){
    let rollbackVerified=true;
    for(const item of [...changed].reverse()){
      try{
        if(item.row.artifact.expectedActive.kind==='absent')await fs.rm(item.row.active.target,{force:true});
        else await copyAndSync(item.backupPath,item.row.active.target);
        if(!await verifyExpected(item.row,activeRoot))rollbackVerified=false;
      }catch{rollbackVerified=false;}
    }
    const wrapped=new Error((error instanceof Error?error.message:String(error))+'; rollbackVerified='+rollbackVerified);
    wrapped.cause=error;throw wrapped;
  }
  return {
    schemaVersion:1,kind:'candidate-cutover-result',qualificationId:manifest.qualificationId,
    activeRoot,artifactCount:changed.length,installed:changed.map(item=>({path:item.row.artifact.path,sha256:item.installed.sha256})),
    expectedActiveVerified:true,rollbackRequired:false,restartPerformed:false,releaseApplied:false,
  };
}
function parseArgs(argv){
  const out={apply:false};
  for(let i=0;i<argv.length;i+=1){
    const key=argv[i];if(key==='--apply'){out.apply=true;continue;}
    const value=argv[++i];if(!value)throw new Error('CUTOVER_INVALID_ARGUMENT');
    if(key==='--manifest')out.manifest=path.resolve(value);
    else if(key==='--active-root')out.activeRoot=path.resolve(value);
    else if(key==='--backup-root')out.backupRoot=path.resolve(value);
    else if(key==='--result')out.result=path.resolve(value);
    else throw new Error('CUTOVER_INVALID_ARGUMENT');
  }
  if(!out.apply)throw new Error('CUTOVER_APPLY_REQUIRED');
  for(const key of ['manifest','activeRoot','backupRoot','result'])if(!out[key])throw new Error('CUTOVER_INVALID_ARGUMENT');
  return out;
}
async function writeResultExclusive(file,value){
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
  const handle=await fs.open(file,'wx',0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  return shaBytes(bytes);
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  const manifestBytes=await fs.readFile(args.manifest);
  const raw=JSON.parse(manifestBytes.toString('utf8'));
  const candidateRoot=path.resolve(path.dirname(args.manifest),raw.candidateRoot??'.');
  const result=await cutoverCandidate(raw,{activeRoot:args.activeRoot,candidateRoot,backupRoot:args.backupRoot});
  const qualificationManifestSha256=shaBytes(manifestBytes);
  const installation={...result,qualificationManifestSha256,installedAt:new Date().toISOString()};
  const resultSha256=await writeResultExclusive(args.result,installation);
  process.stdout.write(JSON.stringify({ok:true,result:args.result,resultSha256,restartPerformed:false,releaseApplied:false})+'\n');
}
const isMain=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));
if(isMain)main().catch(error=>{process.stderr.write(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)})+'\n');process.exitCode=1;});
