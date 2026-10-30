import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateAttachmentInputs } from '../src/agent-chat-attachments.js';
import { AgentChatService } from '../src/agent-chat-service.js';
import { AgentChatStore } from '../src/agent-chat-store.js';
import { AGENT_TURN_ITERATION_WINDOW_FULL } from '../src/agent-turn-checkpoint.js';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';

const NOTE = 'Release checklist for the quokka migration. Confirm the lemon marker before shipping.';
const BLOB = Buffer.from([0x00, 0x01, 0x02, 0xff]);
const PROMPT = 'Review the attached release note.';
const UI_TOKEN = 'fixture-ui-token';

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function file(name: string, content: string | Buffer, mimeType?: string) {
  return { name, ...(mimeType ? { mimeType } : {}), dataBase64: Buffer.from(content).toString('base64') };
}

async function routeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-chat-attachments-route-'));
  roots.push(root);
  const runTurn = vi.fn(async (_input: any) => ({
    conversationId: 'conversation-1', turnId: 'turn-1', taskId: 'task-1', status: 'finalized',
    response: 'ok', iterations: 1, retrievalAttemptIds: [], replayed: false,
  }));
  const agentChat = { runTurn, listProviders: vi.fn(() => []), validateProviderModel: vi.fn(), validateReasoningEffort: vi.fn() };
  const server = createServer(createHttpHandler({
    keyStore: new FileKeyStore(path.join(root, 'auth')),
    security: new HttpSecurityPolicy({ publicBaseUrl: null, protectedResourceUrl: null, trustProxy: true, allowedOrigins: [] }),
    agentUiToken: UI_TOKEN,
    agentChat: agentChat as any,
    mcpHandler: async (_request, response) => { response.writeHead(200); response.end('{}'); },
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = (body: object, headers: Record<string, string> = {}) => fetch(`${baseUrl}/agent/chat/conversations/conversation-1/turns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agent-core-ui-token': UI_TOKEN, ...headers },
    body: JSON.stringify({ clientRequestId: 'att-route', prompt: 'See the attachment.', ...body }),
  });
  return { runTurn, send };
}

describe('POST /agent/chat/conversations/:id/turns attachments', () => {
  it('refuses attachments from an external controller and never runs the turn', async () => {
    const { runTurn, send } = await routeFixture();
    const external = { 'x-agent-core-chat-origin': 'external-controller' };
    const refused = await send({ attachments: [file('note.txt', NOTE, 'text/plain')] }, external);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'attachments_not_allowed_for_external_controller' });
    expect(runTurn).not.toHaveBeenCalled();

    // The same controller still reaches the route when it sends no attachments.
    const plain = await send({}, external);
    expect(plain.status).toBe(200);
    await plain.text();
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(runTurn.mock.calls[0]![0]).toMatchObject({ messageOrigin: 'external-controller' });
    expect(runTurn.mock.calls[0]![0]).not.toHaveProperty('attachments');
  });

  it('refuses invalid attachments with 400 invalid_agent_chat_attachments and never runs the turn', async () => {
    const { runTurn, send } = await routeFixture();
    const good = file('note.txt', NOTE, 'text/plain');
    const invalid: unknown[] = [
      [],
      'not-an-array',
      null,
      [{ name: 'a.txt', dataBase64: '***not base64***' }],
      [{ dataBase64: good.dataBase64 }],
      [{ name: '   ', dataBase64: good.dataBase64 }],
      Array.from({ length: 9 }, () => good),
    ];
    for (const attachments of invalid) {
      const response = await send({ attachments });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_agent_chat_attachments' });
    }
    expect(runTurn).not.toHaveBeenCalled();
  });

  it('forwards the validated copy, with sanitized names, from a body above the default read limit', async () => {
    const { runTurn, send } = await routeFixture();
    // 300 000 bytes encode to about 400 KB, past the 256 KiB default that every other route keeps.
    const big = Buffer.alloc(300_000, 97);
    const response = await send({ attachments: [file('../escape/big.txt', big, 'text/plain')] });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"type":"result"');
    const forwarded = runTurn.mock.calls[0]![0].attachments;
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0].name).toBe('big.txt');
    expect(Buffer.from(forwarded[0].dataBase64, 'base64').length).toBe(300_000);
    expect(runTurn.mock.calls[0]![0]).not.toHaveProperty('messageOrigin');
  });
});

/** The checkpoint a parked Native turn leaves behind; the smallest state the service accepts for a resume. */
function checkpointOf(input: any) {
  const now = Date.now();
  return {
    schemaVersion: 1 as const,
    conversationId: input.continuation.conversationId,
    turnId: input.continuation.turnId,
    runtimeTaskId: input.taskId,
    runtimeSessionId: input.sessionId,
    prompt: input.prompt,
    workspace: input.workspace,
    messages: [],
    nextIteration: 1, maxIterations: 24, providerAttemptsConsumed: 0, maxProviderAttempts: 8,
    approvedCapabilities: [], historicalGrantedTools: [], toolContractDigest: 'sha256:' + '0'.repeat(64),
    hasStrategy: false, needsStrategy: false, lastStrategyText: '', currentStrategySummary: '',
    failedFingerprints: [], memoryEvidence: [], artifactRefs: [],
    createdAtMs: now, updatedAtMs: now, expiresAtMs: now + 60_000,
  };
}

async function chatFixture(options: { parkFirstRun?: boolean } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-chat-attachments-wiring-'));
  roots.push(root);
  await mkdir(path.join(root, 'runtime', 'agent-runtime'), { recursive: true });
  const store = new AgentChatStore(path.join(root, 'runtime', 'agent-runtime', 'chat.sqlite'));
  store.createConversation({ conversationId: 'chat', runtimeSessionId: 'session', workspace: 'fixture', title: 'Attachment fixture' });
  const runtime = { ensureActiveSession: vi.fn(), setProviderAffinity: vi.fn(),
    getTask: vi.fn(async () => ({ id: 'fixture-task', status: 'running' })),
    markTerminal: vi.fn(async () => undefined), finalizeTask: vi.fn(async () => undefined) };
  let runs = 0;
  const controller = { runConversationTurn: vi.fn(async (input: any) => {
    runs += 1;
    if (options.parkFirstRun && runs === 1) {
      // A goal-mode window ending: the checkpoint is saved and the turn parks as resumable.
      await input.continuation.save(checkpointOf(input), 'model-ready');
      throw new Error(AGENT_TURN_ITERATION_WINDOW_FULL);
    }
    return { sessionId: input.sessionId, taskId: input.taskId, response: 'ok', status: 'finalized',
      iterations: 1, retrievalAttemptIds: [] };
  }) };
  const chat = new (AgentChatService as any)(store, runtime, controller, root) as AgentChatService;
  return { store, controller, chat, attachmentsDir: path.join(root, 'runtime', 'agent-runtime', 'attachments') };
}

type ChatFixture = Awaited<ReturnType<typeof chatFixture>>;

async function sendWithFiles(f: ChatFixture, clientRequestId = 'att-turn-1') {
  const result = await f.chat.runTurn({
    conversationId: 'chat',
    clientRequestId,
    prompt: PROMPT,
    attachments: validateAttachmentInputs([file('note.txt', NOTE, 'text/plain'), file('blob.bin', BLOB)]),
  });
  return {
    turnId: result.turnId,
    status: result.status,
    relNote: `chat/${result.turnId}/0-note.txt`,
    relBlob: `chat/${result.turnId}/1-blob.bin`,
  };
}

describe('AgentChatService attachments', () => {
  it('stores the files, gives the model one reference block, and keeps their content out of the stored history', async () => {
    const f = await chatFixture();
    const sent = await sendWithFiles(f);
    expect(sent.status).toBe('finalized');

    expect(f.store.listAttachments(sent.turnId)).toMatchObject([
      { seq: 0, name: 'note.txt', mimeType: 'text/plain', kind: 'text', sizeBytes: Buffer.byteLength(NOTE), relPath: sent.relNote },
      { seq: 1, name: 'blob.bin', mimeType: 'application/octet-stream', kind: 'binary', sizeBytes: BLOB.length, relPath: sent.relBlob },
    ]);
    const dir = path.join(f.attachmentsDir, 'chat', sent.turnId);
    expect((await readdir(dir)).sort()).toEqual(['0-note.txt', '1-blob.bin']);
    expect(await readFile(path.join(dir, '0-note.txt'), 'utf8')).toBe(NOTE);
    expect(Buffer.compare(await readFile(path.join(dir, '1-blob.bin')), BLOB)).toBe(0);

    const input = f.controller.runConversationTurn.mock.calls[0]![0];
    expect(input.prompt).toBe(PROMPT);
    expect(input.attachmentReference).toContain('USER ATTACHMENTS');
    expect(input.attachmentReference).toContain(NOTE);
    expect(input.attachmentReference).toContain('blob.bin (binary, 4 bytes');
    expect(JSON.stringify(f.store.detail('chat')!.messages)).not.toContain(NOTE);

    // The same client request again replays the turn: nothing is stored twice and the model does not run again.
    const replay = await f.chat.runTurn({
      conversationId: 'chat', clientRequestId: 'att-turn-1', prompt: PROMPT,
      attachments: validateAttachmentInputs([file('note.txt', NOTE, 'text/plain')]),
    });
    expect(replay).toMatchObject({ replayed: true, turnId: sent.turnId });
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
    expect(f.store.listAttachments(sent.turnId)).toHaveLength(2);
    expect((await readdir(dir)).sort()).toEqual(['0-note.txt', '1-blob.bin']);
  });

  it('shows a later turn one history line per file, with the path to reopen it, and never the content', async () => {
    const f = await chatFixture();
    const sent = await sendWithFiles(f);
    await f.chat.runTurn({ conversationId: 'chat', clientRequestId: 'att-turn-2', prompt: 'What did the note say?' });

    const later = f.controller.runConversationTurn.mock.calls[1]![0];
    expect(later).not.toHaveProperty('attachmentReference');
    const users = later.history.filter((message: any) => message.role === 'user');
    expect(users).toHaveLength(1);
    const lines = (users[0].content as string).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(PROMPT);
    expect(lines[1]!.startsWith(`[lampiran: note.txt (text, ${Buffer.byteLength(NOTE)} bytes) path: `)).toBe(true);
    expect(lines[1]!.endsWith(`${sent.relNote}]`)).toBe(true);
    expect(lines[2]!.startsWith(`[lampiran: blob.bin (binary, ${BLOB.length} bytes) path: `)).toBe(true);
    expect(lines[2]!.endsWith(`${sent.relBlob}]`)).toBe(true);
    // The path in the line is the stored file itself.
    const notePath = /path: (.+)\]$/.exec(lines[1]!)![1]!;
    expect(await readFile(notePath, 'utf8')).toBe(NOTE);
    expect(JSON.stringify(later.history)).not.toContain(NOTE);
  });

  it('returns attachment metadata, without content, on the turn that carried the files', async () => {
    const f = await chatFixture();
    const sent = await sendWithFiles(f);
    await f.chat.runTurn({ conversationId: 'chat', clientRequestId: 'att-turn-2', prompt: 'What did the note say?' });

    const detail = f.chat.getConversation('chat')!;
    const withFiles = detail.turns.find(turn => turn.id === sent.turnId)!;
    const without = detail.turns.find(turn => turn.id !== sent.turnId)!;
    expect(withFiles.attachments).toEqual([
      { attachmentId: expect.any(String), name: 'note.txt', mimeType: 'text/plain', kind: 'text', sizeBytes: Buffer.byteLength(NOTE), relPath: sent.relNote },
      { attachmentId: expect.any(String), name: 'blob.bin', mimeType: 'application/octet-stream', kind: 'binary', sizeBytes: BLOB.length, relPath: sent.relBlob },
    ]);
    expect(without).not.toHaveProperty('attachments');
    expect(JSON.stringify(detail)).not.toContain(NOTE);
  });

  it('rebuilds the reference block from the store when a parked turn resumes', async () => {
    const f = await chatFixture({ parkFirstRun: true });
    const sent = await sendWithFiles(f, 'att-resume');
    expect(sent.status).toBe('resumable');
    const firstBlock = f.controller.runConversationTurn.mock.calls[0]![0].attachmentReference as string;
    expect(firstBlock).toContain(NOTE);

    const listed = vi.spyOn(f.store, 'listAttachments');
    const resumed = await f.chat.resumeTurn({ turnId: sent.turnId });
    expect(resumed.status).toBe('finalized');
    expect(listed).toHaveBeenCalledWith(sent.turnId);

    const second = f.controller.runConversationTurn.mock.calls[1]![0];
    expect(second.taskId).toBe(f.controller.runConversationTurn.mock.calls[0]![0].taskId);
    expect(second.prompt).toBe(PROMPT);
    expect(second.attachmentReference).toBe(firstBlock);
    // Resuming reads the stored files; it never stores them again.
    expect(f.store.listAttachments(sent.turnId)).toHaveLength(2);
    expect((await readdir(path.join(f.attachmentsDir, 'chat', sent.turnId))).sort()).toEqual(['0-note.txt', '1-blob.bin']);
  });

  it('refuses attachments from an external controller before any turn exists', async () => {
    const f = await chatFixture();
    await expect(f.chat.runTurn({
      conversationId: 'chat', clientRequestId: 'att-external', prompt: PROMPT, messageOrigin: 'external-controller',
      attachments: validateAttachmentInputs([file('note.txt', NOTE, 'text/plain')]),
    })).rejects.toThrow('AGENT_CHAT_ATTACHMENTS_NOT_ALLOWED');
    expect(f.store.detail('chat')!.turns).toHaveLength(0);
    expect(f.controller.runConversationTurn).not.toHaveBeenCalled();
  });
});
