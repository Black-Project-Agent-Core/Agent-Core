import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { VerifiedKey } from '../auth/key-types.js';
import type { RuntimeServices } from '../runtime/services.js';
import { persistentPrincipalId } from './project-scope.js';

export const OPERATOR_DIRECTIVE_TOOL_NAMES = [
  'operator_directive_status',
  'operator_directive_set',
  'operator_directive_revoke',
] as const;

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: { message } }, null, 2) }],
    isError: true as const,
  };
}

async function guarded<T>(operation: () => Promise<T>) {
  try { return textResult(await operation()); }
  catch (error) { return errorResult(error); }
}

function authenticationMode(key: VerifiedKey) {
  return key.authentication ?? 'bearer-api-key' as const;
}

function compactMutation(
  mutation: Awaited<ReturnType<RuntimeServices['operatorDirectives']['set']>>,
  invalidatedRoutes: number,
) {
  return {
    directiveKey: mutation.directive.directiveKey,
    active: mutation.directive.active,
    revisionNo: mutation.directive.revisionNo,
    verbatimSha256: mutation.directive.verbatimSha256,
    projectionSha256: mutation.directive.projectionSha256,
    eventId: mutation.event.id,
    eventType: mutation.event.eventType,
    invalidatedRoutes,
  };
}

export function registerOperatorDirectiveTools(
  server: McpServer,
  runtime: RuntimeServices,
  key: VerifiedKey,
): void {
  server.registerTool('operator_directive_status', {
    title: 'Operator Directive Status',
    description: 'Return bounded principal-scoped standing directive status and catalog-derived authority metadata without verbatim source text or credentials.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => guarded(async () => {
    const principalId = persistentPrincipalId(runtime, key);
    const [status, snapshot] = await Promise.all([
      runtime.operatorDirectives.status(principalId),
      runtime.operatorDirectives.snapshot(principalId),
    ]);
    return {
      ...status,
      snapshotHash: snapshot.snapshotHash,
      directives: snapshot.directives.map((directive) => ({
        directiveKey: directive.directiveKey,
        category: directive.category,
        effect: directive.effect,
        effectVersion: directive.effectVersion,
        scope: directive.scope,
        trust: directive.trust,
        active: directive.active,
        revisionNo: directive.revisionNo,
        verbatimSha256: directive.verbatimSha256,
        expandsAgentCoreToolPermissions: directive.expandsAgentCoreToolPermissions,
        bypassesSafetyPolicy: directive.bypassesSafetyPolicy,
        bypassesOsAuthorization: directive.bypassesOsAuthorization,
      })),
    };
  }));

  server.registerTool('operator_directive_set', {
    title: 'Set Operator Directive',
    description: 'Grant or explicitly revise a cataloged principal-bound standing directive from the authenticated operator. This never accepts arbitrary policy effects.',
    inputSchema: {
      directiveKey: z.literal('dev_tool_install_consent'),
      verbatimText: z.string().min(1).max(20_000),
      explicitGrant: z.literal(true),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async ({ directiveKey, verbatimText, explicitGrant }) => guarded(async () => {
    const principalId = persistentPrincipalId(runtime, key);
    const mutation = await runtime.operatorDirectives.set({
      principalId,
      directiveKey,
      verbatimText,
      explicitGrant,
      actorKeyId: key.id,
      authenticationMode: authenticationMode(key),
    });
    const invalidatedRoutes = runtime.routes.invalidateByDirective(principalId, directiveKey);
    return compactMutation(mutation, invalidatedRoutes);
  }));

  server.registerTool('operator_directive_revoke', {
    title: 'Revoke Operator Directive',
    description: 'Revoke one active principal-bound standing directive and invalidate captured routes so the revoked authority cannot persist in an old route.',
    inputSchema: {
      directiveKey: z.literal('dev_tool_install_consent'),
      reason: z.string().min(1).max(5_000),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async ({ directiveKey, reason }) => guarded(async () => {
    const principalId = persistentPrincipalId(runtime, key);
    const mutation = await runtime.operatorDirectives.revoke({
      principalId,
      directiveKey,
      actorKeyId: key.id,
      authenticationMode: authenticationMode(key),
      reason,
    });
    const invalidatedRoutes = runtime.routes.invalidateByDirective(principalId, directiveKey);
    return compactMutation(mutation as Awaited<ReturnType<RuntimeServices['operatorDirectives']['set']>>, invalidatedRoutes);
  }));
}
