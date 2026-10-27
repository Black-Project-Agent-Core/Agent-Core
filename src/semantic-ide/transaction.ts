import { createHash, randomUUID } from 'node:crypto';
import { offsetForPosition, preferredLineEnding } from './text-position.js';
import { access, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizedDestinationPath, authorizedExistingPath, isProtectedPath } from './path-safety.js';
import { readSemanticSource, writeSemanticSourceAtomic, type SemanticSourceDocument } from './source-io.js';
import type {
  LspPosition,
  RefactorSummary,
  RenameFileOperation,
  TextDocumentEditOperation,
  TextEdit,
  WorkspaceEdit,
} from './types.js';

import { fileMutationCoordinator, type MutationExecutionContext } from '../rdc/mutation-coordinator.js';
import { fileCheckpointService } from '../rdc/checkpoints/service.js';
export interface TextFilePlan {
  kind: 'text';
  root: string;
  absolutePath: string;
  relativePath: string;
  original: string;
  staged: string;
  fingerprint: string;
  editCount: number;
  ranges: TextEdit['range'][];
  source: SemanticSourceDocument;
}

export interface RenamePlan {
  kind: 'rename';
  root: string;
  oldAbsolutePath: string;
  newAbsolutePath: string;
  oldRelativePath: string;
  newRelativePath: string;
  fingerprint: string;
  overwrite: boolean;
  ignoreIfExists: boolean;
  destinationExists: boolean;
  skip: boolean;
}

export type WorkspacePlan = TextFilePlan | RenamePlan;

function fingerprintBytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeLineEndings(value: string, source: string): string {
  const eol = preferredLineEnding(source);
  return value.replace(/\r\n|\r|\n/g, eol);
}

function offsetAt(text: string, position: LspPosition): number {
  try { return offsetForPosition(text, position, { allowEndOfFileLine: true }); }
  catch (error) {
    if (error instanceof Error && error.message === 'SEMANTIC_TEXT_POSITION_INVALID') {
      throw new Error('SEMANTIC_EDIT_POSITION_INVALID');
    }
    throw new Error('SEMANTIC_EDIT_POSITION_OUT_OF_RANGE');
  }
}

function applyEdits(text: string, edits: TextEdit[]): string {
  const normalized = edits.map(edit => ({
    edit,
    start: offsetAt(text, edit.range.start),
    end: offsetAt(text, edit.range.end),
  })).sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 0; index < normalized.length; index += 1) {
    const item = normalized[index]!;
    if (item.end < item.start) throw new Error('SEMANTIC_EDIT_RANGE_INVALID');
    const previous = normalized[index - 1];
    if (previous && item.start < previous.end) throw new Error('SEMANTIC_EDIT_OVERLAP');
  }
  let output = text;
  for (const item of normalized.reverse()) {
    const replacement = normalizeLineEndings(item.edit.newText, text);
    output = output.slice(0, item.start) + replacement + output.slice(item.end);
  }
  return output;
}

function textDocumentEdit(value: unknown): value is TextDocumentEditOperation {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.textDocument && typeof record.textDocument === 'object' && Array.isArray(record.edits));
}

function renameOperation(value: unknown): value is RenameFileOperation {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.kind === 'rename' && typeof record.oldUri === 'string' && typeof record.newUri === 'string';
}

function collectTextEdits(edit: WorkspaceEdit): Map<string, TextEdit[]> {
  const result = new Map<string, TextEdit[]>();
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    result.set(uri, [...(result.get(uri) ?? []), ...edits]);
  }
  for (const item of edit.documentChanges ?? []) {
    if (!textDocumentEdit(item)) continue;
    result.set(item.textDocument.uri, [...(result.get(item.textDocument.uri) ?? []), ...item.edits]);
  }
  return result;
}

function translateWorkspaceBoundaryError(error: unknown, absolutePath: string): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('SEMANTIC_PATH_OUTSIDE_WORKSPACE') || message.includes('SEMANTIC_REALPATH_OUTSIDE_WORKSPACE')) {
    throw new Error(`SEMANTIC_WORKSPACE_EDIT_OUTSIDE_ROOT: ${absolutePath}`);
  }
  throw error;
}

async function requireExistingWorkspacePath(root: string, absolutePath: string) {
  try { return await authorizedExistingPath(root, absolutePath); }
  catch (error) { translateWorkspaceBoundaryError(error, absolutePath); }
}

async function requireWorkspaceDestination(root: string, absolutePath: string) {
  try { return await authorizedDestinationPath(root, absolutePath); }
  catch (error) { translateWorkspaceBoundaryError(error, absolutePath); }
}

