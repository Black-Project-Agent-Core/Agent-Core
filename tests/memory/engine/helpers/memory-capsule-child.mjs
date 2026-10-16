// Synthetic T4 fault injector. The production transaction owner is unchanged.
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
const [root,boundary,encoded,controllerId='controller-child']=process.argv.slice(2);
const input=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
const {MemoryService}=await import('../../../../dist/memory/facade.js');
const service=await MemoryService.initialize(root,root),controller=service.controller({workspaceKey:'agent-core',taskId:'task-race',controllerId});
const pause=async point=>{process.stdout.write(JSON.stringify({boundary:point})+'\n');setInterval(()=>{},1000);await new Promise(()=>{});};
const rename=fs.rename;fs.rename=async(from,to)=>{await rename(from,to);if(String(to).endsWith('journal.json')){const journal=JSON.parse(await fs.readFile(to,'utf8'));if(journal.phase===boundary)await pause(boundary);}if(boundary==='apply'&&String(to).includes('/capsules/'))await pause('apply');};syncBuiltinESMExports();
try{const result=await controller.checkpoint(input);if(boundary==='response')await pause('response');process.stdout.write(JSON.stringify({result})+'\n');}catch(error){process.stdout.write(JSON.stringify({error:error.code??error.message})+'\n');}
