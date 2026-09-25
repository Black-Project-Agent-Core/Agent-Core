import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const INTEGRITY_SCHEMA_VERSION = 1;
export const INTEGRITY_MANIFEST_FILENAME = "INTEGRITY-MANIFEST.json";

export const INTEGRITY_MUTABLE_EXCLUSIONS = Object.freeze([
  "INTEGRITY-MANIFEST.json",
  "tunnel-client/agent-core.yaml",
  "runtime/memory/",
]);

function normalizeRelative(relative) {
  return relative.replaceAll("\\", "/").replace(/^\.\//, "");
}

function excluded(relative) {
  const normalized = normalizeRelative(relative);
  return INTEGRITY_MUTABLE_EXCLUSIONS.some(rule =>
    rule.endsWith("/") ? normalized.startsWith(rule) : normalized === rule,
  );
}

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function collectFiles(root, current = root, output = []) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = normalizeRelative(path.relative(root, absolute));
    if (excluded(relative)) continue;
    if (entry.isSymbolicLink()) {
      throw new Error(`Release integrity manifest refuses symbolic links: ${relative}`);
    }
    if (entry.isDirectory()) {
      await collectFiles(root, absolute, output);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported release package entry: ${relative}`);
    }
    const stat = await fs.stat(absolute);
    output.push({
      path: relative,
      bytes: stat.size,
      sha256: await sha256(absolute),
    });
  }
  return output;
}

export async function buildIntegrityManifest(root, { product, version, generatedAt = new Date().toISOString() }) {
  const files = await collectFiles(root);
  return {
    schemaVersion: INTEGRITY_SCHEMA_VERSION,
    product,
    version,
    generatedAt,
    hashAlgorithm: "sha256",
    policy: {
      mode: "immutable-release-files",
      unexpectedFiles: "preserve",
      mutableExclusions: [...INTEGRITY_MUTABLE_EXCLUSIONS],
    },
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
}

export function stringifyIntegrityManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