async function planText(root: string, uri: string, edits: TextEdit[]): Promise<TextFilePlan> {
  let absolutePath: string;
  try { absolutePath = fileURLToPath(uri); }
  catch { throw new Error(`SEMANTIC_WORKSPACE_EDIT_URI_INVALID: ${uri}`); }
  const authorized = await requireExistingWorkspacePath(root, absolutePath);
  if (isProtectedPath(authorized.realPath)) throw new Error(`SEMANTIC_PROTECTED_PATH: ${absolutePath}`);
  const source = await readSemanticSource(root, absolutePath);
  return {
    kind: 'text',
    root,
    absolutePath,
    relativePath: path.relative(root, absolutePath),
    original: source.text,
    staged: applyEdits(source.text, edits),
    fingerprint: source.fingerprint,
    editCount: edits.length,
    ranges: edits.map(item => item.range),
    source,
  };
}

async function pathExists(value: string): Promise<boolean> {
  try { await access(value); return true; } catch { return false; }
}

async function planRename(root: string, operation: RenameFileOperation): Promise<RenamePlan> {
  let oldAbsolutePath: string;
  let newAbsolutePath: string;
  try {
    oldAbsolutePath = fileURLToPath(operation.oldUri);
    newAbsolutePath = fileURLToPath(operation.newUri);
  } catch {
    throw new Error('SEMANTIC_WORKSPACE_EDIT_URI_INVALID');
  }
  await requireExistingWorkspacePath(root, oldAbsolutePath);
  await requireWorkspaceDestination(root, newAbsolutePath);
  const destinationExists = await pathExists(newAbsolutePath);
  const overwrite = operation.options?.overwrite === true;
  const ignoreIfExists = operation.options?.ignoreIfExists === true;
  if (destinationExists && !overwrite && !ignoreIfExists) {
    throw new Error(`SEMANTIC_RENAME_DESTINATION_EXISTS: ${path.relative(root, newAbsolutePath)}`);
  }
  return {
    kind: 'rename',
    root,
    oldAbsolutePath,
    newAbsolutePath,
    oldRelativePath: path.relative(root, oldAbsolutePath),
    newRelativePath: path.relative(root, newAbsolutePath),
    fingerprint: fingerprintBytes(await readFile(oldAbsolutePath)),
    overwrite,
    ignoreIfExists,
    destinationExists,
    skip: destinationExists && ignoreIfExists,
  };
}

export async function planWorkspaceEdit(root: string, edit: WorkspaceEdit): Promise<WorkspacePlan[]> {
  const plans: WorkspacePlan[] = [];
  for (const [uri, edits] of collectTextEdits(edit)) {
    plans.push(await planText(root, uri, edits));
  }
  for (const item of edit.documentChanges ?? []) {
    if (textDocumentEdit(item)) continue;
    if (renameOperation(item)) {
      plans.push(await planRename(root, item));
      continue;
    }
    throw new Error('SEMANTIC_WORKSPACE_EDIT_UNSUPPORTED');
  }
  return plans;
}

export interface WorkspaceApplyOptions {
  dryRun?: boolean;
  autoCheckpoint?: boolean;
  execution?: MutationExecutionContext;
  atomicWriter?: (filePath: string, content: string) => Promise<void>;
}

interface AppliedText {
  plan: TextFilePlan;
}

interface AppliedRename {
  plan: RenamePlan;
  backupPath?: string;
}

async function writeTextPlan(
  root: string,
  plan: TextFilePlan,
  content: string,
  writer?: (filePath: string, content: string) => Promise<void>,
): Promise<void> {
  if (writer) {
    await writer(plan.absolutePath, content);
    return;
  }
  await writeSemanticSourceAtomic(root, plan.absolutePath, content, plan.source);
}

