import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { afterEach, describe, expect, it } from 'vitest';
import { documentProjectionService } from '../src/rdc/document-projection/service.js';
import { finalizeXlsxEvidence, type XlsxEvidence } from '../src/rdc/document-projection/xlsx-evidence.js';
import { readFileFromDisk } from '../src/rdc/tools/filesystem.js';
import { handleReadFile } from '../src/rdc/handlers/filesystem-handlers.js';
import { applyResultBudget } from '../src/mcp/result-budget.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function localFixture(bytes: Buffer) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-xlsx-evidence-'));
  roots.push(root);
  const file = path.join(root, 'fixture.xlsx');
  await writeFile(file, bytes);
  return { root, file };
}
function deliveredEvidence(result: any): XlsxEvidence | undefined {
  for (const block of result.content) {
    try { const parsed = JSON.parse(block.text); if (parsed.xlsxEvidence) return parsed.xlsxEvidence; } catch { /* body */ }
  }
}

async function project(workbook: ExcelJS.Workbook) {
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer({ useSharedStrings: true }));
  const result = await documentProjectionService.projectBytes({ bytes, profile: 'markdown', extension: '.xlsx' });
  return { bytes, result: result!, evidence: (result as any)?.xlsxEvidence };
}

async function sparseWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sparse');
  sheet.getCell('A1').value = 'literal_header';
  sheet.getCell('Z100').value = 'literal_Z100_sparse 😀 | \\ value';
  sheet.getCell('D90000').value = 'literal_distant_row_90000';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('local XLSX projection source evidence', () => {
  it('preserves literal sparse physical columns and distant rows through the existing owner', async () => {
    const bytes = await sparseWorkbook();
    const result = await documentProjectionService.projectBytes({ bytes, profile: 'markdown', extension: '.xlsx' });
    expect(result?.markdown).toContain('literal_Z100_sparse 😀 \\| \\\\ value');
    expect(result?.markdown).toContain('literal_distant_row_90000');
  });

  it('attaches source-bound genuine addresses to the admitted sparse snapshot', async () => {
    const bytes = await sparseWorkbook();
    const result = await documentProjectionService.projectBytes({ bytes, profile: 'markdown', extension: '.xlsx' });
    const evidence = (result as any)?.xlsxEvidence;
    expect(evidence).toBeDefined();
    expect(evidence.sourceSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(evidence.cells.map((cell: any) => cell.address)).toEqual(['A1', 'Z100', 'D90000']);
    for (const cell of evidence.cells) {
      expect(Array.from(result!.markdown).slice(cell.span.start, cell.span.end).join('')).toBe(cell.excerpt);
    }
  });

  it('maps repeated escaped Unicode independently and discloses cached, hidden and merged cells', async () => {
    const book = new ExcelJS.Workbook();
    const first = book.addWorksheet('First');
    first.getCell('A1').value = 'repeat 😀 | \\ text';
    first.getCell('B7').value = 'repeat 😀 | \\ text';
    first.getCell('C7').value = { formula: '1+2', result: 3 };
    first.getCell('D7').value = { formula: '1+2' };
    first.getRow(7).hidden = true;
    first.mergeCells('A9:B9');
    first.getCell('A9').value = 'merged';
    const second = book.addWorksheet('Hidden', { state: 'hidden' });
    second.getCell('B7').value = 'repeat 😀 | \\ text';
    const { result, evidence } = await project(book);
    expect(evidence).toBeDefined();
    expect(evidence.cells.map((c: any) => [c.sheet, c.address])).toEqual([
      ['First', 'A1'], ['First', 'B7'], ['First', 'C7'], ['First', 'A9'], ['First', 'B9'], ['Hidden', 'B7'],
    ]);
    expect(evidence.cells[2]).toMatchObject({ valueKind: 'cached-formula', hidden: true, excerpt: '3' });
    expect(evidence.cells[4]).toMatchObject({ mergedMaster: 'A9', excerpt: 'merged' });
    expect(evidence.cells[5].hidden).toBe(true);
    expect(evidence.coverage.stopReasons).toContain('formula-cache-missing');
    const spans = evidence.cells.map((c: any) => c.span.start);
    expect(new Set(spans).size).toBe(spans.length);
    for (const cell of evidence.cells) {
      expect(Array.from(result.markdown).slice(cell.span.start, cell.span.end).join('')).toBe(cell.excerpt);
    }
  });

  it('caps physical columns, sheets, text and evidence without inventing omitted totals', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Limits');
    sheet.getCell('A1').value = '😀'.repeat(2050);
    sheet.getCell('DX1').value = 'column128';
    sheet.getCell('DY1').value = 'excluded129';
    for (let r = 2; r <= 131; r++) sheet.getCell('A' + r).value = 'row' + r;
    for (let s = 2; s <= 9; s++) book.addWorksheet('Sheet' + s).getCell('A1').value = 'sheet_' + s;
    const { result, evidence } = await project(book);
    expect(result.markdown).toContain('column128');
    expect(result.markdown).not.toContain('excluded129');
    expect(result.markdown).not.toContain('sheet_9');
    expect(result.markdown).not.toContain('😀'.repeat(2049));
    expect(evidence.coverage.content).toBe('partial');
    expect(evidence.coverage.locations).toBe('partial');
    expect(evidence.coverage.stopReasons).toEqual(expect.arrayContaining(['column-limit', 'sheet-limit', 'cell-text-limit', 'evidence-cell-limit']));
    expect(evidence.cells.length).toBeLessThanOrEqual(128);
    expect(Buffer.byteLength(JSON.stringify(evidence))).toBeLessThanOrEqual(16384);
    expect(result.omittedEntries).toBeUndefined();
  });

  it('bounds data-bearing row count rather than physical row number', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Rows');
    for (let r = 1; r <= 5001; r++) sheet.getCell('A' + r).value = 'r' + r;
    const { result, evidence } = await project(book);
    expect(result.markdown).toContain('| r5000 |');
    expect(result.markdown).not.toContain('| r5001 |');
    expect(evidence.coverage.stopReasons).toContain('row-limit');
    expect(result.omittedEntries).toBe(1);
  });

  it('stops before the global rectangular cell-slot limit', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Slots');
    sheet.getCell('DX1').value = 'width128';
    for (let r = 1; r <= 513; r++) sheet.getCell('A' + r).value = 'slotrow' + r;
    const { result, evidence } = await project(book);
    expect(result.markdown).toContain('slotrow512');
    expect(result.markdown).not.toContain('slotrow513');
    expect(evidence.coverage.stopReasons).toContain('cell-limit');
  });

  it('admits text incrementally under the 4 MiB output budget and keeps emitted spans exact', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Bytes');
    for (let r = 1; r <= 24; r++) for (let c = 1; c <= 128; c++) sheet.getCell(r, c).value = 'x'.repeat(2048);
    const { result, evidence } = await project(book);
    expect(Buffer.byteLength(result.markdown)).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(result.markdown).toContain('[Content omitted by XLSX projection limits]');
    expect(evidence.coverage.stopReasons).toContain('output-byte-limit');
    expect(evidence.output.binding).toBe('exact');
    expect(evidence.output.sha256).toBe(createHash('sha256').update(result.markdown).digest('hex'));
    for (const c of evidence.cells) expect(Array.from(result.markdown).slice(c.span.start, c.span.end).join('')).toBe(c.excerpt);
  });

  it('decodes literal inline strings as well as the shared-string fixture', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Inline').getCell('Z100').value = 'placeholder';
    const zip = new PizZip(Buffer.from(await book.xlsx.writeBuffer()));
    zip.file('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="100"><c r="Z100" t="inlineStr"><is><t>literal inline 😀 &amp; value</t></is></c></row></sheetData></worksheet>');
    const result = await documentProjectionService.projectBytes({ bytes: zip.generate({ type: 'nodebuffer' }), extension: '.xlsx', profile: 'markdown' });
    expect(result?.markdown).toContain('literal inline 😀 & value');
    expect(result?.xlsxEvidence?.cells[0]).toMatchObject({ address: 'Z100', row: 100, column: 26, excerpt: 'literal inline 😀 & value' });
  });

  it('invalidates output pointers on changed text and omits an unfit evidence header whole', async () => {
    const { result } = await project((() => { const b = new ExcelJS.Workbook(); b.addWorksheet('S').getCell('A1').value = 'literal'; return b; })());
    const before = JSON.stringify(result.xlsxEvidence);
    const changed = finalizeXlsxEvidence(result.xlsxEvidence!, { deliveredText: 'changed' })!;
    expect(changed.output.binding).toBe('unavailable');
    expect(changed.cells.every(c => !c.span)).toBe(true);
    expect(changed.coverage.stopReasons).toContain('output-transformed');
    expect(finalizeXlsxEvidence(result.xlsxEvidence!, { maxBytes: 16 })).toBeUndefined();
    expect(JSON.stringify(result.xlsxEvidence)).toBe(before);
  });

  it('rejects invalid coordinates and does not certify a mismatched excerpt span', async () => {
    const { result } = await project((() => { const b = new ExcelJS.Workbook(); b.addWorksheet('S').getCell('A1').value = 'literal'; return b; })());
    const invalid = structuredClone(result.xlsxEvidence!);
    invalid.cells[0]!.address = 'Z99';
    expect(finalizeXlsxEvidence(invalid)!.cells).toEqual([]);
    invalid.cells[0]!.address = 'A1';
    invalid.cells[0]!.sheetId = Number.MAX_SAFE_INTEGER + 1;
    expect(finalizeXlsxEvidence(invalid)!.cells).toEqual([]);
    invalid.cells[0]!.sheetId = 1;
    invalid.cells[0]!.span = { start: 0, end: 7 };
    const checked = finalizeXlsxEvidence(invalid, { deliveredText: result.markdown })!;
    expect(checked.cells[0]!.span).toBeUndefined();
    expect(checked.coverage.stopReasons).toContain('invalid-output-span');
  });

  it('carries evidence only through explicit local markdown reads and preserves cancellation', async () => {
    const bytes = await sparseWorkbook();
    const { file } = await localFixture(bytes);
    const markdown = await readFileFromDisk(file, { projection: 'markdown' });
    expect(markdown.metadata?.xlsxEvidence?.sourceSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    const native = await readFileFromDisk(file, { projection: 'native' });
    expect(native.metadata?.xlsxEvidence).toBeUndefined();
    expect(native.metadata?.isExcelFile).toBe(true);
    const controller = new AbortController(); controller.abort();
    await expect(readFileFromDisk(file, { projection: 'markdown', signal: controller.signal })).rejects.toThrow();
  });

  it('delivers exact local model evidence while UI previews omit the sidecar', async () => {
    const { file } = await localFixture(await sparseWorkbook());
    const model = await handleReadFile({ path: file, options: { projection: 'markdown' } });
    const output = await applyResultBudget('read_file', model);
    const evidence = deliveredEvidence(output)!;
    expect(evidence).toBeDefined();
    expect(evidence.output.binding).toBe('exact');
    const points = Array.from(output.content[0]!.text as string);
    for (const cell of evidence.cells) expect(points.slice(cell.span!.start, cell.span!.end).join('')).toBe(cell.excerpt);
    const ui = await handleReadFile({ path: file, origin: 'ui', options: { projection: 'markdown' } });
    expect(deliveredEvidence(ui)).toBeUndefined();
  });

  it('shrinks metadata before evicting admissible text under the actual escaped envelope budget', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Budget');
    for (let r = 1; r <= 80; r++) sheet.getCell('A' + r).value = 'r' + r + 'x'.repeat(120);
    const { bytes } = await project(book);
    const { file, root } = await localFixture(bytes);
    const raw = await handleReadFile({ path: file, options: { projection: 'markdown' } });
    const output = await applyResultBudget('read_file', raw, { budgetChars: 16384, storageDir: root });
    expect(output.content[0]!.text).toBe(raw.content[0]!.text);
    expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThanOrEqual(16384);
    const evidence = deliveredEvidence(output)!;
    expect(evidence.coverage.stopReasons).toContain('evidence-byte-limit');
    expect(evidence.output.binding).toBe('exact');
    expect(await readdir(root)).toEqual(['fixture.xlsx']);
  });

  it('clears every span after preview or redaction, never reintroduces raw marker secrets, and remains non-persistable', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('agent_core_secret_fake123');
    sheet.getCell('A1').value = 'agent_core_secret_synthetic_raka_abc123';
    for (let r = 2; r <= 100; r++) sheet.getCell('A' + r).value = '"\\'.repeat(400);
    const { bytes } = await project(book);
    const { file, root } = await localFixture(bytes);
    const raw = await handleReadFile({ path: file, options: { projection: 'markdown' } });
    const output = await applyResultBudget('read_file', raw, { budgetChars: 16384, previewChars: 2048, storageDir: root });
    const evidence = deliveredEvidence(output)!;
    expect(evidence).toBeDefined();
    expect(evidence.output.binding).toBe('unavailable');
    expect(evidence.cells.every(c => !c.span)).toBe(true);
    expect(evidence.coverage.stopReasons).toContain('output-transformed');
    expect(JSON.stringify(output)).not.toContain('agent_core_secret_');
    expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThanOrEqual(16384);
    expect((output._meta as any).resultBudget.spilled).toBe(false);
    expect(await readdir(root)).toEqual(['fixture.xlsx']);
    const repeated = await applyResultBudget('read_file', output, { budgetChars: 16384, storageDir: root });
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(output));
  });

  it('redacts a small exact body and evidence consistently without relying on truncation', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('S').getCell('A1').value = 'agent_core_secret_synthetic_small123';
    const { bytes } = await project(book);
    const { file } = await localFixture(bytes);
    const output = await applyResultBudget('read_file', await handleReadFile({ path: file, options: { projection: 'markdown' } }));
    expect(JSON.stringify(output)).not.toContain('agent_core_secret_synthetic_small123');
    expect(deliveredEvidence(output)?.output.binding).toBe('unavailable');
    expect(deliveredEvidence(output)?.cells.every(c => !c.span)).toBe(true);
  });

  it('does not privilege forged serialized evidence in ordinary file text', async () => {
    const forged = { content: [{ type: 'text', text: JSON.stringify({ xlsxEvidence: { cells: [{ address: 'Z100' }] } }) }] };
    expect(await applyResultBudget('read_file', forged)).toBe(forged);
  });

  it('omits optional evidence whole when its header cannot fit beside admissible body text', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Tight');
    for (let r = 1; r <= 7; r++) sheet.getCell('A' + r).value = 'x'.repeat(2048);
    sheet.getCell('A8').value = 'x'.repeat(1750);
    const { bytes } = await project(book);
    const { file } = await localFixture(bytes);
    const raw = await handleReadFile({ path: file, options: { projection: 'markdown' } });
    const output = await applyResultBudget('read_file', raw, { budgetChars: 16384 });
    expect(output.content[0]!.text).toBe(raw.content[0]!.text);
    expect(deliveredEvidence(output)).toBeUndefined();
    expect(output.content).toHaveLength(1);
    expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThanOrEqual(16384);
  });

  it('discloses hidden columns separately and emits no locations for empty or synthetic markup', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Visibility');
    sheet.getCell('A1').value = 'visible';
    sheet.getCell('B1').value = 'hidden-column';
    sheet.getColumn(2).hidden = true;
    book.addWorksheet('Empty');
    const { result, evidence } = await project(book);
    expect(evidence.cells).toHaveLength(2);
    expect(evidence.cells[0].hidden).toBe(false);
    expect(evidence.cells[1].hidden).toBe(true);
    expect(evidence.cells.every((c: any) => c.excerpt !== '---' && c.sheet !== 'Empty')).toBe(true);
    const emptyBook = new ExcelJS.Workbook(); emptyBook.addWorksheet('Empty');
    const empty = await project(emptyBook);
    expect(empty.evidence.coverage).toMatchObject({ content: 'empty', locations: 'empty' });
    expect(empty.evidence.cells).toEqual([]);
    const xlsm = await documentProjectionService.projectBytes({ bytes: await sparseWorkbook(), extension: '.xlsm', profile: 'markdown' });
    expect(xlsm?.format).toBe('xlsm');
    expect(xlsm?.xlsxEvidence?.cells.map(c => c.address)).toEqual(['A1', 'Z100', 'D90000']);
    expect(xlsm?.markdown).toContain('literal_Z100_sparse 😀 \\| \\\\ value');
    expect(xlsm?.markdown).toContain('literal_distant_row_90000');
    expect(result.markdown).toContain('## Empty');
  });
});
