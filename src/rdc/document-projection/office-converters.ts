import path from 'node:path';
import { createHash } from 'node:crypto';
import PizZip from 'pizzip';
import ExcelJS from 'exceljs';
import * as XLS from '@e965/xlsx';
import type { Element } from '@xmldom/xmldom';
import type { ProjectionConverter, ProjectionInput, ProjectionResult } from './types.js';
import {
  attrByLocalName,
  childElements,
  descendantText,
  descendants,
  directChild,
  localName,
  markdownTable,
  escapeMarkdownTableCell,
  DOCUMENT_OUTPUT_MAX_BYTES,
  parseXml,
  resolveArchiveTarget,
  semanticRequested,
  textContent,
  zipText,
} from './helpers.js';
import { parsePdfBytesToMarkdown } from '../tools/pdf/index.js';
import {
  XLSX_MAX_SHEETS, XLSX_MAX_ROWS_PER_SHEET, XLSX_MAX_COLUMNS, XLSX_MAX_RENDERED_CELLS,
  XLSX_MAX_CELL_CODEPOINTS, XLSX_EVIDENCE_MAX_CELLS, XLSX_EVIDENCE_MAX_EXCERPT_CODEPOINTS,
  finalizeXlsxEvidence, xlsxTextPrefix, xlsxTextDigest, type XlsxCellEvidence, type XlsxEvidence,
} from './xlsx-evidence.js';

function relsPathFor(ownerPath: string): string {
  const dir = path.posix.dirname(ownerPath);
  return path.posix.join(dir, '_rels', path.posix.basename(ownerPath) + '.rels');
}

interface Relationship {
  id: string;
  target: string;
  type: string;
}
function relationshipMap(zip: PizZip, ownerPath: string): Map<string, Relationship> {
  const xml = zipText(zip, relsPathFor(ownerPath));
  const result = new Map<string, Relationship>();
  if (!xml) return result;
  const document = parseXml(xml);
  for (const relation of descendants(document, 'relationship')) {
    const id = relation.getAttribute('Id') || relation.getAttribute('id');
    const target = relation.getAttribute('Target') || relation.getAttribute('target');
    const type = relation.getAttribute('Type') || relation.getAttribute('type') || '';
    if (!id || !target || relation.getAttribute('TargetMode') === 'External') continue;
    result.set(id, { id, target: resolveArchiveTarget(ownerPath, target), type });
  }
  return result;
}

