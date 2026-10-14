import { redactSensitiveString } from '../../../../security/redaction.js';

export const PDF_EVIDENCE_MAX_BYTES = 32_768;
export const PDF_EVIDENCE_MAX_PAGES = 8;
export const PDF_EVIDENCE_MAX_ITEMS = 32;
export const PDF_EVIDENCE_MAX_TEXT_CHARS = 160;
/** Internal adapter marker; symbols do not cross the JSON tool boundary. */
export const PDF_EVIDENCE_BLOCK = Symbol('agent-core.pdf-evidence');

type StopReason = 'page-limit' | 'item-limit' | 'excerpt-limit' | 'byte-limit'
    | 'empty-selection' | 'empty-text-layer' | 'output-truncated';

export interface PdfEvidenceItem {
    /** Local to this source digest, extractor version and physical page. */
    id: string;
    /** Zero-based index of the dependency TextItem before Markdown transforms. */
    textItemIndex: number;
    text: string;
    textTruncated: boolean;
    position?: { x: number; y: number; width: number; height: number };
}

export interface PdfEvidencePage {
    pageNumber: number;
    viewBox?: [number, number, number, number];
    rotation?: number;
    userUnit?: number;
    geometryStatus: 'available' | 'partial' | 'unavailable';
    totalItems: number;
    omittedItems: number;
    items: PdfEvidenceItem[];
}

export interface PdfEvidence {
    version: 1;
    sourceSha256: string;
    sourceBytes: number;
    /** When the input byte snapshot was received, not a document publication date. */
    observedAt: string;
    extractor: { name: string; version: string };
    totalPages: number;
    textSource: 'pdf-text-layer';
    geometryFidelity: 'approximate-text-item';
    coordinateSpace: 'pdf-user-space';
    rotationApplied: false;
    clipStatus: 'not-applied';
    textOrientation: 'unknown';
    semanticVerification: 'not-performed';
    capabilities: {
        textExtraction: { supported: true; attempted: true };
        approximateTextItemGeometry: { supported: boolean; attempted: true };
        embeddedImageExtraction: { supported: true; attempted: boolean };
        ocr: { supported: false; attempted: false };
        semanticTableStructure: { supported: false; attempted: false };
    };
    coverage: {
        selection: {
            mode: 'all' | 'range' | 'pages';
            offset?: number;
            length?: number;
            /** Bounded request summary; pages[].pageNumber identifies delivered pages. */
            pageNumbers?: number[];
            omittedPageNumbers?: number;
        };
        requestedPages: number;
        selectedPages: number;
        returnedPages: number;
        omittedPages: number;
        selectedItems: number;
        returnedItems: number;
        omittedItems: number;
        truncatedExcerpts: number;
        textLayerEmpty: boolean;
        byteLimit: number;
        metadataBytes: number;
        status: 'complete' | 'partial' | 'empty';
        stopReasons: StopReason[];
        /** Next physical selected page, never continuation of omitted items. */
        nextPage?: number;
    };
    pages: PdfEvidencePage[];
}

function textPrefix(text: string): { text: string; truncated: boolean } {
    let end = 0;
    let chars = 0;
    while (end < text.length && chars < PDF_EVIDENCE_MAX_TEXT_CHARS) {
        const code = text.codePointAt(end)!;
        end += code > 0xffff ? 2 : 1;
        chars += 1;
    }
    return { text: text.slice(0, end), truncated: end < text.length };
}

function safeExcerpt(text: string): { text: string; truncated: boolean } {
    const redacted = redactSensitiveString(text).replace(/https?:\/\/[^\s<>"']+/gi, raw => {
        try {
            const url = new URL(raw);
            // Match the public transport's locator policy without retaining credentials.
            return url.origin + url.pathname;
        } catch {
            return '[URL REDACTED]';
        }
    });
    return textPrefix(redacted);
}

function geometryStatus(items: PdfEvidenceItem[]): PdfEvidencePage['geometryStatus'] {
    const positioned = items.filter(item => item.position !== undefined).length;
    return positioned === 0 ? 'unavailable' : positioned === items.length ? 'available' : 'partial';
}

