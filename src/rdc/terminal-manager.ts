import { spawn } from 'child_process';
import path from 'path';
import { TerminalSession, CommandExecutionResult, ActiveSession, TimingInfo, OutputEvent, type TerminalOutputSpillInfo, type ProcessObservation } from './types.js';
import { TerminalOutputSpill, pruneTerminalOutputSpills, type SpillChunk } from './output-spill.js';
import { DEFAULT_COMMAND_TIMEOUT } from './config.js';
import { configManager } from './config-manager.js';
import { buildMachineShellEnv } from '../security/environment.js';
import {capture} from "./utils/capture.js";
import { analyzeProcessState } from './utils/process-detection.js';
import { processLedger, type ProcessLedgerRecord } from './process-ledger.js';
import { snapshotDescendantPids, terminateOwnedProcessTree } from '../process/owned-process-tree.js';
import { resolveModuleProjectRoot } from '../portability/paths.js';
import { StringDecoder } from 'node:string_decoder';
import { describeExitCode, stripAnsi } from './terminal-output.js';
import { currentToolInvocationRequest } from '../tracker/tool-invocation.js';

const MACHINE_CONTROL_PROJECT_ROOT = resolveModuleProjectRoot(import.meta.url);


/**
 * Standard Windows PATHEXT value, used to repair a corrupted PATHEXT before
 * spawning child shells.
 *
 * On some Windows Claude Desktop / DXT launches the server process inherits a
 * broken PATHEXT (observed as ".CPL" only). Because we build the child env from
 * { ...process.env }, that broken value would propagate into every spawned
 * shell, stripping ".EXE" and breaking resolution of git / node / python / rg /
 * etc. (and even full-path .exe invocations under PowerShell). See issue #481.
 */
const STANDARD_PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC';

/**
 * Return a healthy PATHEXT for spawned Windows shells.
 * - Unset           -> use the standard list.
 * - Missing ".EXE"  -> corrupted; merge the standard list with whatever was
 *                      present (preserves any extra extensions, order-stable).
 * - Otherwise       -> leave the inherited value untouched.
 */
function getRepairedPathExt(): string {
  const current = process.env.PATHEXT;
  if (!current) return STANDARD_PATHEXT;
  const exts = current.split(';').map(e => e.trim().toUpperCase()).filter(Boolean);
  if (!exts.includes('.EXE')) {
    return [...new Set([...STANDARD_PATHEXT.split(';'), ...exts])].join(';');
  }
  return current;
}

interface CompletedSession {
  pid: number;
  outputLines: string[];       // Line-based buffer (consistent with active sessions)
  exitCode: number | null;
  startTime: Date;
  endTime: Date;
  evictedLines: number;        // Carried over from the active session (see TerminalSession)
  evictedChars: number;
  spill?: TerminalOutputSpillInfo;
}

interface DetachedSession {
  pid: number;
  startTime: Date;
  commandDigest: string;
  status: ProcessLedgerRecord['status'];
}

/**
 * Output buffering caps. Without a cap, a process emitting enough output makes
 * string concatenation throw "RangeError: Invalid string length" at V8's max
 * string size (~536M chars) inside a stdout 'data' handler — an uncaught
 * exception that kills the whole server (index.ts exits on uncaughtException).
 * The cap also bounds the join() cost in snapshot reads and the periodic
 * process-state scan, both of which are O(total output).
 */
export const MAX_BUFFERED_OUTPUT_CHARS = 50 * 1024 * 1024;  // per session; oldest lines evicted first
const OUTPUT_SPILL_THRESHOLD_CHARS = 4 * 1024 * 1024;
const MAX_LINE_CHARS = 1024 * 1024;                  // force-split longer lines so eviction can work
const MAX_WAIT_OUTPUT_CHARS = 2 * 1024 * 1024;       // start_process wait buffer (prompt/state detection)

// Result type for paginated output reading
export interface PaginatedOutputResult {
  lines: string[];
  totalLines: number;
  readFrom: number;            // Starting line of this read
  readCount: number;           // Number of lines returned
  remaining: number;           // Lines remaining after this read
  isComplete: boolean;         // Whether process has finished
  exitCode?: number | null;    // Exit code if completed
  runtimeMs?: number;          // Runtime in milliseconds (for completed processes)
  evictedLines?: number;       // Lines dropped by the buffer cap; when > 0, line numbers are relative to the retained buffer
  spill?: TerminalOutputSpillInfo;
}

/**
 * Configuration for spawning a shell with appropriate flags
 */
