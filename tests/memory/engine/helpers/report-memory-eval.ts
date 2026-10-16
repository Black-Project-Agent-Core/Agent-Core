/** Build sanitized evidence from real Vitest results and command receipts.
 * node tests/memory/engine/helpers/report-memory-eval.ts measurements.json suite.json commands.json output.json
 * Node >=24 native type stripping; no evaluator dependency or model API.
 */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {corpus, resolveCases, sha256, fixtureSeals} from './memory-eval.ts';
const [measurementFile,suiteFile,commandFile,outputFile]=process.argv.slice(2);
assert(measurementFile&&suiteFile&&commandFile&&outputFile,'Expected measurements, suite, commands and output paths');
const measurements=JSON.parse(await readFile(measurementFile,'utf8'));
const suite=JSON.parse(await readFile(suiteFile,'utf8'));
const commands=JSON.parse(await readFile(commandFile,'utf8'));
function validateResponseAccounting(value: any): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value.responses) && typeof value.bytes === 'number' && typeof value.calls === 'number') {
    assert.equal(value.calls, value.responses.length, 'Inconsistent response call accounting');
    assert.equal(value.bytes, value.responses.reduce((sum: number, row: any) => sum + row.bytes, 0), 'Inconsistent response byte accounting');
  }
  for (const child of Object.values(value)) validateResponseAccounting(child);
}
validateResponseAccounting(measurements);
assert.equal(measurements.datasetRevision,corpus.datasetRevision);
assert.deepEqual(measurements.fixtureSeals,fixtureSeals,'Do not mix runs from different fixture seals');
assert.equal(measurements.histories.length,corpus.workloads.eventCounts.length,'Incomplete lifecycle measurements');
assert.equal(measurements.lexical.length,corpus.workloads.lexicalRecordCounts.length,'Incomplete lexical measurements');
const root=fileURLToPath(new URL('../../../..',import.meta.url));
const testSourceDigests:Record<string,string>={};
for(const file of suite.testResults){const relative=path.relative(root,file.name);assert(!relative.startsWith('..'));testSourceDigests[relative]=sha256(await readFile(file.name));}
for(const file of ['tests/memory/engine/helpers/memory-eval.ts','tests/memory/engine/helpers/report-memory-eval.ts'])testSourceDigests[file]=sha256(await readFile(path.join(root,file)));
const matrix=resolveCases(suite.testResults,commands);
const supplementalDefinitions=[
 ['same terminology across two workspaces stays scoped','memory-controller-scope.test.ts','includes only bound workspace'],
 ['semantic metadata-only and access-only freshness','memory-capsule.test.ts','source metadata correction stales'],
 ['more than eight retained revisions','memory-preservation.test.ts','metadata-only changes and more than eight'],
 ['over 4000 receipts and index deletion/rebuild','memory-receipt-integrity.test.ts','E28 over-limit'],
 ['over 512 feedback records','memory-retention.test.ts','E28 feedback over 512'],
 ['64-input and accumulated 65 references','memory-capsule.test.ts','capsules preserve accumulated 64 plus one'],
 ['16 evidence refs per link and 65 distinct links','memory-lifecycle-evals.test.ts','maximum link evidence references'],
 ['failed visibility loading','memory-disclosure.test.ts','fails closed when visibility|refuses corrupt visibility|unreadable visibility'],
 ['reader concurrent with multi-file apply','memory-episode-concurrency.test.ts','live applying episode writer'],
];
const supplemental=resolveCases(suite.testResults,{},supplementalDefinitions.map(([label,file,titlePattern],i)=>({id:'S'+(i+1),expectedBoundary:label,requiredProofs:[{file,titlePattern}],unrun:[]})));
const allExecutedProofsPass=matrix.flatMap((c:any)=>c.proofs).every((p:any)=>p.status==='PASS')&&supplemental.every((s:any)=>s.status==='PASS');
const count=(status:string)=>matrix.filter((c:any)=>c.status===status).length;
const report={...measurements,generatedAt:new Date().toISOString(),testSourceDigests,commands,
  suite:{status:suite.success?'PASS':'FAIL',files:suite.testResults.length,tests:suite.numTotalTests,passed:suite.numPassedTests,failed:suite.numFailedTests,pending:suite.numPendingTests,todo:suite.numTodoTests,startTime:suite.startTime},
  supplemental, acceptance:{counts:{pass:count('PASS'),fail:count('FAIL'),partial:count('PARTIAL'),notRun:count('NOT RUN')},cases:matrix},
  gates:{hardCorrectness:!suite.success?'FAIL':allExecutedProofsPass?'PASS (executed deterministic boundaries only)':'PARTIAL: required proof unavailable',noInvention:suite.success?'PASS (sealed corpus only)':'FAIL',budget:suite.success?'PASS (executed bounds only)':'FAIL',
    efficiency:measurements.histories.every((h:any)=>h.efficiencyStatus==='PASS')?'PASS':'FAIL',latency:measurements.lexical.every((l:any)=>l.guard.status==='PASS')?'PASS':'FAIL',
    continuity:'PARTIAL: offline engine replay passed; T9 protocol/live controller and Windows NOT RUN',storage:'REPORTED; no automatic purge threshold',G8:'PENDING REVIEW'},
  interpretation:{capture:'Accepted original evidence and rejected poisoning counted per lifecycle root. Event count includes start, mandatory state and reviewed promotion. Source authority stays controller assertion.',
    consolidation:'Real reviewed observation promotion with retained event/artifact lineage; invalid/stale/duplicate/near-duplicate boundaries are fresh reused tests in E07–E10/E15, not inferred from happy path.',
    retrieval:'Rank/recall measured on one independently labeled lexical target per store and one archived success. No general semantic retrieval quality claim.',
    disclosure:'All serialized response envelopes counted. Setup, checkpoint, warmups, measured reads, auxiliary probes, profiling reads and index rebuild are separate. Bytes exclude request payloads and OS/filesystem I/O. Duplicate rate is a lower bound of repeated exact mandatory text, not semantic redundancy.',
    outcomes:'Lifecycle benchmark outcome UNAVAILABLE: proposed next action was not executed. E26 independently exercises exposure, four reported-use receipts, one associated verified outcome and three unavailable outcomes; never causal attribution.',
    preservation:'Original byte SHA and exact mandatory refs checked in every history trial. Full-suite boundaries cover revision/receipt retention and source absence; transfer/2 remains NOT RUN.',
    performance:'Monotonic API-call wall time on same corpus/platform. Lexical provisional guard uses discovery; complete selected-record workload is additionally reported without omitting expansion. Guard failure is not waived by smaller payload.',
    continuation:'Expected next action/obligations/constraints reconstructed by deterministic test logic; no autonomous controller or model evaluated.',
    statuses:'NOT RUN = not attempted; SKIPPED = runner skipped; UNKNOWN = source/truth/freshness not established; UNAVAILABLE = requested source/outcome not accessible or verifiable; PARTIAL = some required proof missing.',
    limits:['Synthetic only','No model cost/token claims; zero model calls, null cost and tokens','No Windows execution','No performance confidence interval or isolated storage-device study','No corpus-wide natural-language proof','No live A-to-B or transfer/2 acceptance','Process memory sample is not peak or per-mode allocation']}};
await writeFile(outputFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({suite:report.suite,acceptance:report.acceptance.counts,gates:report.gates,latency:measurements.lexical.map((l:any)=>({count:l.count,status:l.guard.status,medianRatio:l.guard.medianRatio,p95Ratio:l.guard.p95Ratio}))},null,2));
