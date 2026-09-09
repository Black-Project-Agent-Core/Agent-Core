import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oldWord = ['Com', 'mander'].join('');
const legacy = [
  ['Desktop ', oldWord].join(''),
  ['desktop-', 'commander'].join(''),
  [oldWord, '-MCP'].join(''),
  ['commander', '-mcp'].join(''),
  ['COMMANDER', '_'].join(''),
  ['cmd', 'r_'].join(''),
  ['commander', '_'].join(''),
  ['commander', '-'].join(''),
  oldWord,
];
const migrationHistory = new Set();
// These optional vendor launchers retain the independent product's own name.
const independentIntegrations = new Set([
  `Start-Desktop-${oldWord}.bat`,
  `Apply-Desktop-${oldWord}-Allowlist.ps1`,
  `Edit-Desktop-${oldWord}-Allowlist.bat`,
  `Desktop-${oldWord}-Allowlist.txt`,
]);
const vendorRuntimePath = `dist/.desktop-${oldWord.toLowerCase()}`;

function ownedText(file, text) {
  if (file === '.portable-package.json') {
    try {
      const metadata = JSON.parse(text);
      if (Array.isArray(metadata.exclusions)) {
        metadata.exclusions = metadata.exclusions.filter((entry) => entry !== vendorRuntimePath);
        return JSON.stringify(metadata);
      }
    } catch { /* Invalid metadata remains fully visible to the scanner. */ }
  }
  if (file === 'scripts/windows/agent-core-pack.ps1') {
    // Only the exact external runtime path is exempt; all adjacent owned text stays checked.
    return text.replaceAll(`'${vendorRuntimePath}'`, "'<vendor-runtime>'")
      .replaceAll(`"${vendorRuntimePath}"`, '"<vendor-runtime>"');
  }
  return text;
}

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function trackedFiles() {
  return execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], { encoding: 'utf8' })
    .split('\0').filter(Boolean)
    .filter((file) => !migrationHistory.has(file.replaceAll('\\', '/')))
    .filter((file) => !file.replaceAll('\\', '/').startsWith('capabilities/sources/'))
    // Agent Core brand ownership stops at independent SubProject boundaries.
    // Their product/vendor vocabulary must not block a root Agent Core release.
    .filter((file) => !file.replaceAll('\\', '/').startsWith('SubProject/'))
    .map((file) => path.join(repoRoot, file));
}

function isDependencyLockfile(file) {
  const normalized = file.replaceAll('\\', '/');
  return /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(normalized);
}

const scanIndex = process.argv.indexOf('--scan-path');
const scanRoot = scanIndex >= 0 ? path.resolve(process.argv[scanIndex + 1] ?? '') : null;
const base = scanRoot ?? repoRoot;
const files = (scanRoot ? await walk(scanRoot) : trackedFiles())
  .filter((file) => !isDependencyLockfile(path.relative(base, file)));
const findings = [];
for (const file of files) {
  const display = path.relative(base, file).replaceAll('\\', '/');
  if (independentIntegrations.has(display)) continue;
  for (const token of legacy) if (display.includes(token)) findings.push(`${display}:path:${token}`);
  let text;
  try { text = await readFile(file, 'utf8'); } catch { continue; }
  ownedText(display, text).split(/\r?\n/).forEach((line, index) => {
    for (const token of legacy) if (line.includes(token)) findings.push(`${display}:${index + 1}:${token}`);
  });
}

if (findings.length) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Agent Core brand scan clean\n');
}
