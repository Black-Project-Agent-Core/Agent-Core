import path from 'node:path';
import { parseArguments, readArtifact, digest, jsonBytes, writeExclusive, failure } from './report-io.mjs';
import { verifyReportBundle } from './report-bundle.mjs';

const analysisModes=['--profile','--series','--frontier','--diversity','--stability','--pareto','--curve','--novelty'];
if(process.argv.includes('--help')){
  console.log('Usage: analyze-retrieval (--profile REPORT_DIRECTORY | --series RUN_MANIFEST | --frontier RUN_MANIFEST | --diversity RUN_MANIFEST | --stability RUN_MANIFEST | --pareto RUN_MANIFEST | --curve RUN_MANIFEST | --novelty RUN_MANIFEST) --output NEW_FILE\nOffline inspection only. Inputs remain immutable; no memory capture, experiment execution, stopping, approval or deployment.');
  process.exit(0);
}

try{
  const args=parseArguments(['--output'],analysisModes);
  const modes=analysisModes.filter(key=>args[key]);
  if(modes.length!==1)throw new Error('EXACTLY_ONE_ANALYSIS_MODE_REQUIRED');

  const {deriveRetrievalProfile,summarizeRetrievalProfile,profileComparisonKey}=await import('../../../dist/memory/evaluation/retrieval-profile.js');
  const {VerifiedValueRegistry,collectNumericLeaves}=await import('../../../dist/learning/verified-value-registry.js');
  const registry=new VerifiedValueRegistry();
  const verifiedProfiles=[];
  const profile=bundle=>{
    const value=deriveRetrievalProfile(bundle.artifacts.cohort,bundle.artifacts.observations,bundle.artifacts.score,
      {reportId:bundle.reportId,implementationHashes:bundle.manifest.implementationHashes});
    verifiedProfiles.push(value);
    collectNumericLeaves(value,registry,'verified-profile:'+value.reportId,'verified-input');
    return value;
  };

  let output;
  let parsedManifest=null;
  let evidenceForManifest=[];

  if(modes[0]==='--profile'){
    const bundle=await verifyReportBundle(args['--profile']);
    if(!bundle.complete||!bundle.eligible)throw new Error('PROFILE_REQUIRES_COMPLETE_ELIGIBLE_BUNDLE');
    output={...summarizeRetrievalProfile(profile(bundle)),source:{reportId:bundle.reportId,manifestDigest:bundle.manifestDigest,
      implementationMatchesCurrent:bundle.implementationMatchesCurrent}};
  }else{
    const {parseRetrievalSeriesManifest,summarizeRetrievalSeries}=await import('../../../dist/memory/evaluation/retrieval-series.js');
    const file=args[modes[0]],bytes=await readArtifact(file),manifest=parseRetrievalSeriesManifest(JSON.parse(bytes.toString('utf8')));
    parsedManifest=manifest;
    const evidence=[],seen=new Set();
    for(const run of manifest.runs){
      if(!run.report){
        evidence.push({id:run.id,status:run.status==='evaluable'?'invalid':run.status,
          reason:run.status==='evaluable'?'missing-evaluable-artifact':'operator-reported-without-artifact'});
        continue;
      }
      let bundle;
      try{bundle=await verifyReportBundle(path.resolve(path.dirname(file),run.report));}
      catch{evidence.push({id:run.id,status:'invalid',reason:'bundle-invalid-or-unavailable'});continue;}
      if(bundle.reportId){
        if(seen.has(bundle.reportId))throw new Error('DUPLICATE_REPORT_ID');
        seen.add(bundle.reportId);
      }
      evidence.push({id:run.id,status:!bundle.complete?'incomplete':bundle.eligible?'evaluable':'failed',
        ...(!bundle.complete?{reason:'legacy-unsealed'}:!bundle.eligible?{reason:'evaluation-failed'}:{profile:profile(bundle)}),
        ...(bundle.manifestDigest?{manifestDigest:bundle.manifestDigest}:{})});
    }
    evidenceForManifest=evidence;

    for(const run of manifest.runs){
      for(const measurement of [...(run.resources??[]),...(run.cumulativeResources??[])]){
        registry.add(measurement.value,'manifest:'+run.id+':'+measurement.dimension,'operator-supplied',false);
      }
      registry.add(run.iteration,'manifest:'+run.id+':iteration','operator-supplied',false);
    }

    const series=summarizeRetrievalSeries(manifest,evidence);
    if(modes[0]==='--series')output=series;
    else if(modes[0]==='--frontier'){
      if(evidence.some(e=>e.status!=='evaluable'||!e.profile))throw new Error('FRONTIER_REQUIRES_ALL_ELIGIBLE_REPORTS');
      const {createRetrievalPortfolio}=await import('../../../dist/memory/evaluation/retrieval-portfolio.js');
      output=createRetrievalPortfolio(evidence.map(e=>e.profile));
    }else if(modes[0]==='--diversity'){
      const config=manifest.analysis?.diversity;
      if(!config)throw new Error('DIVERSITY_ANALYSIS_CONFIG_REQUIRED');
      if(evidence.some(e=>e.status!=='evaluable'||!e.profile))throw new Error('DIVERSITY_REQUIRES_ALL_ELIGIBLE_REPORTS');
      const {createRetrievalDiversityArchive}=await import('../../../dist/memory/evaluation/retrieval-diversity.js');
      const byId=new Map(evidence.map(item=>[item.id,item]));
      const featureValue=(run,profileValue,id)=>{
        if(id==='candidateRate')return profileValue.candidateRate;
        if(id==='objective')return profileValue.objective;
        if(id==='regressionFraction'){
          if(profileValue.regressionFraction.value===null)throw new Error('DIVERSITY_FEATURE_UNAVAILABLE:regressionFraction');
          return profileValue.regressionFraction.value;
        }
        if(id==='failureSurfaceCount')return run.mechanismAttribution?.failureSurfaces?.length??0;
        if(id.startsWith('resource.')){
          const dimension=id.slice('resource.'.length);
          const item=run.resources?.find(value=>value.dimension===dimension);
          if(!item)throw new Error('DIVERSITY_FEATURE_UNAVAILABLE:'+id);
          return item.value;
        }
        throw new Error('DIVERSITY_FEATURE_UNSUPPORTED:'+id);
      };
      const candidates=manifest.runs.map(run=>{
        const observed=byId.get(run.id),profileValue=observed?.profile;
        if(!profileValue)throw new Error('DIVERSITY_PROFILE_MISSING');
        return {
          reportId:profileValue.reportId,
          comparisonKey:profileComparisonKey(profileValue)+'/'+(run.split??'none'),
          fitness:config.fitness==='candidateRate'?profileValue.candidateRate:profileValue.objective,
          features:Object.fromEntries(config.dimensions.map(dimension=>[dimension.id,featureValue(run,profileValue,dimension.id)])),
        };
      });
      output=createRetrievalDiversityArchive(candidates,config.dimensions);
    }else if(modes[0]==='--novelty'){
      const {summarizeRetrievalNovelty}=await import('../../../dist/memory/evaluation/retrieval-novelty.js');
      output=summarizeRetrievalNovelty(manifest,evidence);
      registry.add(manifest.analysis.novelty.neighbors,'manifest:novelty:neighbors','operator-supplied',false);
    }else if(modes[0]==='--curve'){
      const {analyzeRetrievalCurve}=await import('../../../dist/memory/evaluation/retrieval-curve.js');
      output=analyzeRetrievalCurve(manifest,evidence,manifest.analysis?.curve);
    }else if(modes[0]==='--pareto'){
      const config=manifest.analysis?.pareto;
      if(!config)throw new Error('PARETO_ANALYSIS_CONFIG_REQUIRED');
      const {analyzeRetrievalPareto,buildParetoCandidates}=await import('../../../dist/memory/evaluation/retrieval-pareto.js');
      output=analyzeRetrievalPareto(buildParetoCandidates(manifest,evidence),config);
    }else if(modes[0]==='--stability'){
      const config=manifest.analysis?.stability;
      if(!config)throw new Error('STABILITY_ANALYSIS_CONFIG_REQUIRED');
      const {analyzeRetrievalStability}=await import('../../../dist/memory/evaluation/retrieval-stability.js');
      const byGroup=new Map();
      for(const run of manifest.runs){
        const observed=evidence.find(item=>item.id===run.id);
        if(observed?.status!=='evaluable'||!observed.profile||run.independentSeed!==true)continue;
        const comparisonKey=profileComparisonKey(observed.profile)+'/'+(run.split??'none');
        const key=comparisonKey+'\0'+run.iteration;
        const rows=byGroup.get(key)??[];
        rows.push({run,profile:observed.profile,comparisonKey});
        byGroup.set(key,rows);
      }
      const rounds=[...byGroup.values()].map(rows=>{
        const rates=rows.map(item=>item.profile.candidateRate);
        const mean=rates.reduce((sum,value)=>sum+value,0)/rates.length;
        const populationStdDev=rates.length>1
          ?Math.sqrt(rates.reduce((sum,value)=>sum+(value-mean)**2,0)/rates.length)
          :null;
        return {iteration:rows[0].run.iteration,comparisonKey:rows[0].comparisonKey,mean,populationStdDev,sampleCount:rates.length};
      });
      output=analyzeRetrievalStability(rounds,config);
    }

    if(digest(await readArtifact(file))!==digest(bytes))throw new Error('MANIFEST_CHANGED_DURING_ANALYSIS');
    output={...output,source:{manifestDigest:digest(bytes),reports:evidence.map(e=>({runId:e.id,manifestDigest:e.manifestDigest??null,status:e.status}))}};
  }

  collectNumericLeaves(output,registry,'analysis-output','analysis-derived');
  output={...output,numericProvenance:registry.toJSON(),reviewRequired:true,memoryPersisted:false};
  const content=jsonBytes(output);
  if(content.length>8*1024*1024)throw new Error('ANALYSIS_OUTPUT_TOO_LARGE');
  await writeExclusive(args['--output'],content);
  if(digest(await readArtifact(args['--output']))!==digest(content))throw new Error('ANALYSIS_READBACK_MISMATCH');
  console.log(JSON.stringify({ok:true,mode:modes[0].slice(2),output:args['--output'],digest:digest(content),reviewRequired:true,memoryPersisted:false}));
}catch(error){failure(error);}
