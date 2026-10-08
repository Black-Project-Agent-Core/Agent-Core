import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const marker=path.join(root,'runtime','memory-v2-activation.json');
const source=path.join(root,'runtime','memory-v2');
const destination=path.join(root,'runtime','backups','memory-v2-rollback-'+Date.now()+'-'+randomUUID().slice(0,8));
const sha=b=>createHash('sha256').update(b).digest('hex');
const port=Number(process.env.AGENT_CORE_PORT||8765);
const open=await new Promise(resolve=>{const c=net.createConnection({host:'127.0.0.1',port});
const finish=x=>{c.destroy();resolve(x)};c.once('connect',()=>finish(true));c.once('error',()=>finish(false));c.setTimeout(1500,()=>finish(false));});
if(open)throw Error('STOP_AGENT_CORE_BEFORE_ROLLBACK');
const control=JSON.parse(await fs.readFile(marker,'utf8'));
if(control.mode!=='experience-v2'||control.root!=='runtime/memory-v2')throw Error('UNKNOWN_ACTIVATION_MARKER');
const {withMemoryProcessLock}=await import(pathToFileURL(path.join(root,'SubProject','agent-core-memory','dist','memory','lock.js')).href);
await fs.mkdir(destination,{recursive:false});
const inventory=[];
async function walk(folder,prefix=''){for(const ent of await fs.readdir(folder,{withFileTypes:true})){
const rel=prefix?prefix+'/'+ent.name:ent.name;
if(rel==='.memory.lock'||rel==='.memory.lock.target')continue;
const src=path.join(folder,ent.name),st=await fs.lstat(src);
if(st.isSymbolicLink()||(!st.isDirectory()&&!st.isFile()))throw Error('UNSAFE_ROOT_ITEM');
if(st.isDirectory()){await walk(src,rel);continue;}
const bytes=await fs.readFile(src),out=path.join(destination,'memory',...rel.split('/'));
await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,bytes,{flag:'wx',mode:0o600});
if(sha(await fs.readFile(out))!==sha(bytes))throw Error('BACKUP_VERIFY_FAILED');
inventory.push({path:rel,bytes:bytes.length,sha256:sha(bytes)});
}}
await withMemoryProcessLock(path.join(source,'.memory.lock'),()=>walk(source),30000);
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({root:'runtime/memory-v2',files:inventory,count:inventory.length,createdAt:new Date().toISOString()},null,2)+'\n',{flag:'wx',mode:0o600});
await fs.rename(marker,path.join(destination,'deactivated-memory-v2-activation.json'));
console.log(JSON.stringify({rolledBackToLegacyOnNextManualRestart:true,oldRootPreserved:true,newV2RootPreserved:true,
backup:destination,files:inventory.length,manualRestartRequired:true}));
