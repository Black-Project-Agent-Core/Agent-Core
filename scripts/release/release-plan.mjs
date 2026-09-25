import { calculateReleasePlan } from "./release-lib.mjs";

if (process.argv.includes("--help")) { console.log("Usage: release:plan [--json] — read-only release intent summary"); process.exit(0); }
if (process.argv.slice(2).some(arg => arg !== "--json")) throw new Error("Unknown release:plan argument");
const plan = await calculateReleasePlan();
const jsonMode = process.argv.includes("--json");

if (jsonMode) {
  console.log(JSON.stringify({
    product: plan.product,
    currentVersion: plan.currentVersion,
    bump: plan.bump,
    nextVersion: plan.nextVersion,
    changesets: plan.changesets.map(({ id, type, summary }) => ({ id, type, summary })),
  }, null, 2));
  process.exit(0);
}

console.log(`Agent Core release plan`);
console.log(`Current : ${plan.currentVersion}`);
console.log(`Bump    : ${plan.bump}`);
console.log(`Next    : ${plan.nextVersion}`);
console.log(`Pending : ${plan.changesets.length}`);

for (const changeset of plan.changesets) {
  console.log(`- [${changeset.type}] ${changeset.id}: ${changeset.summary.replace(/\s+/g, " ")}`);
}
