import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./release-policy.mjs";

export const PRE_STATE_PATH = path.join(ROOT, ".changeset", "pre.json");

function validatePrereleaseTag(tag) {
  const value = String(tag ?? "").trim();
  if (!/^[0-9A-Za-z](?:[0-9A-Za-z.-]{0,62}[0-9A-Za-z])?$/.test(value) || value.includes("..")) {
    throw new Error("Invalid prerelease tag: " + tag);
  }
  return value;
}

function assertIso(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error("Invalid prerelease state " + field);
  }
  return value;
}

function validateState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid prerelease state object");
  }
  if (raw.version !== 1) throw new Error("Unsupported prerelease state version");
  if (raw.mode !== "pre" && raw.mode !== "exit") {
    throw new Error("Invalid prerelease state mode");
  }
  const tag = validatePrereleaseTag(raw.tag);
  const sequence = Number(raw.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("Invalid prerelease state sequence");
  }
  const enteredAt = assertIso(raw.enteredAt, "enteredAt");
  const exitRequestedAt = raw.exitRequestedAt == null
    ? undefined
    : assertIso(raw.exitRequestedAt, "exitRequestedAt");
  if (raw.mode === "exit" && !exitRequestedAt) {
    throw new Error("Prerelease exit state requires exitRequestedAt");
  }
  return {
    version: 1,
    mode: raw.mode,
    tag,
    sequence,
    enteredAt,
    ...(exitRequestedAt ? { exitRequestedAt } : {}),
  };
}

async function atomicWriteJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + ".agent-core-pre-" + process.pid + "-" + Date.now() + ".tmp";
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
    await fs.copyFile(temp, file);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
}

export async function readPrereleaseState(options = {}) {
  const file = options.file ?? PRE_STATE_PATH;
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new Error("Invalid prerelease state JSON", { cause: error });
    throw error;
  }
  return validateState(raw);
}

export async function enterPrerelease(tag, options = {}) {
  const file = options.file ?? PRE_STATE_PATH;
  const existing = await readPrereleaseState({ file });
  if (existing?.mode === "pre") {
    throw new Error("Prerelease mode is already active for tag " + existing.tag);
  }
  const now = new Date(options.now ?? Date.now()).toISOString();
  const state = {
    version: 1,
    mode: "pre",
    tag: validatePrereleaseTag(tag),
    sequence: 0,
    enteredAt: now,
  };
  await atomicWriteJson(file, state);
  return state;
}

export async function requestPrereleaseExit(options = {}) {
  const file = options.file ?? PRE_STATE_PATH;
  const existing = await readPrereleaseState({ file });
  if (!existing || existing.mode !== "pre") {
    throw new Error("Cannot exit prerelease mode because no active prerelease channel exists");
  }
  const state = {
    ...existing,
    mode: "exit",
    exitRequestedAt: new Date(options.now ?? Date.now()).toISOString(),
  };
  await atomicWriteJson(file, state);
  return state;
}

export async function advancePrereleaseSequence(expected, options = {}) {
  const file = options.file ?? PRE_STATE_PATH;
  const current = await readPrereleaseState({ file });
  if (!current || current.mode !== "pre") {
    throw new Error("Prerelease mode is not active");
  }
  if (current.tag !== expected.tag || current.sequence !== expected.sequence) {
    throw new Error("Prerelease state changed concurrently");
  }
  const next = { ...current, sequence: current.sequence + 1 };
  await atomicWriteJson(file, next);
  return next;
}

export function calculatePrereleaseVersion(targetStableVersion, state) {
  if (!state || state.mode !== "pre") return null;
  if (!/^\d+\.\d+\.\d+$/.test(String(targetStableVersion))) {
    throw new Error("Prerelease target must be stable semver x.y.z");
  }
  return String(targetStableVersion) + "-" + state.tag + "." + state.sequence;
}
