// Synthetic T5 fault injector; production transaction paths have no test hooks.
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
const [root,boundary,encoded,controllerId='promotion-child']=process.argv.slice(2);
const input=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
const {MemoryService}=await import('../../../../dist/memory/facade.js');
const service=await MemoryService.initialize(root,root,undefined,{consolidation:{review:async plan=>({digest:plan.digest,reviewer:'synthetic-process-host',reason:'Reviewed synthetic fixture'})}});
const controller=service.controller({workspaceKey:'agent-core',taskId:'task-promotion',controllerId});
const pause=async point=>{process.stdout.write(JSON.stringify({boundary:point})+'\n');setInterval(()=>{},1000);await new Promise(()=>{});};
const rename=fs.rename;fs.rename=async(from,to)=>{await rename(from,to);if(String(to).replaceAll('\\','/').endsWith('journal.json')){const journal=JSON.parse(await fs.readFile(to,'utf8'));if(journal.phase===boundary)await pause(boundary);}if(boundary==='canonical'&&String(to).replaceAll('\\','/').includes('/notes/'))await pause(boundary);if(boundary==='episode'&&String(to).replaceAll('\\','/').includes('/episodes/')&&String(to).replaceAll('\\','/').endsWith('/manifest.json'))await pause(boundary);};syncBuiltinESMExports();
try{const result=await controller.applyConsolidation(input);if(boundary==='response')await pause(boundary);process.stdout.write(JSON.stringify({result})+'\n');}catch(error){process.stdout.write(JSON.stringify({error:error.code??error.message})+'\n');}