function inlineText(element: Element): string {
  return descendants(element, 't')
    .map(node => node.textContent ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function paragraphs(element: Element): string[] {
  return descendants(element, 'p')
    .map(inlineText)
    .filter(Boolean);
}

function tableRows(table: Element): string[][] {
  return childElements(table)
    .filter(row => localName(row) === 'tr')
    .map(row => childElements(row)
      .filter(cell => localName(cell) === 'tc')
      .map(inlineText));
}

function chartMarkdown(zip: PizZip, chartPath: string): string {
  const xml = zipText(zip, chartPath);
  if (!xml) return '';
  const document = parseXml(xml);
  const titleNode = descendants(document, 'title')[0];
  const title = titleNode ? descendantText(titleNode, 't').join(' ').trim() : '';
  const series = descendants(document, 'ser');
  const lines: string[] = [];
  if (title) lines.push('### Chart: ' + title);
  for (const item of series) {
    const tx = directChild(item, 'tx');
    const name = tx ? descendantText(tx, 'v').concat(descendantText(tx, 't')).join(' ').trim() : '';
    const categoryNode = directChild(item, 'cat');
    const valueNode = directChild(item, 'val');
    const categories = categoryNode ? descendantText(categoryNode, 'v') : [];
    const values = valueNode ? descendantText(valueNode, 'v') : [];
    if (categories.length > 0 && values.length > 0) {
      const rows: string[][] = [['Category', name || 'Value']];
      const count = Math.max(categories.length, values.length);
      for (let index = 0; index < count; index += 1) {
        rows.push([categories[index] ?? '', values[index] ?? '']);
      }
      lines.push(markdownTable(rows));
    } else if (values.length > 0) {
      lines.push((name ? '**' + name + ':** ' : '') + values.join(', '));
    }
  }
  if (lines.length === 0) {
    const values = descendantText(document, 'v');
    if (values.length > 0) lines.push('### Chart\n\n' + values.join(', '));
  }
  return lines.join('\n\n');
}

function pictureMarkdown(element: Element, rels: Map<string, Relationship>): string {
  const properties = descendants(element, 'cnvpr')[0];
  const alt = properties?.getAttribute('descr')
    || properties?.getAttribute('title')
    || properties?.getAttribute('name')
    || 'Embedded image';
  const svg = descendants(element, 'svgblip')[0];
  const blip = descendants(element, 'blip')[0];
  const relId = attrByLocalName(svg, 'embed') || attrByLocalName(blip, 'embed');
  const target = relId ? rels.get(relId)?.target : undefined;
  const label = target ? path.posix.basename(target) : 'embedded-image';
  return '![' + alt.replace(/[\r\n\[\]]/g, ' ').trim() + '](embedded:' + label + ')';
}

function renderSlideNode(zip: PizZip, element: Element, rels: Map<string, Relationship>): string[] {
  const kind = localName(element);
  if (kind === 'grpsp' || kind === 'sptree') {
    return childElements(element).flatMap(child => renderSlideNode(zip, child, rels));
  }
  if (kind === 'pic') return [pictureMarkdown(element, rels)];
  if (kind === 'graphicframe') {
    const table = descendants(element, 'tbl')[0];
    if (table) return [markdownTable(tableRows(table))];
    const chart = descendants(element, 'chart')[0];
    const relId = attrByLocalName(chart, 'id');
    const chartPath = relId ? rels.get(relId)?.target : undefined;
    return chartPath ? [chartMarkdown(zip, chartPath)] : [];
  }
  if (kind !== 'sp') return [];

  const values = paragraphs(element);
  if (values.length === 0) return [];
  const placeholder = descendants(element, 'ph')[0];
  const placeholderType = placeholder?.getAttribute('type')?.toLowerCase();
  if (placeholderType === 'title' || placeholderType === 'ctrtitle') {
    return ['# ' + values.join(' ')];
  }
  return values;
}

function slideOrder(zip: PizZip): string[] {
  const presentationPath = 'ppt/presentation.xml';
  const xml = zipText(zip, presentationPath);
  if (xml) {
    const document = parseXml(xml);
    const rels = relationshipMap(zip, presentationPath);
    const ordered = descendants(document, 'sldid')
      .map(item => attrByLocalName(item, 'id'))
      .map(id => id ? rels.get(id)?.target : undefined)
      .filter((value): value is string => Boolean(value));
    if (ordered.length > 0) return ordered;
  }
  return Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const ai = Number(/slide(\d+)/i.exec(a)?.[1] ?? 0);
      const bi = Number(/slide(\d+)/i.exec(b)?.[1] ?? 0);
      return ai - bi;
    });
}

export const pptxConverter: ProjectionConverter = {
  id: 'pptx-semantic',
  priority: 5,
  autoTopLevel: true,
  accepts(input) {
    const mime = (input.mimeType ?? '').toLowerCase();
    return input.extension === '.pptx'
      || mime.includes('presentationml.presentation');
  },
  async convert(input): Promise<ProjectionResult> {
    const zip = new PizZip(input.bytes);
    if (!zip.file('ppt/presentation.xml')) throw new Error('PPTX_PRESENTATION_MISSING');
    const out: string[] = [];
    const slides = slideOrder(zip);
    for (let index = 0; index < slides.length; index += 1) {
      const slidePath = slides[index]!;
      const xml = zipText(zip, slidePath);
      if (!xml) continue;
      const document = parseXml(xml);
      const rels = relationshipMap(zip, slidePath);
      out.push('<!-- Slide number: ' + (index + 1) + ' -->');
      const tree = descendants(document, 'sptree')[0];
      if (tree) out.push(...renderSlideNode(zip, tree, rels).filter(Boolean));

      const notesRelation = [...rels.values()].find(item => item.type.toLowerCase().endsWith('/notesslide'));
      if (notesRelation) {
        const notesXml = zipText(zip, notesRelation.target);
        if (notesXml) {
          const noteText = paragraphs(parseXml(notesXml).documentElement!).join('\n').trim();
          if (noteText) out.push('### Notes:\n' + noteText);
        }
      }
    }
    return {
      markdown: out.filter(Boolean).join('\n\n'),
      format: 'pptx',
      converter: this.id,
    };
  },
};

