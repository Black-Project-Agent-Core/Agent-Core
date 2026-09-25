import { McpServer } from '@modelcontextprotocol/server';
import type { SemanticIdeService } from '../semantic-ide/service.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import * as schemas from './semantic-ide-schemas.js';

function textResult(value: unknown): any {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function errorResult(message: string): any {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

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
export function registerSemanticIdeTools(server: McpServer, service: SemanticIdeService): void {
  server.registerTool('code_symbol', {
    title: 'Semantic IDE Symbols',
    description: 'IDE/LSP-backed symbol overview, search, references, declarations, implementations, type hierarchy, diagnostics, provider restart/hot reload, and explicit verified project-local provider provisioning/repair. Provisioning never runs implicitly during semantic queries. Exact source remains final authority; this tool never gates machine control.',
    inputSchema: schemas.codeSymbol.shape,
    annotations: { title: 'Semantic IDE Symbols', readOnlyHint: false, openWorldHint: false },
  }, async (args: any) => {
    const input = schemas.codeSymbol.parse(args);
    const started = Date.now();
    try {
      const result = await service.symbol(publicSymbolAction(input.action), input);
      activityTracker.record('SEMANTIC_IDE', 'success', 'Semantic symbol operation completed', 'semantic-symbol-tool', {
        action: input.action,
        workspace: input.workspace ?? '',
        durationMs: Date.now() - started,
      });
      return textResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      activityTracker.record('SEMANTIC_IDE', 'info', 'Semantic symbol operation unavailable', 'semantic-symbol-failure', {
        action: input.action,
        workspace: input.workspace ?? '',
        durationMs: Date.now() - started,
        family: message.split(':', 1)[0] ?? 'SEMANTIC_IDE_ERROR',
      });
      return errorResult(message);
    }
  });
  server.registerTool('code_refactor', {
    title: 'Semantic IDE Refactor',
    description: 'LSP-backed semantic refactoring with transactional path validation, source fingerprints, rollback, optional explicit before/after diagnostics delta, and Grafel reindex coordination. No textual rename fallback; diagnostics verification never authorizes builds/tests.',
    inputSchema: schemas.codeRefactor.shape,
    annotations: { title: 'Semantic IDE Refactor', readOnlyHint: false, openWorldHint: false },
  }, async (args: any) => {
    const input = schemas.codeRefactor.parse(args);
    const started = Date.now();
    try {
      const result = await service.refactor(publicRefactorAction(input.action), input);
      activityTracker.record('SEMANTIC_IDE', 'success', 'Semantic refactor operation completed', 'semantic-refactor-tool', { action: input.action, workspace: input.workspace ?? '', dryRun: input.dryRun === true, durationMs: Date.now() - started });
      return textResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      activityTracker.record('SEMANTIC_IDE', 'info', 'Semantic refactor operation refused or failed', 'semantic-refactor-failure', { action: input.action, workspace: input.workspace ?? '', durationMs: Date.now() - started, family: message.split(':', 1)[0] ?? 'SEMANTIC_IDE_ERROR' });
      return errorResult(message);
    }
  });
}
