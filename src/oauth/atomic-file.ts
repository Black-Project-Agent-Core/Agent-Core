import {randomUUID} from 'node:crypto';
import {mkdir,open,rename,rm} from 'node:fs/promises';
import path from 'node:path';

/** Never replace a failed atomic rename with an in-place credential overwrite. */
export async function persistOAuthSnapshot(destination:string,serialized:string):Promise<void>{
  await mkdir(path.dirname(destination),{recursive:true});
  const temporary=destination+'.'+process.pid+'.'+randomUUID()+'.tmp';
  try{
    const handle=await open(temporary,'wx',0o600);
    try{await handle.writeFile(serialized,'utf8');await handle.sync();}finally{await handle.close();}
    await rename(temporary,destination);
  }finally{
    await rm(temporary,{force:true}).catch(()=>undefined);
  }
}
