import fs from 'node:fs';
import {expect,test} from 'vitest';
import {runReconsolidationExperiment,verifyReconsolidationExperiment} from '../src/learning/reconsolidation-report.js';
const bytes=fs.readFileSync(new URL('./fixtures/memory-reconsolidation/suite.json',import.meta.url));
test('eight_original_cases_have_separate_feedback_and_heldout_oracles',()=>{
 const bundle=runReconsolidationExperiment(bytes);
 expect(bundle.report.caseResults).toHaveLength(8);
 expect(bundle.report.mode).toBe('scripted-offline');expect(bundle.report.benefitProven).toBe(false);
 expect(bundle.report.preservationPassed).toBe(true);expect(bundle.report.unsupportedEdges).toBe(0);
 expect(bundle.report.decision).toBe('further-study');expect(bundle.report.retrievalResults.objective).toBe(0.125);
 expect(verifyReconsolidationExperiment(bytes,bundle).verdict).toBe('pass');
});
test('tamper_corpus_report_and_claim_are_rejected',()=>{
 const bundle=runReconsolidationExperiment(bytes);
 const changed=JSON.parse(bytes.toString());changed.cases[0].input.nodes[0].revision='tampered';
 expect(verifyReconsolidationExperiment(Buffer.from(JSON.stringify(changed)),bundle).verdict).toBe('fail');
 for(const patch of [{unsupportedEdges:0,preservationPassed:false,decision:'further-study'},{decision:'production-approved'},{benefitProven:true},{retrievalResults:{...bundle.report.retrievalResults,objective:1}}])expect(verifyReconsolidationExperiment(bytes,{...bundle,report:{...bundle.report,...patch}} as any).verdict).toBe('fail');
 const forged=structuredClone(bundle);forged.proposals[0].edges[0].targetId='n9';expect(verifyReconsolidationExperiment(bytes,forged).verdict).toBe('fail');
 const missing=structuredClone(bundle);missing.report.caseResults.pop();expect(verifyReconsolidationExperiment(bytes,missing).verdict).toBe('fail');
});
test('unsupported_associations_or_missing_comparison_reject_the_experiment',()=>{
 const changed=JSON.parse(bytes.toString());changed.cases[0].oracle.allowedEdges=[];
 const unsupported=runReconsolidationExperiment(Buffer.from(JSON.stringify(changed)));
 expect(unsupported.report.unsupportedEdges).toBe(1);expect(unsupported.report.decision).toBe('reject');
 const incomplete=JSON.parse(bytes.toString());incomplete.cases[0].oracle.expected=[];
 expect(()=>runReconsolidationExperiment(Buffer.from(JSON.stringify(incomplete)))).toThrow();
});

test('runner_refuses_production_memory_and_symlink_output',async()=>{
 const {assertReconsolidationOutput}=await import('../scripts/verify/memory-reconsolidation-experiment.mjs');
 await expect(assertReconsolidationOutput('/synthetic/runtime/memory/report')).rejects.toThrow('PROTECTED_OUTPUT');
 await expect(assertReconsolidationOutput('/synthetic/runtime/memory-v2/report')).rejects.toThrow('PROTECTED_OUTPUT');
 const os=await import('node:os'),path=await import('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'reconsolidation-link-'));
 try{fs.mkdirSync(path.join(root,'safe'));fs.symlinkSync(path.join(root,'safe'),path.join(root,'link'),'dir');await expect(assertReconsolidationOutput(path.join(root,'link','report'))).rejects.toThrow('SYMLINK_OUTPUT')}finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('unrecognized_claim_fields_are_not_verified',()=>{
 const bundle=runReconsolidationExperiment(bytes);
 expect(verifyReconsolidationExperiment(bytes,{...bundle,report:{...bundle.report,productionApproved:true}} as any).verdict).toBe('fail');
});

test('query_seeds_and_corpus_identity_must_exist_in_frozen_input',()=>{
 const missing=JSON.parse(bytes.toString());missing.cases[0].queries[0].seedId='phantom';
 expect(()=>runReconsolidationExperiment(Buffer.from(JSON.stringify(missing)))).toThrow();
 const drift=JSON.parse(bytes.toString());drift.cases[0].input.corpusRevision='other';
 expect(()=>runReconsolidationExperiment(Buffer.from(JSON.stringify(drift)))).toThrow();
});
