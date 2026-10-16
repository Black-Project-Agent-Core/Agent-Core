import { describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import { DEFAULT_QUERY_CACHE_LIMITS, QueryEmbeddingCache } from '../../../src/memory/query-embedding-cache.js';

const LIMITS = { maxEntries: 128, maxVectorBytes: 2 * 1024 * 1024, ttlMs: 60_000,
  maxFlights: 8, maxWaiters: 32, maxQueryBytes: 16 * 1024 };
function key(query = 'exact query') {
  return { identity: { provider: 'synthetic', model: 'fixture', dimensions: 2 },
    queryRepresentationVersion: 'embedDocuments-query/v1', documentRepresentationVersion: 'semantic-document/v1', query };
}
function fixture(overrides: Partial<typeof LIMITS> = {}) {
  let time = 0;
  const cache = new QueryEmbeddingCache({ ...LIMITS, ...overrides }, () => time);
  return { cache, advance: (ms: number) => { time += ms; } };
}
function counting(vector = [1, 2]) {
  let calls = 0;
  return { produce: async () => { calls++; return vector; }, calls: () => calls };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function outcome(promise: Promise<number[]>) {
  return promise.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
}
async function flush() {
  await new Promise<void>(resolve => setImmediate(resolve));
}

describe('bounded query embedding cache', () => {
  it('exports_the_proposed_bounded_defaults', () => {
    expect(DEFAULT_QUERY_CACHE_LIMITS).toEqual(LIMITS);
    expect(Object.isFrozen(DEFAULT_QUERY_CACHE_LIMITS)).toBe(true);
  });
  it('same_query_hits_once', async () => {
    const { cache } = fixture();
    const provider = counting();
    expect(await cache.getOrCreate(key(), provider.produce)).toEqual([1, 2]);
    expect(await cache.getOrCreate(key(), provider.produce)).toEqual([1, 2]);
    expect(provider.calls()).toBe(1);
    expect(cache.stats()).toMatchObject({ entries: 1, vectorBytes: 16, hits: 1, misses: 1 });
  });

  it('twenty_repeated_queries_use_one_call', async () => {
    const { cache } = fixture();
    const provider = counting();
    for (let i = 0; i < 20; i++) expect(await cache.getOrCreate(key(), provider.produce)).toEqual([1, 2]);
    expect(provider.calls()).toBe(1);
    expect(cache.stats()).toMatchObject({ entries: 1, vectorBytes: 16, hits: 19, misses: 1 });
  });

  it('identity_and_representation_partition', async () => {
    const { cache } = fixture();
    const base = key();
    let calls = 0;
    const cases = [base,
      { ...base, identity: { ...base.identity, provider: 'other' } },
      { ...base, identity: { ...base.identity, model: 'other' } },
      { ...base, identity: { ...base.identity, dimensions: 3 } },
      { ...base, queryRepresentationVersion: 'other' },
      { ...base, documentRepresentationVersion: 'other' }];
    for (const item of cases) {
      const produce = async () => { calls++; return Array(item.identity.dimensions).fill(calls); };
      await cache.getOrCreate(item, produce);
      await cache.getOrCreate(item, produce);
    }
    expect(calls).toBe(cases.length);
    expect(cache.stats().entries).toBe(cases.length);
  });

  it('unicode_is_exact', async () => {
    const { cache } = fixture();
    const provider = counting();
    const queries = ['é', 'e\u0301', 'Ω', 'ω', 'query', ' query', 'query ', 'two words', 'two  words', 'two\twords', 'a\0b', 'a'];
    for (const query of queries) {
      await cache.getOrCreate(key(query), provider.produce);
      await cache.getOrCreate(key(query), provider.produce);
    }
    expect(provider.calls()).toBe(queries.length);
  });

  it('tuple_boundaries_do_not_collide', async () => {
    const { cache } = fixture();
    const provider = counting();
    const a = { ...key(), identity: { provider: 'a\0b', model: 'c', dimensions: 2 } };
    const b = { ...key(), identity: { provider: 'a', model: 'b\0c', dimensions: 2 } };
    await cache.getOrCreate(a, provider.produce);
    await cache.getOrCreate(b, provider.produce);
    await cache.getOrCreate(a, provider.produce);
    expect(provider.calls()).toBe(2);
  });

  it('ttl_is_absolute', async () => {
    const { cache, advance } = fixture({ ttlMs: 100 });
    const provider = counting();
    await cache.getOrCreate(key(), provider.produce);
    advance(99);
    await cache.getOrCreate(key(), provider.produce);
    expect(provider.calls()).toBe(1);
    advance(1);
    await cache.getOrCreate(key(), provider.produce);
    expect(provider.calls()).toBe(2);
    expect(cache.stats().evictions).toBe(0);
  });

  it('lru_and_byte_limits', async () => {
    const { cache } = fixture({ maxEntries: 2, maxVectorBytes: 32 });
    const provider = counting();
    await cache.getOrCreate(key('a'), provider.produce);
    await cache.getOrCreate(key('b'), provider.produce);
    await cache.getOrCreate(key('a'), provider.produce);
    await cache.getOrCreate(key('c'), provider.produce);
    expect(cache.stats()).toMatchObject({ entries: 2, vectorBytes: 32, evictions: 1 });
    await cache.getOrCreate(key('a'), provider.produce);
    expect(provider.calls()).toBe(3);
    await cache.getOrCreate(key('b'), provider.produce);
    expect(provider.calls()).toBe(4);
    expect(cache.stats()).toMatchObject({ entries: 2, vectorBytes: 32, evictions: 2 });
  });

  it('byte_budget_evicts_before_entry_budget', async () => {
    const { cache } = fixture({ maxEntries: 8, maxVectorBytes: 24 });
    const provider = counting();
    await cache.getOrCreate(key('a'), provider.produce);
    await cache.getOrCreate(key('b'), provider.produce);
    expect(cache.stats()).toMatchObject({ entries: 1, vectorBytes: 16, evictions: 1 });
  });

  it('larger_than_budget_is_returned_without_storage', async () => {
    const { cache } = fixture({ maxVectorBytes: 8 });
    const provider = counting();
    expect(await cache.getOrCreate(key(), provider.produce)).toEqual([1, 2]);
    expect(await cache.getOrCreate(key(), provider.produce)).toEqual([1, 2]);
    expect(provider.calls()).toBe(2);
    expect(cache.stats()).toMatchObject({ entries: 0, vectorBytes: 0 });
  });

  it('caller_mutation_is_isolated', async () => {
    const { cache } = fixture();
    const original = [1, 2];
    const provider = counting(original);
    const first = await cache.getOrCreate(key(), provider.produce);
    first[0] = 900;
    original[1] = 800;
    const second = await cache.getOrCreate(key(), provider.produce);
    expect(second).toEqual([1, 2]);
    second.push(300);
    expect(await cache.getOrCreate(key(), provider.produce)).toEqual([1, 2]);
    expect(provider.calls()).toBe(1);
  });

  it.each([[], [1], [1, 2, 3], [NaN, 1], [1, Infinity], [1, -Infinity], new Array(2), ['1', 2], null])(
    'invalid_vector_is_rejected_and_not_cached %#', async vector => {
      const { cache } = fixture();
      let calls = 0;
      const produce = async () => { calls++; return vector as number[]; };
      await expect(cache.getOrCreate(key(), produce)).rejects.toThrow(/vector/i);
      await expect(cache.getOrCreate(key(), produce)).rejects.toThrow(/vector/i);
      expect(calls).toBe(2);
      expect(cache.stats()).toMatchObject({ entries: 0, vectorBytes: 0 });
    });

  it.each(['maxEntries', 'maxVectorBytes', 'maxFlights', 'maxWaiters', 'maxQueryBytes'] as const)(
    'rejects_invalid_%s', field => {
      expect(() => fixture({ [field]: -1 })).toThrow(/limit/i);
      expect(() => fixture({ [field]: 0.5 })).toThrow(/limit/i);
      expect(() => fixture({ [field]: Infinity })).toThrow(/limit/i);
    });

  it('rejects_invalid_ttl_and_dimensions', async () => {
    expect(() => fixture({ ttlMs: -1 })).toThrow(/limit/i);
    expect(() => fixture({ ttlMs: NaN })).toThrow(/limit/i);
    const { cache } = fixture();
    const provider = counting();
    await expect(cache.getOrCreate({ ...key(), identity: { ...key().identity, dimensions: 0 } }, provider.produce)).rejects.toThrow(/dimension/i);
    expect(provider.calls()).toBe(0);
  });

  it('copies_limits_and_reports_only_aggregate_stats', async () => {
    const limits = { ...LIMITS, maxEntries: 1 };
    const cache = new QueryEmbeddingCache(limits, () => 0);
    limits.maxEntries = 10;
    const provider = counting();
    await cache.getOrCreate(key('PRIVATE_QUERY_SENTINEL'), provider.produce);
    await cache.getOrCreate(key('other'), provider.produce);
    expect(cache.stats()).toMatchObject({ entries: 1, vectorBytes: 16, evictions: 1 });
    expect(Object.keys(cache.stats()).sort()).toEqual(['bypasses', 'entries', 'evictions', 'flights', 'hits', 'joins', 'misses', 'vectorBytes']);
    expect(inspect(cache, { depth: null })).not.toContain('PRIVATE_QUERY_SENTINEL');
    expect(inspect(cache, { depth: null })).not.toContain('synthetic');
  });
});

describe('singleflight and local cancellation', () => {
  it('eight_waiters_one_call', async () => {
    const { cache } = fixture();
    const pending = deferred<number[]>();
    let calls = 0;
    const produce = () => { calls++; return pending.promise; };
    const waiters = Array.from({ length: 8 }, () => cache.getOrCreate(key(), produce));
    const active = cache.stats();
    pending.resolve([1, 2]);
    const results = await Promise.all(waiters);
    expect(calls).toBe(1);
    expect(active).toMatchObject({ flights: 1, misses: 8, joins: 7 });
    results[0][0] = 900;
    expect(results.slice(1)).toEqual(Array.from({ length: 7 }, () => [1, 2]));
    expect(await cache.getOrCreate(key(), produce)).toEqual([1, 2]);
    expect(cache.stats()).toMatchObject({ flights: 0, entries: 1, vectorBytes: 16 });
  });

  it('one_abort_others_complete', async () => {
    const { cache } = fixture();
    const pending = deferred<number[]>();
    const controller = new AbortController();
    let calls = 0;
    const produce = () => { calls++; return pending.promise; };
    const cancelled = outcome(cache.getOrCreate(key(), produce, controller.signal));
    const survivor = cache.getOrCreate(key(), produce);
    controller.abort();
    expect((await cancelled).error).toMatchObject({ name: 'AbortError' });
    expect(cache.stats().flights).toBe(1);
    pending.resolve([1, 2]);
    expect(await survivor).toEqual([1, 2]);
    expect(calls).toBe(1);
    expect(cache.stats()).toMatchObject({ entries: 1, flights: 0 });
  });

  it('all_abort_no_cache_and_slot_retained_until_settle', async () => {
    const { cache } = fixture({ maxFlights: 1 });
    const pending = deferred<number[]>();
    const a = new AbortController();
    const b = new AbortController();
    const waiters = [outcome(cache.getOrCreate(key(), () => pending.promise, a.signal)),
      outcome(cache.getOrCreate(key(), () => pending.promise, b.signal))];
    a.abort(); b.abort();
    const active = cache.stats();
    const provider = counting([3, 4]);
    const fallback = await cache.getOrCreate(key('other'), provider.produce);
    const pressure = cache.stats();
    pending.resolve([1, 2]);
    const results = await Promise.all(waiters);
    await flush();
    expect(results.every(result => result.error?.name === 'AbortError')).toBe(true);
    expect(active.flights).toBe(1);
    expect(pressure).toMatchObject({ flights: 1, bypasses: 1, entries: 0 });
    expect(fallback).toEqual([3, 4]);
    expect(cache.stats()).toMatchObject({ entries: 0, flights: 0, vectorBytes: 0 });
    await cache.getOrCreate(key(), provider.produce);
    expect(provider.calls()).toBe(2);
    expect(cache.stats().entries).toBe(1);
  });

  it('abandoned_same_key_bypasses_without_replacing_the_retained_flight', async () => {
    const { cache } = fixture();
    const pending = deferred<number[]>();
    const controller = new AbortController();
    const cancelled = outcome(cache.getOrCreate(key(), () => pending.promise, controller.signal));
    controller.abort();
    const provider = counting([3, 4]);
    expect(await cache.getOrCreate(key(), provider.produce)).toEqual([3, 4]);
    const active = cache.stats();
    pending.resolve([1, 2]);
    expect((await cancelled).error).toMatchObject({ name: 'AbortError' });
    await flush();
    expect(active).toMatchObject({ flights: 1, bypasses: 1, entries: 0 });
    expect(provider.calls()).toBe(1);
    expect(cache.stats()).toMatchObject({ flights: 0, entries: 0 });
  });

  it.each(['resolve', 'reject', 'malformed'] as const)('abandoned_late_%s_has_no_unhandled_rejection', async settlement => {
    const { cache } = fixture();
    const pending = deferred<number[]>();
    const controller = new AbortController();
    const events: unknown[] = [];
    const listener = (error: unknown) => events.push(error);
    process.on('unhandledRejection', listener);
    try {
      const cancelled = outcome(cache.getOrCreate(key(), () => pending.promise, controller.signal));
      controller.abort();
      if (settlement === 'reject') pending.reject(new Error('synthetic late failure'));
      else pending.resolve(settlement === 'malformed' ? [NaN, 2] : [1, 2]);
      expect((await cancelled).error).toMatchObject({ name: 'AbortError' });
      await flush();
      expect(events).toEqual([]);
      expect(cache.stats()).toMatchObject({ flights: 0, entries: 0 });
    } finally {
      process.removeListener('unhandledRejection', listener);
    }
  });

  it('clear_while_pending_preserves_waiters_and_isolates_new_generation', async () => {
    const { cache } = fixture();
    const oldProvider = deferred<number[]>();
    const newProvider = deferred<number[]>();
    const oldWaiter = cache.getOrCreate(key(), () => oldProvider.promise);
    cache.clear();
    const newWaiter = cache.getOrCreate(key(), () => newProvider.promise);
    newProvider.resolve([3, 4]);
    expect(await newWaiter).toEqual([3, 4]);
    oldProvider.resolve([1, 2]);
    expect(await oldWaiter).toEqual([1, 2]);
    const provider = counting([5, 6]);
    expect(await cache.getOrCreate(key(), provider.produce)).toEqual([3, 4]);
    expect(provider.calls()).toBe(0);
    expect(cache.stats()).toMatchObject({ entries: 1, vectorBytes: 16, flights: 0 });
  });

  it('clear_does_not_release_pending_flight_capacity', async () => {
    const { cache } = fixture({ maxFlights: 1 });
    const pending = deferred<number[]>();
    const waiter = cache.getOrCreate(key(), () => pending.promise);
    cache.clear();
    const fallback = counting([3, 4]);
    await cache.getOrCreate(key(), fallback.produce);
    const active = cache.stats();
    pending.resolve([1, 2]);
    await waiter;
    expect(active).toMatchObject({ flights: 1, entries: 0, bypasses: 1 });
    expect(cache.stats()).toMatchObject({ entries: 0, flights: 0 });
  });

  it('rejected_flight_retries', async () => {
    const { cache } = fixture();
    const pending = deferred<number[]>();
    let calls = 0;
    const produce = () => { calls++; return pending.promise; };
    const waiters = [outcome(cache.getOrCreate(key(), produce)), outcome(cache.getOrCreate(key(), produce))];
    const failure = new Error('synthetic timeout');
    pending.reject(failure);
    const failures = await Promise.all(waiters);
    expect(failures.map(result => result.error)).toEqual([failure, failure]);
    expect(calls).toBe(1);
    expect(cache.stats()).toMatchObject({ entries: 0, flights: 0 });
    const retry = counting();
    expect(await cache.getOrCreate(key(), retry.produce)).toEqual([1, 2]);
    expect(retry.calls()).toBe(1);
  });

  it('synchronously_throwing_producer_retries_without_slot_leak', async () => {
    const { cache } = fixture();
    await expect(cache.getOrCreate(key(), () => { throw new Error('synthetic failure'); })).rejects.toThrow('synthetic failure');
    expect(cache.stats()).toMatchObject({ entries: 0, flights: 0 });
    expect(await cache.getOrCreate(key(), async () => [1, 2])).toEqual([1, 2]);
  });

  it('capacity_bypass_is_explicit', async () => {
    const { cache } = fixture({ maxFlights: 1, maxWaiters: 2 });
    const providers: ReturnType<typeof deferred<number[]>>[] = [];
    const produce = () => { const pending = deferred<number[]>(); providers.push(pending); return pending.promise; };
    const waiters = [cache.getOrCreate(key(), produce), cache.getOrCreate(key(), produce),
      cache.getOrCreate(key(), produce), cache.getOrCreate(key('other'), produce)];
    const active = cache.stats();
    providers.forEach((pending, i) => pending.resolve([i + 1, i + 1]));
    const results = await Promise.all(waiters);
    expect(providers).toHaveLength(3);
    expect(active).toMatchObject({ flights: 1, joins: 1, bypasses: 2, misses: 4 });
    expect(results).toEqual([[1, 1], [1, 1], [2, 2], [3, 3]]);
    expect(cache.stats()).toMatchObject({ flights: 0, entries: 1, vectorBytes: 16 });
  });

  it('abort_frees_a_waiter_slot_without_abandoning_survivors', async () => {
    const { cache } = fixture({ maxWaiters: 2 });
    const pending = deferred<number[]>();
    const controller = new AbortController();
    let calls = 0;
    const produce = () => { calls++; return pending.promise; };
    const cancelled = outcome(cache.getOrCreate(key(), produce, controller.signal));
    const first = cache.getOrCreate(key(), produce);
    controller.abort();
    const second = cache.getOrCreate(key(), produce);
    pending.resolve([1, 2]);
    expect((await cancelled).error).toMatchObject({ name: 'AbortError' });
    expect(await Promise.all([first, second])).toEqual([[1, 2], [1, 2]]);
    expect(calls).toBe(1);
    expect(cache.stats()).toMatchObject({ joins: 2, bypasses: 0, entries: 1 });
  });

  it('oversize_query_bypasses_cache_and_singleflight_using_utf8_bytes', async () => {
    const { cache } = fixture({ maxQueryBytes: 4 });
    const provider = counting();
    await cache.getOrCreate(key('éé'), provider.produce);
    await cache.getOrCreate(key('éé'), provider.produce);
    const pending = deferred<number[]>();
    let calls = 0;
    const produce = () => { calls++; return pending.promise; };
    const waiters = [cache.getOrCreate(key('ééa'), produce), cache.getOrCreate(key('ééa'), produce)];
    const active = cache.stats();
    pending.resolve([1, 2]);
    await Promise.all(waiters);
    expect(provider.calls()).toBe(1);
    expect(calls).toBe(2);
    expect(active).toMatchObject({ bypasses: 2, flights: 0, entries: 1 });
    expect(cache.stats().entries).toBe(1);
  });

  it('ttl_starts_at_valid_completion', async () => {
    const { cache, advance } = fixture({ ttlMs: 100 });
    const pending = deferred<number[]>();
    const waiter = cache.getOrCreate(key(), () => pending.promise);
    advance(1000);
    pending.resolve([1, 2]);
    await waiter;
    advance(99);
    const provider = counting();
    await cache.getOrCreate(key(), provider.produce);
    expect(provider.calls()).toBe(0);
    advance(1);
    await cache.getOrCreate(key(), provider.produce);
    expect(provider.calls()).toBe(1);
  });

  it('identity_mutation_during_flight_cannot_relabel_the_result', async () => {
    const { cache } = fixture();
    const input = key();
    const original = key();
    const pending = deferred<number[]>();
    const oldWaiter = cache.getOrCreate(input, () => pending.promise);
    input.identity.provider = 'new-provider';
    input.identity.model = 'new-model';
    input.identity.dimensions = 3;
    input.queryRepresentationVersion = 'new-query';
    input.documentRepresentationVersion = 'new-document';
    const fresh = await cache.getOrCreate(input, async () => [3, 4, 5]);
    pending.resolve([1, 2]);
    expect(await oldWaiter).toEqual([1, 2]);
    expect(fresh).toEqual([3, 4, 5]);
    const provider = counting([7, 8]);
    expect(await cache.getOrCreate(original, provider.produce)).toEqual([1, 2]);
    expect(provider.calls()).toBe(0);
    expect(cache.stats()).toMatchObject({ entries: 2, vectorBytes: 40 });
  });

  it('preaborted_signal_avoids_provider_and_warm_cache', async () => {
    const { cache } = fixture();
    const provider = counting();
    await cache.getOrCreate(key(), provider.produce);
    const controller = new AbortController();
    controller.abort();
    await expect(cache.getOrCreate(key(), provider.produce, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(cache.getOrCreate(key('cold'), provider.produce, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(provider.calls()).toBe(1);
    expect(cache.stats()).toMatchObject({ misses: 1, hits: 0 });
  });

  it.each(['admitted', 'oversize', 'flight-capacity', 'waiter-capacity'] as const)('dispose_is_terminal_for_%s', async path => {
    const { cache } = fixture(path === 'oversize' ? { maxQueryBytes: 0 }
      : path === 'flight-capacity' ? { maxFlights: 0 }
        : path === 'waiter-capacity' ? { maxWaiters: 0 } : {});
    const pending = deferred<number[]>();
    const waiter = outcome(cache.getOrCreate(key(), () => pending.promise));
    cache.dispose();
    cache.dispose();
    cache.clear();
    const provider = counting();
    const later = outcome(cache.getOrCreate(key(), provider.produce));
    expect((await waiter).error).toMatchObject({ name: 'AbortError' });
    expect((await later).error).toMatchObject({ name: 'AbortError' });
    expect(provider.calls()).toBe(0);
    pending.resolve([1, 2]);
    await flush();
    expect(cache.stats()).toMatchObject({ entries: 0, vectorBytes: 0, flights: 0 });
  });

  it.each(['reject', 'malformed', 'mutated'] as const)('shutdown_late_%s_is_handled', async settlement => {
    const { cache } = fixture();
    const pending = deferred<number[]>();
    const events: unknown[] = [];
    const listener = (error: unknown) => events.push(error);
    process.on('unhandledRejection', listener);
    try {
      const waiter = outcome(cache.getOrCreate(key(), () => pending.promise));
      cache.dispose();
      if (settlement === 'reject') pending.reject(new Error('synthetic late failure'));
      else {
        const vector = [1, 2];
        pending.resolve(settlement === 'malformed' ? [NaN, 2] : vector);
        if (settlement === 'mutated') vector[0] = NaN;
      }
      expect((await waiter).error).toMatchObject({ name: 'AbortError' });
      await flush();
      expect(events).toEqual([]);
      expect(cache.stats()).toMatchObject({ flights: 0, entries: 0 });
    } finally {
      process.removeListener('unhandledRejection', listener);
    }
  });

  it.each(['success', 'failure', 'abort', 'dispose'] as const)('removes_waiter_abort_listener_after_%s', async settlement => {
    const { cache } = fixture();
    const pending = deferred<number[]>();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const waiter = outcome(cache.getOrCreate(key(), () => pending.promise, controller.signal));
    if (settlement === 'abort') controller.abort();
    if (settlement === 'dispose') cache.dispose();
    if (settlement === 'failure') pending.reject(new Error('synthetic failure'));
    else pending.resolve([1, 2]);
    await waiter;
    await flush();
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
    add.mockRestore(); remove.mockRestore();
  });

  it.each(['maxEntries', 'maxVectorBytes', 'ttlMs'] as const)('zero_%s_prevents_storage_but_preserves_singleflight', async field => {
    const { cache } = fixture({ [field]: 0 });
    const pending = deferred<number[]>();
    let calls = 0;
    const produce = () => { calls++; return pending.promise; };
    const waiters = [cache.getOrCreate(key(), produce), cache.getOrCreate(key(), produce)];
    pending.resolve([1, 2]);
    expect(await Promise.all(waiters)).toEqual([[1, 2], [1, 2]]);
    expect(calls).toBe(1);
    expect(cache.stats()).toMatchObject({ entries: 0, vectorBytes: 0, flights: 0 });
  });

  it('default_flight_and_waiter_admission_boundaries_are_exact', async () => {
    const { cache } = fixture();
    const providers: ReturnType<typeof deferred<number[]>>[] = [];
    const produce = () => { const pending = deferred<number[]>(); providers.push(pending); return pending.promise; };
    const repeated = Array.from({ length: 33 }, () => cache.getOrCreate(key(), produce));
    const distinct = Array.from({ length: 8 }, (_, i) => cache.getOrCreate(key(`distinct-${i}`), produce));
    const active = cache.stats();
    providers.forEach(pending => pending.resolve([1, 2]));
    expect(await Promise.all([...repeated, ...distinct])).toHaveLength(41);
    expect(providers).toHaveLength(10);
    expect(active).toMatchObject({ flights: 8, joins: 31, bypasses: 2 });
    expect(cache.stats()).toMatchObject({ flights: 0, entries: 8, vectorBytes: 128 });
  });

  it('reentrant_producer_joins_the_registered_flight', async () => {
    const { cache } = fixture();
    const pending = deferred<number[]>();
    let nested!: Promise<number[]>;
    let calls = 0;
    const outer = cache.getOrCreate(key(), () => {
      calls++;
      nested = cache.getOrCreate(key(), async () => { calls++; return [9, 9]; });
      return pending.promise;
    });
    pending.resolve([1, 2]);
    expect(await Promise.all([outer, nested])).toEqual([[1, 2], [1, 2]]);
    expect(calls).toBe(1);
    expect(cache.stats()).toMatchObject({ joins: 1, entries: 1, vectorBytes: 16 });
  });

  it('mutated_invalid_completion_rejects_all_live_waiters_and_retries', async () => {
    const { cache } = fixture();
    const pending = deferred<number[]>();
    const waiters = [outcome(cache.getOrCreate(key(), () => pending.promise)),
      outcome(cache.getOrCreate(key(), () => pending.promise))];
    const vector = [1, 2];
    pending.resolve(vector);
    vector[0] = NaN;
    const results = await Promise.all(waiters);
    expect(results.every(result => result.error instanceof TypeError)).toBe(true);
    expect(cache.stats()).toMatchObject({ entries: 0, flights: 0, vectorBytes: 0 });
    expect(await cache.getOrCreate(key(), async () => [3, 4])).toEqual([3, 4]);
  });

  it.each(['oversize', 'flight-capacity', 'waiter-capacity'] as const)('bypass_%s_handles_abort_and_late_rejection', async path => {
    const { cache } = fixture(path === 'oversize' ? { maxQueryBytes: 0 }
      : path === 'flight-capacity' ? { maxFlights: 0 } : { maxWaiters: 0 });
    const pending = deferred<number[]>();
    const controller = new AbortController();
    const waiter = outcome(cache.getOrCreate(key(), () => pending.promise, controller.signal));
    controller.abort();
    expect((await waiter).error).toMatchObject({ name: 'AbortError' });
    pending.reject(new Error('synthetic late bypass failure'));
    await flush();
    expect(cache.stats()).toMatchObject({ entries: 0, flights: 0, vectorBytes: 0, bypasses: 1 });
  });

  it.each(['oversize', 'flight-capacity', 'waiter-capacity'] as const)('bypass_%s_rejects_malformed_vectors_and_never_stores', async path => {
    const { cache } = fixture(path === 'oversize' ? { maxQueryBytes: 0 }
      : path === 'flight-capacity' ? { maxFlights: 0 } : { maxWaiters: 0 });
    await expect(cache.getOrCreate(key(), async () => [NaN, 2])).rejects.toThrow(/vector/i);
    const provider = counting();
    await cache.getOrCreate(key(), provider.produce);
    await cache.getOrCreate(key(), provider.produce);
    expect(provider.calls()).toBe(2);
    expect(cache.stats()).toMatchObject({ entries: 0, flights: 0, vectorBytes: 0, bypasses: 3 });
  });
});
