import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_EVIDENCE_ROOT = path.join(ROOT, 'runtime', 'tmp', 'skill-effectiveness');
const MAX_TASKS = 200;
const MAX_RUNS = 10_000;

function digest(value) {
  const bytes = typeof value === 'string' || Buffer.isBuffer(value)
    ? value
    : JSON.stringify(value);
  return 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
}
function inside(candidate, root) {
  const c = path.resolve(candidate), r = path.resolve(root);
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const child = normalize(c), parent = normalize(r);
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}
function finite(value, label, min = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new Error(label + '_INVALID');
  return value;
}
function stats(values) {
  if (!values.length) return { mean: 0, stddev: 0, min: 0, max: 0, count: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
    : 0;
  return {
    mean,
    stddev: Math.sqrt(variance),
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
  };
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
  if (!/^sha256:[a-f0-9]{64}$/i.test(text)) throw new Error(label + '_INVALID');
  return text.toLowerCase();
}
function parseFixture(raw) {
  const parsed = JSON.parse(raw);
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.tasks)
    || parsed.tasks.length < 1 || parsed.tasks.length > MAX_TASKS) {
    throw new Error('SKILL_EFFECTIVENESS_FIXTURE_INVALID');
  }
  const ids = new Set();
  const tasks = parsed.tasks.map((task, index) => {
    const id = safeId(task?.id, 'SKILL_EFFECTIVENESS_TASK_' + index, 100);
    if (ids.has(id)) throw new Error('SKILL_EFFECTIVENESS_DUPLICATE_TASK');
    ids.add(id);
    return { id };
  });
  return { schemaVersion: 1, tasks };
}

function parseObservations(raw, taskIds) {
  const parsed = JSON.parse(raw);
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.runs)
    || parsed.runs.length < 1 || parsed.runs.length > MAX_RUNS) {
    throw new Error('SKILL_EFFECTIVENESS_OBSERVATIONS_INVALID');
  }
  const skill = {
    name: safeId(parsed.skill?.name, 'SKILL_EFFECTIVENESS_SKILL_NAME', 64),
    digest: sha(parsed.skill?.digest, 'SKILL_EFFECTIVENESS_SKILL_DIGEST'),
  };
  const controllerId = safeId(parsed.controller?.id, 'SKILL_EFFECTIVENESS_CONTROLLER', 200);
  const manifestFingerprint = sha(parsed.manifestFingerprint, 'SKILL_EFFECTIVENESS_MANIFEST');
  const runs = parsed.runs.map((row, index) => {
    const taskId = safeId(row?.taskId, 'SKILL_EFFECTIVENESS_RUN_TASK_' + index, 100);
    if (!taskIds.has(taskId)) throw new Error('SKILL_EFFECTIVENESS_UNKNOWN_TASK');
    if (!['skill', 'control'].includes(row?.condition)) throw new Error('SKILL_EFFECTIVENESS_CONDITION_INVALID');
    if (!Number.isSafeInteger(row?.run) || row.run < 1 || row.run > 10_000) {
      throw new Error('SKILL_EFFECTIVENESS_RUN_INDEX_INVALID');
    }
    return {
      taskId,
      condition: row.condition,
      run: row.run,
      complete: row.complete === true,
      correct: row.correct === true,
      durationMs: finite(row.durationMs, 'SKILL_EFFECTIVENESS_DURATION'),
      toolCalls: finite(row.toolCalls, 'SKILL_EFFECTIVENESS_TOOL_CALLS'),
      errorCount: finite(row.errorCount, 'SKILL_EFFECTIVENESS_ERROR_COUNT'),
      outputChars: finite(row.outputChars, 'SKILL_EFFECTIVENESS_OUTPUT_CHARS'),
    };
  });
  const keys = runs.map(row => [row.taskId, row.condition, row.run].join('\0'));
  if (new Set(keys).size !== keys.length) throw new Error('SKILL_EFFECTIVENESS_DUPLICATE_RUN');
  return { skill, controllerId, manifestFingerprint, runs };
}
function conditionStats(runs) {
  const complete = runs.filter(row => row.complete);
  return {
    observedRuns: runs.length,
    completedRuns: complete.length,
    accuracy: stats(complete.map(row => row.correct ? 1 : 0)),
    durationMs: stats(complete.map(row => row.durationMs)),
    toolCalls: stats(complete.map(row => row.toolCalls)),
    errorCount: stats(complete.map(row => row.errorCount)),
    outputChars: stats(complete.map(row => row.outputChars)),
  };
}
function delta(skill, control) {
  return {
    accuracy: skill.accuracy.mean - control.accuracy.mean,
    durationMs: skill.durationMs.mean - control.durationMs.mean,
    toolCalls: skill.toolCalls.mean - control.toolCalls.mean,
    errorCount: skill.errorCount.mean - control.errorCount.mean,
    outputChars: skill.outputChars.mean - control.outputChars.mean,
  };
}

