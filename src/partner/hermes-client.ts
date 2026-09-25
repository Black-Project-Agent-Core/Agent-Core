import type { HermesRunStatus } from './types.js';
import { HermesPartnerRuntime } from './hermes-runtime.js';

const LIVE_STATUSES = new Set(['queued', 'running', 'stopping']);
const MAX_OUTPUT_CHARS = 60_000;

function bounded(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_OUTPUT_CHARS
      ? value.slice(0, MAX_OUTPUT_CHARS) + '\n[truncated by Agent Core partner bridge]'
      : value;
  }
  if (Array.isArray(value)) return value.slice(0, 200).map(bounded);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 200)
        .map(([key, item]) => [key, bounded(item)]),
    );
  }
  return value;
}

export class HermesPartnerClient {
  constructor(private readonly runtime: HermesPartnerRuntime) {}

  async startRun(input: {
    prompt: string;
    instructions: string;
    sessionKey: string;
    idempotencyKey: string;
  }): Promise<{ runId: string; status: Record<string, unknown> }> {
    const result = await this.runtime.request('/v1/runs', {
      method: 'POST',
      headers: {
        'X-Hermes-Session-Key': input.sessionKey,
        'Idempotency-Key': input.idempotencyKey,
      },
      body: {
        input: input.prompt,
        instructions: input.instructions,
      },
    });
    const runId = String(result.run_id ?? '').trim();
    if (!runId) throw new Error('HERMES_PARTNER_RUN_ID_MISSING');
    return { runId, status: bounded(result) as Record<string, unknown> };
  }

  async status(runId: string): Promise<HermesRunStatus> {
    const result = await this.runtime.request(`/v1/runs/${encodeURIComponent(runId)}`);
    return bounded(result) as HermesRunStatus;
  }

  async wait(runId: string, timeoutMs: number): Promise<HermesRunStatus> {
    const deadline = Date.now() + timeoutMs;
    let last = await this.status(runId);
    while (Date.now() < deadline) {
      const status = String(last.status ?? '').toLowerCase();
      if (!LIVE_STATUSES.has(status)) return last;
      await new Promise(resolve => setTimeout(resolve, 350));
      last = await this.status(runId);
    }
    return {
      ...last,
      bridge_wait_timeout: true,
      bridge_wait_timeout_ms: timeoutMs,
    };
  }

  async steer(runId: string, message: string): Promise<Record<string, unknown>> {
    return bounded(await this.runtime.request(
      `/v1/runs/${encodeURIComponent(runId)}/steer`,
      { method: 'POST', body: { input: message } },
    )) as Record<string, unknown>;
  }

  async approve(runId: string, requestId: string, choice: 'once' | 'deny'): Promise<Record<string, unknown>> {
    return bounded(await this.runtime.request(
      `/v1/runs/${encodeURIComponent(runId)}/approval`,
      { method: 'POST', body: { request_id: requestId, choice } },
    )) as Record<string, unknown>;
  }

  async stop(runId: string): Promise<Record<string, unknown>> {
    return bounded(await this.runtime.request(
      `/v1/runs/${encodeURIComponent(runId)}/stop`,
      { method: 'POST', body: {} },
    )) as Record<string, unknown>;
  }
}
