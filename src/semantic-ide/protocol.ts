import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import net, { type Socket } from 'node:net';
import { snapshotDescendantPids, terminateCapturedPids, terminateOwnedProcessTree } from './process-lifetime.js';
import type { SemanticLanguageServerTransport } from './types.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  generation: number;
}

type NotificationHandler = (method: string, params: unknown) => void;
type ServerRequestHandler = (method: string, params: unknown) => unknown | Promise<unknown>;

export class LspResponseError extends Error {
  constructor(readonly code: number, message: string) {
    super(`SEMANTIC_IDE_LSP_ERROR: ${code} ${message}`.trim());
    this.name = 'LspResponseError';
  }
}

export class LspServerRequestError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = 'LspServerRequestError';
  }
}

export class LspConnection {
  private process?: ChildProcessWithoutNullStreams;
  private socket?: Socket;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private lastStderr = '';
  private readonly knownDescendants = new Set<number>();
  private readonly retryOnContentModified = new Set<string>();
  private closing = false;
  private generation = 0;
  private terminalFailure?: { generation: number; error: Error };

  constructor(
    private readonly command: string | undefined,
    private readonly args: string[],
    private readonly cwd: string,
    private readonly timeoutMs: number,
    private readonly onNotification?: NotificationHandler,
    private readonly onServerRequest?: ServerRequestHandler,
    private readonly env?: NodeJS.ProcessEnv,
    private readonly transport: SemanticLanguageServerTransport = { kind: 'stdio-owned' },
  ) {}

  get pid(): number | undefined {
    return this.transport.kind === 'stdio-owned' ? this.process?.pid : undefined;
  }

  get state(): string {
    if (this.terminalFailure?.generation === this.generation) return 'failed';
    if (this.transport.kind === 'tcp-external') {
      if (!this.socket) return 'stopped';
      return this.socket.destroyed ? 'exited' : 'running';
    }
    if (!this.process) return 'stopped';
    return this.process.exitCode === null ? 'running' : 'exited';
  }

  get stderr(): string {
    return this.lastStderr;
  }

  setContentModifiedRetryMethods(methods: readonly string[]): void {
    this.retryOnContentModified.clear();
    for (const method of methods) this.retryOnContentModified.add(method);
  }

  private currentTerminalError(): Error | undefined {
    return this.terminalFailure?.generation === this.generation ? this.terminalFailure.error : undefined;
  }

