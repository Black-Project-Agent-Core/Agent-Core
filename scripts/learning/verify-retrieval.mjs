import { parseArguments, readArtifact, jsonBytes, writeExclusive, failure } from './report-io.mjs';
if(process.argv.includes('--help')) {
  console.log('Usage: verify-retrieval --cohort FILE --observations FILE --score FILE [--output NEW_FILE]');process.exit(0);
}
try {
  const args=parseArguments(['--cohort','--observations','--score'],['--output']);
  const {verifyRetrieval}=await import('../../dist/learning/retrieval-verifier.js');
  const cohort=await readArtifact(args['--cohort']),observations=await readArtifact(args['--observations']);
  let score;try {score=JSON.parse((await readArtifact(args['--score'])).toString('utf8'));}catch {throw new Error('INVALID_SCORE_JSON');}
  const report=verifyRetrieval(cohort,observations,score);
  if(args['--output'])await writeExclusive(args['--output'],jsonBytes(report));
  console.log(JSON.stringify(report,null,2));
  if(report.verdict!=='pass')process.exitCode=1;
} catch(error) {failure(error);}
