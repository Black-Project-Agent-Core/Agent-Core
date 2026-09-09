import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FileKeyStore } from './auth/key-store.js';
import { loadRecoveryPaths, loadRuntimeConfig, type AppConfig } from './config.js';
import { createExecutionRecoveryBundle, restoreExecutionRecoveryBundle } from './execution/backup.js';
import { MemoryService } from './memory/service.js';
import type { MemoryScope } from './memory/types.js';
import { applyExecutionRetention, planExecutionRetention } from './execution/retention.js';
import { SERVER_VERSION } from './mcp/server.js';
import { FileOAuthStore } from './oauth/store.js';
import { verifyAuditJournal } from './observability/audit-journal.js';
import { readFile } from 'node:fs/promises';
import { recoverWorkflowClassification } from './runtime/workflow-classification-recovery.js';

export type MemoryHydrateCliResult =
  | { state: 'REMOTE_EMPTY_CONFIRMED'; remoteHead: string | null }
  | { state: 'REMOTE_HYDRATED'; generationId: string; logicalStateHash: string; remoteHead: string }
  | { state: 'SECOND_MEMORY_HYDRATED'; logicalStateHash: string; fileCount: number; manifestVersionId: string }
  | { state: 'WORKFLOW_MEMORY_HYDRATED'; generationId:string; logicalStateHash:string; recordCount:number; memoryCount:number; rollbackPath:string };

export interface CliOptions {
  dataDir?: string;
  config?: AppConfig;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  memoryHydrate?: (scope: MemoryScope, vaultRoot: string) => Promise<MemoryHydrateCliResult>;
}

const USAGE = [
  'Usage:',
  '  agent-core create-key <name>',
  '  agent-core list-keys',
  '  agent-core revoke-key <id>',
  '  agent-core rotate-key <id>',
  '  agent-core reset-oauth [legacy-data-dir]',
  '  agent-core execution-backup [reason]',
  '  agent-core execution-restore <bundle-path>',
  '  agent-core execution-retention-plan [older-than-days]',
  '  agent-core execution-retention-apply <plan-path> <bundle-path>',
  '  agent-core memory-hydrate <principal-id> <project-id>',
  '  agent-core workflow-classification-recover <request.json> [--apply]',
  '  agent-core audit-verify [audit-root]',
].join('\n');

