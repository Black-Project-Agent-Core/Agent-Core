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

if (process.argv.includes("--help")) { console.log("Usage: release:apply — explicitly apply pending stable intents; never use for inspection"); process.exit(0); }
if (process.argv.slice(2).length) throw new Error("Unknown release:apply argument");
const { readPrereleaseState, PRE_STATE_PATH } = await import("./prerelease-lib.mjs");
const preState = await readPrereleaseState();
if (preState?.mode === "pre") throw new Error("Stable release apply refused while prerelease mode is active; request prerelease exit first");
const plan = await calculateReleasePlan();
if (plan.changesets.length === 0 || plan.bump === "none") {
  console.error("No pending Agent Core release intents.");
  process.exit(1);
}

const changelogPath = path.join(ROOT, "CHANGELOG.md");
const existingChangelog =
  (await readOptional(changelogPath)) ??
  "# Agent Core Changelog\n\nRelease entries are generated from explicit Agent Core change intents.\n";

const bullets = plan.changesets
  .map(change => `- [${change.type}] ${change.summary.replace(/\s+/g, " ")}`)
  .join("\n");
const entry = `## ${plan.nextVersion} - ${isoDateOnly()}\n\n${bullets}\n\n`;
const marker = existingChangelog.indexOf("\n");
const changelog =
  marker >= 0
    ? `${existingChangelog.slice(0, marker + 1)}\n${entry}${existingChangelog.slice(marker + 1).replace(/^\n+/, "")}`
    : `${existingChangelog}\n\n${entry}`;

const versionEdits = await buildVersionEdits(plan.nextVersion);
const rollback = await writeTransaction([
  ...versionEdits,
  { file: changelogPath, content: changelog },
]);

const archiveDir = path.join(
  CHANGESET_DIR,
  "applied",
  `${plan.nextVersion}-${Date.now()}`,
);
const moved = [];
try {
  await fs.mkdir(archiveDir, { recursive: true });
  if (preState?.mode === "exit") {
    const destination = path.join(archiveDir, "pre.json");
    await fs.rename(PRE_STATE_PATH, destination);
    moved.push({ from: PRE_STATE_PATH, to: destination });
  }
  for (const change of plan.changesets) {
    const destination = path.join(archiveDir, change.file);
    await fs.rename(change.fullPath, destination);
    moved.push({ from: change.fullPath, to: destination });
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
  `Applied Agent Core release ${plan.currentVersion} -> ${plan.nextVersion} (${plan.bump}); archived ${plan.changesets.length} intent(s).`,
);
