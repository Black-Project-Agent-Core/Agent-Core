// Adapted from iFurySt/open-browser-use JS client / wire protocol at b136cac.
// MIT, Copyright (c) 2026 Leo. See open-browser-use-LICENSE.txt.
import { randomUUID } from 'node:crypto';
import { endianness } from 'node:os';
import type { Readable, Writable } from 'node:stream';

const MAX_FRAME = 1024 * 1024;
const LITTLE_ENDIAN = endianness() === 'LE';
type Pending = { method: string; resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export interface ObuPipe { input: Writable; output: Readable; stop(): void }

/** One socket epoch. Never reconnects, retries or accepts an upstream session override. */
export class OpenBrowserUseRpc {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly pending = new Map<string, Pending>();
  private readonly prefix = randomUUID() + ':';
  private sequence = 0;
  private ended = false;
  onNotification?: (method: string, params: any) => void;
  get closed(): boolean { return this.ended; }

  constructor(private readonly pipe: ObuPipe, readonly sessionId: string, private readonly timeoutMs = 10_000) {
    pipe.output.on('data', this.receive);
    pipe.output.once('end', this.transportClosed);
    pipe.output.once('close', this.transportClosed);
    pipe.output.on('error', this.transportClosed);
    pipe.input.on('error', this.transportClosed);
  }

  request(method: string, params: Record<string, unknown> = {}, timeoutMs = this.timeoutMs): Promise<any> {
    if (this.ended) return Promise.reject(new Error('BROWSER_OBU_SESSION_CLOSED'));
    if (this.pending.size >= 16) return Promise.reject(new Error('BROWSER_OBU_PENDING_LIMIT'));
    const id = this.prefix + (++this.sequence);
    const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method,
      params: { ...params, session_id: this.sessionId, turn_id: id } }), 'utf8');
    if (payload.length > MAX_FRAME) return Promise.reject(new Error('BROWSER_OBU_REQUEST_TOO_LARGE'));
    const header = Buffer.alloc(4);
    if (LITTLE_ENDIAN) header.writeUInt32LE(payload.length); else header.writeUInt32BE(payload.length);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close(new Error('BROWSER_OBU_REQUEST_TIMEOUT_UNKNOWN')), timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      try { this.pipe.input.write(Buffer.concat([header, payload]), error => { if (error) this.transportClosed(); }); }
      catch { this.transportClosed(); }
    });
  }

  private readonly transportClosed = (): void => this.close(new Error('BROWSER_OBU_CONNECTION_LOST_UNKNOWN'));
  private readonly receive = (chunk: Buffer): void => {
    if (this.ended) return;
    // stdout chunks are bounded by the pipe; consume all complete frames before the next chunk.
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4 && !this.ended) {
      const length = LITTLE_ENDIAN ? this.buffer.readUInt32LE(0) : this.buffer.readUInt32BE(0);
      if (length < 2 || length > MAX_FRAME) { this.close(new Error('BROWSER_OBU_FRAME_INVALID')); return; }
      if (this.buffer.length < length + 4) return;
      const payload = this.buffer.subarray(4, length + 4);
      this.buffer = this.buffer.subarray(length + 4);
      let message: any;
      try { message = JSON.parse(payload.toString('utf8')); }
      catch { this.close(new Error('BROWSER_OBU_FRAME_INVALID')); return; }
      if (!message || Array.isArray(message) || message.jsonrpc !== '2.0') {
        this.close(new Error('BROWSER_OBU_FRAME_INVALID')); return;
      }
      if (Object.hasOwn(message, 'id')) {
        const item = typeof message.id === 'string' ? this.pending.get(message.id) : undefined;
        // The donor broadcasts orphan/foreign responses. They never satisfy our requests.
        if (!item) continue;
        if (Object.hasOwn(message, 'error') === Object.hasOwn(message, 'result')) {
          this.close(new Error('BROWSER_OBU_RESPONSE_INVALID')); return;
        }
        this.pending.delete(message.id); clearTimeout(item.timer);
        // Do not disclose raw backend errors: they can contain page content/arguments.
        if (Object.hasOwn(message, 'error')) {
          // The extension's CDP timeout can respond before our outer timer without cancelling CDP.
          const error = new Error(item.method === 'executeCdp' ? 'BROWSER_OBU_CDP_ERROR_UNKNOWN' : 'BROWSER_OBU_BACKEND_REFUSED');
          item.reject(error);
          if (item.method === 'executeCdp') this.close(error);
        } else item.resolve(message.result);
      } else if (message.method === 'onCDPEvent') {
        this.onNotification?.(message.method, message.params);
      }
    }
  };

  close(reason = new Error('BROWSER_OBU_SESSION_CLOSED')): void {
    if (this.ended) return;
    this.ended = true;
    this.onNotification = undefined;
    this.pipe.output.off('data', this.receive);
    this.buffer = Buffer.alloc(0);
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(reason); }
    this.pending.clear();
    this.pipe.stop();
  }
}
