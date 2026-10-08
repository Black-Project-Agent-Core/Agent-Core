import {
  closeSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readSync,
  statSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';

export interface BoundedEventLogOptions {
  maxBytes?: number;
  maxRecords?: number;
  mode?: number;
  onDiagnostic?: (message: string) => void;
}

export interface EventLogAppendOptions {
  durable?: boolean;
  onCreate?: () => unknown[];
}

function serializeLine(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') throw new TypeError('EVENT_LOG_VALUE_NOT_SERIALIZABLE');
  return serialized + '\n';
}
function readAllSync(fd: number, maxBytes: number | undefined, filePath: string): Buffer {
  const size = fstatSync(fd).size;
  if (maxBytes !== undefined && size > maxBytes) {
    throw new Error(`EVENT_LOG_MAX_BYTES_EXCEEDED: ${filePath} size=${size} max=${maxBytes}`);
  }
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const read = readSync(fd, buffer, offset, size - offset, offset);
    if (read === 0) break;
    offset += read;
  }
  return buffer.subarray(0, offset);
}

function existingSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

export class BoundedJsonlEventLog {
  constructor(
    readonly filePath: string,
    private readonly options: BoundedEventLogOptions = {},
  ) {}
  replaySync<T>(
    parse: (line: string, index: number) => T | undefined,
    options: { missingFileThrows?: boolean } = {},
  ): T[] {
    let fd: number;
    try {
      fd = openSync(this.filePath, 'r');
    } catch (error) {
      if (!options.missingFileThrows && (error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    let bytes: Buffer;
    try {
      bytes = readAllSync(fd, this.options.maxBytes, this.filePath);
    } finally {
      closeSync(fd);
    }

    const text = bytes.toString('utf8');
    const terminated = text.endsWith('\n');
    const rawLines = text.split('\n');
    const output: T[] = [];
    let recordCount = 0;
    for (let index = 0; index < rawLines.length; index += 1) {
      let line = rawLines[index] ?? '';
      if (!line) continue;
      if (index === rawLines.length - 1 && !terminated) {
        this.options.onDiagnostic?.('ignored incomplete final append');
        continue;
      }
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (this.options.maxRecords !== undefined && ++recordCount > this.options.maxRecords) {
        throw new Error(
          `EVENT_LOG_MAX_RECORDS_EXCEEDED: ${this.filePath} max=${this.options.maxRecords}`,
        );
      }
      const parsed = parse(line, index);
      if (parsed !== undefined) output.push(parsed);
    }
    return output;
  }

  appendSync(values: unknown[], options: EventLogAppendOptions = {}): void {
    const lines = values.map(serializeLine);
    const createLines = existingSize(this.filePath) === 0
      ? (options.onCreate?.() ?? []).map(serializeLine)
      : [];
    const payload = Buffer.from([...createLines, ...lines].join(''), 'utf8');
    if (payload.length === 0) return;
    mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    this.repairIncompleteTailSync();

    const current = existingSize(this.filePath);
    if (this.options.maxBytes !== undefined && current + payload.length > this.options.maxBytes) {
      throw new Error(
        `EVENT_LOG_MAX_BYTES_EXCEEDED: ${this.filePath} projected=${current + payload.length} max=${this.options.maxBytes}`,
      );
    }

    const fd = openSync(this.filePath, 'a', this.options.mode ?? 0o600);
    try {
      const written = writeSync(fd, payload);
      if (written !== payload.length) {
        throw new Error(
          `EVENT_LOG_SHORT_WRITE: ${this.filePath} wrote=${written} expected=${payload.length}`,
        );
      }
      if (options.durable) fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  private repairIncompleteTailSync(): void {
    const size = existingSize(this.filePath);
    if (size === 0) return;
    if (this.options.maxBytes !== undefined && size > this.options.maxBytes) {
      throw new Error(
        `EVENT_LOG_MAX_BYTES_EXCEEDED: ${this.filePath} size=${size} max=${this.options.maxBytes}`,
      );
    }

    const fd = openSync(this.filePath, 'r+');
    try {
      const last = Buffer.alloc(1);
      if (readSync(fd, last, 0, 1, size - 1) !== 1 || last[0] === 0x0a) return;

      const first = readAllSync(fd, this.options.maxBytes, this.filePath);
      const second = readAllSync(fd, this.options.maxBytes, this.filePath);
      if (first.length !== second.length || !first.equals(second)) return;
      if (fstatSync(fd).size !== first.length) return;

      const keep = first.lastIndexOf(0x0a) + 1;
      ftruncateSync(fd, keep);
      this.options.onDiagnostic?.(
        `truncated incomplete final append bytes=${first.length - keep}`,
      );
    } finally {
      closeSync(fd);
    }
  }
}
