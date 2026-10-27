import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentChatStore } from '../src/agent-chat-store.js';
import { AgentChatService } from '../src/agent-chat-service.js';
import { NativeAgentController } from '../src/agent-controller.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import { AgentRuntimeToolSession } from '../src/agent-tool-session.js';
import { McpMutationSafety } from '../src/mcp/mutation-safety.js';
import {
  normalizeAgentTurnCheckpoint,
  parseAgentTurnCheckpoint,
  serializeAgentTurnCheckpoint,
  verifyCheckpointArtifacts,
  type AgentTurnCheckpointState,
} from '../src/agent-turn-checkpoint.js';
import {
  OpenAICompatibleProviderPool,
  type AgentModelMessage,
  type AgentProviderConfig,
} from '../src/agent-provider.js';
import { resultArtifactIntegrity } from '../src/security/verified-result-artifact.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});
async function rootFixture(prefix = 'dtc1-') {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function sha(value: string) {
  return 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex');
}

function checkpoint(input: Partial<AgentTurnCheckpointState> = {}): AgentTurnCheckpointState {
  const now = Date.now();
  return normalizeAgentTurnCheckpoint({
    schemaVersion: 1,
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    runtimeTaskId: 'task-1',
    runtimeSessionId: 'session-1',
    prompt: 'continue fixture',
    workspace: 'fixture',
    messages: [
      { role: 'system', content: 'fixture system' },
      { role: 'user', content: 'continue fixture' },
    ],
    nextIteration: 1,
    maxIterations: 6,
    providerAttemptsConsumed: 1,
    maxProviderAttempts: 8,
    approvedCapabilities: [],
    historicalGrantedTools: ['get_config'],
    toolContractDigest: sha('fixture-contract'),
    hasStrategy: false,
    needsStrategy: false,
    lastStrategyText: '',
    currentStrategySummary: '',
    failedFingerprints: [],
    memoryEvidence: [],
    artifactRefs: [],
    createdAtMs: now,
    updatedAtMs: now,
    expiresAtMs: now + 60_000,
    ...input,
  });
}

function seedRunning(
  store: AgentChatStore,
  state: AgentTurnCheckpointState = checkpoint(),
) {
  store.createConversation({
    conversationId: state.conversationId,
    runtimeSessionId: state.runtimeSessionId,
    workspace: state.workspace ?? 'fixture',
    title: 'Fixture',
  });
  const begun = store.beginTurn({
    conversationId: state.conversationId,
    turnId: state.turnId,
    clientRequestId: 'request-1',
    runtimeTaskId: state.runtimeTaskId,
    userMessageId: 'message-1',
    prompt: state.prompt,
    executorToken: 'executor-1',
  });
  if (!begun.claim) throw new Error('missing claim');
  const serialized = serializeAgentTurnCheckpoint(state);
  const saved = store.saveCheckpoint({
    turnId: state.turnId,
    claim: begun.claim,
    expectedRevision: 0,
    schemaVersion: 1,
    phase: 'model-ready',
    payloadJson: serialized.json,
    payloadDigest: serialized.digest,
  });
  return { claim: begun.claim, saved };
}

describe('DTC-1 durable turn continuation store', () => {
  it('recovers checkpointed running turns as resumable with the same identity', async () => {
    const root = await rootFixture();
    const dbPath = path.join(root, 'chat.sqlite');
    const store = new AgentChatStore(dbPath);
    seedRunning(store);

    const reopened = new AgentChatStore(dbPath);
    const recovered = reopened.recoverRunningTurns();
    expect(recovered.interrupted).toEqual([]);
    expect(recovered.resumable).toHaveLength(1);
    expect(recovered.resumable[0]).toEqual(expect.objectContaining({
      id: 'turn-1',
      runtimeTaskId: 'task-1',
      conversationId: 'conversation-1',
      status: 'resumable',
    }));
  });

  it('allows only one resume claim and rejects a stale executor', async () => {
    const root = await rootFixture();
    const store = new AgentChatStore(path.join(root, 'chat.sqlite'));
    const seeded = seedRunning(store);
    store.recoverRunningTurns();
    const record = store.getCheckpoint('turn-1')!;

    const winner = store.claimResumableTurn({
      turnId: 'turn-1',
      expectedRevision: record.revision,
      executorToken: 'executor-2',
    });
    expect(winner.executionEpoch).toBeGreaterThan(seeded.claim.executionEpoch);
    expect(() => store.claimResumableTurn({
      turnId: 'turn-1',
      expectedRevision: record.revision,
      executorToken: 'executor-3',
    })).toThrow('AGENT_CHAT_TURN_NOT_RESUMABLE');
    expect(() => store.saveCheckpoint({
      turnId: 'turn-1',
      claim: seeded.claim,
      expectedRevision: record.revision,
      schemaVersion: 1,
      phase: 'model-ready',
      payloadJson: record.payloadJson,
      payloadDigest: record.payloadDigest,
    })).toThrow('AGENT_CHAT_EXECUTOR_STALE');
  });

  it('persists cancellation so a resumable turn cannot later be claimed', async () => {
    const root = await rootFixture();
    const store = new AgentChatStore(path.join(root, 'chat.sqlite'));
    seedRunning(store);
    store.recoverRunningTurns();
    const record = store.getCheckpoint('turn-1')!;
    expect(store.cancelTurn('turn-1')?.status).toBe('stopped');
    expect(() => store.claimResumableTurn({
      turnId: 'turn-1',
      expectedRevision: record.revision,
      executorToken: 'executor-2',
    })).toThrow('AGENT_CHAT_TURN_NOT_RESUMABLE');
  });

  it('reconstructs a durable checkpoint after an abruptly terminated child process', async () => {
    const root = await rootFixture();
    const dbPath = path.join(root, 'chat.sqlite');
    const distUrl = pathToFileURL(path.resolve('dist/agent-chat-store.js')).href;
    const script = [
      "import { createHash } from 'node:crypto';",
      "import { AgentChatStore } from " + JSON.stringify(distUrl) + ";",
      "const store = new AgentChatStore(process.argv[1]);",
      "store.createConversation({conversationId:'conversation-1',runtimeSessionId:'session-1',workspace:'fixture',title:'Fixture'});",
      "const begun=store.beginTurn({conversationId:'conversation-1',turnId:'turn-1',clientRequestId:'request-1',runtimeTaskId:'task-1',userMessageId:'message-1',prompt:'continue fixture',executorToken:'executor-1'});",
      "const payload=JSON.stringify({crashBoundary:'after-checkpoint-write'});",
      "const digest='sha256:'+createHash('sha256').update(payload,'utf8').digest('hex');",
      "store.saveCheckpoint({turnId:'turn-1',claim:begun.claim,expectedRevision:0,schemaVersion:1,phase:'model-ready',payloadJson:payload,payloadDigest:digest});",
      "process.exit(23);",
    ].join('\n');
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, dbPath], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 15_000,
    });
    expect(child.status).toBe(23);
    const reopened = new AgentChatStore(dbPath);
    const recovered = reopened.recoverRunningTurns();
    expect(recovered.interrupted).toEqual([]);
    expect(recovered.resumable[0]).toEqual(expect.objectContaining({
      id: 'turn-1', runtimeTaskId: 'task-1', status: 'resumable',
    }));
  });
});

