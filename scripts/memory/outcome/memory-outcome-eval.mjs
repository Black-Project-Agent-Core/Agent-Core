// Offline opt-in functional lifecycle harness. Never imports the USER-STOPPED
// legacy runner, host config, provider SDK, or an inference consumer.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadOutcomePreregistration} from './memory-outcome-preregistration.mjs';
import {OutcomeMemoryAdapter} from './memory-outcome-adapter.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value);
async function sourcePatch(){
 const files=['src/memory/outcome/contract.ts','src/memory/outcome/evaluation.ts','src/memory/outcome/verifier.ts','src/learning/outcome-safe-engineering.ts','src/learning/outcome-safe-engineering.ts','scripts/verify/cumulative-workflow-support.mjs','scripts/memory/outcome/memory-outcome-adapter.mjs','scripts/memory/outcome/memory-outcome-eval.mjs','scripts/memory/outcome/memory-outcome-live.mjs','scripts/memory/outcome/memory-outcome-preregistration.mjs','scripts/memory/outcome/package-memory-outcome.mjs','src/memory/workflow-verifier.ts','src/memory/workflow-verifier.ts','scripts/verify/cumulative-workflow-eval.mjs'];
 let patch='# Empty-directory source snapshot, not a baseline delta. The integration handoff carries the actual base-to-final patch.\n';for(const relative of files){const text=await fs.readFile(path.join(ROOT,relative),'utf8');const lines=text.replace(/\n$/,'').split('\n');patch+='diff --git a/'+relative+' b/'+relative+'\nnew file mode 100644\n--- /dev/null\n+++ b/'+relative+'\n@@ -0,0 +1,'+lines.length+' @@\n'+lines.map(line=>'+'+line).join('\n')+'\n';}
 return patch;
}
const save=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,canonical(value),{flag:'wx',mode:0o600});};
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
async function noLinks(file){
 const resolved=path.resolve(file),parts=resolved.split(path.sep);let current=path.parse(resolved).root;
 for(const part of parts.slice(1)){current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())throw Error('SYMLINK_REFUSED');}
}
export async function resolveOutcomeRead(workspace,file){
 const root=path.resolve(workspace),resolved=path.resolve(file);if(!inside(root,resolved))throw Error('SCOPE_REFUSED');
 await noLinks(root);await noLinks(resolved);const stat=await fs.lstat(resolved);if(!stat.isFile())throw Error('SCOPE_REFUSED');
 const handle=await fs.open(resolved,'r');try{const opened=await handle.stat();if(opened.dev!==stat.dev||opened.ino!==stat.ino)throw Error('FILE_IDENTITY_CHANGED');return await handle.readFile('utf8');}finally{await handle.close();}
}
async function listTree(root){
 const rows=[];async function walk(dir){for(const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const file=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('SYMLINK_REFUSED');if(item.isDirectory())await walk(file);else if(item.isFile())rows.push({path:path.relative(root,file).replaceAll(path.sep,'/'),digest:digest(await fs.readFile(file))});else throw Error('SNAPSHOT_MEMBER_INVALID');}}
 await noLinks(root);await walk(root);return rows;
}
async function treeDigest(root){return digest(canonical(await listTree(root)));}
export async function freezeOutcomeSnapshot(sourceRoot,output,sourceRevision){
 if(typeof sourceRevision!=='string'||!sourceRevision)throw Error('SNAPSHOT_SOURCE_REVISION_REQUIRED');
 const source=path.resolve(sourceRoot),destination=path.resolve(output);
 if(source===destination||inside(source,destination)&&!destination.includes(path.sep+'runtime'+path.sep+'tmp'+path.sep))throw Error('SNAPSHOT_OUTPUT_SCOPE');
 const rootDist=path.join(source,'dist'),memoryDist=path.join(source,'dist/memory');
 const [rootDistDigest,memoryDistDigest]=await Promise.all([treeDigest(rootDist),treeDigest(memoryDist)]);
 const factory=await fs.readFile(path.join(memoryDist,'service.js'),'utf8');
 if(!factory.includes('maxNeighbors: 0')&&!factory.includes('maxNeighbors:0'))throw Error('BLOCKED:BASELINE_FACTORY_UNVERIFIED');
 await fs.mkdir(path.dirname(destination),{recursive:true});await noLinks(path.dirname(destination));
 try{await fs.mkdir(destination);}catch(error){if(error.code==='EEXIST')throw Error('OUTPUT_EXISTS');throw error;}
 try{
  await fs.cp(rootDist,path.join(destination,'dist'),{recursive:true,errorOnExist:true,force:false});
  // Runtime snapshots deliberately contain compiled artifacts only. Sourcemap
  // references are never followed or copied from the source checkout.
  const snapshot={schemaVersion:1,sourceRevision,rootDistDigest,memoryDistDigest,policies:['baseline-v1',...(factory.includes('fusion-feedback-v1')?['fusion-feedback-v1']:[])]};
  await save(path.join(destination,'snapshot.json'),snapshot);await validateSnapshot(destination);return snapshot;
 }catch(error){await save(path.join(destination,'snapshot-blocked.json'),{status:'BLOCKED',reason:error.message}).catch(()=>{});throw error;}
}
async function validateSnapshot(root){
 await noLinks(root);const snapshot=JSON.parse(await fs.readFile(path.join(root,'snapshot.json'),'utf8'));
 if(snapshot.schemaVersion!==1||!snapshot.sourceRevision)throw Error('BLOCKED:SNAPSHOT_INVALID');
 if(snapshot.rootDistDigest!==await treeDigest(path.join(root,'dist'))||snapshot.memoryDistDigest!==await treeDigest(path.join(root,'dist/memory')))throw Error('BLOCKED:SNAPSHOT_DIGEST_MISMATCH');
 return snapshot;
}
export function parseOutcomeArguments(argv){
 if(argv.includes('--continue'))throw Error('LEGACY_CONTINUE_REFUSED');
 const allowed=new Set(['--suite','--phase','--output','--baseline','--candidate-snapshot','--baseline-snapshot','--preregistration']);const values={};
 for(let i=0;i<argv.length;i+=2){const key=argv[i],value=argv[i+1];if(!allowed.has(key))throw Error('UNKNOWN_OPTION:'+key);if(!value||value.startsWith('--')||Object.hasOwn(values,key))throw Error('INVALID_OR_DUPLICATE_OPTION');values[key.slice(2).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=key==='--phase'?value:path.resolve(value);}
 if(!values.suite||!values.phase||!values.output)throw Error('MISSING_REQUIRED_OPTION');
 if(!['baseline','compare'].includes(values.phase))throw Error('INVALID_PHASE');
 if(values.phase==='compare'&&(!values.baseline||!values.candidateSnapshot))throw Error('COMPARE_SNAPSHOT_REQUIRED');
 return {suitePath:values.suite,phase:values.phase,output:values.output,baselinePath:values.baseline,candidateSnapshot:values.candidateSnapshot,baselineSnapshot:values.baselineSnapshot,preregistrationPath:values.preregistration};
}
async function evidenceFor(spec,context,result){
 const base='evidence/'+context.runId.replaceAll(':','-');
 const artifactRef='artifact:'+base+'.txt#'+digest(result.artifactText);
 const verification={taskId:context.runId,artifactDigest:digest(result.artifactText),oracleDigest:spec.oracleDigest,verdict:result.verification.verdict,unsupportedClaims:result.verification.unsupportedClaims};
 const verificationRef='verification:'+base+'-verification.json#'+digest(canonical(verification));
 const receipts=result.receipt?[{id:context.runId+':use',taskId:context.runId,actionRef:artifactRef,memoryId:result.receipt.hit.id,memoryRevision:result.receipt.hit.revision,verificationRef,outcome:result.receipt.recorded.receipt.applicability,verified:result.receipt.recorded.receipt.result==='success'&&result.receipt.recorded.receipt.evidenceValidation==='resolved'}]:[];
 const receiptRefs=receipts.map((_receipt,i)=>'receipt:'+base+'-receipt-'+i+'.json#'+digest(canonical(receipts[i])));
 await fs.writeFile(path.join(context.output,base+'.txt'),result.artifactText,{flag:'wx',mode:0o600});
 await save(path.join(context.output,base+'-verification.json'),verification);
 await save(path.join(context.output,base+'-trace.json'),{runId:context.runId,definition:'toolCalls counts scripted harness/owner operations, not model-issued tools; verification-only ranking operations included',operations:result.trace});
 for(let i=0;i<receipts.length;i++)await save(path.join(context.output,base+'-receipt-'+i+'.json'),receipts[i]);
 return {artifactRef,verificationRef,receiptRefs,evidence:{artifactText:result.artifactText,verification,receipts}};
}
async function baselineEvidenceFiles(root,suite,rows){
 const paths=new Set(['evidence/snapshot.json']);
 for(const row of rows){for(const [ref,kind,value] of [[row.artifactRef,'artifact',row.evidence.artifactText],[row.verificationRef,'verification',row.evidence.verification],...row.receiptRefs.map((ref,index)=>[ref,'receipt',row.evidence.receipts[index]])]){
  const match=/^(?:artifact|verification|receipt):(evidence\/[^#]+)#(sha256:[a-f0-9]{64})$/.exec(ref);if(!match)throw Error('BLOCKED:BASELINE_REF_INVALID');
  const file=path.join(root,match[1]);if(!inside(path.resolve(root),path.resolve(file)))throw Error('BLOCKED:BASELINE_SCOPE_INVALID');await noLinks(file);
  const data=await fs.readFile(file,'utf8');const actual=kind==='artifact'?digest(data):digest(canonical(JSON.parse(data)));
  if(actual!==match[2]||(kind==='artifact'?data!==value:canonical(JSON.parse(data))!==canonical(value)))throw Error('BLOCKED:BASELINE_ARTIFACT_DRIFT');paths.add(match[1]);
 }}
 for(const item of suite.cases){const file=path.join(root,'fixtures/oracles',item.id+'.json');await noLinks(file);if(digest(canonical(JSON.parse(await fs.readFile(file,'utf8'))))!==item.oracleDigest)throw Error('BLOCKED:BASELINE_ORACLE_DRIFT');}
 for(const row of rows){const relative='evidence/'+row.runId.replaceAll(':','-')+'-trace.json';const file=path.join(root,relative);await noLinks(file);const trace=JSON.parse(await fs.readFile(file,'utf8'));if(trace.runId!==row.runId||!Array.isArray(trace.operations)||trace.operations.length!==row.counters.toolCalls)throw Error('BLOCKED:BASELINE_TRACE_DRIFT');paths.add(relative);}
 await noLinks(path.join(root,'evidence/snapshot.json'));
 const snapshot=JSON.parse(await fs.readFile(path.join(root,'evidence/snapshot.json'),'utf8'));
 if(rows.some(row=>row.hashes.sourceRevision!==snapshot.sourceRevision||row.hashes.rootDistDigest!==snapshot.rootDistDigest||row.hashes.memoryDistDigest!==snapshot.memoryDistDigest))throw Error('BLOCKED:BASELINE_SNAPSHOT_DRIFT');
 return [...paths];
}
export async function runOutcomeSuite({suitePath,phase,output,baselinePath,candidateSnapshot,baselineSnapshot,preregistrationPath}){
 if(!['baseline','compare'].includes(phase))throw Error('INVALID_PHASE');
 const destination=path.resolve(output),sourceSuite=path.resolve(suitePath);await noLinks(sourceSuite);
 try{await fs.lstat(destination);throw Error('OUTPUT_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
 const {parseOutcomeSuite,validateOutcomePairs}=await import(pathToFileURL(path.join(ROOT,'dist/memory/outcome/contract.js')).href);
 const {evaluateOutcome}=await import(pathToFileURL(path.join(ROOT,'dist/memory/outcome/evaluation.js')).href);
 const {verifyOutcome}=await import(pathToFileURL(path.join(ROOT,'dist/memory/outcome/verifier.js')).href);
 const frozenSuiteBytes=await fs.readFile(sourceSuite);let suiteBytes=frozenSuiteBytes,suite=parseOutcomeSuite(JSON.parse(suiteBytes)),preregistrationSealBytes=null;
 if(suite.mode!=='offline'||suite.driver!=='scripted')throw Error('BLOCKED:OFFLINE_MODE_REQUIRED');
 if(suite.preregistration!==null||suite.preregistrationDigest!==null||phase==='baseline'&&preregistrationPath)throw Error('BLOCKED:PREREGISTRATION_REQUIRES_COMPARE_SUPPLEMENT');
 let rows=[],baselineFiles=[],currentPath=baselineSnapshot??path.join(ROOT,'runtime/tmp/memory-outcome-v2/snapshots/current'),snapshot;
 if(phase==='compare'){
  if(!baselinePath||!candidateSnapshot)throw Error('COMPARE_SNAPSHOT_REQUIRED');
  await noLinks(baselinePath);
  const priorSuite=await fs.readFile(path.join(baselinePath,'fixtures/suite.json'));
  if(digest(priorSuite)!==digest(suiteBytes))throw Error('BLOCKED:PAIR_MANIFEST_DRIFT');
  rows=JSON.parse(await fs.readFile(path.join(baselinePath,'results/observations.json'),'utf8'));
  const priorReport=JSON.parse(await fs.readFile(path.join(baselinePath,'report/report.json'),'utf8'));
  if(priorReport.complete!==true)throw Error('BLOCKED:BASELINE_INCOMPLETE');
  const baselineCommands=JSON.parse(await fs.readFile(path.join(baselinePath,'logs/commands.json'),'utf8'));if(!Array.isArray(baselineCommands)||!baselineCommands.length||baselineCommands.some(command=>command.exitCode!==0||command.status!=='PASS'))throw Error('BLOCKED:BASELINE_EXECUTION_INCOMPLETE');
  const recheck=verifyOutcome(priorSuite,Buffer.from(canonical(rows)),priorReport);if(recheck.verdict!=='pass')throw Error('BLOCKED:BASELINE_SEAL_INVALID');
  baselineFiles=await baselineEvidenceFiles(path.resolve(baselinePath),suite,rows);
  if(preregistrationPath){
   suite=await loadOutcomePreregistration(preregistrationPath,{suiteBytes:frozenSuiteBytes,baselineRows:rows,candidateOpenedAt:new Date().toISOString()});
   preregistrationSealBytes=await fs.readFile(preregistrationPath);const seal=JSON.parse(preregistrationSealBytes),{candidateOpenedAt,...registration}=suite.preregistration;
   if(digest(canonical(registration))!==seal.registrationDigest||digest(canonical(seal.registration))!==seal.registrationDigest)throw Error('BLOCKED:PREREGISTRATION_CHANGED_DURING_READ');
   suiteBytes=Buffer.from(canonical(suite));
  }
  currentPath=path.resolve(candidateSnapshot);snapshot=await validateSnapshot(currentPath);
  if(!snapshot.policies.includes('fusion-feedback-v1'))throw Error('BLOCKED:CANDIDATE_POLICY_UNAVAILABLE');
  if(suite.sourceRevisions.candidate!==snapshot.sourceRevision)throw Error('BLOCKED:CANDIDATE_SOURCE_REVISION_MISMATCH');
 }else{snapshot=await validateSnapshot(currentPath);if(suite.sourceRevisions.current!==snapshot.sourceRevision)throw Error('BLOCKED:CURRENT_SOURCE_REVISION_MISMATCH');}
 await fs.mkdir(path.dirname(destination),{recursive:true});await noLinks(path.dirname(destination));await fs.mkdir(destination,{mode:0o700});
 for(const dir of ['report','results','fixtures/oracles','evidence','logs','patch','runs'])await fs.mkdir(path.join(destination,dir),{recursive:true});
 await fs.writeFile(path.join(destination,'fixtures/suite.json'),suiteBytes,{flag:'wx'});
 if(preregistrationSealBytes){await fs.writeFile(path.join(destination,'fixtures/frozen-suite.json'),frozenSuiteBytes,{flag:'wx'});await fs.writeFile(path.join(destination,'fixtures/preregistration-seal.json'),preregistrationSealBytes,{flag:'wx'});}
 for(const spec of suite.cases)await save(path.join(destination,'fixtures/oracles',spec.id+'.json'),spec.oracle);
 if(suite.preregistration)await save(path.join(destination,'fixtures/preregistration.json'),suite.preregistration);
 if(phase==='compare'){for(const relative of baselineFiles)await fs.writeFile(path.join(destination,relative),await fs.readFile(path.join(baselinePath,relative)),{flag:'wx',mode:0o600});await fs.writeFile(path.join(destination,'logs/baseline-commands.json'),await fs.readFile(path.join(baselinePath,'logs/commands.json')),{flag:'wx',mode:0o600});}
 const command={command:'memory-outcome-eval --phase '+phase,mode:'offline',status:'RUNNING',exitCode:null,sourceRevision:snapshot.sourceRevision,inferenceCalls:0};
 const runIds=phase==='baseline'?suite.cases.filter(item=>item.partition==='heldout').flatMap((item,index)=>['native','external'].flatMap((controller,ci)=>suite.armOrder[(index*2+ci)%3].filter(arm=>arm!=='candidate').map(arm=>item.id+':'+controller+':'+arm))):suite.expectedRunIds.compare.filter(id=>id.endsWith(':candidate'));
 try{
  for(const runId of runIds){
   const [caseId,controller,arm]=runId.split(':');const spec=suite.cases.find(item=>item.id===caseId);if(!spec||spec.partition!=='heldout')throw Error('RUN_MEMBERSHIP_INVALID');
   const oraclePath=path.join(destination,'fixtures/oracles',caseId+'.json');try{await fs.access(oraclePath);}catch{await save(oraclePath,spec.oracle);}
   const adapter=new OutcomeMemoryAdapter();
   try{
    await adapter.initialize(path.join(destination,'runs',runId.replaceAll(':','-')),spec.seed,{engineMode:'experience-v2',activation:'synthetic-v2',policy:arm==='candidate'?'fusion-feedback-v1':'baseline-v1',snapshotRoot:currentPath,...snapshot});
    const context={runId,controller,arm,output:destination,oraclePath,readInput:resolveOutcomeRead};const result=await adapter.execute(spec,context);const evidence=await evidenceFor(spec,context,result);
    rows.push({runId,caseId,controller,arm,taskId:runId,hashes:{inputDigest:spec.inputDigest,oracleDigest:spec.oracleDigest,seedDigest:spec.seedDigest,configDigest:spec.configDigest,sourceRevision:snapshot.sourceRevision,rootDistDigest:snapshot.rootDistDigest,memoryDistDigest:snapshot.memoryDistDigest,activationDigest:adapter.activationDigest},adapter:{engineMode:'experience-v2',activation:'synthetic-v2',policy:arm==='candidate'?'fusion-feedback-v1':'baseline-v1',factoryRevision:snapshot.sourceRevision,selected:result.selected.map(hit=>({id:hit.id,revision:hit.revision,score:hit.score??0}))},...evidence,correct:result.verification.verdict==='pass',violations:result.violations,lifecycle:result.lifecycle,latencyMs:result.latencyMs,counters:result.counters,usage:{status:'unavailable',inputTokens:null,outputTokens:null,provenance:'offline scripted driver: zero inference'},cost:{status:'unavailable',amount:null,currency:null,provenance:'offline scripted driver: billing not measured'}});
   }finally{await adapter.close();}
  }
  const reasons=validateOutcomePairs(suite,rows);if(reasons.length)throw Error('BLOCKED:PAIR_VALIDATION:'+reasons.join(','));
  const report=evaluateOutcome(suite,rows);const check=verifyOutcome(suiteBytes,Buffer.from(canonical(rows)),report);if(check.verdict!=='pass')throw Error('BLOCKED:INDEPENDENT_RECOMPUTATION:'+check.reasons.join(','));
  await save(path.join(destination,'results/observations.json'),rows);await save(path.join(destination,'report/report.json'),report);
  await fs.writeFile(path.join(destination,'patch/changes.patch'),await sourcePatch(),{flag:'wx'});
  await save(path.join(destination,'evidence',phase==='compare'?'snapshot-candidate.json':'snapshot.json'),snapshot);
  await save(path.join(destination,'report/status-ledger.json'),{offlineFunctional:'PASS',live:'NOT RUN',efficiencyBenchmark:'DEFERRED',candidate:report.candidateStatus,benefitProven:false});command.status='PASS';command.exitCode=0;
  await save(path.join(destination,'logs/commands.json'),[command]);return rows;
 }catch(error){
  await save(path.join(destination,'results/partial-observations.json'),rows).catch(()=>{});
  await save(path.join(destination,'results/observations.json'),rows).catch(()=>{});
  await save(path.join(destination,'report/report.json'),evaluateOutcome(suite,rows)).catch(()=>{});
  if(rows.some(row=>phase==='compare'?row.arm==='candidate':row.arm!=='candidate'))await save(path.join(destination,'evidence',phase==='compare'?'snapshot-candidate.json':'snapshot.json'),snapshot).catch(()=>{});
  await fs.writeFile(path.join(destination,'patch/changes.patch'),await sourcePatch().catch(()=>''),{flag:'wx',mode:0o600}).catch(()=>{});
  await save(path.join(destination,'report/status-ledger.json'),{offlineFunctional:'BLOCKED',live:'NOT RUN',efficiencyBenchmark:'DEFERRED',candidate:'BLOCKED',benefitProven:false}).catch(()=>{});
  command.status='BLOCKED';command.exitCode=2;command.reason=error.message;
  await save(path.join(destination,'logs/commands.json'),[command]).catch(()=>{});await save(path.join(destination,'report/blocked.json'),{status:'BLOCKED',complete:false,reason:error.message}).catch(()=>{});throw error;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const options=parseOutcomeArguments(process.argv.slice(2));const rows=await runOutcomeSuite(options);console.log(JSON.stringify({status:'PASS',mode:'offline',runs:rows.length,inferenceCalls:0,benefitProven:false,live:'NOT RUN',efficiencyBenchmark:'DEFERRED'}));}
 catch(error){console.error(JSON.stringify({status:'BLOCKED',reason:error.message}));process.exitCode=2;}
}
