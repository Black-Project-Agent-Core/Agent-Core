import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const CHANGESET_CONFIG = path.join(ROOT, ".changeset", "config.json");

const MAX_PATTERNS = 128;
const MAX_PATTERN_LENGTH = 256;
const GENERATED_SEGMENTS = new Set(["bin", "obj", "node_modules", "dist"]);
const AI_METADATA_MARKDOWN = new Set([
  "readme.md",
  "agents.md",
  "claude.md",
  "gemini.md",
]);

export const MANDATORY_RELEASE_FILES = new Set([
  "package.json",
  "package-lock.json",
  ".changeset/config.json",
]);

export function normalizeReleasePath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function validatePattern(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("changedFilePatterns entries must be non-empty strings");
  }
  const pattern = normalizeReleasePath(raw.trim());
  const body = pattern.startsWith("!") ? pattern.slice(1) : pattern;
  if (!body || body.length > MAX_PATTERN_LENGTH) {
    throw new Error("Invalid changedFilePatterns entry: " + raw);
  }
  if (path.posix.isAbsolute(body) || body.split("/").includes("..")) {
    throw new Error("changedFilePatterns must stay project-relative: " + raw);
  }
  const supported = body === "package.json"
    || body === "package-lock.json"
    || body.startsWith("src/");
  if (!supported) {
    throw new Error("changedFilePatterns supports only Agent Core product/source paths: " + raw);
  }
  return pattern;
}

export async function loadReleasePolicy(root = ROOT) {
  const configPath = path.join(root, ".changeset", "config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const rawPatterns = config.changedFilePatterns ?? ["src/**", "package.json", "package-lock.json"];
  if (!Array.isArray(rawPatterns) || rawPatterns.length === 0 || rawPatterns.length > MAX_PATTERNS) {
    throw new Error("changedFilePatterns must contain 1.." + MAX_PATTERNS + " entries");
  }
  const changedFilePatterns = rawPatterns.map(validatePattern);
  const snapshot = config.snapshot ?? {};
  if (snapshot.useCalculatedVersion != null && typeof snapshot.useCalculatedVersion !== "boolean") {
    throw new Error("snapshot.useCalculatedVersion must be boolean when configured");
  }
  if (snapshot.prereleaseTemplate != null
    && (typeof snapshot.prereleaseTemplate !== "string" || !snapshot.prereleaseTemplate.trim())) {
    throw new Error("snapshot.prereleaseTemplate must be a non-empty string when configured");
  }
  return {
    changedFilePatterns,
    snapshot: {
      useCalculatedVersion: snapshot.useCalculatedVersion ?? true,
      prereleaseTemplate: snapshot.prereleaseTemplate?.trim() || "{tag}.{datetime}.{commit-short}",
    },
  };
}

export function matchesChangedFilePatterns(file, patterns) {
  const normalized = normalizeReleasePath(file);
  let matched = false;
  for (const raw of patterns) {
    const negated = raw.startsWith("!");
    const pattern = negated ? raw.slice(1) : raw;
    if (path.matchesGlob(normalized, pattern)) matched = !negated;
  }
  return matched;
}

export function isGeneratedReleasePath(file) {
  return normalizeReleasePath(file).split("/").some((segment) => {
    const normalized = segment.toLowerCase();
    return GENERATED_SEGMENTS.has(normalized)
      || /^node_modules\.partial(?:[._-].*)?$/i.test(normalized);
  });
}

export function isTestOnlyReleasePath(file) {
  const normalized = normalizeReleasePath(file);
  return (
    normalized.startsWith("src/launcher.tests/")
    || normalized.includes("/tests/")
    || /(?:^|\/)[^/]+\.(?:test|spec)\.[^.]+$/.test(normalized)
  );
}

export function isMandatoryReleaseControlPath(file) {
  const normalized = normalizeReleasePath(file);
  return MANDATORY_RELEASE_FILES.has(normalized) || normalized.startsWith("scripts/release/");
}

export function isReleaseRelevantPath(file, policy) {
  const normalized = normalizeReleasePath(file);
  if (isMandatoryReleaseControlPath(normalized)) return true;
  if (isGeneratedReleasePath(normalized) || isTestOnlyReleasePath(normalized)) return false;
  return matchesChangedFilePatterns(normalized, policy.changedFilePatterns);
}

export function isIgnoredChangesetMarkdownName(name) {
  const base = path.basename(String(name ?? "")).toLowerCase();
  return (
    !base
    || base.startsWith(".")
    || AI_METADATA_MARKDOWN.has(base)
  );
}

export function isPendingIntentPath(file) {
  const normalized = normalizeReleasePath(file);
  const match = /^(?:\.changeset|docs\/memory\/release-intents)\/([^/]+\.md)$/i.exec(normalized);
  return Boolean(match && !isIgnoredChangesetMarkdownName(match[1]));
}

export function filterPendingIntentFilenames(entries) {
  return [...entries]
    .filter((name) => typeof name === "string"
      && name.toLowerCase().endsWith(".md")
      && !isIgnoredChangesetMarkdownName(name))
    .sort((a, b) => a.localeCompare(b));
}

export function releaseBaselinePathspecs() {
  return [
    "package.json",
    "package-lock.json",
    "scripts/release",
    ".changeset",
    "docs/memory/release-intents",
    "src",
    ":(exclude)src/**/bin/**",
    ":(exclude)src/**/obj/**",
    ":(exclude)src/**/node_modules/**",
    ":(exclude)src/**/node_modules.partial-*/**",
    ":(exclude)src/**/dist/**",
  ];
}

export function releaseChangeScanPathspecs() {
  return ["package.json", "package-lock.json", "scripts/release", ".changeset", "docs/memory/release-intents", "src"];
}
