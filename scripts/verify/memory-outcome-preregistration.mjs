// Seals already-observed synthetic development evidence. Never runs a task,
// benchmark, inference consumer, provider, or the historical stopped harness.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value);
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw Error('INVALID_PREREGISTRATION_FIELDS');
};
const inside = (root, file) => { const relative = path.relative(root, file); return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
async function noLinks(file) {
  const resolved = path.resolve(file), parts = resolved.slice(path.parse(resolved).root.length).split(path.sep).filter(Boolean); let current = path.parse(resolved).root;
  for (const part of parts) { current = path.join(current, part); const entry = await fs.lstat(current); if (entry.isSymbolicLink()) throw Error('SYMLINK_REFUSED'); }
}
async function read(file) {
  await noLinks(file); const before = await fs.lstat(file);
  if (!before.isFile() || before.size > 16 * 1024 * 1024) throw Error('INVALID_PREREGISTRATION_ARTIFACT');
  const handle = await fs.open(file, 'r');
  try {
    const opened = await handle.stat(); if (before.ino !== opened.ino || before.dev !== opened.dev) throw Error('FILE_IDENTITY_CHANGED');
    const bytes = await handle.readFile(); const after = await handle.stat(), current = await fs.lstat(file);
    if (bytes.length > 16 * 1024 * 1024 || after.ino !== current.ino || after.dev !== current.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || current.isSymbolicLink()) throw Error('INPUT_CHANGED_DURING_READ');
    return bytes;
  } finally { await handle.close(); }
}
async function dependencies(provided) {
  if (provided) return provided;
  const contract = await import(pathToFileURL(path.join(ROOT, 'dist/learning/outcome-contract.js')).href);
  const evaluator = await import(pathToFileURL(path.join(ROOT, 'dist/learning/outcome-evaluation.js')).href);
  const verifier = await import(pathToFileURL(path.join(ROOT, 'dist/learning/outcome-verifier.js')).href);
  if (typeof evaluator.validateOutcomePreregistration !== 'function') throw Error('BLOCKED:PREREGISTRATION_BUILD_REQUIRED');
  return { ...contract, ...evaluator, ...verifier };
}
function median(values) { const ordered = [...values].sort((a, b) => a - b), mid = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2; }
function requireBaseline(suite, rows, modules) {
  if (suite.mode !== 'offline' || suite.driver !== 'scripted' || suite.preregistration !== null || suite.preregistrationDigest !== null || rows.some(row => row.arm === 'candidate')) throw Error('INVALID_FROZEN_BASELINE');
  const reasons = modules.validateOutcomePairs(suite, rows); if (reasons.length) throw Error('INVALID_BASELINE_ROWS:' + reasons[0]);
  const report = modules.evaluateOutcome(suite, rows);
  if (!report.complete || !report.hardGates.passed || modules.verifyOutcome(Buffer.from(canonical(suite)), Buffer.from(canonical(rows)), report).verdict !== 'pass') throw Error('BASELINE_EVIDENCE_INVALID');
}
function validatedActiveSuite(core, registration, rows, modules, options) {
  const active = modules.parseOutcomeSuite({ ...core, preregistration: registration, preregistrationDigest: modules.outcomeDigest(registration) });
  const replay = modules.validateOutcomePreregistration(active, rows, options);
  if (replay.status !== 'PASS') throw Error('INVALID_PREREGISTRATION_EVIDENCE:' + replay.reasons.join(','));
  return active;
}
/** Optional second argument supplies real parser/validator implementations for
 * embedders. The default uses the explicitly built project modules. */
export async function sealOutcomePreregistration({ baselinePath, developmentPath, output, observedAt, registeredAt = new Date().toISOString(), latency = 'DEFERRED', cost = 'DEFERRED', costCeiling, currency, usefulnessMinDelta = 0 }, provided) {
  const modules = await dependencies(provided), baseline = path.resolve(baselinePath), destination = path.resolve(output);
  if (inside(baseline, destination)) throw Error('PREREGISTRATION_OUTPUT_SCOPE');
  if (!['DEFERRED', 'measured'].includes(latency) || !['DEFERRED', 'measured'].includes(cost) || typeof usefulnessMinDelta !== 'number' || !Number.isFinite(usefulnessMinDelta) || usefulnessMinDelta < 0) throw Error('INVALID_PREREGISTRATION_OPTIONS');
  await noLinks(baseline); await noLinks(developmentPath);
  const suiteBytes = await read(path.join(baseline, 'fixtures/suite.json')), core = modules.parseOutcomeSuite(JSON.parse(suiteBytes));
  const baselineRows = JSON.parse(await read(path.join(baseline, 'results/observations.json'))); baselineRows.forEach(modules.parseOutcomeObservation); requireBaseline(core, baselineRows, modules);
  const baselineReport = JSON.parse(await read(path.join(baseline, 'report/report.json')));
  if (!baselineReport.complete || baselineReport.phase !== 'baseline' || modules.verifyOutcome(suiteBytes, Buffer.from(canonical(baselineRows)), baselineReport).verdict !== 'pass') throw Error('BASELINE_SEAL_INVALID');
  const developmentFile = (await fs.lstat(developmentPath)).isDirectory() ? path.join(developmentPath, 'results/observations.json') : developmentPath;
  const observations = JSON.parse(await read(developmentFile)); if (!Array.isArray(observations)) throw Error('INVALID_DEVELOPMENT_ROWS'); observations.forEach(modules.parseOutcomeObservation);
  const current = observations.filter(row => row.arm === 'current'), values = current.map(row => row.latencyMs.total);
  let latencyFields = { status: latency, baselineP95: null, mad: null, limitMs: null, unit: 'ms', method: 'baseline-p95-plus-2-MAD' };
  if (latency === 'measured') {
    if (!values.length) throw Error('DEVELOPMENT_LATENCY_UNAVAILABLE');
    const p95 = [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1], center = median(values), mad = median(values.map(value => Math.abs(value - center)));
    latencyFields = { ...latencyFields, baselineP95: p95, mad, limitMs: p95 + 2 * mad };
  }
  let costFields = { status: cost, baselineAmount: null, ceiling: null, currency: null, method: 'measured-baseline-and-approved-ceiling' };
  if (cost === 'measured') {
    if (typeof costCeiling !== 'number' || !Number.isFinite(costCeiling) || costCeiling < 0 || typeof currency !== 'string' || !currency || !current.length || current.some(row => !row.cost || row.cost.status === 'unavailable' || row.cost.amount === null || row.cost.currency !== currency)) throw Error('DEVELOPMENT_COST_UNAVAILABLE');
    costFields = { ...costFields, baselineAmount: current.reduce((sum, row) => sum + row.cost.amount, 0), ceiling: costCeiling, currency };
  }
  const registration = { registeredAt, baselineDigest: modules.outcomeDigest(baselineRows), developmentDigest: modules.outcomeDigest(observations), correctnessMinDelta: 0, usefulnessMinDelta, latency: latencyFields, cost: costFields, developmentEvidence: { observedAt, observations } };
  // Candidate time is deliberately not in the sidecar. This value is only a
  // schema check placeholder; the candidate-time gate is enabled by the loader.
  validatedActiveSuite(core, { registeredAt, candidateOpenedAt: registeredAt, ...registration }, baselineRows, modules, { checkCandidateTimestamp: false });
  const seal = { schemaVersion: 1, frozenSuiteDigest: hash(suiteBytes), baselineDigest: registration.baselineDigest, registration, registrationDigest: hash(canonical(registration)) };
  await fs.mkdir(path.dirname(destination), { recursive: true }); await noLinks(path.dirname(destination));
  let handle;
  try { handle = await fs.open(destination, 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') throw Error('OUTPUT_EXISTS'); throw error; }
  try { await handle.writeFile(canonical(seal)); await handle.sync(); }
  catch (error) { const identity = await handle.stat(); const currentFile = await fs.lstat(destination).catch(() => null); if (currentFile?.ino === identity.ino && currentFile.dev === identity.dev) await fs.unlink(destination); throw error; }
  finally { await handle.close(); }
  return seal;
}
/** Returns the active suite. Frozen core bytes and the sidecar remain separate
 * archive members; actual candidateOpenedAt must come from the runner. */
export async function loadOutcomePreregistration(file, { suiteBytes, baselineRows, candidateOpenedAt }, provided) {
  const modules = await dependencies(provided), seal = JSON.parse(await read(file));
  exact(seal, ['schemaVersion', 'frozenSuiteDigest', 'baselineDigest', 'registration', 'registrationDigest']);
  if (seal.schemaVersion !== 1 || seal.frozenSuiteDigest !== hash(suiteBytes) || seal.baselineDigest !== modules.outcomeDigest(baselineRows) || seal.registrationDigest !== hash(canonical(seal.registration))) throw Error('PREREGISTRATION_SEAL_MISMATCH');
  exact(seal.registration, ['registeredAt', 'baselineDigest', 'developmentDigest', 'correctnessMinDelta', 'usefulnessMinDelta', 'latency', 'cost', 'developmentEvidence']);
  const core = modules.parseOutcomeSuite(JSON.parse(Buffer.from(suiteBytes).toString('utf8'))); requireBaseline(core, baselineRows, modules);
  if (seal.registration.baselineDigest !== seal.baselineDigest) throw Error('PREREGISTRATION_BASELINE_MISMATCH');
  return validatedActiveSuite(core, { registeredAt: seal.registration.registeredAt, candidateOpenedAt, ...seal.registration }, baselineRows, modules);
}
