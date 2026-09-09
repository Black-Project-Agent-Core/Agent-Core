import {randomUUID} from 'node:crypto';
import {mkdir,open,readFile,realpath,rename,rm,stat} from 'node:fs/promises';
import {hostname} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

interface LockOwner{pid:number;ownerToken:string;hostname:string;acquiredAt:string}

/** ponytail: no heartbeat renewal, so an owner still running past this is treated as crashed. Add renewal only if an OAuth operation can legitimately outlive it. */
const STALE_MS=30_000;
const RETRY_CAP_MS=20;

function busy():Error{return Object.assign(new Error('OAuth store is busy in another process'),{code:'OAUTH_STORE_BUSY'});}

/** Contention, not failure: Windows reports a lock still finishing its delete as EPERM/EACCES/EBUSY rather than EEXIST. */
function contended(error:unknown):boolean{
  const code=(error as NodeJS.ErrnoException).code;
  return code==='EEXIST'||code==='EPERM'||code==='EACCES'||code==='EBUSY';
}

function parseOwner(raw:string):LockOwner|null{
  let parsed:Partial<LockOwner>;
  try{parsed=JSON.parse(raw) as Partial<LockOwner>;}catch{return null;}
  return typeof parsed?.ownerToken==='string'&&typeof parsed.pid==='number'&&typeof parsed.hostname==='string'&&Number.isFinite(Date.parse(parsed.acquiredAt??''))?parsed as LockOwner:null;
}

async function readOwner(lockPath:string):Promise<LockOwner|null>{
  try{return parseOwner(await readFile(lockPath,'utf8'));}catch{return null;}
}

function ownerIsGone(owner:LockOwner):boolean{
  if(Date.now()-Date.parse(owner.acquiredAt)>=STALE_MS)return true;
  if(owner.hostname!==hostname())return false; // a foreign pid tells us nothing; wait out the stale window
  try{process.kill(owner.pid,0);return false;}catch(error){return (error as NodeJS.ErrnoException).code==='ESRCH';}
}

/**
 * True only for a lock file that exists and whose owner is dead. A lock that has just disappeared is
 * NOT stealable: retrying the exclusive create is the only way to stay exclusive against whoever takes
 * it next. An unreadable record is an owner between create and write until it ages past the stale window.
 */
async function abandoned(lockPath:string):Promise<boolean>{
  let raw:string;
  try{raw=await readFile(lockPath,'utf8');}catch{return false;}
  const owner=parseOwner(raw);
  if(owner)return ownerIsGone(owner);
  try{return Date.now()-(await stat(lockPath)).mtimeMs>=STALE_MS;}catch{return false;}
}

/** No fsync: a lock means nothing across a reboot, and stale detection covers the survivors. */
async function write(target:string,serialized:string):Promise<void>{
  const handle=await open(target,'wx',0o600);
  try{await handle.writeFile(serialized,'utf8');}finally{await handle.close();}
}

/** Exclusive create, else an atomic steal from a dead owner. True only means our write landed; the caller still confirms the token. */
async function claim(lockPath:string,record:LockOwner):Promise<boolean>{
  const serialized=JSON.stringify(record);
  try{await write(lockPath,serialized);return true;}
  catch(error){
    if(!contended(error))throw error;
    if((error as NodeJS.ErrnoException).code!=='EEXIST')return false; // still being released; nothing to reap yet
  }
  const temporary=`${lockPath}.${process.pid}.${randomUUID()}.tmp`;
  try{
    await write(temporary,serialized); // staged first so the death check and the rename stay adjacent
    if(!await abandoned(lockPath))return false;
    await rename(temporary,lockPath);
    return true;
  }
  catch(error){if(!contended(error))throw error;return false;} // another reaper won the rename race
  finally{await rm(temporary,{force:true}).catch(()=>undefined);}
}

async function acquire(lockPath:string,timeoutMs:number):Promise<string>{
  const deadline=Date.now()+timeoutMs;
  for(let wait=1;;wait=Math.min(wait*2,RETRY_CAP_MS)){
    const record:LockOwner={pid:process.pid,ownerToken:randomUUID(),hostname:hostname(),acquiredAt:new Date().toISOString()};
    // Only the token on disk decides: two reapers can both steal one dead owner, and the later rename wins.
    if(await claim(lockPath,record)&&(await readOwner(lockPath))?.ownerToken===record.ownerToken)return record.ownerToken;
    if(Date.now()>=deadline)throw busy();
    await delay(wait*(1+Math.random())); // jitter so simultaneous waiters de-synchronise
  }
}

/** Cross-process mutex over an atomic lock file: owner token + pid liveness, no database. */
export async function withOAuthProcessLock<T>(filePath:string, operation:()=>Promise<T>, timeoutMs=5000):Promise<T>{
  await mkdir(path.dirname(filePath),{recursive:true});
  const lockPath=path.join(await realpath(path.dirname(filePath)),'.oauth.lock');
  const ownerToken=await acquire(lockPath,timeoutMs);
  try{return await operation();}
  finally{if((await readOwner(lockPath))?.ownerToken===ownerToken)await rm(lockPath,{force:true}).catch(()=>undefined);}
}
