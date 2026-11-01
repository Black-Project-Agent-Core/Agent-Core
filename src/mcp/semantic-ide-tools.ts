import { McpServer } from '@modelcontextprotocol/server';
import type { SemanticIdeService } from '../semantic-ide/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { externalControllerToolResult, beginExternalControllerToolCall } from './external-controller-tool-support.js';
import { currentToolInvocationRequest } from '../tracker/tool-invocation.js';
import * as schemas from './semantic-ide-schemas.js';
import { errorTextResult as errorResult, jsonTextResult as textResult } from './text-result.js';

function publicSymbolAction(action: string): string {
  if (action === schemas.SYMBOL_REFS) return 'refs';
  if (action === schemas.SYMBOL_DECL) return 'decl';
  if (action === schemas.SYMBOL_IMPL) return 'impl';
  if (action === schemas.SYMBOL_DIAG) return 'diag';
  if (action === schemas.SYMBOL_RESTART) return 'restart';
  if (action === schemas.SYMBOL_RELOAD) return 'reloadProviders';
  if (action === schemas.SYMBOL_PROVISION) return 'provisionProvider';
  if (action === schemas.SYMBOL_TYPE_HIERARCHY) return 'typeHierarchy';
  return action;
}

function publicRefactorAction(action: string): string {
  if (action === schemas.REFACTOR_SAFE) return 'safeRemove';
  if (action === 'replace_body') return 'replaceBody';
  if (action === 'insert_before') return 'before';
  if (action === 'insert_after') return 'after';
  return action;
}
export function registerSemanticIdeTools(
  server: McpServer,
  service: SemanticIdeService,
  externalController?: ExternalControllerLearningService,
  externalSessionId?: string,
): void {
  server.registerTool('code_symbol', {
    title: 'Semantic IDE Symbols',
    description: 'IDE/LSP-backed symbol overview, search, references, declarations, implementations, type hierarchy, diagnostics, provider restart/hot reload, and explicit verified project-local provider provisioning/repair. Provisioning never runs implicitly during semantic queries. Exact source remains final authority; this tool never gates machine control.',
    inputSchema: schemas.codeSymbol.shape,
    annotations: { title: 'Semantic IDE Symbols', readOnlyHint: false, openWorldHint: false },
  }, async (args: any) => {
    const call = beginExternalControllerToolCall('code_symbol');
    const input = schemas.codeSymbol.parse(args);
    const started = Date.now();
    try {
      const result = await service.symbol(publicSymbolAction(input.action), input);
      activityTracker.record('SEMANTIC_IDE', 'success', 'Semantic symbol operation completed', 'semantic-symbol-tool', {
        action: input.action,
        workspace: input.workspace ?? '',
        durationMs: Date.now() - started,
      });
      return externalControllerToolResult({ call,
        service: externalController,
        sessionId: externalSessionId,
        tool: 'code_symbol',
        args: input,
        result: textResult(result),
        readOnly: ![schemas.SYMBOL_RESTART, schemas.SYMBOL_RELOAD, schemas.SYMBOL_PROVISION].includes(input.action),
        ...(input.workspace ? { workspace: input.workspace } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      activityTracker.record('SEMANTIC_IDE', 'info', 'Semantic symbol operation unavailable', 'semantic-symbol-failure', {
        action: input.action,
        workspace: input.workspace ?? '',
        durationMs: Date.now() - started,
        family: message.split(':', 1)[0] ?? 'SEMANTIC_IDE_ERROR',
      });
      return externalControllerToolResult({ call,
        service: externalController,
        sessionId: externalSessionId,
        tool: 'code_symbol',
        args: input,
        result: errorResult(message),
        readOnly: ![schemas.SYMBOL_RESTART, schemas.SYMBOL_RELOAD, schemas.SYMBOL_PROVISION].includes(input.action),
        ...(input.workspace ? { workspace: input.workspace } : {}),
      });
    }
  });
  server.registerTool('code_refactor', {
    title: 'Semantic IDE Refactor',
    description: 'LSP-backed semantic refactoring with transactional path validation, source fingerprints, rollback, optional explicit before/after diagnostics delta, and Grafel reindex coordination. No textual rename fallback; diagnostics verification never authorizes builds/tests. autoCheckpoint defaults false: best-effort snapshot of non-dryRun changed text/rename paths; failed capture does not cancel an authorized refactor.',
    inputSchema: schemas.codeRefactor.shape,
    annotations: { title: 'Semantic IDE Refactor', readOnlyHint: false, openWorldHint: false },
  }, async (args: any) => {
    const call = beginExternalControllerToolCall('code_refactor');
    const input = schemas.codeRefactor.parse(args);
    const started = Date.now();
    try {
      const result = await service.refactor(publicRefactorAction(input.action), input, currentToolInvocationRequest()?.mutationContext);
      activityTracker.record('SEMANTIC_IDE', 'success', 'Semantic refactor operation completed', 'semantic-refactor-tool', { action: input.action, workspace: input.workspace ?? '', dryRun: input.dryRun === true, durationMs: Date.now() - started });
      return externalControllerToolResult({ call,
        service: externalController,
        sessionId: externalSessionId,
        tool: 'code_refactor',
        args: input,
        result: textResult(result),
        readOnly: input.dryRun === true,
        ...(input.workspace ? { workspace: input.workspace } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      activityTracker.record('SEMANTIC_IDE', 'info', 'Semantic refactor operation refused or failed', 'semantic-refactor-failure', { action: input.action, workspace: input.workspace ?? '', durationMs: Date.now() - started, family: message.split(':', 1)[0] ?? 'SEMANTIC_IDE_ERROR' });
      return externalControllerToolResult({ call,
        service: externalController,
        sessionId: externalSessionId,
        tool: 'code_refactor',
        args: input,
        result: errorResult(message),
        readOnly: input.dryRun === true,
        ...(input.workspace ? { workspace: input.workspace } : {}),
      });
    }
  });
}
