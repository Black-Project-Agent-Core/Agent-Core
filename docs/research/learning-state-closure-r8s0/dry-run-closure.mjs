// Learning state closure: R8-S0 dry-run instrument. Read-only on the live state.
// Works on a COPY of runtime/learning/external-controller.json given by --state and writes only under --out.
// It refuses a --state inside <root>/runtime/learning and an --out inside <root>/runtime.
// Usage: node docs/research/learning-state-closure-r8s0/dry-run-closure.mjs --state <copy.json> --out <scratch dir> --now <ISO time of the copy>
//        [--live-archive <runtime/learning/episodes-archive>] [--primary A+B7] [--report dry-run.json]
// The archive step re-implements ExternalControllerLearningService.save() (src/learning/external-controller.ts, "private async save"):
//   archive = episodes.filter(closedAt && !pendingLearning).slice(0, max(0, episodes.length - MAX_EPISODES)); written as <sha256(id)>.json.
// The state is serialized as writeStateFile() does: JSON.stringify(value, null, 2) + '\n' (src/persistence/state-file.ts).
// Scenario families:
//   close   - set closedAt = updatedAt on selected episodes (rules A and B of docs/proposals/Evidence-Gated-Harness-Self-Improvement-Lab.md 18.3),
//             then let the save() archive step move them. Closing changes behavior (see the R8-S0 report); kept to quantify the proposal as written.
//   archive - move selected episodes to the archive WITHOUT closedAt (a changed archive predicate); optionally prune session heads that point at them.
//   compact - same data, serialized without indentation (a measurement only; no episode moves).
// No rule touches pendingLearning episodes.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const need = (name) => arg(name) ?? (() => { throw new Error('missing ' + name); })();
const STATE = path.resolve(need('--state'));
const OUT = path.resolve(need('--out'));
const NOW = Date.parse(need('--now'));
const LIVE_ARCHIVE = arg('--live-archive') ? path.resolve(arg('--live-archive')) : undefined;
const PRIMARY = arg('--primary') ?? 'A+B7';
const REPORT = arg('--report') ?? 'dry-run.json';
const inside = (file, dir) => { const rel = path.relative(dir, file).toLowerCase(); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
if (!Number.isFinite(NOW)) throw new Error('--now must be an ISO time');
if (inside(STATE, path.join(ROOT, 'runtime', 'learning'))) throw new Error('REFUSED: --state is inside runtime/learning; copy it first');
if (inside(OUT, path.join(ROOT, 'runtime'))) throw new Error('REFUSED: --out is inside runtime');

const MAX_EPISODES = 128; // mirrors external-controller.ts
const DAY = 864e5;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const B = (s) => Buffer.byteLength(s, 'utf8');
const serialize = (v) => JSON.stringify(v, null, 2) + '\n';
const serializeCompact = (v) => JSON.stringify(v) + '\n';
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const round = (n, d = 2) => +n.toFixed(d);
const sum = (xs) => xs.reduce((n, x) => n + x, 0);

const raw = fs.readFileSync(STATE, 'utf8');
const state = JSON.parse(raw);
const byId = new Map(state.episodes.map((e) => [e.id, e]));
const fidelity = {
  stateSha256: sha(raw), bytes: B(raw), episodes: state.episodes.length,
  reserializeIdentical: serialize(state) === raw,
  compactBytes: B(serializeCompact(state)),
  nonCanonicalUpdatedAt: state.episodes.filter((e) => new Date(e.updatedAt).toISOString() !== e.updatedAt).length,
  arrayOrderEqualsStartedAtOrder: state.episodes.every((e, i, a) => i === 0 || a[i - 1].startedAt <= e.startedAt),
};

// ---- predicates ----
const headSessions = new Map();
for (const id of Object.values(state.sessionHeads)) headSessions.set(id, (headSessions.get(id) ?? 0) + 1);
const idleDays = (e) => (NOW - Date.parse(e.updatedAt)) / DAY;
const anyHead = (e) => headSessions.has(e.id);
const activeHead = (e) => anyHead(e) && idleDays(e) < 1; // head of a session whose episode changed within 24 hours
const open = (e) => !e.pendingLearning && !e.closedAt;
const ruleA = (guard, { skip = [], minIdle = 0 } = {}) => (e) => open(e) && Boolean(e.learningDecision) && !skip.includes(e.learningDecision) && idleDays(e) >= minIdle && !guard(e);
const ruleB = (days, guard) => (e) => open(e) && e.boundary === 'inferred' && e.events.length <= 1 && idleDays(e) > days && !guard(e);
const either = (a, b) => (e) => a(e) || b(e);
const DAYS = [1, 3, 7, 14, 30];
const NAK = { skip: ['awaiting-verification'] };
const scenarios = [
  ['A', 'close', ruleA(activeHead)],
  ['A(any head guarded)', 'close', ruleA(anyHead)],
  // A-nak: rule A without 'awaiting-verification' (that review left a verification obligation; verifyEpisode() returns early on a closed episode).
  ['A-nak', 'close', ruleA(activeHead, NAK)],
  ...[3, 7].map((d) => ['A-nak idle>=' + d + 'd', 'close', ruleA(activeHead, { ...NAK, minIdle: d })]),
  ['A-nak(any head guarded)', 'close', ruleA(anyHead, NAK)],
  ...DAYS.map((d) => ['B' + d, 'close', ruleB(d, activeHead)]),
  ...DAYS.map((d) => ['A+B' + d, 'close', either(ruleA(activeHead), ruleB(d, activeHead))]),
  // archive-only: no closedAt. Eligible = reviewed (learningDecision), not pending, idle for N days.
  ...[1, 7].map((d) => ['ARCH idle>=' + d + 'd, no head', 'archive', (e) => open(e) && Boolean(e.learningDecision) && !anyHead(e) && idleDays(e) >= d]),
  ...[3, 7, 14].map((d) => ['ARCH idle>=' + d + 'd, prune heads', 'archive-prune', (e) => open(e) && Boolean(e.learningDecision) && idleDays(e) >= d]),
  ['COMPACT serialization only', 'compact', () => false],
];

const referenced = new Set(state.procedures.flatMap((p) => [...(p.supportEpisodeIds ?? []), ...(p.failureEpisodeIds ?? [])]));
const predecessorOf = new Set(state.episodes.map((e) => e.predecessorEpisodeId).filter(Boolean));

function simulate(mode, selects) {
  const chosen = new Set(state.episodes.filter(selects).map((e) => e.id));
  const closing = mode === 'close';
  const episodes = state.episodes.map((e) => (closing && chosen.has(e.id) ? { ...e, closedAt: e.updatedAt } : e));
  const cap = Math.max(0, episodes.length - MAX_EPISODES);
  const archive = (closing ? episodes.filter((e) => e.closedAt && !e.pendingLearning) : episodes.filter((e) => chosen.has(e.id))).slice(0, cap);
  const archived = new Set(archive.map((e) => e.id));
  const sessionHeads = mode === 'archive-prune' ? Object.fromEntries(Object.entries(state.sessionHeads).filter(([, id]) => !archived.has(id))) : state.sessionHeads;
  const after = { version: state.version, workflowVersion: state.workflowVersion, episodes: episodes.filter((e) => !archived.has(e.id)), procedures: state.procedures, sessionHeads };
  const text = mode === 'compact' ? serializeCompact(after) : serialize(after);
  return { mode, closed: closing ? chosen : new Set(), archive, archived, after, afterText: text, files: archive.map((e) => ({ id: e.id, name: sha(e.id) + '.json', text: serialize(e) })) };
}
function summarize(name, s) {
  const moved = [...s.archived].map((id) => byId.get(id));
  const afterIds = new Set(s.after.episodes.map((e) => e.id));
  const stateAfter = B(s.afterText);
  return {
    name, mode: s.mode, closed: s.closed.size, archived: s.archived.size,
    movedCompactBytes: sum(moved.map((e) => B(JSON.stringify(e)))),
    stateBytesAfter: stateAfter, reductionBytes: fidelity.bytes - stateAfter, reductionPct: round(100 * (fidelity.bytes - stateAfter) / fidelity.bytes),
    archiveFileBytes: sum(s.files.map((f) => B(f.text))), episodesAfter: s.after.episodes.length,
    pendingMoved: moved.filter((e) => e.pendingLearning).length,
    activeHeadMoved: moved.filter(activeHead).length,
    anyHeadMoved: moved.filter(anyHead).length,
    procedureReferencedMoved: moved.filter((e) => referenced.has(e.id)).length,
    predecessorReferencedMoved: moved.filter((e) => predecessorOf.has(e.id)).length,
    boundMoved: moved.filter((e) => e.memoryBinding).length,
    awaitingVerificationMoved: moved.filter((e) => e.learningDecision === 'awaiting-verification').length,
    danglingHeadsAfter: Object.values(s.after.sessionHeads).filter((id) => !afterIds.has(id)).length,
    headsPruned: Object.keys(state.sessionHeads).length - Object.keys(s.after.sessionHeads).length,
  };
}
const table = scenarios.map(([name, mode, fn]) => summarize(name, simulate(mode, fn)));

// ---- baseline groups (section 18.1 definitions) ----
const compact = (e) => B(JSON.stringify(e));
const grp = (fn) => { const xs = state.episodes.filter(fn); return { count: xs.length, compactBytes: sum(xs.map(compact)) }; };
const eventBytes = sum(state.episodes.map((e) => B(JSON.stringify(e.events))));
const baseline = {
  now: new Date(NOW).toISOString(),
  withClosedAt: state.episodes.filter((e) => e.closedAt).length,
  withTerminalOutcome: state.episodes.filter((e) => e.terminalOutcome).length,
  sessionHeads: Object.keys(state.sessionHeads).length, distinctHeadEpisodes: headSessions.size,
  headEpisodesActiveWithin24h: [...headSessions.keys()].filter((id) => byId.has(id) && activeHead(byId.get(id))).length,
  headsMissingEpisode: Object.values(state.sessionHeads).filter((id) => !byId.has(id)).length,
  decisionNotPendingNotClosed: { ...grp((e) => open(e) && e.learningDecision), boundaryExplicit: state.episodes.filter((e) => open(e) && e.learningDecision && e.boundary === 'explicit').length, olderThan7d: state.episodes.filter((e) => open(e) && e.learningDecision && idleDays(e) > 7).length },
  noDecisionNotPending: { ...grp((e) => open(e) && !e.learningDecision), boundaryInferred: state.episodes.filter((e) => open(e) && !e.learningDecision && e.boundary === 'inferred').length, atMostOneEvent: state.episodes.filter((e) => open(e) && !e.learningDecision && e.events.length <= 1).length, olderThan7d: state.episodes.filter((e) => open(e) && !e.learningDecision && idleDays(e) > 7).length },
  pending: { ...grp((e) => e.pendingLearning), meaningful: state.episodes.filter((e) => e.pendingLearning && e.meaningful).length, olderThan7d: state.episodes.filter((e) => e.pendingLearning && idleDays(e) > 7).length, olderThan14d: state.episodes.filter((e) => e.pendingLearning && idleDays(e) > 14).length },
  episodesCompactBytesTotal: sum(state.episodes.map(compact)),
  events: { count: sum(state.episodes.map((e) => e.events.length)), compactBytes: eventBytes, shareOfEpisodeBytesPct: round(100 * eventBytes / sum(state.episodes.map(compact))),
    inPendingEpisodesCompactBytes: sum(state.episodes.filter((e) => e.pendingLearning).map((e) => B(JSON.stringify(e.events)))) },
  learningDecisionValues: Object.fromEntries([...new Set(state.episodes.map((e) => e.learningDecision).filter(Boolean))].map((v) => [v, state.episodes.filter((e) => e.learningDecision === v).length])),
};

// ---- idle-age histogram of rule B candidates (to choose N from data) ----
const bands = [[0, 1], [1, 3], [3, 7], [7, 14], [14, 30], [30, Infinity]];
const bCandidates = state.episodes.filter((e) => open(e) && e.boundary === 'inferred' && e.events.length <= 1 && !activeHead(e));
const bHistogram = bands.map(([lo, hi]) => { const xs = bCandidates.filter((e) => idleDays(e) >= lo && idleDays(e) < hi); return { idleDays: lo + '-' + (hi === Infinity ? 'inf' : hi), count: xs.length, compactBytes: sum(xs.map(compact)) }; });

// ---- primary scenario: write artifacts and verify ----
const primary = scenarios.find(([name]) => name === PRIMARY);
if (!primary) throw new Error('unknown --primary ' + PRIMARY);
const ps = simulate(primary[1], primary[2]);
fs.rmSync(OUT, { recursive: true, force: true });
const archiveDir = path.join(OUT, 'episodes-archive');
fs.mkdirSync(archiveDir, { recursive: true });
fs.writeFileSync(path.join(OUT, 'state-after.json'), ps.afterText);
for (const f of ps.files) fs.writeFileSync(path.join(archiveDir, f.name), f.text);

const readBack = fs.readdirSync(archiveDir).filter((n) => /^[a-f0-9]{64}\.json$/.test(n)).map((n) => ({ n, ep: JSON.parse(fs.readFileSync(path.join(archiveDir, n), 'utf8')) }));
const afterIds = new Set(ps.after.episodes.map((e) => e.id));
const archiveIds = new Set(readBack.map((r) => r.ep.id));
const union = new Set([...afterIds, ...archiveIds]);
const liveNames = LIVE_ARCHIVE && fs.existsSync(LIVE_ARCHIVE) ? new Set(fs.readdirSync(LIVE_ARCHIVE)) : new Set();
const metricTotals = (eps) => ['toolCalls', 'toolFailures', 'repeatedFailures', 'memoryRecalls', 'artifactUses', 'verifications'].map((k) => sum(eps.map((e) => e.metrics?.[k] ?? 0)));
const unionEpisodes = [...ps.after.episodes, ...readBack.map((r) => r.ep)];
const boundArchived = readBack.filter((r) => r.ep.memoryBinding);
const expected = (id) => (ps.mode === 'close' ? { ...byId.get(id), closedAt: byId.get(id).updatedAt } : byId.get(id));
const verification = {
  primary: PRIMARY, mode: ps.mode,
  archiveFilesWritten: ps.files.length, archiveFilesReadBack: readBack.length,
  fileNameEqualsSha256OfId: readBack.filter((r) => r.n === sha(r.ep.id) + '.json').length,
  identicalToExpectedEpisode: readBack.filter((r) => serialize(r.ep) === serialize(expected(r.ep.id))).length,
  boundArchivedEpisodes: boundArchived.length,
  boundArchivedResolvable: boundArchived.filter((r) => typeof r.ep.memoryBinding.ownerId === 'string' && r.ep.memoryBinding.ownerId && typeof r.ep.workspace === 'string' && r.ep.workspace).length,
  originalEpisodes: state.episodes.length, unionEpisodes: union.size,
  lostIds: state.episodes.filter((e) => !union.has(e.id)).length,
  idsInBothStateAndArchive: [...afterIds].filter((id) => archiveIds.has(id)).length,
  metricTotalsBefore: metricTotals(state.episodes), metricTotalsUnion: metricTotals(unionEpisodes),
  collisionWithLiveArchive: ps.files.filter((f) => liveNames.has(f.name)).length,
  pendingEpisodesStillInState: state.episodes.filter((e) => e.pendingLearning).filter((e) => afterIds.has(e.id)).length,
  pendingEpisodes: state.episodes.filter((e) => e.pendingLearning).length,
  activeHeadEpisodesStillInState: [...headSessions.keys()].filter((id) => byId.has(id) && activeHead(byId.get(id)) && afterIds.has(id)).length,
};
verification.metricTotalsEqual = JSON.stringify(verification.metricTotalsBefore) === JSON.stringify(verification.metricTotalsUnion);

// ---- local microbenchmark: one mutation = parse + serialize + write generation + .last-good + readback ----
function atomicWrite(file, data) {
  const tmp = path.join(path.dirname(file), '.' + path.basename(file) + '.tmp-bench-' + process.pid);
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
function bench(label, value, ser) {
  const text = ser(value);
  const dir = path.join(OUT, 'bench');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, label + '.json');
  atomicWrite(file, text);
  const parse = [], stringify = [], write = [];
  for (let i = 0; i < 9; i++) {
    let t = performance.now(); const prev = fs.readFileSync(file, 'utf8'); JSON.parse(prev); parse.push(performance.now() - t);
    t = performance.now(); const out = ser(value); stringify.push(performance.now() - t);
    t = performance.now(); atomicWrite(file + '.last-good', prev); atomicWrite(file, out); if (fs.readFileSync(file, 'utf8') !== out) throw new Error('readback'); write.push(performance.now() - t);
  }
  return { label, bytes: B(text), parseMs: round(median(parse)), stringifyMs: round(median(stringify)), writeMs: round(median(write)), totalMs: round(median(parse) + median(stringify) + median(write)) };
}
// Interleaved order (before, after, compact) so slow drift of the disk does not favour one variant.
const benchResult = [bench('before', state, serialize), bench('after', ps.after, serialize), bench('before-compact', state, serializeCompact), bench('after-compact', ps.after, serializeCompact)];
// recentEpisodes() reads and parses every archive file on each call: time that for the primary archive.
const t0 = performance.now();
for (const n of fs.readdirSync(archiveDir)) JSON.parse(fs.readFileSync(path.join(archiveDir, n), 'utf8'));
const archiveReadMs = round(performance.now() - t0);

const primaryRow = table.find((r) => r.name === PRIMARY);
const falsifiers = {
  reductionBelow10pct: primaryRow.reductionPct < 10,
  archiveUnreadable: verification.archiveFilesReadBack !== verification.archiveFilesWritten || verification.identicalToExpectedEpisode !== verification.archiveFilesWritten || verification.boundArchivedResolvable !== verification.boundArchivedEpisodes,
  episodeLost: verification.lostIds > 0 || verification.idsInBothStateAndArchive > 0,
  pendingOrActiveHeadMoved: primaryRow.pendingMoved > 0 || primaryRow.activeHeadMoved > 0,
};
const result = { instrument: 'dry-run-closure.mjs', fidelity, baseline, scenarios: table, ruleBIdleHistogram: bHistogram, verification,
  benchmark: { note: 'local microbenchmark, warm page cache, median of 9; not a measurement of Agent Core request latency', runs: benchResult, archiveReadAllFilesMs: archiveReadMs, archiveFilesInPrimary: ps.files.length },
  falsifiers };
fs.writeFileSync(path.join(OUT, REPORT), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ fidelity, falsifiers, primary: primaryRow, verification: { ...verification, metricTotalsBefore: undefined, metricTotalsUnion: undefined }, benchmark: result.benchmark.runs }, null, 2));
