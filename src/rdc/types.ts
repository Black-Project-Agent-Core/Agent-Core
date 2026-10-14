import type { ChildProcess } from 'node:child_process';
import type { PreviewFileType } from './ui/file-preview/shared/preview-file-types.js';

export interface ProcessInfo {
  pid: number;
  command: string;
  cpu: string;
  memory: string;
}

export interface TerminalOutputSpillInfo {
  path?: string;
  bytes: number;
  complete: boolean;
  digest?: string;
  issue?: string;
}

export interface TerminalSession {
  pid: number;
  process: ChildProcess;
  outputLines: string[];
  lastReadIndex: number;
  isBlocked: boolean;
  startTime: Date;
  bufferedChars: number;
  evictedLines: number;
  evictedChars: number;
}

export interface CommandExecutionResult {
  pid: number;
  output: string;
  isBlocked: boolean;
  processObservation?: ProcessObservation;
  waitReason?: TimingInfo['exitReason'];
  timingInfo?: TimingInfo;
}

/** Read-only, bounded lifecycle evidence for one manager-owned process instance. */
export type ProcessObservation = {
  pid: number;
  startTime: number;
  observedAt: number;
} & (
  | { state: 'exit-observed'; basis: 'child-exit'; exitCode: number | null }
  | { state: 'managed'; basis: 'managed-session' }
  | { state: 'unavailable'; basis: 'unavailable'; reasonCode: 'missing' | 'replaced' | 'detached' | 'process-error' }
);

export interface TimingInfo {
  startTime: number;
  endTime: number;
  totalDurationMs: number;
  exitReason: 'early_exit_quick_pattern' | 'early_exit_periodic_check' | 'process_exit' | 'process_unavailable' | 'timeout';
  firstOutputTime?: number;
  lastOutputTime?: number;
  timeToFirstOutputMs?: number;
  outputEvents?: OutputEvent[];
}

export interface OutputEvent {
  timestamp: number;
  deltaMs: number;
  source: 'stdout' | 'stderr';
  length: number;
  snippet: string;
  matchedPattern?: string;
}

export interface ActiveSession { pid: number; isBlocked: boolean; runtime: number }
export interface CompletedSession {
  pid: number; output: string; exitCode: number | null; startTime: Date; endTime: Date;
}

export interface ServerResponseContent {
  type: string; text?: string; data?: string; mimeType?: string;
}
export interface FilePreviewStructuredContent {
  fileName: string;
  filePath: string;
  fileType: PreviewFileType;
  sourceTool?: 'read_file' | 'write_file' | 'edit_block';
  defaultEditorName?: string;
  defaultEditorPath?: string;
  content?: string;
  mimeType?: string;
}

export interface ServerResult {
  content: ServerResponseContent[];
  structuredContent?: FilePreviewStructuredContent | Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export type ToolHandler<T = unknown> = (args: T) => Promise<ServerResult>;
