import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES, addAttachmentFiles, attachmentPayload } from './attachments';

const file = (name: string, content: string, type = 'text/plain') => new File([content], name, { type });
const sized = (name: string, bytes: number) => {
  const picked = new File(['x'], name, { type: 'text/plain' });
  Object.defineProperty(picked, 'size', { value: bytes });
  return picked;
};

describe('addAttachmentFiles', () => {
  it('reads a picked file as plain base64 and keeps what was already attached', async () => {
    const first = await addAttachmentFiles([], [file('a.txt', 'hi')]);
    expect(first.notice).toBeUndefined();
    expect(first.next).toEqual([{ name: 'a.txt', mimeType: 'text/plain', dataBase64: 'aGk=', sizeBytes: 2 }]);
    const second = await addAttachmentFiles(first.next, [file('b.bin', 'yo', '')]);
    expect(second.next.map(item => item.name)).toEqual(['a.txt', 'b.bin']);
    expect(second.next[1]).toMatchObject({ mimeType: undefined, dataBase64: 'eW8=' });
  });

  it('leaves out a file over the per-file or total limit and names it, without dropping the others', async () => {
    const tooBig = await addAttachmentFiles([], [sized('huge.bin', MAX_ATTACHMENT_BYTES + 1), file('ok.txt', 'ok')]);
    expect(tooBig.next.map(item => item.name)).toEqual(['ok.txt']);
    expect(tooBig.notice).toMatch(/huge\.bin melebihi/);

    const held = [{ name: 'held.bin', dataBase64: '', sizeBytes: MAX_ATTACHMENT_TOTAL_BYTES - 10 }];
    const total = await addAttachmentFiles(held, [file('late.txt', 'a long enough body')]);
    expect(total.next).toEqual(held);
    expect(total.notice).toMatch(/Total lampiran melebihi/);
  });

  it('stops at the count limit', async () => {
    const files = Array.from({ length: MAX_ATTACHMENTS + 2 }, (_, index) => file(`f${index}.txt`, 'x'));
    const result = await addAttachmentFiles([], files);
    expect(result.next).toHaveLength(MAX_ATTACHMENTS);
    expect(result.notice).toBe(`Maksimal ${MAX_ATTACHMENTS} lampiran per pesan`);
  });
});

describe('attachmentPayload', () => {
  it('sends name, mime type and data, never the display size', () => {
    expect(attachmentPayload([
      { name: 'a.txt', mimeType: 'text/plain', dataBase64: 'aGk=', sizeBytes: 2 },
      { name: 'b.bin', dataBase64: 'eW8=', sizeBytes: 2 },
    ])).toEqual([{ name: 'a.txt', mimeType: 'text/plain', dataBase64: 'aGk=' }, { name: 'b.bin', dataBase64: 'eW8=' }]);
  });
});
