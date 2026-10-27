import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectSkillStorageLayout } from './skill-storage-layout.mjs';
import { inspectProjectStructure } from './project-structure.mjs';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const defaultRoot = path.resolve(scriptDir, '..', '..');
const args = process.argv.slice(2);
let root = defaultRoot;
let report = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--root') {
    const value = String(args[++index] ?? '').trim();
    if (!value) throw new Error('ROOT_REQUIRED');
    root = path.resolve(value);
    continue;
  }
  if (arg === '--report') {
    report = true;
    continue;
  }
  throw new Error('UNKNOWN_OPTION: ' + arg);
}

const policyFile = path.join(scriptDir, 'path-exceptions.json');
const documentationFile = path.join(root, 'docs', 'PATH-GOVERNANCE.md');

const allowedExtensions = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.cs', '.rs',
  '.ps1', '.psm1', '.bat', '.cmd', '.json', '.yaml', '.yml',
]);
const excludedDirectoryNames = new Set([
  'node_modules', 'dist', 'runtime', 'release', 'backups', 'bin', 'obj',
  '.git', '.tmp', '_artifacts', 'launcher-publish',
]);
const excludedPathFragments = [
  'DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT',
  'node_modules.partial-',
];
const explicitFiles = [
  '.env.example',
  'package.json',
  'Start-Desktop-Commander.bat',
  'Apply-Desktop-Commander-Allowlist.ps1',
  'Edit-Desktop-Commander-Allowlist.bat',
  'RDC-Agent-Core.bat',
  'RDC-STANDALONE.ps1',
  'RDC.bat',
  'ACTIVATE-APPROVED-ADOPTION.cmd',
  'ACTIVATE-WAVE7-ADOPTION.cmd',
];

const normalizeRelative = value => value.replaceAll('\\', '/');

function isTestPath(relative) {
  const normalized = normalizeRelative(relative).toLowerCase();
  return normalized.includes('/launcher.tests/')
    || /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/.test(normalized);
}

function shouldSkipDirectory(name, relative) {
  if (excludedDirectoryNames.has(name)) return true;
  if (name.startsWith('node_modules')) return true;
  return excludedPathFragments.some(fragment => relative.includes(fragment));
}

async function collectFiles(startPath) {
  const output = [];
  let info;
  try {
    info = await stat(startPath);
  } catch {
    return output;
  }

  if (info.isFile()) {
    const extension = path.extname(startPath).toLowerCase();
    return allowedExtensions.has(extension) || path.basename(startPath) === '.env.example'
      ? [startPath]
      : [];
  }

  const stack = [startPath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const relative = path.relative(root, full);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name, relative)) stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isTestPath(relative)) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (allowedExtensions.has(extension) || entry.name === '.env.example') output.push(full);
    }
  }
  return output;
}

const scanRoots = [
  path.join(root, 'src'),
  path.join(root, 'scripts'),
  path.join(root, 'SubProject', 'Agent-Code', 'src-tauri', 'src'),
];

const fileSet = new Set();
for (const scanRoot of scanRoots) {
  for (const file of await collectFiles(scanRoot)) fileSet.add(path.resolve(file));
}

for (const relative of explicitFiles) {
  const file = path.join(root, relative);
  try {
    if ((await stat(file)).isFile()) fileSet.add(path.resolve(file));
  } catch {}
}

fileSet.delete(path.resolve(scriptFile));
fileSet.delete(path.resolve(policyFile));

function lineForOffset(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function snippetForOffset(text, offset) {
  const start = Math.max(0, text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1);
  const endIndex = text.indexOf('\n', offset);
  const end = endIndex < 0 ? text.length : endIndex;
  return text.slice(start, end).trim().slice(0, 320);
}

function addMatches(findings, relative, text, rule, regex) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    findings.push({
      rule,
      file: normalizeRelative(relative),
      line: lineForOffset(text, match.index),
      snippet: snippetForOffset(text, match.index),
    });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
}