describe('DTC-1 checkpoint integrity and artifacts', () => {
  it('redacts credential-shaped text and rejects tampering or exhausted budgets', () => {
    const serialized = serializeAgentTurnCheckpoint(checkpoint({
      prompt: 'api_key=super-secret-value',
      messages: [{ role: 'user', content: 'Bearer top-secret-token' }],
    }));
    expect(serialized.json).not.toContain('super-secret-value');
    expect(serialized.json).not.toContain('top-secret-token');
    expect(serialized.json).toContain('[REDACTED]');
    expect(() => parseAgentTurnCheckpoint(
      serialized.json.replace('"workspace":"fixture"', '"workspace":"tampered"'),
      serialized.digest,
    )).toThrow('AGENT_CHAT_CHECKPOINT_INTEGRITY_MISMATCH');
    expect(() => normalizeAgentTurnCheckpoint({
      ...checkpoint(),
      providerAttemptsConsumed: 9,
      maxProviderAttempts: 8,
    })).toThrow('AGENT_CHAT_CHECKPOINT_BUDGET_INVALID');
  });

  it('fails closed when a referenced oversized result artifact is corrupted', async () => {
    const root = await rootFixture();
    const toolRoot = path.join(root, 'runtime', 'tool-results');
    await mkdir(toolRoot, { recursive: true });
    const file = path.join(toolRoot, 'fixture.json');
    const original = Buffer.from(JSON.stringify({ value: 'stable' }), 'utf8');
    const integrity = resultArtifactIntegrity(original);
    await writeFile(file, original);
    const state = checkpoint({
      artifactRefs: [{
        path: file,
        digest: integrity.digest,
        storedBytes: integrity.storedBytes,
      }],
    });
    await expect(verifyCheckpointArtifacts(state, toolRoot)).resolves.toBeUndefined();
    await writeFile(file, Buffer.from(JSON.stringify({ value: 'broken' }), 'utf8'));
    await expect(verifyCheckpointArtifacts(state, toolRoot))
      .rejects.toThrow(/RESULT_ARTIFACT_(SIZE_MISMATCH|INTEGRITY_MISMATCH)/);
  });

  it('rejects unsupported checkpoint schema versions without reconstructing state', () => {
    const raw = checkpoint() as any;
    raw.schemaVersion = 999;
    expect(() => normalizeAgentTurnCheckpoint(raw))
      .toThrow('AGENT_CHAT_CHECKPOINT_SCHEMA_UNSUPPORTED');
  });
});

function providerConfig(routes: AgentProviderConfig['providers']): AgentProviderConfig {
  return {
    enabled: true,
    baseUrl: null,
    model: null,
    apiKey: null,
    requestTimeoutMs: 2_000,
    maxToolIterations: 6,
    providers: routes,
    providerOrder: routes?.map(route => route.id) ?? [],
    maxProviderAttempts: 4,
  };
}

function okProviderResponse(model = 'fixture-model') {
  return new Response(JSON.stringify({
    choices: [{
      message: { content: 'ok' },
      finish_reason: 'stop',
    }],
    model,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function qualifiedFixtureFetch(handler: (url: unknown, init?: RequestInit) => Promise<Response>, model = 'fixture-model') {
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: model,
      context_length: 128_000, max_output_tokens: 8_192, supported_parameters: ['tools'] }] }));
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (body.tools?.[0]?.function?.name === 'agent_core_model_probe') return new Response(JSON.stringify({ choices: [{
      message: { content: null, tool_calls: [{ id: 'probe', type: 'function', function: {
        name: 'agent_core_model_probe', arguments: JSON.stringify({ nonce: body.tools[0].function.parameters.properties.nonce.enum[0] }),
      } }] }, finish_reason: 'tool_calls',
    }] }));
    return handler(url, init);
  }));
}