interface ShellSpawnConfig {
  executable: string;
  args: string[];
  useShellOption: string | boolean;
  // When true, pass args verbatim on Windows (see executeCommand). Only cmd.exe
  // needs this; its quote parsing conflicts with libuv's default \" escaping.
  windowsVerbatim?: boolean;
}

/**
 * Get the appropriate spawn configuration for a given shell
 * This handles login shell flags for different shell types
 */
function getShellSpawnArgs(shellPath: string, command: string): ShellSpawnConfig {
  const shellName = path.basename(shellPath).toLowerCase();
  
  // Unix shells with login flag support
  if (shellName.includes('bash') || shellName.includes('zsh')) {
    return { 
      executable: shellPath, 
      args: ['-l', '-c', command],
      useShellOption: false 
    };
  }
  
  // PowerShell Core (cross-platform, supports -Login)
  if (shellName === 'pwsh' || shellName === 'pwsh.exe') {
    return { 
      executable: shellPath, 
      args: ['-Login', '-Command', command],
      useShellOption: false 
    };
  }
  
  // Windows PowerShell 5.1 (no login flag support)
  if (shellName === 'powershell' || shellName === 'powershell.exe') {
    return { 
      executable: shellPath, 
      args: ['-Command', command],
      useShellOption: false 
    };
  }
  
  // CMD
  if (shellName === 'cmd' || shellName === 'cmd.exe') {
    return { 
      executable: shellPath, 
      args: ['/c', command],
      windowsVerbatim: true,
      useShellOption: false 
    };
  }
  
  // Fish shell (uses -l for login, -c for command)
  if (shellName.includes('fish')) {
    return { 
      executable: shellPath, 
      args: ['-l', '-c', command],
      useShellOption: false 
    };
  }
  
  // Unknown/other shells - use shell option for safety
  // This provides a fallback for shells we don't explicitly handle
  return { 
    executable: command,
    args: [],
    useShellOption: shellPath 
  };
}

export class TerminalManager {
  private sessions: Map<number, TerminalSession> = new Map();
  private completedSessions: Map<number, CompletedSession> = new Map();
  private detachedSessions: Map<number, DetachedSession> = new Map();
  private outputSpills = new Map<number, { totalChars: number; prelude: SpillChunk[]; writer?: TerminalOutputSpill; issue?: string }>();

  constructor() {
    pruneTerminalOutputSpills();
    for (const record of processLedger.recoverDetached()) {
      if (record.pid === null) continue;
      this.detachedSessions.set(record.pid, {
        pid: record.pid,
        startTime: new Date(record.createdAt),
        commandDigest: record.commandDigest,
        status: record.status,
      });
    }
  }
  
