import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../dist/config.js';
import { MemoryService } from '../../dist/memory/service.js';
import { MemoryRemoteCrypto } from '../../dist/memory/remote-crypto.js';
import { resolveFileNativeMemoryPaths } from '../../dist/memory/file-native/paths.js';
import { FileNativeMemoryRepository } from '../../dist/memory/file-native/vault-repository.js';
import { GraphifyAdapter } from '../../dist/memory/file-native/graphify-adapter.js';
import { SupabaseSecondMemory } from '../../dist/memory/file-native/supabase-second-memory.js';
import { VaultTransactionJournal } from '../../dist/memory/file-native/transaction-journal.js';
import { serializeVaultSegment } from '../../dist/memory/file-native/vault-codec.js';

const execFileAsync = promisify(execFile);
const root = path.resolve(process.cwd());
const reportDirArg = process.argv.find((v) => v.startsWith('--report-dir='));
const reportDir = path.resolve(reportDirArg?.slice('--report-dir='.length) || path.join(root, 'runtime', 'acceptance', `file-native-memory-${new Date().toISOString().slice(0,10).replaceAll('-','')}`));
const checks = [];
const temporaries = [];
function sha(bytes){ return createHash('sha256').update(bytes).digest('hex'); }
function inside(base,target){ const b=path.resolve(base).toLowerCase(), t=path.resolve(target).toLowerCase(); return t===b || t.startsWith(`${b}${path.sep}`); }
async function exists(p){ try{ await access(p); return true; }catch{return false;} }
async function check(name, fn){ const started=Date.now(); try{ const evidence=await fn(); checks.push({name,status:'pass',durationMs:Date.now()-started,evidence}); }catch(error){ checks.push({name,status:'fail',durationMs:Date.now()-started,error:error instanceof Error?error.message:String(error)}); } }
async function walk(dir){ const out=[]; if(!await exists(dir)) return out; for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name); if(e.isDirectory())out.push(...await walk(p));else out.push(p);} return out; }
async function fixtureRoot(prefix){ const r=await mkdtemp(path.join(os.tmpdir(),prefix)); temporaries.push(r); const p=resolveFileNativeMemoryPaths(r); const rgTarget=path.join(p.ripgrepRoot,process.platform==='win32'?'rg.exe':'rg'); await mkdir(path.dirname(rgTarget),{recursive:true}); await copyFile(path.join(root,'.tools','ripgrep',process.platform==='win32'?'rg.exe':'rg'),rgTarget); return {root:r,paths:p}; }

await check('private_tool_locality', async()=>{
  const tools={
    rg:path.join(root,'.tools','ripgrep',process.platform==='win32'?'rg.exe':'rg'),
    uv:path.join(root,'.tools','uv',process.platform==='win32'?'uv.exe':'uv'),
    python:path.join(root,'.tools','python',process.platform==='win32'?'python.exe':'bin/python3'),
    graphify:path.join(root,'.tools','graphify',process.platform==='win32'?'graphify.cmd':'graphify'),
  };
  for(const [name,p] of Object.entries(tools)){ if(!inside(root,p)||!await exists(p)) throw new Error(`PRIVATE_TOOL_MISSING:${name}:${p}`); }
  const [rg,uv,python,graphify]=await Promise.all([
    execFileAsync(tools.rg,['--version'],{windowsHide:true}),execFileAsync(tools.uv,['--version'],{windowsHide:true}),execFileAsync(tools.python,['--version'],{windowsHide:true}),execFileAsync(tools.graphify,['--version'],{windowsHide:true,shell:process.platform==='win32'}),
  ]);
  return {paths:tools,versions:{rg:rg.stdout.split(/\r?\n/)[0],uv:uv.stdout.trim(),python:(python.stdout||python.stderr).trim(),graphify:(graphify.stdout||graphify.stderr).trim()}};
});