function docxStyleMap(zip: PizZip): Map<string, string> {
  const map = new Map<string, string>();
  const xml = zipText(zip, 'word/styles.xml');
  if (!xml) return map;
  const document = parseXml(xml);
  for (const style of descendants(document, 'style')) {
    const id = attrByLocalName(style, 'styleId') || attrByLocalName(style, 'styleid');
    const name = directChild(style, 'name');
    const value = attrByLocalName(name, 'val');
    if (id && value) map.set(id, value);
  }
  return map;
}

function docxParagraph(element: Element, styles: Map<string, string>): string {
  const text = inlineText(element);
  if (!text) return '';
  const properties = directChild(element, 'ppr');
  const styleElement = properties ? directChild(properties, 'pstyle') : undefined;
  const styleId = attrByLocalName(styleElement, 'val');
  const styleName = (styleId ? styles.get(styleId) : undefined) || styleId || '';
  const match = /^heading\s*([1-6])$/i.exec(styleName.replaceAll('_', ' '));
  return match ? '#'.repeat(Number(match[1])) + ' ' + text : text;
}

export const docxConverter: ProjectionConverter = {
  id: 'docx-semantic',
  priority: 8,
  autoTopLevel: false,
  accepts(input) {
    if (!semanticRequested(input)) return false;
    const mime = (input.mimeType ?? '').toLowerCase();
    return input.extension === '.docx' || mime.includes('wordprocessingml.document');
  },
  async convert(input): Promise<ProjectionResult> {
    const zip = new PizZip(input.bytes);
    const xml = zipText(zip, 'word/document.xml');
    if (!xml) throw new Error('DOCX_DOCUMENT_MISSING');
    const document = parseXml(xml);
    const body = descendants(document, 'body')[0];
    if (!body) throw new Error('DOCX_BODY_MISSING');
    const styles = docxStyleMap(zip);
    const out: string[] = [];
    for (const child of childElements(body)) {
      const kind = localName(child);
      if (kind === 'p') {
        const value = docxParagraph(child, styles);
        if (value) out.push(value);
      } else if (kind === 'tbl') {
        const table = markdownTable(tableRows(child));
        if (table) out.push(table);
      } else {
        const value = descendantText(child, 't').join('').trim();
        if (value) out.push(value);
      }
    }
    return { markdown: out.join('\n\n'), format: 'docx', converter: this.id };
  },
};

