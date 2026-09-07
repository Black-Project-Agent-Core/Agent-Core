import { ProviderInvocationError, classifyProviderFailure, responseErrorText, type ProviderInvocation, type ProviderInvocationResult, type SubAgentProvider } from './types.js';
import { readZipTextEntries } from './zip.js';
import { extractOpenHandsFailure } from './openhands-errors.js';

function firstItem(value: unknown): Record<string, any> {
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, any>;
  if (value && typeof value === 'object' && Array.isArray((value as any).items)) return ((value as any).items[0] ?? {});
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

function resultArtifact(entries: ReturnType<typeof readZipTextEntries>): string | null {
  const direct = [...entries].reverse().find((entry) => entry.name.replace(/\\/g, '/').endsWith('/.subagentcore-result.json') || entry.name.replace(/\\/g, '/') === '.subagentcore-result.json');
  if (direct?.text.trim()) return direct.text.trim();
  const candidates: string[] = [];
  const visit = (value: unknown, role?: string): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, role)); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.kind === 'string' && ['SystemPromptEvent', 'ConversationStateUpdateEvent', 'ObservationEvent'].includes(record.kind)) return;
    const nextRole = String(record.role ?? record.source ?? record.sender ?? role ?? '').toLowerCase();
    for (const key of ['content', 'message', 'text']) {
      const item = record[key];
      if ((nextRole === 'assistant' || nextRole === 'agent') && typeof item === 'string' && item.trim()) candidates.push(item.trim());
    }
    for (const item of Object.values(record)) visit(item, nextRole);
  };
  for (const entry of entries) {
    if (!/\.(?:json|jsonl|txt|log)$/i.test(entry.name)) continue;
    // Exports contain pretty-printed JSON events as well as legacy JSONL.
    try { visit(JSON.parse(entry.text)); continue; } catch {}
    for (const line of entry.text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { visit(JSON.parse(trimmed)); } catch {}
    }
  }
  return candidates.at(-1) ?? null;
}

export class OpenHandsProvider implements SubAgentProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch, private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {}

  private async jsonRequest(input: ProviderInvocation, signal: AbortSignal, method: string, requestPath: string, body?: unknown): Promise<any> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${input.baseUrl}${requestPath}`, {
        method,
        signal,
        headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw new ProviderInvocationError({ kind: 'network', message: error instanceof Error ? error.message : String(error) });
    }
    if (!response.ok) {
      const message = await responseErrorText(response);
      throw new ProviderInvocationError(classifyProviderFailure(response.status, message, response.headers));
    }
    return response.json();
  }

  async invoke(input: ProviderInvocation): Promise<ProviderInvocationResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    timer.unref?.();
    try { return await this.invokeWithinDeadline(input, controller.signal); }
    catch (error) {
      if (controller.signal.aborted || (error as Error)?.name === 'AbortError') {
        throw new ProviderInvocationError({ kind: 'timeout', message: 'OpenHands request deadline exceeded' });
      }
      if (error instanceof ProviderInvocationError) throw error;
      throw new ProviderInvocationError({ kind: 'unknown', message: 'OpenHands returned an unreadable response' });
    } finally { clearTimeout(timer); }
  }

  private async invokeWithinDeadline(input: ProviderInvocation, signal: AbortSignal): Promise<ProviderInvocationResult> {
    const instruction = [
      input.systemPrompt, '', input.taskPrompt, '',
      'OPENHANDS DELIVERY CONTRACT:',
      'Do not publish or mutate the caller repository. Work only inside your OpenHands sandbox.',
      'At completion, write the exact final JSON worker envelope to .subagentcore-result.json in the workspace root.',
      'Then return the same JSON envelope as your final response.',
    ].join('\n');

    const created = await this.jsonRequest(input, signal, 'POST', '/app-conversations', {
      initial_message: { role: 'user', content: [{ type: 'text', text: instruction }] },
      llm_model: input.model,
    });
    const taskId = String(created?.id ?? created?.start_task_id ?? '');
    if (!taskId) throw new ProviderInvocationError({ kind: 'unknown', message: 'OpenHands create returned no start task id' });

    const startedAt = Date.now();
    let conversationId = '';
    while (Date.now() - startedAt < input.timeoutMs) {
      const task = firstItem(await this.jsonRequest(input, signal, 'GET', `/app-conversations/start-tasks?ids=${encodeURIComponent(taskId)}`));
      const state = String(task.status ?? '').toUpperCase();
      if (state === 'READY') { conversationId = String(task.app_conversation_id ?? ''); break; }
      if (state === 'ERROR' || state === 'FAILED') throw new ProviderInvocationError({ kind: 'server', message: String(task.detail ?? 'OpenHands start task failed') });
      await this.sleep(1_000);
    }
    if (!conversationId) throw new ProviderInvocationError({ kind: 'timeout', message: 'OpenHands conversation start timed out' });

    let meta: Record<string, any> = {};
    while (Date.now() - startedAt < input.timeoutMs) {
      meta = firstItem(await this.jsonRequest(input, signal, 'GET', `/app-conversations?ids=${encodeURIComponent(conversationId)}`));
      const execution = String(meta.execution_status ?? '').toLowerCase();
      if (['finished', 'error', 'failed', 'stuck', 'stopped'].includes(execution)) break;
      await this.sleep(1_000);
    }

    const execution = String(meta.execution_status ?? '').toLowerCase();
    if (!['finished', 'error', 'failed', 'stuck', 'stopped'].includes(execution)) {
      throw new ProviderInvocationError({ kind: 'timeout', message: 'OpenHands execution deadline exceeded' });
    }
    const exportResponse = await this.fetchImpl(`${input.baseUrl}/app-conversations/${encodeURIComponent(conversationId)}/download`, { signal, headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/zip' } });
    let entries: ReturnType<typeof readZipTextEntries> = [];
    if (exportResponse.ok) entries = readZipTextEntries(new Uint8Array(await exportResponse.arrayBuffer()));

    if (execution !== 'finished') {
      throw new ProviderInvocationError(extractOpenHandsFailure(entries, meta));
    }

    const text = resultArtifact(entries);
    if (!text) throw new ProviderInvocationError({ kind: 'unknown', message: 'OpenHands finished without a readable SubAgentCore result artifact' });
    const usage = meta?.metrics?.accumulated_token_usage ?? {};
    return { text, ...(Number.isFinite(usage.prompt_tokens) ? { promptTokens: usage.prompt_tokens } : {}), ...(Number.isFinite(usage.completion_tokens) ? { completionTokens: usage.completion_tokens } : {}) };
  }
}
