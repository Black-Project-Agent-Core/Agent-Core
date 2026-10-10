import path from 'node:path';
import PizZip from 'pizzip';
import * as CFB from 'cfb';
import type { Element } from '@xmldom/xmldom';
import type { ProjectionConverter, ProjectionInput, ProjectionResult } from './types.js';
import {
  attrByLocalName,
  childElements,
  decodeText,
  descendants,
  directChild,
  htmlToMarkdown,
  localName,
  parseXml,
  sanitizeArchivePath,
  textContent,
} from './helpers.js';

function zipText(zip: PizZip, name: string): string | undefined {
  try {
    return zip.file(name)?.asText();
  } catch {
    return undefined;
  }
}

function directChildrenByName(element: Element, name: string): Element[] {
  const wanted = name.toLowerCase();
  return childElements(element).filter(child => localName(child) === wanted);
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
export const epubConverter: ProjectionConverter = {
  id: 'epub-semantic',
  priority: 12,
  autoTopLevel: true,
  accepts(input) {
    const mime = (input.mimeType ?? '').toLowerCase();
    return input.extension === '.epub' || mime.includes('application/epub');
  },
  async convert(input): Promise<ProjectionResult> {
    const zip = new PizZip(input.bytes);
    const containerXml = zipText(zip, 'META-INF/container.xml');
    if (!containerXml) throw new Error('EPUB_CONTAINER_MISSING');
    const container = parseXml(containerXml);
    const rootFile = descendants(container, 'rootfile')[0];
    const opfPathRaw = rootFile?.getAttribute('full-path');
    if (!opfPathRaw) throw new Error('EPUB_OPF_PATH_MISSING');
    const opfPath = sanitizeArchivePath(opfPathRaw);
    const opfXml = zipText(zip, opfPath);
    if (!opfXml) throw new Error('EPUB_OPF_MISSING');

    const opf = parseXml(opfXml);
    const metadata = descendants(opf, 'metadata')[0];
    const manifest = descendants(opf, 'manifest')[0];
    const spine = descendants(opf, 'spine')[0];
    if (!manifest || !spine) throw new Error('EPUB_PACKAGE_INCOMPLETE');
    const metadataValue = (name: string): string => {
      if (!metadata) return '';
      return directChildrenByName(metadata, name).map(textContent).filter(Boolean).join(', ');
    };
    const title = metadataValue('title');
    const out: string[] = [];
    const fields: Array<[string, string]> = [
      ['Title', title],
      ['Authors', metadataValue('creator')],
      ['Language', metadataValue('language')],
      ['Publisher', metadataValue('publisher')],
      ['Date', metadataValue('date')],
      ['Description', metadataValue('description')],
      ['Identifier', metadataValue('identifier')],
    ];
    for (const [label, value] of fields) if (value) out.push('**' + label + ':** ' + value);

    const manifestMap = new Map<string, { href: string; mediaType: string }>();
    for (const item of directChildrenByName(manifest, 'item')) {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (id && href) manifestMap.set(id, { href, mediaType: item.getAttribute('media-type') || '' });
    }
    const base = path.posix.dirname(opfPath);
    for (const itemref of directChildrenByName(spine, 'itemref')) {
      const idref = itemref.getAttribute('idref');
      const item = idref ? manifestMap.get(idref) : undefined;
      if (!item) continue;
      const resolved = sanitizeArchivePath(path.posix.normalize(path.posix.join(base, safeDecodeUri(item.href))));
      const html = zipText(zip, resolved);
      if (!html) continue;
      const markdown = htmlToMarkdown(html);
      if (markdown) out.push(markdown);
    }
    return {
      markdown: out.join('\n\n'),
      format: 'epub',
      converter: this.id,
      title: title || undefined,
    };
  },
};

function notebookSource(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => String(item)).join('');
  return typeof value === 'string' ? value : '';
}

export const ipynbConverter: ProjectionConverter = {
  id: 'ipynb-semantic',
  priority: 14,
  autoTopLevel: true,
  accepts(input) {
    const mime = (input.mimeType ?? '').toLowerCase();
    return input.extension === '.ipynb' || mime.includes('application/x-ipynb');
  },
  async convert(input): Promise<ProjectionResult> {
    const decoded = decodeText(input.bytes, 'utf-8');
    const notebook = JSON.parse(decoded.text) as {
      cells?: Array<{ cell_type?: string; source?: unknown; outputs?: unknown[] }>;
      metadata?: { kernelspec?: { language?: string }; language_info?: { name?: string } };
      nbformat?: number;
    };
    if (!Array.isArray(notebook.cells) || typeof notebook.nbformat !== 'number') {
      throw new Error('IPYNB_STRUCTURE_INVALID');
    }
    const language = notebook.metadata?.kernelspec?.language
      || notebook.metadata?.language_info?.name
      || 'python';
    const out: string[] = [];
    const fence = String.fromCharCode(96).repeat(3);
    for (const cell of notebook.cells) {
      const source = notebookSource(cell.source).trimEnd();
      if (!source) continue;
      if (cell.cell_type === 'markdown') out.push(source);
      else if (cell.cell_type === 'code') out.push(fence + language + '\n' + source + '\n' + fence);
      else if (cell.cell_type === 'raw') out.push(source);
    }
    return { markdown: out.join('\n\n'), format: 'ipynb', converter: this.id };
  },
};

