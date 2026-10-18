// Explicit offline fixture runner; never reads canonical Memory or calls a model.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const DESTINATION=path.join(ROOT,'runtime','tmp');
function options(argv){
 const allowed=new Set(['--suite','--output']),values={};
 if(argv.length!==4)throw Error('OFFLINE_RECONSOLIDATION_ARGUMENTS_REQUIRED');
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  if(!allowed.has(key)||!value||value.startsWith('--')||values[key])throw Error('OFFLINE_RECONSOLIDATION_ARGUMENTS_INVALID');
  values[key]=path.resolve(value);
 }
 if(!values['--suite']||!values['--output'])throw Error('OFFLINE_RECONSOLIDATION_PATH_INVALID');
 const relative=path.relative(DESTINATION,values['--output']);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('OFFLINE_RECONSOLIDATION_OUTPUT_SCOPE');
 return {suite:values['--suite'],output:values['--output']};
}
export async function runOfflineReconsolidation(argv){
 const {suite,output}=options(argv);
 const stat=await fs.lstat(suite);if(!stat.isFile()||stat.isSymbolicLink())throw Error('OFFLINE_RECONSOLIDATION_INPUT_INVALID');
 const bytes=await fs.readFile(suite);
 if(bytes.byteLength>8*1024*1024)throw Error('OFFLINE_RECONSOLIDATION_SUITE_TOO_LARGE');
 const api=await import(pathToFileURL(path.join(ROOT,'dist/memory/reconsolidation-report.js')).href);
 const result=api.runReconsolidationExperiment(bytes);
 const verification=api.verifyReconsolidationExperiment(bytes,result);
 if(verification.verdict!=='pass')throw Error('OFFLINE_RECONSOLIDATION_VERIFICATION_FAILED');
 await fs.mkdir(path.dirname(output),{recursive:true});
 await fs.writeFile(output,JSON.stringify({mode:'scripted-offline',verification,result},null,2)+'\n',{flag:'wx',mode:0o600});
 return {mode:'scripted-offline',verdict:verification.verdict,benefitProven:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await runOfflineReconsolidation(process.argv.slice(2))));}
 catch(error){console.error(JSON.stringify({status:'BLOCKED',reason:error instanceof Error?error.message:'unavailable'}));process.exitCode=2;}
}