describe('DTC-1 continuation provider compatibility', () => {
  it('pauses before task inference when no compatible model can be qualified', async () => {
    const root = await rootFixture('dtc1-provider-');
    const pool = new OpenAICompatibleProviderPool(providerConfig([{
      id: 'provider-b',
      baseUrl: 'http://127.0.0.1:65530/v1',
      model: 'fixture-model',
      continuation: {
        supportsTools: false,
        modalities: ['text'],
        contextWindowTokens: 128_000,
        maxOutputTokens: 8_192,
        toolCallFormat: 'openai-chat-tool-calls-v1',
      },
      credentials: [{ id: 'b:1', secret: 'fixture-secret', ordinal: 1 }],
    }]), path.join(root, 'provider-state.json'));
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'fixture-model',
      context_length: 128_000, supports_tools: false }] })));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(pool.complete(
      [{ role: 'user', content: 'continue' }],
      [],
      'session-1',
      undefined,
      {
        continuation: {
          sourceProviderId: 'provider-a',
          model: 'fixture-model',
          minContextTokens: 32_000,
          minOutputTokens: 4_096,
          toolCallFormat: 'openai-chat-tool-calls-v1',
        },
      },
    )).rejects.toThrow('AGENT_RUNTIME_CONTINUATION_PROVIDER_WAIT');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/models');
  });

  it('allows a different model only after its compatible tool and context contract is qualified', async () => {
    const root = await rootFixture('dtc1-provider-model-');
    const pool = new OpenAICompatibleProviderPool(providerConfig([{
      id: 'provider-b',
      baseUrl: 'http://127.0.0.1:65530/v1',
      model: 'different-model',
      continuation: {
        supportsTools: true,
        modalities: ['text'],
        contextWindowTokens: 128_000,
        maxOutputTokens: 8_192,
        toolCallFormat: 'openai-chat-tool-calls-v1',
      },
      credentials: [{ id: 'b:1', secret: 'fixture-secret', ordinal: 1 }],
    }]), path.join(root, 'provider-state.json'));
    const fetchSpy = vi.fn(async () => okProviderResponse('different-model'));
    qualifiedFixtureFetch(fetchSpy, 'different-model');

    await expect(pool.complete(
      [{ role: 'user', content: 'continue' }],
      [],
      'session-1',
      undefined,
      {
        continuation: {
          sourceProviderId: 'provider-a',
          model: 'fixture-model',
          minContextTokens: 32_000,
          minOutputTokens: 4_096,
          toolCallFormat: 'openai-chat-tool-calls-v1',
        },
      },
    )).resolves.toMatchObject({ providerId: 'provider-b', model: 'different-model' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('allows a compatible same-model cross-provider route and charges one attempt', async () => {
    const root = await rootFixture('dtc1-provider-compatible-');
    const pool = new OpenAICompatibleProviderPool(providerConfig([{
      id: 'provider-b',
      baseUrl: 'http://127.0.0.1:65530/v1',
      model: 'fixture-model',
      continuation: {
        supportsTools: true,
        modalities: ['text'],
        contextWindowTokens: 128_000,
        maxOutputTokens: 8_192,
        toolCallFormat: 'openai-chat-tool-calls-v1',
      },
      credentials: [{ id: 'b:1', secret: 'fixture-secret', ordinal: 1 }],
    }]), path.join(root, 'provider-state.json'));
    const fetchSpy = vi.fn(async () => okProviderResponse());
    qualifiedFixtureFetch(fetchSpy);
    const attempts: number[] = [];

    const result = await pool.complete(
      [{ role: 'user', content: 'continue' }],
      [],
      'session-1',
      undefined,
      {
        continuation: {
          sourceProviderId: 'provider-a',
          model: 'fixture-model',
          minContextTokens: 32_000,
          minOutputTokens: 4_096,
          toolCallFormat: 'openai-chat-tool-calls-v1',
        },
        attemptLimit: 1,
        onAttempt: item => { attempts.push(item.attempt); },
      },
    );
    expect(result.providerId).toBe('provider-b');
    expect(result.model).toBe('fixture-model');
    expect(attempts).toEqual([1]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});


describe('DTC-A1/A2 persistent schema and canonical checkpoint state', () => {
  it('DTC-A1 migrates a schema-v1 chat DB without resetting existing records', async () => {
    const root = await rootFixture('dtc1-migration-');
    const dbPath = path.join(root, 'chat.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE chat_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO chat_meta(key,value) VALUES ('schema_version','1');
      CREATE TABLE chat_conversations (
        conversation_id TEXT PRIMARY KEY, runtime_session_id TEXT NOT NULL UNIQUE,
        workspace TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
        preferred_provider_id TEXT, preferred_model TEXT,
        created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, last_turn_id TEXT
      );
      CREATE TABLE chat_turns (
        turn_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
        client_request_id TEXT NOT NULL UNIQUE, runtime_task_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL, provider_id TEXT, model TEXT, iterations INTEGER,
        retrieval_count INTEGER, error_code TEXT, created_at_ms INTEGER NOT NULL,
        started_at_ms INTEGER NOT NULL, completed_at_ms INTEGER
      );
      CREATE TABLE chat_messages (
        message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_id TEXT NOT NULL,
        role TEXT NOT NULL, content TEXT NOT NULL, created_at_ms INTEGER NOT NULL
      );
      INSERT INTO chat_conversations VALUES
        ('conversation-1','session-1','fixture','Legacy','active',NULL,NULL,1,1,'turn-1');
      INSERT INTO chat_turns VALUES
        ('turn-1','conversation-1','request-1','task-1','finalized',NULL,NULL,1,0,NULL,1,1,2);
      INSERT INTO chat_messages VALUES
        ('message-1','conversation-1','turn-1','user','legacy prompt',1);
    `);
    db.close();

    const store = new AgentChatStore(dbPath);
    const detail = store.detail('conversation-1');
    expect(detail?.turns[0]?.id).toBe('turn-1');
    expect(detail?.messages[0]?.content).toBe('legacy prompt');
    const reopened = new DatabaseSync(dbPath);
    const version = reopened.prepare(
      "SELECT value FROM chat_meta WHERE key='schema_version'",
    ).get() as { value: string };
    const checkpointTable = reopened.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chat_turn_checkpoints'",
    ).get();
    reopened.close();
    expect(version.value).toBe('2');
    expect(checkpointTable).toBeTruthy();
  });

  it('DTC-A2 round-trips bounded model-visible tool pairing and evidence exactly', () => {
    const state = checkpoint({
      messages: [
        { role: 'user', content: 'inspect fixture' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'get_config', arguments: '{}' },
          }],
        },
        {
          role: 'tool',
          content: '{"status":"ok"}',
          tool_call_id: 'call-1',
          name: 'get_config',
        },
      ],
      failedFingerprints: [sha('strategy-1')],
      memoryEvidence: [{
        memoryId: 'memory-1',
        retrievalAttemptId: 'attempt-1',
        contentDigest: sha('memory-body'),
      }],
    });
    const serialized = serializeAgentTurnCheckpoint(state);
    const restored = parseAgentTurnCheckpoint(serialized.json, serialized.digest);
    expect(restored.messages).toEqual(state.messages);
    expect(restored.failedFingerprints).toEqual(state.failedFingerprints);
    expect(restored.memoryEvidence).toEqual(state.memoryEvidence);
    expect(restored.runtimeTaskId).toBe(state.runtimeTaskId);
    expect(restored.runtimeSessionId).toBe(state.runtimeSessionId);
  });
});

describe('DTC-A3 provider key rotation preserves one continuation context', () => {
  it('rotates from a 429 credential to the next key without changing messages', async () => {
    const root = await rootFixture('dtc1-key-rotation-');
    const config = providerConfig([{
      id: 'provider-a',
      baseUrl: 'http://127.0.0.1:65530/v1',
      model: 'fixture-model',
      credentials: [
        { id: 'a:1', secret: 'secret-one', ordinal: 1 },
        { id: 'a:2', secret: 'secret-two', ordinal: 2 },
      ],
    }]);
    const pool = new OpenAICompatibleProviderPool(
      config,
      path.join(root, 'provider-state.json'),
    );
    const bodies: string[] = [];
    const authorizations: string[] = [];
    const fetchSpy = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ''));
      authorizations.push(String((init?.headers as any)?.authorization ?? ''));
      if (authorizations.length === 1) {
        return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '1' },
        });
      }
      return okProviderResponse();
    });
    qualifiedFixtureFetch(fetchSpy);

    const messages = [{ role: 'user' as const, content: 'same context' }];
    const result = await pool.complete(messages, [], 'session-1');
    expect(result.providerId).toBe('provider-a');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(authorizations).toEqual(['Bearer secret-one', 'Bearer secret-two']);
    expect(JSON.stringify(bodies)).not.toContain('secret-one');
    expect(JSON.stringify(bodies)).not.toContain('secret-two');
  });
});

describe('DTC-A6/A11 explicit reconstruction and exactly-once chat commit', () => {
  it('DTC-A6 resumes the same task with a durable read-only tool result already in history', async () => {
    const root = await rootFixture('dtc1-readonly-resume-');
    const state = checkpoint({
      messages: [
        { role: 'user', content: 'inspect config' },
        {
          role: 'assistant', content: null,
          tool_calls: [{
            id: 'read-1', type: 'function',
            function: { name: 'get_config', arguments: '{}' },
          }],
        },
        {
          role: 'tool', content: '{"allowedDirectories":[]}',
          tool_call_id: 'read-1', name: 'get_config',
        },
      ],
      nextIteration: 2,
    });
    const store = new AgentChatStore(path.join(root, 'chat.sqlite'));
    seedRunning(store, state);
    expect(store.recoverRunningTurns().resumable).toHaveLength(1);
    const controller = {
      runConversationTurn: vi.fn(async (input: any) => {
        expect(input.taskId).toBe(state.runtimeTaskId);
        expect(input.continuation.state.messages).toEqual(state.messages);
        return {
          sessionId: state.runtimeSessionId,
          taskId: state.runtimeTaskId,
          response: 'continued safely',
          status: 'finalized',
          iterations: 2,
          retrievalAttemptIds: [],
        };
      }),
    };
    const runtime = {
      getTask: vi.fn(async () => ({ id: state.runtimeTaskId, status: 'running' })),
      setProviderAffinity: vi.fn(),
    };
    const service = new (AgentChatService as any)(
      store, runtime, controller, root,
    ) as AgentChatService;
    const result = await service.resumeTurn({ turnId: state.turnId });
    expect(result.taskId).toBe(state.runtimeTaskId);
    expect(result.response).toBe('continued safely');
    expect(controller.runConversationTurn).toHaveBeenCalledTimes(1);
    const detail = store.detail(state.conversationId)!;
    expect(detail.turns[0]?.status).toBe('finalized');
    expect(detail.messages.filter(message => message.role === 'assistant'))
      .toHaveLength(1);
  });

  it('DTC-A11 commits a finalized runtime result once without re-running controller finalization', async () => {
    const root = await rootFixture('dtc1-finalization-resume-');
    const state = checkpoint({
      messages: [
        { role: 'user', content: 'finish fixture' },
        {
          role: 'assistant', content: null,
          tool_calls: [{
            id: 'final-1', type: 'function',
            function: {
              name: 'agent_core_finalize',
              arguments: JSON.stringify({
                outcome: 'verified',
                finalResponse: 'already finalized',
              }),
            },
          }],
        },
      ],
      nextIteration: 2,
    });
    const store = new AgentChatStore(path.join(root, 'chat.sqlite'));
    seedRunning(store, state);
    store.recoverRunningTurns();
    const controller = { runConversationTurn: vi.fn() };
    const runtime = {
      getTask: vi.fn(async () => ({
        id: state.runtimeTaskId,
        status: 'finalized',
        retrievalAttemptIds: [],
      })),
      setProviderAffinity: vi.fn(),
    };
    const service = new (AgentChatService as any)(
      store, runtime, controller, root,
    ) as AgentChatService;

    const result = await service.resumeTurn({ turnId: state.turnId });
    expect(result.response).toBe('already finalized');
    expect(controller.runConversationTurn).not.toHaveBeenCalled();
    await expect(service.resumeTurn({ turnId: state.turnId }))
      .rejects.toThrow('AGENT_CHAT_TURN_NOT_RESUMABLE');
    const detail = store.detail(state.conversationId)!;
    expect(detail.messages.filter(message => message.role === 'assistant'))
      .toHaveLength(1);
  });
});

function invocationContext(id: string) {
  return {
    mcpReq: {
      _meta: { 'io.agentcore/invocation-id': id },
    },
  };
}

function mutationOk(text = 'done') {
  return { content: [{ type: 'text', text }] };
}

describe('DTC-A7/A8/A9 mutation replay boundaries', () => {
  it('DTC-A7 keeps a completed mutating invocation exactly-once across reconstruction', async () => {
    const root = await rootFixture('dtc1-mutation-complete-');
    const journal = path.join(root, 'mutation');
    const first = McpMutationSafety.initialize(journal);
    let operations = 0;
    const execute = async () => {
      operations += 1;
      return mutationOk('external-operation-complete');
    };
    const args = { target: 'fixture' };
    const original = await first.runMutation(
      'native-agent', 'write_file', args, invocationContext('mutation-1'), execute,
    );
    expect(JSON.stringify(original)).toContain('external-operation-complete');
    const reopened = McpMutationSafety.initialize(journal);
    const replay = await reopened.runMutation(
      'native-agent', 'write_file', args, invocationContext('mutation-1'), execute,
    );
    expect(operations).toBe(1);
    expect(JSON.stringify(replay)).toContain('MCP_MUTATION_INVOCATION_ALREADY_COMPLETED');
  });

  it('DTC-A8 blocks a receipt-without-terminal mutation instead of replaying it', async () => {
    const root = await rootFixture('dtc1-mutation-pending-');
    const journal = path.join(root, 'mutation');
    const first = McpMutationSafety.initialize(journal);
    let operations = 0;
    let release!: (value: any) => void;
    let started!: () => void;
    const startedPromise = new Promise<void>(resolve => { started = resolve; });
    const pending = first.runMutation(
      'native-agent', 'write_file', { target: 'fixture' },
      invocationContext('mutation-pending'),
      async () => {
        operations += 1;
        started();
        return await new Promise(resolve => { release = resolve; });
      },
    );
    await startedPromise;
    const reopened = McpMutationSafety.initialize(journal);
    const replay = await reopened.runMutation(
      'native-agent', 'write_file', { target: 'fixture' },
      invocationContext('mutation-pending'),
      async () => {
        operations += 1;
        return mutationOk('must-not-run');
      },
    );
    expect(operations).toBe(1);
    expect(JSON.stringify(replay)).toContain('MCP_MUTATION_INVOCATION_UNCERTAIN');
    release(mutationOk('first-finished'));
    await pending;
  });

  it('DTC-A9 refuses to fabricate a result from a dispatching mutation checkpoint', async () => {
    const root = await rootFixture('dtc1-side-effect-gap-');
    const state = checkpoint({
      pendingTool: {
        callId: 'call-9',
        name: 'write_file',
        arguments: '{"path":"fixture"}',
        invocationId: 'mutation-9',
        mutating: true,
        phase: 'dispatching',
      },
    });
    const store = new AgentChatStore(path.join(root, 'chat.sqlite'));
    seedRunning(store, state);
    store.recoverRunningTurns();
    const service = new (AgentChatService as any)(
      store,
      { getTask: vi.fn(), setProviderAffinity: vi.fn() },
      { runConversationTurn: vi.fn() },
      root,
    ) as AgentChatService;
    await expect(service.resumeTurn({ turnId: state.turnId }))
      .rejects.toThrow('AGENT_CHAT_RESUME_SIDE_EFFECT_RESULT_UNAVAILABLE');
    expect(store.getTurn(state.turnId)?.status).toBe('resumable');
  });
});

describe('DTC-A10 cancellation while provider request is waiting', () => {
  it('does not penalize a healthy credential solely because the caller aborted', async () => {
    const root = await rootFixture('dtc1-abort-');
    const pool = new OpenAICompatibleProviderPool(providerConfig([{
      id: 'provider-a',
      baseUrl: 'http://127.0.0.1:65530/v1',
      model: 'fixture-model',
      credentials: [{ id: 'a:1', secret: 'secret-one', ordinal: 1 }],
    }]), path.join(root, 'provider-state.json'));
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
      });
    }));
    const pending = pool.complete(
      [{ role: 'user', content: 'wait then cancel' }],
      [],
      'session-abort',
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toBeTruthy();
    const route = pool.health().routes?.find(item => item.id === 'provider-a');
    expect(route?.activeKeyCount).toBe(1);
    expect(route?.cooldownKeyCount ?? 0).toBe(0);
    expect(route?.invalidKeyCount ?? 0).toBe(0);
  });
});

async function continuationControllerFixture(
  root: string,
  config: AgentProviderConfig & { allowedTools: string[] },
) {
  const learning = {
    procedures: async () => [],
    checkpoint: vi.fn(async () => ({ reviewDue: false })),
    review: vi.fn(async () => ({ summary: { status: 'no-new-knowledge', complete: true } })),
  };
  const memory = {
    search: vi.fn(async () => []),
    recordUseReceipt: vi.fn(async () => ({})),
  };
  const runtime = await AgentRuntimeService.initialize(
    root, learning as any, config as any, memory as any,
  );
  await runtime.startSession({ sessionId: 'session-1' });
  await runtime.beginTask({
    sessionId: 'session-1',
    taskId: 'task-1',
    workspace: 'fixture',
    goal: 'continue fixture',
  });
  const controller = new NativeAgentController(runtime, {} as any, config as any);
  return { runtime, controller };
}

describe('DTC-1 current-authority and budget invariants', () => {
  it('blocks resume when a previously granted tool is revoked or its contract changes', async () => {
    const root = await rootFixture('dtc1-authority-');
    const oldSession = await AgentRuntimeToolSession.open(
      'old-session',
      ['get_config'],
      { nativeTaskId: 'task-1', nativeWorkspace: 'fixture' },
    );
    const oldDigest = await oldSession.contractDigest();
    await oldSession.close();

    const config = {
      ...providerConfig([{
        id: 'provider-a',
        baseUrl: 'http://127.0.0.1:65530/v1',
        model: 'fixture-model',
        credentials: [{ id: 'a:1', secret: 'fixture-secret', ordinal: 1 }],
      }]),
      allowedTools: [],
    };
    const { controller } = await continuationControllerFixture(root, config);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const state = checkpoint({
      historicalGrantedTools: ['get_config'],
      toolContractDigest: oldDigest,
    });
    await expect(controller.runConversationTurn({
      sessionId: state.runtimeSessionId,
      taskId: state.runtimeTaskId,
      prompt: state.prompt,
      workspace: 'fixture',
      continuation: {
        conversationId: state.conversationId,
        turnId: state.turnId,
        state,
        save: vi.fn(async () => undefined),
      },
    })).rejects.toThrow('AGENT_RUNTIME_CONTINUATION_TOOL_CONTRACT_CHANGED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preserves exhausted provider-attempt budget instead of resetting after resume', async () => {
    const root = await rootFixture('dtc1-budget-');
    const config = {
      ...providerConfig([{
        id: 'provider-a',
        baseUrl: 'http://127.0.0.1:65530/v1',
        model: 'fixture-model',
        credentials: [{ id: 'a:1', secret: 'fixture-secret', ordinal: 1 }],
      }]),
      maxProviderAttempts: 1,
      maxToolIterations: 2,
      allowedTools: [],
    };
    const { controller } = await continuationControllerFixture(root, config);
    const currentSession = await AgentRuntimeToolSession.open(
      'budget-contract',
      [],
      { nativeTaskId: 'task-1', nativeWorkspace: 'fixture' },
    );
    const currentDigest = await currentSession.contractDigest();
    await currentSession.close();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const state = checkpoint({
      toolContractDigest: currentDigest,
      maxIterations: 2,
      nextIteration: 2,
      maxProviderAttempts: 2,
      providerAttemptsConsumed: 2,
    });
    await expect(controller.runConversationTurn({
      sessionId: state.runtimeSessionId,
      taskId: state.runtimeTaskId,
      prompt: state.prompt,
      workspace: 'fixture',
      continuation: {
        conversationId: state.conversationId,
        turnId: state.turnId,
        state,
        save: vi.fn(async () => undefined),
      },
    })).rejects.toMatchObject({ reason: 'attempt-budget', retryAtMs: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('DTC-1 crash-boundary and cancellation races', () => {
  it('reconstructs every nonterminal durable write boundary without auto-executing work', async () => {
    const phases = [
      'model-ready',
      'provider-dispatch',
      'model-received',
      'tool-planned',
      'tool-dispatching',
      'tool-result-durable',
      'finalization-started',
      'finalization-complete',
      'chat-commit-pending',
    ] as const;
    for (const [index, phase] of phases.entries()) {
      const root = await rootFixture('dtc1-boundary-');
      const store = new AgentChatStore(path.join(root, 'chat.sqlite'));
      const state = checkpoint({
        conversationId: 'conversation-' + index,
        turnId: 'turn-' + index,
        runtimeTaskId: 'task-' + index,
        runtimeSessionId: 'session-' + index,
      });
      const begun = seedRunning(store, state);
      const current = store.getCheckpoint(state.turnId)!;
      const serialized = serializeAgentTurnCheckpoint({
        ...state,
        updatedAtMs: state.updatedAtMs + 1,
      });
      store.saveCheckpoint({
        turnId: state.turnId,
        claim: begun.claim,
        expectedRevision: current.revision,
        schemaVersion: serialized.state.schemaVersion,
        phase,
        payloadJson: serialized.json,
        payloadDigest: serialized.digest,
      });
      const reopened = new AgentChatStore(path.join(root, 'chat.sqlite'));
      const recovered = reopened.recoverRunningTurns();
      expect(recovered.resumable).toHaveLength(1);
      expect(reopened.getCheckpoint(state.turnId)?.phase).toBe(phase);
    }
  });

  it('rejects a late provider/tool commit after cancellation invalidates the executor', async () => {
    const root = await rootFixture('dtc1-cancel-race-');
    const store = new AgentChatStore(path.join(root, 'chat.sqlite'));
    const seeded = seedRunning(store);
    expect(store.cancelTurn('turn-1')?.status).toBe('stopped');
    expect(() => store.finalizeTurn({
      turnId: 'turn-1',
      assistantMessageId: 'late-assistant',
      response: 'late result must not commit',
      iterations: 1,
      retrievalCount: 0,
      claim: seeded.claim,
    })).toThrow('AGENT_CHAT_EXECUTOR_STALE');
    const detail = store.detail('conversation-1')!;
    expect(detail.turns[0]?.status).toBe('stopped');
    expect(detail.messages.filter(message => message.role === 'assistant'))
      .toHaveLength(0);
  });
});

describe('DTC-1 Stop reaches an in-flight tool call', () => {
  async function stoppedToolFixture(mutating: boolean) {
    const root = await rootFixture('dtc1-stop-tool-');
    const config = {
      ...providerConfig([{
        id: 'provider-a',
        baseUrl: 'http://127.0.0.1:65530/v1',
        model: 'fixture-model',
        credentials: [{ id: 'a:1', secret: 'fixture-secret', ordinal: 1 }],
      }]),
      allowedTools: ['get_config'],
    };
    const { runtime, controller } = await continuationControllerFixture(root, config);
    const contract = await AgentRuntimeToolSession.open(
      'stop-contract', ['get_config'], { nativeTaskId: 'task-1', nativeWorkspace: 'fixture' },
    );
    const toolContractDigest = await contract.contractDigest();
    await contract.close();
    if (mutating) vi.spyOn(AgentRuntimeToolSession.prototype, 'isMutating').mockResolvedValue(true);
    vi.spyOn(runtime, 'complete').mockResolvedValue({
      content: null,
      toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'get_config', arguments: '{}' } }],
      providerId: 'provider-a',
      resolvedModel: null,
      model: 'fixture-model',
    } as any);
    const stop = new AbortController();
    const dispatched = vi.spyOn(AgentRuntimeToolSession.prototype, 'call')
      .mockImplementation((_name, _args, _invocationId, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        stop.abort();
      }));
    const state = checkpoint({
      hasStrategy: true,
      toolContractDigest,
      providerId: 'provider-a',
      model: 'fixture-model',
      historicalGrantedTools: ['get_config'],
      messages: [{ role: 'user', content: 'continue fixture' }],
    });
    const phases: string[] = [];
    const events: string[] = [];
    const episodes = vi.spyOn(runtime, 'recordEpisode');
    const run = () => controller.runConversationTurn({
      sessionId: state.runtimeSessionId,
      taskId: state.runtimeTaskId,
      prompt: state.prompt,
      workspace: 'fixture',
      signal: stop.signal,
      eventSink: event => { events.push(event.type); },
      continuation: {
        conversationId: state.conversationId,
        turnId: state.turnId,
        state,
        save: vi.fn(async (_state, phase) => { phases.push(phase); }),
      },
    });
    return { run, dispatched, phases, events, episodes };
  }

  it('ends a read-only call as stopped: no tool failure, no retry, no durable result', async () => {
    const fixture = await stoppedToolFixture(false);
    await expect(fixture.run()).rejects.toThrow('AGENT_RUNTIME_TURN_STOPPED');
    expect(fixture.dispatched).toHaveBeenCalledTimes(1);
    expect(fixture.dispatched.mock.calls[0]?.[3]).toBeInstanceOf(AbortSignal);
    expect(fixture.events).toContain('turn.cancelled');
    expect(fixture.events).not.toContain('tool.completed');
    expect(fixture.phases).not.toContain('tool-result-durable');
    const kinds = fixture.episodes.mock.calls.map(call => (call[1] as any).kind);
    expect(kinds).not.toContain('failure');
    expect(fixture.episodes.mock.calls.some(call => String((call[1] as any).summary)
      .includes('Stop reached tool get_config in flight'))).toBe(true);
  });

  it('leaves a mutating call at its durable dispatching checkpoint with an unknown result', async () => {
    const fixture = await stoppedToolFixture(true);
    await expect(fixture.run()).rejects.toThrow('AGENT_RUNTIME_TURN_STOPPED');
    expect(fixture.phases).toContain('tool-dispatching');
    expect(fixture.phases).not.toContain('tool-result-durable');
    expect(fixture.episodes.mock.calls.some(call => String((call[1] as any).summary)
      .includes('result unknown'))).toBe(true);
  });
});

describe('DTC-1 context compaction inside a turn', () => {
  async function compactionFixture(window: number | null) {
    const root = await rootFixture('dtc1-compaction-');
    const config = {
      ...providerConfig([{
        id: 'provider-a',
        baseUrl: 'http://127.0.0.1:65530/v1',
        model: 'fixture-model',
        credentials: [{ id: 'a:1', secret: 'fixture-secret', ordinal: 1 }],
      }]),
      allowedTools: ['get_config'],
    };
    const { runtime, controller } = await continuationControllerFixture(root, config);
    const contract = await AgentRuntimeToolSession.open(
      'compaction-contract', ['get_config'], { nativeTaskId: 'task-1', nativeWorkspace: 'fixture' },
    );
    const toolContractDigest = await contract.contractDigest();
    await contract.close();
    vi.spyOn(runtime, 'knownContextWindow').mockReturnValue(window);
    const stop = new AbortController();
    const seen: Array<AgentModelMessage[]> = [];
    vi.spyOn(runtime, 'complete').mockImplementation(async messages => {
      seen.push(structuredClone(messages));
      stop.abort();
      throw new Error('AGENT_RUNTIME_TURN_STOPPED');
    });
    const groups = Array.from({ length: 20 }, (_, index) => [
      { role: 'assistant' as const, content: null, tool_calls: [{ id: 'g-' + index, type: 'function' as const,
        function: { name: 'get_config', arguments: '{}' } }] },
      { role: 'tool' as const, name: 'get_config', tool_call_id: 'g-' + index,
        content: 'result ' + index + ' ' + 'y'.repeat(600) + '\n\nAGENT_CORE_EVIDENCE_REF=tool:get_config:g-' + index },
    ]).flat();
    const state = checkpoint({
      hasStrategy: true,
      toolContractDigest,
      providerId: 'provider-a',
      model: 'fixture-model',
      historicalGrantedTools: ['get_config'],
      messages: [{ role: 'system', content: 'fixture system' }, { role: 'user', content: 'continue fixture' }, ...groups],
    });
    const saves: Array<{ state: AgentTurnCheckpointState; phase: string; extras: any }> = [];
    const run = () => controller.runConversationTurn({
      sessionId: state.runtimeSessionId,
      taskId: state.runtimeTaskId,
      prompt: state.prompt,
      workspace: 'fixture',
      signal: stop.signal,
      continuation: {
        conversationId: state.conversationId,
        turnId: state.turnId,
        state,
        save: vi.fn(async (next, phase, extras) => { saves.push({ state: next, phase, extras }); }),
      },
    });
    return { run, seen, saves };
  }

  it('compacts before the provider call and commits the source with the compacted checkpoint', async () => {
    const fixture = await compactionFixture(10_000);
    await expect(fixture.run()).rejects.toThrow('AGENT_RUNTIME_TURN_STOPPED');
    const sent = fixture.seen[0]!;
    expect(sent.filter(message => message.content?.startsWith('NATIVE CONTEXT SUMMARY'))).toHaveLength(1);
    expect(sent.length).toBeLessThan(2 + 40);
    expect(sent.at(-1)!.role).toBe('tool');
    const commits = fixture.saves.filter(save => save.extras?.compactionSources?.length);
    const committed = commits.at(-1)!;
    expect(committed.phase).toBe('model-ready');
    expect(committed.state.compactions).toHaveLength(commits.length);
    const [source] = committed.extras.compactionSources;
    expect(committed.state.compactions!.at(-1)).toMatchObject({ id: source.id, scope: 'turn', sourceDigest: source.sourceDigest });
    expect(committed.state.messages.length).toBe(sent.length);
    // The compacted checkpoint is still a valid, resumable checkpoint.
    expect(serializeAgentTurnCheckpoint(committed.state).state.compactions).toHaveLength(commits.length);
  });

  it('leaves the context alone when the window is unknown or the flag is off', async () => {
    const unknown = await compactionFixture(null);
    await expect(unknown.run()).rejects.toThrow('AGENT_RUNTIME_TURN_STOPPED');
    expect(unknown.seen[0]!.some(message => message.content?.startsWith('NATIVE CONTEXT SUMMARY'))).toBe(false);
    process.env.AGENT_CORE_AI_COMPACTION = 'off';
    try {
      const off = await compactionFixture(10_000);
      await expect(off.run()).rejects.toThrow('AGENT_RUNTIME_TURN_STOPPED');
      expect(off.seen[0]!.some(message => message.content?.startsWith('NATIVE CONTEXT SUMMARY'))).toBe(false);
    } finally { delete process.env.AGENT_CORE_AI_COMPACTION; }
  });
});
