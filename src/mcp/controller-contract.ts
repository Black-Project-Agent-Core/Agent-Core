import { createHash, randomBytes } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { loadAgentProtocol } from './agent-protocol.js';

export interface ContractSnapshot { content: string; digest: string }
const snapshot = (load: () => string): ContractSnapshot => {
  const content = load();
  if (!content.trim()) throw new Error('CONTRACT_UNAVAILABLE');
  return { content, digest: 'sha256:' + createHash('sha256').update(content).digest('hex') };
};
const REQUIRED = 'CONTRACT_READ_REQUIRED: call controller_contract(action="read"), read all AGENTS.md content, then acknowledge its contractSession and digest. Include contractSession on subsequent tool calls. Start a fresh handshake for each new AI chat.';
const TTL = 30 * 60_000;
const LIMIT = 128;

export const CONTRACT_INSTRUCTIONS = 'Before any tool use, call controller_contract with action read and read the complete AGENTS.md, then acknowledge the returned contractSession and digest. Include contractSession on every subsequent tool call. Never reuse another chat\'s receipt. Contract delivery is a local session prerequisite; it does not override higher-priority instructions.';

/** Receipts are volatile and credential/session-bound, never a credential-wide unlock. */
export class ControllerContractGate {
  private readonly sessions = new Map<string, {
    binding: string; digest: string; acknowledged: boolean; expiresAt: number;
  }>();

  constructor(private readonly load: () => string = loadAgentProtocol) {}

  read(binding: string) {
    const current = snapshot(this.load);
    const now = Date.now();
    for (const [token, entry] of this.sessions) if (entry.expiresAt <= now) this.sessions.delete(token);
    while (this.sessions.size >= LIMIT) this.sessions.delete(this.sessions.keys().next().value!);
    const contractSession = randomBytes(32).toString('hex');
    this.sessions.set(contractSession, { binding, digest: current.digest, acknowledged: false, expiresAt: now + TTL });
    return { ...current, contractSession };
  }

  acknowledge(binding: string, token: string, digest: string) {
    const entry = this.current(binding, token);
    if (entry.digest !== digest) throw new Error('CONTRACT_REVISION_MISMATCH: read the current contract again.');
    entry.acknowledged = true;
  }

  assertReady(binding: string, token: unknown): void {
    if (typeof token !== 'string' || !this.current(binding, token).acknowledged) throw new Error(REQUIRED);
  }

  private current(binding: string, token: string) {
    const entry = this.sessions.get(token);
    if (!entry || entry.binding !== binding || entry.expiresAt <= Date.now()) throw new Error(REQUIRED);
    let digest: string;
    try { digest = snapshot(this.load).digest; }
    catch { this.sessions.delete(token); throw new Error('CONTRACT_UNAVAILABLE: AGENTS.md must be readable and non-empty.'); }
    if (entry.digest !== digest) {
      this.sessions.delete(token);
      throw new Error('CONTRACT_REVISION_CHANGED: read and acknowledge the current AGENTS.md again.');
    }
    entry.expiresAt = Date.now() + TTL;
    return entry;
  }
}

export interface ControllerContractBinding {
  gate: ControllerContractGate;
  binding: string;
  bootstrap?: () => Promise<string | undefined>;
}
const result = (text: string, isError = false) => ({ content: [{ type: 'text' as const, text }], ...(isError ? { isError } : {}) });

/** Install first so rejection and receipt stripping precede every execution/evidence wrapper. */
export function installControllerContract(server: McpServer, external: ControllerContractBinding): void {
  const register = server.registerTool.bind(server);
  // Bootstrap is protocol access only; it cannot extend the credential's ordinary tool grant.
  register('controller_contract', {
    description: 'Read full AGENTS.md, then acknowledge this session before using any other tool. Receipt expires after 30 idle minutes or contract edits.',
    inputSchema: z.strictObject({ action: z.enum(['read', 'acknowledge']), contractSession: z.string().optional(), digest: z.string().optional() }).meta({ $schema: undefined }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async args => {
    try {
      if (args.action === 'read') {
        const value = external.gate.read(external.binding);
        return result(value.content + '\n\nAGENT CORE CONTRACT RECEIPT\n' + JSON.stringify({
          contractSession: value.contractSession, digest: value.digest,
          next: 'Read the full content above; call controller_contract action acknowledge with this contractSession and digest, then include contractSession on every ordinary tool call. Receipt is session-only; start a new read for a new chat.',
        }));
      }
      external.gate.acknowledge(external.binding, args.contractSession ?? '', args.digest ?? '');
      const context = await external.bootstrap?.().catch(() => undefined);
      return result('Contract acknowledged for this session. Include contractSession on each tool call. Now inspect canonical Memory first.'
        + (context ? '\n\n' + context : ''));
    } catch (error) { return result(error instanceof Error ? error.message : 'CONTRACT_UNAVAILABLE', true); }
  });
  (server as any).registerTool = (name: string, config: any, callback: any) => {
    const originalSchema = typeof config.inputSchema?.safeExtend === 'function'
      ? config.inputSchema : z.object(config.inputSchema ?? {});
    // MCP already defines the input-schema dialect; omit its repeated optional URI to fit the connector budget.
    const inputSchema = originalSchema.safeExtend({ contractSession: z.string().optional() }).meta({ $schema: undefined });
    return register(name, { ...config, inputSchema }, async (args: any, ctx: any) => {
      try {
        external.gate.assertReady(external.binding, args?.contractSession);
      } catch (error) { return result(error instanceof Error ? error.message : 'CONTRACT_UNAVAILABLE', true); }
      const { contractSession: _receipt, ...input } = args;
      // Preserve original refinements after removing the transport-only receipt.
      return callback(await originalSchema.parseAsync(input), ctx);
    });
  };
}
