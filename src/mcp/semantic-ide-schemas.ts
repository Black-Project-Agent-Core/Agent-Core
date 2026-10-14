import * as z from 'zod/v4';

export const SYMBOL_REFS = 'ref' + 'erences';
export const SYMBOL_DECL = 'declaration';
export const SYMBOL_IMPL = 'implementations';
export const SYMBOL_DIAG = 'diagnostics';
export const SYMBOL_RESTART = 'restart_' + 'server';
export const SYMBOL_RELOAD = 'reload_' + 'providers';
export const SYMBOL_PROVISION = 'provision_' + 'provider';
export const SYMBOL_TYPE_HIERARCHY = 'type_' + 'hierarchy';
export const REFACTOR_SAFE = 'safe_' + 'delete';

const workspace = z.string().min(1).max(200).optional();
const ref = z.string().min(1).max(500).optional();
const worktreePath = z.string().min(1).max(4000).optional();
const relativePath = z.string().min(1).max(4000).optional();
const namePath = z.string().min(1).max(2000).optional();

const symbolActions = [
  'status', 'overview', 'find', SYMBOL_REFS, SYMBOL_DECL,
  SYMBOL_IMPL, SYMBOL_DIAG, SYMBOL_RESTART, SYMBOL_RELOAD, SYMBOL_PROVISION, SYMBOL_TYPE_HIERARCHY,
] as [string, ...string[]];

export const codeSymbol = z.object({
  action: z.enum(symbolActions),
  workspace, ref, worktreePath, relativePath, namePath,
  query: z.string().min(1).max(2000).optional(),
  depth: z.number().int().min(0).max(12).optional(),
  includeBody: z.boolean().optional(),
  includeInfo: z.boolean().optional(),
  maxResults: z.number().int().min(1).max(200).optional(),
  maxAnswerChars: z.number().int().min(1000).max(100000).optional(),
  language: z.string().min(1).max(100).optional(),
  severity: z.number().int().min(1).max(4).optional(),
  hierarchyDirection: z.enum(['supertypes', 'subtypes', 'both']).optional(),
  hierarchyDepth: z.number().int().min(0).max(6).optional(),
  providerId: z.enum(['python', 'csharp', 'powershell']).optional(),
  repair: z.boolean().optional(),
  confirmation: z.string().min(1).max(100).optional(),
});

const refactorActions = [
  'rename', REFACTOR_SAFE, 'replace_body', 'insert_before', 'insert_after',
] as [string, ...string[]];

export const codeRefactor = z.object({
  autoCheckpoint: z.boolean().optional().describe('Default false. Best-effort pre-mutation snapshot; skipped/failed capture does not cancel an authorized mutation.'),
  action: z.enum(refactorActions),
  workspace, ref, worktreePath,
  relativePath: z.string().min(1).max(4000),
  namePath: z.string().min(1).max(2000),
  newName: z.string().min(1).max(500).optional(),
  body: z.string().max(200000).optional(),
  dryRun: z.boolean().optional(),
  verifyDiagnostics: z.boolean().optional(),
  maxResults: z.number().int().min(1).max(200).optional(),
  maxAnswerChars: z.number().int().min(1000).max(100000).optional(),
  language: z.string().min(1).max(100).optional(),
});