  private failGeneration(generation: number, error: Error): void {
    if (generation !== this.generation || this.closing || this.terminalFailure?.generation === generation) return;
    this.terminalFailure = { generation, error };
    for (const [id, pending] of this.pending) {
      if (pending.generation !== generation) continue;
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  async refreshOwnedProcessTree(): Promise<number[]> {
    if (this.transport.kind === 'tcp-external') return [];
    const pid = this.process?.pid;
    if (!pid) return [];
    const descendants = await snapshotDescendantPids(pid);
    for (const childPid of descendants) this.knownDescendants.add(childPid);
    return descendants;
  }

  async start(): Promise<void> {
    const terminal = this.currentTerminalError();
    if (this.transport.kind === 'tcp-external') {
      if (this.socket && !this.socket.destroyed) {
        if (terminal) throw terminal;
        return;
      }
    } else if (this.process && this.process.exitCode === null) {
      if (terminal) throw terminal;
      return;
    }
    if (this.transport.kind === 'stdio-owned' && !this.command) throw new Error('SEMANTIC_IDE_SERVER_COMMAND_REQUIRED');

    const generation = ++this.generation;
    this.terminalFailure = undefined;
    this.closing = false;
    this.buffer = Buffer.alloc(0);
    this.lastStderr = '';

    if (this.transport.kind === 'tcp-external') {
      await this.startExternalTcp(generation);
      return;
    }

    const child = spawn(this.command!, this.args, {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: this.env ?? process.env,
      detached: process.platform !== 'win32',
    });
    this.process = child;
    child.stdout.on('data', chunk => this.consume(Buffer.from(chunk), generation));
    child.stdin.on('error', error => {
      if (generation !== this.generation) return;
      const message = error instanceof Error ? error.message : String(error);
      this.lastStderr = (this.lastStderr + ` stdin=${message}`).slice(-4000);
      this.failGeneration(generation, new Error(`SEMANTIC_IDE_SERVER_PIPE_ERROR: ${message}`));
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      if (generation !== this.generation) return;
      this.lastStderr = (this.lastStderr + String(chunk)).slice(-4000);
    });
    child.once('exit', (code, signal) => {
      if (generation !== this.generation) return;
      if (!this.closing) {
        this.failGeneration(generation, new Error(
          `SEMANTIC_IDE_SERVER_EXITED: code=${code ?? 'null'} signal=${signal ?? 'null'} ${this.lastStderr}`.trim(),
        ));
      }
      if (this.knownDescendants.size) void terminateCapturedPids([...this.knownDescendants], true);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('SEMANTIC_IDE_SERVER_START_TIMEOUT')), this.timeoutMs);
        child.once('spawn', () => { clearTimeout(timer); resolve(); });
        child.once('error', error => { clearTimeout(timer); reject(error); });
      });
      await this.refreshOwnedProcessTree().catch(() => []);
    } catch (error) {
      const pid = child.pid;
      const descendants = pid ? await snapshotDescendantPids(pid).catch(() => []) : [];
      if (pid) await terminateOwnedProcessTree(pid, descendants, true).catch(() => undefined);
      if (generation === this.generation) this.process = undefined;
      throw error;
    }
  }

  private async startExternalTcp(generation: number): Promise<void> {
    const transport = this.transport;
    if (transport.kind !== 'tcp-external') return;
    const host = transport.host.trim().toLowerCase();
    if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
      throw new Error(`SEMANTIC_TCP_NON_LOOPBACK_REFUSED: ${transport.host}`);
    }

    const deadline = Date.now() + Math.min(this.timeoutMs, transport.connectTimeoutMs ?? this.timeoutMs);
    const retryDelayMs = Math.max(50, Math.min(2000, transport.retryDelayMs ?? 250));
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const socket = await new Promise<Socket>((resolve, reject) => {
          const candidate = net.createConnection({ host: transport.host, port: transport.port });
          candidate.setTimeout(Math.max(100, Math.min(2_000, deadline - Date.now())), () => {
            candidate.destroy(new Error('SEMANTIC_IDE_TCP_CONNECT_TIMEOUT'));
          });
          const onError = (error: Error) => {
            candidate.removeListener('connect', onConnect);
            candidate.destroy();
            reject(error);
          };
          const onConnect = () => {
            candidate.setTimeout(0);
            candidate.removeListener('error', onError);
            resolve(candidate);
          };
          candidate.once('error', onError);
          candidate.once('connect', onConnect);
        });
        if (generation !== this.generation) {
          socket.destroy();
          throw new Error('SEMANTIC_IDE_STALE_TRANSPORT_GENERATION');
        }
        socket.setNoDelay(true);
        this.socket = socket;
        socket.on('data', chunk => this.consume(Buffer.from(chunk), generation));
        socket.on('error', error => {
          if (generation !== this.generation) return;
          const message = error instanceof Error ? error.message : String(error);
          this.lastStderr = (this.lastStderr + ` tcp=${message}`).slice(-4000);
          this.failGeneration(generation, new Error(`SEMANTIC_IDE_TCP_ERROR: ${message}`));
        });
        socket.once('close', () => {
          if (generation !== this.generation || this.closing) return;
          this.failGeneration(generation, new Error('SEMANTIC_IDE_TCP_CLOSED'));
        });
        return;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
    throw new Error(`SEMANTIC_IDE_TCP_CONNECT_FAILED: ${lastError instanceof Error ? lastError.message : String(lastError ?? 'timeout')}`);
  }

  private async requestOnce(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const terminal = this.currentTerminalError();
    if (terminal) throw terminal;
    const running = this.transport.kind === 'tcp-external'
      ? Boolean(this.socket && !this.socket.destroyed)
      : Boolean(this.process && this.process.exitCode === null);
    if (!running) throw new Error('SEMANTIC_IDE_SERVER_NOT_RUNNING');
    const generation = this.generation;
    const id = this.nextId++;
    const payload: Record<string, unknown> = { jsonrpc: '2.0', id, method };
    if (params !== undefined) payload.params = params;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`SEMANTIC_IDE_LSP_TIMEOUT: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, generation });
      try {
        this.write(payload, generation);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async request(method: string, params?: unknown, timeoutMs = this.timeoutMs): Promise<unknown> {
    const maxAttempts = this.retryOnContentModified.has(method) ? 3 : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.requestOnce(method, params, timeoutMs);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof LspResponseError && error.code === -32801;
        if (!retryable || attempt === maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  notify(method: string, params?: unknown): void {
    if (this.currentTerminalError()) return;
    const running = this.transport.kind === 'tcp-external'
      ? Boolean(this.socket && !this.socket.destroyed)
      : Boolean(this.process && this.process.exitCode === null);
    if (!running) return;
    const payload: Record<string, unknown> = { jsonrpc: '2.0', method };
    if (params !== undefined) payload.params = params;
    this.write(payload, this.generation);
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.transport.kind === 'tcp-external') {
      const socket = this.socket;
      this.socket = undefined;
      if (socket && !socket.destroyed) socket.destroy();
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('SEMANTIC_IDE_TCP_CLOSED'));
        this.pending.delete(id);
      }
      this.terminalFailure = undefined;
      this.buffer = Buffer.alloc(0);
      return;
    }
    const child = this.process;
    if (!child) {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('SEMANTIC_IDE_SERVER_CLOSED'));
        this.pending.delete(id);
      }
      this.terminalFailure = undefined;
      this.buffer = Buffer.alloc(0);
      return;
    }
    const pid = child.pid;
    const descendants = pid ? await snapshotDescendantPids(pid).catch(() => []) : [];
    for (const childPid of descendants) this.knownDescendants.add(childPid);

    if (child.exitCode === null) {
      try { await this.request('shutdown', undefined, Math.min(this.timeoutMs, 3000)); } catch {}
      this.notify('exit');
      await new Promise<void>(resolve => {
        if (child.exitCode !== null) return resolve();
        const timer = setTimeout(() => resolve(), 1500);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }

    if (child.exitCode === null && pid) {
      await terminateOwnedProcessTree(pid, [...this.knownDescendants], true).catch(() => undefined);
    } else if (this.knownDescendants.size) {
      await terminateCapturedPids([...this.knownDescendants], true).catch(() => undefined);
    }
    this.process = undefined;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('SEMANTIC_IDE_SERVER_CLOSED'));
      this.pending.delete(id);
    }
    this.knownDescendants.clear();
    this.terminalFailure = undefined;
    this.buffer = Buffer.alloc(0);
  }

  private write(payload: unknown, expectedGeneration = this.generation): void {
    if (expectedGeneration !== this.generation) return;
    const terminal = this.currentTerminalError();
    if (terminal) throw terminal;
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const header = Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, 'ascii');
    const message = Buffer.concat([header, body]);
    if (this.transport.kind === 'tcp-external') {
      if (!this.socket || this.socket.destroyed) throw new Error('SEMANTIC_IDE_SERVER_NOT_RUNNING');
      this.socket.write(message);
      return;
    }
    if (!this.process || this.process.exitCode !== null) throw new Error('SEMANTIC_IDE_SERVER_NOT_RUNNING');
    this.process.stdin.write(message);
  }

  private consume(chunk: Buffer, generation: number): void {
    if (generation !== this.generation) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number.parseInt(match[1]!, 10);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      this.buffer = this.buffer.subarray(bodyStart + length);
      try { this.dispatch(JSON.parse(body) as Record<string, unknown>, generation); }
      catch { /* Malformed provider output is fail-soft; pending request timeout preserves truth. */ }
    }
  }

  private dispatch(message: Record<string, unknown>, generation: number): void {
    if (generation !== this.generation) return;
    const rawId = message.id;
    const requestId = typeof rawId === 'number'
      ? rawId
      : typeof rawId === 'string' && /^\d+$/.test(rawId)
        ? Number(rawId)
        : undefined;

    if ((typeof rawId === 'number' || typeof rawId === 'string') && typeof message.method === 'string') {
      void this.replyToServerRequest(rawId, message.method, message.params, generation);
      return;
    }

    if (requestId !== undefined) {
      const pending = this.pending.get(requestId);
      if (!pending || pending.generation !== generation) return;
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
      if (message.error && typeof message.error === 'object') {
        const detail = message.error as { code?: number; message?: string };
        pending.reject(new LspResponseError(Number(detail.code ?? -32603), String(detail.message ?? '')));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (typeof message.method === 'string' && this.onNotification) {
      this.onNotification(message.method, message.params);
    }
  }

  private async replyToServerRequest(id: number | string, method: string, params: unknown, generation: number): Promise<void> {
    try {
      if (!this.onServerRequest) throw new LspServerRequestError(-32601, `Method not found: ${method}`);
      const result = await this.onServerRequest(method, params);
      this.write({ jsonrpc: '2.0', id, result }, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      const code = error instanceof LspServerRequestError ? error.code : -32603;
      const message = error instanceof Error ? error.message : String(error);
      this.write({ jsonrpc: '2.0', id, error: { code, message } }, generation);
    }
  }
}
