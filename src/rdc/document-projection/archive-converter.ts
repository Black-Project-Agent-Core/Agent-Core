import yauzl from 'yauzl';
import type { ProjectionConverter, ProjectionResult } from './types.js';
import {
  ARCHIVE_MAX_BYTES,
  ARCHIVE_MAX_DEPTH,
  ARCHIVE_MAX_FILES,
  ARCHIVE_MEMBER_MAX_BYTES,
  ARCHIVE_TOTAL_MAX_BYTES,
  isZipSymlink,
  sanitizeArchivePath,
} from './helpers.js';
import { DocumentProjectionError, DocumentProjectionSecurityError } from './types.js';

export interface ZipPreflightPolicy {
  maxArchiveBytes: number;
  maxFiles: number;
  maxMemberBytes: number;
  maxExpandedBytes: number;
}

export const PACKAGE_ZIP_PREFLIGHT: ZipPreflightPolicy = {
  maxArchiveBytes: 128 * 1024 * 1024,
  maxFiles: 4096,
  maxMemberBytes: 64 * 1024 * 1024,
  maxExpandedBytes: 256 * 1024 * 1024,
};

function openZip(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, {
      lazyEntries: true,
      autoClose: false,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: false,
    }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('DOCUMENT_PROJECTION_ARCHIVE_OPEN_FAILED'));
      else resolve(zip);
    });
  });
}

function readZipEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(error ?? new Error('DOCUMENT_PROJECTION_ARCHIVE_ENTRY_OPEN_FAILED'));
      const chunks: Buffer[] = [];
      let bytes = 0;
      stream.on('data', chunk => {
        const part = Buffer.from(chunk);
        bytes += part.length;
        if (bytes > ARCHIVE_MEMBER_MAX_BYTES) {
          stream.destroy(new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_MEMBER_TOO_LARGE'));
          return;
        }
        chunks.push(part);
      });
      stream.once('error', reject);
      stream.once('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}
export async function preflightZipBuffer(
  buffer: Buffer,
  policy: ZipPreflightPolicy = PACKAGE_ZIP_PREFLIGHT,
): Promise<void> {
  if (buffer.length > policy.maxArchiveBytes) {
    throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_TOO_LARGE');
  }

  const zip = await openZip(buffer);
  let entries = 0;
  let expanded = 0;
  let settled = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        if (error instanceof Error && /invalid relative path|absolute path|path traversal/i.test(error.message)) {
          reject(new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_TRAVERSAL_REFUSED'));
          return;
        }
        reject(error);
      };
      zip.once('error', fail);
      zip.once('end', () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      zip.on('entry', entry => {
        try {
          entries += 1;
          if (entries > policy.maxFiles) throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_FILE_COUNT_LIMIT');
          sanitizeArchivePath(entry.fileName);
          if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_ENCRYPTED');
          if (![0, 8].includes(entry.compressionMethod)) throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_COMPRESSION_REFUSED');
          if (isZipSymlink(entry.externalFileAttributes)) throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_SYMLINK_REFUSED');
          if (!entry.fileName.endsWith('/')) {
            if (entry.uncompressedSize > policy.maxMemberBytes) throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_MEMBER_TOO_LARGE');
            expanded += entry.uncompressedSize;
            if (expanded > policy.maxExpandedBytes) throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_EXPANDED_LIMIT');
          }
          zip.readEntry();
        } catch (error) {
          fail(error);
        }
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}

const SPECIALIZED_ZIP_EXTENSIONS = new Set(['.pptx', '.docx', '.xlsx', '.xlsm', '.epub']);

export const zipProjectionConverter: ProjectionConverter = {
  id: 'zip-semantic',
  priority: 90,
  autoTopLevel: true,
  accepts(input) {
    if (SPECIALIZED_ZIP_EXTENSIONS.has(input.extension ?? '')) return false;
    const mime = (input.mimeType ?? '').toLowerCase();
    const signature = input.bytes.length >= 4
      && input.bytes[0] === 0x50
      && input.bytes[1] === 0x4b;
    return input.extension === '.zip' || mime.includes('application/zip') || signature;
  },
  async convert(input, context): Promise<ProjectionResult> {
    if (input.depth >= ARCHIVE_MAX_DEPTH) {
      throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_DEPTH_LIMIT');
    }
    if (input.bytes.length > ARCHIVE_MAX_BYTES) {
      throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_TOO_LARGE');
    }

    const zip = await openZip(input.bytes);
    const sections: string[] = [];
    let omitted = 0;
    let completed = false;
    let settled = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          if (
            error instanceof Error
            && /invalid relative path|absolute path|path traversal/i.test(error.message)
          ) {
            reject(new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_TRAVERSAL_REFUSED'));
            return;
          }
          reject(error);
        };
        zip.once('error', fail);
        zip.once('end', () => {
          if (settled) return;
          settled = true;
          completed = true;
          resolve();
        });
        zip.on('entry', entry => {
          void (async () => {
            try {
              input.budget.entries += 1;
              if (input.budget.entries > ARCHIVE_MAX_FILES) {
                throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_FILE_COUNT_LIMIT');
              }
              const name = sanitizeArchivePath(entry.fileName);
              if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
                throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_ENCRYPTED');
              }
              if (![0, 8].includes(entry.compressionMethod)) {
                throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_COMPRESSION_REFUSED');
              }
              if (isZipSymlink(entry.externalFileAttributes)) {
                throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_SYMLINK_REFUSED');
              }
              if (name.endsWith('/')) {
                zip.readEntry();
                return;
              }
              if (entry.uncompressedSize > ARCHIVE_MEMBER_MAX_BYTES) {
                throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_MEMBER_TOO_LARGE');
              }
              input.budget.expandedBytes += entry.uncompressedSize;
              if (input.budget.expandedBytes > ARCHIVE_TOTAL_MAX_BYTES) {
                throw new DocumentProjectionSecurityError('DOCUMENT_PROJECTION_ARCHIVE_EXPANDED_LIMIT');
              }
              const content = await readZipEntry(zip, entry);
              const projected = await context.projectNested({
                bytes: content,
                profile: 'auto',
                sourceName: name,
                extension: undefined,
                mimeType: undefined,
                localPath: undefined,
                url: undefined,
              });
              if (projected?.markdown) {
                sections.push('## File: ' + name + '\n\n' + projected.markdown);
              } else {
                omitted += 1;
              }
              zip.readEntry();
            } catch (error) {
              fail(error);
            }
          })();
        });
        zip.readEntry();
      });
    } finally {
      if (!completed) zip.close();
    }

    if (omitted > 0) {
      sections.push('[Unsupported archive members omitted: ' + omitted + ']');
    }
    if (sections.length === 0 && omitted === 0) {
      throw new DocumentProjectionError(
        'DOCUMENT_PROJECTION_ARCHIVE_EMPTY',
        'Document projection found no readable archive members.',
      );
    }
    return {
      markdown: sections.join('\n\n'),
      format: 'zip',
      converter: this.id,
      omittedEntries: omitted || undefined,
    };
  },
};