  /**
   * Send input to a running process
   * @param pid Process ID
   * @param input Text to send to the process
   * @returns Whether input was successfully sent
   */
  sendInputToProcess(pid: number, input: string): boolean {
    const session = this.sessions.get(pid);
    if (!session) {
      return false;
    }
    
    try {
      if (session.process.stdin && !session.process.stdin.destroyed) {
        // Ensure input ends with a newline for most REPLs
        const inputWithNewline = input.endsWith('\n') ? input : input + '\n';
        session.process.stdin.write(inputWithNewline);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error sending input to process ${pid}:`, error);
      return false;
    }
  }
  
  async executeCommand(command: string, timeoutMs: number = DEFAULT_COMMAND_TIMEOUT, shell?: string, collectTiming: boolean = false): Promise<CommandExecutionResult> {
    // Get the shell from config if not specified
    let shellToUse: string | boolean | undefined = shell;
    if (!shellToUse) {
      try {
        const config = await configManager.getConfig();
        shellToUse = config.defaultShell || true;
      } catch (error) {
        // If there's an error getting the config, fall back to default
        shellToUse = true;
      }
    }

    // For REPL interactions, we need to ensure stdin, stdout, and stderr are properly configured
    // Note: No special stdio options needed here, Node.js handles pipes by default

    // Enhance SSH commands automatically
    let enhancedCommand = command;
    if (command.trim().startsWith('ssh ') && !command.includes(' -t')) {
      enhancedCommand = command.replace(/^ssh /, 'ssh -t ');
      console.log(`Enhanced SSH command: ${enhancedCommand}`);
    }

    // Get the appropriate spawn configuration for the shell
    let spawnConfig: ShellSpawnConfig;
    let spawnOptions: any;
    
    if (typeof shellToUse === 'string') {
      // Use shell-specific configuration with login flags where appropriate
      spawnConfig = getShellSpawnArgs(shellToUse, enhancedCommand);
      spawnOptions = {
        cwd: MACHINE_CONTROL_PROJECT_ROOT,
        env: buildMachineShellEnv({ TERM: 'xterm-256color', NO_COLOR: process.env.NO_COLOR ?? '1' }),
        windowsHide: true  // Prevent visible console windows on Windows
      };

      // Add shell option if needed (for unknown shells)
      if (spawnConfig.useShellOption) {
        spawnOptions.shell = spawnConfig.useShellOption;
      }
    } else {
      // Boolean or undefined shell - use default shell option behavior
      spawnConfig = {
        executable: enhancedCommand,
        args: [],
        useShellOption: shellToUse
      };
      spawnOptions = {
        shell: shellToUse,
        cwd: MACHINE_CONTROL_PROJECT_ROOT,
        env: buildMachineShellEnv({ TERM: 'xterm-256color', NO_COLOR: process.env.NO_COLOR ?? '1' }),
        windowsHide: true  // Prevent visible console windows on Windows
      };
    }

    // Repair PATHEXT on Windows before spawning. On some Windows DXT launches
    // the server process inherits a corrupted PATHEXT (e.g. ".CPL"), which we
    // would otherwise propagate via { ...process.env } and break command
    // resolution (git, node, python, rg, ...) in the spawned shell. See #481.
    if (process.platform === 'win32' && spawnOptions.env) {
      spawnOptions.env.PATHEXT = getRepairedPathExt();
    }

    // On Windows, when we invoke cmd.exe directly and pass the user's command as a
    // single argument, Node/libuv applies MSVCRT-style quoting that escapes embedded
    // double quotes as \" . cmd.exe does not understand that escaping, so any command
    // containing quotes (e.g. a quoted path with spaces like "C:\Program Files\app.exe")
    // is corrupted before the shell ever parses it. Passing arguments verbatim lets
    // cmd handle its own quoting. Scoped to shells that set windowsVerbatim (cmd only)
    // because PowerShell/pwsh have different quote rules and must NOT use verbatim.
    if (process.platform === 'win32' && spawnConfig.windowsVerbatim) {
      spawnOptions.windowsVerbatimArguments = true;
    }

    let ledgerId: string | null = null;
    try {
      ledgerId = await processLedger.createPending(
        enhancedCommand,
        typeof shellToUse === 'string' ? shellToUse : 'default',
        MACHINE_CONTROL_PROJECT_ROOT,
        currentToolInvocationRequest()?.mutationContext.taskId,
      );
    } catch (error) {
      console.warn('Process ledger pending write failed:', error);
    }

    // Spawn the process with appropriate arguments
    const childProcess = spawn(spawnConfig.executable, spawnConfig.args, spawnOptions);
    let output = '';
    // A chunk can end in the middle of a multi-byte character; the decoder carries the rest into the next chunk.
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');

    // spawn() reports failure asynchronously via an 'error' event; it does not
    // throw. Node rethrows an 'error' that has no listener as an uncaught
    // exception, and our process-level handler (src/index.ts) turns that into
    // process.exit(1). So an unresolvable executable — e.g. shell: "/usr/bin/bash"
    // on Windows — used to kill the entire MCP server one tick AFTER this
    // function had already returned "Failed to get process ID", making the crash
    // look unrelated to the command that caused it. Under `remote` the parent
    // then kept accepting tool calls over a dead stdio pipe ("Not connected").
    //
    // Attach before any return path below, and keep it for the session lifetime
    // so a later runtime error (EPIPE on a closed stdin, ...) can't crash us either.
    let forwardProcessError: ((err: Error) => void) | null = null;
    let pendingProcessError: Error | null = null;
    childProcess.on('error', (err: Error) => {
      if (forwardProcessError) {
        forwardProcessError(err);
      } else {
        pendingProcessError = err;
        console.error(`Process error for "${command}": ${err.message}`);
      }
    });

    // Ensure childProcess.pid is defined before proceeding
    if (!childProcess.pid) {
      if (ledgerId) await processLedger.failPending(ledgerId, 'spawn returned no process id').catch(() => undefined);
      // Return a consistent error object instead of throwing
      return {
        pid: -1,  // Use -1 to indicate an error state
        output: 'Error: Failed to get process ID. The command could not be executed.',
        isBlocked: false
      };
    }

    const session: TerminalSession = {
      pid: childProcess.pid,
      process: childProcess,
      outputLines: [],           // Line-based buffer
      lastReadIndex: 0,          // Track where "new" output starts
      isBlocked: false,
      startTime: new Date(),
      bufferedChars: 0,
      evictedLines: 0,
      evictedChars: 0
    };

    this.sessions.set(childProcess.pid, session);
    this.outputSpills.set(childProcess.pid, { totalChars: 0, prelude: [] });
    // Do not await ledger attachment before exit/error listeners are installed.
    // Very short-lived commands can exit during the persistence/identity probe window;
    // awaiting here would miss the one-shot child `exit` event and strand the session.
    const ledgerAttach = ledgerId
      ? processLedger.attachRunning(ledgerId, childProcess.pid, spawnConfig.executable).catch((error) => {
          console.warn('Process ledger attach failed:', error);
        })
      : Promise.resolve();

    // Timing telemetry
    const startTime = Date.now();
    let firstOutputTime: number | undefined;
    let lastOutputTime: number | undefined;
    const outputEvents: OutputEvent[] = [];
    let exitReason: TimingInfo['exitReason'] = 'timeout';

    return new Promise((resolve) => {
      let resolved = false;
      let periodicCheck: NodeJS.Timeout | null = null;

      // Quick prompt patterns for immediate detection
      const quickPromptPatterns = />>>\s*$|>\s*$|\$\s*$|#\s*$/;

      const resolveOnce = (result: CommandExecutionResult) => {
        if (resolved) return;
        resolved = true;
        if (periodicCheck) clearInterval(periodicCheck);

        result.processObservation ??= this.observeProcess(session.pid, session.startTime.getTime());
        result.waitReason = exitReason;

        // Add timing info if requested
        if (collectTiming) {
          const endTime = Date.now();
          result.timingInfo = {
            startTime,
            endTime,
            totalDurationMs: endTime - startTime,
            exitReason,
            firstOutputTime,
            lastOutputTime,
            timeToFirstOutputMs: firstOutputTime ? firstOutputTime - startTime : undefined,
            outputEvents: outputEvents.length > 0 ? outputEvents : undefined
          };
        }

        resolve(result);
      };

      // An error ends this wait, but is not evidence that the child exited.
      // Preserve the existing cleanup while reporting lifecycle as unavailable.
      forwardProcessError = (err: Error) => {
        void ledgerAttach
          .then(() => processLedger.finalizeExit(childProcess.pid!, null, err.message))
          .catch(() => undefined);
        this.finalizeSpill(childProcess.pid!);
        this.sessions.delete(childProcess.pid!);
        exitReason = 'process_unavailable';
        resolveOnce({
          pid: childProcess.pid!,
          output: output + `\nProcess error: ${err.message}`,
          isBlocked: false,
          processObservation: {
            pid: session.pid,
            startTime: session.startTime.getTime(),
            observedAt: Date.now(),
            state: 'unavailable',
            basis: 'unavailable',
            reasonCode: 'process-error',
          },
        });
      };
      // An error emitted between spawn and here (the common case — spawn errors
      // land on the next tick) is replayed rather than dropped.
      if (pendingProcessError) {
        forwardProcessError(pendingProcessError);
      }

      childProcess.stdout.on('data', (data: any) => {
        const text = stripAnsi(typeof data === 'string' ? data : stdoutDecoder.write(data));
        this.captureSpillChunk(childProcess.pid!, 'stdout', text);
        const now = Date.now();

        if (!firstOutputTime) firstOutputTime = now;
        lastOutputTime = now;

        // `output` only feeds the wait-phase result and prompt/state detection,
        // so stop growing it once resolved and keep only a bounded tail.
        if (!resolved) {
          output += text;
          if (output.length > MAX_WAIT_OUTPUT_CHARS) {
            output = output.slice(-Math.floor(MAX_WAIT_OUTPUT_CHARS / 2));
          }
        }
        // Append to line-based buffer
        this.appendToLineBuffer(session, text);

        // Record output event if collecting timing
        if (collectTiming) {
          outputEvents.push({
            timestamp: now,
            deltaMs: now - startTime,
            source: 'stdout',
            length: text.length,
            snippet: text.slice(0, 50).replace(/\n/g, '\\n')
          });
        }

        // Immediate check for obvious prompts
        if (quickPromptPatterns.test(text)) {
          session.isBlocked = true;
          exitReason = 'early_exit_quick_pattern';

          if (collectTiming && outputEvents.length > 0) {
            outputEvents[outputEvents.length - 1].matchedPattern = 'quick_pattern';
          }

          resolveOnce({
            pid: childProcess.pid!,
            output,
            isBlocked: true
          });
        }
      });

      childProcess.stderr.on('data', (data: any) => {
        const text = stripAnsi(typeof data === 'string' ? data : stderrDecoder.write(data));
        this.captureSpillChunk(childProcess.pid!, 'stderr', text);
        const now = Date.now();

        if (!firstOutputTime) firstOutputTime = now;
        lastOutputTime = now;

        if (!resolved) {
          output += text;
          if (output.length > MAX_WAIT_OUTPUT_CHARS) {
            output = output.slice(-Math.floor(MAX_WAIT_OUTPUT_CHARS / 2));
          }
        }
        // Append to line-based buffer
        this.appendToLineBuffer(session, text);

        // Record output event if collecting timing
        if (collectTiming) {
          outputEvents.push({
            timestamp: now,
            deltaMs: now - startTime,
            source: 'stderr',
            length: text.length,
            snippet: text.slice(0, 50).replace(/\n/g, '\\n')
          });
        }
      });

      // Periodic comprehensive check every 100ms
      // The exit handler finalizes the ledger and moves the session to the completed list before it resolves, so an
      // observed exit gets a short grace period; otherwise a slow disk lets this check return while the session still looks active.
      let exitGraceDeadline = 0;
      periodicCheck = setInterval(() => {
        const observation = this.observeProcess(session.pid, session.startTime.getTime());
        if (observation.state === 'exit-observed') {
          exitGraceDeadline ||= Date.now() + 2_000;
          if (Date.now() < exitGraceDeadline) return;
        }
        if (observation.state !== 'managed') {
          exitReason = observation.state === 'exit-observed' ? 'process_exit' : 'process_unavailable';
          resolveOnce({ pid: session.pid, output, isBlocked: false, processObservation: observation });
          return;
        }
        if (output.trim()) {
          const processState = analyzeProcessState(output, childProcess.pid);
          if (processState.isWaitingForInput) {
            session.isBlocked = true;
            exitReason = 'early_exit_periodic_check';
            resolveOnce({
              pid: childProcess.pid!,
              output,
              isBlocked: true
            });
          }
        }
      }, 100);

      // Timeout fallback
      setTimeout(() => {
        session.isBlocked = true;
        exitReason = 'timeout';
        resolveOnce({
          pid: childProcess.pid!,
          output,
          isBlocked: true
        });
      }, timeoutMs);

      childProcess.on('exit', async (code: any) => {
        if (childProcess.pid) {
          await ledgerAttach;
          await processLedger.finalizeExit(childProcess.pid, code).catch((error) => {
            console.warn('Process ledger finalize failed:', error);
          });
          // Store completed session before removing active session
          const spill = this.finalizeSpill(childProcess.pid);
          this.completedSessions.set(childProcess.pid, {
            pid: childProcess.pid,
            outputLines: [...session.outputLines], // Copy line buffer
            exitCode: code,
            startTime: session.startTime,
            endTime: new Date(),
            evictedLines: session.evictedLines,
            evictedChars: session.evictedChars,
            ...(spill ? { spill } : {}),
          });

          // Keep only last 100 completed sessions
          if (this.completedSessions.size > 100) {
            const oldestKey = Array.from(this.completedSessions.keys())[0];
            this.completedSessions.delete(oldestKey);
          }

          this.sessions.delete(childProcess.pid);
        }
        exitReason = 'process_exit';
        resolveOnce({
          pid: childProcess.pid!,
          output,
          isBlocked: false
        });
      });
    });
  }

  private captureSpillChunk(pid: number, source: 'stdout' | 'stderr', text: string): void {
    const state = this.outputSpills.get(pid);
    if (!state || !text) return;
    state.totalChars += text.length;
    const chunk = { source, text } satisfies SpillChunk;
    if (state.writer) {
      state.writer.append([chunk]);
      return;
    }
    state.prelude.push(chunk);
    if (state.totalChars < OUTPUT_SPILL_THRESHOLD_CHARS) return;
    try {
      state.writer = new TerminalOutputSpill(pid);
      state.writer.append(state.prelude);
      state.prelude = [];
    } catch (error) {
      state.issue = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
      state.prelude = [];
    }
  }

  private finalizeSpill(pid: number): TerminalOutputSpillInfo | undefined {
    const state = this.outputSpills.get(pid);
    this.outputSpills.delete(pid);
    if (!state) return undefined;
    if (state.writer) return state.writer.finalize();
    if (state.issue) return { bytes: 0, complete: false, issue: state.issue };
    return undefined;
  }

  /**
   * Append text to a session's line buffer
   * Handles partial lines and newline splitting
   */
  private appendToLineBuffer(session: TerminalSession, text: string): void {
    if (!text) return;

    // Split text into lines, keeping track of whether text ends with newline
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLastFragment = i === lines.length - 1;
      const endsWithNewline = text.endsWith('\n');

      if (session.outputLines.length === 0) {
        // First line ever
        session.outputLines.push(line);
      } else if (i === 0) {
        // First fragment - append to last line (might be partial)
        session.outputLines[session.outputLines.length - 1] += line;
      } else {
        // Subsequent lines - add as new lines
        session.outputLines.push(line);
      }
    }
    // Appended text contributes exactly its length to the joined buffer
    // (its newlines become the join separators).
    session.bufferedChars += text.length;

    // A process printing without newlines grows a single line forever, which
    // eviction can't bound — force-split so no line exceeds MAX_LINE_CHARS.
    // Each inserted break adds one separator to the joined length.
    let lastIndex = session.outputLines.length - 1;
    while (session.outputLines[lastIndex].length > MAX_LINE_CHARS) {
      const overlong = session.outputLines[lastIndex];
      session.outputLines[lastIndex] = overlong.slice(0, MAX_LINE_CHARS);
      session.outputLines.push(overlong.slice(MAX_LINE_CHARS));
      session.bufferedChars += 1;
      lastIndex++;
    }

    // Enforce the per-session cap by evicting the oldest lines. Keeps the
    // buffer far below V8's max string length so concatenation and join()
    // can never throw "Invalid string length" and kill the server.
    while (session.bufferedChars > MAX_BUFFERED_OUTPUT_CHARS && session.outputLines.length > 1) {
      const dropped = session.outputLines.shift()!;
      const droppedJoinedChars = dropped.length + 1; // +1 for its join separator
      session.bufferedChars -= droppedJoinedChars;
      session.evictedChars += droppedJoinedChars;
      session.evictedLines++;
      if (session.lastReadIndex > 0) session.lastReadIndex--;
    }
  }

  /**
   * Read process output with pagination (like file reading)
   * @param pid Process ID
   * @param offset Line offset: 0=from lastReadIndex, positive=absolute, negative=tail
   * @param length Max lines to return
   * @param updateReadIndex Whether to update lastReadIndex (default: true for offset=0)
   */
  readOutputPaginated(pid: number, offset: number = 0, length: number = 1000): PaginatedOutputResult | null {
    // First check active sessions
    const session = this.sessions.get(pid);
    if (session) {
      const result = this.readFromLineBuffer(
        session.outputLines,
        offset,
        length,
        session.lastReadIndex,
        (newIndex) => { session.lastReadIndex = newIndex; },
        false,
        undefined
      );
      result.evictedLines = session.evictedLines;
      const activeSpill = this.outputSpills.get(pid)?.writer?.info();
      if (activeSpill) result.spill = activeSpill;
      return result;
    }

    // Then check completed sessions
    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
      const runtimeMs = completedSession.endTime.getTime() - completedSession.startTime.getTime();
      const result = this.readFromLineBuffer(
        completedSession.outputLines,
        offset,
        length,
        0,  // Completed sessions don't track read position
        () => {},  // No-op for completed sessions
        true,
        completedSession.exitCode,
        runtimeMs
      );
      result.evictedLines = completedSession.evictedLines;
      if (completedSession.spill) result.spill = completedSession.spill;
      return result;
    }

    const detached = this.detachedSessions.get(pid);
    if (detached) {
      return this.readFromLineBuffer(
        ['Detached session recovered after Agent Core restart; original stdout/stderr and stdin pipes are unavailable.'],
        offset,
        length,
        0,
        () => {},
        false,
      );
    }

    return null;
  }

  /**
   * Internal helper to read from a line buffer with offset/length
   */
  private readFromLineBuffer(
    lines: string[],
    offset: number,
    length: number,
    lastReadIndex: number,
    updateLastRead: (index: number) => void,
    isComplete: boolean,
    exitCode?: number | null,
    runtimeMs?: number
  ): PaginatedOutputResult {
    const totalLines = lines.length;
    let startIndex: number;
    let linesToRead: string[];

    if (offset < 0) {
      // Negative offset = start position from end, then read 'length' lines forward
      // e.g., offset=-50, length=10 means: start 50 lines from end, read 10 lines
      const fromEnd = Math.abs(offset);
      startIndex = Math.max(0, totalLines - fromEnd);
      linesToRead = lines.slice(startIndex, startIndex + length);
      // Don't update lastReadIndex for tail reads
    } else if (offset === 0) {
      // offset=0 means "from where I last read" (like getNewOutput)
      startIndex = lastReadIndex;
      linesToRead = lines.slice(startIndex, startIndex + length);
      // Update lastReadIndex for "new output" behavior
      updateLastRead(Math.min(startIndex + linesToRead.length, totalLines));
    } else {
      // Positive offset = absolute position
      startIndex = offset;
      linesToRead = lines.slice(startIndex, startIndex + length);
      // Don't update lastReadIndex for absolute position reads
    }

    const readCount = linesToRead.length;
    const endIndex = startIndex + readCount;
    const remaining = Math.max(0, totalLines - endIndex);

    return {
      lines: linesToRead,
      totalLines,
      readFrom: startIndex,
      readCount,
      remaining,
      isComplete,
      exitCode,
      runtimeMs
    };
  }

  /**
   * Get total line count for a process
   */
  getOutputLineCount(pid: number): number | null {
    const session = this.sessions.get(pid);
    if (session) {
      return session.outputLines.length;
    }

    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
      return completedSession.outputLines.length;
    }

    if (this.detachedSessions.has(pid)) return 1;
    return null;
  }

  /**
   * Legacy method for backward compatibility
   * Returns all new output since last read
   * @param maxLines Maximum lines to return (default: 1000 for context protection)
   * @deprecated Use readOutputPaginated instead
   */
  getNewOutput(pid: number, maxLines: number = 1000): string | null {
    const result = this.readOutputPaginated(pid, 0, maxLines);
    if (!result) return null;

    const output = result.lines.join('\n').trim();

    // For completed sessions, append completion info with runtime
    if (result.isComplete) {
      const runtimeStr = result.runtimeMs !== undefined 
        ? `\nRuntime: ${(result.runtimeMs / 1000).toFixed(2)}s` 
        : '';
      if (output) {
        return `${output}\n\nProcess completed with exit code ${result.exitCode}${describeExitCode(result.exitCode)}${runtimeStr}`;
      } else {
        return `Process completed with exit code ${result.exitCode}${describeExitCode(result.exitCode)}${runtimeStr}\n(No output produced)`;
      }
    }

    // Add truncation warning if there's more output
    if (result.remaining > 0) {
      return `${output}\n\n[Output truncated: ${result.remaining} more lines available. Use read_process_output with offset/length for full output.]`;
    }

    return output || null;
  }

  /**
   * Capture a snapshot of current output state for interaction tracking.
   * Used by interactWithProcess to know what output existed before sending input.
   */
  captureOutputSnapshot(pid: number): { totalChars: number; lineCount: number } | null {
    const session = this.sessions.get(pid);
    if (session) {
      const fullOutput = session.outputLines.join('\n');
      return {
        // Absolute since process start (includes evicted output), so the
        // offset stays valid even if the cap evicts lines between
        // snapshot and read.
        totalChars: session.evictedChars + fullOutput.length,
        lineCount: session.evictedLines + session.outputLines.length
      };
    }
    return null;
  }

  /**
   * Get output that appeared since a snapshot was taken.
   * This handles the case where output is appended to the last line (REPL prompts).
   * Also checks completed sessions in case process finished between snapshot and poll.
   */
  getOutputSinceSnapshot(pid: number, snapshot: { totalChars: number; lineCount: number }): string | null {
    // Check active session first
    const session = this.sessions.get(pid);
    if (session) {
      return TerminalManager.outputSinceSnapshot(session.outputLines, session.evictedChars, snapshot.totalChars);
    }

    // Fallback to completed sessions - process may have finished between snapshot and poll
    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
      return TerminalManager.outputSinceSnapshot(completedSession.outputLines, completedSession.evictedChars, snapshot.totalChars);
    }

    return null;
  }

  /**
   * New output since a snapshot, in absolute (since process start) offsets.
   * If eviction dropped part of the unseen output, returns what the buffer
   * still holds — the oldest unseen chars are lost to the cap.
   */
  private static outputSinceSnapshot(outputLines: string[], evictedChars: number, snapshotTotalChars: number): string {
    const fullOutput = outputLines.join('\n');
    const newChars = evictedChars + fullOutput.length - snapshotTotalChars;
    if (newChars <= 0) {
      return ''; // No new output
    }
    return fullOutput.substring(Math.max(0, fullOutput.length - newChars));
  }

    /**
   * Get a session by PID
   * @param pid Process ID
   * @returns The session or undefined if not found
   */
  getSession(pid: number): TerminalSession | undefined {
    return this.sessions.get(pid);
  }

  /**
   * Observe one existing process instance without consuming output or probing the OS.
   * Active identity takes precedence: a reused PID must not select an older completion.
   * Child exit fields are available even while the exit callback awaits the ledger.
   */
  observeProcess(pid: number, expectedStartTime: number): ProcessObservation {
    const identity = { pid, startTime: expectedStartTime, observedAt: Date.now() };
    const session = this.sessions.get(pid);
    if (session) {
      if (session.startTime.getTime() !== expectedStartTime) {
        return { ...identity, state: 'unavailable', basis: 'unavailable', reasonCode: 'replaced' };
      }
      if (session.process.exitCode !== null || session.process.signalCode !== null) {
        return { ...identity, state: 'exit-observed', basis: 'child-exit', exitCode: session.process.exitCode };
      }
      return { ...identity, state: 'managed', basis: 'managed-session' };
    }

    const completed = this.completedSessions.get(pid);
    if (completed) {
      if (completed.startTime.getTime() !== expectedStartTime) {
        return { ...identity, state: 'unavailable', basis: 'unavailable', reasonCode: 'replaced' };
      }
      return { ...identity, state: 'exit-observed', basis: 'child-exit', exitCode: completed.exitCode };
    }

    return {
      ...identity,
      state: 'unavailable',
      basis: 'unavailable',
      reasonCode: this.detachedSessions.has(pid) ? 'detached' : 'missing',
    };
  }

  forceTerminate(pid: number): boolean {
    const session = this.sessions.get(pid);
    if (!session) {
      const detached = this.detachedSessions.get(pid);
      if (!detached) return false;
      const record = processLedger.snapshot().find(item => item.pid === pid && (item.status === 'running' || item.status === 'cancelling'));
      if (!record || !processLedger.validateLive(record)) {
        this.detachedSessions.delete(pid);
        return false;
      }
      try {
        void processLedger.markCancelling(pid).catch(() => undefined);
        process.kill(pid);
        this.detachedSessions.delete(pid);
        void processLedger.finalizeExit(pid, null).catch(() => undefined);
        return true;
      } catch (error) {
        void processLedger.finalizeExit(pid, null, error instanceof Error ? error.message : String(error)).catch(() => undefined);
        return false;
      }
    }

    try {
        void processLedger.markCancelling(pid).catch(() => undefined);
        try { session.process.stdin?.end(); } catch { /* already closed */ } // a child blocked on input can then see EOF
        session.process.kill('SIGINT');
        setTimeout(() => {
          if (this.sessions.has(pid)) {
            session.process.kill('SIGKILL');
          }
        }, 1000);
        return true;
      } catch (error) {
        // Convert error to string, handling both Error objects and other types
        const errorMessage = error instanceof Error ? error.message : String(error);
        capture('server_request_error', {error: errorMessage, message: `Failed to terminate process ${pid}:`});
        return false;
      }
  }

  async shutdownAll(): Promise<{ requested: number; terminated: number; remaining: number }> {
    const targets = [...new Set([...this.sessions.keys(), ...this.detachedSessions.keys()])];
    let terminated = 0;

    for (const pid of targets) {
      const detached = this.detachedSessions.has(pid);
      if (detached) {
        const record = processLedger.snapshot().find(item =>
          item.pid === pid && (item.status === 'running' || item.status === 'cancelling'),
        );
        if (!record || !processLedger.validateLive(record)) {
          this.detachedSessions.delete(pid);
          continue;
        }
      }

      const descendants = await snapshotDescendantPids(pid).catch(() => []);
      try {
        await processLedger.markCancelling(pid).catch(() => undefined);
        await terminateOwnedProcessTree(pid, descendants, true);
        terminated += 1;
      } finally {
        this.sessions.delete(pid);
        this.detachedSessions.delete(pid);
        await processLedger.finalizeExit(pid, null).catch(() => undefined);
      }
    }

    return {
      requested: targets.length,
      terminated,
      remaining: this.sessions.size + this.detachedSessions.size,
    };
  }

  listActiveSessions(): ActiveSession[] {
    const now = new Date();
    const active = Array.from(this.sessions.values()).map(session => ({
      pid: session.pid,
      isBlocked: session.isBlocked,
      runtime: now.getTime() - session.startTime.getTime()
    }));
    const detached = Array.from(this.detachedSessions.values()).map(session => ({
      pid: session.pid,
      isBlocked: true,
      runtime: now.getTime() - session.startTime.getTime(),
    }));
    return [...active, ...detached];
  }

  listCompletedSessions(): CompletedSession[] {
    return Array.from(this.completedSessions.values());
  }
}

export const terminalManager = new TerminalManager();
