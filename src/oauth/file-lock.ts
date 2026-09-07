import {mkdir,realpath,open} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';

/** SQLite is only an OS-released mutex here: no tables, tokens or memory data. */
export async function withOAuthProcessLock<T>(filePath:string, operation:()=>Promise<T>, timeoutMs=5000):Promise<T>{
  await mkdir(path.dirname(filePath),{recursive:true});
  const parent=await realpath(path.dirname(filePath));
  const lockPath=path.join(parent,'.oauth-lock.sqlite');
  const seed=await open(lockPath,'a',0o600);await seed.close();
  const db=new DatabaseSync(lockPath,{timeout:0});
  const deadline=performance.now()+timeoutMs;
  try{
    while(true){
      try{db.exec('BEGIN IMMEDIATE');break;}
      catch(error){
        const code=(error as {errcode?:number}).errcode;
        if(code===undefined||![5,6].includes(code&255))throw error;
        if(performance.now()>=deadline)throw Object.assign(new Error('OAuth store is busy in another process'),{code:'OAUTH_STORE_BUSY'});
        await delay(10);
      }
    }
    return await operation();
  }finally{
    try{if(db.isTransaction)db.exec('ROLLBACK');}finally{db.close();}
  }
}
