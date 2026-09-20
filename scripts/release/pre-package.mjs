import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT } from "./release-policy.mjs";
import { calculateReleasePlan } from "./release-lib.mjs";
import {
  advancePrereleaseSequence,
  calculatePrereleaseVersion,
  readPrereleaseState,
} from "./prerelease-lib.mjs";
import { createDevelopmentArtifact } from "./development-artifact.mjs";
import { assertReleaseStateUnchanged, captureReleaseState } from "./release-state.mjs";

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

const state = await readPrereleaseState();
if (!state || state.mode !== "pre") {
  throw new Error("Prerelease mode is not active");
}

const releasePlan = await calculateReleasePlan();
const prereleaseVersion = calculatePrereleaseVersion(releasePlan.nextVersion, state);
const before = await captureReleaseState();
const node = path.join(ROOT, "runtime", "node", "node.exe");
const npmCli = path.join(ROOT, "runtime", "node", "node_modules", "npm", "bin", "npm-cli.js");
await run(node, [npmCli, "run", "build"], ROOT);

let artifact;
try {
  artifact = await createDevelopmentArtifact({
    kind: "prerelease",
    artifactVersion: prereleaseVersion,
    stableProductVersion: releasePlan.currentVersion,
    pendingIntentIds: releasePlan.changesets.map(change => change.id),
    identity: {
      channel: state.tag,
      sequence: state.sequence,
      targetStableVersion: releasePlan.nextVersion,
      bump: releasePlan.bump,
      enteredAt: state.enteredAt,
    },
  });
  const afterArtifact = await captureReleaseState();
  assertReleaseStateUnchanged(before, afterArtifact);
  const nextState = await advancePrereleaseSequence(state);
  console.log(JSON.stringify({ ...artifact, prereleaseState: nextState }, null, 2));
} catch (error) {
  if (artifact?.outputRoot) {
    await fs.rm(artifact.outputRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  throw error;
}
