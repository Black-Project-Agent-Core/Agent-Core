import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { currentToolInvocationRequest } from '../tracker/tool-invocation.js';
import { ArtifactAuthorization, type ArtifactIdentity } from '../auth/artifact-authorization.js';
import { ArtifactInspectionService } from '../artifact-analysis/service.js';
import { decideToolEvidenceCapture } from '../security/evidence-capture-policy.js';
import type { ExternalInvocationContext } from '../learning/external-controller.js';
import { assertReadActive } from '../rdc/utils/withTimeout.js';

const schema = z.object({
  action: z.enum(['prepare','status','inspect']),
  requestId: z.string().uuid().optional(),
  revisionDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
  path: z.string().max(4000).optional(),
  format: z.enum(['directory-js','asar','managed-pe']).optional(),
  selectedPaths: z.array(z.string().min(1).max(500)).max(64).optional(),
  rightsEvidenceRef: z.string().min(1).max(300).optional(),
  disclosureAudience: z.string().min(1).max(120).optional(),
}).strict();
const deny = () => { throw new Error('ARTIFACT_SCOPE_NOT_AUTHORIZED'); };
function identity(native?: ArtifactIdentity): {
  identity: ArtifactIdentity; invocationId: string; context?: ExternalInvocationContext;
  request: NonNullable<ReturnType<typeof currentToolInvocationRequest>>; signal?: AbortSignal;
} {
  const request = currentToolInvocationRequest();
  if (!request || request.tool !== 'artifact_inspect') return deny();
  if (native) {
    if (!native.ownerId || !native.taskId || !native.workspace
      || request.mutationContext.taskId !== native.taskId || request.mutationContext.signal?.aborted) return deny();
    return { identity: native, invocationId: request.identity.id, request,
      signal: request.mutationContext.signal };
  }
  const ctx = request.invocationContext;
  if (!ctx || ctx.binding !== 'bound' || !ctx.ownerId || !ctx.taskId || !ctx.workspace
    || ctx.invocationId !== request.identity.id || ctx.processSessionId !== request.identity.processSessionId
    || request.mutationContext.taskId !== ctx.taskId) return deny();
  return { identity: { ownerId: ctx.ownerId, taskId: ctx.taskId, workspace: ctx.workspace },
    invocationId: request.identity.id, context: ctx, request, signal: request.mutationContext.signal };
}
export type ArtifactInvocationValidator = (context: ExternalInvocationContext) => Promise<boolean>;
export function registerArtifactInspectTool(server: McpServer, auth: ArtifactAuthorization,
  isInvocationCurrent?: ArtifactInvocationValidator, nativeIdentity?: ArtifactIdentity) {
  const service = new ArtifactInspectionService(auth);
  server.registerTool('artifact_inspect', {
    title: 'Inspect Authorized Artifact',
    description: 'Static, bounded JS/Electron ASAR or PE/CLI metadata inspection. prepare does not read target; status returns own request; inspect requires exact operator permit via Agent Core local chat. No execution, attach, extraction or rights inferred from tool access.',
    inputSchema: schema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, async (raw) => {
    const args = schema.parse(raw);
    const host = identity(nativeIdentity);
    const assertCurrent = async () => {
      assertReadActive(host.signal);
      if (nativeIdentity) {
        if (currentToolInvocationRequest() !== host.request
          || host.request.mutationContext.taskId !== nativeIdentity.taskId) return deny();
      } else if (!host.context || !isInvocationCurrent || !await isInvocationCurrent(host.context)) return deny();
      assertReadActive(host.signal);
    };
    await assertCurrent();
    if (args.action === 'prepare') {
      if (!args.path || !args.format || !args.rightsEvidenceRef || !args.disclosureAudience) return deny();
      const prepared = auth.prepare(host.identity, { target: args.path, format: args.format,
        selected: args.selectedPaths ?? [], rightsRef: args.rightsEvidenceRef, audience: args.disclosureAudience });
      return { content: [{ type: 'text' as const, text: JSON.stringify(prepared) }] };
    }
    if (!args.requestId || !args.revisionDigest) return deny();
    if (args.action === 'status') return { content: [{ type: 'text' as const,
      text: JSON.stringify(auth.status(host.identity,args.requestId,args.revisionDigest)) }] };
    const snapshot = auth.inspect(host.identity,args.requestId,args.revisionDigest);
    // Evidence marker restriction is independent from operator permit and filesystem grant.
    const policy = decideToolEvidenceCapture('read_file', { path: snapshot.target });
    if (policy.disposition !== 'full' || policy.policyState === 'invalid') return deny();
    const result = await service.inspect(host.identity,args.requestId,args.revisionDigest,
      host.invocationId,host.signal,assertCurrent);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });
}
