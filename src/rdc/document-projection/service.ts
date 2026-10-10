import { activityTracker } from '../../tracker/activity-tracker.js';
import { readRegularFileBounded } from '../utils/files/safe-regular-file.js';
import {
  boundMarkdown,
  DOCUMENT_INPUT_MAX_BYTES,
  extensionFrom,
  inferSignature,
} from './helpers.js';
import {
  DocumentProjectionError,
  DocumentProjectionSecurityError,
  type ProjectionAttempt,
  type ProjectionBudget,
  type ProjectionInput,
  type ProjectionProfile,
  type ProjectionResult,
} from './types.js';
import {
  docxConverter,
  pdfProjectionConverter,
  pptxConverter,
  xlsxConverter,
  xlsConverter,
} from './office-converters.js';
import { epubConverter, ipynbConverter, msgConverter } from './long-tail-converters.js';
import { csvConverter, feedConverter, htmlConverter } from './markup-converters.js';
import { preflightZipBuffer, zipProjectionConverter } from './archive-converter.js';

const AUTO_EXTENSIONS = new Set(['.pptx', '.epub', '.ipynb', '.msg', '.zip']);
const converters = [
  pptxConverter,
  docxConverter,
  xlsxConverter,
  xlsConverter,
  pdfProjectionConverter,
  epubConverter,
  ipynbConverter,
  msgConverter,
  feedConverter,
  htmlConverter,
  csvConverter,
  zipProjectionConverter,
].sort((a, b) => a.priority - b.priority);
export interface ProjectBytesOptions {
  bytes: Buffer;
  profile?: ProjectionProfile;
  sourceName?: string;
  localPath?: string;
  url?: string;
  mimeType?: string;
  extension?: string;
  depth?: number;
  budget?: ProjectionBudget;
}

function failureFamily(error: unknown): string {
  if (error instanceof DocumentProjectionError) return error.code;
  if (error instanceof Error) return error.name || 'Error';
  return typeof error;
}

function normalizedInput(options: ProjectBytesOptions): ProjectionInput {
  const source = options.sourceName ?? options.localPath ?? options.url;
  return {
    bytes: options.bytes,
    profile: options.profile ?? 'auto',
    sourceName: options.sourceName,
    localPath: options.localPath,
    url: options.url,
    mimeType: options.mimeType?.split(';', 1)[0]?.trim().toLowerCase(),
    extension: options.extension?.toLowerCase() ?? extensionFrom(source),
    depth: options.depth ?? 0,
    budget: options.budget ?? { entries: 0, expandedBytes: 0 },
  };
}

export class DocumentProjectionService {
  shouldAttempt(source: string | undefined, profile: ProjectionProfile = 'auto', mimeType?: string): boolean {
    if (profile === 'native') return false;
    if (profile === 'markdown') return true;
    const extension = extensionFrom(source);
    if (extension && AUTO_EXTENSIONS.has(extension)) return true;
    const mime = (mimeType ?? '').toLowerCase();
    return mime.includes('presentationml.presentation')
      || mime.includes('application/epub')
      || mime.includes('vnd.ms-outlook')
      || mime.includes('application/zip')
      || mime.includes('application/x-ipynb');
  }
  async projectLocalFile(
    localPath: string,
    profile: ProjectionProfile = 'auto',
  ): Promise<ProjectionResult | null> {
    if (!this.shouldAttempt(localPath, profile)) return null;
    const read = await readRegularFileBounded(localPath, DOCUMENT_INPUT_MAX_BYTES);
    if (read.truncated) {
      throw new DocumentProjectionError(
        'DOCUMENT_PROJECTION_INPUT_TOO_LARGE',
        'Document semantic projection input exceeds the bounded size limit.',
      );
    }
    return this.projectBytes({ bytes: read.buffer, profile, localPath });
  }

  async projectBytes(options: ProjectBytesOptions): Promise<ProjectionResult | null> {
    const input = normalizedInput(options);
    if (input.profile === 'native') return null;
    if (input.bytes.length > DOCUMENT_INPUT_MAX_BYTES) {
      throw new DocumentProjectionError(
        'DOCUMENT_PROJECTION_INPUT_TOO_LARGE',
        'Document semantic projection input exceeds the bounded size limit.',
      );
    }

    const signature = inferSignature(input.bytes);
    if (signature === 'zip') {
      await preflightZipBuffer(input.bytes);
    }

    const accepted = converters.filter(converter => {
      if (input.depth === 0 && input.profile === 'auto' && !converter.autoTopLevel) return false;
      try {
        return converter.accepts(input);
      } catch {
        return false;
      }
    });
    if (accepted.length === 0) return null;
    const attempts: ProjectionAttempt[] = [];
    const context = {
      projectNested: async (nested: Omit<ProjectionInput, 'depth' | 'budget'>) => {
        return this.projectBytes({
          ...nested,
          depth: input.depth + 1,
          budget: input.budget,
        });
      },
    };

    for (const converter of accepted) {
      try {
        const result = await converter.convert(input, context);
        return {
          ...result,
          markdown: boundMarkdown(result.markdown),
          evidence: {
            extension: input.extension,
            mimeType: input.mimeType,
            signature,
          },
        };
      } catch (error) {
        if (error instanceof DocumentProjectionSecurityError) throw error;
        const attempt = { converter: converter.id, failure: failureFamily(error) };
        attempts.push(attempt);
        activityTracker.record(
          'RDC',
          'warn',
          'Document semantic projection converter failed',
          'document-projection-converter-failure',
          { converter: converter.id, failure: attempt.failure, format: input.extension ?? signature ?? 'unknown' },
        );
      }
    }

    throw new DocumentProjectionError(
      'DOCUMENT_PROJECTION_CONVERSION_FAILED',
      'Document semantic projection failed for the recognized format.',
      attempts,
    );
  }
}

export const documentProjectionService = new DocumentProjectionService();
