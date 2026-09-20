import { enterPrerelease } from "./prerelease-lib.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const tag = arg("--tag");
if (!tag) {
  console.error("Usage: npm run release:pre-enter -- --tag <beta|next|rc>");
  process.exit(1);
}

const state = await enterPrerelease(tag);
console.log(JSON.stringify(state, null, 2));
