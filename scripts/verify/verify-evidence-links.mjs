import path from 'node:path';
import { parseArguments, jsonBytes } from '../memory/evaluation/report-io.mjs';
import { verifyEvidenceLinks, revalidateEvidenceLinks } from '../../dist/verification/evidence-links.js';
import { readEvidenceSnapshot, revalidateEvidenceSnapshot, writeEvidenceReport, evidenceDigest,
  evidencePathKey, EVIDENCE_DOCUMENT_MAX } from '../../dist/verification/evidence-snapshot.js';

if(process.argv.includes('--help')) {
  console.log('Usage: verify-evidence-links --root LOCAL_DIRECTORY --manifest SPEC.json --output NEW_REPORT.json\nOffline selected-reference validation. v1: documents/links. v2: documents/links plus expectedClaims[1..32] and claims[{id,from,lines:{start,end},linkIds[0..8]}]. Structural anchor binding only; no semantic entailment. Exit 0=all bound/pass, 1=mismatch, 2=unavailable/unknown/invalid.');
} else try {
  const args=parseArguments(['--root','--manifest','--output']);
  const specification=await readEvidenceSnapshot(args['--manifest'],EVIDENCE_DOCUMENT_MAX);
  let manifest;
  try {manifest=JSON.parse(specification.text);}catch{throw new Error('EVIDENCE_MANIFEST_INVALID');}
  const report=await verifyEvidenceLinks(args['--root'],manifest);
  const inputPaths=[args['--manifest'],...report.documents.map(d=>path.join(args['--root'],d.path))].map(evidencePathKey);
  if(inputPaths.includes(evidencePathKey(args['--output'])))throw new Error('EVIDENCE_OUTPUT_INPUT_ALIAS');
  report.source={manifestDigest:specification.digest};
  const bytes=jsonBytes(report);
  await writeEvidenceReport(args['--output'],bytes,async()=>{
    await revalidateEvidenceSnapshot(args['--manifest'],specification.identity,specification.digest);
    if(report.rootIdentity)await revalidateEvidenceLinks(args['--root'],report);
  });
  process.exitCode=report.status==='pass'?0:report.status==='fail'?1:2;
  const coverage=report.claimCoverage;
  console.log(JSON.stringify({ok:report.status==='pass',status:report.status,output:args['--output'],
    bytes:bytes.length,digest:evidenceDigest(bytes),semanticSupport:'not-established',
    ...(coverage?{claimCoverage:{expected:coverage.expected,supplied:coverage.supplied,bound:coverage.bound,
      unknown:coverage.unknown,failed:coverage.failed,unavailable:coverage.unavailable,complete:coverage.complete}}:{})}));
} catch(error) {
  const raw=error?.code||error?.message||'EVIDENCE_UNAVAILABLE';
  console.error(JSON.stringify({ok:false,status:'unavailable',error:/^[A-Z0-9_]+$/.test(raw)?raw:'EVIDENCE_UNAVAILABLE'}));process.exitCode=2;
}
