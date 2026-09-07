import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {loadConfig} from '../src/config.js';
const roots:string[]=[];
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-selection-'));roots.push(root);await mkdir(path.join(root,'runtime'),{recursive:true});return root;}
async function selected(root:string){const base=path.join(root,'runtime','persistence-test');await mkdir(path.join(base,'data'),{recursive:true});await mkdir(path.join(base,'logs','audit'),{recursive:true});for(const name of ['data/keys.json','data/oauth.json','logs/audit/audit-head.json','logs/audit/audit-anchor.json'])await writeFile(path.join(base,name),'{}');await writeFile(path.join(root,'runtime','persistence.json'),JSON.stringify({schemaVersion:1,generation:'test'}));return base;}
afterEach(async()=>{for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
describe('Persistence selection after portable migration',()=>{
 it('preserves legacy defaults without a manifest',async()=>{const root=await fixture();const c=loadConfig({},root);expect(c.dataDir).toBe(path.join(root,'data'));expect(c.logDir).toBe(path.join(root,'logs'));});
 it('selects a verified generation for direct starts',async()=>{const root=await fixture();const base=await selected(root);const c=loadConfig({},root);expect(c.dataDir).toBe(path.join(base,'data'));expect(c.logDir).toBe(path.join(base,'logs'));});
 it('redirects legacy launcher environment paths to the active generation',async()=>{const root=await fixture();const base=await selected(root);const c=loadConfig({AGENT_CORE_DATA_DIR:path.join(root,'runtime','data'),AGENT_CORE_LOG_DIR:path.join(root,'runtime','logs')},root);expect(c.dataDir).toBe(path.join(base,'data'));expect(c.logDir).toBe(path.join(base,'logs'));});
 it('preserves explicit separate shadow directories',async()=>{const root=await fixture();await selected(root);const data=path.join(root,'shadow','data'),logs=path.join(root,'shadow','logs');const c=loadConfig({AGENT_CORE_DATA_DIR:data,AGENT_CORE_LOG_DIR:logs},root);expect(c.dataDir).toBe(data);expect(c.logDir).toBe(logs);});
 it('fails closed instead of starting empty on malformed selection',async()=>{const root=await fixture();await writeFile(path.join(root,'runtime','persistence.json'),'{invalid');expect(()=>loadConfig({},root)).toThrow(/PERSISTENCE_/);});
 it('fails closed when a selected generation is absent',async()=>{const root=await fixture();await writeFile(path.join(root,'runtime','persistence.json'),JSON.stringify({schemaVersion:1,generation:'missing'}));expect(()=>loadConfig({},root)).toThrow(/PERSISTENCE_/);});
 it('rejects escaping generations',async()=>{const root=await fixture();await writeFile(path.join(root,'runtime','persistence.json'),JSON.stringify({schemaVersion:1,generation:'../outside'}));expect(()=>loadConfig({},root)).toThrow(/PERSISTENCE_/);});
 it('rejects incomplete credential snapshots instead of making a new identity',async()=>{const root=await fixture();const base=await selected(root);await rm(path.join(base,'data','keys.json'));expect(()=>loadConfig({},root)).toThrow(/PERSISTENCE_/);});
});
