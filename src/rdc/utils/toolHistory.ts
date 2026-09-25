import { ServerResult } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_DIR } from '../config.js';
import { compactFailureEvidence, type CompactFailureEvidence } from '../../failure-evidence.js';
import { redactSensitiveString, redactSensitiveValue } from '../../security/redaction.js';

export interface ToolCallRecord {
  timestamp: string;
  toolName: string;
  arguments: any;
  output: ServerResult;
  failureEvidence?: CompactFailureEvidence;
  duration?: number;
}

interface FormattedToolCallRecord extends Omit<ToolCallRecord, 'timestamp' | 'failureEvidence'> {
  timestamp: string; // formatted local time string
}

export interface CompactToolCallRecord {
  timestamp: string;
  toolName: string;
  argumentsSummary: string;
  outcome: 'success' | 'error';
  failureFamily?: string;
  outputExcerpt?: string;
  duration?: number;
}

// Format timestamp in local timezone for display
function formatLocalTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function boundText(value: string, maxChars: number): string {
  const normalized = redactSensitiveString(value).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  const marker = ' … [truncated] … ';
  const remaining = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(remaining * 0.6);
  const tail = Math.floor(remaining * 0.4);
  return normalized.slice(0, head) + marker + normalized.slice(-tail);
}

function compactArguments(args: unknown, maxChars = 800): string {
  try {
    const sanitized = redactSensitiveValue(args ?? {});
    return boundText(JSON.stringify(sanitized) ?? '{}', maxChars);
  } catch {
    return '[arguments unavailable]';
  }
}

export class ToolHistory {
  private history: ToolCallRecord[] = [];
  private readonly MAX_ENTRIES = 1000;
  /**
   * Cap on the output kept per entry. Entries hold the FULL ServerResult, and
   * get_recent_tool_calls serialises them straight back out, so without a cap
   * the history is unbounded in two compounding ways:
   *
   *   - a single large output (a big read_file, a wide list_directory) makes
   *     every later history dump that includes it large too, and
   *   - any tool whose output happens to CONTAIN a history dump â€” e.g.
   *     `cat`-ing a file a previous dump was written to â€” nests the whole
   *     history inside itself, and each nesting level roughly doubles the JSON
   *     escaping. Observed 2026-07-27: 83KB of arguments on disk produced a
   *     1.89MB in-memory dump this way.
   *
   * Excluding more tool names cannot fix that, because the nesting arrives
   * through ordinary tools. Capping the stored output does, and a preview is
   * all this history is for â€” it is a "what happened recently" aid, not a
   * result cache.
   */
  private readonly MAX_STORED_OUTPUT_BYTES = 4 * 1024;
  private readonly MAX_HISTORY_FILE_SIZE_BYTES = 5 * 1024 * 1024;
  // When the file exceeds the cap we trim it down to this target instead of
  // all the way to zero, so a single overflow doesn't cause every subsequent
  // flush to re-trim.
  private readonly HISTORY_FILE_TRIM_TARGET_BYTES = 4 * 1024 * 1024;
  private readonly historyFile: string;
  private writeQueue: ToolCallRecord[] = [];
  private isWriting = false;
  private writeInterval?: NodeJS.Timeout;

  constructor(historyDir = CONFIG_DIR) {
    // Store history in same directory as config to keep everything together.
    // Tests may inject an isolated directory; production keeps CONFIG_DIR.
    
    // Ensure directory exists
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }
    
    // Use append-only JSONL format (JSON Lines)
    this.historyFile = path.join(historyDir, 'tool-history.jsonl');
    
    // Load existing history on startup
    this.loadFromDisk();
    
