import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { parseChangesetFile } from "@changesets/parse";
import { ROOT, readJson, validateStableSemver } from "./release-lib.mjs";

function run(command, args, cwd = ROOT, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function runCapture(command, args, cwd = ROOT, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
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
      else reject(new Error(`${command} exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

async function exists(target) {
  try { await fs.access(target); return true; }
  catch { return false; }
}

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function sourceFilter(source) {
  const rel = path.relative(ROOT, source).replaceAll("\\", "/");
  if (!rel) return true;
  const segments = rel.split("/");
  if (segments.some(segment => ["node_modules", "bin", "obj", "dist"].includes(segment))) return false;
  return true;
}

async function copyIfExists(relative, destinationRoot, options = {}) {
  const source = path.join(ROOT, relative);
  if (!await exists(source)) return;
  const destination = path.join(destinationRoot, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, {
    recursive: true,
    force: true,
    filter: options.filter,
  });
}
async function collectAppliedChanges(version) {
  const appliedRoot = path.join(ROOT, ".changeset", "applied");
  if (!await exists(appliedRoot)) return [];
  const dirs = (await fs.readdir(appliedRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.startsWith(`${version}-`))
    .map(entry => entry.name)
    .sort();

  const changes = [];
  for (const dir of dirs) {
    const fullDir = path.join(appliedRoot, dir);
    for (const file of (await fs.readdir(fullDir)).filter(name => name.endsWith(".md")).sort()) {
      const raw = await fs.readFile(path.join(fullDir, file), "utf8");
      const parsed = parseChangesetFile(raw);
      const release = parsed.releases.find(item => item.name === "agent-core");
      changes.push({
        id: file.replace(/\.md$/i, ""),
        type: release?.type ?? "none",
        summary: parsed.summary.trim(),
        archiveDir: dir,
      });
    }
  }
  return changes;
}

function releaseNotes(version, changes) {
  const body = changes.length
    ? changes.map(change => `- [${change.type}] ${change.summary.replace(/\s+/g, " ")}`).join("\n")
    : "- No archived release intents were found for this version.";
  return `# Agent Core v${version}\n\n## Changes\n\n${body}\n\n## Packaging boundary\n\nThis archive contains the current Agent Core runtime plus a source snapshot needed for audit/reconstruction. Live credentials, .env, secrets, OAuth/API-key state, user memory notes, tracker logs, browser profiles, backups, Git metadata, and protected reference repositories are intentionally excluded.\n`;
}

const pkg = await readJson(path.join(ROOT, "package.json"));
const version = String(pkg.version ?? "");
validateStableSemver(version);

const releaseRoot = path.join(ROOT, "release", `v${version}`);
const zipPath = path.join(releaseRoot, `Agent-Core-v${version}.zip`);
if (await exists(zipPath) && !process.argv.includes("--replace")) {
  throw new Error(`Release archive already exists and is immutable by default: ${zipPath}`);
}
if (await exists(releaseRoot) && !await exists(zipPath)) {
  await fs.rm(releaseRoot, { recursive: true, force: true });
}

const stageBase = path.join(ROOT, "runtime", "tmp", `agent-core-release-v${version}-${process.pid}`);
const packageName = `Agent-Core-v${version}`;
const packageRoot = path.join(stageBase, packageName);
const launcherOut = path.join(stageBase, "launcher");

await fs.rm(stageBase, { recursive: true, force: true });
await fs.mkdir(packageRoot, { recursive: true });
await fs.mkdir(releaseRoot, { recursive: true });

const node = path.join(ROOT, "runtime", "node", "node.exe");
const npmCli = path.join(ROOT, "runtime", "node", "node_modules", "npm", "bin", "npm-cli.js");
const dotnetLocal = path.join(ROOT, "runtime", "dotnet-sdk", "dotnet.exe");
const dotnet = await exists(dotnetLocal) ? dotnetLocal : "dotnet";
const runtimeEnv = {
  TEMP: path.join(ROOT, "runtime", "tmp"),
  TMP: path.join(ROOT, "runtime", "tmp"),
  npm_config_cache: path.join(ROOT, "runtime", "npm-cache"),
  npm_config_prefix: path.join(ROOT, "runtime", "npm-prefix"),
  DOTNET_CLI_HOME: path.join(ROOT, "runtime", "dotnet-home"),
  NUGET_PACKAGES: path.join(ROOT, "runtime", "nuget-packages"),
};

await run(node, [npmCli, "run", "build"], ROOT, runtimeEnv);
await run(node, [npmCli, "run", "build"], path.join(ROOT, "src", "ui"), runtimeEnv);
await run(dotnet, [
  "publish",
  path.join(ROOT, "src", "launcher", "AgentCore.Launcher.csproj"),
  "-c", "Release",
  "-r", "win-x64",
  "--self-contained", "true",
  "-p:PublishSingleFile=true",
  "-p:IncludeNativeLibrariesForSelfExtract=true",
  "-o", launcherOut,
], ROOT, runtimeEnv);

const rootFiles = [
  "AGENTS.md",
  "CHANGELOG.md",
  "package.json",
  "package-lock.json",
  ".env.example",
  ".grafelignore",
  "SECURITY.md",
  "Maintenance.md",
];
for (const relative of rootFiles) await copyIfExists(relative, packageRoot);

await copyIfExists("assets", packageRoot);
await copyIfExists("node_modules", packageRoot);
await copyIfExists("runtime/node", packageRoot);
await copyIfExists("runtime/grafel/bin", packageRoot);
await copyIfExists("runtime/grafel/provider.json", packageRoot);
await copyIfExists("runtime/memory/00-agent-core-memory.md", packageRoot);
await copyIfExists("scripts/windows", packageRoot);

const distSource = path.join(ROOT, "dist");
const distTarget = path.join(packageRoot, "dist");
await fs.cp(distSource, distTarget, {
  recursive: true,
  force: true,
  filter: source => !path.relative(distSource, source).replaceAll("\\", "/").startsWith(".desktop-commander"),
});

await fs.mkdir(path.join(packageRoot, "tunnel-client"), { recursive: true });
await fs.copyFile(
  path.join(ROOT, "tunnel-client", "tunnel-client.exe"),
  path.join(packageRoot, "tunnel-client", "tunnel-client.exe"),
);
const tunnelExample = await fs.readFile(path.join(ROOT, "tunnel-client", "agent-core.example.yaml"), "utf8");
await fs.writeFile(path.join(packageRoot, "tunnel-client", "agent-core.example.yaml"), tunnelExample);
await fs.writeFile(path.join(packageRoot, "tunnel-client", "agent-core.yaml"), tunnelExample);

const launcherExe = path.join(launcherOut, "Agent Core.exe");
await fs.copyFile(launcherExe, path.join(packageRoot, "Agent Core.exe"));
const sourceRoot = path.join(packageRoot, "source");
await fs.mkdir(sourceRoot, { recursive: true });
await fs.cp(path.join(ROOT, "src"), path.join(sourceRoot, "src"), {
  recursive: true,
  force: true,
  filter: sourceFilter,
});
await fs.cp(path.join(ROOT, "scripts", "release"), path.join(sourceRoot, "scripts", "release"), {
  recursive: true,
  force: true,
});
for (const relative of ["tsconfig.json", "vitest.config.ts"]) {
  await copyIfExists(relative, sourceRoot);
}
await fs.mkdir(path.join(sourceRoot, "docs"), { recursive: true });
for (const doc of [
  "CODEBASE.md",
  "Changesets-Release-Intent-Version-Integrity-Integration-Plan.md",
]) {
  const source = path.join(ROOT, "docs", doc);
  if (await exists(source)) await fs.copyFile(source, path.join(sourceRoot, "docs", doc));
}

const changes = await collectAppliedChanges(version);
const notes = releaseNotes(version, changes);
const notesPath = path.join(packageRoot, "RELEASE-NOTES.md");
await fs.writeFile(notesPath, notes, "utf8");

const baselineRef = await runCapture(
  "git",
  ["-c", `safe.directory=${ROOT.replaceAll("\\", "/")}`, "-C", ROOT, "rev-parse", "refs/agent-core/current-line-baseline"],
).catch(() => null);

const launcherHash = await sha256(launcherExe);
const manifest = {
  product: "Agent Core",
  version,
  generatedAt: new Date().toISOString(),
  changes,
  currentLineBaselineRef: baselineRef || null,
  legacyRepository: pkg.legacyRepository ?? null,
  nativeLauncher: {
    file: "Agent Core.exe",
    sha256: launcherHash,
    expectedFileVersion: `${version}.0`,
    expectedProductVersion: version,
  },
  includes: [
    "Agent Core.exe",
    "dist runtime without dist/.desktop-commander debris",
    "root node_modules",
    "project-local Node runtime",
    "Grafel provider binary + provider metadata",
    "foundational memory bootstrap only",
    "portable tunnel client with placeholder/non-secret profile",
    "source snapshot excluding node_modules/bin/obj/dist",
  ],
  excluded: [
    ".env and credential files",
    "secrets/",
    "runtime/bridge-auth",
    "runtime/memory user notes/index/state",
    "runtime/tracker and logs",
    "runtime/webview2/browser profiles",
    "runtime/backups",
    ".git and Git worktree metadata",
    "protected DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT references",
    "live tunnel profile/credentials",
  ],
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
await fs.writeFile(path.join(packageRoot, "RELEASE-MANIFEST.json"), manifestText, "utf8");

const releaseMetadataRoot = path.join(sourceRoot, ".changeset", "applied");
await fs.mkdir(releaseMetadataRoot, { recursive: true });
const appliedRoot = path.join(ROOT, ".changeset", "applied");
if (await exists(appliedRoot)) {
  for (const dir of await fs.readdir(appliedRoot, { withFileTypes: true })) {
    if (dir.isDirectory() && dir.name.startsWith(`${version}-`)) {
      await fs.cp(
        path.join(appliedRoot, dir.name),
        path.join(releaseMetadataRoot, dir.name),
        { recursive: true, force: true },
      );
    }
  }
}
const zipScript = [
  "Add-Type -AssemblyName System.IO.Compression.FileSystem",
  "$src=$env:AGENT_CORE_RELEASE_PACKAGE_ROOT",
  "$zip=$env:AGENT_CORE_RELEASE_ZIP",
  "if(Test-Path -LiteralPath $zip){Remove-Item -LiteralPath $zip -Force}",
  "[System.IO.Compression.ZipFile]::CreateFromDirectory($src,$zip,[System.IO.Compression.CompressionLevel]::Optimal,$true)",
].join("; ");

await run(
  "powershell.exe",
  ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", zipScript],
  ROOT,
  {
    ...runtimeEnv,
    AGENT_CORE_RELEASE_PACKAGE_ROOT: packageRoot,
    AGENT_CORE_RELEASE_ZIP: zipPath,
  },
);

const zipHash = await sha256(zipPath);
const zipStat = await fs.stat(zipPath);

await fs.copyFile(notesPath, path.join(releaseRoot, "RELEASE-NOTES.md"));
await fs.writeFile(path.join(releaseRoot, "RELEASE-MANIFEST.json"), manifestText, "utf8");
await fs.writeFile(
  path.join(releaseRoot, "SHA256SUMS.txt"),
  `${zipHash}  Agent-Core-v${version}.zip\n`,
  "utf8",
);

await fs.rm(stageBase, { recursive: true, force: true });

console.log(JSON.stringify({
  version,
  releaseRoot,
  zipPath,
  bytes: zipStat.size,
  sha256: zipHash,
  changeCount: changes.length,
}, null, 2));