export const xlsxConverter: ProjectionConverter = {
  id: 'xlsx-semantic',
  priority: 9,
  autoTopLevel: false,
  accepts(input) {
    if (!semanticRequested(input)) return false;
    const mime = (input.mimeType ?? '').toLowerCase();
    return input.extension === '.xlsx'
      || input.extension === '.xlsm'
      || mime.includes('spreadsheetml.sheet');
  },
  async convert(input): Promise<ProjectionResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(input.bytes as any);
    const out: string[] = [];
    const marker = '\n\n[Content omitted by XLSX projection limits]';
    const availableBytes = DOCUMENT_OUTPUT_MAX_BYTES - Buffer.byteLength(marker, 'utf8');
    let bytes = 0;
    let points = 0;
    let slots = 0;
    let emittedCells = 0;
    let omittedRows = 0;
    let contentPartial = false;
    let locationsPartial = false;
    const reasons = new Set<string>();
    const cells: XlsxCellEvidence[] = [];
    const omit = (reason: string) => { reasons.add(reason); contentPartial = true; };
    const append = (text: string): boolean => {
      const size = Buffer.byteLength(text, 'utf8');
      if (bytes + size > availableBytes) { omit('output-byte-limit'); return false; }
      out.push(text); bytes += size; points += Array.from(text).length; return true;
    };
    if (workbook.worksheets.length > XLSX_MAX_SHEETS) omit('sheet-limit');
    sheetLoop: for (const sheet of workbook.worksheets.slice(0, XLSX_MAX_SHEETS)) {
      // eachRow exposes real row numbers. Keep only bounded references; never
      // allocate empty physical rows up to a sparse sheet's highest index.
      const rows: ExcelJS.Row[] = [];
      let width = 1;
      sheet.eachRow(row => {
        if (rows.length === XLSX_MAX_ROWS_PER_SHEET) { omittedRows += 1; omit('row-limit'); return; }
        rows.push(row);
        if (row.cellCount > XLSX_MAX_COLUMNS) omit('column-limit');
        width = Math.max(width, Math.min(XLSX_MAX_COLUMNS, row.cellCount));
      });
      if (!append((out.length ? '\n\n' : '') + '## ' + xlsxTextPrefix(sheet.name, XLSX_MAX_CELL_CODEPOINTS).text)) break;
      let first = true;
      for (const row of rows) {
        if (slots + width > XLSX_MAX_RENDERED_CELLS) { omit('cell-limit'); break sheetLoop; }
        const rowParts = [first ? '\n\n| ' : '\n| '];
        let rowBytes = Buffer.byteLength(rowParts[0]!, 'utf8');
        let rowPoints = rowParts[0]!.length;
        const rowCells: XlsxCellEvidence[] = [];
        let rowEmittedCells = 0;
        // Reserve synthetic table suffix/separator before admitting any cell.
        const suffix = ' |' + (first ? '\n| ' + Array.from({ length: width }, () => '---').join(' | ') + ' |' : '');
        const suffixBytes = Buffer.byteLength(suffix, 'utf8');
        for (let column = 1; column <= width; column += 1) {
          const cell = row.findCell(column);
          const source = cell?.isMerged ? cell.master : cell;
          const formula = source?.type === ExcelJS.ValueType.Formula;
          if (formula && (source!.value as ExcelJS.CellFormulaValue).result == null) omit('formula-cache-missing');
          const bounded = xlsxTextPrefix(cell?.text ?? '', XLSX_MAX_CELL_CODEPOINTS);
          if (bounded.truncated) omit('cell-text-limit');
          const text = escapeMarkdownTableCell(bounded.text);
          const separator = column === 1 ? '' : ' | ';
          const partBytes = Buffer.byteLength(separator, 'utf8') + Buffer.byteLength(text, 'utf8');
          if (bytes + rowBytes + partBytes + suffixBytes > availableBytes) {
            omit('output-byte-limit'); break sheetLoop;
          }
          rowParts.push(separator, text);
          rowPoints += separator.length;
          if (cell && text) {
            rowEmittedCells += 1;
            if (cells.length + rowCells.length < XLSX_EVIDENCE_MAX_CELLS) {
              const excerpt = xlsxTextPrefix(text, XLSX_EVIDENCE_MAX_EXCERPT_CODEPOINTS).text;
              const start = points + rowPoints;
              rowCells.push({
                sheetId: sheet.id, sheet: sheet.name, row: row.number, column, address: cell.address,
                excerpt, span: { start, end: start + Array.from(excerpt).length },
                valueKind: formula ? 'cached-formula' : 'cell-text',
                hidden: sheet.state !== 'visible' || !!row.hidden || !!sheet.getColumn(column).hidden,
                ...(cell.isMerged && cell.master.address !== cell.address ? { mergedMaster: cell.master.address } : {}),
              });
            }
          }
          rowBytes += partBytes;
          rowPoints += Array.from(text).length;
        }
        // Only one bounded row is held temporarily. Commit its pointers only
        // after the complete row and synthetic separator have been admitted.
        rowParts.push(suffix);
        if (!append(rowParts.join(''))) break sheetLoop;
        cells.push(...rowCells);
        emittedCells += rowEmittedCells;
        slots += width;
        first = false;
      }
    }
    if (emittedCells > cells.length) { locationsPartial = true; reasons.add('evidence-cell-limit'); }
    if (contentPartial) out.push(marker);
    const markdown = out.join('');
    const evidence: XlsxEvidence = {
      version: 1, sourceSha256: createHash('sha256').update(input.bytes).digest('hex'), sourceBytes: input.bytes.length,
      extractor: 'exceljs-cell-text/v1',
      output: { sha256: xlsxTextDigest(markdown), unit: 'unicode-codepoint', binding: 'exact' },
      coverage: {
        content: contentPartial ? 'partial' : emittedCells ? 'complete' : 'empty',
        locations: contentPartial || locationsPartial ? 'partial' : emittedCells ? 'complete' : 'empty',
        stopReasons: [...reasons],
      }, cells,
      limitations: [
        'Addresses refer to ExcelJS-decoded cells, not source ZIP/XML byte offsets. Shared strings and rich text are decoded.',
        'Formula results are cached and may be stale; no recalculation, macros or external links are executed.',
        'Hidden content is disclosed, not an access-control boundary. Merged slaves reference their master, not independent facts.',
        'Excerpts may be prefixes of escaped rendered cell text. Parser memory before rendering is not bounded by output limits.',
      ],
    };
    return {
      markdown,
      format: input.extension === '.xlsm' ? 'xlsm' : 'xlsx',
      converter: this.id,
      // Preserve the existing row-omission signal only for actually enumerated
      // excess data-bearing rows. Other limits do not establish omitted totals.
      omittedEntries: omittedRows || undefined,
      xlsxEvidence: finalizeXlsxEvidence(evidence),
    };
  },
};

