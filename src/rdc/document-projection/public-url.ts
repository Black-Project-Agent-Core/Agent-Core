import { createHash } from 'node:crypto';
import { publicContentKind, readPublicUrlBytes } from '../../net/public-url-read.js';
import { pdf2md } from '../tools/pdf/lib/pdf2md.js';
import type { FileMetadata, FileResult } from '../utils/files/base.js';
import { decodeText } from './helpers.js';
import { selectMainHtml } from './html-main-content.js';
import { documentProjectionService } from './service.js';
import { DocumentProjectionError } from './types.js';

export interface PublicDocumentOptions {
  projection?: 'native' | 'markdown';
  contentScope?: 'full' | 'main';
  signal?: AbortSignal;
  maxBytes?: number;
}

function assertLive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('PUBLIC_URL_ABORTED');
}

function charsetFrom(contentType: string): string | undefined {
  return /(?:^|;)\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]+))/i
    .exec(contentType)?.slice(1).find(value => value !== undefined)?.trim() || undefined;
}

/** One admitted snapshot for native file reads and research text projection. */
export async function readPublicDocument(rawUrl: string, options: PublicDocumentOptions = {}): Promise<FileResult> {
  const projection = options.projection ?? 'native';
  const contentScope = options.contentScope ?? 'full';
  if (!['native', 'markdown'].includes(projection) || !['full', 'main'].includes(contentScope)) {
    throw new Error('PUBLIC_URL_MODE_INVALID');
  }

  // Do not normalize the raw authority before the transport's strict admission.
  const snapshot = await readPublicUrlBytes(rawUrl, { signal: options.signal, maxBytes: options.maxBytes });
  assertLive(options.signal);
  const mimeType = snapshot.contentType.split(';', 1)[0]!.trim().toLowerCase();
  const kind = publicContentKind(snapshot.contentType);
  const publicUrl: NonNullable<FileMetadata['publicUrl']> = {
    networkPolicy: 'public-only',
    finalUrl: snapshot.finalUrl,
    contentType: snapshot.contentType,
    redirects: snapshot.redirects,
    downloadedBytes: snapshot.bytes.length,
    contentSha256: createHash('sha256').update(snapshot.bytes).digest('hex'),
    extractionScope: 'full',
    selectionReason: contentScope === 'main' ? (mimeType === 'text/html' ? 'native-projection' : 'not-html') : 'full-requested',
  };

  if (kind === 'image') {
    if (projection === 'markdown') throw new Error('PUBLIC_URL_TEXT_UNSUPPORTED');
    return { content: snapshot.bytes.toString('base64'), mimeType, metadata: { publicUrl, isImage: true } };
  }

  if (kind === 'pdf') {
    let parsed;
    try {
      // Byte parser only: never pass a URL to the existing PDF URL reader.
      parsed = await pdf2md(new Uint8Array(snapshot.bytes));
    } catch {
      assertLive(options.signal);
      throw new Error('PUBLIC_URL_PDF_CONVERSION_FAILED');
    }
    assertLive(options.signal);
    const metadata: FileMetadata = {
      publicUrl, isPdf: true,
      author: parsed.metadata.author, title: parsed.metadata.title,
      totalPages: parsed.metadata.totalPages, pages: parsed.pages,
    };
    if (projection === 'native') return { content: '', mimeType: 'text/plain', metadata };
    if (!parsed.pages.some(page => page.text.trim())) throw new Error('PUBLIC_URL_NO_TEXT');
    return {
      content: parsed.pages.map(page => '## Page ' + page.pageNumber + '\n\n' + page.text.trim()).join('\n\n'),
      mimeType: 'text/markdown',
      metadata: { ...metadata, isDocumentProjection: true, projection: 'markdown',
        sourceFormat: 'pdf', sourceMimeType: mimeType, converter: 'pdf2md' },
    };
  }

  const charsetHint = charsetFrom(snapshot.contentType);
  if (projection === 'markdown' && mimeType === 'text/html') {
    let bytes = snapshot.bytes;
    let projectionCharset = charsetHint;
    if (contentScope === 'main') {
      const selection = selectMainHtml(decodeText(bytes, charsetHint).text);
      bytes = Buffer.from(selection.html, 'utf8');
      projectionCharset = 'utf-8';
      publicUrl.extractionScope = selection.scope;
      publicUrl.selectionReason = selection.reason;
      publicUrl.retainedTextChars = selection.retainedTextChars;
      publicUrl.droppedTextChars = selection.droppedTextChars;
    }
    const result = await documentProjectionService.projectBytes({
      bytes,
      profile: 'markdown',
      url: snapshot.finalUrl,
      mimeType,
      charsetHint: projectionCharset,
      // An endpoint suffix must not choose an unrelated document converter.
      extension: '.html',
    });
    assertLive(options.signal);
    if (!result) throw new DocumentProjectionError('DOCUMENT_PROJECTION_CONVERSION_FAILED', 'Public HTML projection is unavailable.');
    if (!result.markdown.trim()) throw new Error('PUBLIC_URL_NO_TEXT');
    return {
      content: result.markdown,
      mimeType: 'text/markdown',
      metadata: { publicUrl, isImage: false, isDocumentProjection: true, projection: 'markdown',
        sourceFormat: result.format, sourceMimeType: mimeType, converter: result.converter,
        omittedEntries: result.omittedEntries, title: result.title },
    };
  }

  // Accepted text/Markdown/CSV/JSON/XML remains decoded text, without executing
  // content or dispatching generic document converters (feeds, archives, etc.).
  const content = decodeText(snapshot.bytes, charsetHint).text;
  assertLive(options.signal);
  if (projection === 'markdown' && !content.trim()) throw new Error('PUBLIC_URL_NO_TEXT');
  return { content, mimeType: snapshot.contentType, metadata: { publicUrl, isImage: false } };
}
