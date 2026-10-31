import { describe, expect, it } from 'vitest';
import {
  classifyFinishReason,
  classifyToolFailure,
  finishReasonNote,
  isSimpleConversation,
  isAnswerOnlyConversation,
  toolOutcomeNote,
  visibleToolText,
} from '../src/agent-turn-outcomes.js';
import { AgentProviderRequestError, classifyAgentProviderFailure } from '../src/agent-provider-errors.js';
import { AgentCapabilityResolver } from '../src/agent-capability-resolver.js';
import { AgentRuntimeToolSession } from '../src/agent-tool-session.js';

const requestError = (status: number, message = '', safeCode: string | null = null) =>
  new AgentProviderRequestError({ status, message: `AGENT_RUNTIME_PROVIDER_REQUEST_FAILED:${status}: ${message}`, safeCode });

it.each([
  ['Bisakah kamu akses internet ketika aku memberikan tasknya?', true],
  ['Can you access the internet when I give you a task?', true],
  ['Jawab konseptual saja tanpa tindakan implementasi.', true],
  ['Edit file contoh.ts dan perbaiki errornya.', false],
  ['Bisakah kamu menghapus file contoh.ts?', false],
  ['Jawab konseptual, lalu edit file tersebut.', false],
  ['Jelaskan lalu jalankan perintah ini.', false],
  ['Please inspect the current state.', false],
])('keeps answer-only finalization conservative for %j', (prompt, expected) => {
  expect(isAnswerOnlyConversation(String(prompt))).toBe(expected);
});

describe('simple conversation detection', () => {
  it.each(['halo', 'Halo!', 'hai, apa kabar?', 'selamat pagi', 'Selamat malam, bro', 'terima kasih', 'makasih ya', 'thanks', 'thank you!', 'hello', 'hi there', 'siapa kamu?', 'kamu siapa', 'who are you', 'tes'])(
    'treats %j as a simple turn', prompt => { expect(isSimpleConversation(prompt)).toBe(true); });

  it.each([
    '', 'ok', 'oke', 'ya', 'sip', 'lanjut', 'halo tolong baca file ini', 'halo, cek config', 'selamat pagi, buat laporan hari ini',
    'terima kasih, sekarang perbaiki bug-nya', 'jelaskan arsitektur Agent Core', 'halo\ndan kerjakan tugas ini', '/compact', '/study halo',
    'halo https://example.com', 'halo C:\\Users\\x', 'halo `kode`', 'halo ' + 'a'.repeat(100),
  ])('does not treat %j as a simple turn', prompt => { expect(isSimpleConversation(prompt)).toBe(false); });
});

describe('finish reason taxonomy', () => {
  it.each([
    ['stop', 'completed'], ['tool_calls', 'completed'], ['end_turn', 'completed'],
    ['length', 'truncated-by-limit'], ['MAX_TOKENS', 'truncated-by-limit'],
    ['content_filter', 'refused-by-provider'], ['refusal', 'refused-by-provider'],
    ['context_length_exceeded', 'context-exceeded'],
    ['something-new', 'unknown'], ['', 'unknown'], [null, 'unknown'], [undefined, 'unknown'],
  ])('maps %s to %s', (reason, category) => {
    expect(classifyFinishReason(reason as any)).toBe(category);
  });

  it('only words the causes that need a note', () => {
    expect(finishReasonNote('completed')).toBeUndefined();
    expect(finishReasonNote('unknown')).toBeUndefined();
    expect(finishReasonNote('truncated-by-limit')).toContain('FINISH_TRUNCATED_BY_LIMIT');
    expect(finishReasonNote('refused-by-provider')).toContain('FINISH_REFUSED_BY_PROVIDER');
    expect(finishReasonNote('context-exceeded')).toContain('FINISH_CONTEXT_EXCEEDED');
  });
});

describe('tool outcome vocabulary', () => {
  it('tells a failure from a tool that gave no answer', () => {
    expect(classifyToolFailure('')).toBe('no-answer');
    expect(classifyToolFailure('request timed out after 30s')).toBe('no-answer');
    expect(classifyToolFailure('read ECONNRESET')).toBe('no-answer');
    expect(classifyToolFailure('ENOENT: no such file')).toBe('technical-failure');
  });

  it('gives each cause its own sentence', () => {
    const notes = (['denied-by-policy', 'no-answer', 'technical-failure'] as const).map(toolOutcomeNote);
    expect(new Set(notes).size).toBe(3);
    expect(notes[1]).toContain('effect is unknown');
  });

  it('keeps an empty result visible as empty, not missing', () => {
    expect(visibleToolText('')).toContain('TOOL_RESULT_EMPTY');
    expect(visibleToolText('   \n')).toContain('TOOL_RESULT_EMPTY');
    expect(visibleToolText('ok')).toBe('ok');
  });
});

describe('names that collide with object prototype members', () => {
  it('keeps resolved restrictions free of prototype members', () => {
    const resolver = new AgentCapabilityResolver({ mode: 'explicit', allowedTools: [], allowedCapabilities: [] });
    const { restrictions } = resolver.resolve({
      requestedFamilies: ['observe.local'], userPrompt: 'inspect', availableTools: ['get_config', 'read_file', 'list_directory'],
    });
    expect(Object.getPrototypeOf(restrictions)).toBeNull();
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(name in restrictions).toBe(false);
  });

  it('reads a plain-object restriction table by own keys only', () => {
    const session = Object.assign(Object.create(AgentRuntimeToolSession.prototype), {
      allowedTools: ['constructor', 'toString', 'read_file'],
      restrictions: { read_file: { allowedActions: ['read'] } },
    }) as AgentRuntimeToolSession;
    expect(session.admissionIssue('constructor', { action: 'anything' })).toBeNull();
    expect(session.admissionIssue('toString', { isUrl: true })).toBeNull();
    expect(session.admissionIssue('read_file', { action: 'write' })).toBe('AGENT_RUNTIME_TOOL_ACTION_NOT_GRANTED');
    expect(session.admissionIssue('__proto__', {})).toBe('AGENT_RUNTIME_TOOL_NOT_GRANTED');
  });
});

describe('provider failure classification leads with the status', () => {
  it.each([500, 502, 503, 408])('treats %i as transient even when the body says unauthorized', status => {
    const decision = classifyAgentProviderFailure(requestError(status, 'unauthorized upstream, model not found'));
    expect(decision.failureClass).toBe('PROVIDER_TRANSIENT');
    expect(decision.terminalCredential).toBe(false);
  });

  it('still reads spent quota on a 429 from the body', () => {
    expect(classifyAgentProviderFailure(requestError(429, 'quota exceeded', 'insufficient_quota')).failureClass).toBe('QUOTA_EXHAUSTED');
  });

  it('reads a plain 429 as a rate window, whatever else the body says', () => {
    const decision = classifyAgentProviderFailure(requestError(429, 'unauthorized, slow down'));
    expect(decision.failureClass).toBe('RATE_LIMIT');
    expect(decision.terminalCredential).toBe(false);
  });

  it('keeps a real 401 terminal and a context overflow as capacity', () => {
    expect(classifyAgentProviderFailure(requestError(401, 'invalid api key')).terminalCredential).toBe(true);
    expect(classifyAgentProviderFailure(requestError(400, 'context_length_exceeded')).failureClass).toBe('MODEL_CAPACITY');
  });
});
