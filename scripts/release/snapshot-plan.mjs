import { calculateSnapshotPlan } from "./snapshot-lib.mjs";

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

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

console.log("Agent Core snapshot plan");
console.log("Stable baseline: " + plan.stableProductVersion);
console.log("Runtime source : " + plan.runtimeProductVersion);
console.log("Stable target  : " + plan.targetStableVersion);
console.log("Bump           : " + plan.bump);
console.log("Snapshot       : " + plan.snapshotVersion);
console.log("Tag            : " + plan.tag);
console.log("Commit         : " + plan.commit);
console.log("Pending intents: " + plan.pendingIntentIds.length);