function boundedScopeValue(value: string | undefined, label: string, maxChars: number): string {
  const normalized = value?.normalize('NFKC').trim() ?? '';
  if (!normalized || normalized.length > maxChars || /[\r\n\0]/.test(normalized)) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

async function hydrateConfiguredMemoryRemote(
  config: AppConfig,
  scope: MemoryScope,
): Promise<MemoryHydrateCliResult> {
  const service = new MemoryService(config.memory);
  try {
    return await service.hydrateRemote(scope) as MemoryHydrateCliResult;
  } finally {
    await service.close();
  }
}

export async function runCli(args: string[], options: CliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const stderr = options.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  // Identity repair must stay reachable when the credential snapshot is the thing that broke,
  // so the full runtime config is only demanded by commands that actually need it.
  let loaded = options.config ?? null;
  const config = (): AppConfig => (loaded ??= loadRuntimeConfig());
  const identityDataDir = (): string => options.dataDir ?? loaded?.dataDir ?? loadRecoveryPaths().dataDir;
  const store = (): FileKeyStore => new FileKeyStore(identityDataDir());
  const [command, value, secondValue] = args;

  try {
    switch (command) {
      case 'create-key': {
        if (!value) return usageError(stderr);
        const created = await store().create(value);
        stdout(JSON.stringify(created, null, 2));
        return 0;
      }
      case 'list-keys': {
        stdout(JSON.stringify(await store().list(), null, 2));
        return 0;
      }
      case 'revoke-key': {
        if (!value) return usageError(stderr);
        const revoked = await store().revoke(value);
        if (!revoked) {
          stderr(`Key not found: ${value}`);
          return 1;
        }
        stdout(JSON.stringify({ id: value, revoked: true }, null, 2));
        return 0;
      }
      case 'rotate-key': {
        if (!value) return usageError(stderr);
        const rotated = await store().rotate(value);
        stdout(JSON.stringify(rotated, null, 2));
        return 0;
      }
      case 'reset-oauth': {
        const oauthStore = new FileOAuthStore(identityDataDir());
        const importClientStores = value
          ? [new FileOAuthStore(path.resolve(value))]
          : [];
        const result = await oauthStore.resetAuthorizationState({ importClientStores });
        stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      case 'execution-backup': {
        const result = await createExecutionRecoveryBundle({
          stateRoot: config().execution.stateRoot,
          logRoot: config().execution.logRoot,
          destinationRoot: path.join(path.dirname(config().execution.stateRoot), 'recovery-bundles'),
          sourceVersion: SERVER_VERSION,
          reason: value || 'operator-cli',
        });
        stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      case 'execution-restore': {
        if (!value) return usageError(stderr);
        const result = await restoreExecutionRecoveryBundle({
          bundlePath: path.resolve(value),
          stateRoot: config().execution.stateRoot,
          logRoot: config().execution.logRoot,
          rollbackRoot: path.join(path.dirname(config().execution.stateRoot), 'recovery-rollbacks'),
        });
        stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      case 'execution-retention-plan': {
        const days = value === undefined ? 30 : Number(value);
        if (!Number.isFinite(days) || days < 0) {
          stderr('older-than-days must be a non-negative number');
          return 2;
        }
        const olderThanMs = Math.floor(days * 24 * 60 * 60 * 1000);
        if (!Number.isSafeInteger(olderThanMs)) {
          stderr('older-than-days is too large');
          return 2;
        }
        const result = await planExecutionRetention({
          logRoot: config().execution.logRoot,
          planRoot: path.join(path.dirname(config().execution.stateRoot), 'retention'),
          olderThanMs,
        });
        stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      case 'memory-hydrate': {
        const principalId = boundedScopeValue(value, 'principal-id', 256);
        const projectId = boundedScopeValue(secondValue, 'project-id', 4096);
        if (!config().memory.remote.enabled && !config().memory.supabaseSecond.enabled && !config().memory.supabaseDirect.enabled) throw new Error('MEMORY_REMOTE_DISABLED');
        const scope: MemoryScope = { principalId, projectId };
        const hydrate = options.memoryHydrate
          ?? ((candidateScope: MemoryScope) => hydrateConfiguredMemoryRemote(config(), candidateScope));
        const result = await hydrate(scope, config().memory.fileNative.vaultRoot);
        stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      case 'audit-verify': {
        const auditRoot = value ? path.resolve(value) : path.join(config().logDir, 'audit');
        const result = await verifyAuditJournal(auditRoot);
        stdout(JSON.stringify(result, null, 2));
        return result.ok ? 0 : 1;
      }
      case 'workflow-classification-recover': {
        if (!value || (secondValue !== undefined && secondValue !== '--apply') || args.length > 3) return usageError(stderr);
        let request: unknown;
        try { request = JSON.parse(await readFile(path.resolve(value), 'utf8')); }
        catch { throw new Error('WORKFLOW_RECOVERY_REQUEST_INVALID'); }
        const result = await recoverWorkflowClassification(config(), request, { apply: secondValue === '--apply' });
        stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      case 'execution-retention-apply': {
        if (!value || !secondValue) return usageError(stderr);
        const result = await applyExecutionRetention({
          planPath: path.resolve(value),
          bundlePath: path.resolve(secondValue),
          stateRoot: config().execution.stateRoot,
          logRoot: config().execution.logRoot,
        });
        stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      default:
        return usageError(stderr);
    }
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function usageError(stderr: (line: string) => void): number {
  stderr(USAGE);
  return 2;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
