// Read-only shadow replay of candidate "stuck task" rules over the tasks recorded in runtime/agent-runtime/state.json
// (Stage 1, V2 of docs/proposals/Biaya-Efektif-dan-Replay-Tugas-Macet-Native.md).
//   node scripts/inspect/shadow-replay.mjs [--state <state.json>]
// It only measures: per rule, how many finalized tasks it would have touched, how many of those ended `verified` (a wrong target),
// and how much effective cost came after the firing point on tasks that ended `failed`. It changes no Native behaviour.
// The state file is opened read-only and this script writes no file; the report goes to stdout. A value that could not be read
// is shown as "?", never as 0.
// Cost per task is the V1 effectiveTaskCost from dist/effective-cost.js, a leaf module with no runtime dependencies. Only the CLI
// loads it (loadEffectiveCost), never replayShadow.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_STATE = path.join(ROOT, 'runtime', 'agent-runtime', 'state.json');
const SUCCESS_PREFIX = 'Granted tool succeeded';
const MAX_FIRINGS_SHOWN = 20;
const COST_SOURCE = 'effectiveTaskCost (V1, dist/effective-cost.js) in weighted tokens; a task it labels parsial is counted at its partial total, a task it cannot price is left out.';

const isCost = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const share = (part, whole) => (whole > 0 ? part / whole : null);
// Nearest-rank p90 of an ascending array: index = ceil(0.9 * n) - 1, written in integers so 0.9 carries no float noise.
const p90 = sorted => sorted[Math.ceil((9 * sorted.length) / 10) - 1];

/** One pass over a task's episodes: its total action count and the action number at which R1 first fires (null when it never does). */
function scanEpisodes(episodes, familyRun) {
  let actions = 0, run = 0, streak = null, firstFiring = null;
  for (const episode of Array.isArray(episodes) ? episodes : []) {
    const summary = typeof episode?.summary === 'string' ? episode.summary : '';
    if (episode?.kind === 'action') actions += 1;
    else if (episode?.kind === 'observation' && summary.startsWith(SUCCESS_PREFIX)) { streak = null; run = 0; }
    else if (episode?.kind === 'failure') {
      // The streak key is the pair (toolName, summary), like the advisor's (toolName, family); an episode without a tool has the empty
      // name. The same key increments the run; any other key (or an unreadable summary) starts a new streak. failureFamily is not used.
      const tool = typeof episode.toolName === 'string' ? episode.toolName : '';
      if (summary && streak && streak.tool === tool && streak.summary === summary) run += 1;
      else { streak = summary ? { tool, summary } : null; run = 1; }
      if (firstFiring === null && run >= familyRun) firstFiring = actions;
    }
  }
  return { actions, firstFiring };
}

/** R2 for one task: { rated: false } when its workspace has too few other finalized tasks, else { rated: true, firedAt }. */
function longTask(row, baselines, { minBaseline, p90Factor }) {
  const others = (row.workspace === null ? [] : baselines.get(row.workspace) ?? []).slice();
  const own = others.indexOf(row.actions);
  if (own >= 0) others.splice(own, 1); // leave-one-out: the baseline never contains the task under test
  if (others.length < Math.max(1, minBaseline)) return { rated: false, firedAt: null };
  const threshold = p90(others) * p90Factor;
  return { rated: true, firedAt: row.actions > threshold ? Math.floor(threshold) + 1 : null };
}

function buildNotes({ minBaseline, p90Factor, familyRun, evaluated, costed }) {
  return [
    'Action order is a proxy for iterations: only episodes of kind action are counted, in recorded order. Time and model calls are not used.',
    'Cost after firing is proportional to the share of actions: task cost x (total actions - firing action) / total actions. Every action is assumed to cost the same.',
    "'failed' is not the same as stuck: a failed task may never have been stuck, and a stuck task may still have ended verified.",
    "'verified' is Native's own finalization label (terminalOutcome), not independent verification; a firing on a verified task is a wrong target only by that label.",
    `R1 mirrors the FailureLoopAdvisor family streak: the same (tool, failure summary) ${familyRun} times in a row, and any granted-tool success resets it. The tool is part of the key when the episode records it (an episode without one counts as the empty name); the failureFamily field is not used because it is only a coarse class. Arguments are not recorded, so argument variation cannot be required (the advisor's failure-family scope requires it) and the advisor's time window is not applied, so R1 can fire on a streak the advisor would have let expire.`,
    `R2 uses a leave-one-out baseline: the finalized tasks of the same workspace without the task under test, each by its total action count. Threshold = nearest-rank p90 x ${p90Factor}; it fires at action floor(threshold) + 1. With fewer than ${minBaseline} baseline tasks a task is unrated (counted, never fired).`,
    'R3 (edit churn per file) is unavailable: episodes carry no file paths.',
    `${costed} of ${evaluated} evaluated tasks have a cost; a task without one is left out of every cost sum and counted in firedWithoutCost when a rule fires on it.`,
    'No speed was measured. Every figure is a count or a weighted-token proxy computed from the recorded tasks.',
  ];
}

