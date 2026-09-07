import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..', '..');
const readText = (file) => readFile(path.join(root, file), 'utf8');
const parseJson = async (file) => JSON.parse(await readText(file));

// The Agent Core version literal lives in exactly one tracked source file; every other site derives from it.
export const VERSION_SOURCE_FILE = 'src/version.ts';
export const SERVER_SOURCE_FILE = 'src/mcp/server.ts';
export const UNRELEASED_HEADING = '## Unreleased';

const VERSION_LITERAL_PATTERNS = [
  /(?:AGENT_CORE_VERSION|SERVER_VERSION)\s*=\s*['"]\d+\.\d+\.\d+['"]/,
  /Agent-Core\/\d+\.\d+\.\d+/,
];

function fail(message) {
  process.stderr.write(`release check failed: ${message}\n`);
  process.exit(1);
}

/**
 * Body of the `## Unreleased` section (every line up to the next level-2 heading), or null when the
 * heading is absent.
 */
export function unreleasedSectionBody(changelog) {
  const lines = String(changelog).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === UNRELEASED_HEADING);
  if (start < 0) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    body.push(line);
  }
  return body.join('\n');
}

/**
 * Changelog rule for the package version:
 * - while the local `v<version>` tag does not exist the version is a development identity, so a
 *   non-empty `## Unreleased` section must carry its pending notes (`changelogSection: 'unreleased'`);
 * - once the tag exists the notes must have been frozen into `## [<version>]` (`changelogSection: 'released'`).
 */
export function changelogSectionRequirement({ version, tagExists, changelog }) {
  if (tagExists) {
    const heading = `## [${version}]`;
    if (!String(changelog).includes(heading)) {
      return {
        ok: false,
        changelogSection: 'released',
        heading,
        reason: `CHANGELOG.md has no section for ${version} although tag v${version} exists`,
      };
    }
    return { ok: true, changelogSection: 'released', heading };
  }

  const body = unreleasedSectionBody(changelog);
  if (body === null) {
    return {
      ok: false,
      changelogSection: 'unreleased',
      heading: UNRELEASED_HEADING,
      reason: `CHANGELOG.md has no "${UNRELEASED_HEADING}" section for development version ${version}`,
    };
  }
  if (!body.trim()) {
    return {
      ok: false,
      changelogSection: 'unreleased',
      heading: UNRELEASED_HEADING,
      reason: `CHANGELOG.md "${UNRELEASED_HEADING}" section is empty while v${version} is not tagged`,
    };
  }
  return { ok: true, changelogSection: 'unreleased', heading: UNRELEASED_HEADING };
}

export function localTagExists(version) {
  return execFileSync('git', ['-C', root, 'tag', '-l', `v${version}`], { encoding: 'utf8' }).trim() !== '';
}

async function main() {
  const [pkg, lock, versionSource, serverSource, readme, changelog] = await Promise.all([
    parseJson('package.json'),
    parseJson('package-lock.json'),
    readText(VERSION_SOURCE_FILE),
    readText(SERVER_SOURCE_FILE),
    readText('README.md'),
    readText('CHANGELOG.md'),
  ]);

  const version = String(pkg.version ?? '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`package.json version is not stable semver: ${version || '<empty>'}`);
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    fail(`package-lock.json version does not match package.json (${version})`);
  }

  const versionMatch = versionSource.match(/AGENT_CORE_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
  if (!versionMatch) fail(`could not locate AGENT_CORE_VERSION in ${VERSION_SOURCE_FILE}`);
  if (versionMatch[1] !== version) fail(`AGENT_CORE_VERSION ${versionMatch[1]} does not match package version ${version}`);
  if (!/export const SERVER_VERSION\s*=\s*AGENT_CORE_VERSION\s*;/.test(serverSource)) {
    fail(`SERVER_VERSION in ${SERVER_SOURCE_FILE} must be bound to AGENT_CORE_VERSION from ${VERSION_SOURCE_FILE}`);
  }

  const tagExists = localTagExists(version);
  const changelogRule = changelogSectionRequirement({ version, tagExists, changelog });
  if (!changelogRule.ok) fail(changelogRule.reason);

  if (/Agent Core\s+v?\d+\.\d+(?:\.\d+)?/i.test(readme) || readme.includes(`v${version}`)) {
    fail('README.md must stay Agent-Core-version neutral');
  }

  const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((item) => item.replaceAll('\\', '/'));

  const duplicateVersionLiterals = [];
  for (const file of tracked) {
    if (!file.startsWith('src/') || !file.endsWith('.ts') || file === VERSION_SOURCE_FILE) continue;
    const text = await readText(file);
    if (VERSION_LITERAL_PATTERNS.some((pattern) => pattern.test(text))) duplicateVersionLiterals.push(file);
  }
  if (duplicateVersionLiterals.length) {
    fail(`version literals must live only in ${VERSION_SOURCE_FILE}: ${duplicateVersionLiterals.join(', ')}`);
  }

  const historicalDocs = tracked.filter((file) => file.startsWith('docs/superpowers/'));
  if (historicalDocs.length) fail(`historical docs/superpowers files remain tracked (${historicalDocs.length})`);

  const forbiddenTracked = tracked.filter((file) =>
    file.startsWith('runtime/') ||
    file.startsWith('secrets/') ||
    file.startsWith('capabilities/') ||
    file.startsWith('node_modules/') ||
    file.startsWith('release/') ||
    file === '.env',
  );
  if (forbiddenTracked.length) fail(`forbidden release/runtime paths are tracked: ${forbiddenTracked.join(', ')}`);

  process.stdout.write(JSON.stringify({
    ok: true,
    version,
    trackedFiles: tracked.length,
    versionSource: VERSION_SOURCE_FILE,
    serverVersion: versionMatch[1],
    tagExists,
    changelogSection: changelogRule.changelogSection,
    readmeVersionNeutral: true,
    historicalScratchDocsTracked: 0,
  }, null, 2) + '\n');
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const normalize = (file) => (process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file));
  return normalize(entry) === normalize(fileURLToPath(import.meta.url));
}

if (isMainModule()) await main();
