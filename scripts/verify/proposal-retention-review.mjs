// Read-only aggregate review. Canonical note contents and identities never enter the report.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveModuleProjectRoot } from '../../dist/portability/paths.js';
import { readMemoryActivation, memoryHostPath } from '../../dist/memory/host-runtime.js';
import { parseCanonicalNote } from '../../dist/memory/note-format.js';
import { scoreMemoryRetention, RETENTION_PARAMS } from '../../dist/memory/retention-score.js';
import { scoreMemoryForgetting, FORGETTING_PARAMS } from '../../dist/memory/forgetting-curve.js';
import { memoryFeedbackContentDigest } from '../../dist/memory/feedback-target.js';

const root = resolveModuleProjectRoot(import.meta.url);
const activation = await readMemoryActivation(root);
assert.equal(activation?.root, 'runtime/memory');
const memoryRoot = await memoryHostPath(root, activation.root);
const feedback = JSON.parse(await readFile(path.join(memoryRoot, 'state/feedback.json'), 'utf8'));
assert.equal(feedback.version, 1);
const byId = new Map(feedback.records.map(item => [item.id, item]));
const now = Date.now(), rows = [], snapshot = createHash('sha256');
const files = (await readdir(path.join(memoryRoot, 'notes'))).filter(file => file.endsWith('.md')).sort();
for (const file of files) {
  const bytes = await readFile(await memoryHostPath(root, `runtime/memory/notes/${file}`));
  snapshot.update(file).update('\0').update(bytes).update('\0');
  const record = parseCanonicalNote(bytes.toString('utf8'));
  const history = byId.get(record.id), digest = memoryFeedbackContentDigest(record);
  const events = (history?.events ?? []).filter(event => event.contentDigest === digest);
  const helpful = events.filter(event => event.kind === 'helpful').length;
  const negative = events.filter(event => ['not-helpful', 'stale', 'wrong'].includes(event.kind)).length;
  const salience = history?.salience ?? 1;
  const alternative = { ...record, retrievalCount: helpful };
  rows.push({ pinned: record.pinned, accesses: record.retrievalCount ?? 0, helpful, negative,
    feedback: events.length, legacy: scoreMemoryRetention(record, now, salience)?.score,
    helpfulOnly: scoreMemoryRetention(alternative, now, salience)?.score,
    forgetting: scoreMemoryForgetting(record, now, { salience })?.score,
    forgettingHelpfulOnly: scoreMemoryForgetting(alternative, now, { salience })?.score });
}
const total = rows.reduce((sum, row) => sum + row.accesses, 0);
const sorted = [...rows].sort((a, b) => b.accesses - a.accesses);
const sum = (key, subset = rows) => subset.reduce((value, row) => value + row[key], 0);
const changed = (a, b, threshold) => rows.filter(row => !row.pinned && row[a] !== undefined && row[b] !== undefined
  && (row[a] < threshold) !== (row[b] < threshold)).length;
const top = sorted.slice(0, Math.min(10, sorted.length));
assert(total >= sum('accesses', top));
assert.equal(sum('helpful') + sum('negative'), sum('feedback'));
const report = { schemaVersion: 1, observedAt: new Date(now).toISOString(),
  sourceDigest: 'sha256:' + snapshot.digest('hex'), mode: 'read-only-aggregate',
  records: rows.length, pinned: rows.filter(row => row.pinned).length,
  retrievals: total, retrievedRecords: rows.filter(row => row.accesses > 0).length,
  topTenRetrievalShare: total ? sum('accesses', top) / total : null,
  explicitCurrentRevisionFeedback: { records: rows.filter(row => row.feedback > 0).length,
    helpful: sum('helpful'), negative: sum('negative'),
    topTenWithFeedback: top.filter(row => row.feedback > 0).length },
  counterfactual: { policy: 'helpful-feedback-count replaces per-read count; no production mutation',
    legacyStaleMembershipChanges: changed('legacy', 'helpfulOnly', RETENTION_PARAMS.reviewThreshold),
    forgettingStaleMembershipChanges: changed('forgetting', 'forgettingHelpfulOnly', FORGETTING_PARAMS.reviewThreshold),
    limits: 'Forgetting confidence held at the function default 0.5 in both arms; helpful feedback is not independent verified causal outcome.' },
  decision: 'Keep existing scoring: retrieval concentration is observational; feedback coverage cannot establish harmful bias or justify outcome-weight replacement.',
  safety: { canonicalWrites: 0, noteContentsDisclosed: false, identitiesDisclosed: false,
    truthOrConfidenceInferredFromRetrieval: false } };
console.log(JSON.stringify(report, null, 2));
