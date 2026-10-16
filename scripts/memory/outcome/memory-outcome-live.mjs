// Deliberately fail closed. Live provider authorization and session injection are not
// available to this offline entrypoint; an approval-reference string is not consent.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function parseLiveArguments(argv){
 const allowed=new Set(['--suite','--approval-ref','--output']),values={};
 for(let index=0;index<argv.length;index+=2){const key=argv[index],value=argv[index+1];if(!allowed.has(key))throw Error('UNKNOWN_OPTION');if(!value||value.startsWith('--')||Object.hasOwn(values,key))throw Error('INVALID_OR_DUPLICATE_OPTION');values[key]=value;}
 if([...allowed].some(key=>!values[key]))throw Error('MISSING_REQUIRED_OPTION');
 return {suitePath:path.resolve(values['--suite']),approvalRef:values['--approval-ref'],output:path.resolve(values['--output'])};
}
export function validateLivePair(expected,observed){
 const reasons=[];
 for(const [key,reason] of [['provider','PROVIDER_DRIFT'],['model','MODEL_DRIFT'],['settingsDigest','SETTINGS_DRIFT'],['toolsDigest','TOOLS_DRIFT']]){
  if(!expected?.[key]||expected[key]!==observed?.[key])reasons.push(reason);
 }
 return reasons;
}
export async function runLiveOutcome(_options){
 throw new Error('LIVE_AUTHORIZATION_UNVERIFIED:provider,data,cost,time approval and trusted controller-session injection required; zero requests issued');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await runLiveOutcome(parseLiveArguments(process.argv.slice(2)));}catch(error){console.error(JSON.stringify({status:'BLOCKED',inferenceCalls:0,reason:error.message}));process.exitCode=2;}
}
