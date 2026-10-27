import { createHash } from 'node:crypto';

export const XLSX_MAX_SHEETS = 8;
export const XLSX_MAX_ROWS_PER_SHEET = 5000;
export const XLSX_MAX_COLUMNS = 128;
export const XLSX_MAX_RENDERED_CELLS = 65_536;
export const XLSX_MAX_CELL_CODEPOINTS = 2048;
export const XLSX_EVIDENCE_MAX_CELLS = 128;
export const XLSX_EVIDENCE_MAX_EXCERPT_CODEPOINTS = 160;
export const XLSX_EVIDENCE_MAX_BYTES = 16_384;
export const XLSX_EVIDENCE_BLOCK = Symbol('xlsx-evidence-block');

export interface XlsxCellEvidence {
  sheetId: number;
  sheet: string;
  row: number;
  column: number;
  address: string;
  excerpt: string;
  span?: { start: number; end: number };
  valueKind: 'cell-text' | 'cached-formula';
  hidden: boolean;
  mergedMaster?: string;
}
export interface XlsxEvidence {
  version: 1;
  sourceSha256: string;
  sourceBytes: number;
  extractor: 'exceljs-cell-text/v1';
  output: { sha256: string; unit: 'unicode-codepoint'; binding: 'exact' | 'unavailable' };
  coverage: {
    content: 'complete' | 'partial' | 'empty';
    locations: 'complete' | 'partial' | 'empty';
    stopReasons: string[];
  };
  cells: XlsxCellEvidence[];
  limitations: string[];
}

export const xlsxTextDigest = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** Takes a prefix without allocating a codepoint array for an unbounded cell. */
export function xlsxTextPrefix(text: string, limit: number): { text: string; truncated: boolean } {
  let end = 0;
  let count = 0;
  for (const point of text) {
    if (count === limit) return { text: text.slice(0, end), truncated: true };
    end += point.length;
    count += 1;
  }
  return { text, truncated: false };
}

function validCoordinate(cell: XlsxCellEvidence): boolean {
  if (!Number.isSafeInteger(cell.sheetId) || cell.sheetId < 1
    || !Number.isInteger(cell.row) || cell.row < 1 || cell.row > 1_048_576
    || !Number.isInteger(cell.column) || cell.column < 1 || cell.column > 16_384) return false;
  let letters = '';
  for (let n = cell.column; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
  return cell.address === letters + cell.row;
}

/** A bounded copy. Source coordinates survive changed delivery, output pointers do not. */
export function finalizeXlsxEvidence(
  evidence: XlsxEvidence,
  options: { maxBytes?: number; deliveredText?: string; outputTransformed?: boolean } = {},
): XlsxEvidence | undefined {
  if (evidence.version !== 1 || !/^[a-f0-9]{64}$/.test(evidence.sourceSha256)
    || !Number.isSafeInteger(evidence.sourceBytes) || evidence.sourceBytes < 0) return undefined;
  const maxBytes = Math.max(0, Math.min(XLSX_EVIDENCE_MAX_BYTES, options.maxBytes ?? XLSX_EVIDENCE_MAX_BYTES));
  const changed = options.outputTransformed || evidence.output.binding !== 'exact'
    || (options.deliveredText !== undefined && xlsxTextDigest(options.deliveredText) !== evidence.output.sha256);
  const reasons = new Set(evidence.coverage.stopReasons.slice(0, 32).map(s => xlsxTextPrefix(s, 80).text));
  if (changed) reasons.add('output-transformed');
  const result: XlsxEvidence = {
    version: 1, sourceSha256: evidence.sourceSha256, sourceBytes: evidence.sourceBytes,
    extractor: 'exceljs-cell-text/v1',
    output: { sha256: evidence.output.sha256, unit: 'unicode-codepoint', binding: changed ? 'unavailable' : 'exact' },
    coverage: { ...evidence.coverage, stopReasons: [] }, cells: [],
    limitations: evidence.limitations.slice(0, 8).map(s => xlsxTextPrefix(s, 256).text),
  };
  if (changed) result.coverage.locations = 'partial';
  const points = !changed && options.deliveredText !== undefined ? Array.from(options.deliveredText) : undefined;
  for (const cell of evidence.cells.slice(0, XLSX_EVIDENCE_MAX_CELLS)) {
    if (!validCoordinate(cell)) { reasons.add('invalid-location'); result.coverage.locations = 'partial'; continue; }
    const excerpt = xlsxTextPrefix(cell.excerpt, XLSX_EVIDENCE_MAX_EXCERPT_CODEPOINTS).text;
    const copy: XlsxCellEvidence = {
      sheetId: cell.sheetId, sheet: xlsxTextPrefix(cell.sheet, 128).text,
      row: cell.row, column: cell.column, address: cell.address, excerpt,
      valueKind: cell.valueKind === 'cached-formula' ? 'cached-formula' : 'cell-text', hidden: !!cell.hidden,
      ...(cell.mergedMaster ? { mergedMaster: xlsxTextPrefix(cell.mergedMaster, 16).text } : {}),
    };
    if (!changed && cell.span && Number.isSafeInteger(cell.span.start) && Number.isSafeInteger(cell.span.end)
      && cell.span.start >= 0 && cell.span.end - cell.span.start === Array.from(excerpt).length
      && (!points || points.slice(cell.span.start, cell.span.end).join('') === excerpt)) copy.span = { ...cell.span };
    else if (!changed) { reasons.add('invalid-output-span'); result.coverage.locations = 'partial'; }
    result.cells.push(copy);
  }
  if (evidence.cells.length > XLSX_EVIDENCE_MAX_CELLS) {
    reasons.add('evidence-cell-limit'); result.coverage.locations = 'partial';
  }
  result.coverage.stopReasons = [...reasons];
  // Reserve the reason before dropping records, so the final header is counted too.
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > maxBytes) {
    reasons.add('evidence-byte-limit'); result.coverage.locations = 'partial';
    result.coverage.stopReasons = [...reasons];
    while (result.cells.length && Buffer.byteLength(JSON.stringify(result), 'utf8') > maxBytes) result.cells.pop();
  }
  return Buffer.byteLength(JSON.stringify(result), 'utf8') <= maxBytes ? result : undefined;
}
