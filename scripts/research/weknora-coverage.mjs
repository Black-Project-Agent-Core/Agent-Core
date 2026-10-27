import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isUtf8} from 'node:buffer';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const target=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const donor=process.argv[2];if(!donor)throw Error('Explicit donor root required');
const base=path.join(target,'docs/research/weknora-donor');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const inv=read(path.join(base,'inventory.json'));
const head=execFileSync('git',['-C',donor,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(head!==inv.commit)throw Error('Donor revision drift');
if(execFileSync('git',['-C',donor,'status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Donor must remain clean');
const raka=read(path.join(base,'raka-coverage.json'));
const byRaka=new Map(raka.files.map(f=>[f.path,f]));
const lexical=new Map(['main','native'].flatMap(owner=>read(path.join(base,`${owner}-lexical-triage.json`)).files).map(f=>[f.path,f]));
const logPath=path.join(target,'runtime/build/weknora-donor-20261026/main-read-log.json');
const mainReads=fs.existsSync(logPath)?read(logPath).filter(x=>x.side==='donor'):[];
const blob=b=>crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
function family(p){const a=path.posix.dirname(p).split('/');if(a[0]==='.')return 'root';if(a[0]==='internal')return a.slice(0,a[1]==='application'?4:3).join('/');return a.slice(0,a[0]==='frontend'||a[0]==='cli'?3:2).join('/');}
function decision(p,kind,r){
 if(p==='internal/models/api/endpoint.go')return ['adapted-W-02','WeKnora-Donor-Audit.md','Body-read transport distinction independently adapted and tested in existing TS owner.'];
 if(p.startsWith('internal/reranking/'))return ['no-port-measured-or-product-specific','raka-knowledge-audit.md','W-01 measured/rejected; optional model reranker needs a qualified recipient consumer/oracle.'];
 if(p.startsWith('internal/sourceloc/'))return ['adapt-principle-K-LOC-01','raka-knowledge-audit.md','Direct XLSX origins selected in existing local projection owner; donor parser/alignment engine not imported. Implementation/activation status lives in main report.'];
 if(p.startsWith('internal/agent/compaction/')||p.startsWith('internal/agent/token/'))return ['defer-semantic-compaction','native-main-review.md','Needs history-preservation quality oracle, provider budget and checkpoint policy; no parallel runtime imported.'];
 if(p.startsWith('internal/modelcontext/'))return ['defer-model-view-registry','native-main-review.md','Richer typed views; missing recipient metadata consumer not established. Existing evidence/revision owners preserved.'];
 if(p.startsWith('internal/stream/')||p.startsWith('internal/agent/')||p.startsWith('internal/models/')||p.startsWith('internal/mcp/')||p.startsWith('internal/mcpserver/')||p.startsWith('internal/event/')||p.startsWith('internal/runtime/'))return ['no-wholesale-agent-runtime-port','native-main-review.md','Existing Core runtime/provider/auth/result-budget owners retained; reviewed mechanisms and unresolved semantic depth explicit.'];
 if(/^internal\/(?:sandbox|localsandbox|container|browserskill)\//.test(p))return ['no-execution-owner-import','native-main-review.md','Product/platform-specific execution environment; no new process/container/browser owner required.'];
 if(p.startsWith('migrations/'))return ['no-schema-migration','main-platform-audit.md','Distinct donor persistence/history; no SQL migration executed or translated.'];
 if(r?.comparisonOwner==='raka')return ['no-port-domain-parity-or-product-specific','raka-knowledge-audit.md','Consult exact feature findings; richer source capability alone is not demonstrated recipient benefit.'];
 if(r?.comparisonOwner==='native')return ['no-wholesale-agent-service-port','native-main-review.md','Cross-domain service handoff; retain current owners and candidate-specific gates. Mechanical-only rows are not behavior proofs.'];
 if(kind==='asset-binary'||kind==='binary-fixture')return ['support-asset-no-copy','main-platform-audit.md','Header/bytes/hash classified; not decoded/rendered or adopted.'];
 if(p.startsWith('third_party/')||p.startsWith('licenses/')||p==='LICENSE'||p==='THIRD_PARTY_NOTICES.md')return ['provenance-no-dependency-import','ATTRIBUTION.md','Preserve licensing distinction; no vendored dependency or asset imported.'];
 if(/^(frontend|client|cli|packages|miniprogram)\//.test(p))return ['client-support-no-wholesale-port','native-main-review.md','Existing local UI/MCP/tool contracts retained; selected transport/CLI mechanisms reviewed separately.'];
 if(/^(website-docs|docs|examples|\.github|helm|docker|deploy|scripts|misc|cmd)\//.test(p)||kind==='documentation'||kind==='config-support')return ['support-context-no-runtime-adoption','main-platform-audit.md','Navigation, tests, configuration, packaging or product examples; source assertions require exact mechanism checks.'];
 return ['platform-owner-parity-or-product-specific','main-platform-audit.md','See platform auth/body/network/storage/operations family decision; no new parallel engine.'];
}
const files=[];const families={};const mismatches=[];
for(const f of inv.files){
 const b=fs.readFileSync(path.join(donor,...f.path.split('/'))),workingBlob=blob(b);
 const normalized=workingBlob===f.blob?workingBlob:isUtf8(b)?blob(Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'))):workingBlob;
 const matches=workingBlob===f.blob||normalized===f.blob;
 if(!matches)mismatches.push(f.path);
 const r=byRaka.get(f.path),l=lexical.get(f.path);if(!r&&!l)throw Error('Unscanned inventory path '+f.path);
 const sha256=crypto.createHash('sha256').update(b).digest('hex');
 const ranges=[...(r?.reviewedRanges??[]).map(x=>({...x,reviewer:'raka'})),...mainReads.filter(x=>x.path===f.path&&x.sha256===sha256&&x.start<=x.end).map(x=>({start:x.start,end:x.end,reviewer:'main'}))];
 const kind=r?.contentKind??l.role,[adoptionDecision,report,reason]=decision(f.path,kind,r);
 const fam=family(f.path),entry={path:f.path,blob:f.blob,bytes:f.bytes,initialOwner:f.owner,comparisonOwner:r?.comparisonOwner??f.owner,family:fam,contentKind:kind,triageStatus:'classified',blobMatches:matches,lineEndingOnlyDifference:workingBlob!==f.blob&&matches,reviewLevel:ranges.length?'selected-excerpts-reviewed':'mechanical-content-triage',reviewedRanges:ranges,adoptionDecision,decisionBasis:'family-disposition; semantic depth remains separately labeled',report,reason,remainingUnknowns:ranges.length?['Only listed excerpts reviewed; no whole-file correctness or donor-runtime proof.']:['No explicit semantic excerpt in the counted manifest; byte/declaration triage and family decision are not deep-review proof.']};
 files.push(entry);const g=families[fam]??={files:0,bytes:0,excerptReviewedFiles:0,decisions:{}};g.files++;g.bytes+=f.bytes;if(ranges.length)g.excerptReviewedFiles++;g.decisions[adoptionDecision]=(g.decisions[adoptionDecision]??0)+1;
}
if(mismatches.length)throw Error('Pinned blob mismatch: '+mismatches.join(', '));
const counts={files:files.length,bytes:files.reduce((a,f)=>a+f.bytes,0),classified:files.filter(x=>x.triageStatus==='classified').length,pendingInventoryTriage:0,blobMismatches:0,lineEndingOnlyDifferences:files.filter(x=>x.lineEndingOnlyDifference).length,excerptReviewedFiles:files.filter(x=>x.reviewedRanges.length).length,mechanicalOnlyFiles:files.filter(x=>!x.reviewedRanges.length).length,families:Object.keys(families).length};
const result={version:1,commit:inv.commit,generatedAt:new Date().toISOString(),policy:'Every tracked path has byte/blob triage and a family adoption disposition. This is not semantic coverage of every function or a guarantee that no superior technique remains. Accepted implementation/activation status belongs to WeKnora-Donor-Audit.md. Native raw claims require native-main-review.md; Native-reported reads are not counted without explicit verified excerpt ranges.',counts,families,files};
fs.writeFileSync(path.join(base,'coverage.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(counts));
