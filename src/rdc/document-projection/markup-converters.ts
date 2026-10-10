import type { Element } from '@xmldom/xmldom';
import type { ProjectionConverter, ProjectionInput, ProjectionResult } from './types.js';
import {
  attrByLocalName,
  childElements,
  decodeText,
  directChild,
  htmlToMarkdown,
  localName,
  markdownTable,
  parseXml,
  textContent,
} from './helpers.js';

function semanticRequested(input: ProjectionInput): boolean {
  return input.profile === 'markdown' || input.depth > 0;
}

function sourceBase(input: ProjectionInput): string | undefined {
  return input.url;
}

function resolveXmlBase(element: Element, fallback?: string): string | undefined {
  const chain: string[] = [];
  let current: Element | null = element;
  while (current) {
    const value = current.getAttribute('xml:base');
    if (value) chain.push(value);
    current = current.parentNode?.nodeType === 1 ? current.parentNode as Element : null;
  }
  let base = fallback;
  for (const value of chain.reverse()) {
    try {
      base = base ? new URL(value, base).toString() : value;
    } catch {
      // Keep the previous safe base.
    }
  }
  return base;
}

function childText(element: Element, name: string): string {
  return textContent(directChild(element, name));
}
export const htmlConverter: ProjectionConverter = {
  id: 'html-markdown',
  priority: 40,
  autoTopLevel: false,
  accepts(input) {
    if (!semanticRequested(input)) return false;
    const mime = (input.mimeType ?? '').toLowerCase();
    return input.extension === '.html'
      || input.extension === '.htm'
      || mime.includes('text/html')
      || mime.includes('application/xhtml')
      || input.bytes.toString('utf8', 0, Math.min(input.bytes.length, 256)).trimStart().match(/^<!doctype html|^<html/i) !== null;
  },
  async convert(input): Promise<ProjectionResult> {
    const decoded = decodeText(input.bytes);
    return {
      markdown: htmlToMarkdown(decoded.text, sourceBase(input)),
      format: 'html',
      converter: this.id,
    };
  },
};

function renderRss(root: Element, input: ProjectionInput): string {
  const channel = directChild(root, 'channel');
  if (!channel) throw new Error('RSS_CHANNEL_MISSING');
  const out: string[] = [];
  const title = childText(channel, 'title');
  const description = childText(channel, 'description');
  if (title) out.push('# ' + title);
  if (description) out.push(description);
  for (const item of childElements(channel).filter(child => localName(child) === 'item')) {
    const itemTitle = childText(item, 'title');
    const date = childText(item, 'pubdate');
    if (itemTitle) out.push('## ' + itemTitle);
    if (date) out.push('Published on: ' + date);
    for (const name of ['description', 'encoded']) {
      const field = directChild(item, name);
      if (!field) continue;
      const value = textContent(field);
      if (!value) continue;
      out.push(htmlToMarkdown(value, resolveXmlBase(field, sourceBase(input))));
    }
  }
  return out.filter(Boolean).join('\n\n');
}

function atomField(entry: Element, name: string, input: ProjectionInput): string {
  const field = directChild(entry, name);
  if (!field) return '';
  const value = textContent(field);
  if (!value) return '';
  const kind = (field.getAttribute('type') || 'text').toLowerCase();
  return kind === 'text'
    ? value.trim()
    : htmlToMarkdown(value, resolveXmlBase(field, sourceBase(input)));
}
function renderAtom(root: Element, input: ProjectionInput): string {
  const out: string[] = [];
  const title = atomField(root, 'title', input);
  const subtitle = atomField(root, 'subtitle', input);
  if (title) out.push('# ' + title);
  if (subtitle) out.push(subtitle);
  for (const entry of childElements(root).filter(child => localName(child) === 'entry')) {
    const entryTitle = atomField(entry, 'title', input);
    const updated = childText(entry, 'updated');
    if (entryTitle) out.push('## ' + entryTitle);
    if (updated) out.push('Updated on: ' + updated);
    const summary = atomField(entry, 'summary', input);
    const content = atomField(entry, 'content', input);
    if (summary) out.push(summary);
    if (content) out.push(content);
  }
  return out.filter(Boolean).join('\n\n');
}

export const feedConverter: ProjectionConverter = {
  id: 'rss-atom-markdown',
  priority: 35,
  autoTopLevel: false,
  accepts(input) {
    if (!semanticRequested(input)) return false;
    const mime = (input.mimeType ?? '').toLowerCase();
    if (input.extension === '.rss' || mime.includes('rss') || mime.includes('atom')) return true;
    const prefix = decodeText(input.bytes.subarray(0, Math.min(input.bytes.length, 2048))).text.toLowerCase();
    return /<rss(?:\s|>)/.test(prefix) || /<feed(?:\s|>)/.test(prefix);
  },
  async convert(input): Promise<ProjectionResult> {
    const decoded = decodeText(input.bytes);
    const document = parseXml(decoded.text);
    const root = document.documentElement!;
    const rootName = localName(root);
    if (rootName !== 'rss' && rootName !== 'feed') throw new Error('FEED_ROOT_UNSUPPORTED');
    return {
      markdown: rootName === 'rss' ? renderRss(root, input) : renderAtom(root, input),
      format: rootName === 'rss' ? 'rss' : 'atom',
      converter: this.id,
      title: rootName === 'rss'
        ? childText(directChild(root, 'channel') ?? root, 'title')
        : atomField(root, 'title', input),
    };
  },
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  while (rows.length > 0 && rows[0]!.every(value => !value.trim())) rows.shift();
  while (rows.length > 0 && rows[rows.length - 1]!.every(value => !value.trim())) rows.pop();
  return rows;
}

export const csvConverter: ProjectionConverter = {
  id: 'csv-markdown',
  priority: 45,
  autoTopLevel: false,
  accepts(input) {
    if (!semanticRequested(input)) return false;
    const mime = (input.mimeType ?? '').toLowerCase();
    return input.extension === '.csv' || mime.includes('text/csv') || mime.includes('application/csv');
  },
  async convert(input): Promise<ProjectionResult> {
    const decoded = decodeText(input.bytes);
    const rows = parseCsv(decoded.text.replace(/^\uFEFF/, ''));
    return {
      markdown: rows.length > 0 ? markdownTable(rows) : '',
      format: 'csv',
      converter: this.id,
    };
  },
};
