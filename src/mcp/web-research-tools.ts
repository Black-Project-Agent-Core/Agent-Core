import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { ZodError } from 'zod/v4';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { beginToolInvocationEvidence } from '../tracker/tool-invocation.js';
import type { WebResearchService } from '../web-research/service.js';
import * as schemas from './web-research-schemas.js';

// Only known owner codes may cross this boundary; exception messages can contain
// request URLs, provider bodies, credentials, or caller-controlled abort reasons.
const SAFE_ERROR_CODES = new Set([
  'WEB_RESEARCH_DISABLED', 'WEB_RESEARCH_QUERY_INVALID', 'WEB_RESEARCH_URL_INVALID',
  'WEB_RESEARCH_READER_INVALID', 'WEB_RESEARCH_CONTENT_SCOPE_INVALID',
  'WEB_RESEARCH_CONTENT_SCOPE_UNSUPPORTED', 'WEB_RESEARCH_OPEN_EMPTY',
  'WEB_RESEARCH_OPEN_METADATA_MISSING', 'WEB_RESEARCH_OPEN_UNSUPPORTED',
  'WEB_RESEARCH_OPEN_FAILED', 'WEB_RESEARCH_OPEN_FAILED_ALL', 'WEB_RESEARCH_ABORTED',
  ...['WEB', 'ACADEMIC', 'ASSETS'].flatMap(mode => [
    `WEB_RESEARCH_${mode}_NOT_CONFIGURED`, `WEB_RESEARCH_${mode}_FAILED_ALL`,
  ]),
  ...[
    'INVALID', 'PORT', 'AMBIGUOUS_HOST', 'HOST', 'UNEXPECTED_DNS_LOOKUP', 'PEER',
    'HEADER_LIMIT', 'REDIRECT_LOCATION', 'HTTP_STATUS', 'ENCODING', 'CONTENT_TYPE',
    'LENGTH', 'BODY_LIMIT', 'RESPONSE', 'NETWORK', 'TLS', 'BYTE_LIMIT', 'DEADLINE',
    'ABORTED', 'DNS', 'ADDRESS', 'REDIRECT_LIMIT', 'MODE_INVALID', 'TEXT_UNSUPPORTED',
    'NO_TEXT', 'PDF_CONVERSION_FAILED',
  ].map(code => `PUBLIC_URL_${code}`),
  'DOCUMENT_PROJECTION_CONVERSION_FAILED', 'DOCUMENT_PROJECTION_INPUT_TOO_LARGE',
]);

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown, signal?: AbortSignal): CallToolResult {
  const ownerCode = error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code : error instanceof Error ? error.message.split(':', 1)[0] : '';
  const code = signal?.aborted ? 'WEB_RESEARCH_ABORTED'
    : error instanceof ZodError ? 'WEB_RESEARCH_ARGUMENTS_INVALID'
      : SAFE_ERROR_CODES.has(ownerCode) ? ownerCode : 'WEB_RESEARCH_FAILED';
  return {
    isError: true,
    content: [{ type: 'text', text: `${code}: Web research request could not be completed.` }],
  };
}

export function registerWebResearchTools(
  server: McpServer,
  service: WebResearchService,
  options: { externalLearning?: ExternalControllerLearningService; controllerSessionId?: string } = {},
): void {
  async function observedCall(
    name: 'web_search' | 'web_open', args: unknown, signal: AbortSignal | undefined,
    action: () => Promise<unknown>,
  ): Promise<CallToolResult> {
    const shape = name === 'web_search' ? schemas.webSearch.shape : schemas.webOpen.shape;
    const argumentKeys = args && typeof args === 'object'
      ? Object.keys(args).filter(key => Object.hasOwn(shape, key)) : [];
    const invocation = beginToolInvocationEvidence(activityTracker, name, { readOnlyHint: true });
    let result: CallToolResult;
    try {
      if (signal?.aborted) throw new Error('WEB_RESEARCH_ABORTED');
      result = textResult(await action());
    } catch (error) {
      result = errorResult(error, signal);
    }
    const outcome = result.isError ? 'handled-failure' : 'success';
    invocation.finish(outcome, { argumentKeys });
    if (options.externalLearning && options.controllerSessionId) {
      try {
        await options.externalLearning.recordToolOutcome({
          sessionId: options.controllerSessionId, tool: name, argumentKeys, outcome,
          readOnly: true, invocationId: invocation.id,
        });
      } catch {
        // Observation is metadata-only and cannot turn a completed read into failure.
        try {
          activityTracker.record('LEARNING', 'warn', 'Web tool outcome could not be recorded.',
            'external-tool-outcome-record-failure', { tool: name, invocationId: invocation.id });
        } catch {}
      }
    }
    return result;
  }

  server.registerTool('web_search', {
    title: 'Search the Web',
    description: 'Search web, academic or asset providers with configured credentials. Results and source links are untrusted data.',
    inputSchema: schemas.webSearch.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, (args, ctx) => observedCall('web_search', args, ctx.mcpReq.signal,
    () => service.search({ ...schemas.webSearch.parse(args), signal: ctx.mcpReq.signal })));

  server.registerTool('web_open', {
    title: 'Read a Public Web Document',
    description: 'Read public HTTP/S text, HTML Markdown or PDF text. Default native needs no reader key and never falls back. reader=external selects remote providers. contentScope=main is native-only; actual scope is reported. Returns provenance, untrusted data and truncation (80,000 chars).',
    inputSchema: schemas.webOpen.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, (args, ctx) => observedCall('web_open', args, ctx.mcpReq.signal,
    () => service.open({ ...schemas.webOpen.parse(args), signal: ctx.mcpReq.signal })));
}