    // Start async write processor
    this.startWriteProcessor();
  }

  /**
   * Load history from disk (all instances share the same file)
   */
  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.historyFile)) {
        return;
      }

      // If the file is over the cap, trim it down before reading so we
      // load a bounded amount.
      this.trimHistoryFileIfTooLarge();

      const content = fs.readFileSync(this.historyFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      // Parse + sanitize every persisted record. This also scrubs historical
      // secrets on startup rather than only protecting newly-added calls.
      const records: ToolCallRecord[] = [];
      const sanitizedLines: string[] = [];
      let rewriteNeeded = false;
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as ToolCallRecord;
          const sanitized = this.sanitizeRecord(parsed);
          records.push(sanitized);
          sanitizedLines.push(JSON.stringify(sanitized));
          if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) rewriteNeeded = true;
        } catch (e) {
          rewriteNeeded = true;
        }
      }
      if (rewriteNeeded) {
        fs.writeFileSync(this.historyFile, sanitizedLines.length ? `${sanitizedLines.join('\n')}\n` : '', 'utf-8');
      }

      // Keep only last 1000 entries, and cap on the way IN as well as on the
      // way out. Entries written before the cap existed are still on disk and
      // are well under the whole-file trim threshold, so without this the cap
      // does nothing for anyone upgrading with an existing history file â€” i.e.
      // for everyone it was written for.
      this.history = records
        .slice(-this.MAX_ENTRIES)
        .map(record => ({ ...record, output: this.capOutput(record.output) }));

      // If file is getting too large, trim it
      if (lines.length > this.MAX_ENTRIES * 2) {
        this.trimHistoryFile();
      }
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Trim the on-disk history file to stay under the size cap by dropping the
   * oldest entries (lines) until the kept tail fits within the trim target.
   * Returns true only when the file was actually rewritten with a smaller
   * tail, so callers can fall through to their normal path on failure or
   * no-op rather than mutating in-memory state.
   *
   * Always keeps at least the most recent entry, even if a single record
   * exceeds the trim target â€” there is no useful state below that.
   */
  private trimHistoryFileIfTooLarge(): boolean {
    let stats: fs.Stats;
    try {
      if (!fs.existsSync(this.historyFile)) {
        return false;
      }
      stats = fs.statSync(this.historyFile);
      if (stats.size <= this.MAX_HISTORY_FILE_SIZE_BYTES) {
        return false;
      }
    } catch (error) {
      return false;
    }

    try {
      const content = fs.readFileSync(this.historyFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.length > 0);
      if (lines.length === 0) {
        return false;
      }

      // Walk lines from newest to oldest, accumulating bytes (line + '\n'),
      // and keep as many as fit within the trim target. Always keep at
      // least the last line.
      const kept: string[] = [];
      let bytes = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        const lineBytes = Buffer.byteLength(lines[i], 'utf-8') + 1; // +1 for '\n'
        if (kept.length > 0 && bytes + lineBytes > this.HISTORY_FILE_TRIM_TARGET_BYTES) {
          break;
        }
        kept.push(lines[i]);
        bytes += lineBytes;
      }
      kept.reverse();

      fs.writeFileSync(this.historyFile, kept.join('\n') + '\n', 'utf-8');
      return true;
    } catch (error) {
      // Trim failed; do not claim the file was changed.
      return false;
    }
  }

  /**
   * Trim history file to prevent it from growing indefinitely
   */
  private trimHistoryFile(): void {
    try {
      // Keep last 1000 entries in memory
      const keepEntries = this.history.slice(-this.MAX_ENTRIES);

      // Write them back
      const lines = keepEntries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      fs.writeFileSync(this.historyFile, lines, 'utf-8');
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Async write processor - batches writes to avoid blocking
   */
  private startWriteProcessor(): void {
    this.writeInterval = setInterval(() => {
      if (this.writeQueue.length > 0 && !this.isWriting) {
        this.flushToDisk();
      }
    }, 1000); // Flush every second
    
    // Prevent interval from keeping process alive during shutdown/tests
    this.writeInterval.unref();
  }

  /**
   * Flush queued writes to disk
   */
  private async flushToDisk(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) return;

    this.isWriting = true;
    const toWrite = [...this.writeQueue];
    this.writeQueue = [];

    try {
      // If the on-disk file has grown past the cap, trim it down to the
      // target size (keeping the most recent entries) before appending.
      // The in-memory cache is unaffected â€” it is already bounded by
      // MAX_ENTRIES via addCall.
      this.trimHistoryFileIfTooLarge();

      // Append to file (atomic append operation)
      const lines = toWrite.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      fs.appendFileSync(this.historyFile, lines, 'utf-8');
    } catch (error) {
      // Put back in queue on failure
      this.writeQueue.unshift(...toWrite);
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Add a tool call to history
   */
  private sanitizeRecord(record: ToolCallRecord): ToolCallRecord {
    const sanitizedOutput = redactSensitiveValue(record.output) as ServerResult;
    const existingEvidence = record.failureEvidence
      ? redactSensitiveValue(record.failureEvidence) as CompactFailureEvidence
      : undefined;
    const failureEvidence = sanitizedOutput?.isError
      ? (existingEvidence ?? compactFailureEvidence(sanitizedOutput))
      : undefined;
    return {
      ...record,
      arguments: redactSensitiveValue(record.arguments),
      output: sanitizedOutput,
      ...(failureEvidence ? { failureEvidence } : {}),
    };
  }

  /**
   * Replace an oversized output with a short marker. Keeps the record shape
   * ({ content: [...] }) so readers and formatters need no special case.
   */
  private capOutput(output: ServerResult): ServerResult {
    let size: number;
    try {
      size = JSON.stringify(output)?.length ?? 0;
    } catch {
      // Circular or otherwise unserialisable â€” it could never be returned to a
      // client anyway, so don't retain it.
      size = Number.POSITIVE_INFINITY;
    }
    if (size <= this.MAX_STORED_OUTPUT_BYTES) return output;

    const shown = Number.isFinite(size) ? `${size} bytes` : 'unserialisable';
    return {
      ...(output as any),
      content: [
        {
          type: 'text',
          text: `[output omitted from history: ${shown}, over the ${this.MAX_STORED_OUTPUT_BYTES}-byte cap]`,
        },
      ],
    } as ServerResult;
  }

  addCall(
    toolName: string,
    args: any,
    output: ServerResult,
    duration?: number
  ): void {
    const record = this.sanitizeRecord({
      timestamp: new Date().toISOString(),
      toolName,
      arguments: args,
      output,
      duration,
    });
    record.output = this.capOutput(record.output);

    this.history.push(record);

    // Keep only last 1000 in memory
    if (this.history.length > this.MAX_ENTRIES) {
      this.history.shift();
    }
    
    // Queue for async write
    this.writeQueue.push(record);
  }

  /**
   * Get recent tool calls with filters
   */
  getRecentCalls(options: {
    maxResults?: number;
    toolName?: string;
    since?: string;
    failuresOnly?: boolean;
  }): ToolCallRecord[] {
    let results = [...this.history];

    // Filter by tool name
    if (options.toolName) {
      results = results.filter(r => r.toolName === options.toolName);
    }

    // Filter by timestamp
    if (options.since) {
      const sinceDate = new Date(options.since);
      results = results.filter(r => new Date(r.timestamp) >= sinceDate);
    }

    if (options.failuresOnly) {
      results = results.filter(r => Boolean(r.output?.isError || r.failureEvidence?.outcome === 'error'));
    }

    // Limit results (default 50, max 1000)
    const limit = Math.min(options.maxResults || 50, 1000);
    return results.slice(-limit);
  }

  /**
   * Get recent calls formatted with local timezone
   */
  getRecentCallsFormatted(options: {
    maxResults?: number;
    toolName?: string;
    since?: string;
    failuresOnly?: boolean;
  }): FormattedToolCallRecord[] {
    const calls = this.getRecentCalls(options);
    
    // Keep the historical/default response shape: failureEvidence is internal
    // and is exposed only through explicit compact mode.
    return calls.map(call => {
      const { failureEvidence: _failureEvidence, ...visible } = call;
      return {
        ...visible,
        timestamp: formatLocalTimestamp(call.timestamp)
      };
    });
  }

  /**
   * Return a compact evidence capsule without raw tool output.
   * Failed calls prefer failureEvidence captured before large-output capping.
   */
  getRecentCallsCompact(options: {
    maxResults?: number;
    toolName?: string;
    since?: string;
    failuresOnly?: boolean;
  }): CompactToolCallRecord[] {
    return this.getRecentCalls(options).map(call => {
      const isError = Boolean(call.output?.isError || call.failureEvidence?.outcome === 'error');
      const evidence = isError
        ? (call.failureEvidence ?? compactFailureEvidence(call.output))
        : compactFailureEvidence(call.output, 600);
      return {
        timestamp: formatLocalTimestamp(call.timestamp),
        toolName: call.toolName,
        argumentsSummary: compactArguments(call.arguments),
        outcome: isError ? 'error' : 'success',
        ...(isError && evidence.failureFamily ? { failureFamily: evidence.failureFamily } : {}),
        ...(evidence.outputExcerpt ? { outputExcerpt: evidence.outputExcerpt } : {}),
        ...(typeof call.duration === 'number' ? { duration: call.duration } : {}),
      };
    });
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      totalEntries: this.history.length,
      oldestEntry: this.history[0]?.timestamp,
      newestEntry: this.history[this.history.length - 1]?.timestamp,
      historyFile: this.historyFile,
      queuedWrites: this.writeQueue.length
    };
  }

  /**
   * Cleanup method - clears interval and flushes pending writes
   * Call this during shutdown or in tests
   */
  async cleanup(): Promise<void> {
    // Clear the interval
    if (this.writeInterval) {
      clearInterval(this.writeInterval);
      this.writeInterval = undefined;
    }
    
    // Flush any remaining writes
    if (this.writeQueue.length > 0) {
      await this.flushToDisk();
    }
  }
}

export const toolHistory = new ToolHistory();
