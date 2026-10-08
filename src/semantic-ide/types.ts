/** Type-only contracts reconstructed from surviving consumers on 2026-09-22.
 * This is not a byte-for-byte restoration of the lost source. Runtime validation
 * remains in the existing provider, workspace and transaction implementations.
 */
import type { SemanticSourceEncoding } from './source-io.js';

export interface LspPosition { line: number; character: number }
export interface LspRange { start: LspPosition; end: LspPosition }
export interface TextEdit { range: LspRange; newText: string; annotationId?: string }
export interface TextDocumentEditOperation {
  textDocument: { uri: string; version?: number | null };
  edits: TextEdit[];
}
export interface RenameFileOperation {
  kind: 'rename'; oldUri: string; newUri: string;
  options?: { overwrite?: boolean; ignoreIfExists?: boolean };
  annotationId?: string;
}
export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
  // Provider operations are untrusted; planWorkspaceEdit narrows and rejects
  // unsupported resource operations rather than silently accepting them.
  documentChanges?: unknown[];
}
export interface RefactorSummary {
  dryRun: boolean; changedFiles: number; changedEdits: number;
  files: Array<{ relativePath: string; editCount: number; ranges: LspRange[] }>;
  renamedFiles?: Array<{ from: string; to: string }>;
}
export type SemanticLanguageServerTransport =
  | { kind: 'stdio-owned' }
  | { kind: 'tcp-external'; host: string; port: number;
      connectTimeoutMs?: number; retryDelayMs?: number };
export type SemanticProviderReadiness =
  'stopped' | 'process-running' | 'initialized' | 'indexing' | 'ready' | 'degraded';
export interface WorkspaceFreshnessResult {
  state: 'baseline' | 'fresh' | 'degraded';
  scannedFiles: number;
  eventCount: number;
  created: number;
  changed: number;
  deleted: number;
  truncated: boolean;
  durationMs: number;
  reason?: string;
}
export interface SemanticLanguageServerDefinition {
  id: string;
  adapter?: string;
  priority?: number;
  extensions: string[];
  languageIds: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: SemanticLanguageServerTransport;
  initializationOptions?: Record<string, unknown>;
  requiredCapabilities?: Array<{ capability: string; method?: string }>;
  readinessTimeoutMs?: number;
  ignoredDirectories?: string[];
  encoding?: SemanticSourceEncoding;
  versionProbe?: {
    command: string; args?: string[]; env?: Record<string, string>;
    pattern?: string; minVersion?: string; maxVersionExclusive?: string;
    timeoutMs?: number;
  };
}
export interface SemanticIdeConfig {
  enabled: boolean; projectRoot: string; runtimeDir: string;
  startupTimeoutMs: number; callTimeoutMs: number;
  typescriptServerPath: string; typescriptTsserverPath?: string;
  pythonServerPath?: string; csharpServerPath?: string; dotnetPath?: string;
  powershellEditorServicesPath?: string;
  serversFile?: string; servers?: SemanticLanguageServerDefinition[];
}
export interface SemanticIdeIssue {
  code: string; message: string; server?: string; workspace?: string;
}
export interface SemanticWorkspaceInput {
  workspace?: string; ref?: string; worktreePath?: string;
}
export interface SemanticWorkspaceFolder { name: string; root: string }
export interface SemanticWorkspaceContext {
  workspace: string; root: string; folders: SemanticWorkspaceFolder[];
  ref?: string; worktreePath?: string;
}
export interface SemanticSymbol {
  name: string; namePath: string; kind: number | string; relativePath: string;
  range: LspRange; selectionRange?: LspRange; overloadIndex?: number;
  detail?: string; members?: SemanticSymbol[]; language: string;
  provider: string; body?: string; info?: string;
}
export interface SemanticSymbolQuery extends SemanticWorkspaceInput {
  relativePath?: string; namePath?: string; query?: string; language?: string;
  depth?: number; includeBody?: boolean; includeInfo?: boolean;
  maxResults?: number; maxAnswerChars?: number; severity?: number;
  hierarchyDirection?: 'supertypes' | 'subtypes' | 'both'; hierarchyDepth?: number;
  providerId?: 'python' | 'csharp' | 'powershell'; repair?: boolean;
  confirmation?: string;
}
export interface SemanticDiagnosticsDelta {
  requested: true; complete: boolean;
  files: Array<{
    relativePath: string; beforeCount: number; afterCount: number;
    introduced: unknown[]; resolvedCount: number;
    freshness: 'pull' | 'published' | 'typescript-direct' | 'stale';
  }>;
  issues?: Array<{ relativePath: string; message: string }>;
}
export interface SemanticMutationResult {
  mutation: RefactorSummary;
  semanticIde: { synced: boolean };
  grafel: { markedDirty: boolean; reindexRequested: boolean; unavailable?: string };
  diagnosticsDelta?: SemanticDiagnosticsDelta;
}
export interface SemanticIdeHealth {
  status: 'not-configured' | 'available' | 'degraded'; enabled: boolean;
  backend: 'lsp'; workspace: string; issueCount: number; issues?: SemanticIdeIssue[];
  activeServers: Array<{
    id: string; root: string; pid?: number; state: string;
    readiness: SemanticProviderReadiness; readinessMessage?: string;
    capabilities: Record<string, unknown>; capabilityIssues?: string[];
    freshness?: WorkspaceFreshnessResult;
    postInitialize?: {
      status: 'complete' | 'partial';
      complete: boolean;
      truncated: boolean;
      ioIssueCount: number;
      ignoredCount: number;
      solution: string | null;
      projectCount: number;
      projectsOmitted: number;
    };
  }>;
  configuredServers: Array<{
    id: string; adapter: string; priority: number; extensions: string[];
    command?: string; transport: SemanticLanguageServerTransport['kind'];
    observedVersion?: string; compatibility: 'compatible' | 'out-of-range' | 'unknown';
  }>;
}
