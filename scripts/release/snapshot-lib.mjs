import { calculateReleasePlan } from "./release-lib.mjs";
import { loadReleasePolicy, ROOT } from "./release-policy.mjs";
import { spawn } from "node:child_process";
import { readPrereleaseState } from './prerelease-lib.mjs';
import { parseProductVersion } from './release-lib.mjs';
import path from 'node:path';

const PLACEHOLDER = /\{([a-z-]+)\}/g;
const ALLOWED = new Set(["tag", "commit", "commit-short", "datetime", "timestamp"]);
const TAG_RE = /^[0-9A-Za-z](?:[0-9A-Za-z.-]{0,62}[0-9A-Za-z])?$/;

function execCapture(command, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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
      else reject(new Error(command + " failed (" + code + "): " + (stderr.trim() || stdout.trim())));
    });
  });
}

export function validateReleaseTag(tag) {
  const value = String(tag ?? "").trim();
  if (!value || !TAG_RE.test(value) || value.includes("..")) {
    throw new Error("Invalid snapshot/prerelease tag: " + tag);
  }
  return value;
}

export function snapshotDateParts(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Invalid snapshot date");
  }
  return {
    timestamp: String(date.getTime()),
    datetime: date.toISOString().replace(/\.\d{3}Z$/, "").replace(/[^\d]/g, ""),
  };
}

export function renderSnapshotSuffix(template, values) {
  const raw = String(template ?? "").trim();
  if (!raw) throw new Error("Snapshot prerelease template is required");
  const unknown = [...raw.matchAll(PLACEHOLDER)]
    .map(match => match[1])
    .filter(name => !ALLOWED.has(name));
  if (unknown.length) {
    throw new Error("Unsupported snapshot placeholder: {" + unknown[0] + "}");
  }
  const rendered = raw.replace(PLACEHOLDER, (_full, name) => {
    const value = values[name];
    if (value == null || String(value).trim() === "") {
      throw new Error("Snapshot placeholder {" + name + "} has no value");
    }
    return String(value);
  });
  if (!/^[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*$/.test(rendered)) {
    throw new Error("Snapshot suffix is not valid semver prerelease syntax: " + rendered);
  }
  return rendered;
}

export async function currentCommit(root = ROOT) {
  return await execCapture("git", [
    "-c",
    "safe.directory=" + root.replaceAll("\\", "/"),
    "-C",
    root,
    "rev-parse",
    "HEAD",
  ], root);
}

export async function calculateSnapshotPlan(options = {}) {
  const root = options.root ?? ROOT;
  const policy = await loadReleasePolicy(root);
  const plan = await calculateReleasePlan({root});
  const identity = parseProductVersion(plan.currentVersion);
  const preState = await readPrereleaseState({file: path.join(root, '.changeset', 'pre.json')});
  const stableProductVersion = identity.prerelease ? preState?.stableProductVersion : plan.currentVersion;
  if (!stableProductVersion) throw new Error('Prerelease state must record the previous stableProductVersion');
  const tag = validateReleaseTag(options.tag ?? "dev");
  const commit = String(options.commit ?? await currentCommit(root)).trim();
  if (!/^[0-9a-fA-F]{7,64}$/.test(commit)) {
    throw new Error("Snapshot commit must be a Git SHA");
  }
  const date = options.date instanceof Date ? options.date : new Date(options.date ?? Date.now());
  const dateParts = snapshotDateParts(date);
  const template = String(options.template ?? policy.snapshot.prereleaseTemplate);
  const suffix = renderSnapshotSuffix(template, {
    tag,
    commit,
    "commit-short": commit.slice(0, 7),
    ...dateParts,
  });
  const baseVersion = policy.snapshot.useCalculatedVersion ? plan.nextVersion : "0.0.0";
  return {
    kind: "snapshot",
    stableProductVersion,
    runtimeProductVersion: plan.currentVersion,
    targetStableVersion: plan.nextVersion,
    bump: plan.bump,
    pendingIntentIds: plan.changesets.map(change => change.id),
    tag,
    template,
    commit,
    generatedAt: date.toISOString(),
    snapshotVersion: baseVersion + "-" + suffix,
  };
}
