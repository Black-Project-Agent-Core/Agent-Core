import { createRequire } from 'module';
import { createHash } from 'node:crypto';

import { generatePageNumbers } from '../utils.js';
import { extractImagesFromPdf, ImageInfo } from '../extract-images.js';
import { buildPdfEvidence, PDF_EVIDENCE_MAX_PAGES, type PdfEvidence } from './evidence.js';
const require = createRequire(import.meta.url);

const { parse } = require('@opendocsg/pdf2md/lib/util/pdf');
const { makeTransformations, transform } = require('@opendocsg/pdf2md/lib/util/transformations');
const pdfPackage = require('@opendocsg/pdf2md/package.json');

type ParseResult = ReturnType<typeof parse>;


/**
 * PDF metadata structure
 */
export interface PdfMetadata {
    fileSize?: number;
    totalPages: number;
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    version?: string;
    creationDate?: string;
    modificationDate?: string;
    isEncrypted?: boolean;
}

export interface PdfPageItem {
    text: string;
    images: ImageInfo[];
    pageNumber: number;
}

export interface PdfParseResult {
    pages: PdfPageItem[];
    metadata: PdfMetadata;
    pdfEvidence?: PdfEvidence;
}


/**
 * Extracts metadata from a PDF document.
 * @param pdfDocument The PDF document to extract metadata from.
 * @returns A PdfMetadata object containing the extracted metadata.
 */
const extractMetadata = ({ pdfDocument, metadata }: ParseResult): PdfMetadata => {
    const info = metadata.info ?? metadata;
    return {
        totalPages: pdfDocument.numPages,
        title: info.Title,
        author: info.Author,
        creator: info.Creator,
        producer: info.Producer,
        version: info.PDFFormatVersion,
        creationDate: info.CreationDate,
        modificationDate: info.ModDate,
        isEncrypted: info.IsEncrypted,
    };
};


export type PageRange = {
    offset: number;
    length: number;
};

export interface PdfParseOptions {
    /** Snapshot acquisition time supplied by the byte reader. */
    observedAt?: string;
    /** Native reads retain image extraction; text-only projections can disable it. */
    extractImages?: boolean;
}

/**
 * Reads a PDF and converts it to Markdown, returning structured data.
 * @param pdfBuffer The PDF buffer to convert.
 * @param pageNumbers Undefined means all pages; an explicit empty array selects none.
 * @returns A Promise that resolves to a PdfParseResult object containing the parsed data.
 */
export async function pdf2md(
    pdfBuffer: Uint8Array,
    pageNumbers?: number[] | PageRange,
    options: PdfParseOptions = {},
): Promise<PdfParseResult> {
    if (pageNumbers !== undefined && !Array.isArray(pageNumbers)
        && (!Number.isSafeInteger(pageNumbers.offset) || !Number.isSafeInteger(pageNumbers.length) || pageNumbers.length < 0)) {
        throw new Error('PDF_PAGE_SELECTION_INVALID');
    }
    const observedAt = options.observedAt ?? new Date().toISOString();
    const sourceSha256 = createHash('sha256').update(pdfBuffer).digest('hex');
    const sourceBytes = pdfBuffer.byteLength;
    let pdfDocument: any;
    try {
        const result = await parse(pdfBuffer, { documentParsed: (document: any) => { pdfDocument = document; } });
        pdfDocument = result.pdfDocument;
        const { fonts, pages } = result;
        let selection: PdfEvidence['coverage']['selection'];
        let requestedPages: number;
        let pageNumberMap: number[];
        if (pageNumbers === undefined) {
            selection = { mode: 'all' };
            requestedPages = pages.length;
            pageNumberMap = pages.map((_: unknown, index: number) => index + 1);
        } else if (Array.isArray(pageNumbers)) {
            const requested = [...new Set(pageNumbers.filter(page => Number.isSafeInteger(page) && page >= 1))].sort((a, b) => a - b);
            selection = { mode: 'pages', pageNumbers: requested.slice(0, PDF_EVIDENCE_MAX_PAGES),
                omittedPageNumbers: Math.max(0, requested.length - PDF_EVIDENCE_MAX_PAGES) };
            requestedPages = requested.length;
            pageNumberMap = requested.filter(page => page <= pages.length);
        } else {
            selection = { mode: 'range', offset: pageNumbers.offset, length: pageNumbers.length };
            requestedPages = pageNumbers.length;
            pageNumberMap = generatePageNumbers(pageNumbers.offset, pageNumbers.length, pages.length);
        }
        const pagesToProcess = pageNumberMap.map(pageNumber => pages[pageNumber - 1]);
        const extractImages = options.extractImages !== false;
        const pdfEvidence = await buildPdfEvidence({
            sourceSha256, sourceBytes, observedAt,
            extractor: { name: String(pdfPackage.name), version: String(pdfPackage.version) },
            totalPages: pdfDocument.numPages, selection, requestedPages,
            pageNumbers: pageNumberMap, pages: pagesToProcess, pdfDocument, extractImages,
        });
        const parseResult = pagesToProcess.length > 0
            ? transform(pagesToProcess, makeTransformations(fonts.map)) : { pages: [] };
        const imagesByPage: Record<number, ImageInfo[]> = extractImages && pageNumberMap.length > 0
            ? await extractImagesFromPdf(pdfBuffer, pageNumberMap, { format: 'webp', quality: 85 }) : {};
        const processedPages: PdfPageItem[] = parseResult.pages.map((page: any, index: number) => {
            const pageNumber = pageNumberMap[index]!;
            return { pageNumber, text: page.items.join('\n') + '\n', images: imagesByPage[pageNumber] || [] };
        });
        return { pages: processedPages, metadata: extractMetadata(result), pdfEvidence };
    } finally {
        if (pdfDocument) {
            try {
                if (typeof pdfDocument.cleanup === 'function') {
                    await pdfDocument.cleanup(false);
                }
            } catch (e) { }
            try {
                if (typeof pdfDocument.destroy === 'function') {
                    await pdfDocument.destroy();
                }
            } catch (e) { }
        }
    }
}
