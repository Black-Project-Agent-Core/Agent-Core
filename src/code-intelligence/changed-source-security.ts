import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

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
  message: string;
  lifecycle: 'new' | 'still-present';
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
const lifecycle = new Map<string, Set<string>>();

const BUILTIN_RULES: CompiledRule[] = [
  { id: 'AC.SECURITY.CODE.EVAL', regex: /\beval\s*\(|\bnew\s+Function\s*\(/g, message: 'Dynamic code evaluation deserves explicit review.', severity: 'high', source: 'built-in' },
  { id: 'AC.SECURITY.SHELL.EXEC', regex: /\b(?:exec|execSync|os\.system)\s*\(|\bsubprocess\.(?:run|Popen|call)\s*\([^\n]*shell\s*=\s*True/g, message: 'Shell execution can become injection-prone when input is not strictly controlled.', severity: 'high', source: 'built-in' },
  { id: 'AC.SECURITY.TLS.DISABLED', regex: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|verify\s*=\s*False/g, message: 'TLS verification appears disabled.', severity: 'high', source: 'built-in' },
  { id: 'AC.SECURITY.DESERIALIZE.PICKLE', regex: /\bpickle\.(?:load|loads|Unpickler)\b/g, message: 'Unsafe deserialization must not consume untrusted data.', severity: 'high', source: 'built-in' },
  { id: 'AC.SECURITY.HTML.RAW', regex: /dangerouslySetInnerHTML/g, message: 'Raw HTML insertion requires a documented sanitization boundary.', severity: 'medium', source: 'built-in' },
  { id: 'AC.SECURITY.FILE.PERMISSIVE', regex: /\bchmod\s*\([^\n]*777|\bmode\s*:\s*0o777/g, message: 'World-writable permissions require explicit justification.', severity: 'medium', source: 'built-in' },
  { id: 'AC.SECURITY.SECRET.LITERAL', regex: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}['"]/gi, message: 'Potential credential-like literal found; matched value is intentionally not recorded.', severity: 'high', source: 'built-in' },
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

function globRegex(glob: string): RegExp {
  const bounded = glob.trim();
  if (!bounded || bounded.length > 160) throw new Error('SECURITY_ADVISORY_GLOB_INVALID');
  const escaped = bounded.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function compileProjectRule(input: AdditiveSecurityRule): CompiledRule {
  const id = input.id.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(id)) throw new Error('SECURITY_ADVISORY_RULE_ID_INVALID');
  const pattern = input.pattern.trim();
  if (!pattern || pattern.length > 256) throw new Error(`SECURITY_ADVISORY_RULE_PATTERN_INVALID:${id}`);
  if (/\\[1-9]/.test(pattern) || /\([^)]*[+*][^)]*\)[+*{]/.test(pattern) || /\.\*.*\.\*/.test(pattern)) {
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

function findingKey(finding: Pick<SecurityAdvisoryFinding, 'id' | 'file' | 'line'>): string {
  return `${finding.id}:${finding.file}:${finding.line}`;
}

function boundedLifecycleSet(scope: string, next: Set<string>): void {
  lifecycle.delete(scope);
  lifecycle.set(scope, next);
  while (lifecycle.size > MAX_LIFECYCLE_SCOPES) lifecycle.delete(lifecycle.keys().next().value!);
}

export async function scanChangedSourceSecurity(input: {
  root: string;
  files: string[];
  rules?: AdditiveSecurityRule[];
}) {
  const root = await realpath(path.resolve(input.root));
  const files = [...new Set(input.files.map(normalizeRelative))].slice(0, MAX_FILES);
  if (!files.length) throw new Error('SECURITY_ADVISORY_FILES_REQUIRED');
  const rules = [...BUILTIN_RULES, ...(input.rules ?? []).slice(0, MAX_RULES).map(compileProjectRule)];
  const findings: Omit<SecurityAdvisoryFinding, 'lifecycle'>[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];
  let totalBytes = 0;

  for (const file of files) {
    const candidate = path.resolve(root, ...file.split('/'));
    const relative = path.relative(root, candidate);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('SECURITY_ADVISORY_PATH_ESCAPE');
    try {
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) { skipped.push({ file, reason: 'not-regular-file' }); continue; }
      if (stat.size > MAX_FILE_BYTES || totalBytes + stat.size > MAX_TOTAL_BYTES) { skipped.push({ file, reason: 'size-limit' }); continue; }
      const resolved = await realpath(candidate);
      const realRelative = path.relative(root, resolved);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('SECURITY_ADVISORY_REALPATH_ESCAPE');
      const text = await readFile(resolved, 'utf8');
      totalBytes += Buffer.byteLength(text, 'utf8');
      const lines = text.split(/\r?\n/);
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex].slice(0, MAX_LINE_CHARS);
        for (const rule of rules) {
          if (!ruleApplies(rule, file)) continue;
          rule.regex.lastIndex = 0;
          const match = rule.regex.exec(line);
          if (!match) continue;
          findings.push({
            id: rule.id,
            severity: rule.severity,
            file,
            line: lineIndex + 1,
            column: match.index + 1,
            message: rule.message,
            source: rule.source,
          });
        }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') skipped.push({ file, reason: 'missing' });
      else throw error;
    }
  }

  const scope = `${root}\n${files.slice().sort().join('\n')}`;
  const previous = lifecycle.get(scope) ?? new Set<string>();
  const current = new Set(findings.map(findingKey));
  const withLifecycle: SecurityAdvisoryFinding[] = findings.map((finding) => ({
    ...finding,
    lifecycle: previous.has(findingKey(finding)) ? 'still-present' : 'new',
  }));
  const resolved = [...previous].filter((key) => !current.has(key)).sort();
  boundedLifecycleSet(scope, current);
  const counts = withLifecycle.reduce((acc, finding) => {
    acc[finding.severity] += 1;
    return acc;
  }, { info: 0, low: 0, medium: 0, high: 0 });
  return {
    schemaVersion: 1,
    kind: 'changed-source-security',
    root,
    filesRequested: files.length,
    filesScanned: files.length - skipped.length,
    skipped,
    findings: withLifecycle,
    resolved,
    counts,
    sourceMutated: false,
  };
}