function recount(evidence: PdfEvidence): void {
    const coverage = evidence.coverage;
    coverage.returnedPages = evidence.pages.length;
    coverage.returnedItems = evidence.pages.reduce((count, page) => count + page.items.length, 0);
    coverage.omittedPages = Math.max(0, coverage.selectedPages - coverage.returnedPages);
    coverage.omittedItems = Math.max(0, coverage.selectedItems - coverage.returnedItems);
    coverage.truncatedExcerpts = 0;
    for (const page of evidence.pages) {
        page.omittedItems = Math.max(0, page.totalItems - page.items.length);
        page.geometryStatus = geometryStatus(page.items);
        coverage.truncatedExcerpts += page.items.filter(item => item.textTruncated).length;
    }
    evidence.capabilities.approximateTextItemGeometry.supported = evidence.pages.some(page =>
        page.items.some(item => item.position !== undefined));
    if (coverage.truncatedExcerpts && !coverage.stopReasons.includes('excerpt-limit')) {
        coverage.stopReasons.push('excerpt-limit');
    }
    coverage.status = coverage.omittedPages > 0 || coverage.omittedItems > 0
        || coverage.truncatedExcerpts > 0 || coverage.stopReasons.includes('output-truncated')
        ? 'partial' : coverage.selectedPages === 0 || coverage.textLayerEmpty ? 'empty' : 'complete';
}

function measure(evidence: PdfEvidence): number {
    // The byte count itself is serialized. Resolve its digit width before admission.
    let bytes = Buffer.byteLength(JSON.stringify(evidence), 'utf8');
    while (evidence.coverage.metadataBytes !== bytes) {
        evidence.coverage.metadataBytes = bytes;
        bytes = Buffer.byteLength(JSON.stringify(evidence), 'utf8');
    }
    return bytes;
}

/** Redact and bound the exact compact JSON object sent by an output adapter. */
export function finalizePdfEvidence(
    source: PdfEvidence,
    options: { maxBytes?: number; outputTruncated?: boolean } = {},
): PdfEvidence | undefined {
    const limit = Math.min(PDF_EVIDENCE_MAX_BYTES, Math.floor(options.maxBytes ?? PDF_EVIDENCE_MAX_BYTES));
    if (!Number.isFinite(limit) || limit < 1) return undefined;
    const evidence: PdfEvidence = {
        ...source,
        extractor: { ...source.extractor },
        capabilities: {
            ...source.capabilities,
            approximateTextItemGeometry: { ...source.capabilities.approximateTextItemGeometry },
        },
        coverage: {
            ...source.coverage,
            selection: { ...source.coverage.selection,
                ...(source.coverage.selection.pageNumbers ? {
                    pageNumbers: source.coverage.selection.pageNumbers.slice(0, PDF_EVIDENCE_MAX_PAGES),
                } : {}),
            },
            byteLimit: limit,
            stopReasons: [...source.coverage.stopReasons],
        },
        pages: source.pages.slice(0, PDF_EVIDENCE_MAX_PAGES).map(page => ({
            ...page,
            ...(page.viewBox ? { viewBox: [...page.viewBox] as PdfEvidencePage['viewBox'] } : {}),
            items: page.items.slice(0, PDF_EVIDENCE_MAX_ITEMS).map(item => {
                const prefix = safeExcerpt(item.text);
                return { ...item, text: prefix.text, textTruncated: item.textTruncated || prefix.truncated,
                    ...(item.position ? { position: { ...item.position } } : {}),
                };
            }),
        })),
    };
    if (options.outputTruncated && !evidence.coverage.stopReasons.includes('output-truncated')) {
        evidence.coverage.stopReasons.push('output-truncated');
    }
    recount(evidence);
    while (measure(evidence) > limit) {
        if (!evidence.coverage.stopReasons.includes('byte-limit')) evidence.coverage.stopReasons.push('byte-limit');
        let lastWithItems: PdfEvidencePage | undefined;
        for (let index = evidence.pages.length - 1; index >= 0; index -= 1) {
            if (evidence.pages[index]!.items.length > 0) { lastWithItems = evidence.pages[index]; break; }
        }
        if (lastWithItems) {
            lastWithItems.items.pop();
        } else {
            const removed = evidence.pages.pop();
            if (!removed) return undefined;
            evidence.coverage.nextPage = removed.pageNumber;
        }
        recount(evidence);
    }
    return evidence;
}

type ScalarTextItem = { text?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown };

