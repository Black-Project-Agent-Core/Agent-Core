import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';

type Environment=Record<string,string|undefined>;
const IDENTITY_FILES=['data/keys.json','data/oauth.json','logs/audit/audit-head.json','logs/audit/audit-anchor.json'];
function failure():Error{return Object.assign(new Error('PERSISTENCE_MANIFEST_INVALID: selected runtime storage is missing, invalid or redirected; refusing to start with an empty identity'),{code:'PERSISTENCE_MANIFEST_INVALID'});}
function canonical(value:string):string{return process.platform==='win32'?value.toLowerCase():value;}

/** Explicit recovery pointer; no copying, credential reading, or implicit migration. */
function resolve(env:Environment,baseDir:string,requireIdentity:boolean):{dataDir:string;logDir:string}{
  const root=path.resolve(baseDir);
  const defaults={dataDir:path.resolve(env.AGENT_CORE_DATA_DIR?.trim()||path.join(root,'data')),logDir:path.resolve(env.AGENT_CORE_LOG_DIR?.trim()||path.join(root,'logs'))};
  const manifest=path.join(root,'runtime','persistence.json');
  let text:string;
  try{text=readFileSync(manifest,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return defaults;throw failure();}
  try{
    if(text.length>4096||lstatSync(manifest).isSymbolicLink())throw failure();
    const m=JSON.parse(text.replace(/^\uFEFF/,'')) as {schemaVersion?:unknown;generation?:unknown};
    if(m.schemaVersion!==1||typeof m.generation!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(m.generation))throw failure();
    const generation=path.join(root,'runtime','persistence-'+m.generation);
    const realRuntime=realpathSync(path.join(root,'runtime'));
    if(canonical(realpathSync(generation))!==canonical(path.join(realRuntime,'persistence-'+m.generation)))throw failure();
    for(const dir of ['', 'data','logs','logs/audit']){const s=lstatSync(path.join(generation,dir));if(!s.isDirectory()||s.isSymbolicLink())throw failure();}
    // Recovery tolerates an identity file that is absent, never one that is redirected.
    for(const name of IDENTITY_FILES){
      let s;
      try{s=lstatSync(path.join(generation,name));}
      catch(error){if(!requireIdentity&&(error as NodeJS.ErrnoException).code==='ENOENT')continue;throw failure();}
      if(!s.isFile()||s.isSymbolicLink())throw failure();
    }
    function selected(kind:'data'|'logs',explicit:string|undefined,fallback:string):string{
      const legacy=[path.join(root,kind),path.join(root,'runtime',kind)].map(canonical);
      return !explicit?.trim()||legacy.includes(canonical(path.resolve(explicit.trim())))?path.join(generation,kind):fallback;
    }
    return {dataDir:selected('data',env.AGENT_CORE_DATA_DIR,defaults.dataDir),logDir:selected('logs',env.AGENT_CORE_LOG_DIR,defaults.logDir)};
  }catch{throw failure();}
}

/** Startup path: fails closed unless the selected generation still holds a complete identity snapshot. */
export function resolvePersistencePaths(env:Environment,baseDir:string):{dataDir:string;logDir:string}{return resolve(env,baseDir,true);}

/**
 * Repair path for identity CLI commands only. Applies every manifest, symlink and
 * redirection check, but tolerates missing credential files so `create-key` and
 * `reset-oauth` can rebuild the identity the startup guard refuses to invent.
 */
export function resolveRecoveryPersistencePaths(env:Environment,baseDir:string):{dataDir:string;logDir:string}{return resolve(env,baseDir,false);}
