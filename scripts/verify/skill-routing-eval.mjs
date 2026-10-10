import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_EVIDENCE_ROOT = path.join(ROOT, 'runtime', 'tmp', 'skill-routing-effectiveness');
const MAX_QUERIES = 500;
const MAX_RUNS = 20_000;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/i;

function digest(value) {
  const bytes = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value);
  return 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
}
function inside(candidate, root) {
  const c = path.resolve(candidate);
  const r = path.resolve(root);
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const child = normalize(c), parent = normalize(r);
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}
function safeId(value, label, max = 200) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max || !/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/.test(text)) {
    throw new Error(label + '_INVALID');
  }
  return text;
}
function sha(value, label) {
  const text = String(value ?? '');
  if (!DIGEST_RE.test(text)) throw new Error(label + '_INVALID');
  return text.toLowerCase();
}
function finiteFraction(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value >= 0.5) {
    throw new Error(label + '_INVALID');
  }
  return value;
}
function seededRank(seed, id) {
  return crypto.createHash('sha256').update(String(seed)).update('\0').update(id).digest('hex');
}
function metric(num, den) {
  return den > 0 ? num / den : null;
}
function confusion(rows) {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const row of rows) {
    if (row.shouldTrigger && row.triggered) tp++;
    else if (row.shouldTrigger && !row.triggered) fn++;
    else if (!row.shouldTrigger && row.triggered) fp++;
    else tn++;
  }
  const precision = metric(tp, tp + fp);
  const recall = metric(tp, tp + fn);
  const specificity = metric(tn, tn + fp);
  const falseTriggerRate = metric(fp, fp + tn);
  const missedTriggerRate = metric(fn, fn + tp);
  const balancedAccuracy = recall !== null && specificity !== null ? (recall + specificity) / 2 : null;
  return {
    counts: { truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn },
    precision,
    recall,
    specificity,
    falseTriggerRate,
    missedTriggerRate,
    balancedAccuracy,
  };
}
function parseFixture(raw) {
  const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.queries)
    || parsed.queries.length < 4 || parsed.queries.length > MAX_QUERIES) {
    throw new Error('SKILL_ROUTING_FIXTURE_INVALID');
  }
  const ids = new Set();
  const queries = parsed.queries.map((item, index) => {
    const id = safeId(item?.id, 'SKILL_ROUTING_QUERY_' + index, 100);
    if (ids.has(id)) throw new Error('SKILL_ROUTING_DUPLICATE_QUERY');
    ids.add(id);
    if (typeof item?.query !== 'string' || !item.query.trim() || item.query.length > 10_000) {
      throw new Error('SKILL_ROUTING_QUERY_TEXT_INVALID');
    }
    if (typeof item.shouldTrigger !== 'boolean') throw new Error('SKILL_ROUTING_CLASS_INVALID');
    return { id, query: item.query, shouldTrigger: item.shouldTrigger };
  });
  const positives = queries.filter(row => row.shouldTrigger);
  const negatives = queries.filter(row => !row.shouldTrigger);
  if (positives.length < 2 || negatives.length < 2) throw new Error('SKILL_ROUTING_CLASSES_INSUFFICIENT');
  return { schemaVersion: 1, queries };
}
function parseObservations(raw, queryIds) {
  const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.runs)
    || parsed.runs.length < 1 || parsed.runs.length > MAX_RUNS) {
    throw new Error('SKILL_ROUTING_OBSERVATIONS_INVALID');
  }
  const skill = {
    name: safeId(parsed.skill?.name, 'SKILL_ROUTING_SKILL_NAME', 64),
    digest: sha(parsed.skill?.digest, 'SKILL_ROUTING_SKILL_DIGEST'),
  };
  const controllerId = safeId(parsed.controller?.id, 'SKILL_ROUTING_CONTROLLER', 200);
  const manifestFingerprint = sha(parsed.manifestFingerprint, 'SKILL_ROUTING_MANIFEST');
  const runs = parsed.runs.map((row, index) => {
    const queryId = safeId(row?.queryId, 'SKILL_ROUTING_RUN_QUERY_' + index, 100);
    if (!queryIds.has(queryId)) throw new Error('SKILL_ROUTING_UNKNOWN_QUERY');
    if (!Number.isSafeInteger(row?.run) || row.run < 1 || row.run > 10_000) {
      throw new Error('SKILL_ROUTING_RUN_INDEX_INVALID');
    }
    if (typeof row?.triggered !== 'boolean') throw new Error('SKILL_ROUTING_TRIGGERED_INVALID');
    return {
      queryId,
      run: row.run,
      complete: row.complete === true,
      triggered: row.triggered,
    };
  });
  const keys = runs.map(row => row.queryId + '\0' + row.run);
  if (new Set(keys).size !== keys.length) throw new Error('SKILL_ROUTING_DUPLICATE_RUN');
  return { skill, controllerId, manifestFingerprint, runs };
}
export function splitSkillRoutingFixture(fixture, options = {}) {
  const holdout = finiteFraction(options.holdout ?? 0.25, 'SKILL_ROUTING_HOLDOUT');
  const seed = Number.isSafeInteger(options.seed) ? options.seed : 42;
  const byClass = [
    fixture.queries.filter(row => row.shouldTrigger),
    fixture.queries.filter(row => !row.shouldTrigger),
  ];
  const train = [], holdoutRows = [];
  for (const rows of byClass) {
    const ranked = rows.slice().sort((a, b) =>
      seededRank(seed, a.id).localeCompare(seededRank(seed, b.id)) || a.id.localeCompare(b.id));
    const count = Math.max(1, Math.min(ranked.length - 1, Math.floor(ranked.length * holdout)));
    holdoutRows.push(...ranked.slice(0, count));
    train.push(...ranked.slice(count));
  }
  return {
    seed,
    holdout,
    train: train.sort((a, b) => a.id.localeCompare(b.id)),
    holdoutRows: holdoutRows.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
function cohortReport(rows, runs, minimumRuns) {
  const ids = new Set(rows.map(row => row.id));
  const classById = new Map(rows.map(row => [row.id, row.shouldTrigger]));
  const eligible = [];
  const issues = [];
  for (const row of rows) {
    const observed = runs.filter(run => run.queryId === row.id);
    const completed = observed.filter(run => run.complete);
    if (completed.length < minimumRuns) {
      issues.push({ queryId: row.id, reason: 'insufficient-complete-runs', completedRuns: completed.length });
    }
    if (observed.some(run => !run.complete)) {
      issues.push({ queryId: row.id, reason: 'incomplete-run-present' });
    }
  }
  for (const run of runs) {
    if (!ids.has(run.queryId) || !run.complete) continue;
    eligible.push({
      queryId: run.queryId,
      shouldTrigger: classById.get(run.queryId),
      triggered: run.triggered,
    });
  }
  return {
    queryCount: rows.length,
    runCount: eligible.length,
    metrics: confusion(eligible),
    issues,
  };
}
export function evaluateSkillRouting(fixtureBytes, observationBytes, options = {}) {
  const fixture = parseFixture(fixtureBytes);
  const queryIds = new Set(fixture.queries.map(row => row.id));
  const observations = parseObservations(observationBytes, queryIds);
  const minimumRuns = Math.max(1, Math.min(50, options.minimumRuns ?? 2));
  const split = splitSkillRoutingFixture(fixture, options);
  const train = cohortReport(split.train, observations.runs, minimumRuns);
  const holdout = cohortReport(split.holdoutRows, observations.runs, minimumRuns);
  const allIssues = [
    ...train.issues.map(issue => ({ cohort: 'train', ...issue })),
    ...holdout.issues.map(issue => ({ cohort: 'holdout', ...issue })),
  ];
  const complete = allIssues.length === 0
    && observations.runs.every(run => run.complete);
  return {
    schemaVersion: 1,
    kind: 'skill-routing-holdout',
    evaluatorRevision: 'agent-core-skill-routing-v1',
    ok: complete,
    complete,
    advisoryOnly: true,
    mutatesSkills: false,
    minimumRuns,
    split: {
      seed: split.seed,
      holdoutFraction: split.holdout,
      trainIds: split.train.map(row => row.id),
      holdoutIds: split.holdoutRows.map(row => row.id),
    },
    skill: observations.skill,
    controllerId: observations.controllerId,
    manifestFingerprint: observations.manifestFingerprint,
    fixtureDigest: digest(Buffer.from(fixtureBytes)),
    observationsDigest: digest(Buffer.from(observationBytes)),
    train,
    holdout,
    improvementView: {
      cohort: 'train',
      metrics: train.metrics,
      queryIds: split.train.map(row => row.id),
    },
    issues: allIssues,
  };
}
async function writePrivateJson(filePath, value) {
  const handle = await fs.open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}
function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = arg('--fixture');
  const observations = arg('--observations');
  if (!fixture || !observations) {
    console.error('Usage: node scripts/verify/skill-routing-eval.mjs --fixture <json> --observations <json> [--minimum-runs N] [--holdout F] [--seed N]');
    process.exitCode = 2;
  } else {
    const evidenceRoot = path.resolve(arg('--evidence-root') ?? DEFAULT_EVIDENCE_ROOT);
    if (!inside(evidenceRoot, DEFAULT_EVIDENCE_ROOT)) throw new Error('SKILL_ROUTING_EVIDENCE_OUTSIDE_RUNTIME_TMP');
    const fixtureBytes = await fs.readFile(path.resolve(fixture));
    const observationBytes = await fs.readFile(path.resolve(observations));
    const minimumRuns = Number(arg('--minimum-runs') ?? 2);
    const holdout = Number(arg('--holdout') ?? 0.25);
    const seed = Number(arg('--seed') ?? 42);
    if (!Number.isSafeInteger(minimumRuns) || minimumRuns < 1 || minimumRuns > 50) {
      throw new Error('SKILL_ROUTING_MINIMUM_RUNS_INVALID');
    }
    if (!Number.isSafeInteger(seed)) throw new Error('SKILL_ROUTING_SEED_INVALID');
    const report = evaluateSkillRouting(fixtureBytes, observationBytes, { minimumRuns, holdout, seed });
    const runDir = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/g, '-'));
    await fs.mkdir(runDir, { recursive: true, mode: 0o700 });
    await writePrivateJson(path.join(runDir, 'report.json'), report);
    console.log(JSON.stringify({ ...report, evidenceDir: runDir }, null, 2));
    if (!report.ok) process.exitCode = 1;
  }
}
