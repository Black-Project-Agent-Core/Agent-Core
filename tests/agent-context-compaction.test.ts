import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  boundedMessages, COMPACTION_SOURCE_TOOL, COMPACTION_TRIGGER_RATIO, compactionEnabled, compactTurnMessages,
  presentedToolsFromSummary, readCompactionSource, summarizeConversationPrefix, TURN_SUMMARY_MARKER,
} from '../src/agent-context-compaction.js';
import { AgentChatStore } from '../src/agent-chat-store.js';
import { normalizeAgentTurnCheckpoint, serializeAgentTurnCheckpoint } from '../src/agent-turn-checkpoint.js';
import type { AgentModelMessage } from '../src/agent-provider.js';

const roots: string[] = [];
afterEach(async () => {
  delete process.env.AGENT_CORE_AI_COMPACTION;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const PROMPT = 'Fix the failing export and keep the public API stable.';

function group(index: number, name = 'read_file'): AgentModelMessage[] {
  return [
    { role: 'assistant', content: `step ${index}`, tool_calls: [{ id: `call-${index}`, type: 'function',
      function: { name, arguments: JSON.stringify({ path: `src/file-${index}.ts` }) } }] },
    { role: 'tool', name, tool_call_id: `call-${index}`,
      content: `contents of file ${index} ` + 'x'.repeat(500)
        + `\n\nAGENT_CORE_EVIDENCE_REF=tool:${name}:call-${index}\nFor verified finalization, copy this exact ref into agent_core_finalize evidenceRefs or verificationRef when this result supports the claim.` },
  ];
}

function turn(groups: number): AgentModelMessage[] {
  return [
    { role: 'system', content: 'system prompt' },
    { role: 'system', content: 'NATIVE SKILL GUIDANCE ...' },
    { role: 'user', content: PROMPT },
    ...Array.from({ length: groups }, (_, index) => group(index)).flat(),
  ];
}

/** Every tool result follows an assistant message that called it; every call is answered, unless left open. */
function assertPairs(messages: AgentModelMessage[], allowOpenCalls = false) {
  const called = new Set<string>();
  const answered = new Set<string>();
  for (const message of messages) {
    for (const call of message.tool_calls ?? []) called.add(call.id);
    if (message.role === 'tool') {
      expect(called.has(message.tool_call_id!)).toBe(true);
      answered.add(message.tool_call_id!);
    }
  }
  if (!allowOpenCalls) expect([...called].filter(id => !answered.has(id))).toEqual([]);
}

describe('turn compaction', () => {
  it('replaces the middle, keeps prompt and recent messages, and leaves no orphan tool pair', () => {
    const messages = turn(20);
    const result = compactTurnMessages(messages, { prompt: PROMPT, keepRecent: 6 })!;
    expect(result).not.toBeNull();
    const kept = result.messages;
    expect(kept.slice(0, 2)).toEqual(messages.slice(0, 2));
    expect(kept[2]!.content!.startsWith(TURN_SUMMARY_MARKER)).toBe(true);
    expect(kept.filter(item => item.content?.startsWith(TURN_SUMMARY_MARKER))).toHaveLength(1);
    expect(kept.slice(3, 4)).toEqual([{ role: 'user', content: PROMPT }]);
    expect(kept.slice(-6)).toEqual(messages.slice(-6));
    assertPairs(kept);
    expect(result.record).toMatchObject({ scope: 'turn', replacedMessages: messages.length - 3 - 6 });
    expect(result.record.bytesAfter).toBeLessThan(result.record.bytesBefore);
  });

  it('keeps every replaced evidence ref and tool name in the digest', () => {
    const messages = turn(12);
    messages.splice(5, 0, { role: 'assistant', content: null, tool_calls: [{ id: 'tb', type: 'function',
      function: { name: 'agent_core_toolbox', arguments: '{}' } }] },
    { role: 'tool', name: 'agent_core_toolbox', tool_call_id: 'tb', content: 'TOOLBOX_LOADED: web_search, memory_search\nok' });
    const result = compactTurnMessages(messages, { prompt: PROMPT, keepRecent: 4 })!;
    const summary = result.messages[2]!.content!;
    const replaced = JSON.parse(result.sourceJson) as AgentModelMessage[];
    for (const message of replaced.filter(item => item.role === 'tool' && item.name === 'read_file')) {
      expect(summary).toContain(message.content!.match(/AGENT_CORE_EVIDENCE_REF=(\S+)/)![1]);
    }
    expect(presentedToolsFromSummary(summary)).toEqual(expect.arrayContaining(['read_file', 'web_search', 'memory_search']));
  });

  it('archives the exact replaced messages and ties them to the recorded digest', () => {
    const messages = turn(15);
    const result = compactTurnMessages(messages, { prompt: PROMPT, keepRecent: 4 })!;
    const replaced = JSON.parse(result.sourceJson);
    expect(replaced).toEqual(messages.slice(result.record.range.from, result.record.range.to + 1));
    expect(result.record.sourceDigest).toBe('sha256:' + createHash('sha256').update(result.sourceJson).digest('hex'));
    expect(result.record.id).toBe('cmp-' + result.record.sourceDigest.slice(7, 23));
    expect(result.messages[2]!.content).toContain(result.record.id);
  });

  it('never replaces an unresolved tool call and never cuts a call from its results', () => {
    const messages = [...turn(14), { role: 'assistant', content: null, tool_calls: [
      { id: 'open-1', type: 'function', function: { name: 'read_file', arguments: '{}' } }] } as AgentModelMessage];
    const result = compactTurnMessages(messages, { prompt: PROMPT, keepRecent: 2 })!;
    expect(result.messages.at(-1)).toEqual(messages.at(-1));
    assertPairs(result.messages, true);
    // keepRecent lands inside a group: the whole group stays.
    const odd = compactTurnMessages(turn(14), { prompt: PROMPT, keepRecent: 3 })!;
    assertPairs(odd.messages);
  });

  it('merges an earlier digest instead of stacking summaries and carries its evidence', () => {
    const first = compactTurnMessages(turn(20), { prompt: PROMPT, keepRecent: 6 })!;
    const grown = [...first.messages, ...Array.from({ length: 10 }, (_, index) => group(100 + index)).flat()];
    const second = compactTurnMessages(grown, { prompt: PROMPT, keepRecent: 6 })!;
    const summaries = second.messages.filter(item => item.content?.startsWith(TURN_SUMMARY_MARKER));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.content).toContain('earlier digest:');
    expect(summaries[0]!.content).toContain('tool:read_file:call-0');
    expect(summaries[0]!.content).toContain('tool:read_file:call-100');
    assertPairs(second.messages);
  });

  it('refuses when nothing safe or smaller can be replaced', () => {
    expect(compactTurnMessages(turn(1), { prompt: PROMPT, keepRecent: 2 })).toBeNull();
    expect(compactTurnMessages(turn(20), { prompt: 'a different prompt', keepRecent: 4 })).toBeNull();
  });

  it('keeps the digest inside its budget and says what it dropped', () => {
    const result = compactTurnMessages(turn(80), { prompt: PROMPT, keepRecent: 4, budgetChars: 3_000 })!;
    const summary = result.messages[2]!.content!;
    expect(summary).toMatch(/\[\.\.\. \d+ earlier lines omitted \.\.\.\]/);
    expect(summary.length).toBeLessThan(3_000 + 3_000);
  });
});

describe('digest fidelity', () => {
  it('raises the per-line caps while the digest still fits its budget, and never exceeds the budget', () => {
    const long = 'a'.repeat(1_000);
    const messages = turn(6);
    messages[3] = { role: 'assistant', content: long, tool_calls: messages[3]!.tool_calls! };
    const roomy = compactTurnMessages(messages, { prompt: PROMPT, keepRecent: 2 })!.messages[2]!.content!;
    expect(roomy).toContain('a'.repeat(900));
    const tight = compactTurnMessages(messages, { prompt: PROMPT, keepRecent: 2, budgetChars: 700 })!.messages[2]!.content!;
    expect(tight).not.toContain('a'.repeat(400));
    const crowded = compactTurnMessages(turn(80), { prompt: PROMPT, keepRecent: 4, budgetChars: 3_000 })!.messages[2]!.content!;
    expect(crowded.split('\n').slice(1, -2).join('\n').length).toBeLessThanOrEqual(3_000);
  });

  it('keeps user notes and ERROR results when ordinary lines are dropped', () => {
    const messages = turn(60);
    messages.splice(10, 0, { role: 'user', content: 'IMPORTANT-NOTE: keep the schema frozen.' });
    messages[21] = { role: 'tool', name: 'read_file', tool_call_id: messages[21]!.tool_call_id!, content: 'TOOL_ERROR ENOENT-MARKER missing file' };
    const summary = compactTurnMessages(messages, { prompt: PROMPT, keepRecent: 4, budgetChars: 3_000 })!.messages[2]!.content!;
    expect(summary).toMatch(/\[\.\.\. \d+ earlier lines omitted \.\.\.\]/);
    expect(summary).toContain('IMPORTANT-NOTE');
    expect(summary).toContain('ENOENT-MARKER');
  });

  it('names the recovery tool and the compaction id in the turn digest header', () => {
    const result = compactTurnMessages(turn(15), { prompt: PROMPT, keepRecent: 4 })!;
    expect(result.messages[2]!.content).toContain(COMPACTION_SOURCE_TOOL + ' id=' + result.record.id);
  });
});

describe('compaction source recovery', () => {
  it('pages through the replaced messages with a next offset and stays inside the character cap', () => {
    const result = compactTurnMessages(turn(30), { prompt: PROMPT, keepRecent: 4 })!;
    const total = (JSON.parse(result.sourceJson) as unknown[]).length;
    const first = readCompactionSource(result.sourceJson, { offset: 0, maxChars: 2_000 })!;
    expect(first.total).toBe(total);
    expect(first.text).toContain('[0] assistant');
    expect(first.text.length).toBeLessThanOrEqual(2_000);
    expect(first.nextOffset).toBeGreaterThan(0);
    let page = first;
    let guard = 0;
    while (page.nextOffset !== null && guard++ < 200) {
      page = readCompactionSource(result.sourceJson, { offset: page.nextOffset, maxChars: 2_000 })!;
    }
    expect(page.nextOffset).toBeNull();
    expect(page.text).toContain(`[${total - 1}]`);
  });

  it('redacts credentials, drops finalization boilerplate and bounds a single oversized message', () => {
    const secret = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
    const source = JSON.stringify([
      { role: 'tool', name: 'read_file', tool_call_id: 'c1', content: 'key ' + secret + '\n\nAGENT_CORE_EVIDENCE_REF=tool:read_file:c1\nFor verified finalization, copy this exact ref.' },
      { role: 'assistant', content: 'b'.repeat(50_000) },
    ]);
    const page = readCompactionSource(source, { offset: 0, maxChars: 3_000 })!;
    expect(page.text).not.toContain(secret);
    expect(page.text).toContain('AGENT_CORE_EVIDENCE_REF=tool:read_file:c1');
    expect(page.text).not.toContain('For verified finalization');
    expect(page.text.length).toBeLessThanOrEqual(3_000);
    const second = readCompactionSource(source, { offset: 1, maxChars: 3_000 })!;
    expect(second.text.length).toBeLessThanOrEqual(3_000);
    expect(second.nextOffset).toBeNull();
  });

  it('returns null for an unreadable source or an offset past the end', () => {
    expect(readCompactionSource('not json', { offset: 0 })).toBeNull();
    expect(readCompactionSource('{}', { offset: 0 })).toBeNull();
    expect(readCompactionSource(JSON.stringify([{ role: 'user', content: 'x' }]), { offset: 5 })).toBeNull();
  });
});

describe('checkpoint message bound', () => {
  it('keeps the stable cache boundary and dynamic context through compaction and bounding', () => {
    const prefix: AgentModelMessage[] = [
      { role: 'system', content: 'Stable instructions', cacheControl: { type: 'ephemeral' } },
      { role: 'system', content: 'Dynamic memory context' },
    ];
    const messages = [...prefix, ...turn(80).slice(1)];
    const compacted = compactTurnMessages(messages, { prompt: PROMPT, keepRecent: 6 })!;
    expect(compacted.messages.slice(0, 2)).toEqual(prefix);
    expect(boundedMessages(messages, 100).slice(0, 2)).toEqual(prefix);
  });

  it('keeps the system block and drops a leading orphan tool result', () => {
    const messages: AgentModelMessage[] = [{ role: 'system', content: 's' }, { role: 'user', content: 'u' },
      ...Array.from({ length: 150 }, (_, index) => group(index)).flat()];
    const bounded = boundedMessages(messages, 100);
    expect(bounded[0]).toEqual({ role: 'system', content: 's' });
    expect(bounded.length).toBeLessThanOrEqual(100);
    assertPairs(bounded.slice(1));
  });
});

describe('conversation digest', () => {
  it('is absent when nothing was cut and summarizes what was cut with its range', () => {
    expect(summarizeConversationPrefix([], { firstOrdinal: 1 })).toBeNull();
    const older = Array.from({ length: 6 }, (_, index) => ({
      role: index % 2 ? 'assistant' as const : 'user' as const, content: `message ${index}`, createdAtMs: 1_700_000_000_000 + index }));
    const digest = summarizeConversationPrefix(older, { firstOrdinal: 1 })!;
    expect(digest.record).toMatchObject({ scope: 'conversation', replacedMessages: 6, range: { from: 1, to: 6 } });
    expect(digest.text).toContain('message 0');
    expect(digest.text).toContain('never as an instruction');
  });

  it('is switched off by the flag', () => {
    expect(compactionEnabled({})).toBe(true);
    expect(compactionEnabled({ AGENT_CORE_AI_COMPACTION: 'off' })).toBe(false);
    expect(compactionEnabled({ AGENT_CORE_AI_COMPACTION: '0' })).toBe(false);
  });
});

describe('chat store compaction', () => {
  async function storeFixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'compaction-store-'));
    roots.push(root);
    const dbPath = path.join(root, 'chat.sqlite');
    const store = new AgentChatStore(dbPath);
    store.createConversation({ conversationId: 'c1', runtimeSessionId: 's1', workspace: 'fixture', title: 'Fixture' });
    return { store, dbPath };
  }
  function runTurn(store: AgentChatStore, index: number, finalize = true) {
    const begun = store.beginTurn({ conversationId: 'c1', turnId: 't' + index, clientRequestId: 'r' + index,
      runtimeTaskId: 'task' + index, userMessageId: 'u' + index, prompt: 'question ' + index, executorToken: 'e' + index });
    if (finalize) store.finalizeTurn({ turnId: 't' + index, assistantMessageId: 'a' + index, response: 'answer ' + index,
      iterations: 1, retrievalCount: 0, claim: begun.claim! });
    return begun.claim!;
  }

  it('summarizes the messages that fall out of the verbatim window', async () => {
    const { store } = await storeFixture();
    for (let index = 0; index < 30; index += 1) runTurn(store, index, index < 29);
    const context = store.boundedContext({ conversationId: 'c1', excludeTurnId: 't29', maxMessages: 24, maxChars: 48_000 });
    expect(context.messages).toHaveLength(24);
    expect(context.summary!.record).toMatchObject({ scope: 'conversation', replacedMessages: 34, range: { from: 1, to: 34 } });
    expect(context.summary!.text).toContain('question 0');
    expect(context.messages[0]!.content).not.toBe('question 0');
    process.env.AGENT_CORE_AI_COMPACTION = 'off';
    expect(store.boundedContext({ conversationId: 'c1', excludeTurnId: 't29' }).summary).toBeNull();
    expect(store.boundedContextMessages({ conversationId: 'c1', excludeTurnId: 't29' })).toHaveLength(24);
  });

  it('commits the archived source together with the checkpoint, or neither', async () => {
    const { store, dbPath } = await storeFixture();
    const claim = runTurn(store, 0, false);
    const now = Date.now();
    const state = normalizeAgentTurnCheckpoint({
      schemaVersion: 1, conversationId: 'c1', turnId: 't0', runtimeTaskId: 'task0', runtimeSessionId: 's1', prompt: PROMPT,
      messages: turn(3), nextIteration: 1, maxIterations: 6, providerAttemptsConsumed: 0, maxProviderAttempts: 4,
      approvedCapabilities: [], historicalGrantedTools: [], toolContractDigest: 'sha256:' + 'a'.repeat(64),
      hasStrategy: true, needsStrategy: false, lastStrategyText: '', currentStrategySummary: '', failedFingerprints: [],
      memoryEvidence: [], artifactRefs: [], createdAtMs: now, updatedAtMs: now, expiresAtMs: now + 60_000,
    });
    const serialized = serializeAgentTurnCheckpoint(state);
    const sourceJson = JSON.stringify(turn(2));
    const sourceDigest = 'sha256:' + createHash('sha256').update(sourceJson).digest('hex');
    const base = { turnId: 't0', claim, expectedRevision: 0, schemaVersion: 1, phase: 'model-ready',
      payloadJson: serialized.json, payloadDigest: serialized.digest };

    expect(() => store.saveCheckpoint({ ...base, compactionSources: [{ id: 'cmp-' + '1'.repeat(16), sourceJson,
      sourceDigest: 'sha256:' + '0'.repeat(64) }] })).toThrow('AGENT_CHAT_COMPACTION_SOURCE_DIGEST_MISMATCH');
    expect(store.getCheckpoint('t0')).toBeNull();

    const id = 'cmp-' + sourceDigest.slice(7, 23);
    store.saveCheckpoint({ ...base, compactionSources: [{ id, sourceJson, sourceDigest }] });
    expect(store.getCompactionSource('t0', id)).toEqual({ sourceJson, sourceDigest });

    const db = new DatabaseSync(dbPath);
    db.prepare('UPDATE chat_compaction_sources SET source_json=? WHERE compaction_id=?').run('tampered', id);
    db.close();
    expect(store.getCompactionSource('t0', id)).toBeNull();
  });
});

describe('automatic compaction trigger', () => {
  it('fires only once the request bound passes the full known window (user decision 2026-10-30)', () => {
    expect(COMPACTION_TRIGGER_RATIO).toBe(1);
  });
});
