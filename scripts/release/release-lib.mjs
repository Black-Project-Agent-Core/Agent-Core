import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseChangesetFile } from "@changesets/parse";
import { filterPendingIntentFilenames } from "./release-policy.mjs";

export const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const CHANGESET_DIR = path.join(ROOT, ".changeset");
export const MEMORY_INTENT_DIR = path.join(ROOT, "docs", "memory", "release-intents");
export const PRODUCT_NAME = "agent-core";
export const CURRENT_LINE_BASELINE_REF = "refs/agent-core/current-line-baseline";

const BUMP_RANK = { patch: 1, minor: 2, major: 3 };

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export function validateStableSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Agent Core first-wave release tooling requires stable semver x.y.z, received: ${version}`);
  return match.slice(1).map(Number);
}

export function incrementVersion(version, bump) {
  const [major, minor, patch] = validateStableSemver(version);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  if (bump === "none") return version;
  throw new Error(`Unsupported release bump: ${bump}`);
}

export async function readPendingChangesets(changesetDir = CHANGESET_DIR) {
  if (changesetDir === CHANGESET_DIR) {
    const main = await readPendingChangesetsFromDirectory(CHANGESET_DIR);
    const memory = await readPendingChangesetsFromDirectory(MEMORY_INTENT_DIR);
    const ids = new Set(main.map(item => item.id));
    for (const item of memory) {
      if (ids.has(item.id)) throw new Error(`Duplicate release intent: ${item.id}`);
      ids.add(item.id);
    }
    return [...main, ...memory].sort((a, b) => a.id.localeCompare(b.id));
  }
  return readPendingChangesetsFromDirectory(changesetDir);
}

async function readPendingChangesetsFromDirectory(changesetDir) {
  let entries;
  try { entries = await fs.readdir(changesetDir, { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT" && changesetDir === MEMORY_INTENT_DIR) return []; throw error; }
  const files = filterPendingIntentFilenames(
    entries.filter(entry => entry.isFile()).map(entry => entry.name),
  );

  const changesets = [];
  for (const file of files) {
    const fullPath = path.join(changesetDir, file);
    const parsed = parseChangesetFile(await fs.readFile(fullPath, "utf8"));
    if (!parsed.summary.trim()) throw new Error(`Changeset ${file} has an empty summary`);
    if (parsed.releases.length !== 1) {
      throw new Error(`Changeset ${file} must contain exactly one Agent Core release entry`);
    }
    const release = parsed.releases[0];
    if (release.name !== PRODUCT_NAME) {
      throw new Error(`Changeset ${file} targets ${release.name}; expected ${PRODUCT_NAME}`);
    }
    if (!(release.type in BUMP_RANK)) {
      throw new Error(`Changeset ${file} uses unsupported bump ${release.type}; expected patch, minor, or major`);
    }
    changesets.push({
      id: file.slice(0, -3),
      file,
      fullPath,
      type: release.type,
      summary: parsed.summary.trim(),
    });
  }
  return changesets;
}

export async function calculateReleasePlan() {
  const pkg = await readJson(path.join(ROOT, "package.json"));
  const currentVersion = String(pkg.version ?? "");
  validateStableSemver(currentVersion);
  const changesets = await readPendingChangesets();
  let bump = "none";
  for (const changeset of changesets) {
    if (BUMP_RANK[changeset.type] > (BUMP_RANK[bump] ?? 0)) bump = changeset.type;
  }
  return {
    product: PRODUCT_NAME,
    currentVersion,
    bump,
    nextVersion: incrementVersion(currentVersion, bump),
    changesets,
  };
}

export async function readOptional(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
async function atomicWrite(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.agent-core-release-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.writeFile(temp, content, "utf8");
    await fs.copyFile(temp, file);
    await fs.rm(temp, { force: true });
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function writeTransaction(entries) {
  const originals = new Map();
  for (const { file } of entries) originals.set(file, await readOptional(file));
  const applied = [];
  try {
    for (const { file, content } of entries) {
      await atomicWrite(file, content);
      applied.push(file);
    }
  } catch (error) {
    for (const file of applied.reverse()) {
      const original = originals.get(file);
      if (original == null) await fs.rm(file, { force: true }).catch(() => undefined);
      else await atomicWrite(file, original).catch(() => undefined);
    }
    throw error;
  }

  return async function rollback() {
    for (const { file } of [...entries].reverse()) {
      const original = originals.get(file);
      if (original == null) await fs.rm(file, { force: true });
      else await atomicWrite(file, original);
    }
  };
}

export function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function isoDateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
function setJsonVersion(json, version) {
  json.version = version;
  if (json.packages?.[""]) json.packages[""].version = version;
  return json;
}

function setCsprojVersions(xml, version, nativeVersion) {
  const values = {
    Version: version,
    FileVersion: nativeVersion,
    AssemblyVersion: nativeVersion,
    InformationalVersion: version,
    IncludeSourceRevisionInInformationalVersion: "false",
  };
  const missing = [];
  for (const [tag, value] of Object.entries(values)) {
    const pattern = new RegExp(`^[\\t ]*<${tag}>[^<]*<\\/${tag}>[\\t ]*$`, "m");
    if (pattern.test(xml)) xml = xml.replace(pattern, `    <${tag}>${value}</${tag}>`);
    else missing.push(`    <${tag}>${value}</${tag}>`);
  }
  if (missing.length > 0) {
    xml = xml.replace("<PropertyGroup>", `<PropertyGroup>\n${missing.join("\n")}`);
  }
  return xml;
}

export async function buildVersionEdits(version) {
  validateStableSemver(version);
  const nativeVersion = `${version}.0`;
  const rootPackagePath = path.join(ROOT, "package.json");
  const rootLockPath = path.join(ROOT, "package-lock.json");
  const uiPackagePath = path.join(ROOT, "src", "ui", "package.json");
  const uiLockPath = path.join(ROOT, "src", "ui", "package-lock.json");
  const versionSourcePath = path.join(ROOT, "src", "version.ts");
  const launcherProjectPath = path.join(ROOT, "src", "launcher", "AgentCore.Launcher.csproj");

  const [rootPackage, rootLock, uiPackage, uiLock, launcherProject] = await Promise.all([
    readJson(rootPackagePath),
    readJson(rootLockPath),
    readJson(uiPackagePath),
    readJson(uiLockPath),
    fs.readFile(launcherProjectPath, "utf8"),
  ]);

  const csproj = setCsprojVersions(launcherProject, version, nativeVersion);

  return [
    { file: rootPackagePath, content: jsonText(setJsonVersion(rootPackage, version)) },
    { file: rootLockPath, content: jsonText(setJsonVersion(rootLock, version)) },
    { file: uiPackagePath, content: jsonText(setJsonVersion(uiPackage, version)) },
    { file: uiLockPath, content: jsonText(setJsonVersion(uiLock, version)) },
    {
      file: versionSourcePath,
      content:
        "// Generated/synchronized from root package.json by scripts/release/sync-version.mjs.\n" +
        `export const AGENT_CORE_VERSION = '${version}';\n`,
    },
    { file: launcherProjectPath, content: csproj },
  ];
}

export async function syncVersion(version) {
  const entries = await buildVersionEdits(version);
  const rollback = await writeTransaction(entries);
  return { entries, rollback };
}
