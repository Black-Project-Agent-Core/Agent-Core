import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readOnlyGit } from '../process/readonly-git.js';

export type AdvisorySeverity = 'info' | 'low' | 'medium' | 'high';

export interface AdditiveSecurityRule {
  id: string;
  pattern: string;
  message: string;
  severity?: AdvisorySeverity;
  include?: string[];
  exclude?: string[];
}

export interface SecurityAdvisoryFinding {
  id: string;
  severity: AdvisorySeverity;
  file: string;
  line: number;
  column: number;
  /** Notebook code-cell index (0-based); `line` is then relative to that cell. */
  cell?: number;
  message: string;
  /** Stable across line shifts: rule id + file + hash of the normalized matched line (`#n` for repeats). */
  key: string;
  lifecycle: 'new' | 'still-present';
  /** True when the matched line is on the added side of `git diff -U0 HEAD`; omitted when git cannot say. */
  introducedByChange?: boolean;
  source: 'built-in' | 'project-rule';
}

interface CompiledRule {
  id: string;
  regex: RegExp;
  message: string;
  severity: AdvisorySeverity;
  include?: RegExp[];
  exclude?: RegExp[];
  source: SecurityAdvisoryFinding['source'];
}

const MAX_FILES = 128;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_RULES = 32;
const MAX_LINE_CHARS = 20_000;
const MAX_LIFECYCLE_SCOPES = 64;
// shortcut: lifecycle lives in process memory only (lost on restart, 64 scopes), add a store when a consumer needs history across restarts.
const lifecycle = new Map<string, Map<string, string>>();

const WEB_SOURCE = ['*.js', '*.jsx', '*.ts', '*.tsx', '*.mjs', '*.cjs', '*.html', '*.vue', '*.svelte'];
const SCRIPT_SOURCE = ['*.js', '*.jsx', '*.ts', '*.tsx', '*.mjs', '*.cjs'];

function builtin(id: string, regex: RegExp, message: string, severity: AdvisorySeverity, include?: string[]): CompiledRule {
  return { id, regex, message, severity, ...(include ? { include: include.map(globRegex) } : {}), source: 'built-in' };
}

