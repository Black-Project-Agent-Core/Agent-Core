import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  filterPendingIntentFilenames,
  isGeneratedReleasePath,
  isPendingIntentPath,
  isReleaseRelevantPath,
  loadReleasePolicy,
  releaseBaselinePathspecs,
} from "../scripts/release/release-policy.mjs";
import {
  renderSnapshotSuffix,
  snapshotDateParts,
  validateReleaseTag,
} from "../scripts/release/snapshot-lib.mjs";
import {
  advancePrereleaseSequence,
  calculatePrereleaseVersion,
  enterPrerelease,
  readPrereleaseState,
  requestPrereleaseExit,
} from "../scripts/release/prerelease-lib.mjs";
import {
  createDevelopmentArtifact,
  developmentArtifactLocation,
} from "../scripts/release/development-artifact.mjs";
import { readPendingChangesets } from "../scripts/release/release-lib.mjs";

const roots: string[] = [];

async function tempRoot(prefix: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("Changesets-derived release second wave", () => {
  it("uses changedFilePatterns while keeping release-control paths mandatory", async () => {
    const root = await tempRoot("agent-core-release-policy-");
    await mkdir(path.join(root, ".changeset"), { recursive: true });
    await writeFile(path.join(root, ".changeset", "config.json"), JSON.stringify({
      changedFilePatterns: ["src/memory/**", "!src/memory/generated/**"],
      snapshot: {
        useCalculatedVersion: true,
        prereleaseTemplate: "{tag}.{datetime}.{commit-short}",
      },
    }));
    const policy = await loadReleasePolicy(root);
    expect(isReleaseRelevantPath("src/memory/service.ts", policy)).toBe(true);
    expect(isReleaseRelevantPath("src/memory/generated/cache.ts", policy)).toBe(false);
    expect(isReleaseRelevantPath("src/phone/controller.ts", policy)).toBe(false);
    expect(isReleaseRelevantPath("scripts/release/release-plan.mjs", policy)).toBe(true);
    expect(isReleaseRelevantPath(".changeset/config.json", policy)).toBe(true);
    expect(isReleaseRelevantPath("package-lock.json", policy)).toBe(true);
  });

  it("excludes partial node_modules dependency debris from release relevance and baseline", () => {
    const debris = "src/ui/node_modules.partial-20260924-1910/pkg/index.js";
    expect(isGeneratedReleasePath(debris)).toBe(true);
    expect(isReleaseRelevantPath(debris, {
      changedFilePatterns: ["src/**"],
      snapshot: { useCalculatedVersion: true, prereleaseTemplate: "{tag}.{datetime}.{commit-short}" },
    })).toBe(false);
    expect(releaseBaselinePathspecs()).toContain(":(exclude)src/**/node_modules.partial-*/**");
  });

  it("filters non-intent metadata markdown while keeping real intents deterministic", () => {
    expect(filterPendingIntentFilenames([
      "zeta.md",
      "README.md",
      "AGENTS.md",
      "CLAUDE.md",
      "GEMINI.md",
      ".hidden.md",
      "alpha.md",
      "config.json",
    ])).toEqual(["alpha.md", "zeta.md"]);
    expect(isPendingIntentPath(".changeset/alpha.md")).toBe(true);
    expect(isPendingIntentPath(".changeset/AGENTS.md")).toBe(false);
    expect(isPendingIntentPath(".changeset/.hidden.md")).toBe(false);
  });

  it("ignores metadata markdown at parser level but keeps malformed real intents fail-closed", async () => {
    const root = await tempRoot("agent-core-intent-reader-");
    const dir = path.join(root, ".changeset");
    await mkdir(dir, { recursive: true });
    for (const name of ["README.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md", ".hidden.md"]) {
      await writeFile(path.join(dir, name), "not release metadata\n");
    }
    await writeFile(path.join(dir, "alpha.md"), "---\n\"agent-core\": patch\n---\n\nAlpha intent.\n");
    await writeFile(path.join(dir, "zeta.md"), "---\n\"agent-core\": minor\n---\n\nZeta intent.\n");
    expect((await readPendingChangesets(dir)).map(item => item.id)).toEqual(["alpha", "zeta"]);

    await writeFile(path.join(dir, "broken.md"), "malformed real intent\n");
    await expect(readPendingChangesets(dir)).rejects.toThrow(/could not parse changeset/i);
  });

  it("renders bounded snapshot identities and rejects unsupported placeholders", () => {
    const date = new Date("2026-09-20T06:00:00.000Z");
    const parts = snapshotDateParts(date);
    expect(parts.datetime).toBe("20260920060000");
    expect(validateReleaseTag("dev")).toBe("dev");
    expect(renderSnapshotSuffix("{tag}.{datetime}.{commit-short}", {
      tag: "dev",
      datetime: parts.datetime,
      timestamp: parts.timestamp,
      commit: "abcdef0123456789",
      "commit-short": "abcdef0",
    })).toBe("dev.20260920060000.abcdef0");
    expect(() => renderSnapshotSuffix("{unknown}", {
      tag: "dev",
    })).toThrow(/Unsupported snapshot placeholder/);
  });

  it("packages a development artifact under a non-stable namespace without rewriting source state", async () => {
    const root = await tempRoot("agent-core-dev-artifact-");
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "agent-core", version: "0.11.0" }));
    await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ name: "agent-core", version: "0.11.0" }));
    await writeFile(path.join(root, "dist", "index.js"), "console.log('fixture');\n");
    const before = await readFile(path.join(root, "package.json"), "utf8");
    const version = "0.12.0-dev.20260920060000.abcdef0";
    const artifact = await createDevelopmentArtifact({
      root,
      kind: "snapshot",
      artifactVersion: version,
      stableProductVersion: "0.11.0",
      pendingIntentIds: ["fixture-intent"],
      identity: { tag: "dev" },
    });
    expect(artifact.outputRoot).toBe(developmentArtifactLocation(root, "snapshot", version));
    expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(before);
    expect(artifact.outputRoot).toContain(path.join("release", "snapshots"));
    expect(artifact.outputRoot).not.toContain(path.join("release", "v0.11.0"));
  });

  it("validates prerelease enter/exit transitions and increments sequence explicitly", async () => {
    const root = await tempRoot("agent-core-pre-state-");
    const file = path.join(root, ".changeset", "pre.json");
    const entered = await enterPrerelease("beta", {
      file,
      now: "2026-09-20T06:00:00.000Z",
    });
    expect(entered.mode).toBe("pre");
    expect(entered.sequence).toBe(0);
    expect(calculatePrereleaseVersion("0.12.0", entered)).toBe("0.12.0-beta.0");
    await expect(enterPrerelease("next", { file })).rejects.toThrow(/already active/);

    const advanced = await advancePrereleaseSequence(entered, { file });
    expect(advanced.sequence).toBe(1);
    expect(calculatePrereleaseVersion("0.12.0", advanced)).toBe("0.12.0-beta.1");

    const exited = await requestPrereleaseExit({
      file,
      now: "2026-09-20T07:00:00.000Z",
    });
    expect(exited.mode).toBe("exit");
    expect(calculatePrereleaseVersion("0.12.0", exited)).toBeNull();
    await expect(requestPrereleaseExit({ file })).rejects.toThrow(/no active prerelease channel/);
  });

  it("rejects malformed persistent prerelease state", async () => {
    const root = await tempRoot("agent-core-pre-invalid-");
    const file = path.join(root, ".changeset", "pre.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({
      version: 1,
      mode: "pre",
      tag: "beta",
      sequence: -1,
      enteredAt: "not-a-date",
    }));
    await expect(readPrereleaseState({ file })).rejects.toThrow(/Invalid prerelease state/);
  });
});
