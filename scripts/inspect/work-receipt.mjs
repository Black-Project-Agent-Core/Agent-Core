// Read-only summary of what the local Activity Tracker recorded over the last N days, plus commit counts for repositories you name.
//   node scripts/inspect/work-receipt.mjs [--days 7] [--journal <activity.jsonl>] [--repo <folder> ...] [--out runtime/tmp/<file>.md]
// Counts only. No money, no hours saved, no per-activity cost, no per-project attribution: the journal has no project field.
// A value that could not be read is shown as "?", never as 0. Writes nothing unless --out is given (and only under runtime/tmp).
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_JOURNAL = path.join(ROOT, 'runtime', 'tracker', 'activity.jsonl');
const OUT_ROOT = path.join(ROOT, 'runtime', 'tmp');

const localDate = date => date.toLocaleDateString('en-CA');
const label = value => '`' + path.basename(String(value)).replace(/[^\w .-]/g, '?').slice(0, 60) + '`';
const table = rows => ['| What | Count |', '|---|---:|', ...rows.map(([name, value]) => `| ${name} | ${value} |`)].join('\n');

/** Counts for one repository: commits since `since`, and distinct files they touched. "?" when git cannot answer. */
export function gitCounts(repo, since) {
  try {
    if (!statSync(repo).isDirectory()) return { commits: '?', files: '?' };
    const output = execFileSync('git', ['-C', repo, '-c', 'core.quotepath=off', 'log', `--since=${since.toISOString()}`, '--format=%x01%H', '--name-only'],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    let commits = 0;
    const files = new Set();
    for (const line of output.split('\n')) {
      if (line.startsWith('\x01')) commits += 1;
      else if (line.trim()) files.add(line);
    }
    return { commits, files: files.size };
  } catch { return { commits: '?', files: '?' }; }
}

export async function buildReceipt({ journal = DEFAULT_JOURNAL, days = 7, repos = [], now = new Date() } = {}) {
  const span = Math.min(Math.max(Math.trunc(days) || 7, 1), 366);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (span - 1));
  const counts = { records: 0, unreadable: 0, inWindow: 0, toolCalls: 0, toolFailed: 0, failureEvents: 0, checkpoints: 0, reviews: 0, memoryTools: 0 };
  const byTool = new Map();
  const activeDays = new Set();
  let first = null, last = null, readable = false;
  if (existsSync(journal)) {
    readable = true;
    const lines = readline.createInterface({ input: createReadStream(journal, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      let record;
      try { record = JSON.parse(line); } catch { counts.unreadable += 1; continue; }
      const when = new Date(record?.timestamp);
      if (Number.isNaN(when.getTime())) { counts.unreadable += 1; continue; }
      counts.records += 1;
      if (!first || when < first) first = when;
      if (!last || when > last) last = when;
      if (when < start || when > now) continue;
      counts.inWindow += 1;
      activeDays.add(localDate(when));
      if (record.kind === 'tool-call') {
        counts.toolCalls += 1;
        const failed = record.level === 'error';
        if (failed) counts.toolFailed += 1;
        const tool = String(record.context?.tool ?? 'unknown').slice(0, 60);
        const entry = byTool.get(tool) ?? { calls: 0, failed: 0 };
        entry.calls += 1; if (failed) entry.failed += 1;
        byTool.set(tool, entry);
      } else if (record.kind === 'handled-tool-failure' || record.kind === 'tool-exception') counts.failureEvents += 1;
      else if (record.kind === 'learning-checkpoint') counts.checkpoints += 1;
      else if (record.kind === 'learning-review') counts.reviews += 1;
      else if (record.kind === 'memory-tool') counts.memoryTools += 1;
    }
  }
  const top = [...byTool.entries()].sort((a, b) => b[1].calls - a[1].calls).slice(0, 8);
  const rows = [
    ['Active days (footnote 1)', readable ? activeDays.size : '?'],
    ['Tracker records in the window', readable ? counts.inWindow : '?'],
    ['Tool calls', readable ? counts.toolCalls : '?'],
    ['Tool calls that ended in an error', readable ? counts.toolFailed : '?'],
    ['Tool failure events, a separate record stream (footnote 3)', readable ? counts.failureEvents : '?'],
    ['Learning checkpoints', readable ? counts.checkpoints : '?'],
    ['Learning reviews', readable ? counts.reviews : '?'],
    ['Memory tool calls', readable ? counts.memoryTools : '?'],
  ];
  const out = [
    `# Work receipt: ${localDate(start)} to ${localDate(now)} (${span} day${span === 1 ? '' : 's'})`,
    '',
    readable
      ? `Source: the local Activity Tracker journal, ${counts.records} readable records from ${first ? first.toISOString() : 'n/a'} to ${last ? last.toISOString() : 'n/a'}; unreadable lines: ${counts.unreadable}. The journal is size-bounded, so an old window can be incomplete.`
      : `Source: the Activity Tracker journal was not found (${label(journal)}). Every tracker value is shown as ?.`,
    '', table(rows), '',
  ];
  if (top.length) out.push('Tool calls by tool (top 8):', '', table(top.map(([tool, entry]) => [`\`${tool.replace(/[^\w.-]/g, '?')}\` (${entry.failed} failed)`, entry.calls])), '');
  if (repos.length) {
    out.push('Commits in the window (any author), read with `git log`:', '', '| Repository | Commits | Distinct files touched |', '|---|---:|---:|');
    for (const repo of repos) { const result = gitCounts(repo, start); out.push(`| ${label(repo)} | ${result.commits} | ${result.files} (footnote 2) |`); }
    out.push('');
  }
  out.push('Footnotes:',
    '1. Active days counts calendar days (local time) with at least one record. It is not a total of anything and not hours worked.',
    '2. Files touched is a distinct count across the commits; it is not a sum of per-commit counts.',
    '3. The tracker logs failures as their own record kinds (handled-tool-failure, tool-exception). The row above them counts only tool-call records marked as errors, so read the two rows together and do not add them.',
    '',
    'Not reported, on purpose: money, hours saved, cost per activity, and any per-project attribution of tool calls (the journal has no project field, so a project column would be invented). A commit is not proof that an agent wrote it.');
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

async function main(argv) {
  const options = { days: 7, repos: [], journal: DEFAULT_JOURNAL, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--days') options.days = Number(argv[++index]);
    else if (flag === '--journal') options.journal = path.resolve(argv[++index] ?? '');
    else if (flag === '--repo') options.repos.push(path.resolve(argv[++index] ?? ''));
    else if (flag === '--out') options.out = path.resolve(argv[++index] ?? '');
    else throw new Error(`unknown option ${flag}`);
  }
  if (options.out) {
    const relative = path.relative(OUT_ROOT, options.out);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !relative) throw new Error('--out must be a file under runtime/tmp');
  }
  const markdown = await buildReceipt(options);
  if (options.out) { await mkdir(path.dirname(options.out), { recursive: true }); await writeFile(options.out, markdown, 'utf8'); console.log(`written: ${options.out}`); }
  else process.stdout.write(markdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(String(error?.message ?? error)); process.exit(1); });
}
