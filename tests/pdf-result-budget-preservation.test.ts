import { describe, expect, it } from 'vitest';
import { applyResultBudget, type BudgetableToolResult } from '../src/mcp/result-budget.js';
import { buildPdfEvidence, PDF_EVIDENCE_BLOCK } from '../src/rdc/tools/pdf/lib/evidence.js';

// Parsed-page fixture: this checks evidence delivery, not PDF extraction fidelity.
async function parsedPageEvidence() {
  return buildPdfEvidence({
    sourceSha256: 'a'.repeat(64), sourceBytes: 1234, observedAt: '2026-10-26T00:00:00Z',
    extractor: { name: 'fixture-parser', version: '1' }, totalPages: 1,
    selection: { mode: 'all' }, requestedPages: 1, pageNumbers: [1],
    pages: [{ items: [{ text: 'Literal PDF evidence', x: 10, y: 20, width: 80, height: 12 }] }],
    pdfDocument: { getPage: async () => ({ view: [0, 0, 600, 800], rotate: 0, userUnit: 1 }) },
    extractImages: false,
  });
}

describe('existing PDF evidence with the shared XLSX-capable result budget', () => {
  it.each([false, true])('preserves PDF identity and honest coverage (preview=%s)', async preview => {
    const evidence = await parsedPageEvidence();
    const body = preview ? 'Literal PDF evidence\n' + 'x'.repeat(30_000) : 'Literal PDF evidence';
    const output = await applyResultBudget<BudgetableToolResult>('read_file', { content: [
      { type: 'text', text: body },
      { type: 'text', text: JSON.stringify({ pdfEvidence: evidence }), [PDF_EVIDENCE_BLOCK]: evidence },
    ] }, { budgetChars: 16_384, previewChars: 2048 });
    expect(output.isError).not.toBe(true);
    expect(Buffer.byteLength(JSON.stringify(output), 'utf8')).toBeLessThanOrEqual(16_384);
    const blocks = output.content.map(block => { try { return JSON.parse(block.text!); } catch { return null; } });
    const delivered = blocks.find(block => block?.pdfEvidence)?.pdfEvidence;
    expect(delivered).toMatchObject({ sourceSha256: 'a'.repeat(64), sourceBytes: 1234,
      textSource: 'pdf-text-layer', semanticVerification: 'not-performed',
      pages: [{ pageNumber: 1, items: [{ id: 'p1:t0', text: 'Literal PDF evidence' }] }],
      coverage: { status: preview ? 'partial' : 'complete' } });
    expect(blocks.some(block => block?.xlsxEvidence)).toBe(false);
    if (preview) expect(delivered.coverage.stopReasons).toContain('output-truncated');
    else expect(output.content[0]!.text).toBe(body);
  });
});
