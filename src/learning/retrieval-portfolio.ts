// Coverage-redundancy adaptation of GEPA d771eb21b5dd3228bc3f567293d2ccfc423fc900.
// Copyright (c) 2025 Lakshya A Agrawal and GEPA contributors. See THIRD_PARTY_NOTICES.md.
import { boundedQueryIds, profileComparisonKey, reportHash, validateRetrievalProfile, type RetrievalProfile } from './retrieval-profile.js';
export function reduceCoverageFronts(fronts:number[][],scores:number[],reportIds:string[]){
  if(!Array.isArray(fronts)||!Array.isArray(scores)||!Array.isArray(reportIds)||fronts.length>10000||scores.length>100
    ||reportIds.length!==scores.length||new Set(reportIds).size!==reportIds.length
    ||reportIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,199}$/.test(id))
    ||scores.some(s=>typeof s!=='number'||!Number.isFinite(s)||s<0||s>1))throw new Error('INVALID_COVERAGE_INPUT');
  const memberships:number[][]=scores.map(()=>[]),coverage:number[]=[];
  fronts.forEach((front,q)=>{
    if(!Array.isArray(front)||front.length>scores.length||new Set(front).size!==front.length
      ||front.some(i=>!Number.isSafeInteger(i)||i<0||i>=scores.length))throw new Error('INVALID_FRONT_MEMBERSHIP');
    coverage[q]=front.length;for(const i of front)memberships[i].push(q);
  });
  const order=scores.map((_,i)=>i).sort((a,b)=>scores[a]-scores[b]||(reportIds[a]<reportIds[b]?-1:reportIds[a]>reportIds[b]?1:0));
  const remaining=new Set(order.filter(i=>memberships[i].length));
  // Removal only decreases coverage; a rejected removal cannot become removable later.
  // This single ordered pass is equivalent to GEPA's restart-after-removal loop.
  for(const i of order)if(remaining.has(i)&&memberships[i].every(q=>coverage[q]>1)){
    remaining.delete(i);for(const q of memberships[i])coverage[q]--;
  }
  const kept=[...remaining].sort((a,b)=>reportIds[a]<reportIds[b]?-1:reportIds[a]>reportIds[b]?1:0);
  const reduced=fronts.map(front=>front.filter(i=>remaining.has(i)));
  const coverageLoss=fronts.filter((front,q)=>front.length>0&&reduced[q].length===0).length;
  if(coverageLoss)throw new Error('COVERAGE_LOSS');
  return {kept,excluded:order.filter(i=>!remaining.has(i)),fronts:reduced,coverageLoss,
    covered:fronts.filter(f=>f.length).length,uncovered:fronts.flatMap((f,i)=>f.length?[]:[i])};
}
export function createRetrievalPortfolio(values:RetrievalProfile[],limit=100){
  if(!Array.isArray(values)||values.length>100)throw new Error('PORTFOLIO_CANDIDATE_LIMIT');
  boundedQueryIds([],limit);
  const profiles=values.map(validateRetrievalProfile),ids=profiles.map(p=>p.reportId);
  if(new Set(ids).size!==ids.length)throw new Error('DUPLICATE_REPORT_ID');
  if(new Set(profiles.map(profileComparisonKey)).size>1)throw new Error('INCOMPARABLE_PORTFOLIO');
  const queryIds=profiles[0]?.cases.map(c=>c.queryId).sort()??[];
  const maps=profiles.map(p=>new Map(p.cases.map(c=>[c.queryId,c.candidateHit])));
  if(maps.some(m=>m.size!==queryIds.length||queryIds.some(id=>!m.has(id))))throw new Error('PORTFOLIO_COHORT_MISMATCH');
  const fronts=queryIds.map(id=>maps.flatMap((m,i)=>m.get(id)?[i]:[]));
  const reduced=reduceCoverageFronts(fronts,profiles.map(p=>p.candidateRate),ids);
  const details=queryIds.map((queryId,q)=>({queryId,status:fronts[q].length?'covered':'uncovered',
    original:fronts[q].map(i=>ids[i]).sort(),survivors:reduced.fronts[q].map(i=>ids[i]).sort()}));
  return {schemaVersion:1,kind:'coverage-preserving-shortlist',inputs:profiles.map(p=>({reportId:p.reportId,inputsDigest:p.inputsDigest,candidateRate:p.candidateRate})),
    shortlist:reduced.kept.map(i=>ids[i]),excluded:reduced.excluded.map(i=>({reportId:ids[i],
      reason:fronts.some(f=>f.includes(i))?'coverage-redundant':'no-covered-case'})),coverageLoss:reduced.coverageLoss,
    covered:reduced.covered,uncovered:boundedQueryIds(reduced.uncovered.map(i=>queryIds[i]),limit),
    queries:{...boundedQueryIds(queryIds,limit),details:details.slice(0,limit),detailsDigest:reportHash(details)},
    semantics:'union-coverage-redundancy-not-pairwise-pareto-dominance',deploymentRecommendation:false,heldOutSuperiority:'not-established'};
}