const findings = [];
for (const file of [...fileSet].sort()) {
  const relative = path.relative(root, file);
  const extension = path.extname(file).toLowerCase();
  const text = await readFile(file, 'utf8');

  if (['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(extension)) {
    addMatches(findings, relative, text, 'cwd-path-authority', /\bprocess\.cwd\s*\(\s*\)/g);
  }
  if (extension === '.cs') {
    addMatches(
      findings,
      relative,
      text,
      'cwd-path-authority',
      /\b(?:Environment\.CurrentDirectory|Directory\.GetCurrentDirectory\s*\(\s*\))/g,
    );
  }
  if (['.ps1', '.psm1'].includes(extension)) {
    addMatches(findings, relative, text, 'cwd-path-authority', /(?:\$PWD\b|\bGet-Location\b)/gi);
  }
  if (['.bat', '.cmd'].includes(extension)) {
    addMatches(findings, relative, text, 'cwd-path-authority', /%CD%/gi);
  }

  const normalizedLiteralText = text.replaceAll('\\\\', '\\');
  addMatches(
    findings,
    relative,
    normalizedLiteralText,
    'fixed-agent-core-root',
    /\b[A-Za-z]:\\[^\r\n"'\x60]*\\Agent-Core(?:\\|\/|\b)/gi,
  );
  addMatches(
    findings,
    relative,
    normalizedLiteralText,
    'fixed-project-owned-path',
    /\b[A-Za-z]:\\[^\r\n"'\x60]*(?:\\(?:runtime|dist|src|scripts|assets|tunnel-client|node_modules)\\)[^\r\n"'\x60]*/gi,
  );
  addMatches(
    findings,
    relative,
    normalizedLiteralText,
    'fixed-user-profile',
    /\b[A-Za-z]:\\Users\\[^\r\n"'\x60]+/gi,
  );
}

const policy = JSON.parse(await readFile(policyFile, 'utf8'));
if (policy.schemaVersion !== 1 || !Array.isArray(policy.exceptions)) {
  throw new Error('PATH_EXCEPTION_REGISTRY_INVALID');
}

const docs = await readFile(documentationFile, 'utf8');
const requiredFields = [
  'id', 'file', 'rule', 'contains', 'classification', 'reason', 'relocationGuidance',
];
const registryErrors = [];
const seenIds = new Set();

for (const exception of policy.exceptions) {
  for (const field of requiredFields) {
    if (typeof exception[field] !== 'string' || !exception[field].trim()) {
      registryErrors.push('exception ' + (exception.id ?? '<missing-id>') + ' missing ' + field);
    }
  }
  if (seenIds.has(exception.id)) registryErrors.push('duplicate exception id: ' + exception.id);
  seenIds.add(exception.id);
  if (!docs.includes(exception.id)) registryErrors.push('documentation missing exception id: ' + exception.id);
}

const usedExceptions = new Set();
const unresolved = [];

for (const finding of findings) {
  const exception = policy.exceptions.find(item =>
    normalizeRelative(item.file).toLowerCase() === finding.file.toLowerCase()
    && item.rule === finding.rule
    && finding.snippet.includes(item.contains)
  );
  if (exception) usedExceptions.add(exception.id);
  else unresolved.push(finding);
}

for (const exception of policy.exceptions) {
  if (!usedExceptions.has(exception.id)) registryErrors.push('stale exception: ' + exception.id);
}

const skillStorage = await inspectSkillStorageLayout(root);
for (const issue of skillStorage.issues) {
  unresolved.push({ rule: 'skill-storage-ownership', file: issue.path, line: 1, snippet: issue.message });
}
const projectStructure = await inspectProjectStructure(root);
for (const issue of projectStructure.issues) {
  unresolved.push({ rule: 'project-structure', file: 'docs/PROJECT-STRUCTURE.md', line: 1, snippet: issue });
}

if (unresolved.length || registryErrors.length) {
  console.error('PATH POLICY FAIL');
  for (const issue of unresolved) {
    console.error(
      '  - ' + issue.file + ':' + issue.line + ' [' + issue.rule + '] ' + issue.snippet,
    );
  }
  for (const issue of registryErrors) console.error('  - registry: ' + issue);
  process.exitCode = 1;
} else {
  console.log(
    'PATH POLICY PASS — ' + fileSet.size + ' authored files scanned; '
      + policy.exceptions.length + ' documented exceptions',
  );
  console.log('Skill storage ownership PASS — ' + skillStorage.sourceSkillCount + ' sources; '
    + skillStorage.catalogSkillCount + ' managed catalog artifacts');
  console.log('Project structure PASS — ' + projectStructure.directoryCount + ' directories; map matches filesystem');
  if (report) {
    if (!policy.exceptions.length) {
      console.log('Active path exceptions: none');
    } else {
      console.log('Active path exceptions:');
      for (const exception of policy.exceptions) {
        console.log('  - ' + exception.id + ': ' + exception.file + ' — ' + exception.reason);
        console.log('    relocation: ' + exception.relocationGuidance);
      }
    }
  }
}
