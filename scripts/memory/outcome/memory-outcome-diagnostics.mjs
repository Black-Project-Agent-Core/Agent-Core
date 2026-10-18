// Offline diagnostics sidecar evaluation only. Never enables the blocked live CLI.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const OUT=path.join(ROOT,'runtime','tmp');
function parse(argv){
 const allowed=new Set(['--suite','--sidecar','--observations','--evidence-root','--phase','--output']);
 if(argv.length!==12)throw Error('OFFLINE_DIAGNOSTICS_ARGUMENTS_REQUIRED');
 const args={};
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  if(!allowed.has(key)||!value||value.startsWith('--')||args[key])throw Error('OFFLINE_DIAGNOSTICS_ARGUMENTS_INVALID');
  args[key]=key==='--phase'?value:path.resolve(value);
 }
 if(!['baseline','compare'].includes(args['--phase']))throw Error('OFFLINE_DIAGNOSTICS_PHASE_INVALID');
 const relative=path.relative(OUT,args['--output']);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('OFFLINE_DIAGNOSTICS_OUTPUT_SCOPE');
 return args;
}
async function regular(file){
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('OFFLINE_DIAGNOSTICS_INPUT_INVALID');
 return JSON.parse(await fs.readFile(file,'utf8'));
}
async function evidenceFiles(directory){
 const base=path.join(directory,'evidence','diagnostics'),result=new Map();
 async function walk(dir){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   if(entry.isSymbolicLink())throw Error('OFFLINE_DIAGNOSTICS_SYMLINK_REFUSED');
   const file=path.join(dir,entry.name);
   if(entry.isDirectory())await walk(file);
   else if(entry.isFile()&&entry.name.endsWith('.json')){
    const rel=path.relative(directory,file).replaceAll(path.sep,'/');
    if(!/^evidence\/diagnostics\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.json$/.test(rel))
      throw Error('OFFLINE_DIAGNOSTICS_PATH_INVALID');
    result.set(rel,await fs.readFile(file));
   }else throw Error('OFFLINE_DIAGNOSTICS_MEMBER_INVALID');
  }
 }
 await walk(base);return result;
}
export async function evaluateOfflineDiagnostics(argv){
 const opts=parse(argv);
 const api=await Promise.all(['contract','diagnostics'].map(file=>
   import(pathToFileURL(path.join(ROOT,'dist/memory/outcome',file+'.js')).href)));
 const suite=api[0].parseOutcomeSuite(await regular(opts['--suite']));
 const sidecar=api[1].parseOutcomeDiagnostics(await regular(opts['--sidecar']),suite);
 const rows=(await regular(opts['--observations'])).map(row=>api[1].diagnosticObservationSchema.parse(row));
 const evidence=await evidenceFiles(opts['--evidence-root']);
 const report=await api[1].evaluateDiagnosticsReport(suite,sidecar,rows,evidence,opts['--phase']);
 await fs.mkdir(path.dirname(opts['--output']),{recursive:true});
 await fs.writeFile(opts['--output'],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 return {mode:'scripted-offline',complete:report.complete,integrityStatus:report.integrityStatus,benefitProven:false,live:'NOT RUN'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await evaluateOfflineDiagnostics(process.argv.slice(2))));}
 catch(error){console.error(JSON.stringify({status:'BLOCKED',reason:error instanceof Error?error.message:'unavailable'}));process.exitCode=2;}
}
