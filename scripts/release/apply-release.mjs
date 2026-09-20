import fs from "node:fs/promises";
import path from "node:path";
import {
  CHANGESET_DIR,
  ROOT,
  buildVersionEdits,
  calculateReleasePlan,
  isoDateOnly,
  readOptional,
  writeTransaction,
} from "./release-lib.mjs";
import { readPrereleaseState } from "./prerelease-lib.mjs";

const plan = await calculateReleasePlan();
const preState = await readPrereleaseState();
if (preState?.mode === "pre") {
  console.error("Stable release apply is blocked while prerelease mode is active. Run release:pre-exit first.");
  process.exit(1);
}
if (plan.changesets.length === 0 || plan.bump === "none") {
  console.error("No pending Agent Core release intents.");
  process.exit(1);
}

const changelogPath = path.join(ROOT, "CHANGELOG.md");
const existingChangelog =
  (await readOptional(changelogPath)) ??
  "# Agent Core Changelog\n\nRelease entries are generated from explicit Agent Core change intents.\n";

const bullets = plan.changesets
  .map(change => "- [" + change.type + "] " + change.summary.replace(/\s+/g, " "))
  .join("\n");
const entry = "## " + plan.nextVersion + " - " + isoDateOnly() + "\n\n" + bullets + "\n\n";
const marker = existingChangelog.indexOf("\n");
const changelog =
  marker >= 0
    ? existingChangelog.slice(0, marker + 1) + "\n" + entry + existingChangelog.slice(marker + 1).replace(/^\n+/, "")
    : existingChangelog + "\n\n" + entry;

const versionEdits = await buildVersionEdits(plan.nextVersion);
const rollback = await writeTransaction([
  ...versionEdits,
  { file: changelogPath, content: changelog },
]);

const archiveDir = path.join(
  CHANGESET_DIR,
  "applied",
  plan.nextVersion + "-" + Date.now(),
);
const moved = [];
try {
  await fs.mkdir(archiveDir, { recursive: true });
  for (const change of plan.changesets) {
    const destination = path.join(archiveDir, change.file);
    await fs.rename(change.fullPath, destination);
    moved.push({ from: change.fullPath, to: destination });
  }
  if (preState?.mode === "exit") {
    const prePath = path.join(CHANGESET_DIR, "pre.json");
    const destination = path.join(archiveDir, "pre-state.json");
    await fs.rename(prePath, destination);
    moved.push({ from: prePath, to: destination });
  }
} catch (error) {
  for (const item of moved.reverse()) {
    await fs.rename(item.to, item.from).catch(() => undefined);
  }
  await fs.rm(archiveDir, { recursive: true, force: true }).catch(() => undefined);
  await rollback().catch(() => undefined);
  throw error;
}

console.log(
  "Applied Agent Core release " + plan.currentVersion + " -> " + plan.nextVersion
    + " (" + plan.bump + "); archived " + plan.changesets.length + " intent(s)."
    + (preState?.mode === "exit" ? " Prerelease exit state archived." : ""),
);
