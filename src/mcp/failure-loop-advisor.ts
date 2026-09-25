import { createHash } from 'node:crypto';
import { normalizeFailureFamily } from '../failure-evidence.js';
import { redactSensitiveValue } from '../security/redaction.js';

export { normalizeFailureFamily };

export interface FailureLoopAdvisory {
  repeatCount: number;
  strength: 'repeat' | 'no-progress';
  scope: 'exact' | 'failure-family';
  failureFamily: string;
  message: string;
}

interface FailureState {
  fingerprint: string;
  toolName: string;
  argsHash: string;
  failureFamily: string;
  count: number;
  lastAt: number;
}

interface FailureFamilyState {
  key: string;
  toolName: string;
  failureFamily: string;
  count: number;
  lastAt: number;
  lastArgsHash: string;
  sawArgVariation: boolean;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 64;

export const FAILURE_LOOP_EXEMPT_TOOLS = new Set([
  'read_process_output',
  'get_more_search_results',
  'list_sessions',
  'memory_status',
]);

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'undefined') return undefined;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value !== 'object') return String(value);

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (key === 'origin') continue;
    const item = canonicalize((value as Record<string, unknown>)[key]);
    if (typeof item !== 'undefined') output[key] = item;
  }
  return output;
}

function canonicalArgs(args: unknown): string {
  const sanitized = redactSensitiveValue(args ?? {});
  return JSON.stringify(canonicalize(sanitized)) ?? '{}';
}


export class FailureLoopAdvisor {
  private readonly entries = new Map<string, FailureState>();
  private lastFailureFingerprint?: string;
  private lastFamilyFailure?: FailureFamilyState;

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
  ) {}

  observeFailure(
    toolName: string,
    args: unknown,
    failure: unknown,
    now = Date.now(),
  ): FailureLoopAdvisory | undefined {
    if (FAILURE_LOOP_EXEMPT_TOOLS.has(toolName)) return undefined;

    this.prune(now);
    const argsHash = sha256(canonicalArgs(args));
    const family = normalizeFailureFamily(failure);
    const fingerprint = sha256(`${toolName}\n${argsHash}\n${family}`);
    const previous = this.entries.get(fingerprint);
    const exactConsecutive = Boolean(
      previous
      && this.lastFailureFingerprint === fingerprint
      && now - previous.lastAt <= this.ttlMs,
    );
    const exactCount = exactConsecutive ? previous!.count + 1 : 1;

    this.entries.delete(fingerprint);
    this.entries.set(fingerprint, {
      fingerprint,
      toolName,
      argsHash,
      failureFamily: family,
      count: exactCount,
      lastAt: now,
    });
    this.lastFailureFingerprint = fingerprint;

    const familyKey = sha256(`${toolName}\n${family}`);
    const previousFamily = this.lastFamilyFailure;
    const familyConsecutive = Boolean(
      previousFamily
      && previousFamily.key === familyKey
      && now - previousFamily.lastAt <= this.ttlMs,
    );
    const familyCount = familyConsecutive ? previousFamily!.count + 1 : 1;
    const sawArgVariation = familyConsecutive
      ? previousFamily!.sawArgVariation || previousFamily!.lastArgsHash !== argsHash
      : false;
    this.lastFamilyFailure = {
      key: familyKey,
      toolName,
      failureFamily: family,
      count: familyCount,
      lastAt: now,
      lastArgsHash: argsHash,
      sawArgVariation,
    };
    this.enforceBound();

    if (familyCount >= 3 && sawArgVariation) {
      return {
        repeatCount: familyCount,
        strength: 'no-progress',
        scope: 'failure-family',
        failureFamily: family.slice(0, 200),
        message: 'The same failure family persists across changed arguments. Argument variation has not changed the outcome; switch target, hypothesis, or diagnostic method before another retry.',
      };
    }

    if (exactCount < 2) return undefined;
    const strength = exactCount >= 3 ? 'no-progress' : 'repeat';
    return {
      repeatCount: exactCount,
      strength,
      scope: 'exact',
      failureFamily: family.slice(0, 200),
      message: strength === 'no-progress'
        ? 'Repeated equivalent failure persists with no progress. Stop equivalent retries and change arguments, target, hypothesis, or diagnostic method before trying again.'
        : 'Repeated equivalent failure detected. The previous strategy produced no new evidence; change arguments, target, hypothesis, or diagnostic method before retrying.',
    };
  }

  observeSuccess(toolName: string, args: unknown, now = Date.now()): void {
    this.prune(now);
    const argsHash = sha256(canonicalArgs(args));
    for (const [fingerprint, entry] of this.entries) {
      if (entry.toolName === toolName && entry.argsHash === argsHash) {
        this.entries.delete(fingerprint);
      }
    }
    // Any successful action breaks both exact and broader same-family failure streaks.
    // This keeps the detector focused on consecutive no-progress behavior only.
    this.lastFailureFingerprint = undefined;
    this.lastFamilyFailure = undefined;
  }

  reset(): void {
    this.entries.clear();
    this.lastFailureFingerprint = undefined;
    this.lastFamilyFailure = undefined;
  }

  private prune(now: number): void {
    for (const [fingerprint, entry] of this.entries) {
      if (now - entry.lastAt > this.ttlMs) {
        this.entries.delete(fingerprint);
        if (this.lastFailureFingerprint === fingerprint) this.lastFailureFingerprint = undefined;
      }
    }
    if (this.lastFamilyFailure && now - this.lastFamilyFailure.lastAt > this.ttlMs) {
      this.lastFamilyFailure = undefined;
    }
  }

  private enforceBound(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
      if (this.lastFailureFingerprint === oldest) this.lastFailureFingerprint = undefined;
    }
  }
}

export function appendFailureLoopAdvisory<T extends { content?: unknown[]; isError?: boolean }>(
  result: T,
  advisory: FailureLoopAdvisory | undefined,
): T {
  if (!advisory) return result;
  return {
    ...result,
    content: [
      ...(Array.isArray(result.content) ? result.content : []),
      {
        type: 'text',
        text: `Reflexion advisory (repeat ${advisory.repeatCount}): ${advisory.message}`,
      },
    ],
  };
}

export function annotateFailureLoopException(
  error: unknown,
  advisory: FailureLoopAdvisory | undefined,
): unknown {
  if (!advisory || !(error instanceof Error)) return error;
  const suffix = `Reflexion advisory (repeat ${advisory.repeatCount}): ${advisory.message}`;
  if (!error.message.includes(suffix)) error.message = `${error.message}\n${suffix}`;
  return error;
}