await check('vault_runtime_file_native_authority_and_recall', async()=>{
  const f=await fixtureRoot('ac-accept-vault-');
  const config=loadConfig({},f.root).memory;
  const service=new MemoryService(config);
  const scope={principalId:'acceptance-principal',projectId:f.root};
  const first=await service.commit({scope,canonicalKey:'acceptance.state',kind:'project_state',value:'alpha stable state',sourceType:'acceptance',metadata:{contextFamily:'project',topicKey:'acceptance'}});
  const revised=await service.revise({scope,memoryId:first.memoryId,value:'beta stable state',sourceType:'acceptance'});
  const linked=await service.commit({scope,canonicalKey:'acceptance.decision',kind:'decision',value:'use file native authority',sourceType:'acceptance',metadata:{contextFamily:'decision',topicKey:'acceptance'},explicitRelations:[{targetMemoryId:first.memoryId,relation:'validated_by'}]});
  const recall=await service.search({scope,query:'beta stable state',limit:10});
  const explain=await service.explain(scope,linked.memoryId,'file native authority');
  const status=await service.status(scope);
  await service.close();
  if(!recall.hits.some(h=>h.memoryId===first.memoryId)) throw new Error('ACCEPTANCE_RECALL_MISSING');
  if(!explain?.edges?.some(e=>e.toMemoryId===first.memoryId||e.fromMemoryId===first.memoryId)) throw new Error('ACCEPTANCE_RELATION_MISSING');
  const produced=await walk(path.join(f.root,'runtime'));
  const allowed=new Set(['.md','.json','.jsonl','.lock','.tmp','']);
  const foreign=produced.filter(p=>!allowed.has(path.extname(p).toLowerCase()));
  if(foreign.length) throw new Error(`NON_FILE_NATIVE_RUNTIME_ARTIFACT:${foreign[0]}`);
  return {firstMemoryId:first.memoryId,revisedRevisionNo:revised.revisionNo,relationMemoryId:linked.memoryId,recallCount:recall.hits.length,integrity:status.integrity,runtimeFiles:produced.length};
});

await check('startup_transaction_recovery', async()=>{
  const f=await fixtureRoot('ac-accept-recovery-');
  const rel='Coding/self/acceptance-A.md', target=path.join(f.paths.vaultRoot,...rel.split('/'));
  await mkdir(path.dirname(target),{recursive:true});
  const mk=(value)=>({schemaVersion:1,fileId:'mf_accept_recovery',relativePath:rel,contextFamily:'coding',projectId:'agent-core://self',topicKey:'acceptance',segmentNo:1,createdAt:new Date(1).toISOString(),updatedAt:new Date(2).toISOString(),entries:[{memoryId:'m_accept_recovery',revisionId:'r_accept_recovery',revisionNo:1,canonicalKey:'acceptance.recovery',kind:'fact',state:'active',importance:.8,pinned:false,enforcement:'none',valueText:value,valueHash:'a'.repeat(64),createdAt:1,updatedAt:2,relations:[]} ]});
  const before=serializeVaultSegment(mk('before')), after=serializeVaultSegment(mk('after'));
  await writeFile(target,before);
  await new VaultTransactionJournal(f.paths.transactionRoot).begin([{path:target,beforeContent:before,afterContent:after}]);
  const service=new MemoryService(loadConfig({AGENT_CORE_MEMORY_BACKEND:'vault'},f.root).memory);
  const status=await service.status({principalId:'p',projectId:f.root}); await service.close();
  const text=await readFile(target,'utf8');
  if(!text.includes('after')||status.counts.recovered_transactions!==1) throw new Error('TRANSACTION_NOT_RECOVERED');
  return {recoveredTransactions:status.counts.recovered_transactions};
});

await check('graphify_rebuild_from_canonical', async()=>{
  const f=await fixtureRoot('ac-accept-graph-');
  const repo=new FileNativeMemoryRepository(f.paths), scope={principalId:'p',projectId:f.root};
  const a=await repo.commit({scope,canonicalKey:'graph.anchor',kind:'fact',value:'anchor node',sourceType:'acceptance',metadata:{contextFamily:'coding',topicKey:'graph'}});
  const b=await repo.commit({scope,canonicalKey:'graph.related',kind:'decision',value:'related node',sourceType:'acceptance',metadata:{contextFamily:'coding',topicKey:'graph'},explicitRelations:[{targetMemoryId:a.memoryId,relation:'validated_by'}]});
  const adapter=new GraphifyAdapter(f.paths,{pythonPath:path.join(root,'.tools','python',process.platform==='win32'?'python.exe':'bin/python3'),bridgePath:path.join(root,'scripts','memory','graphify-bridge.py')});
  const built=await adapter.update([]); await rm(f.paths.graphRoot,{recursive:true,force:true});
  const related=await adapter.queryRelated([b.memoryId],32);
  if(!related.has(a.memoryId)||!await exists(path.join(f.paths.graphRoot,'graph.json'))) throw new Error('GRAPH_REBUILD_FAILED');
  return {initialNodes:built.nodes,initialEdges:built.edges,rebuildRelatedScore:related.get(a.memoryId),graphRecreated:true};
});

