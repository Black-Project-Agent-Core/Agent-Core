import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { CURRENT_LINE_BASELINE_REF, ROOT } from "./release-lib.mjs";
import {
  isPendingIntentPath,
  isReleaseRelevantPath,
  loadReleasePolicy,
  normalizeReleasePath,
  releaseChangeScanPathspecs,
} from "./release-policy.mjs";

function git(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-c", "safe.directory=" + ROOT.replaceAll("\\", "/"), "-C", ROOT, ...args], {
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error("git " + args.join(" ") + " failed (" + code + "): " + (stderr.trim() || stdout.trim())));
    });
  });
}

const policy = await loadReleasePolicy(ROOT);
const scanPathspecs = releaseChangeScanPathspecs();
const tempDir = path.join(ROOT, "runtime", "tmp");
await fs.mkdir(tempDir, { recursive: true });
const tempIndex = path.join(tempDir, "agent-core-release-intent-check-" + process.pid + ".index");
const env = { GIT_INDEX_FILE: tempIndex };

await fs.rm(tempIndex, { force: true }).catch(() => undefined);
await fs.rm(tempIndex + ".lock", { force: true }).catch(() => undefined);

try {
  await git(["rev-parse", "--verify", CURRENT_LINE_BASELINE_REF]);
  await git(["read-tree", CURRENT_LINE_BASELINE_REF], { env });

  const tracked = await git(["diff", "--name-only", "--", ...scanPathspecs], { env });
  const untracked = await git(["ls-files", "--others", "--exclude-standard", "--", ...scanPathspecs], { env });

  const changed = [...new Set(
    [...tracked.split(/\r?\n/), ...untracked.split(/\r?\n/)]
      .map(v => v.trim())
      .filter(Boolean)
      .map(normalizeReleasePath)
  )].sort();

  const releaseRelevant = changed.filter(file => isReleaseRelevantPath(file, policy));
  const newIntents = changed.filter(isPendingIntentPath);

  const result = {
    baselineRef: CURRENT_LINE_BASELINE_REF,
    changedFilePatterns: policy.changedFilePatterns,
    releaseRelevant,
    newIntents,
    ok: releaseRelevant.length === 0 || newIntents.length > 0,
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error("Release-relevant Agent Core changes exist without a new pending changeset relative to the current-line baseline.");
    process.exitCode = 1;
  }
} finally {
  await fs.rm(tempIndex, { force: true }).catch(() => undefined);
  await fs.rm(tempIndex + ".lock", { force: true }).catch(() => undefined);
}
