import path from 'node:path';
import { DOMParser, type Document, type Element, type Node } from '@xmldom/xmldom';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { analyse, detect } from 'chardet';
import { DocumentProjectionSecurityError } from './types.js';

export const DOCUMENT_INPUT_MAX_BYTES = 128 * 1024 * 1024;
export const DOCUMENT_OUTPUT_MAX_BYTES = 4 * 1024 * 1024;
export const ARCHIVE_MAX_BYTES = 32 * 1024 * 1024;
export const ARCHIVE_MAX_FILES = 256;
export const ARCHIVE_MEMBER_MAX_BYTES = 8 * 1024 * 1024;
export const ARCHIVE_TOTAL_MAX_BYTES = 64 * 1024 * 1024;
export const ARCHIVE_MAX_DEPTH = 3;

export function extensionFrom(name?: string): string | undefined {
  if (!name) return undefined;
  try {
    const pathname = /^[a-z]+:\/\//i.test(name) ? new URL(name).pathname : name;
    const ext = path.extname(pathname).toLowerCase();
    return ext || undefined;
  } catch {
    const ext = path.extname(name).toLowerCase();
    return ext || undefined;
  }
}

export function inferSignature(bytes: Buffer): string | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'ole';
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]!)) return 'zip';
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  const prefix = bytes.subarray(0, Math.min(bytes.length, 256)).toString('utf8').trimStart().toLowerCase();
  if (prefix.startsWith('<!doctype html') || prefix.startsWith('<html')) return 'html';
  if (prefix.startsWith('<?xml') || prefix.startsWith('<rss') || prefix.startsWith('<feed')) return 'xml';
  if (prefix.startsWith('{') || prefix.startsWith('[')) return 'json';
  return undefined;
}

function normalizeCharset(label?: string | null): string | undefined {
  if (!label) return undefined;
  const key = label.trim().toLowerCase().replaceAll('_', '-');
  const aliases: Record<string, string> = {
    utf8: 'utf-8',
    utf16le: 'utf-16le',
    'utf16-le': 'utf-16le',
    'windows-31j': 'shift_jis',
    'shift-jis': 'shift_jis',
    shiftjis: 'shift_jis',
    sjis: 'shift_jis',
    cp932: 'shift_jis',
    cp1252: 'windows-1252',
    cp1251: 'windows-1251',
    latin1: 'windows-1252',
    'iso-8859-1': 'windows-1252',
    gb2312: 'gbk',
  };
  return aliases[key] ?? key;
}

export function decodeText(bytes: Buffer, hintedCharset?: string): { text: string; charset: string } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: bytes.subarray(3).toString('utf8'), charset: 'utf-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: bytes.subarray(2).toString('utf16le'), charset: 'utf-16le' };
  }

  if (hintedCharset) {
    const hinted = normalizeCharset(hintedCharset);
    if (hinted) {
      try {
        return { text: new TextDecoder(hinted, { fatal: false }).decode(bytes), charset: hinted };
      } catch {
        // Continue with bounded detection.
      }
    }
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), charset: 'utf-8' };
  } catch {
    // Non-UTF input: rank a bounded set of detector candidates by decoded-text quality.
  }

  const sample = bytes.subarray(0, Math.min(bytes.length, 65536));
  const detected = analyse(sample).slice(0, 8);
  let best: { text: string; charset: string; score: number } | undefined;
  for (const match of detected) {
    const candidate = normalizeCharset(match.name);
    if (!candidate) continue;
    try {
      const text = new TextDecoder(candidate, { fatal: false }).decode(bytes);
      const replacements = (text.match(/\uFFFD/g) ?? []).length;
      const controls = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g) ?? []).length;
      const score = replacements * 100 + controls * 20 - (match.confidence ?? 0) / 10;
      if (!best || score < best.score) best = { text, charset: candidate, score };
    } catch {
      // Candidate unsupported by the current Node ICU build.
    }
  }
  if (best) return { text: best.text, charset: best.charset };

  const fallback = normalizeCharset(detect(sample)) ?? 'utf-8';
  try {
    return { text: new TextDecoder(fallback).decode(bytes), charset: fallback };
  } catch {
    return { text: bytes.toString('utf8'), charset: 'utf-8' };
  }
}

export function parseXml(xml: string): Document {
  const errors: string[] = [];
  const parser = new DOMParser({
    onError(level, message) {
      if (level === 'fatalError' || level === 'error') errors.push(message);
    },
  });
  const document = parser.parseFromString(xml, 'application/xml');
  if (!document?.documentElement || errors.length > 0) {
    throw new Error('DOCUMENT_PROJECTION_XML_INVALID');
  }
  return document;
}

export function localName(node: Node): string {
  const value = (node as Element).localName || node.nodeName || '';
  const index = value.indexOf(':');
  return (index >= 0 ? value.slice(index + 1) : value).toLowerCase();
}

