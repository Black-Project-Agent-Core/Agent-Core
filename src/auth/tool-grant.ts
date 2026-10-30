// Native credential boundary using AgentOS explicit selected-tool membership as a design reference.
import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
const name = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
export const toolGrantSchema = z.strictObject({
  version: z.literal(1), allowedTools: z.array(name).max(128)
    .refine(items => new Set(items).size === items.length, 'duplicate tool grant'),
});
export type ToolGrant = z.infer<typeof toolGrantSchema>;
export function parseToolGrant(value: unknown): ToolGrant {
  const parsed = toolGrantSchema.safeParse(value);
  if (!parsed.success) throw new Error('TOOL_GRANT_INVALID');
  return parsed.data;
}
/** availableTools must be the operator's current registry/discovery snapshot; it is not persisted as authority. */
export function provisioningToolGrant(value: unknown, availableTools?: readonly string[]): ToolGrant | undefined {
  if (value === undefined) return undefined;
  const grant = parseToolGrant(value);
  if (grant.allowedTools.length) {
    const catalog = z.array(name).max(1024).safeParse(availableTools);
    if (!catalog.success) throw new Error('TOOL_GRANT_CATALOG_REQUIRED');
    const available = new Set(catalog.data);
    if (grant.allowedTools.some(tool => !available.has(tool))) throw new Error('TOOL_GRANT_UNKNOWN_TOOL');
  }
  return grant;
}
/** Read the existing grant without extending it; absent legacy grants retain existing semantics. */
export function credentialAllowsTool(principal: unknown, toolName: string): boolean {
  if (!principal || typeof principal !== 'object' || !('toolGrant' in principal)) return true;
  return parseToolGrant((principal as { toolGrant: unknown }).toolGrant).allowedTools.includes(toolName);
}

/**
 * A registry shared by many Native tasks serves only a caller the host named on that call (`ctx.mcpReq.caller`): no caller, no call.
 * The grant of each caller is enforced where the registry lists and runs tools (`InProcessToolHost`), not by disabling tools here.
 */
export function installCallerRequired(server: McpServer): void {
  const target = server as any, original = target.registerTool.bind(server);
  target.registerTool = (toolName: string, config: any, callback: any) => original(toolName, config, async (args: unknown, ctx: any) => {
    if (!ctx?.mcpReq?.caller) throw new Error('MCP_TOOL_CALLER_REQUIRED');
    return callback(args, ctx);
  });
}

/** Install before mutation admission. SDK disable hides discovery AND refuses direct raw calls. */
export function installCredentialToolGrant(server: McpServer, principal: unknown): void {
  if (!principal || typeof principal !== 'object' || !('toolGrant' in principal)) return;
  const grant = parseToolGrant((principal as { toolGrant: unknown }).toolGrant);
  const allowed = new Set(grant.allowedTools); // detached from mutable caller metadata
  const target = server as any, original = target.registerTool.bind(server);
  target.registerTool = (toolName: string, config: any, callback: any) => {
    const registered = original(toolName, config, async (args: unknown, ctx: unknown) => {
      if (!allowed.has(toolName)) throw new Error('MCP_TOOL_GRANT_DENIED');
      return callback(args, ctx);
    });
    if (!allowed.has(toolName)) registered.disable();
    return registered;
  };
}