function globRegex(glob: string): RegExp {
  const bounded = glob.trim();
  if (!bounded || bounded.length > 160) throw new Error('SECURITY_ADVISORY_GLOB_INVALID');
  const escaped = bounded.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

// Bare calls only: `re.exec(` / `RegExp.exec(` have a dot before the name and are not command execution.
const BUILTIN_RULES: CompiledRule[] = [
  builtin('AC.SECURITY.CODE.EVAL', /(?<![.\w$])eval\s*\(|\b(?:window|globalThis|global|self)\.eval\s*\(|(?<![.\w$])new\s+Function\s*\(/g, 'Dynamic code evaluation deserves explicit review.', 'high'),
  builtin('AC.SECURITY.SHELL.EXEC', /(?<![.\w$])(?<!\b(?:private|public|protected|static|async|function)\s+)(?:exec|execSync)\s*\(|\b(?:child_process|childProcess|cp)\s*\.\s*(?:exec|execSync)\s*\(|\bos\.system\s*\(|\bsubprocess\.(?:run|Popen|call|check_output|check_call)\s*\([^\n]*shell\s*=\s*True/g, 'Shell or dynamic-code execution can become injection-prone when input is not strictly controlled.', 'high'),
  builtin('AC.SECURITY.SHELL.SPAWN', /\bshell\s*:\s*true\b/g, 'A spawned process runs through a shell, so unescaped input becomes command injection.', 'medium', SCRIPT_SOURCE),
  builtin('AC.SECURITY.TLS.DISABLED', /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED['"\]]*\s*[:=]\s*['"]?0\b|\bverify\s*=\s*False/g, 'TLS verification appears disabled.', 'high'),
  builtin('AC.SECURITY.DESERIALIZE.PICKLE', /\bpickle\.(?:load|loads|Unpickler)\b/g, 'Unsafe deserialization must not consume untrusted data.', 'high'),
  builtin('AC.SECURITY.DESERIALIZE.UNSAFE', /\byaml\.load\s*\((?![^)\n]*Safe)|\bmarshal\.loads?\s*\(|\bnew\s+ObjectInputStream\b|\bBinaryFormatter\b|\bunserialize\s*\(/g, 'Native-object deserialization (unsafe YAML load, marshal, ObjectInputStream, BinaryFormatter, unserialize) must not consume untrusted data.', 'high'),
  builtin('AC.SECURITY.HTML.RAW', /dangerouslySetInnerHTML/g, 'Raw HTML insertion requires a documented sanitization boundary.', 'medium'),
  builtin('AC.SECURITY.DOM.SINK', /\.(?:inner|outer)HTML\s*=(?!=)(?!\s*(?:''|""|``)\s*;?\s*$)|\bdocument\.write(?:ln)?\s*\(|\.insertAdjacentHTML\s*\(/g, 'DOM sink inserts markup; the value needs a sanitization boundary.', 'medium', WEB_SOURCE),
  builtin('AC.SECURITY.FILE.PERMISSIVE', /\bchmod\s*\([^\n]*777|\bmode\s*:\s*0o777/g, 'World-writable permissions require explicit justification.', 'medium'),
  builtin('AC.SECURITY.SECRET.LITERAL', /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}['"]/gi, 'Potential credential-like literal found; matched value is intentionally not recorded.', 'high'),
  builtin('AC.SECURITY.KEY.PRIVATE', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g, 'A private key appears to be embedded in source.', 'high'),
  builtin('AC.SECURITY.CI.EXPRESSION', /(?<!^\s*[A-Z][A-Z0-9_]*\s*:\s*)\$\{\{\s*github\.(?:event\.(?:issue|pull_request|comment|review|review_comment|discussion|head_commit|commits|pages)\b|head_ref\b)[^}]*\}\}/g, 'Untrusted event data in a workflow expression is injectable when it reaches a run: script; pass it through env: instead.', 'high', ['.github/workflows/*']),
  builtin('AC.SECURITY.CRYPTO.ECB', /aes-?\d{0,3}-ecb|AES\/ECB|MODE_ECB|AES\.new\([^\n]*ECB/gi, 'ECB mode leaks plaintext structure; use an authenticated mode.', 'high'),
  builtin('AC.SECURITY.CRYPTO.WEAK_HASH', /createHash\(\s*['"](?:md5|sha1)['"]\s*\)|hashlib\.(?:md5|sha1)\s*\(|MessageDigest\.getInstance\(\s*"(?:MD5|SHA-?1)"/g, 'MD5 and SHA-1 are not collision resistant; fine for checksums, not for security decisions.', 'low'),
  builtin('AC.SECURITY.COMPARE.SIGNATURE', /\b\w*(?:signature|hmac)\w*\s*(?:===|!==|==|!=)\s*(?!undefined\b|null\b|void\b|['"`\d])[\w.([]/gi, 'Signatures and MACs should be compared in constant time against a computed value; comparing to a literal is not flagged.', 'low'),
  builtin('AC.SECURITY.JWT.NONE', /algorithms?\s*[:=]\s*\[?\s*['"]none['"]/gi, 'Accepting the "none" JWT algorithm disables signature checks.', 'high'),
  builtin('AC.SECURITY.CORS.WILDCARD', /Access-Control-Allow-Origin['"]?\s*[:,=]\s*['"]\*['"]|\borigin\s*:\s*['"]\*['"]/gi, 'A wildcard CORS origin exposes the response to every site.', 'low'),
];

function normalizeRelative(value: string): string {
  const raw = value.trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) throw new Error('SECURITY_ADVISORY_PATH_INVALID');
  const normalized = path.posix.normalize(raw.replace(/^\.\//, ''));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('SECURITY_ADVISORY_PATH_ESCAPE');
  }
  return normalized;
}

/** A name such as `..cache` starts with two dots but does not leave the root; only `..` and `..<sep>` do. */
function leavesRoot(relative: string): boolean {
  return !relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}

function compileProjectRule(input: AdditiveSecurityRule): CompiledRule {
  const id = input.id.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(id)) throw new Error('SECURITY_ADVISORY_RULE_ID_INVALID');
  const pattern = input.pattern.trim();
  if (!pattern || pattern.length > 256) throw new Error(`SECURITY_ADVISORY_RULE_PATTERN_INVALID:${id}`);
  // Backreferences, nested quantifiers, two `.*`, and a quantified group that contains an alternation
  // (`(a|aa)+`) can all backtrack exponentially on a long line.
  if (/\\[1-9]/.test(pattern) || /\([^)]*[+*][^)]*\)[+*{]/.test(pattern) || /\.\*.*\.\*/.test(pattern)
    || /\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,\})/.test(pattern)) {
    throw new Error(`SECURITY_ADVISORY_RULE_REDOS_REJECTED:${id}`);
  }
  let regex: RegExp;
  try { regex = new RegExp(pattern, 'gi'); }
  catch { throw new Error(`SECURITY_ADVISORY_RULE_REGEX_INVALID:${id}`); }
  const message = input.message.trim();
  if (!message || message.length > 500) throw new Error(`SECURITY_ADVISORY_RULE_MESSAGE_INVALID:${id}`);
  return {
    id,
    regex,
    message,
    severity: input.severity ?? 'medium',
    include: input.include?.slice(0, 16).map(globRegex),
    exclude: input.exclude?.slice(0, 16).map(globRegex),
    source: 'project-rule',
  };
}

function ruleApplies(rule: CompiledRule, file: string): boolean {
  if (rule.include?.length && !rule.include.some((item) => item.test(file))) return false;
  if (rule.exclude?.some((item) => item.test(file))) return false;
  return true;
}

// The key hashes the matched line itself, not its neighbours: a context window would turn every edit
// next to a finding into a false "resolved" plus "new". Repeats of an identical line get a `#n` suffix.
function findingKey(ruleId: string, file: string, line: string): string {
  const normalized = line.trim().replace(/\s+/g, ' ').slice(0, 400);
  return `${ruleId}:${file}:${createHash('sha256').update(normalized).digest('hex').slice(0, 12)}`;
}

function boundedLifecycleSet(scope: string, next: Map<string, string>): void {
  lifecycle.delete(scope);
  lifecycle.set(scope, next);
  while (lifecycle.size > MAX_LIFECYCLE_SCOPES) lifecycle.delete(lifecycle.keys().next().value!);
}

interface Segment { lines: string[]; cell?: number }

/** One segment per file, or one per code cell for a notebook; `undefined` when a notebook cannot be parsed. */
function segmentsOf(file: string, text: string): Segment[] | undefined {
  if (!file.toLowerCase().endsWith('.ipynb')) return [{ lines: text.split(/\r?\n/) }];
  try {
    const notebook = JSON.parse(text) as { cells?: Array<{ cell_type?: string; source?: string | string[] }> };
    return (notebook.cells ?? []).flatMap((cell, cellIndex) => cell.cell_type === 'code'
      ? [{ cell: cellIndex, lines: (Array.isArray(cell.source) ? cell.source.join('') : String(cell.source ?? '')).split(/\r?\n/) }]
      : []);
  } catch { return undefined; }
}

/** Added-side line numbers per file from `git diff -U0 HEAD`; untracked files count as fully introduced. */
async function introducedLines(root: string, files: string[]): Promise<Map<string, Set<number> | 'all'> | undefined> {
  try {
    const tracked = new Set((await readOnlyGit(root, ['ls-files', '-z', '--', ...files])).split('\0').filter(Boolean));
    const result = new Map<string, Set<number> | 'all'>();
    for (const file of files) if (!tracked.has(file)) result.set(file, 'all');
    const patch = await readOnlyGit(root, ['diff', '--unified=0', '--no-color', '--no-ext-diff', '--ignore-submodules=all', 'HEAD', '--', ...files]);
    let current: Set<number> | undefined;
    for (const line of patch.split(/\r?\n/)) {
      if (line.startsWith('+++ ')) {
        const name = line.slice(4).split('\t', 1)[0]!.replace(/^b\//, '');
        current = name === '/dev/null' ? undefined : new Set<number>();
        if (current) result.set(name, current);
        continue;
      }
      const hunk = current && /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!hunk) continue;
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let offset = 0; offset < count; offset += 1) current!.add(start + offset);
    }
    return result;
  } catch { return undefined; }
}

export async function scanChangedSourceSecurity(input: {
  root: string;
  files: string[];
  rules?: AdditiveSecurityRule[];
}) {
  const root = await realpath(path.resolve(input.root));
  const unique = [...new Set(input.files.map(normalizeRelative))];
  const files = unique.slice(0, MAX_FILES);
  if (!files.length) throw new Error('SECURITY_ADVISORY_FILES_REQUIRED');
  const rules = [...BUILTIN_RULES, ...(input.rules ?? []).slice(0, MAX_RULES).map(compileProjectRule)];
  const findings: Array<Omit<SecurityAdvisoryFinding, 'lifecycle' | 'introducedByChange'>> = [];
  const skipped: Array<{ file: string; reason: string }> = [];
  let totalBytes = 0;
  let longLinesTruncated = 0;

  for (const file of files) {
    const candidate = path.resolve(root, ...file.split('/'));
    if (leavesRoot(path.relative(root, candidate))) throw new Error('SECURITY_ADVISORY_PATH_ESCAPE');
    try {
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) { skipped.push({ file, reason: 'not-regular-file' }); continue; }
      if (stat.size > MAX_FILE_BYTES || totalBytes + stat.size > MAX_TOTAL_BYTES) { skipped.push({ file, reason: 'size-limit' }); continue; }
      const resolved = await realpath(candidate);
      if (leavesRoot(path.relative(root, resolved))) throw new Error('SECURITY_ADVISORY_REALPATH_ESCAPE');
      const text = await readFile(resolved, 'utf8');
      totalBytes += Buffer.byteLength(text, 'utf8');
      const segments = segmentsOf(file, text);
      if (!segments) { skipped.push({ file, reason: 'notebook-unparseable' }); continue; }
      const seen = new Map<string, number>();
      for (const segment of segments) {
        for (let lineIndex = 0; lineIndex < segment.lines.length; lineIndex += 1) {
          const raw = segment.lines[lineIndex]!;
          if (raw.length > MAX_LINE_CHARS) longLinesTruncated += 1;
          const line = raw.slice(0, MAX_LINE_CHARS);
          for (const rule of rules) {
            if (!ruleApplies(rule, file)) continue;
            rule.regex.lastIndex = 0;
            const match = rule.regex.exec(line);
            if (!match) continue;
            const base = findingKey(rule.id, file, line);
            const occurrence = (seen.get(base) ?? 0) + 1;
            seen.set(base, occurrence);
            findings.push({
              id: rule.id,
              severity: rule.severity,
              file,
              line: lineIndex + 1,
              column: match.index + 1,
              ...(segment.cell !== undefined ? { cell: segment.cell } : {}),
              message: rule.message,
              key: occurrence > 1 ? `${base}#${occurrence}` : base,
              source: rule.source,
            });
          }
        }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') skipped.push({ file, reason: 'missing' });
      else throw error;
    }
  }

  const skippedFiles = new Set(skipped.map((item) => item.file));
  const scannedFiles = files.filter((file) => !skippedFiles.has(file));
  const introduced = scannedFiles.length ? await introducedLines(root, scannedFiles) : undefined;

  const scope = `${root}\n${files.slice().sort().join('\n')}`;
  const previous = lifecycle.get(scope) ?? new Map<string, string>();
  const current = new Map(findings.map((finding) => [finding.key, finding.file] as const));
  const withLifecycle: SecurityAdvisoryFinding[] = findings.map((finding) => {
    const lines = introduced?.get(finding.file);
    return {
      ...finding,
      lifecycle: previous.has(finding.key) ? 'still-present' : 'new',
      ...(introduced && finding.cell === undefined
        ? { introducedByChange: lines === 'all' ? true : lines ? lines.has(finding.line) : false }
        : {}),
    };
  });
  // A finding is resolved only when its file was scanned again and no longer matches; skipped files keep their history.
  const resolved = [...previous].filter(([key, file]) => !skippedFiles.has(file) && !current.has(key)).map(([key]) => key).sort();
  const carried = [...previous].filter(([key, file]) => skippedFiles.has(file) && !current.has(key));
  boundedLifecycleSet(scope, new Map([...current, ...carried]));
  const counts = withLifecycle.reduce((acc, finding) => {
    acc[finding.severity] += 1;
    return acc;
  }, { info: 0, low: 0, medium: 0, high: 0 });
  const status = !scannedFiles.length ? 'nothing-scanned' as const
    : skipped.length || unique.length > files.length ? 'partial' as const : 'complete' as const;
  return {
    schemaVersion: 1,
    kind: 'changed-source-security',
    root,
    status,
    filesRequested: unique.length,
    filesDropped: unique.length - files.length,
    truncated: unique.length > files.length,
    filesScanned: scannedFiles.length,
    skipped,
    findings: withLifecycle,
    resolved,
    counts,
    limits: {
      maxFiles: MAX_FILES,
      maxFileBytes: MAX_FILE_BYTES,
      maxTotalBytes: MAX_TOTAL_BYTES,
      maxLineChars: MAX_LINE_CHARS,
      longLinesTruncated,
      oneFindingPerRulePerLine: true,
    },
    sourceMutated: false,
  };
}
