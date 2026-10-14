import assert from 'node:assert/strict';
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyResultBudget } from '../../dist/mcp/result-budget.js';
import { buildPdfEvidence, PDF_EVIDENCE_BLOCK } from '../../dist/rdc/tools/pdf/lib/evidence.js';

// Scalar adapter contract only: no synthetic PDF, network, provider or Memory writes.
const evidence = await buildPdfEvidence({
  sourceSha256: '3'.repeat(64), sourceBytes: 1234, observedAt: '2026-10-14T00:00:00.000Z',
  extractor: { name: '@opendocsg/pdf2md', version: '0.2.9' }, totalPages: 1,
  selection: { mode: 'range', offset: 0, length: 1 }, requestedPages: 1, pageNumbers: [1],
  pages: [{ items: Array.from({ length: 32 }, (_, i) => ({
    text: i === 0 ? 'token=private-fixture visible text' : 'M'.repeat(160),
    x: i, y: 20, width: 30, height: 8,
  })) }],
  pdfDocument: { getPage: async () => ({ view: [0, 0, 600, 800], rotate: 0, userUnit: 1 }) },
  extractImages: false,
});
const marked = value => ({ type: 'text', text: JSON.stringify(value), [PDF_EVIDENCE_BLOCK]: evidence });
const readResult = text => ({ content: [{ type: 'text', text }, marked({ pdfEvidence: evidence })] });
const budget = 16 * 1024;
const temporaryRoot = await realpath(os.tmpdir());
const directory = await mkdtemp(path.join(temporaryRoot, 'agent-core-pdf-delivery-'));
assert.equal(path.dirname(directory), temporaryRoot);
const options = { budgetChars: budget, previewChars: 2048, storageDir: directory };
function deliveredEvidence(result) {
  const values = result.content.flatMap(block => {
    if (block.type !== 'text') return [];
    try { return [JSON.parse(block.text)]; } catch { return []; }
  });
  const value = values.find(item => item.pdfEvidence);
  assert.ok(value, 'PDF evidence must reach model-facing JSON text');
  const pdf = value.pdfEvidence;
  assert.equal(pdf.coverage.metadataBytes, Buffer.byteLength(JSON.stringify(pdf), 'utf8'));
  assert.ok(pdf.coverage.metadataBytes <= pdf.coverage.byteLimit);
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') <= budget);
  assert.ok(!JSON.stringify(result).includes('private-fixture'));
  assert.equal(pdf.sourceSha256, evidence.sourceSha256);
  return value;
}
try {
  const read = await applyResultBudget('read_file', readResult('token=private-fixture visible text'), options);
  assert.equal(deliveredEvidence(read).pdfEvidence.coverage.status, 'complete');
  assert.equal(read.content.length, 2);
  assert.deepEqual(await readdir(directory), []);
  const largeRead = await applyResultBudget('read_file', readResult('token=private-fixture ' + '中'.repeat(40_000)), options);
  assert.equal(largeRead._meta.resultBudget.spilled, false);
  assert.equal(largeRead._meta.resultBudget.reason, 'non-persistable-tool');
  assert.ok(deliveredEvidence(largeRead).pdfEvidence.coverage.stopReasons.includes('output-truncated'));
  assert.deepEqual(await readdir(directory), [], 'read_file output must never be persisted');
  // Scalar image transport fixture: metadata must not displace an already-fitting image/text envelope.
  const existing = { content: [{ type: 'text', text: 'Original page text' },
    { type: 'image', data: '', mimeType: 'image/png' }] };
  existing.content[1].data = 'A'.repeat(budget - 2048 - Buffer.byteLength(JSON.stringify(existing), 'utf8'));
  const nearBudget = await applyResultBudget('read_file',
    { content: [...existing.content, marked({ pdfEvidence: evidence })] }, options);
  assert.deepEqual(nearBudget.content.slice(0, 2), existing.content);
  const shrunkEvidence = deliveredEvidence(nearBudget).pdfEvidence;
  assert.ok(shrunkEvidence.coverage.omittedItems > 0);
  assert.ok(shrunkEvidence.coverage.metadataBytes < evidence.coverage.metadataBytes);
  const noHeaderRoom = { content: [{ type: 'text', text: '' }] };
  noHeaderRoom.content[0].text = 'B'.repeat(budget - 8 - Buffer.byteLength(JSON.stringify(noHeaderRoom), 'utf8'));
  const explicitFailure = await applyResultBudget('read_file',
    { content: [...noHeaderRoom.content, marked({ pdfEvidence: evidence })] }, options);
  assert.equal(explicitFailure.isError, true);
  assert.ok(explicitFailure.content[0].text.startsWith('PDF_RESULT_BUDGET_EXCEEDED'));
  assert.deepEqual(await readdir(directory), []);
  const fake = { content: [{ type: 'text', text: JSON.stringify({ pdfEvidence: evidence }) }] };
  assert.equal(await applyResultBudget('read_file', fake, options), fake, 'Unmarked JSON must not opt in');
  const oversizedFake = { content: [{ type: 'text', text: fake.content[0].text + 'x'.repeat(40_000) }] };
  const fakePreview = await applyResultBudget('read_file', oversizedFake, options);
  assert.equal(fakePreview.content.length, 1, 'Unmarked text must not gain an evidence block');
  assert.equal(fakePreview._meta.resultBudget.reason, 'non-persistable-tool');
} finally {
  assert.equal(path.dirname(directory), temporaryRoot);
  assert.ok(path.basename(directory).startsWith('agent-core-pdf-delivery-'));
  await rm(directory, { recursive: true, force: true });
}
console.log('PDF read_file delivery check passed: text JSON, redaction, bounded nonpersistable output and marker isolation.');
