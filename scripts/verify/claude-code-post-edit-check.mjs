// PostToolUse hook for Claude Code (matcher Edit|Write). It reads the hook JSON from stdin, maps the edited file to the
// checks that own it, runs only the checks named on the command line and exits 2 with the failure on stderr, which is
// how Claude sees it. It writes nothing and gates nothing else. Wired in .claude/settings.local.json.
// Usage: node scripts/verify/claude-code-post-edit-check.mjs <path-policy|topic-size|typecheck>...
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOPIC_BYTES = 8_192; // one docs/instructions topic, the limit AGENTS.md states
const MAX_LINES = 30;

// Which checks apply to a project-relative path written with forward slashes.
export const APPLIES = {
  'path-policy': rel => /^(?:src|scripts)\//.test(rel) || rel === 'docs/PROJECT-STRUCTURE.md' || rel === 'docs/PATH-GOVERNANCE.md',
  'topic-size': rel => /^docs\/instructions\/[^/]+\.md$/.test(rel),
  typecheck: rel => /^src\/.+\.ts$/.test(rel) && !rel.startsWith('src/ui/'),
};
export const checksFor = (rel, enabled) => enabled.filter(name => Object.hasOwn(APPLIES, name) && APPLIES[name](rel));

function runNode(args) {
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 110_000, windowsHide: true });
  if (run.status === 0) return null;
  const lines = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(0, MAX_LINES).join('\n') || run.error?.message || `exited ${run.status}`;
}

const RUN = {
  'path-policy': () => runNode([path.join(root, 'scripts/portability/check-path-policy.mjs')]),
  typecheck: () => runNode([path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', path.join(root, 'tsconfig.json')]),
  'topic-size': rel => {
    const size = statSync(path.join(root, rel), { throwIfNoEntry: false })?.size ?? 0;
    return size > TOPIC_BYTES ? `${rel} is ${size} bytes; a docs/instructions topic may hold ${TOPIC_BYTES}.` : null;
  },
};

function main(enabled) {
  const unknown = enabled.filter(name => !Object.hasOwn(APPLIES, name));
  if (unknown.length) { process.stderr.write(`Unknown check: ${unknown.join(', ')}\n`); return 1; }
  let file;
  try { file = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.file_path; } catch { return 0; }
  if (typeof file !== 'string') return 0;
  const rel = path.relative(root, path.resolve(root, file)).replaceAll('\\', '/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return 0; // outside this project
  const failures = [];
  for (const name of checksFor(rel, enabled)) {
    const message = RUN[name](rel);
    if (message) failures.push(`[${name}] ${message}`);
  }
  if (!failures.length) return 0;
  process.stderr.write(`Post-edit check failed after editing ${rel}:\n${failures.join('\n')}\n`);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
