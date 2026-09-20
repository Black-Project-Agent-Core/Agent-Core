import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parseChangesetFile } from "@changesets/parse";
import { CHANGESET_DIR, PRODUCT_NAME } from "./release-lib.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const type = arg("--type");
const summary = arg("--summary")?.trim();
const allowed = new Set(["patch", "minor", "major"]);

if (!allowed.has(type)) {
  console.error("Usage: npm run release:intent -- --type <patch|minor|major> --summary \"description\"");
  process.exit(1);
}
if (!summary) {
  console.error("A non-empty --summary is required.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const suffix = crypto.randomBytes(3).toString("hex");
const id = `${stamp}-${suffix}`;
const content = `---
"${PRODUCT_NAME}": ${type}
---

${summary}
`;

parseChangesetFile(content);
await fs.mkdir(CHANGESET_DIR, { recursive: true });
const target = path.join(CHANGESET_DIR, `${id}.md`);
await fs.writeFile(target, content, { encoding: "utf8", flag: "wx" });
console.log(target);
