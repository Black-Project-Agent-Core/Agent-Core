// Synthetic process fault injection only. No fault switches in production code.
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
const [root,id,boundary,operation='fixture-operation',count='1'] = process.argv.slice(2);
const {FileMemoryStore} = await import('../../dist/memory/store.js');
const {resolveMemoryPaths} = await import('../../dist/memory/paths.js');
const store = new FileMemoryStore(resolveMemoryPaths(root,root));
await store.initialize();
const pause = async point => {process.stdout.write(JSON.stringify({boundary:point})+'\n');setInterval(()=>{},1000);await new Promise(()=>{});};
const rename = fs.rename, remove = fs.rm;
let committed = false, cleanupFailed = false;
fs.rename = async (from,to) => {
 await rename(from,to);
 if (String(to).endsWith('journal.json')) {
   const journal=JSON.parse(await fs.readFile(to,'utf8'));
   if(journal.phase==='committed') committed=true;
   if(journal.phase===boundary) await pause(boundary);
 }
 if(boundary==='apply' && String(to)===path.join(root,'notes',`${id}.md`)) await pause('apply');
};
fs.rm = async (target,options) => {
 if(boundary==='cleanup' && committed && !cleanupFailed && String(target).includes('/transactions/') && options?.recursive) {
   cleanupFailed=true; throw Object.assign(new Error('synthetic cleanup failure'),{code:'EACCES'});
 }
 return remove(target,options);
};
syncBuiltinESMExports();
for(let i=0;i<Number(count);i++) {
 const key=`operations/${createHash('sha256').update(`${operation}-${i}`).digest('hex')}.json`;
 const result=await store.transact([key],snapshot=>{
   const prior=snapshot.state.get(key)?.content;
   if(prior) return {records:snapshot.records,touchedIds:[],stateWrites:[],result:JSON.parse(prior)};
   const next=snapshot.records.map(record=>record.id===id?{...record,title:String(Number(record.title)+1)}:record);
   const receipt={committed:true,operation:`${operation}-${i}`,value:next.find(r=>r.id===id).title};
   return {records:next,touchedIds:[id],stateWrites:[{key,content:JSON.stringify(receipt)}],result:receipt};
 });
 if(boundary==='response') await pause('response');
 process.stdout.write(JSON.stringify({result:result.result,cleanupFailed})+'\n');
}