/**
 * Replays the candidate rules over state.tasks and measures them. Pure: reads and writes nothing and never mutates `state`.
 * costOf(task) returns the task's effective cost as a number, or null when it has none (null, NaN and negatives all count as none).
 */
export function replayShadow(state, { costOf, minBaseline = 5, p90Factor = 1.25, familyRun = 3 } = {}) {
  if (typeof costOf !== 'function') throw new TypeError('replayShadow needs a costOf(task) callback');
  if (!Array.isArray(state?.tasks)) throw new TypeError('replayShadow needs a state with a tasks array');
  const rows = [];
  for (const task of state.tasks) {
    if (task?.status !== 'finalized') continue;
    const { actions, firstFiring } = scanEpisodes(task.episodes, familyRun);
    const cost = costOf(task);
    rows.push({
      id: typeof task.id === 'string' && task.id ? task.id : '?',
      workspace: typeof task.workspace === 'string' && task.workspace ? task.workspace : null,
      outcome: task.terminalOutcome === 'verified' || task.terminalOutcome === 'failed' ? task.terminalOutcome : '?',
      actions, firstFiring, cost: isCost(cost) ? cost : null,
    });
  }
  const baselines = new Map(); // workspace -> ascending total action counts of its finalized tasks
  for (const row of rows) {
    if (row.workspace === null) continue;
    if (!baselines.has(row.workspace)) baselines.set(row.workspace, []);
    baselines.get(row.workspace).push(row.actions);
  }
  for (const counts of baselines.values()) counts.sort((a, b) => a - b);
  const stats = () => ({ fired: 0, firedVerified: 0, firedFailed: 0, firedWithoutCost: 0, costAfterFiringFailed: 0, costAfterFiringVerified: 0 });
  const r1 = stats(), r2 = stats();
  let unrated = 0;
  const firings = [];
  const fire = (rule, ruleStats, row, firedAt) => {
    ruleStats.fired += 1;
    if (row.outcome === 'verified') ruleStats.firedVerified += 1;
    if (row.outcome === 'failed') ruleStats.firedFailed += 1;
    firings.push({ taskId: row.id, rule, firedAtAction: firedAt, totalActions: row.actions, outcome: row.outcome });
    if (row.cost === null) { ruleStats.firedWithoutCost += 1; return; }
    // Proxy: the cost after the firing point is the task's cost times the share of its actions that came after it.
    const after = row.actions > 0 ? (row.cost * (row.actions - firedAt)) / row.actions : 0;
    if (row.outcome === 'failed') ruleStats.costAfterFiringFailed += after;
    if (row.outcome === 'verified') ruleStats.costAfterFiringVerified += after;
  };
  for (const row of rows) { // state order; for one task R1 is listed before R2
    if (row.firstFiring !== null) fire('R1', r1, row, row.firstFiring);
    const long = longTask(row, baselines, { minBaseline, p90Factor });
    if (!long.rated) unrated += 1;
    else if (long.firedAt !== null) fire('R2', r2, row, long.firedAt);
  }
  const totalEffectiveCost = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  const verified = rows.filter(row => row.outcome === 'verified').length;
  const finish = (ruleStats, extra = {}) => ({
    ...ruleStats,
    costAfterFiringFailedShare: share(ruleStats.costAfterFiringFailed, totalEffectiveCost),
    verifiedShare: share(ruleStats.firedVerified, verified),
    ...extra,
  });
  return {
    tasks: {
      total: state.tasks.length,
      evaluated: rows.length,
      skippedNotFinalized: state.tasks.length - rows.length,
      verified,
      failed: rows.filter(row => row.outcome === 'failed').length,
    },
    totalEffectiveCost,
    rules: {
      R1: finish(r1),
      R2: finish(r2, { unrated }),
      R3: { status: 'tidak tersedia', reason: 'episodes carry no file paths, so edit churn per file cannot be computed' },
    },
    firings,
    notes: buildNotes({ minBaseline, p90Factor, familyRun, evaluated: rows.length, costed: rows.filter(row => row.cost !== null).length }),
  };
}

const table = rows => ['| What | Value |', '|---|---:|', ...rows.map(([name, value]) => `| ${name} | ${value} |`)].join('\n');
const whole = value => (Number.isInteger(value) ? String(value) : '?');
const weighted = value => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '?');
const percent = value => (typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '?');
const cell = value => String(value ?? '?').replace(/[|\r\n]+/g, ' ').slice(0, 80);
const label = value => '`' + path.basename(String(value)).replace(/[^\w .-]/g, '?').slice(0, 60) + '`';
const ruleRows = rule => [
  ['Tasks it would have touched', whole(rule.fired)],
  ['of those, ended verified (a wrong target)', whole(rule.firedVerified)],
  ['of those, ended failed', whole(rule.firedFailed)],
  ['of those, without a cost (left out of the cost rows)', whole(rule.firedWithoutCost)],
  ['Cost after firing, tasks that ended failed (weighted tokens)', weighted(rule.costAfterFiringFailed)],
  ['that cost as a share of total effective cost', percent(rule.costAfterFiringFailedShare)],
  ['Cost after firing, tasks that ended verified (weighted tokens)', weighted(rule.costAfterFiringVerified)],
  ['Verified tasks touched, as a share of all verified tasks', percent(rule.verifiedShare)],
];

