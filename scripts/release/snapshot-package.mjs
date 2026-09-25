import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT } from "./release-policy.mjs";
import { calculateSnapshotPlan } from "./snapshot-lib.mjs";
import { createDevelopmentArtifact } from "./development-artifact.mjs";
import { assertReleaseStateUnchanged, captureReleaseState } from "./release-state.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(command + " exited with code " + code));
    });
  });
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
const node = path.join(ROOT, "runtime", "node", "node.exe");
const npmCli = path.join(ROOT, "runtime", "node", "node_modules", "npm", "bin", "npm-cli.js");
await run(node, [npmCli, "run", "build"], ROOT);

let artifact;
try {
  artifact = await createDevelopmentArtifact({
    kind: "snapshot",
    artifactVersion: plan.snapshotVersion,
    stableProductVersion: plan.stableProductVersion,
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
}

console.log(JSON.stringify(artifact, null, 2));
