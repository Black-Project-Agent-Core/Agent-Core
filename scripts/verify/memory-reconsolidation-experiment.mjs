// Explicit offline fixture experiment. No production Memory import, network client or provider.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,jsonBytes,readArtifact,writeExclusive,parseArguments,failure} from '../learning/report-io.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export async function assertReconsolidationOutput(output){
 const resolved=path.resolve(output),parts=resolved.split(/[\\/]+/);
 if(parts.some(part=>/^(?:memory(?:-v2)?|memory-v2-.*|secrets?|credentials?|backups?)$/i.test(part)))throw Error('RECONSOLIDATION_PROTECTED_OUTPUT');
 let cursor=resolved;
 for(;;){const stat=await fs.lstat(cursor).catch(error=>{if(error.code==='ENOENT')return null;throw error});if(stat?.isSymbolicLink())throw Error('RECONSOLIDATION_SYMLINK_OUTPUT');const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;}
 return resolved;
}
export async function runReconsolidationReport(suiteFile,output){
 const out=await assertReconsolidationOutput(output),suiteBytes=await readArtifact(suiteFile);
 const {runReconsolidationExperiment,verifyReconsolidationExperiment}=await import('../../dist/learning/reconsolidation-report.js');
 const bundle=runReconsolidationExperiment(suiteBytes),verification=verifyReconsolidationExperiment(suiteBytes,bundle);
 if(verification.verdict!=='pass')throw Error('RECONSOLIDATION_VERIFICATION_FAILED');
 // Exclusive directory creation: a sealed run is never overwritten.
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out,{mode:0o700});
 const sourcePaths=['src/learning/reconsolidation-experiment.ts','src/learning/reconsolidation-report.ts','src/learning/retrieval-evaluation.ts','src/learning/retrieval-verifier.ts','scripts/verify/memory-reconsolidation-experiment.mjs','dist/learning/reconsolidation-experiment.js','dist/learning/reconsolidation-report.js'];
 const sourceIdentity=await Promise.all(sourcePaths.map(async relative=>({path:relative,digest:digest(await readArtifact(path.join(ROOT,relative)))})));
 const contents=new Map([['suite.json',suiteBytes],['bundle.json',jsonBytes(bundle)],['report.json',jsonBytes(bundle.report)],['verification.json',jsonBytes(verification)],['source-build-identity.json',jsonBytes({sourceIdentity,version:JSON.parse(await fs.readFile(path.join(ROOT,'package.json'),'utf8')).version,node:process.version,mode:'offline-fixtures',windows:'NOT RUN',productionRollout:'NOT RUN',benefitProven:false})]]);
 const members=[];
 for(const [name,bytes] of contents){await writeExclusive(path.join(out,name),bytes);members.push({path:name,size:bytes.length,sha256:digest(bytes).slice(7)});}
 await writeExclusive(path.join(out,'manifest.json'),jsonBytes({schemaVersion:1,members}));
 // Re-read sealed inputs and replay independently; don't count a successful write as verified evidence.
 const reread=verifyReconsolidationExperiment(await readArtifact(path.join(out,'suite.json')),JSON.parse((await readArtifact(path.join(out,'bundle.json'))).toString('utf8')));
 if(reread.verdict!=='pass')throw Error('RECONSOLIDATION_REPLAY_FAILED');
 return {mode:'scripted-offline',decision:bundle.report.decision,verification:reread.verdict,benefitProven:false,output:out};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=parseArguments(['--suite','--out']);console.log(JSON.stringify(await runReconsolidationReport(args['--suite'],args['--out'])))}catch(error){failure(error)}
}
