
/**
 * Executes a promise with a timeout. If the promise doesn't resolve or reject within
 * the specified timeout, returns the provided default value.
 *
 * @param operation The promise to execute
 * @param timeoutMs Timeout in milliseconds
 * @param operationName Name of the operation (for logs)
 * @param defaultValue Value to return if the operation times out
 * @returns Promise that resolves with the operation result or the default value on timeout
 */
export function withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    operationName: string,
    defaultValue: T
): Promise<T> {
    // Don't sanitize operation name for logs - only telemetry will sanitize if needed
    return new Promise((resolve, reject) => {
        let isCompleted = false;

        // Set up timeout
        const timeoutId = setTimeout(() => {
            if (!isCompleted) {
                isCompleted = true;
                if (defaultValue !== null) {
                    resolve(defaultValue);
                } else {
                    // Keep the original operation name in the error message
                    // Telemetry sanitization happens at the capture level
                    reject(`__ERROR__: ${operationName} timed out after ${timeoutMs / 1000} seconds`);
                }
            }
        }, timeoutMs);

        // Execute the operation
        operation
            .then(result => {
                if (!isCompleted) {
                    isCompleted = true;
                    clearTimeout(timeoutId);
                    resolve(result);
                }
            })
            .catch(error => {
                if (!isCompleted) {
                    isCompleted = true;
                    clearTimeout(timeoutId);
                    if (defaultValue !== null) {
                        resolve(defaultValue);
                    } else {
                        // Pass the original error unchanged - sanitization for telemetry happens in capture
                        reject(error);
                    }
                }
            });
    });
}

/**
 * Run an operation under a timeout WITH real cancellation.
 *
 * Unlike withTimeout (which only races a timer and leaves the underlying work
 * running — holding its libuv thread/fd until the OS call returns), this passes
 * an AbortSignal into the operation and aborts it when the timeout fires, so a
 * read/stream that honors the signal is cancelled and its resources released.
 *
 * Rejects with an Error whose `.code` is 'ETIMEDOUT' on timeout (so existing
 * ETIMEDOUT handling / permission-error mapping keeps working).
 *
 * Caveat: an operation wedged inside a single un-interruptible syscall only
 * observes the abort once that syscall returns; library reads that ignore the
 * signal (e.g. Excel/PDF parsers) still get the timeout rejection but keep
 * running in the background until they finish on their own.
 */
export function runWithAbortableTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    operationName: string
): Promise<T> {
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout;

    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort();
            const error = new Error(`${operationName} timed out after ${timeoutMs / 1000} seconds`) as NodeJS.ErrnoException;
            error.code = 'ETIMEDOUT';
            reject(error);
        }, timeoutMs);
    });

    const op = operation(controller.signal);
    // Swallow the late abort rejection so it can't surface as an unhandled
    // rejection after the timeout has already settled the race.
    op.catch(() => {});

    return Promise.race([op, timeout]).finally(() => clearTimeout(timeoutId));
}

/** Caller cancellation uses a stable internal code, never an untrusted signal.reason. */
export function readCancellationError(): NodeJS.ErrnoException {
  return Object.assign(new Error('READ_CANCELLED'), { code: 'ABORT_ERR' });
}
export function assertReadActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw readCancellationError();
}
export function isReadCancelled(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ABORT_ERR'
    || (error as Error | null)?.name === 'AbortError';
}
/** One operation lifetime: parent abort or local timeout wins its first terminal cause. */
export function runWithCallerAbortableTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number,
  operationName: string, parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const cleanup = () => { if (timer) clearTimeout(timer);
      if (parent) parent.removeEventListener('abort', onParentAbort); };
    const finish = (error?: unknown, value?: T) => {
      if (settled) return; settled = true; cleanup();
      if (error !== undefined) reject(error); else resolve(value as T);
    };
    const cancel = (error: Error) => {
      if (settled) return;
      finish(error); controller.abort();
    };
    const onParentAbort = () => cancel(readCancellationError());
    if (parent?.aborted) { cancel(readCancellationError()); return; }
    parent?.addEventListener('abort', onParentAbort, { once: true });
    if (parent?.aborted) { onParentAbort(); return; }
    timer = setTimeout(() => {
      const error = Object.assign(new Error(operationName + ' timed out'), { code: 'ETIMEDOUT' });
      cancel(error);
    }, timeoutMs);
    Promise.resolve().then(() => { assertReadActive(controller.signal); return operation(controller.signal); })
      .then(value => finish(undefined, value), error => finish(error));
  });
}