export const xlsConverter: ProjectionConverter = {
  id: 'xls-semantic',
  priority: 9.5,
  autoTopLevel: false,
  accepts(input) {
    if (!semanticRequested(input)) return false;
    const mime = (input.mimeType ?? '').toLowerCase();
    return input.extension === '.xls'
      || mime.includes('application/vnd.ms-excel')
      || mime.includes('application/excel');
  },
  async convert(input): Promise<ProjectionResult> {
    const workbook = XLS.read(input.bytes, {
      type: 'buffer',
      raw: false,
      cellText: true,
      cellDates: false,
      bookVBA: false,
      WTF: false,
    });
    const out: string[] = [];
    let omitted = 0;
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      out.push('## ' + name);
      const allRows = XLS.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
      }) as unknown[][];
      const rows = allRows.slice(0, 5000);
      if (rows.length > 0) out.push(markdownTable(rows));
      if (allRows.length > rows.length) {
        omitted += allRows.length - rows.length;
        out.push('[Rows omitted by semantic projection limit]');
      }
    }
    return {
      markdown: out.join('\n\n'),
      format: 'xls',
      converter: this.id,
      omittedEntries: omitted || undefined,
    };
  },
};

export const pdfProjectionConverter: ProjectionConverter = {
  id: 'pdf-semantic-view',
  priority: 10,
  autoTopLevel: false,
  accepts(input) {
    if (input.profile !== 'markdown') return false;
    const mime = (input.mimeType ?? '').toLowerCase();
    return input.extension === '.pdf' || mime.includes('application/pdf');
  },
  async convert(input): Promise<ProjectionResult> {
    const result = await parsePdfBytesToMarkdown(input.bytes, input.pdfPageRange,
      { observedAt: input.observedAt, extractImages: false });
    const out: string[] = [];
    for (const page of result.pages) {
      out.push('<!-- Page: ' + page.pageNumber + ' -->');
      if (page.text?.trim()) out.push(page.text.trim());
      if (page.images?.length) out.push('[Embedded images: ' + page.images.length + ']');
    }
    return {
      markdown: out.join('\n\n'),
      format: 'pdf',
      converter: this.id,
      title: result.metadata.title,
      pdfEvidence: result.pdfEvidence,
      pdfTextAvailable: result.pages.some(page => Boolean(page.text?.trim())),
    };
  },
};
