async function collectBody(response: Response, maxBytes: number, label: string): Promise<Buffer> {
    const max = Math.max(0, maxBytes);
    const body = response.body;
    const chunks: Buffer[] = [];
    let total = 0;
    const push = (chunk: Uint8Array) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += value.length;
        if (total > max)
            throw new Error(`${label} exceeded ${max} bytes`);
        chunks.push(value);
    };
    if (body && typeof body.getReader === 'function') {
        const reader = body.getReader();
        try {
            for (;;) {
                const item = await reader.read();
                if (item.done)
                    break;
                if (item.value)
                    push(item.value);
            }
        }
        catch (error) {
            try {
                await reader.cancel();
            }
            catch { /* preserve the original read/limit error */ }
            throw error;
        }
        finally {
            try {
                reader.releaseLock();
            }
            catch { /* best effort */ }
        }
        return Buffer.concat(chunks, total);
    }
    if (body && typeof (body as unknown as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function') {
        const iterator = (body as unknown as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
        let completed = false;
        let closed = false;
        try {
            for (;;) {
                const item = await iterator.next();
                if (item.done) {
                    completed = true;
                    break;
                }
                if (item.value) push(item.value);
            }
        } catch (error) {
            if (!completed && !closed && typeof iterator.return === 'function') {
                closed = true;
                try { await iterator.return(); } catch { /* preserve original source/limit error */ }
            }
            throw error;
        }
        return Buffer.concat(chunks, total);
    }
    const fallback = Buffer.from(await response.arrayBuffer());
    if (fallback.length > max)
        throw new Error(`${label} exceeded ${max} bytes`);
    return fallback;
}
export async function readResponseBytesBounded(response: Response, maxBytes: number, label = 'response') {
    return collectBody(response, maxBytes, label);
}
export async function readResponseTextBounded(response: Response, maxBytes: number, label = 'response') {
    return (await collectBody(response, maxBytes, label)).toString('utf8');
}
export async function readResponseJsonBounded<T>(response: Response, maxBytes: number, label = 'response'): Promise<T> {
    return JSON.parse(await readResponseTextBounded(response, maxBytes, label));
}