export function evaluateSkillEffectiveness(fixtureBytes, observationBytes, options = {}) {
  const fixture = parseFixture(Buffer.from(fixtureBytes).toString('utf8'));
  const taskIds = new Set(fixture.tasks.map(task => task.id));
  const observations = parseObservations(Buffer.from(observationBytes).toString('utf8'), taskIds);
  const minimumRuns = Math.max(1, Math.min(50, options.minimumRuns ?? 2));
  const issues = [];
  const taskSummary = [];
  for (const task of fixture.tasks) {
    const skillRuns = observations.runs.filter(row => row.taskId === task.id && row.condition === 'skill');
    const controlRuns = observations.runs.filter(row => row.taskId === task.id && row.condition === 'control');
    const completeSkill = skillRuns.filter(row => row.complete).length;
    const completeControl = controlRuns.filter(row => row.complete).length;
    if (completeSkill < minimumRuns || completeControl < minimumRuns) {
      issues.push({ taskId: task.id, reason: 'insufficient-complete-runs' });
    }
    if (skillRuns.length !== controlRuns.length) {
      issues.push({ taskId: task.id, reason: 'condition-run-count-mismatch' });
    }
    taskSummary.push({
      taskId: task.id,
      skill: conditionStats(skillRuns),
      control: conditionStats(controlRuns),
    });
  }
  const allSkill = observations.runs.filter(row => row.condition === 'skill');
  const allControl = observations.runs.filter(row => row.condition === 'control');
  const skill = conditionStats(allSkill);
  const control = conditionStats(allControl);
  const complete = issues.length === 0
    && observations.runs.every(row => row.complete)
    && allSkill.length === allControl.length;

  return {
    schemaVersion: 1,
    kind: 'skill-effectiveness-ab',
    ok: complete,
    complete,
    advisoryOnly: true,
    mutatesSkills: false,
    minimumRuns,
    skill: observations.skill,
    controllerId: observations.controllerId,
    manifestFingerprint: observations.manifestFingerprint,
    fixtureDigest: digest(Buffer.from(fixtureBytes)),
    observationsDigest: digest(Buffer.from(observationBytes)),
    taskCount: fixture.tasks.length,
    runCount: observations.runs.length,
    configurations: { skill, control },
    delta: delta(skill, control),
    issues,
    tasks: taskSummary,
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
    console.error('Usage: node scripts/verify/skill-effectiveness-eval.mjs --fixture <json> --observations <json> [--minimum-runs N]');
    process.exitCode = 2;
  } else {
    const evidenceRoot = path.resolve(arg('--evidence-root') ?? DEFAULT_EVIDENCE_ROOT);
    if (!inside(evidenceRoot, DEFAULT_EVIDENCE_ROOT)) throw new Error('SKILL_EFFECTIVENESS_EVIDENCE_OUTSIDE_RUNTIME_TMP');
    const fixtureBytes = await fs.readFile(path.resolve(fixture));
    const observationBytes = await fs.readFile(path.resolve(observations));
    const minimumRunsRaw = arg('--minimum-runs');
    const minimumRuns = minimumRunsRaw === undefined ? 2 : Number(minimumRunsRaw);
    if (!Number.isSafeInteger(minimumRuns) || minimumRuns < 1 || minimumRuns > 50) {
      throw new Error('SKILL_EFFECTIVENESS_MINIMUM_RUNS_INVALID');
    }
    const report = evaluateSkillEffectiveness(fixtureBytes, observationBytes, { minimumRuns });
    const runDir = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/g, '-'));
    await fs.mkdir(runDir, { recursive: true, mode: 0o700 });
    await writePrivateJson(path.join(runDir, 'report.json'), report);
    console.log(JSON.stringify({ ...report, evidenceDir: runDir }, null, 2));
    if (!report.ok) process.exitCode = 1;
  }
}