function cfbStream(cfb: CFB.CFB$Container, streamName: string): Buffer | undefined {
  const wanted = streamName.toLowerCase();
  for (let index = 0; index < cfb.FullPaths.length; index += 1) {
    const fullPath = cfb.FullPaths[index]!.replaceAll('\\', '/').toLowerCase();
    if (!fullPath.endsWith('/' + wanted) && !fullPath.endsWith(wanted)) continue;
    const entry = cfb.FileIndex[index];
    if (!entry?.content || entry.type !== 2) continue;
    const bytes = Buffer.from(entry.content as Uint8Array);
    return bytes.subarray(0, Math.min(entry.size, bytes.length));
  }
  return undefined;
}

function messageCodepages(cfb: CFB.CFB$Container): { message?: number; internet?: number } {
  const bytes = cfbStream(cfb, '__properties_version1.0');
  if (!bytes || bytes.length < 32) return {};
  const values = new Map<number, number>();
  for (let offset = 32; offset + 16 <= bytes.length; offset += 16) {
    const tag = bytes.readUInt32LE(offset);
    const propertyType = tag & 0xffff;
    if (propertyType !== 0x0003) continue;
    const propertyId = tag >>> 16;
    values.set(propertyId, bytes.readUInt32LE(offset + 8));
  }
  return { message: values.get(0x3ffd), internet: values.get(0x3fde) };
}

function codepageLabel(codepage?: number): string | undefined {
  if (!codepage) return undefined;
  const known: Record<number, string> = {
    65001: 'utf-8',
    1250: 'windows-1250',
    1251: 'windows-1251',
    1252: 'windows-1252',
    1253: 'windows-1253',
    1254: 'windows-1254',
    1255: 'windows-1255',
    1256: 'windows-1256',
    1257: 'windows-1257',
    1258: 'windows-1258',
    874: 'windows-874',
    932: 'shift_jis',
    936: 'gbk',
    949: 'euc-kr',
    950: 'big5',
    54936: 'gb18030',
    20127: 'ascii',
    28591: 'windows-1252',
    50220: 'iso-2022-jp',
    51932: 'euc-jp',
  };
  return known[codepage] ?? (codepage >= 1250 && codepage <= 1258 ? 'windows-' + codepage : undefined);
}

function decodeAnsi(bytes: Buffer, charset?: string): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  const trimmed = bytes.subarray(0, end);
  if (!trimmed.length) return '';
  if (charset) {
    try {
      return new TextDecoder(charset).decode(trimmed).trim();
    } catch {
      // Fall through to bounded detector.
    }
  }
  return decodeText(trimmed).text.trim();
}

function msgString(cfb: CFB.CFB$Container, tag: string, ansiCharset?: string): string {
  const unicode = cfbStream(cfb, '__substg1.0_' + tag + '001F');
  if (unicode?.length) return unicode.toString('utf16le').replace(/\0+$/g, '').trim();
  const ansi = cfbStream(cfb, '__substg1.0_' + tag + '001E');
  return ansi?.length ? decodeAnsi(ansi, ansiCharset) : '';
}

export const msgConverter: ProjectionConverter = {
  id: 'outlook-msg-semantic',
  priority: 16,
  autoTopLevel: true,
  accepts(input) {
    const mime = (input.mimeType ?? '').toLowerCase();
    return input.extension === '.msg' || mime.includes('vnd.ms-outlook');
  },
  async convert(input): Promise<ProjectionResult> {
    const cfb = CFB.read(input.bytes, { type: 'buffer' });
    const codepages = messageCodepages(cfb);
    const headerCharset = codepageLabel(codepages.message ?? codepages.internet);
    const bodyCharset = codepageLabel(codepages.internet ?? codepages.message);
    const from = msgString(cfb, '0C1F', headerCharset);
    const to = msgString(cfb, '0E04', headerCharset);
    const subject = msgString(cfb, '0037', headerCharset);
    const body = msgString(cfb, '1000', bodyCharset);
    if (!from && !to && !subject && !body) throw new Error('MSG_CONTENT_NOT_FOUND');
    const out = ['# Email Message'];
    if (from) out.push('**From:** ' + from);
    if (to) out.push('**To:** ' + to);
    if (subject) out.push('**Subject:** ' + subject);
    if (body) out.push('## Content\n\n' + body);
    return {
      markdown: out.join('\n\n'),
      format: 'msg',
      converter: this.id,
      title: subject || undefined,
    };
  },
};
