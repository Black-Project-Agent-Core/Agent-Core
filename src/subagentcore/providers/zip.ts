import { inflateRawSync } from 'node:zlib';

export interface ZipTextEntry { name: string; text: string; }
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZipTextEntries(input: Uint8Array): ZipTextEntry[] {
  const buffer = Buffer.from(input);
  let eocd = -1;
  for (let offset = Math.max(0, buffer.length - 65_557); offset <= buffer.length - 22; offset++) if (buffer.readUInt32LE(offset) === EOCD) eocd = offset;
  if (eocd < 0) throw new Error('OPENHANDS_EXPORT_INVALID_ZIP');
  const count = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipTextEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL) throw new Error('OPENHANDS_EXPORT_INVALID_CENTRAL_DIRECTORY');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8');
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL) throw new Error('OPENHANDS_EXPORT_INVALID_LOCAL_HEADER');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let content: Buffer;
    if (method === 0) content = compressed;
    else if (method === 8) content = inflateRawSync(compressed);
    else { cursor += 46 + fileNameLength + extraLength + commentLength; continue; }
    if (content.length <= 2_000_000 && !name.endsWith('/')) entries.push({ name, text: content.toString('utf8') });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}
