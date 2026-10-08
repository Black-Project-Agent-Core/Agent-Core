import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { ROOT, calculateReleasePlan } from './release-lib.mjs';
import { readPrereleaseState, calculatePrereleaseVersion, advancePrereleaseSequence } from './prerelease-lib.mjs';
import { createDevelopmentArtifact } from './development-artifact.mjs';
import { captureReleaseState, assertReleaseStateUnchanged } from './release-state.mjs';

if (process.argv.includes('--help')) {
  console.log('Usage: release:pre-package — explicitly build an active prerelease artifact; stable intents remain unconsumed');
  process.exit(0);
}
if (process.argv.slice(2).length) throw new Error('Unknown release:pre-package argument');
const state = await readPrereleaseState();
if (state?.mode !== 'pre') throw new Error('No active prerelease channel; use explicit release:pre-enter first');
const plan = await calculateReleasePlan();
const artifactVersion = calculatePrereleaseVersion(plan.nextVersion,state);
const before = await captureReleaseState();
const node = path.join(ROOT,'runtime','node','node.exe');
await new Promise((resolve,reject) => {
  const cli = path.join(ROOT,'runtime','node','node_modules','npm','bin','npm-cli.js');
  const child = spawn(node,[cli,'run','build'],{cwd:ROOT,windowsHide:true,stdio:'inherit'});
  child.once('error',reject); child.once('close',code=>code===0?resolve():reject(new Error(`Prerelease build failed: ${code}`)));
});
let artifact;
try {
  artifact = await createDevelopmentArtifact({
    kind:'prerelease',artifactVersion,stableProductVersion:plan.currentVersion,
    pendingIntentIds:plan.changesets.map(change=>change.id),
    identity:{targetStableVersion:plan.nextVersion,tag:state.tag,sequence:state.sequence},
  });
  assertReleaseStateUnchanged(before,await captureReleaseState());
  const advanced = await advancePrereleaseSequence(state);
  console.log(JSON.stringify({...artifact,nextSequence:advanced.sequence},null,2));
} catch(error) {
  if (artifact?.outputRoot) await fs.rm(artifact.outputRoot,{recursive:true,force:true}).catch(()=>undefined);
  throw error;
}
