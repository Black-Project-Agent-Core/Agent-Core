import type { PageRange, PdfEvidence } from '../tools/pdf/index.js';
import type { XlsxEvidence } from './xlsx-evidence.js';

export type ProjectionProfile = 'auto' | 'native' | 'markdown';

export interface ProjectionEvidence {
  extension?: string;
  mimeType?: string;
  signature?: string;
}

export interface ProjectionBudget {
  entries: number;
  expandedBytes: number;
}

export interface ProjectionInput {
  bytes: Buffer;
  profile: ProjectionProfile;
  sourceName?: string;
  localPath?: string;
  url?: string;
  mimeType?: string;
  charsetHint?: string;
  extension?: string;
  pdfPageRange?: PageRange;
  observedAt?: string;
  depth: number;
  budget: ProjectionBudget;
}

export interface ProjectionResult {
  markdown: string;
  format: string;
  converter: string;
  title?: string;
  omittedEntries?: number;
  evidence?: ProjectionEvidence;
  pdfEvidence?: PdfEvidence;
  xlsxEvidence?: XlsxEvidence;
  /** Internal signal; page labels alone do not establish extracted text. */
  pdfTextAvailable?: boolean;
}
export interface ProjectionAttempt {
  converter: string;
  failure: string;
}

export interface ProjectionContext {
  projectNested(input: Omit<ProjectionInput, 'depth' | 'budget'>): Promise<ProjectionResult | null>;
}

export interface ProjectionConverter {
  id: string;
  priority: number;
  autoTopLevel: boolean;
  accepts(input: ProjectionInput): boolean;
  convert(input: ProjectionInput, context: ProjectionContext): Promise<ProjectionResult>;
}

export interface ProjectedFileMetadata {
  isDocumentProjection: true;
  projection: 'markdown';
  sourceFormat: string;
  converter: string;
  sourceMimeType?: string;
  sourceExtension?: string;
  omittedEntries?: number;
  title?: string;
}

export class DocumentProjectionError extends Error {
  readonly attempts: ProjectionAttempt[];
  readonly code: string;

  constructor(code: string, message: string, attempts: ProjectionAttempt[] = []) {
    super(message);
    this.name = 'DocumentProjectionError';
    this.code = code;
    this.attempts = attempts;
  }
}

export class DocumentProjectionSecurityError extends DocumentProjectionError {
  constructor(code: string, message = 'Document projection refused unsafe input.') {
    super(code, message);
    this.name = 'DocumentProjectionSecurityError';
  }
}
