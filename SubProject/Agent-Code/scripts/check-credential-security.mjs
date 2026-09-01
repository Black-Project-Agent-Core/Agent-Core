import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: projectRoot,
  encoding: 'utf8',
}).trim();
const projectPrefix = path.relative(repoRoot, projectRoot).replaceAll('\\', '/');

const tracked = execFileSync(
  'git',
  [
    '-C',
    repoRoot,
    'ls-files',
    '-z',
    '--',
    `${projectPrefix}/src`,
    `${projectPrefix}/src-tauri/src`,
    `${projectPrefix}/src-tauri/crates`,
  ],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
  .filter(isProductionSource);

const forbiddenRules = [
  ['plaintext-command:get', /\bvault_get_plaintext_key\b/],
  ['plaintext-command:reveal', /\bvault_reveal_key\b/],
  ['plaintext-command:export', /\bvault_export_plaintext\b/],
  ['plaintext-ui:reveal', /Reveal API Key/],
  ['plaintext-ui:copy', /Copy API Key/],
  ['machine-scope-dpapi', /\bCRYPTPROTECT_LOCAL_MACHINE\b/],
  [
    'browser-storage:credential',
    /localStorage\.setItem\s*\([^)]*\b(?:api[_ -]?key|credential|secret|token|key)\b[^)]*\)/i,
  ],
];
const unsafeProtector = /\b(?:class|struct|type)\s+(?:PlaintextProtector|NoopProtector)\b/;

const findings = [];
for (const repoRelativePath of tracked) {
  const absolutePath = path.join(repoRoot, repoRelativePath);
  let source = fs.readFileSync(absolutePath, 'utf8');
  if (repoRelativePath.endsWith('.rs')) {
    source = stripRustCfgTestItems(source);
  }

  for (const [ruleId, pattern] of forbiddenRules) {
    if (pattern.test(source)) {
      findings.push(`${ruleId}: ${repoRelativePath}`);
    }
  }
  if (unsafeProtector.test(source)) {
    findings.push(`unsafe-protector: ${repoRelativePath}`);
  }
}

runDetectorSelfTest();

if (findings.length > 0) {
  console.error('credential-security: FAIL');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`credential-security: PASS (${tracked.length} production source files scanned)`);

function isProductionSource(repoRelativePath) {
  const normalized = repoRelativePath.replaceAll('\\', '/');
  const basename = path.posix.basename(normalized);
  if (normalized.includes('/tests/')) return false;
  if (/\.(?:test|spec)\.[^.]+$/.test(basename)) return false;
  return /\.(?:rs|ts|tsx|js|jsx|mjs|cjs)$/.test(basename);
}

function stripRustCfgTestItems(source) {
  let output = source;
  const marker = '#[cfg(test)]';
  let index = output.indexOf(marker);
  while (index !== -1) {
    const itemStart = index;
    const afterMarker = index + marker.length;
    const nextBrace = output.indexOf('{', afterMarker);
    const nextSemicolon = output.indexOf(';', afterMarker);

    if (nextSemicolon !== -1 && (nextBrace === -1 || nextSemicolon < nextBrace)) {
      output = output.slice(0, itemStart) + output.slice(nextSemicolon + 1);
      index = output.indexOf(marker, itemStart);
      continue;
    }
    if (nextBrace === -1) {
      output = output.slice(0, itemStart);
      break;
    }

    const itemEnd = findMatchingBrace(output, nextBrace);
    if (itemEnd === -1) {
      output = output.slice(0, itemStart);
      break;
    }
    output = output.slice(0, itemStart) + output.slice(itemEnd + 1);
    index = output.indexOf(marker, itemStart);
  }
  return output;
}

function findMatchingBrace(source, openingIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openingIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function runDetectorSelfTest() {
  const positiveSamples = [
    'vault_get_plaintext_key',
    'vault_reveal_key',
    'vault_export_plaintext',
    'Reveal API Key',
    'Copy API Key',
    'CRYPTPROTECT_LOCAL_MACHINE',
    "localStorage.setItem('api_key', value)",
  ];
  for (const sample of positiveSamples) {
    const caught = forbiddenRules.some(([, pattern]) => pattern.test(sample));
    if (!caught) throw new Error(`credential-security detector self-test missed: ${sample}`);
  }
  if (!unsafeProtector.test('struct PlaintextProtector;')) {
    throw new Error('credential-security detector self-test missed PlaintextProtector');
  }
  if (!unsafeProtector.test('class NoopProtector {}')) {
    throw new Error('credential-security detector self-test missed NoopProtector');
  }
  const stripped = stripRustCfgTestItems('#[cfg(test)]\nmod tests { struct PlaintextProtector; }\nstruct Safe;');
  if (unsafeProtector.test(stripped)) {
    throw new Error('credential-security detector self-test did not ignore cfg(test) block');
  }
}
