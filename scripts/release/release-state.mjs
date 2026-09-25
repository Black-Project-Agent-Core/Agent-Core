import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { CURRENT_LINE_BASELINE_REF, ROOT, readPendingChangesets } from "./release-lib.mjs";

async function readOptional(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function git(args, root = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [
      "-c",
      "safe.directory=" + root.replaceAll("\\", "/"),
      "-C",
      root,
      ...args,
    ], {
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
      else reject(new Error("git failed (" + code + "): " + (stderr.trim() || stdout.trim())));
    });
  });
}

async function stableArchiveNames(root) {
  const releaseRoot = path.join(root, "release");
  try {
    return (await fs.readdir(releaseRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name))
      .map(entry => entry.name)
      .sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function captureReleaseState(root = ROOT) {
  const changesets = await readPendingChangesets();
  const baseline = await git(["rev-parse", CURRENT_LINE_BASELINE_REF], root).catch(() => null);
  return {
    packageJson: await readOptional(path.join(root, "package.json")),
    packageLock: await readOptional(path.join(root, "package-lock.json")),
    versionSource: await readOptional(path.join(root, "src", "version.ts")),
    changelog: await readOptional(path.join(root, "CHANGELOG.md")),
    preState: await readOptional(path.join(root, ".changeset", "pre.json")),
    pendingIntents: changesets.map(change => change.file).sort(),
    currentLineBaseline: baseline,
    stableArchives: await stableArchiveNames(root),
  };
}

export function assertReleaseStateUnchanged(before, after) {
  const left = JSON.stringify(before);
  const right = JSON.stringify(after);
  if (left !== right) {
    throw new Error("Development artifact operation changed stable release state");
  }
}
