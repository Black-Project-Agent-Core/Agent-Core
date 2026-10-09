import { ROOT } from "./release-policy.mjs";
import { calculateSnapshotPlan } from "./snapshot-lib.mjs";
import { createDevelopmentArtifact } from "./development-artifact.mjs";
import { assertReleaseStateUnchanged, captureReleaseState } from "./release-state.mjs";
import { buildDevelopmentRuntime } from './development-build.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const tag = arg("--tag") ?? "dev";
const template = arg("--template");
const commit = arg("--commit");
const date = arg("--date");
const plan = await calculateSnapshotPlan({
  tag,
  ...(template ? { template } : {}),
  ...(commit ? { commit } : {}),
  ...(date ? { date } : {}),
});

const before = await captureReleaseState();
const runtime = await buildDevelopmentRuntime(ROOT, plan.runtimeProductVersion);

let artifact;
try {
  artifact = await createDevelopmentArtifact({
    kind: "snapshot",
    artifactVersion: plan.snapshotVersion,
    stableProductVersion: plan.stableProductVersion,
    runtimeProductVersion: plan.runtimeProductVersion,
    launcherPath: runtime.launcherPath,
    pendingIntentIds: plan.pendingIntentIds,
    identity: {
      targetStableVersion: plan.targetStableVersion,
      bump: plan.bump,
      tag: plan.tag,
      template: plan.template,
      commit: plan.commit,
      generatedAt: plan.generatedAt,
    },
  });
  const after = await captureReleaseState();
  assertReleaseStateUnchanged(before, after);
} catch (error) {
  if (artifact?.outputRoot) {
    const { rm } = await import("node:fs/promises");
    await rm(artifact.outputRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  throw error;
} finally {
  await runtime.cleanup();
}

console.log(JSON.stringify(artifact, null, 2));
