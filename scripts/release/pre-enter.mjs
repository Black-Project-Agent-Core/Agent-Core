import { enterPrerelease } from "./prerelease-lib.mjs";
import { calculateReleasePlan, validateStableSemver } from './release-lib.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const tag = arg("--tag");
if (!tag) {
  console.error("Usage: npm run release:pre-enter -- --tag <beta|next|rc>");
  process.exit(1);
}

const plan = await calculateReleasePlan();
validateStableSemver(plan.currentVersion);
const state = await enterPrerelease(tag, { stableProductVersion: plan.currentVersion });
console.log(JSON.stringify(state, null, 2));
