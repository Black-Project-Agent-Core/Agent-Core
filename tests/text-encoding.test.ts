import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeTextBuffer, encodeText, sniffEncoding } from '../src/rdc/utils/files/text-encoding.js';
import { TextFileHandler } from '../src/rdc/utils/files/text.js';
import { truncateText } from '../src/text-bounds.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function temp(name: string, bytes?: Buffer) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'text-encoding-'));
  roots.push(root);
  const file = path.join(root, name);
  if (bytes) await writeFile(file, bytes);
  return file;
}
const TEXT = 'héllo €\r\nsecond line ✓\r\n';

describe('text encoding', () => {
  it.each(['utf8', 'utf8-bom', 'utf16le', 'utf16be'] as const)('round-trips %s byte for byte', encoding => {
    const bytes = encodeText(TEXT, encoding);
    expect(sniffEncoding(bytes)).toBe(encoding);
    expect(decodeTextBuffer(bytes)).toEqual({ text: TEXT, encoding });
    expect(encodeText(decodeTextBuffer(bytes).text, encoding).equals(bytes)).toBe(true);
  });

  it('refuses a file that is not valid UTF-8 instead of decoding it lossily', () => {
    const windows1252 = Buffer.from('caf\xe9 au lait', 'latin1');
    expect(() => decodeTextBuffer(windows1252)).toThrow('TEXT_NOT_VALID_UTF8');
    expect(() => decodeTextBuffer(Buffer.from([0xfe, 0xff, 0x00]))).toThrow('TEXT_NOT_VALID_UTF16');
  });

  it('keeps an existing file encoding when the write tools rewrite or append', async () => {
    const handler = new TextFileHandler();
    for (const encoding of ['utf8', 'utf8-bom', 'utf16le', 'utf16be'] as const) {
      const file = await temp(`${encoding}.txt`, encodeText('old\n', encoding));
      await handler.write(file, 'new text é\n', 'rewrite');
      expect((await readFile(file)).equals(encodeText('new text é\n', encoding)), `${encoding} rewrite`).toBe(true);
      await handler.write(file, 'more\n', 'append');
      expect((await readFile(file)).equals(encodeText('new text é\nmore\n', encoding)), `${encoding} append`).toBe(true);
    }
  });

  it('does not double a BOM the caller text still carries, and writes a new file as plain UTF-8', async () => {
    const handler = new TextFileHandler();
    const bom = await temp('bom.txt', encodeText('old', 'utf8-bom'));
    await handler.write(bom, '﻿kept\n', 'rewrite');
    expect((await readFile(bom)).equals(encodeText('kept\n', 'utf8-bom'))).toBe(true);
    const fresh = await temp('fresh.txt');
    await handler.write(fresh, 'plain é\n', 'rewrite');
    expect((await readFile(fresh)).equals(Buffer.from('plain é\n', 'utf8'))).toBe(true);
    const explicit = await temp('explicit.txt', Buffer.from('old', 'utf8'));
    await handler.write(explicit, '﻿wanted\n', 'rewrite'); // a BOM the caller asked for on a BOM-less file stays
    expect((await readFile(explicit)).equals(encodeText('wanted\n', 'utf8-bom'))).toBe(true);
  });
});

describe('truncateText', () => {
  it('never leaves half of a surrogate pair at the cut', () => {
    expect(truncateText('abc', 5)).toBe('abc');
    expect(truncateText('ab😀cd', 3)).toBe('ab');
    expect(truncateText('ab😀cd', 4)).toBe('ab😀');
    expect(truncateText('abcdef', 3)).toBe('abc');
  });
});
