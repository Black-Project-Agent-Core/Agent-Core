import { formatBytes } from './model';

// Mirrors the limits in src/agent-chat-attachments.ts. The server validates again; these only keep a bad pick from being sent.
export const MAX_ATTACHMENTS = 8;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;

/** A picked file held by the composer until the message is sent. */
export type AttachmentDraft = { name: string; mimeType?: string; dataBase64: string; sizeBytes: number };

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** Appends the picked files that fit the limits; the notice names the last file or limit that was left out. */
export async function addAttachmentFiles(current: AttachmentDraft[], files: File[]): Promise<{ next: AttachmentDraft[]; notice?: string }> {
  let next = current;
  let total = current.reduce((sum, item) => sum + item.sizeBytes, 0);
  let notice: string | undefined;
  for (const file of files) {
    if (next.length >= MAX_ATTACHMENTS) { notice = `Maksimal ${MAX_ATTACHMENTS} lampiran per pesan`; break; }
    if (file.size > MAX_ATTACHMENT_BYTES) { notice = `${file.name} melebihi ${formatBytes(MAX_ATTACHMENT_BYTES)}`; continue; }
    if (total + file.size > MAX_ATTACHMENT_TOTAL_BYTES) { notice = `Total lampiran melebihi ${formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)}`; continue; }
    try {
      next = [...next, { name: file.name, mimeType: file.type || undefined, dataBase64: await readBase64(file), sizeBytes: file.size }];
      total += file.size;
    } catch {
      notice = `Gagal membaca ${file.name}`;
    }
  }
  return { next, notice };
}

/** The wire form of the drafts: sizeBytes is a display field and is not sent. */
export const attachmentPayload = (drafts: AttachmentDraft[]) =>
  drafts.map(({ name, mimeType, dataBase64 }) => ({ name, ...(mimeType ? { mimeType } : {}), dataBase64 }));
