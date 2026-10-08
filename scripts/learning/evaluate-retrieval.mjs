import path from 'node:path';
import { parseArguments, readArtifact, digest, jsonBytes, createReportDirectory, writeExclusive, failure } from './report-io.mjs';
import { reportIdentity, implementationHashes, generatedClaim, sealReportBundle, REPORT_TRUST } from './report-bundle.mjs';
if(process.argv.includes('--help')) {
  console.log('Usage: evaluate-retrieval --cohort FILE --observations FILE --output NEW_DIRECTORY');process.exit(0);
}
try {
  const args=parseArguments(['--cohort','--observations','--output']);
  const {evaluateRetrieval}=await import('../../dist/learning/retrieval-evaluation.js');
  const {verifyRetrieval}=await import('../../dist/learning/retrieval-verifier.js');
  const {validateEvaluationEnvelope}=await import('../../dist/learning/evaluation.js');
  const cohort=await readArtifact(args['--cohort']),observations=await readArtifact(args['--observations']);
  const score=evaluateRetrieval(cohort,observations),scoreBytes=jsonBytes(score);
  const againCohort=await readArtifact(args['--cohort']),againObservations=await readArtifact(args['--observations']);
  if(digest(cohort)!==digest(againCohort)||digest(observations)!==digest(againObservations))throw new Error('INPUT_ARTIFACT_CHANGED');
  const verified=verifyRetrieval(againCohort,againObservations,JSON.parse(scoreBytes.toString('utf8')));
  const verificationBytes=jsonBytes(verified),output=args['--output'],observedAt=new Date().toISOString();
  const evidence=(name,bytes)=>({ref:'file:'+path.join(output,name).replaceAll('\\','/'),digest:digest(bytes),observedAt});
  const binding={inputsDigest:score.inputsDigest,evaluatorRevision:score.evaluatorRevision,
    verifierRevision:verified.verifierRevision,implementationHashes:await implementationHashes()};
  const reportId=reportIdentity(binding);
  const provenance={schemaVersion:1,observedAt,reportId,...binding,cohortDigest:score.cohortDigest,observationsDigest:score.observationsDigest,
    trust:REPORT_TRUST,reviewRequired:true,memoryPersisted:false};
  let candidate;
  if(score.correct&&verified.verdict==='pass') {
    const evaluation=validateEvaluationEnvelope({schemaVersion:1,mode:'rank',evaluatorRevision:score.evaluatorRevision,
      inputsDigest:score.inputsDigest,correct:true,objective:score.objective,metrics:score.metrics,
      evidence:[evidence('score.json',scoreBytes),evidence('cohort.json',cohort),evidence('observations.json',observations)],
      baselineRef:'verification:'+score.baselineRevision,attributionComplete:true,
      samples:{candidate:score.metrics.candidateSamples,baseline:score.metrics.baselineSamples,minimum:score.metrics.minimumSamples},
      verification:{method:'recomputed',verdict:'pass',verifierRevision:verified.verifierRevision,
        evaluatorRevision:verified.evaluatorRevision,inputsDigest:verified.inputsDigest,resultEvidence:evidence('verification.json',verificationBytes)}});
    const auditRef='file:'+path.join(output,'provenance.json').replaceAll('\\','/');
    if(auditRef.length>480)throw new Error('AUDIT_REFERENCE_TOO_LONG');
    candidate={kind:'durable-fact',...generatedClaim(score,reportId),
      verified:false,evidenceRefs:[auditRef],auditRef,evaluation};
  }
  await createReportDirectory(output);
  for(const [name,bytes] of [['cohort.json',cohort],['observations.json',observations],['score.json',scoreBytes],
    ['verification.json',verificationBytes],['provenance.json',jsonBytes(provenance)]])await writeExclusive(path.join(output,name),bytes);
  if(candidate)await writeExclusive(path.join(output,'review-candidate.json'),jsonBytes(candidate));
  const ok=score.correct&&verified.verdict==='pass';
  const sealed=await sealReportBundle(output,{reportId,...binding,cohortDigest:score.cohortDigest,observationsDigest:score.observationsDigest,
    outcome:{correct:score.correct,verifierVerdict:verified.verdict,eligible:ok}});
  console.log(JSON.stringify({ok,output,reportId,complete:sealed.complete,correct:score.correct,objective:score.objective,verifierVerdict:verified.verdict,reviewRequired:true,memoryPersisted:false},null,2));
  if(!ok)process.exitCode=1;
} catch(error) { failure(error); }
