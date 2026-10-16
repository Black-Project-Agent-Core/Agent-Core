import { parseArguments, failure } from './report-io.mjs';
import { verifyReportBundle, bundleSummary } from './report-bundle.mjs';
if(process.argv.includes('--help')){
  console.log('Usage: verify-report-bundle --report DIRECTORY\nRead-only replay. Exit 0: complete eligible; 1: complete failed or legacy-unsealed; 2: invalid/I/O failure.');
  process.exit(0);
}
try{
  const args=parseArguments(['--report']);
  const result=await verifyReportBundle(args['--report']);
  console.log(JSON.stringify(bundleSummary(result),null,2));
  if(!result.complete||!result.eligible)process.exitCode=1;
}catch(error){failure(error);}
