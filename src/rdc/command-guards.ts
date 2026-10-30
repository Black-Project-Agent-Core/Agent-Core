import path from 'node:path';
import { resolveModuleProjectRoot } from '../portability/paths.js';
import { buildMachineShellEnv, realUserHome } from '../security/environment.js';
import { canonicalPathKey } from '../semantic-ide/path-safety.js';

/**
 * Refusal-only guards for shell commands. They never grant anything: a refusal explains how to run the command
 * personally, an advisory only informs. Command substitution and nested shells (`cmd /c "..."`) are not expanded.
 */
const PROJECT_ROOT = resolveModuleProjectRoot(import.meta.url);
const DELETE_COMMANDS = new Set(['rm', 'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri', 'rimraf']);

/** One name per executable: quotes, directory and a Windows executable extension are dropped (`reg.exe` is `reg`). */
export function normalizeCommandName(token: string): string {
  const unquoted = token.replace(/^["'`]+|["'`]+$/g, '');
  return path.basename(unquoted).toLowerCase().replace(/\.(?:exe|com|bat|cmd|ps1)$/, '');
}

/** Quote-aware split on `;`, `&`, `|` and newlines. */
export function splitSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote = '';
  for (const char of command) {
    if (quote) { current += char; if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    if (char === ';' || char === '|' || char === '&' || char === '\n' || char === '\r') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote = '';
  let started = false;
  for (const char of segment) {
    if (quote) { if (char === quote) quote = ''; else current += char; continue; }
    if (char === '"' || char === "'") { quote = char; started = true; continue; }
    if (/\s/.test(char)) { if (started) tokens.push(current); current = ''; started = false; continue; }
    current += char;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

/** What a variable means to the shell that would run the command: the machine shell environment, not Core's own. */
function environmentValue(name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.entries(buildMachineShellEnv()).find(([key]) => key.toLowerCase() === lower)?.[1];
}

function expandVariables(token: string): string {
  const home = realUserHome();
  return token
    .replace(/%([A-Za-z0-9_]+)%/g, (whole, name: string) => environmentValue(name) ?? whole)
    .replace(/\$env:([A-Za-z0-9_]+)/gi, (whole, name: string) => environmentValue(name) ?? whole)
    .replace(/\$\{?HOME\}?(?=$|[\\/])/g, home)
    .replace(/^~(?=$|[\\/])/, home);
}

function protectedRoots(): Array<[string, string]> {
  const candidates: Array<[string | undefined, string]> = [
    [environmentValue('USERPROFILE') ?? realUserHome(), 'the user profile'],
    [path.dirname(realUserHome()), 'the Users folder'],
    [environmentValue('SystemRoot') ?? environmentValue('windir'), 'the Windows folder'],
    [environmentValue('ProgramFiles'), 'Program Files'],
    [environmentValue('ProgramFiles(x86)'), 'Program Files (x86)'],
    [environmentValue('ProgramW6432'), 'Program Files'],
    [environmentValue('ProgramData'), 'ProgramData'],
    [PROJECT_ROOT, 'the Agent Core project folder'],
    [path.dirname(PROJECT_ROOT), 'the folder that holds the Agent Core project'],
  ];
  return candidates.filter((item): item is [string, string] => Boolean(item[0])).map(([value, label]) => [canonicalPathKey(value), label]);
}

function protectedLabel(raw: string, roots: Array<[string, string]>): string | undefined {
  let target = expandVariables(raw);
  if (/^[A-Za-z]:$/.test(target)) return 'a drive'; // `rd E:` acts on that drive's current folder: too ambiguous to allow
  if (/[*?]/.test(target)) { // a glob deletes what is inside its directory part
    const cut = Math.max(target.lastIndexOf('\\'), target.lastIndexOf('/'));
    if (cut < 0) return undefined;
    target = target.slice(0, cut + 1);
  }
  if (!path.isAbsolute(target) && !/^[A-Za-z]:[\\/]/.test(target)) return undefined; // relative: the working folder is not known here
  const key = canonicalPathKey(target);
  if (key === path.parse(key).root.toLowerCase()) return 'a drive root';
  return roots.find(([root]) => root === key)?.[1];
}

/** The first catastrophic deletion target in a command, or `undefined`. Throws only on a bug; callers must refuse then. */
export function catastrophicDeleteTarget(command: string): { target: string; label: string } | undefined {
  const roots = protectedRoots();
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);
    if (!DELETE_COMMANDS.has(normalizeCommandName(tokens[0] ?? ''))) continue;
    for (const raw of tokens.slice(1)) {
      if (raw.startsWith('-') || /^\/[a-z?]$/i.test(raw)) continue; // flags such as -rf, -Recurse, /s, /q
      const label = protectedLabel(raw, roots);
      if (label) return { target: raw.replace(/[^\x20-\x7e]/g, '?').slice(0, 120), label };
    }
  }
  return undefined;
}

const PERSISTENCE_TARGETS: Array<[RegExp, string]> = [
  [/\$PROFILE\b|Microsoft\.PowerShell_profile\.ps1|\bprofile\.ps1\b/i, 'a PowerShell profile (it runs in every shell)'],
  [/Start Menu[\\/]Programs[\\/]Startup/i, 'the Windows Startup folder'],
  [/(?:^|[\s"'\\/])\.git[\\/]hooks[\\/]/i, 'a git hook'],
  [/CurrentVersion[\\/]Run(?:Once)?\b/i, 'a registry Run key'],
  [/\bschtasks(?:\.exe)?\s+\/create\b|\bRegister-ScheduledTask\b/i, 'a scheduled task'],
];

/** Advisory only: names places where a written file or entry runs again later without anyone starting it. */
export function persistenceAdvisory(command: string): string | undefined {
  const hits = PERSISTENCE_TARGETS.filter(([pattern]) => pattern.test(command)).map(([, label]) => label);
  return hits.length
    ? `Advisory: this command mentions ${hits.join(', ')}. Anything written there runs again later without being started. Agent Core only reports this and does not block it.`
    : undefined;
}
