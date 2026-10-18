import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

async function fixture(run){const root=await mkdtemp(path.join(os.tmpdir(),'rea-launcher-'));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}
async function runtime(root,version='6.5.0'){
 const dir=path.join(root,'tooling/rea');await mkdir(path.join(dir,'node_modules/rea-agents/scripts'),{recursive:true});
 await writeFile(path.join(dir,'package.json'),JSON.stringify({dependencies:{'rea-agents':'6.5.0'}}));
 await writeFile(path.join(dir,'node_modules/rea-agents/package.json'),JSON.stringify({version,type:'module'}));
 await writeFile(path.join(dir,'node_modules/rea-agents/scripts/rea.mjs'),'process.stdout.write(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));');
}
async function launcher(root){await mkdir(path.join(root,'scripts'),{recursive:true});await copyFile(new URL('./rea.mjs',import.meta.url),path.join(root,'scripts/rea.mjs'));return path.join(root,'scripts/rea.mjs');}
function run(file,cwd,extra={}){return spawnSync(process.execPath,[file,'inspect-managed-artifact','space and $literal.dll','--format','json'],{cwd,encoding:'utf8',windowsHide:true,env:{...process.env,AGENT_CORE_REA_SKILL_ROOT:'',...extra}});}
test('local pinned runtime preserves selected workspace and literal arguments',()=>fixture(async root=>{
 await runtime(root);const result=run(await launcher(root),root);assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{cwd:root,args:['inspect-managed-artifact','space and $literal.dll','--format','json']});
}));
test('catalog copy reuses an explicitly linked pinned skill runtime without copying dependencies',()=>fixture(async root=>{
 const owner=path.join(root,'owner'),catalog=path.join(root,'catalog');await runtime(owner);const file=await launcher(catalog);
 const result=run(file,root,{AGENT_CORE_REA_SKILL_ROOT:owner});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).cwd,root);
}));
test('an explicit mismatched runtime fails closed rather than silently selecting another installation',()=>fixture(async root=>{
 const owner=path.join(root,'mismatch');await runtime(owner,'0.0.0');await runtime(root);const result=run(await launcher(root),root,{AGENT_CORE_REA_SKILL_ROOT:owner});
 assert.notEqual(result.status,0);assert.match(result.stderr,/pinned|differs|mismatch/i);assert.equal(result.stdout,'');
}));
test('Agent Core isolated HOME reuses its explicitly installed host tooling link',()=>fixture(async root=>{
 const owner=path.join(root,'owner'),catalog=path.join(root,'runtime/skills/catalog/reverse-engineer-anything');await runtime(owner);const file=await launcher(catalog);
 await mkdir(path.join(root,'runtime/skills/tooling'),{recursive:true});
 await writeFile(path.join(root,'runtime/skills/tooling/reverse-engineer-anything.json'),JSON.stringify({version:1,name:'reverse-engineer-anything',runtimeVersion:'6.5.0',skillRoot:owner}));
 const isolated=path.join(root,'isolated-home');const result=run(file,root,{USERPROFILE:isolated,HOME:isolated,CODEX_HOME:''});
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).cwd,root);
}));
