import { execFile } from 'node:child_process';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveModuleProjectRoot } from '../portability/paths.js';

const root = resolveModuleProjectRoot(import.meta.url);
export const nativeChatBridgeSchema = z.strictObject({
  action: z.enum(['list', 'read', 'create', 'send', 'cancel', 'wait']),
  conversationId: z.string().trim().optional(), turnId: z.string().trim().optional(),
  prompt: z.string().trim().min(1).max(200_000).optional(), clientRequestId: z.string().optional(),
  workspace: z.string().trim().optional(), title: z.string().trim().optional(),
  providerId: z.string().optional(),
  includeArchived: z.boolean().optional(), maxMessages: z.number().int().optional(),
  statusOnly: z.boolean().optional(), timeoutMs: z.number().int().optional(),
}).superRefine((value, ctx) => {
  // Keep full admission bounds in one refinement without expanding the 128 KiB tools/list budget.
  for (const [key, max] of [['conversationId', 200], ['turnId', 200], ['clientRequestId', 200],
    ['workspace', 200], ['title', 160], ['providerId', 64]] as const) {
    const text = value[key];
    if (text !== undefined && (!text || text.length > max))
      ctx.addIssue({ code: 'custom', path: [key], message: 'nonblank bounded value required' });
  }
  if (value.maxMessages !== undefined && (value.maxMessages < 1 || value.maxMessages > 200))
    ctx.addIssue({ code: 'custom', path: ['maxMessages'], message: 'maxMessages must be 1..200' });
  if (value.timeoutMs !== undefined && (value.timeoutMs < 1000 || value.timeoutMs > 540_000))
    ctx.addIssue({ code: 'custom', path: ['timeoutMs'], message: 'timeoutMs must be 1000..540000' });
  for (const key of ['conversationId', 'turnId', 'clientRequestId', 'providerId'] as const) {
    const text = value[key];
    if (text !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text))
      ctx.addIssue({ code: 'custom', path: [key], message: 'invalid identifier' });
  }
  if (['read', 'send', 'wait'].includes(value.action) && !value.conversationId)
    ctx.addIssue({ code: 'custom', path: ['conversationId'], message: 'conversationId required' });
  if (value.action === 'cancel' && !value.turnId)
    ctx.addIssue({ code: 'custom', path: ['turnId'], message: 'turnId required' });
  if (value.action === 'send' && (!value.prompt || !value.clientRequestId))
    ctx.addIssue({ code: 'custom', path: ['clientRequestId'], message: 'send requires prompt and a stable clientRequestId' });
});

function result(value: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) };
}

/** Host-only environment; the public schema cannot select credentials, endpoint, program or origin. */
export async function runNativeChatBridge(raw: unknown, host: { env?: NodeJS.ProcessEnv; signal?: AbortSignal } = {}) {
  const input = nativeChatBridgeSchema.parse(raw), env = host.env ?? process.env;
  const args = [path.join(root, 'scripts', 'external', 'native-chat-bridge.mjs'), input.action];
  if (input.action === 'read' || input.action === 'send' || input.action === 'wait') args.push(input.conversationId!);
  if (input.action === 'cancel') args.push(input.turnId!);
  if (input.action === 'list' && input.includeArchived) args.push('--archived');
  if (input.action === 'read' && input.maxMessages) args.push('--max-messages', String(input.maxMessages));
  if (input.action === 'read' && input.statusOnly) args.push('--status');
  if (input.action === 'wait' && input.timeoutMs) args.push('--timeout-ms', String(input.timeoutMs));
  if (input.action === 'create') {
    if (input.workspace) args.push('--workspace', input.workspace);
    if (input.title) args.push('--title', input.title);
  }
  if (input.action === 'send') {
    args.push('--stdin', '--client-request-id', input.clientRequestId!);
    if (input.providerId) args.push('--provider', input.providerId);
  }
  const start = performance.now();
  const configured = Number.parseInt(env.AGENT_CORE_NATIVE_CHAT_TIMEOUT_MS ?? '600000', 10);
  const timeout = Number.isSafeInteger(configured) && configured >= 1000 && configured <= 1_800_000 ? configured : 600_000;
  if (host.signal?.aborted) return result({ code: 'NATIVE_CHAT_BRIDGE_CANCELLED_BEFORE_START', outcome: 'not-started' }, true);
  return new Promise<ReturnType<typeof result>>(resolve => {
    const child = execFile(process.execPath, args, { cwd: root, env, windowsHide: true, shell: false,
      signal: host.signal, timeout: timeout + 5000, maxBuffer: 512 * 1024, encoding: 'utf8' }, (error, stdout) => {
      const token = (env.AGENT_CORE_UI_TOKEN ?? '').trim();
      const safe = token ? stdout.split(token).join('[REDACTED]') : stdout;
      const metrics = { elapsedMs: Math.round(performance.now() - start), outputBytes: Buffer.byteLength(safe) };
      if (error && (error.name === 'AbortError' || error.killed || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')) {
        resolve(result({ code: 'NATIVE_CHAT_BRIDGE_OUTCOME_UNKNOWN', outcome: 'unknown',
          recovery: 'Read the conversation/turn before retrying; reuse the exact clientRequestId. Transport cancellation does not stop the Native turn; cancel is a separate explicit action.',
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}), metrics }, true)); return;
      }
      try {
        const records = safe.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
        if (!records.length) throw Error('empty output');
        const unknown = records.some(record => record.outcome === 'unknown');
        resolve(result({ records, metrics, ...(unknown ? { outcome: 'unknown' } : {}) }, Boolean(error) || records.some(record => record.type === 'error')));
      } catch {
        resolve(result({ code: 'NATIVE_CHAT_BRIDGE_RESPONSE_UNAVAILABLE', outcome: 'unknown', metrics }, true));
      }
    });
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(input.action === 'send' ? input.prompt : undefined);
  });
}

export function registerNativeChatBridgeTool(server: McpServer, nativeTaskId?: string) {
  if (nativeTaskId) return;
  server.registerTool('native_chat_bridge', {
    title: 'Native Chat',
    description: 'External chat; no operator approval. Stable clientRequestId for send. Timeout: read before retry; cancel to stop.',
    inputSchema: nativeChatBridgeSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (input, context) => runNativeChatBridge(input, { signal: context?.mcpReq?.signal }));
}