await check('encrypted_second_memory_restore', async()=>{
  const f=await fixtureRoot('ac-accept-second-');
  const keyPath=path.join(f.root,'second.key'); await writeFile(keyPath,randomBytes(32));
  const crypto=await MemoryRemoteCrypto.fromKeyFile(keyPath);
  const versions=new Map(), heads=new Map();
  const transport={
    async appendVersion(input){ const k=`${input.principalId}|${input.projectId}|${input.fileId}|${input.version.versionId}`; versions.set(k,structuredClone(input.version)); const hk=`${input.principalId}|${input.projectId}|${input.fileId}`; const old=heads.get(hk); heads.set(hk,{principalId:input.principalId,projectId:input.projectId,mirrorId:input.mirrorId,fileId:input.fileId,relativePath:input.relativePath,currentVersionId:input.version.versionId,state:'active',contentHash:input.version.contentHash,updatedAt:input.updatedAt,...(old?.currentVersionId?{priorVersionId:old.currentVersionId}:{})}); return {applied:!old||old.currentVersionId!==input.version.versionId,currentVersionId:input.version.versionId}; },
    async tombstone(input){ const hk=`${input.principalId}|${input.projectId}|${input.fileId}`, h=heads.get(hk); if(!h)throw new Error('HEAD_MISSING'); heads.set(hk,{...h,state:'tombstoned',priorVersionId:h.currentVersionId,updatedAt:input.deletedAt}); },
    async getHead(input){ return structuredClone(heads.get(`${input.principalId}|${input.projectId}|${input.fileId}`)??null); },
    async getVersion(input){ return structuredClone(versions.get(`${input.principalId}|${input.projectId}|${input.fileId}|${input.versionId}`)??null); },
    async upsertSyncState(){},
  };
  const second=new SupabaseSecondMemory(f.paths,crypto,transport,{mirrorId:'acceptance',retentionMs:86400000});
  const scope={principalId:'p',projectId:'project'}, rel='General/project/restore-A.md', bytes=Buffer.from('canonical encrypted recovery proof\n','utf8');
  await second.syncFile({scope,fileId:'mf_restore',relativePath:rel,bytes,updatedAt:Date.now()});
  await second.tombstoneFile({scope,fileId:'mf_restore',relativePath:rel,reason:'acceptance deletion',deletedAt:Date.now()+1});
  const target=path.join(f.paths.vaultRoot,...rel.split('/')); await rm(target,{force:true}); await second.restoreFile({scope,fileId:'mf_restore'});
  const restored=await readFile(target);
  if(!restored.equals(bytes)) throw new Error('SECOND_MEMORY_BYTES_MISMATCH');
  const stored=[...versions.values()][0]; if(Buffer.from(stored.encryptedEnvelope.ciphertext,'base64').includes(bytes)) throw new Error('SECOND_MEMORY_PLAINTEXT_LEAK');
  return {contentHash:sha(restored),restoredBytes:restored.length,encryptedEnvelopeFormat:stored.encryptedEnvelope.format};
});

for(const r of temporaries) await rm(r,{recursive:true,force:true}).catch(()=>undefined);
const failed=checks.filter(c=>c.status!=='pass'); const result={schema:'agent-core-file-native-memory-acceptance/1',generatedAt:new Date().toISOString(),sourceCommit:(await execFileAsync('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(),projectRoot:root,ok:failed.length===0,checks,summary:{passed:checks.length-failed.length,failed:failed.length,total:checks.length}};
await mkdir(reportDir,{recursive:true}); const output=path.join(reportDir,'acceptance.json'); await writeFile(output,JSON.stringify(result,null,2)+'\n','utf8'); console.log(JSON.stringify({...result,reportPath:output},null,2)); if(!result.ok)process.exitCode=1;

