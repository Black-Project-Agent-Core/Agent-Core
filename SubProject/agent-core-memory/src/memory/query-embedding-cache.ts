import { createHash } from 'node:crypto';
import type { MemoryEmbedderIdentity } from './embedder.js';

export interface QueryEmbeddingKey {
  identity: MemoryEmbedderIdentity;
  queryRepresentationVersion: string;
  documentRepresentationVersion: string;
  query: string;
}

export interface QueryCacheLimits {
  maxEntries: number;
  maxVectorBytes: number;
  ttlMs: number;
  maxFlights: number;
  maxWaiters: number;
  maxQueryBytes: number;
}

export const DEFAULT_QUERY_CACHE_LIMITS: Readonly<QueryCacheLimits> = Object.freeze({
  maxEntries: 128,
  maxVectorBytes: 2 * 1024 * 1024,
  ttlMs: 60_000,
  maxFlights: 8,
  maxWaiters: 32,
  maxQueryBytes: 16 * 1024,
});

interface Entry {
  vector: number[];
  bytes: number;
  expiresAt: number;
}

interface Waiter {
  resolve: (vector: number[]) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface Flight {
  digest?: string;
  generation: bigint;
  dimensions: number;
  waiters: Set<Waiter>;
  abandoned: boolean;
}

function abortError(): Error {
  const error = new Error('Query embedding wait aborted');
  error.name = 'AbortError';
  return error;
}

function hashKey(key: QueryEmbeddingKey, generation: bigint): string {
  const hash = createHash('sha256');
  for (const part of ['memory-query-cache/v1', key.identity.provider, key.identity.model,
    String(key.identity.dimensions), key.queryRepresentationVersion,
    key.documentRepresentationVersion, String(generation), key.query]) {
    const bytes = Buffer.from(part, 'utf8');
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(length);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

function copyValidVector(vector: number[], dimensions: number): number[] {
  if (!Array.isArray(vector) || !vector.length || vector.length !== dimensions) {
    throw new TypeError('Query embedding vector has invalid dimensions');
  }
  const copy: number[] = [];
  for (let i = 0; i < vector.length; i++) {
    const value = vector[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError('Query embedding vector must contain finite numbers');
    }
    copy.push(value);
  }
  return copy;
}

/** Volatile, owner-local vectors only. No corpus, trust decision or raw key is retained. */
export class QueryEmbeddingCache {
  private readonly limits: Readonly<QueryCacheLimits>;
  private readonly entries = new Map<string, Entry>();
  private readonly flights = new Map<string, Flight>();
  // Bypasses use the existing provider admission path, but their callers still
  // need terminal disposal and rejection handling. They do not occupy cache slots.
  private readonly bypassFlights = new Set<Flight>();
  private generation = 0n;
  private disposed = false;
  private vectorBytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private joins = 0;
  private bypasses = 0;

  constructor(limits: QueryCacheLimits, private readonly now: () => number = () => performance.now()) {
    for (const field of ['maxEntries', 'maxVectorBytes', 'maxFlights', 'maxWaiters', 'maxQueryBytes'] as const) {
      if (!Number.isSafeInteger(limits[field]) || limits[field] < 0) throw new TypeError(`Invalid query cache limit: ${field}`);
    }
    if (!Number.isFinite(limits.ttlMs) || limits.ttlMs < 0) throw new TypeError('Invalid query cache limit: ttlMs');
    this.limits = { ...limits };
  }

  getOrCreate(key: QueryEmbeddingKey, produce: () => Promise<number[]>, signal?: AbortSignal): Promise<number[]> {
    if (this.disposed || signal?.aborted) return Promise.reject(abortError());
    const dimensions = key.identity.dimensions;
    if (!Number.isSafeInteger(dimensions) || dimensions <= 0) {
      return Promise.reject(new TypeError('Query embedding dimensions must be positive integers'));
    }
    const generation = this.generation;
    if (Buffer.byteLength(key.query, 'utf8') > this.limits.maxQueryBytes) {
      this.misses++;
      this.bypasses++;
      return this.begin(undefined, generation, dimensions, produce, signal);
    }
    const digest = hashKey(key, generation);
    this.expire(this.now());
    const entry = this.entries.get(digest);
    if (entry) {
      this.hits++;
      this.entries.delete(digest);
      this.entries.set(digest, entry);
      return Promise.resolve(entry.vector.slice());
    }
    this.misses++;
    const existing = this.flights.get(digest);
    if (existing && !existing.abandoned && existing.waiters.size < this.limits.maxWaiters) {
      this.joins++;
      return this.addWaiter(existing, signal);
    }
    if (existing || this.flights.size >= this.limits.maxFlights || !this.limits.maxWaiters) {
      this.bypasses++;
      return this.begin(undefined, generation, dimensions, produce, signal);
    }
    return this.begin(digest, generation, dimensions, produce, signal);
  }

  clear(): void {
    this.generation++;
    this.entries.clear();
    this.vectorBytes = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    for (const flight of [...this.flights.values(), ...this.bypassFlights]) {
      flight.abandoned = true;
      for (const waiter of [...flight.waiters]) {
        this.detach(flight, waiter);
        waiter.reject(abortError());
      }
    }
  }

  stats(): { entries: number; vectorBytes: number; flights: number; hits: number; misses: number; joins: number; evictions: number; bypasses: number } {
    this.expire(this.now());
    return { entries: this.entries.size, vectorBytes: this.vectorBytes, flights: this.flights.size,
      hits: this.hits, misses: this.misses, joins: this.joins, evictions: this.evictions, bypasses: this.bypasses };
  }

  private begin(digest: string | undefined, generation: bigint, dimensions: number,
    produce: () => Promise<number[]>, signal?: AbortSignal): Promise<number[]> {
    const flight: Flight = { digest, generation, dimensions, waiters: new Set(), abandoned: false };
    if (digest) this.flights.set(digest, flight);
    else this.bypassFlights.add(flight);
    const waiter = this.addWaiter(flight, signal);
    // Invoke immediately and retain neither the producer nor its raw key.
    // The embedder has no AbortSignal transport contract: abort only releases
    // local waiters, and the flight remains registered until provider settlement.
    try {
      void Promise.resolve(produce()).then(
        vector => this.complete(flight, vector),
        error => this.fail(flight, error),
      );
    } catch (error) {
      this.fail(flight, error);
    }
    return waiter;
  }

  private addWaiter(flight: Flight, signal?: AbortSignal): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      flight.waiters.add(waiter);
      if (signal) {
        waiter.onAbort = () => {
          this.detach(flight, waiter);
          if (!flight.waiters.size) flight.abandoned = true;
          reject(abortError());
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
        if (signal.aborted) waiter.onAbort();
      }
    });
  }

  private detach(flight: Flight, waiter: Waiter): void {
    flight.waiters.delete(waiter);
    if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener('abort', waiter.onAbort);
  }

  private release(flight: Flight): void {
    if (flight.digest && this.flights.get(flight.digest) === flight) this.flights.delete(flight.digest);
    else this.bypassFlights.delete(flight);
  }

  private complete(flight: Flight, vector: number[]): void {
    this.release(flight);
    if (flight.abandoned || this.disposed || !flight.waiters.size) return;
    try {
      const copy = copyValidVector(vector, flight.dimensions);
      if (flight.digest && flight.generation === this.generation) this.store(flight.digest, copy);
      for (const waiter of [...flight.waiters]) {
        this.detach(flight, waiter);
        waiter.resolve(copy.slice());
      }
    } catch (error) {
      this.fail(flight, error);
    }
  }

  private fail(flight: Flight, error: unknown): void {
    this.release(flight);
    for (const waiter of [...flight.waiters]) {
      this.detach(flight, waiter);
      waiter.reject(error);
    }
  }

  private expire(now: number): void {
    for (const [digest, entry] of this.entries) {
      if (now >= entry.expiresAt) {
        this.entries.delete(digest);
        this.vectorBytes -= entry.bytes;
      }
    }
  }

  private store(digest: string, vector: number[]): void {
    const bytes = vector.length * 8;
    if (!this.limits.maxEntries || !this.limits.ttlMs || bytes > this.limits.maxVectorBytes) return;
    const now = this.now();
    this.expire(now);
    while (this.entries.size >= this.limits.maxEntries || this.vectorBytes + bytes > this.limits.maxVectorBytes) {
      const oldest = this.entries.keys().next().value!;
      this.vectorBytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
      this.evictions++;
    }
    this.entries.set(digest, { vector: vector.slice(), bytes, expiresAt: now + this.limits.ttlMs });
    this.vectorBytes += bytes;
  }
}
