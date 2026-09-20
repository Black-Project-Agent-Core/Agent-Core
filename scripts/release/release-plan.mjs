import { calculateReleasePlan } from "./release-lib.mjs";
import { calculatePrereleaseVersion, readPrereleaseState } from "./prerelease-lib.mjs";

const plan = await calculateReleasePlan();
const preState = await readPrereleaseState();
const prereleaseVersion = preState?.mode === "pre"
  ? calculatePrereleaseVersion(plan.nextVersion, preState)
  : null;
const jsonMode = process.argv.includes("--json");

if (jsonMode) {
  console.log(JSON.stringify({
    product: plan.product,
    currentVersion: plan.currentVersion,
    bump: plan.bump,
    nextVersion: plan.nextVersion,
    changesets: plan.changesets.map(({ id, type, summary }) => ({ id, type, summary })),
    prerelease: preState ? {
      mode: preState.mode,
      tag: preState.tag,
      sequence: preState.sequence,
      enteredAt: preState.enteredAt,
      ...(preState.exitRequestedAt ? { exitRequestedAt: preState.exitRequestedAt } : {}),
      proposedVersion: prereleaseVersion,
    } : null,
  }, null, 2));
  process.exit(0);
}

console.log("Agent Core release plan");
console.log("Current : " + plan.currentVersion);
console.log("Bump    : " + plan.bump);
console.log("Next    : " + plan.nextVersion);
console.log("Pending : " + plan.changesets.length);

if (preState?.mode === "pre") {
  console.log("Channel : " + preState.tag + " (pre)");
  console.log("Pre ver : " + prereleaseVersion);
  console.log("Sequence: " + preState.sequence);
} else if (preState?.mode === "exit") {
  console.log("Channel : " + preState.tag + " (exit requested; stable plan ready)");
}

for (const changeset of plan.changesets) {
  console.log("- [" + changeset.type + "] " + changeset.id + ": " + changeset.summary.replace(/\s+/g, " "));
}
