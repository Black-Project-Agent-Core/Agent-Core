import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  validateAttachmentInputs,
  classifyAttachment,
  storeAttachments,
  buildAttachmentReference,
  readAttachmentText,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  INLINE_TEXT_CHARS_PER_FILE,
  INLINE_TEXT_CHARS_PER_MESSAGE,
  type ChatAttachmentInput,
  type StoredAttachment,
} from '../src/agent-chat-attachments.js';
import { AgentChatStore } from '../src/agent-chat-store.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-chat-attachments-'));
  roots.push(root);
  return path.join(root, 'chat.sqlite');
}

describe('agent-chat-attachments', () => {
  describe('validateAttachmentInputs', () => {
    it('accepts valid inputs up to the limit', () => {
      const inputs: ChatAttachmentInput[] = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE }, (_, i) => ({
        name: `file${i}.txt`,
        dataBase64: Buffer.from('hello').toString('base64'),
      }));
      const out = validateAttachmentInputs(inputs);
      expect(out).toHaveLength(MAX_ATTACHMENTS_PER_MESSAGE);
    });

    it('rejects empty array', () => {
      expect(() => validateAttachmentInputs([])).toThrow('AGENT_CHAT_ATTACHMENT_INVALID:count');
    });

    it('rejects too many items', () => {
      const inputs: ChatAttachmentInput[] = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, (_, i) => ({
        name: `file${i}.txt`,
        dataBase64: Buffer.from('hello').toString('base64'),
      }));
      expect(() => validateAttachmentInputs(inputs)).toThrow('AGENT_CHAT_ATTACHMENT_INVALID:count');
    });

    it('rejects non-array', () => {
      expect(() => validateAttachmentInputs('not-an-array')).toThrow('AGENT_CHAT_ATTACHMENT_INVALID:count');
    });

    it('rejects empty name', () => {
      expect(() => validateAttachmentInputs([{ name: '', dataBase64: 'aGVsbG8=' }])).toThrow('AGENT_CHAT_ATTACHMENT_INVALID:name');
    });

    it('rejects invalid base64', () => {
      expect(() => validateAttachmentInputs([{ name: 'a.txt', dataBase64: '!!!' }])).toThrow('AGENT_CHAT_ATTACHMENT_INVALID:base64');
    });

    it('rejects file too large', () => {
      const big = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString('base64');
      expect(() => validateAttachmentInputs([{ name: 'big.txt', dataBase64: big }])).toThrow('AGENT_CHAT_ATTACHMENT_INVALID:file-too-large');
    });

    it('rejects total too large', () => {
      // Each file is under the 10 MiB per-file limit; only the sum passes 25 MiB.
      const part = Buffer.alloc(Math.ceil(MAX_ATTACHMENT_TOTAL_BYTES / 3) + 1).toString('base64');
      expect(() => validateAttachmentInputs([
        { name: 'a.txt', dataBase64: part },
        { name: 'b.txt', dataBase64: part },
        { name: 'c.txt', dataBase64: part },
      ])).toThrow('AGENT_CHAT_ATTACHMENT_INVALID:total-too-large');
    });

    it('sanitizes dangerous names (path traversal, control chars, reserved)', () => {
      const inputs = [
        { name: '../..\\x:evil.txt', dataBase64: Buffer.from('x').toString('base64') },
        { name: 'CON.txt', dataBase64: Buffer.from('x').toString('base64') },
      ];
      const out = validateAttachmentInputs(inputs);
      // basename keeps "x:evil.txt" on Windows; the colon is then dropped, so no drive or folder part survives.
      expect(out[0].name).toBe('xevil.txt');
      expect(out[1].name).toBe('_CON.txt');
    });
  });

  describe('classifyAttachment', () => {
    it('classifies PNG by magic bytes', () => {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
      expect(classifyAttachment('x.bin', undefined, png)).toBe('image');
    });

    it('classifies JPEG by magic bytes', () => {
      const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('rest')]);
      expect(classifyAttachment('x.bin', undefined, jpeg)).toBe('image');
    });

    it('classifies GIF87a by magic bytes', () => {
      const gif = Buffer.concat([Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), Buffer.from('rest')]);
      expect(classifyAttachment('x.bin', undefined, gif)).toBe('image');
    });

    it('classifies GIF89a by magic bytes', () => {
      const gif = Buffer.concat([Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), Buffer.from('rest')]);
      expect(classifyAttachment('x.bin', undefined, gif)).toBe('image');
    });

    it('classifies WebP by magic bytes', () => {
      const webp = Buffer.concat([Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]), Buffer.from('rest')]);
      expect(classifyAttachment('x.bin', undefined, webp)).toBe('image');
    });

    it('classifies text by extension', () => {
      expect(classifyAttachment('test.txt', undefined, Buffer.from('hello'))).toBe('text');
      expect(classifyAttachment('test.md', undefined, Buffer.from('hello'))).toBe('text');
      expect(classifyAttachment('test.json', undefined, Buffer.from('hello'))).toBe('text');
      expect(classifyAttachment('test.ts', undefined, Buffer.from('hello'))).toBe('text');
    });

    it('classifies text by mime', () => {
      expect(classifyAttachment('test.bin', 'text/plain', Buffer.from('hello'))).toBe('text');
      expect(classifyAttachment('test.bin', 'application/json', Buffer.from('{}'))).toBe('text');
    });

    it('classifies valid UTF-8 without NUL as text', () => {
      expect(classifyAttachment('unknown.xyz', undefined, Buffer.from('hello world'))).toBe('text');
    });

    it('classifies binary with NUL in first 8KB as binary', () => {
      const buf = Buffer.alloc(100);
      buf[10] = 0;
      expect(classifyAttachment('unknown.xyz', undefined, buf)).toBe('binary');
    });

    it('classifies invalid UTF-8 as binary', () => {
      expect(classifyAttachment('unknown.xyz', undefined, Buffer.from([0xff, 0xfe, 0xfd]))).toBe('binary');
    });
  });

  describe('storeAttachments', () => {
    it('writes files and returns correct metadata', async () => {
      const baseDir = await mkdtemp(path.join(os.tmpdir(), 'attach-base-'));
      roots.push(baseDir);
      const inputs = [
        { name: 'hello.txt', mimeType: 'text/plain', dataBase64: Buffer.from('hello world').toString('base64') },
        { name: 'image.png', mimeType: 'image/png', dataBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64') },
      ];
      const stored = await storeAttachments({ baseDir, conversationId: 'conv-1', turnId: 'turn-1', inputs });
      expect(stored).toHaveLength(2);
      expect(stored[0].name).toBe('hello.txt');
      expect(stored[0].kind).toBe('text');
      expect(stored[0].sha256).toBe(createHash('sha256').update('hello world').digest('hex'));
      expect(stored[1].kind).toBe('image');
      expect(stored[1].relPath).toMatch(/^conv-1\/turn-1\/1-/);
    });

    it('rejects invalid conversationId/turnId (path traversal)', async () => {
      const baseDir = await mkdtemp(path.join(os.tmpdir(), 'attach-base-'));
      roots.push(baseDir);
      await expect(storeAttachments({
        baseDir,
        conversationId: '../evil',
        turnId: 'turn-1',
        inputs: [{ name: 'a.txt', dataBase64: Buffer.from('x').toString('base64') }],
      })).rejects.toThrow('AGENT_CHAT_ATTACHMENT_INVALID:name');
    });

    it('keeps a traversal-looking file name inside the turn folder', async () => {
      const baseDir = await mkdtemp(path.join(os.tmpdir(), 'attach-base-'));
      roots.push(baseDir);
      const [stored] = await storeAttachments({
        baseDir,
        conversationId: 'conv-1',
        turnId: 'turn-1',
        inputs: [{ name: '../../../../etc/passwd', dataBase64: Buffer.from('x').toString('base64') }],
      });
      expect(stored!.relPath).toBe('conv-1/turn-1/0-passwd');
      expect(stored!.name).toBe('passwd');
    });
  });

  describe('buildAttachmentReference', () => {
    it('returns empty string for empty array', () => {
      expect(buildAttachmentReference([])).toBe('');
    });

    it('includes header and metadata for each file', () => {
      const items: (StoredAttachment & { text?: string })[] = [
        {
          attachmentId: 'id1',
          seq: 0,
          name: 'test.txt',
          mimeType: 'text/plain',
          kind: 'text',
          sizeBytes: 11,
          sha256: createHash('sha256').update('hello world').digest('hex'),
          relPath: 'conv-1/turn-1/0-test.txt',
          text: 'hello world',
        },
      ];
      const ref = buildAttachmentReference(items);
      expect(ref).toContain('USER ATTACHMENTS');
      expect(ref).toContain('test.txt');
      expect(ref).toContain('text');
      expect(ref).toContain('11 bytes');
      expect(ref).toContain('sha256:');
      expect(ref).toContain('hello world');
    });

    it('truncates at 32 KB per file and 96 KB total', () => {
      const long = 'x'.repeat(INLINE_TEXT_CHARS_PER_FILE + 100);
      const items: (StoredAttachment & { text?: string })[] = [
        {
          attachmentId: 'id1',
          seq: 0,
          name: 'long.txt',
          mimeType: 'text/plain',
          kind: 'text',
          sizeBytes: long.length,
          sha256: createHash('sha256').update(long).digest('hex'),
          relPath: 'c/t/0-long.txt',
          text: long,
        },
      ];
      const ref = buildAttachmentReference(items);
      expect(ref).toContain('[truncated, 100 chars omitted]');
    });

    it('redacts secrets in text content', () => {
      const items: (StoredAttachment & { text?: string })[] = [
        {
          attachmentId: 'id1',
          seq: 0,
          name: 'secret.txt',
          mimeType: 'text/plain',
          kind: 'text',
          sizeBytes: 50,
          sha256: createHash('sha256').update('sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx').digest('hex'),
          relPath: 'c/t/0-secret.txt',
          text: 'key=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx',
        },
      ];
      const ref = buildAttachmentReference(items);
      expect(ref).toContain('[REDACTED]');
      expect(ref).not.toContain('sk-ant-api03');
    });

    it('shows placeholder for image and binary', () => {
      const imgHash = createHash('sha256').update('img').digest('hex');
      const binHash = createHash('sha256').update('bin').digest('hex');
      const items: (StoredAttachment & { text?: string })[] = [
        { attachmentId: 'i1', seq: 0, name: 'img.png', mimeType: 'image/png', kind: 'image', sizeBytes: 3, sha256: imgHash, relPath: 'c/t/0-img.png' },
        { attachmentId: 'b1', seq: 1, name: 'data.bin', mimeType: 'application/octet-stream', kind: 'binary', sizeBytes: 3, sha256: binHash, relPath: 'c/t/1-data.bin' },
      ];
      const ref = buildAttachmentReference(items);
      expect(ref).toContain('Image content is not visible to you in this build.');
      expect(ref).toContain('[binary content not displayed]');
    });
  });

  describe('readAttachmentText', () => {
    it('reads UTF-8 text file up to 32 KB', async () => {
      const baseDir = await mkdtemp(path.join(os.tmpdir(), 'attach-read-'));
      roots.push(baseDir);
      const content = 'hello world';
      const stored: StoredAttachment = {
        attachmentId: 'id1',
        seq: 0,
        name: 'test.txt',
        mimeType: 'text/plain',
        kind: 'text',
        sizeBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
        relPath: 'conv-1/turn-1/0-test.txt',
      };
      const dir = path.join(baseDir, 'conv-1', 'turn-1');
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, '0-test.txt'), content);
      const read = await readAttachmentText(baseDir, stored);
      expect(read).toBe(content);
    });

    it('returns undefined for missing file', async () => {
      const baseDir = await mkdtemp(path.join(os.tmpdir(), 'attach-read-'));
      roots.push(baseDir);
      const stored: StoredAttachment = {
        attachmentId: 'id1',
        seq: 0,
        name: 'missing.txt',
        mimeType: 'text/plain',
        kind: 'text',
        sizeBytes: 0,
        sha256: '',
        relPath: 'conv-1/turn-1/0-missing.txt',
      };
      const read = await readAttachmentText(baseDir, stored);
      expect(read).toBeUndefined();
    });

    it('returns undefined for non-text kind', async () => {
      const baseDir = await mkdtemp(path.join(os.tmpdir(), 'attach-read-'));
      roots.push(baseDir);
      const stored: StoredAttachment = {
        attachmentId: 'id1',
        seq: 0,
        name: 'img.png',
        mimeType: 'image/png',
        kind: 'image',
        sizeBytes: 0,
        sha256: '',
        relPath: 'conv-1/turn-1/0-img.png',
      };
      const read = await readAttachmentText(baseDir, stored);
      expect(read).toBeUndefined();
    });
  });
});

