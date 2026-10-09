import path from "node:path";
import { ROOT, readJson, syncVersion, parseProductVersion } from "./release-lib.mjs";

const explicitIndex = process.argv.indexOf("--version");
const explicit = explicitIndex >= 0 ? process.argv[explicitIndex + 1] : undefined;
const rootPackage = await readJson(path.join(ROOT, "package.json"));
const version = explicit ?? String(rootPackage.version ?? "");

parseProductVersion(version);
const { entries } = await syncVersion(version);

console.log(`Synchronized Agent Core product version ${version} across ${entries.length} surfaces.`);