/** Compact Markdown report for a replayShadow result: one table per rule, the notes and the first firings. Pure. */
export function renderReport(result, { source = 'state.json', costSource = null } = {}) {
  const { tasks, rules, firings } = result;
  const shown = firings.slice(0, MAX_FIRINGS_SHOWN);
  const out = [
    '# Shadow replay of stuck-task rules', '',
    `Source: ${label(source)}, opened read-only; this script writes no file.${costSource ? ` Cost: ${costSource}` : ''}`, '',
    table([
      ['Tasks in the state', whole(tasks.total)],
      ['Evaluated (finalized)', whole(tasks.evaluated)],
      ['Skipped (not finalized)', whole(tasks.skippedNotFinalized)],
      ['Evaluated, ended verified', whole(tasks.verified)],
      ['Evaluated, ended failed', whole(tasks.failed)],
      ['Total effective cost (weighted tokens, tasks with a cost)', weighted(result.totalEffectiveCost)],
    ]), '',
    '## R1: repeated failure family', '', table(ruleRows(rules.R1)), '',
    '## R2: long task (above p90 of the same workspace)', '',
    table([...ruleRows(rules.R2), ['Unrated (baseline too small, never fired)', whole(rules.R2.unrated)]]), '',
    '## R3: edit churn per file', '', table([['Status', cell(rules.R3.status)], ['Reason', cell(rules.R3.reason)]]), '',
    '## Notes', '', ...result.notes.map(note => `- ${note}`), '',
    `## Firings (showing ${shown.length} of ${firings.length}, at most ${MAX_FIRINGS_SHOWN})`, '',
  ];
  if (!shown.length) out.push('No rule fired on any evaluated task.');
  else out.push('| taskId | rule | firedAtAction | totalActions | outcome |', '|---|---|---:|---:|---|',
    ...shown.map(firing => `| ${cell(firing.taskId)} | ${cell(firing.rule)} | ${whole(firing.firedAtAction)} | ${whole(firing.totalActions)} | ${cell(firing.outcome)} |`));
  return out.join('\n') + '\n';
}

function renderUnreadable(source, reason) {
  return [
    '# Shadow replay of stuck-task rules', '',
    `Source: the state file ${label(source)} could not be read (${String(reason).replace(/[^\w .-]/g, '?').slice(0, 40)}). Nothing was replayed, so every value is ?.`, '',
    table([['Tasks in the state', '?'], ['Evaluated (finalized)', '?'], ['R1 tasks touched', '?'], ['R2 tasks touched', '?'], ['R3', '?']]), '',
  ].join('\n');
}

/** Reads and parses the state file; the file is only opened for reading. Returns { state } or { error: <short reason> }; never throws. */
export async function readState(file) {
  let text;
  try { text = await readFile(file, 'utf8'); } catch (error) { return { error: String(error?.code ?? 'unreadable') }; }
  let state;
  try { state = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); } catch { return { error: 'invalid JSON' }; }
  return Array.isArray(state?.tasks) ? { state } : { error: 'no tasks array' };
}

/** The costOf(task) callback backed by the V1 effectiveTaskCost in dist/effective-cost.js, or an Error when dist is not built. */
export async function loadEffectiveCost() {
  let costModule;
  try { costModule = await import('../../dist/effective-cost.js'); } catch (error) {
    throw new Error(`cannot load dist/effective-cost.js (run "npm run build" first): ${error?.code ?? error?.message ?? error}`);
  }
  if (typeof costModule.effectiveTaskCost !== 'function') throw new Error('dist/effective-cost.js does not export effectiveTaskCost');
  return task => {
    if (!task?.metrics || typeof task.metrics !== 'object') return null; // no counters: unknown, not a zero cost
    const identities = Array.isArray(task.modelIdentity?.identities) ? task.modelIdentity.identities : [];
    const { total } = costModule.effectiveTaskCost(task.metrics, identities.map(identity => identity?.model));
    return typeof total === 'number' ? total : null; // null for a model the V1 table does not price
  };
}

/** CLI body. `loadCost` and `write` can be replaced so the flow is testable without dist and without stdout. */
export async function main(argv, { loadCost = loadEffectiveCost, write = chunk => process.stdout.write(chunk) } = {}) {
  let stateFile = DEFAULT_STATE;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--state') throw new Error(`unknown option ${argv[index]}`);
    const value = argv[++index];
    if (!value) throw new Error('--state needs a file');
    stateFile = path.resolve(value);
  }
  const loaded = await readState(stateFile);
  if (loaded.error) { write(renderUnreadable(stateFile, loaded.error)); return; } // nothing to replay, so dist is not loaded either
  const costOf = await loadCost();
  write(renderReport(replayShadow(loaded.state, { costOf }), { source: stateFile, costSource: COST_SOURCE }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(String(error?.message ?? error)); process.exit(1); });
}
