import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { ROOT } from "./release-policy.mjs";
import { packageCopyAllowed, writePackagedFoundation } from "./packaging-policy.mjs";
import { isGeneratedReleasePath } from './release-policy.mjs';
import { parseProductVersion } from './release-lib.mjs';

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, cwd = ROOT, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(command + " exited with code " + code));
    });
  });
}

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function safeArtifactVersion(version) {
  const value = String(version ?? "").trim();
  if (!/^\d+\.\d+\.\d+-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*$/.test(value)) {
    throw new Error("Artifact version must be prerelease semver: " + value);
  }
  return value;
}

function safeKind(kind) {
  if (kind !== "snapshot" && kind !== "prerelease") {
    throw new Error("Unsupported development artifact kind: " + kind);
  }
  return kind;
}

async function copyIfExists(root, relative, destinationRoot, options = {}) {
  const source = path.join(root, relative);
  if (!await exists(source)) return false;
  const destination = path.join(destinationRoot, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, {
    recursive: true,
    force: true,
    filter: async source => await packageCopyAllowed(root, source) && (!options.filter || await options.filter(source)),
  });
  return true;
}

export async function copyDevelopmentSources(root, packageRoot) {
  for (const relative of ['vendor/archify', 'SubProject/agent-core-memory/dist',
    'SubProject/agent-core-memory/NOTICE.md', 'SubProject/agent-core-memory/PATCHES.md',
    'THIRD_PARTY_NOTICES.md']) await copyIfExists(root, relative, packageRoot);
  const sourceRoot = path.join(packageRoot, 'source');
  for (const relative of ['src', 'SubProject/agent-core-memory/src',
    'SubProject/agent-core-memory/package.json', 'SubProject/agent-core-memory/tsconfig.json',
    'SubProject/agent-core-memory/UPSTREAM-SOURCE.json', 'SubProject/agent-core-memory/README.md',
    'SubProject/agent-core-memory/NOTICE.md', 'SubProject/agent-core-memory/PATCHES.md']) {
    await copyIfExists(root, relative, sourceRoot, {
      filter: source => !isGeneratedReleasePath(path.relative(root, source)),
    });
  }
}

export function developmentArtifactLocation(root, kind, artifactVersion) {
  const safe = safeArtifactVersion(artifactVersion);
  const folder = kind === "snapshot" ? "snapshots" : "prereleases";
  return path.join(root, "release", folder, safe);
}

