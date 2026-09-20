type ResponseLike = {
  body?: unknown;
  arrayBuffer(): Promise<ArrayBuffer>;
};

async function collectBody(response: ResponseLike, maxBytes: number, label: string): Promise<Buffer> {
  const max = Math.max(0, maxBytes);
  const body = response.body as any;
  const chunks: Buffer[] = [];
  let total = 0;
  const push = (chunk: Uint8Array | Buffer | string) => {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.length;
    if (total > max) throw new Error(`${label} exceeded ${max} bytes`);
    chunks.push(value);
  };

  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        if (item.value) push(item.value);
      }
    } catch (error) {
      try { await reader.cancel(); } catch { /* preserve the original read/limit error */ }
      throw error;
    } finally {
      try { reader.releaseLock(); } catch { /* best effort */ }
    }
    return Buffer.concat(chunks, total);
  }
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) push(chunk);
    return Buffer.concat(chunks, total);
  }

  const fallback = Buffer.from(await response.arrayBuffer());
  if (fallback.length > max) throw new Error(`${label} exceeded ${max} bytes`);
  return fallback;
}

export async function readResponseBytesBounded(
  response: ResponseLike,
  maxBytes: number,
  label = 'response',
): Promise<Buffer> {
  return collectBody(response, maxBytes, label);
}

export async function readResponseTextBounded(
  response: ResponseLike,
  maxBytes: number,
  label = 'response',
): Promise<string> {
  return (await collectBody(response, maxBytes, label)).toString('utf8');
}

export async function readResponseJsonBounded<T>(
  response: ResponseLike,
  maxBytes: number,
  label = 'response',
): Promise<T> {
  return JSON.parse(await readResponseTextBounded(response, maxBytes, label)) as T;
}
