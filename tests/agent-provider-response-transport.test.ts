import http from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { OpenAICompatibleProvider } from '../src/agent-provider.js';
import { AgentProviderRequestError, classifyAgentProviderFailure } from '../src/agent-provider-errors.js';

describe('provider response transport failure boundary', () => {
  it('keeps a real mid-body disconnect in the recoverable transport path', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"choices":[{"message":{"content":"partial');
      // Headers and some body have reached fetch; the subsequent read owns the failure.
      setTimeout(() => res.destroy(), 10);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    try {
      const provider = new OpenAICompatibleProvider({
        enabled: true, baseUrl: `http://127.0.0.1:${port}/v1`, model: 'local-fixture',
        apiKey: null, requestTimeoutMs: 2_000, maxToolIterations: 1,
      });
      const failure = await provider.complete([{ role: 'user', content: 'fixture' }]).then(
        () => { throw new Error('partial provider body was accepted'); },
        error => error,
      );
      expect(failure).toMatchObject({ message: 'terminated', cause: { code: 'UND_ERR_SOCKET' } });
      expect(classifyAgentProviderFailure(failure, 10_000)).toMatchObject({
        failureClass: 'TRANSPORT_TRANSIENT', scope: 'provider', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: true, retryAtMs: 40_000,
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it.each(['UND_ERR_SOCKET', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH', 'ECONNRESET', 'EPIPE'])(
    'recognizes structured nested %s despite an uninformative outer message', code => {
      const error = new TypeError('terminated', { cause: new Error('opaque', { cause: { code } }) });
      expect(classifyAgentProviderFailure(error).failureClass).toBe('TRANSPORT_TRANSIENT');
    },
  );

  it('does not promote deterministic or ambiguous failures to retryable transport', () => {
    for (const error of [
      new Error('terminated'), new SyntaxError('Unexpected end of JSON input'),
      new Error('agent provider response exceeded 8388608 bytes'),
      new Error('opaque', { cause: { code: 'EUNKNOWN' } }),
      new DOMException('The operation was aborted', 'AbortError'),
    ]) {
      expect(classifyAgentProviderFailure(error).failureClass).toBe('INTERNAL_CONTRACT');
    }
    const httpError = new AgentProviderRequestError({ status: 400, message: 'invalid request' });
    Object.defineProperty(httpError, 'cause', { value: { code: 'UND_ERR_SOCKET' } });
    expect(classifyAgentProviderFailure(httpError).failureClass).toBe('REQUEST_INVALID');
  });

  it('bounds cause traversal and tolerates cycles without widening unknown failures', () => {
    const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
    expect(classifyAgentProviderFailure(new Error('opaque', { cause: cycle })).failureClass).toBe('INTERNAL_CONTRACT');
    let deep: unknown = { code: 'UND_ERR_SOCKET' };
    for (let i = 0; i < 12; i += 1) deep = { cause: deep };
    expect(classifyAgentProviderFailure(new Error('opaque', { cause: deep })).failureClass).toBe('INTERNAL_CONTRACT');
  });
});
