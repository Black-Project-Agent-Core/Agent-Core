import { createHash, randomUUID } from 'node:crypto';
import { chmod, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authorizedExistingPath } from './path-safety.js';

export type SemanticSourceEncoding = 'utf8' | 'utf16le' | 'utf16be';

export interface SemanticSourceDocument {
  text: string;
  encoding: SemanticSourceEncoding;
  bom: boolean;
  fingerprint: string;
  realPath: string;
  mode?: number;
}

function fingerprintBytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeUtf16Be(bytes: Buffer): string {
  if (bytes.length % 2 !== 0) throw new Error('SEMANTIC_SOURCE_ENCODING_INVALID: utf16be-odd-byte-count');
  const swapped = Buffer.allocUnsafe(bytes.length);
  for (let index = 0; index < bytes.length; index += 2) {
    swapped[index] = bytes[index + 1]!;
    swapped[index + 1] = bytes[index]!;
  }
  return new TextDecoder('utf-16le', { fatal: true }).decode(swapped);
}

function encodeUtf16Be(text: string): Buffer {
  const little = Buffer.from(text, 'utf16le');
  const big = Buffer.allocUnsafe(little.length);
  for (let index = 0; index < little.length; index += 2) {
    big[index] = little[index + 1]!;
    big[index + 1] = little[index]!;
  }
  return big;
}

function decodeSource(
  raw: Buffer,
  explicitEncoding?: SemanticSourceEncoding,
): { text: string; encoding: SemanticSourceEncoding; bom: boolean } {
  let body = raw;
  let encoding: SemanticSourceEncoding | undefined;
  let bom = false;

  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    encoding = 'utf8';
    bom = true;
    body = raw.subarray(3);
  } else if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    encoding = 'utf16le';
    bom = true;
    body = raw.subarray(2);
  } else if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    encoding = 'utf16be';
    bom = true;
    body = raw.subarray(2);
  }

  if (encoding && explicitEncoding && encoding !== explicitEncoding) {
    throw new Error(`SEMANTIC_SOURCE_ENCODING_CONFLICT: bom=${encoding} configured=${explicitEncoding}`);
  }
  encoding ??= explicitEncoding ?? 'utf8';

  try {
    if (encoding === 'utf8') {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding, bom };
    }
    if (encoding === 'utf16le') {
      if (body.length % 2 !== 0) throw new Error('utf16le-odd-byte-count');
      return { text: new TextDecoder('utf-16le', { fatal: true }).decode(body), encoding, bom };
    }
    return { text: decodeUtf16Be(body), encoding, bom };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`SEMANTIC_SOURCE_ENCODING_INVALID: ${encoding}: ${detail}`);
  }
}

export function encodeSource(text: string, encoding: SemanticSourceEncoding, bom: boolean): Buffer {
  let body: Buffer;
  let prefix = Buffer.alloc(0);
  if (encoding === 'utf8') {
    body = Buffer.from(text, 'utf8');
    if (bom) prefix = Buffer.from([0xef, 0xbb, 0xbf]);
  } else if (encoding === 'utf16le') {
    body = Buffer.from(text, 'utf16le');
    if (bom) prefix = Buffer.from([0xff, 0xfe]);
  } else {
    body = encodeUtf16Be(text);
    if (bom) prefix = Buffer.from([0xfe, 0xff]);
  }
  return prefix.length ? Buffer.concat([prefix, body]) : body;
}

export async function readSemanticSource(
  root: string,
  filePath: string,
  explicitEncoding?: SemanticSourceEncoding,
): Promise<SemanticSourceDocument> {
  const authorized = await authorizedExistingPath(root, filePath);
  const raw = await readFile(authorized.realPath);
  const decoded = decodeSource(raw, explicitEncoding);
  let mode: number | undefined;
  try { mode = (await stat(authorized.realPath)).mode & 0o777; } catch {}
  return {
    ...decoded,
    fingerprint: fingerprintBytes(raw),
    realPath: authorized.realPath,
    ...(mode === undefined ? {} : { mode }),
  };
}

async function replaceWithRetry(source: string, target: string): Promise<void> {
  const attempts = process.platform === 'win32' ? 10 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
      if (!retryable || attempt === attempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

export async function writeSemanticSourceAtomic(
  root: string,
  filePath: string,
  text: string,
  source: Pick<SemanticSourceDocument, 'encoding' | 'bom' | 'mode'>,
): Promise<void> {
  const authorized = await authorizedExistingPath(root, filePath);
  const target = authorized.realPath;
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.semantic-${process.pid}-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, encodeSource(text, source.encoding, source.bom));
    if (source.mode !== undefined && process.platform !== 'win32') {
      await chmod(temporary, source.mode);
    }
    await replaceWithRetry(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