export async function createDevelopmentArtifact(options) {
  const root = options.root ?? ROOT;
  const kind = safeKind(options.kind);
  const artifactVersion = safeArtifactVersion(options.artifactVersion);
  const stableProductVersion = String(options.stableProductVersion ?? "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(stableProductVersion)) {
    throw new Error("Stable product version must be x.y.z");
  }
  const runtimeProductVersion = options.runtimeProductVersion ?? stableProductVersion;
  parseProductVersion(runtimeProductVersion);

  const outputRoot = developmentArtifactLocation(root, kind, artifactVersion);
  if (await exists(outputRoot)) {
    throw new Error("Development artifact already exists and is immutable: " + outputRoot);
  }

  const stageBase = path.join(root, "runtime", "tmp", "agent-core-" + kind + "-" + process.pid + "-" + Date.now());
  const packageName = "Agent-Core-" + kind + "-" + artifactVersion;
  const packageRoot = path.join(stageBase, packageName);
  const zipName = packageName + ".zip";
  const zipPath = path.join(outputRoot, zipName);

  await fs.rm(stageBase, { recursive: true, force: true });
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.mkdir(path.dirname(outputRoot), { recursive: true });
  await fs.mkdir(outputRoot); // Exclusive reservation: never share a live artifact destination.

  try {
    for (const relative of [
      "AGENTS.md",
      "CHANGELOG.md",
      "package.json",
      "package-lock.json",
      ".env.example",
      "SECURITY.md",
      "Maintenance.md",
    ]) {
      await copyIfExists(root, relative, packageRoot);
    }

    for (const relative of [
      "assets",
      "dist",
      "node_modules",
      "runtime/node",
      "runtime/grafel/bin",
      "runtime/grafel/provider.json",
      "scripts/windows",
      "tunnel-client/tunnel-client.exe",
    ]) {
      await copyIfExists(root, relative, packageRoot);
    }

    if (options.launcherPath) await fs.copyFile(options.launcherPath, path.join(packageRoot, 'Agent Core.exe'));
    else await copyIfExists(root, 'Agent Core.exe', packageRoot);

    await writePackagedFoundation(packageRoot);
    await copyDevelopmentSources(root, packageRoot);
    const tunnelExample = path.join(root, "tunnel-client", "agent-core.example.yaml");
    if (await exists(tunnelExample)) {
      const tunnelTarget = path.join(packageRoot, "tunnel-client");
      await fs.mkdir(tunnelTarget, { recursive: true });
      const text = await fs.readFile(tunnelExample, "utf8");
      await fs.writeFile(path.join(tunnelTarget, "agent-core.example.yaml"), text, "utf8");
      await fs.writeFile(path.join(tunnelTarget, "agent-core.yaml"), text, "utf8");
    }

    const manifest = {
      product: "Agent Core",
      artifactKind: kind,
      artifactVersion,
      stableProductVersion,
      runtimeProductIdentity: runtimeProductVersion,
      generatedAt: new Date().toISOString(),
      identity: options.identity ?? {},
      pendingIntentIds: options.pendingIntentIds ?? [],
      boundary: {
        nonConsuming: true,
        stableProductVersionMutated: false,
        pendingIntentsConsumed: false,
        currentLineBaselineMutated: false,
        stableReleaseArchiveMutated: false,
      },
      excluded: [
        ".env and credential files",
        "secrets/",
        "runtime/bridge-auth",
        "runtime/memory including user bootstrap (fresh product template only)",
        "runtime/tracker and logs",
        "runtime/webview2/browser profiles",
        "runtime/backups",
        ".git and Git worktree metadata",
        "protected reference repositories",
        "live tunnel profile/credentials",
      ],
    };
    const manifestText = JSON.stringify(manifest, null, 2) + "\n";
    const notes = "# Agent Core " + kind + " artifact\n\n"
      + "- Artifact identity: " + artifactVersion + "\n"
      + "- Runtime product identity: " + runtimeProductVersion + "\n"
      + "- Previous stable source baseline: " + stableProductVersion + "\n"
      + "- Pending release intents are preserved and not consumed.\n"
      + "- This artifact is not a stable Agent Core release and does not replace release/v" + stableProductVersion + ".\n";

    await fs.writeFile(path.join(packageRoot, "ARTIFACT-MANIFEST.json"), manifestText, "utf8");
    await fs.writeFile(path.join(packageRoot, "ARTIFACT-NOTES.md"), notes, "utf8");

    const zipScript = [
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      "$src=$env:AGENT_CORE_ARTIFACT_ROOT",
      "$zip=$env:AGENT_CORE_ARTIFACT_ZIP",
      "if(Test-Path -LiteralPath $zip){throw 'artifact zip already exists'}",
      "[System.IO.Compression.ZipFile]::CreateFromDirectory($src,$zip,[System.IO.Compression.CompressionLevel]::Optimal,$true)",
    ].join("; ");

    await run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", zipScript], root, {
      AGENT_CORE_ARTIFACT_ROOT: packageRoot,
      AGENT_CORE_ARTIFACT_ZIP: zipPath,
    });

    const hash = await sha256(zipPath);
    await fs.writeFile(path.join(outputRoot, "ARTIFACT-MANIFEST.json"), manifestText, "utf8");
    await fs.writeFile(path.join(outputRoot, "ARTIFACT-NOTES.md"), notes, "utf8");
    await fs.writeFile(path.join(outputRoot, "SHA256SUMS.txt"), hash + "  " + zipName + "\n", "utf8");

    return {
      kind,
      artifactVersion,
      stableProductVersion,
      runtimeProductVersion,
      outputRoot,
      zipPath,
      sha256: hash,
    };
  } catch (error) {
    await fs.rm(outputRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    await fs.rm(stageBase, { recursive: true, force: true }).catch(() => undefined);
  }
}
