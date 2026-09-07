import { ProviderInvocationError, classifyProviderFailure, responseErrorText, type ProviderInvocation, type ProviderInvocationResult, type SubAgentProvider } from './types.js';

export class OpenAICompatibleProvider implements SubAgentProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async invoke(input: ProviderInvocation): Promise<ProviderInvocationResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetchImpl(`${input.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          model: input.model,
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.taskPrompt },
          ],
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = await responseErrorText(response);
        throw new ProviderInvocationError(classifyProviderFailure(response.status, message, response.headers));
      }
      const data = await response.json() as any;
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new ProviderInvocationError({ kind: 'unknown', status: response.status, message: 'Provider returned no assistant content' });
      return {
        text: content,
        ...(Number.isFinite(data?.usage?.prompt_tokens) ? { promptTokens: data.usage.prompt_tokens } : {}),
        ...(Number.isFinite(data?.usage?.completion_tokens) ? { completionTokens: data.usage.completion_tokens } : {}),
      };
    } catch (error) {
      if (error instanceof ProviderInvocationError) throw error;
      if ((error as Error)?.name === 'AbortError') throw new ProviderInvocationError({ kind: 'timeout', message: 'Provider request timed out' });
      throw new ProviderInvocationError({ kind: 'network', message: error instanceof Error ? error.message : String(error) });
    } finally { clearTimeout(timer); }
  }
}