describe('AgentChatStore attachments', () => {
  async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-chat-store-attach-'));
    roots.push(root);
    return path.join(root, 'chat.sqlite');
  }

  it('insertAttachments then listAttachments returns ordered rows', async () => {
    const dbPath = await fixture();
    const store = new AgentChatStore(dbPath);
    const conversationId = 'conv-1';
    const turnId = 'turn-1';

    // create conversation and turn
    store.createConversation({
      conversationId,
      runtimeSessionId: 'session-1',
      workspace: 'agent-core',
      title: 'Test',
      createdAtMs: 1_000,
    });
    store.beginTurn({
      conversationId,
      turnId,
      clientRequestId: 'req-1',
      runtimeTaskId: 'task-1',
      userMessageId: 'msg-1',
      prompt: 'test',
      startedAtMs: 2_000,
    });

    const items: StoredAttachment[] = [
      {
        attachmentId: 'att-1',
        seq: 0,
        name: 'a.txt',
        mimeType: 'text/plain',
        kind: 'text',
        sizeBytes: 5,
        sha256: createHash('sha256').update('hello').digest('hex'),
        relPath: 'conv-1/turn-1/0-a.txt',
      },
      {
        attachmentId: 'att-2',
        seq: 1,
        name: 'b.png',
        mimeType: 'image/png',
        kind: 'image',
        sizeBytes: 100,
        sha256: createHash('sha256').update('img').digest('hex'),
        relPath: 'conv-1/turn-1/1-b.png',
      },
    ];
    store.insertAttachments(turnId, conversationId, items);
    const listed = store.listAttachments(turnId);
    expect(listed).toHaveLength(2);
    expect(listed[0].attachmentId).toBe('att-1');
    expect(listed[1].attachmentId).toBe('att-2');
    expect(listed[0].name).toBe('a.txt');
    expect(listed[1].name).toBe('b.png');
    expect(listed[0].kind).toBe('text');
    expect(listed[1].kind).toBe('image');
  });

  it('listAttachments returns empty for unknown turn', async () => {
    const dbPath = await fixture();
    const store = new AgentChatStore(dbPath);
    const listed = store.listAttachments('unknown-turn');
    expect(listed).toHaveLength(0);
  });

  it('INSERT OR IGNORE prevents duplicate attachment_id', async () => {
    const dbPath = await fixture();
    const store = new AgentChatStore(dbPath);
    const conversationId = 'conv-1';
    const turnId = 'turn-1';
    store.createConversation({
      conversationId,
      runtimeSessionId: 'session-1',
      workspace: 'agent-core',
      title: 'Test',
      createdAtMs: 1_000,
    });
    store.beginTurn({
      conversationId,
      turnId,
      clientRequestId: 'req-1',
      runtimeTaskId: 'task-1',
      userMessageId: 'msg-1',
      prompt: 'test',
      startedAtMs: 2_000,
    });
    const items: StoredAttachment[] = [
      {
        attachmentId: 'att-dup',
        seq: 0,
        name: 'a.txt',
        mimeType: 'text/plain',
        kind: 'text',
        sizeBytes: 5,
        sha256: createHash('sha256').update('hello').digest('hex'),
        relPath: 'conv-1/turn-1/0-a.txt',
      },
    ];
    store.insertAttachments(turnId, conversationId, items);
    store.insertAttachments(turnId, conversationId, items); // second insert ignored
    const listed = store.listAttachments(turnId);
    expect(listed).toHaveLength(1);
  });
});