export function childElements(node: Node): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes.item(i);
    if (child?.nodeType === 1) out.push(child as Element);
  }
  return out;
}

export function descendants(node: Node, wantedLocalName?: string): Element[] {
  const wanted = wantedLocalName?.toLowerCase();
  const out: Element[] = [];
  const stack = [...childElements(node)].reverse();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!wanted || localName(current) === wanted) out.push(current);
    const children = childElements(current);
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]!);
  }
  return out;
}

export function firstDescendant(node: Node, wantedLocalName: string): Element | undefined {
  return descendants(node, wantedLocalName)[0];
}

export function directChild(node: Node, wantedLocalName: string): Element | undefined {
  const wanted = wantedLocalName.toLowerCase();
  return childElements(node).find(child => localName(child) === wanted);
}

export function textContent(node?: Node | null): string {
  return (node?.textContent ?? '').replace(/\r\n/g, '\n').trim();
}

export function descendantText(node: Node, wantedLocalName: string): string[] {
  return descendants(node, wantedLocalName).map(item => textContent(item)).filter(Boolean);
}

export function attrByLocalName(element: Element | undefined, wanted: string): string | undefined {
  if (!element) return undefined;
  const target = wanted.toLowerCase();
  for (let i = 0; i < element.attributes.length; i += 1) {
    const attr = element.attributes.item(i);
    if (!attr) continue;
    const name = (attr.localName || attr.name).toLowerCase();
    if (name === target || attr.name.toLowerCase() === target) return attr.value;
  }
  return undefined;
}

export function escapeMarkdownTableCell(value: unknown): string {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

export function markdownTable(rows: unknown[][]): string {
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map(row => row.length), 1);
  const normalized = rows.map(row => Array.from({ length: width }, (_, index) => escapeMarkdownTableCell(row[index])));
  const header = normalized[0]!;
  const output = [
    '| ' + header.join(' | ') + ' |',
    '| ' + Array.from({ length: width }, () => '---').join(' | ') + ' |',
  ];
  for (const row of normalized.slice(1)) output.push('| ' + row.join(' | ') + ' |');
  return output.join('\n');
}
function resolveReference(reference: string, baseUrl: string): string {
  const value = reference.trim();
  if (!value || value.startsWith('#') || /^(?:data|mailto|tel|javascript):/i.test(value)) return reference;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return reference;
  }
}

export function resolveHtmlLinks(html: string, baseUrl?: string): string {
  if (!baseUrl) return html;
  return html.replace(
    /\b(href|src)\s*=\s*(?:(["'])(.*?)\2|([^\s>]+))/gi,
    (_full, key: string, quote: string | undefined, quoted: string | undefined, bare: string | undefined) => {
      const raw = quoted ?? bare ?? '';
      const resolved = resolveReference(raw, baseUrl);
      const q = quote || '"';
      return key + '=' + q + resolved + q;
    },
  );
}

export function htmlToMarkdown(html: string, baseUrl?: string): string {
  const cleaned = html
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!doctype[^>]*>/gi, '');
  const resolved = resolveHtmlLinks(cleaned, baseUrl);
  return NodeHtmlMarkdown.translate(resolved, {
    bulletMarker: '*',
    codeBlockStyle: 'fenced',
    keepDataImages: false,
    useInlineLinks: true,
  }).trim();
}
export function boundMarkdown(markdown: string): string {
  const normalized = markdown
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (Buffer.byteLength(normalized, 'utf8') <= DOCUMENT_OUTPUT_MAX_BYTES) return normalized;
  const bytes = Buffer.from(normalized, 'utf8').subarray(0, DOCUMENT_OUTPUT_MAX_BYTES);
  return bytes.toString('utf8').replace(/\uFFFD$/, '') + '\n\n[Document projection truncated at output limit]';
}

export function sanitizeArchivePath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) {
    throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_PATH_REFUSED');
  }
  const parts = normalized.split('/');
  if (parts.some(part => part === '..')) {
    throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_TRAVERSAL_REFUSED');
  }
  return path.posix.normalize(normalized).replace(/^\.\//, '');
}

export function resolveArchiveTarget(baseFile: string, target: string): string {
  const baseDir = path.posix.dirname(baseFile.replaceAll('\\', '/'));
  const resolved = path.posix.normalize(path.posix.join(baseDir, target.replaceAll('\\', '/')));
  if (resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
    throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_RELATIONSHIP_TRAVERSAL_REFUSED');
  }
  return resolved;
}
export function isZipSymlink(externalFileAttributes: number): boolean {
  return ((externalFileAttributes >>> 16) & 0o170000) === 0o120000;
}

export function basenameFromSource(input: { sourceName?: string; localPath?: string; url?: string }): string | undefined {
  const candidate = input.sourceName ?? input.localPath ?? input.url;
  if (!candidate) return undefined;
  try {
    return path.basename(input.url ? new URL(candidate).pathname : candidate);
  } catch {
    return path.basename(candidate);
  }
}
