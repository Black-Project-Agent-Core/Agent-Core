import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { CURRENT_LINE_BASELINE_REF, ROOT } from "./release-lib.mjs";
import { loadReleasePolicy, releaseBaselinePathspecs } from "./release-policy.mjs";

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
const pathspecs = releaseBaselinePathspecs();
const tempDir = path.join(ROOT, "runtime", "tmp");
await fs.mkdir(tempDir, { recursive: true });
const tempIndex = path.join(tempDir, "agent-core-current-line-baseline-" + process.pid + ".index");
const env = { GIT_INDEX_FILE: tempIndex };

await fs.rm(tempIndex, { force: true }).catch(() => undefined);
await fs.rm(tempIndex + ".lock", { force: true }).catch(() => undefined);

try {
  await git(["read-tree", "--empty"], { env });
  await git(["add", "-f", "-A", "--", ...pathspecs], { env });

  const tree = await git(["write-tree"], { env });
  const commitEnv = {
    ...env,
    GIT_AUTHOR_NAME: "Agent Core Local Baseline",
    GIT_AUTHOR_EMAIL: "agent-core@local.invalid",
    GIT_COMMITTER_NAME: "Agent Core Local Baseline",
    GIT_COMMITTER_EMAIL: "agent-core@local.invalid",
  };
  const commit = await git(["commit-tree", tree, "-m", "Agent Core current-line release baseline"], { env: commitEnv });
  await git(["update-ref", CURRENT_LINE_BASELINE_REF, commit]);

  const count = await git(["ls-tree", "-r", "--name-only", commit], { env });
  const fileCount = count ? count.split(/\r?\n/).filter(Boolean).length : 0;
  console.log(JSON.stringify({
    ref: CURRENT_LINE_BASELINE_REF,
    commit,
    fileCount,
    changedFilePatterns: policy.changedFilePatterns,
  }, null, 2));
} finally {
  await fs.rm(tempIndex, { force: true }).catch(() => undefined);
  await fs.rm(tempIndex + ".lock", { force: true }).catch(() => undefined);
}
