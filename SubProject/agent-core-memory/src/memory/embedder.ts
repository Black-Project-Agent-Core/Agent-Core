import { fetchWithPolicy, correlationSuffix } from '../net/outbound-request.js';
import { readResponseJsonBounded } from '../net/bounded-response.js';

export interface MemoryEmbedderIdentity {
  provider: string;
  model: string;
  dimensions: number;
}

export interface MemoryEmbedder {
  readonly identity: MemoryEmbedderIdentity;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export interface CloudflareEmbedderConfig {
  accountId: string;
  apiToken: string;
  model: string;
  dimensions?: number;
}

const DEFAULT_DIMENSIONS = 768;
const MAX_CHUNK_CHARS = 1_600;
const MAX_CHUNKS_PER_DOCUMENT = 6;
const API_BATCH_SIZE = 32;

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 0) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}
function chunkDocument(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [''];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length && chunks.length < MAX_CHUNKS_PER_DOCUMENT) {
    const remainingSlots = MAX_CHUNKS_PER_DOCUMENT - chunks.length;
    const remainingChars = normalized.length - cursor;
    if (remainingSlots === 1) {
      chunks.push(normalized.slice(Math.max(cursor, normalized.length - MAX_CHUNK_CHARS)));
      break;
    }
    let end = Math.min(normalized.length, cursor + MAX_CHUNK_CHARS);
    if (end < normalized.length) {
      const paragraph = normalized.lastIndexOf('\n', end);
      const sentence = normalized.lastIndexOf('. ', end);
      const space = normalized.lastIndexOf(' ', end);
      const boundary = Math.max(paragraph, sentence, space);
      if (boundary > cursor + Math.floor(MAX_CHUNK_CHARS * 0.6)) end = boundary + 1;
    }
    chunks.push(normalized.slice(cursor, end).trim());
    cursor = end;
    if (remainingChars > MAX_CHUNK_CHARS * remainingSlots) {
      const proportional = Math.floor((normalized.length - cursor) / Math.max(1, remainingSlots - 1));
      cursor = Math.max(cursor, normalized.length - proportional * (remainingSlots - 1));
    }
  }
  return chunks.filter(Boolean);
}

function averageVectors(vectors: number[][], dimensions: number): number[] {
  if (!vectors.length) return Array(dimensions).fill(0);
  const sum = Array(dimensions).fill(0) as number[];
  for (const vector of vectors) {
    if (vector.length !== dimensions) throw new Error(`Embedding dimension mismatch: expected ${dimensions}, got ${vector.length}`);
    for (let i = 0; i < dimensions; i++) sum[i] += vector[i];
  }
  return normalizeVector(sum.map((value) => value / vectors.length));
}
export class CloudflareWorkersAIEmbedder implements MemoryEmbedder {
  readonly identity: MemoryEmbedderIdentity;
  private readonly endpoint: string;

  constructor(private readonly config: CloudflareEmbedderConfig) {
    if (!config.accountId.trim() || !config.apiToken.trim() || !config.model.trim()) {
      throw new Error('Cloudflare embedding configuration is incomplete');
    }
    this.identity = {
      provider: 'cloudflare-workers-ai',
      model: config.model.trim(),
      dimensions: config.dimensions ?? DEFAULT_DIMENSIONS,
    };
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId.trim())}/ai/v1/embeddings`;
  }

  private async embedBatch(input: string[]): Promise<number[][]> {
    const requestBody = JSON.stringify({ model: this.identity.model, input });
    if (Buffer.byteLength(requestBody) > 2 * 1024 * 1024) {
      throw new Error('Cloudflare embedding request exceeded 2097152 bytes');
    }
    const response = await fetchWithPolicy(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiToken}`,
        'content-type': 'application/json',
      },
      body: requestBody,
    }, {
      safety: 'safe',
      maxAttempts: 3,
      maxTotalDelayMs: 8_000,
      timeoutMs: 30_000,
    });
    if (!response.ok) throw new Error(`Cloudflare embedding request failed with HTTP ${response.status}${correlationSuffix(response)}`);
    const body = await readResponseJsonBounded<{ data?: Array<{ index?: number; embedding?: number[] }> }>(
      response,
      8 * 1024 * 1024,
      'Cloudflare embedding response',
    );
    if (!Array.isArray(body.data) || body.data.length !== input.length) {
      throw new Error('Cloudflare embedding response did not contain the expected vector count');
    }
    return body.data
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => {
        if (!Array.isArray(item.embedding)) throw new Error('Cloudflare embedding response contained an invalid vector');
        return normalizeVector(item.embedding.map(Number));
      });
  }
  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const flattened: Array<{ documentIndex: number; text: string }> = [];
    texts.forEach((text, documentIndex) => {
      for (const chunk of chunkDocument(text)) flattened.push({ documentIndex, text: chunk });
    });

    const chunkVectors: number[][] = [];
    for (let offset = 0; offset < flattened.length; offset += API_BATCH_SIZE) {
      const batch = flattened.slice(offset, offset + API_BATCH_SIZE);
      chunkVectors.push(...await this.embedBatch(batch.map((item) => item.text)));
    }

    const grouped = texts.map(() => [] as number[][]);
    flattened.forEach((item, index) => grouped[item.documentIndex].push(chunkVectors[index]));
    return grouped.map((vectors) => averageVectors(vectors, this.identity.dimensions));
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  const denominator = Math.sqrt(aa) * Math.sqrt(bb);
  return denominator > 0 ? dot / denominator : 0;
}
