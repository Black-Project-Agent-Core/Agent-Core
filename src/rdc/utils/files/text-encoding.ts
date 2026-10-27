/**
 * Text encodings the edit and write tools must round-trip. Decoding is strict: a file that is not valid UTF-8
 * (for example Windows-1252) is refused, because decoding it lossily and writing it back would silently destroy
 * every byte the decoder could not represent. The BOM kind is remembered by the file itself and re-applied on write.
 */
export type TextEncoding = 'utf8' | 'utf8-bom' | 'utf16le' | 'utf16be';

const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export function sniffEncoding(head: Uint8Array): TextEncoding {
  if (head[0] === 0xff && head[1] === 0xfe) return 'utf16le';
  if (head[0] === 0xfe && head[1] === 0xff) return 'utf16be';
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return 'utf8-bom';
  return 'utf8';
}

export function decodeTextBuffer(buffer: Buffer): { text: string; encoding: TextEncoding } {
  const encoding = sniffEncoding(buffer);
  if (encoding === 'utf16le') return { text: buffer.subarray(2).toString('utf16le'), encoding };
  if (encoding === 'utf16be') {
    const body = Buffer.from(buffer.subarray(2));
    if (body.length % 2) throw new Error('TEXT_NOT_VALID_UTF16: odd number of bytes after the byte order mark');
    return { text: body.swap16().toString('utf16le'), encoding };
  }
  try {
    return { text: strictUtf8.decode(encoding === 'utf8-bom' ? buffer.subarray(3) : buffer), encoding };
  } catch {
    throw new Error('TEXT_NOT_VALID_UTF8: the file is not valid UTF-8 (for example Windows-1252); rewriting it as UTF-8 would destroy the bytes that cannot be decoded, so it was not read for editing');
  }
}

export function encodeText(text: string, encoding: TextEncoding, withBom = true): Buffer {
  switch (encoding) {
    case 'utf16le': return Buffer.concat([withBom ? Buffer.from([0xff, 0xfe]) : Buffer.alloc(0), Buffer.from(text, 'utf16le')]);
    case 'utf16be': return Buffer.concat([withBom ? Buffer.from([0xfe, 0xff]) : Buffer.alloc(0), Buffer.from(text, 'utf16le').swap16()]);
    case 'utf8-bom': return Buffer.concat([withBom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(text, 'utf8')]);
    default: return Buffer.from(text, 'utf8');
  }
}
