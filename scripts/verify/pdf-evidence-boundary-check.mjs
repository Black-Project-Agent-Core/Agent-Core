import assert from 'node:assert/strict';
import { buildPdfEvidence, finalizePdfEvidence } from '../../dist/rdc/tools/pdf/lib/evidence.js';

// Contract check over scalar parser output; no synthetic PDF, provider call or store.
const rawPages = Array.from({ length: 10 }, () => ({
    items: Array.from({ length: 40 }, (_, index) => ({
        text: index === 0 ? 'token=private-value ' + '😀'.repeat(170)
            : index === 2 ? 'Download https://url-user:url-pass@example.com/report.pdf?sig=signing-secret#private-fragment'
            : index === 3 ? 'https://[invalid?sig=signing-secret#private-fragment' : '😀'.repeat(160),
        x: index, y: 10, width: 12, height: index === 1 ? Number.NaN : 8,
    })),
}));
const evidence = await buildPdfEvidence({
    sourceSha256: '1'.repeat(64), sourceBytes: 1234, observedAt: '2026-10-14T00:00:00.000Z',
    extractor: { name: '@opendocsg/pdf2md', version: '0.2.9' }, totalPages: 10,
    selection: { mode: 'all' }, requestedPages: 10,
    pageNumbers: Array.from({ length: 10 }, (_, index) => index + 1), pages: rawPages,
    pdfDocument: { getPage: async () => ({ view: [-20, -10, 600, 800], rotate: 90, userUnit: 1 }) },
    extractImages: false,
});
rawPages[0].items[0].text = 'changed after capture';
assert.equal(evidence.pages[0].items[2].text, 'Download https://example.com/report.pdf');
assert.equal(evidence.pages[0].items[3].text, '[URL REDACTED]');
for (const limit of [32_768, 2048]) {
    const bounded = finalizePdfEvidence(evidence, { maxBytes: limit, outputTruncated: true });
    assert.ok(bounded);
    const serialized = JSON.stringify(bounded);
    assert.equal(bounded.coverage.metadataBytes, Buffer.byteLength(serialized, 'utf8'));
    assert.ok(bounded.coverage.metadataBytes <= limit);
    assert.equal(bounded.coverage.status, 'partial');
    assert.ok(bounded.coverage.stopReasons.includes('output-truncated'));
    assert.equal(bounded.coverage.selectedItems, 400);
    assert.equal(bounded.coverage.omittedItems, 400 - bounded.coverage.returnedItems);
    assert.equal(bounded.coverage.omittedPages, 10 - bounded.pages.length);
    assert.ok(bounded.pages.length <= 8);
    assert.ok(!serialized.includes('private-value') && !serialized.includes('changed after capture'));
    for (const secret of ['url-user', 'url-pass', 'signing-secret', 'private-fragment']) {
        assert.ok(!serialized.includes(secret));
    }
    assert.equal(bounded.capabilities.embeddedImageExtraction.attempted, false);
    for (const page of bounded.pages) {
        assert.ok(page.items.length <= 32);
        for (const item of page.items) {
            assert.ok(Array.from(item.text).length <= 160);
            assert.ok(!/[\uD800-\uDBFF]$/.test(item.text));
            if (item.textItemIndex === 1) assert.equal(item.position, undefined);
        }
    }
}
const outputBoundary = structuredClone(evidence);
outputBoundary.pages[0].items[0].text = 'https://url-user:url-pass@example.com/report.pdf?sig=signing-secret#private-fragment';
assert.equal(finalizePdfEvidence(outputBoundary).pages[0].items[0].text, 'https://example.com/report.pdf');
assert.equal(finalizePdfEvidence(evidence, { maxBytes: 1 }), undefined);
const empty = await buildPdfEvidence({
    sourceSha256: '2'.repeat(64), sourceBytes: 100, observedAt: '2026-10-14T00:00:00.000Z',
    extractor: { name: '@opendocsg/pdf2md', version: '0.2.9' }, totalPages: 10,
    selection: { mode: 'range', offset: 20, length: 1 }, requestedPages: 1,
    pageNumbers: [], pages: [], extractImages: true,
    pdfDocument: { getPage: async () => { throw new Error('Empty selection must not request a page'); } },
});
assert.equal(empty.coverage.status, 'empty');
assert.equal(empty.coverage.returnedPages, 0);
assert.equal(empty.coverage.nextPage, undefined);
assert.equal(empty.capabilities.embeddedImageExtraction.attempted, false);
console.log('PDF evidence boundary check passed: UTF-8 budget, redaction, geometry, omission and empty selection.');