export async function applyWorkspacePlans(
  plans: WorkspacePlan[],
  options: WorkspaceApplyOptions = {},
): Promise<RefactorSummary> {
  const dryRun = options.dryRun === true;
  const textPlans = plans.filter((item): item is TextFilePlan => item.kind === 'text' && (!options.autoCheckpoint || item.original !== item.staged && item.editCount > 0));
  const renamePlans = plans.filter((item): item is RenamePlan => item.kind === 'rename' && !item.skip && (!options.autoCheckpoint || item.oldAbsolutePath !== item.newAbsolutePath));
  const summary: RefactorSummary = {
    dryRun,
    changedFiles: textPlans.length + renamePlans.length,
    changedEdits: textPlans.reduce((sum, item) => sum + item.editCount, 0) + renamePlans.length,
    files: textPlans.map(item => ({ relativePath: item.relativePath, editCount: item.editCount, ranges: item.ranges })),
    ...(renamePlans.length
      ? { renamedFiles: renamePlans.map(item => ({ from: item.oldRelativePath, to: item.newRelativePath })) }
      : {}),
  };
  if (dryRun || !summary.changedFiles) {
    if (options.autoCheckpoint) options.execution?.reportAutoCheckpoint({ status: 'not-captured', reason: dryRun ? 'dry-run' : 'no-change' });
    return summary;
  }
  const targets = [...textPlans.map(plan => plan.absolutePath), ...renamePlans.flatMap(plan => [plan.oldAbsolutePath, plan.newAbsolutePath])];
  return fileMutationCoordinator.run(targets, async () => {
    // Validate every planned source/destination before capture or the first mutation.
    for (const plan of textPlans) {
      await authorizedExistingPath(plan.root, plan.absolutePath);
      const current = await readSemanticSource(plan.root, plan.absolutePath, plan.source.encoding);
      if (current.fingerprint !== plan.fingerprint) throw new Error('SEMANTIC_SOURCE_DRIFT: ' + plan.relativePath);
    }
    for (const plan of renamePlans) {
      await authorizedExistingPath(plan.root, plan.oldAbsolutePath);
      await authorizedDestinationPath(plan.root, plan.newAbsolutePath);
      if (fingerprintBytes(await readFile(plan.oldAbsolutePath)) !== plan.fingerprint
        || await pathExists(plan.newAbsolutePath) !== plan.destinationExists) throw new Error('SEMANTIC_SOURCE_DRIFT: ' + plan.oldRelativePath);
    }
    if (options.autoCheckpoint) await fileCheckpointService.createAutomatic([...new Set(targets)], options.execution);

  const appliedText: AppliedText[] = [];
  const appliedRenames: AppliedRename[] = [];
  try {
    for (const plan of textPlans) {
      const current = await readSemanticSource(plan.root, plan.absolutePath, plan.source.encoding);
      if (current.fingerprint !== plan.fingerprint) {
        throw new Error(`SEMANTIC_SOURCE_DRIFT: ${plan.relativePath}`);
      }
      await writeTextPlan(plan.root, plan, plan.staged, options.atomicWriter);
      appliedText.push({ plan });
    }

    for (const plan of renamePlans) {
      const currentFingerprint = fingerprintBytes(await readFile(plan.oldAbsolutePath));
      if (currentFingerprint !== plan.fingerprint) {
        throw new Error(`SEMANTIC_SOURCE_DRIFT: ${plan.oldRelativePath}`);
      }
      await authorizedExistingPath(plan.root, plan.oldAbsolutePath);
      await authorizedDestinationPath(plan.root, plan.newAbsolutePath);

      let backupPath: string | undefined;
      if (plan.destinationExists && plan.overwrite) {
        backupPath = `${plan.newAbsolutePath}.semantic-rename-${randomUUID()}.bak`;
        await rename(plan.newAbsolutePath, backupPath);
      }
      try {
        await rename(plan.oldAbsolutePath, plan.newAbsolutePath);
      } catch (error) {
        if (backupPath) await rename(backupPath, plan.newAbsolutePath).catch(() => undefined);
        throw error;
      }
      appliedRenames.push({ plan, ...(backupPath ? { backupPath } : {}) });
    }
  } catch (error) {
    const rollbackFailures: string[] = [];

    for (const applied of [...appliedRenames].reverse()) {
      try {
        if (await pathExists(applied.plan.newAbsolutePath)) {
          await rename(applied.plan.newAbsolutePath, applied.plan.oldAbsolutePath);
        }
        if (applied.backupPath && await pathExists(applied.backupPath)) {
          await rename(applied.backupPath, applied.plan.newAbsolutePath);
        }
      } catch {
        rollbackFailures.push(`${applied.plan.newRelativePath}->${applied.plan.oldRelativePath}`);
      }
    }

    for (const applied of [...appliedText].reverse()) {
      try { await writeTextPlan(applied.plan.root, applied.plan, applied.plan.original, options.atomicWriter); }
      catch { rollbackFailures.push(applied.plan.relativePath); }
    }

    if (rollbackFailures.length) {
      throw new Error(`SEMANTIC_REFACTOR_ROLLBACK_FAILED: ${rollbackFailures.join(', ')}`);
    }
    throw error;
  }

  for (const applied of appliedRenames) {
    if (applied.backupPath) await rm(applied.backupPath, { force: true }).catch(() => undefined);
  }
  return summary;
  });
}

export async function applyWorkspaceEdit(root: string, edit: WorkspaceEdit, dryRun = false): Promise<RefactorSummary> {
  const plans = await planWorkspaceEdit(root, edit);
  return applyWorkspacePlans(plans, { dryRun });
}
