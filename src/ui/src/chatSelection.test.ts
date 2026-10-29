import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentChatProvider } from './host';
import { mergeSelection, parseServerSelection, readLocalSelection, resolveSelection, writeLocalSelection } from './chatSelection';

const anthropic: AgentChatProvider = {
  id: 'anthropic', model: 'm-default', configured: true, available: true, reasoningEfforts: ['low', 'medium', 'high'],
  models: [{ id: 'm-default', reasoningEfforts: ['low', 'medium', 'high'] }, { id: 'm-low', reasoningEfforts: ['low'] }, { id: 'm-none', reasoningEfforts: [] }],
};
const atria: AgentChatProvider = { id: 'atria', model: 'a1', configured: true, available: true };
const sel = (providerId: string, model: string, reasoningEffort: any = 'auto', updatedAtMs = 1) => ({ providerId, model, reasoningEffort, updatedAtMs });

describe('resolveSelection (display/send only, never rewrites the stored choice)', () => {
  it('keeps a supported effort as-is without a notice', () => {
    const r = resolveSelection([anthropic], { providerId: 'anthropic', model: 'm-default', reasoningEffort: 'high' });
    expect(r).toMatchObject({ effectiveReasoning: 'high', modelMissing: false, sendBlocked: false });
    expect(r.notice).toBeUndefined();
  });

  it('uses the nearest supported level below an unsupported effort and explains it', () => {
    const r = resolveSelection([anthropic], { providerId: 'anthropic', model: 'm-low', reasoningEffort: 'xhigh' });
    expect(r.effectiveReasoning).toBe('low');
    expect(r.notice).toBe('Effort xhigh tidak didukung m-low; memakai low untuk model ini');
  });

  it('falls back to Auto when no supported level is at or below the saved effort', () => {
    const r = resolveSelection([anthropic], { providerId: 'anthropic', model: 'm-none', reasoningEffort: 'high' });
    expect(r.effectiveReasoning).toBe('auto');
    expect(r.notice).toBe('Effort high tidak didukung m-none; memakai auto untuk model ini');
  });

  it('flags a saved model absent from the catalog and blocks sending instead of substituting another model', () => {
    const r = resolveSelection([anthropic], { providerId: 'anthropic', model: 'gone', reasoningEffort: 'high' });
    expect(r.modelMissing).toBe(true);
    expect(r.sendBlocked).toBe(true);
    expect(r.notice).toBe('Model tidak tersedia di katalog saat ini; pilih model');
  });

  it('blocks a pinned provider that is unknown, unconfigured or not yet loaded; Auto never blocks', () => {
    expect(resolveSelection(undefined, { providerId: 'anthropic', model: '', reasoningEffort: 'auto' }).sendBlocked).toBe(true);
    expect(resolveSelection([atria], { providerId: 'anthropic', model: '', reasoningEffort: 'auto' }).sendBlocked).toBe(true);
    expect(resolveSelection([{ ...atria, configured: false }], { providerId: 'atria', model: '', reasoningEffort: 'auto' }).sendBlocked).toBe(true);
    expect(resolveSelection(undefined, { providerId: 'auto', model: '', reasoningEffort: 'high' }).sendBlocked).toBe(false);
  });

  it('does not judge effort for Auto rotation or a provider without reasoning levels', () => {
    expect(resolveSelection([anthropic], { providerId: 'auto', model: '', reasoningEffort: 'high' }))
      .toMatchObject({ effectiveReasoning: 'auto', sendBlocked: false });
    expect(resolveSelection([atria], { providerId: 'atria', model: '', reasoningEffort: 'high' }).effectiveReasoning).toBe('auto');
  });
});

describe('mergeSelection', () => {
  it('returns whichever side exists, nothing when both are absent', () => {
    expect(mergeSelection(undefined, undefined)).toBeUndefined();
    expect(mergeSelection(sel('a', 'm'), undefined)).toEqual(sel('a', 'm'));
    expect(mergeSelection(undefined, sel('b', 'n'))).toEqual(sel('b', 'n'));
  });
  it('prefers the newer record, local on a tie', () => {
    expect(mergeSelection(sel('s', '', 'auto', 9), sel('l', '', 'auto', 5)).providerId).toBe('s');
    expect(mergeSelection(sel('s', '', 'auto', 5), sel('l', '', 'auto', 9)).providerId).toBe('l');
    expect(mergeSelection(sel('s', '', 'auto', 5), sel('l', '', 'auto', 5)).providerId).toBe('l');
  });
  it('keeps the local triple when both sides are Auto (the server never receives model/effort for Auto)', () => {
    expect(mergeSelection(sel('auto', 'old', 'high', 9), sel('auto', 'new', 'low', 5))).toEqual(sel('auto', 'new', 'low', 5));
  });
});

describe('parseServerSelection / local storage', () => {
  beforeEach(() => window.localStorage.clear());
  it('validates the server record shape', () => {
    expect(parseServerSelection({ providerId: 'x', model: 'm', reasoningEffort: 'max', updatedAtMs: 3 })).toEqual(sel('x', 'm', 'max', 3));
    expect(parseServerSelection({ providerId: 'x', model: 'm', reasoningEffort: 'bogus', updatedAtMs: 3 })).toBeUndefined();
    expect(parseServerSelection(undefined)).toBeUndefined();
  });
  it('round-trips the local triple', () => {
    writeLocalSelection(sel('anthropic', 'm-low', 'low', 42));
    expect(readLocalSelection()).toEqual(sel('anthropic', 'm-low', 'low', 42));
  });
  it('migrates the legacy provider/effort keys with timestamp 0 and an empty model', () => {
    window.localStorage.setItem('agentcore.chat.provider', 'anthropic');
    window.localStorage.setItem('agentcore.chat.reasoning', 'high');
    expect(readLocalSelection()).toEqual(sel('anthropic', '', 'high', 0));
  });
  it('is absent when nothing was ever stored', () => {
    expect(readLocalSelection()).toBeUndefined();
  });
});