function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Copy scalar TextItems before the dependency mutates its page graph. */
export async function buildPdfEvidence(input: {
    sourceSha256: string;
    sourceBytes: number;
    observedAt: string;
    extractor: PdfEvidence['extractor'];
    totalPages: number;
    selection: PdfEvidence['coverage']['selection'];
    requestedPages: number;
    pageNumbers: number[];
    pages: Array<{ items: ScalarTextItem[] }>;
    pdfDocument: { getPage(pageNumber: number): Promise<any> };
    extractImages: boolean;
}): Promise<PdfEvidence> {
    const selectedItems = input.pages.reduce((count, page) => count + page.items.length, 0);
    const textLayerEmpty = !input.pages.some(page => page.items.some(item => typeof item.text === 'string' && item.text.trim()));
    const pages: PdfEvidencePage[] = [];
    for (let index = 0; index < Math.min(input.pages.length, PDF_EVIDENCE_MAX_PAGES); index += 1) {
        const raw = input.pages[index]!;
        const pageNumber = input.pageNumbers[index]!;
        const items = raw.items.slice(0, PDF_EVIDENCE_MAX_ITEMS).map((item, textItemIndex): PdfEvidenceItem => {
            const prefix = safeExcerpt(typeof item.text === 'string' ? item.text : '');
            const positioned = finite(item.x) && finite(item.y) && finite(item.width) && item.width >= 0
                && finite(item.height) && item.height > 0;
            return {
                id: `p${pageNumber}:t${textItemIndex}`,
                textItemIndex,
                text: prefix.text,
                textTruncated: prefix.truncated,
                ...(positioned ? { position: { x: item.x as number, y: item.y as number,
                    width: item.width as number, height: item.height as number } } : {}),
            };
        });
        const page: PdfEvidencePage = {
            pageNumber, totalItems: raw.items.length, omittedItems: raw.items.length - items.length,
            geometryStatus: geometryStatus(items), items,
        };
        let documentPage;
        try {
            documentPage = await input.pdfDocument.getPage(pageNumber);
            const view = documentPage.view;
            if (Array.isArray(view) && view.length === 4 && view.every(finite)
                && view[2] > view[0] && view[3] > view[1]) page.viewBox = [...view] as PdfEvidencePage['viewBox'];
            if (finite(documentPage.rotate)) page.rotation = documentPage.rotate;
            if (finite(documentPage.userUnit) && documentPage.userUnit > 0) page.userUnit = documentPage.userUnit;
        } catch {
            // Optional page geometry metadata being unavailable does not invent values.
        } finally {
            try { if (typeof documentPage?.cleanup === 'function') await documentPage.cleanup(); } catch {}
        }
        pages.push(page);
    }
    const stopReasons: StopReason[] = [];
    if (input.pages.length > pages.length) stopReasons.push('page-limit');
    if (pages.some(page => page.omittedItems > 0)) stopReasons.push('item-limit');
    if (input.pages.length === 0) stopReasons.push('empty-selection');
    else if (textLayerEmpty) stopReasons.push('empty-text-layer');
    const evidence: PdfEvidence = {
        version: 1, sourceSha256: input.sourceSha256, sourceBytes: input.sourceBytes,
        observedAt: input.observedAt, extractor: { ...input.extractor }, totalPages: input.totalPages,
        textSource: 'pdf-text-layer', geometryFidelity: 'approximate-text-item', coordinateSpace: 'pdf-user-space',
        rotationApplied: false, clipStatus: 'not-applied', textOrientation: 'unknown', semanticVerification: 'not-performed',
        capabilities: {
            textExtraction: { supported: true, attempted: true },
            approximateTextItemGeometry: { supported: false, attempted: true },
            embeddedImageExtraction: { supported: true, attempted: input.extractImages && input.pages.length > 0 },
            ocr: { supported: false, attempted: false }, semanticTableStructure: { supported: false, attempted: false },
        },
        coverage: {
            selection: input.selection, requestedPages: input.requestedPages, selectedPages: input.pages.length,
            returnedPages: 0, omittedPages: 0, selectedItems, returnedItems: 0, omittedItems: 0,
            truncatedExcerpts: 0, textLayerEmpty, byteLimit: PDF_EVIDENCE_MAX_BYTES, metadataBytes: 0,
            status: 'empty', stopReasons,
            ...(input.pageNumbers[pages.length] !== undefined ? { nextPage: input.pageNumbers[pages.length] } : {}),
        },
        pages,
    };
    // Fixed identity/header fields plus an eight-number selection fit the default bound.
    return finalizePdfEvidence(evidence)!;
}
