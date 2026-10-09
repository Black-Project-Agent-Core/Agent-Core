import fs from 'node:fs/promises';
import { ROOT, calculateReleasePlan, parseProductVersion } from './release-lib.mjs';
import { readPrereleaseState, calculatePrereleaseVersion, advancePrereleaseSequence } from './prerelease-lib.mjs';
import { createDevelopmentArtifact } from './development-artifact.mjs';
import { captureReleaseState, assertReleaseStateUnchanged } from './release-state.mjs';
import { buildDevelopmentRuntime } from './development-build.mjs';

if (process.argv.includes('--help')) {
  console.log('Usage: release:pre-package — explicitly build an active prerelease artifact; stable intents remain unconsumed');
  process.exit(0);
}
if (process.argv.slice(2).length) throw new Error('Unknown release:pre-package argument');
const state = await readPrereleaseState();
if (state?.mode !== 'pre') throw new Error('No active prerelease channel; use explicit release:pre-enter first');
const plan = await calculateReleasePlan();
const artifactVersion = calculatePrereleaseVersion(plan.nextVersion,state);
const identity = parseProductVersion(plan.currentVersion);
if (identity.prerelease && plan.currentVersion !== artifactVersion) {
  throw new Error(`Synchronize the explicit next product version ${artifactVersion} before packaging; current source is ${plan.currentVersion}`);
}
const stableProductVersion = state.stableProductVersion ?? (identity.prerelease ? null : plan.currentVersion);
if (!stableProductVersion) throw new Error('Prerelease state must record the previous stableProductVersion');
const before = await captureReleaseState();
const runtime = await buildDevelopmentRuntime(ROOT, plan.currentVersion);
let artifact;
try {
  artifact = await createDevelopmentArtifact({
    kind:'prerelease',artifactVersion,stableProductVersion,runtimeProductVersion:plan.currentVersion,
    launcherPath:runtime.launcherPath,
    pendingIntentIds:plan.changesets.map(change=>change.id),
    identity:{targetStableVersion:plan.nextVersion,tag:state.tag,sequence:state.sequence},
  });
  assertReleaseStateUnchanged(before,await captureReleaseState());
  const advanced = await advancePrereleaseSequence(state);
  console.log(JSON.stringify({...artifact,nextSequence:advanced.sequence},null,2));
} catch(error) {
  if (artifact?.outputRoot) await fs.rm(artifact.outputRoot,{recursive:true,force:true}).catch(()=>undefined);
  throw error;
} finally {
  await runtime.cleanup();
}
