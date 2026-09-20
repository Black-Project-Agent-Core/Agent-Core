import type { SemanticSourceEncoding } from './source-io.js';
import type { WorkspaceFreshnessResult } from './freshness.js';

export type SemanticIdeStatus = 'available' | 'degraded' | 'not-configured' | 'error';
export type SemanticProviderAdapterKind = 'typescript' | 'csharp' | 'powershell' | 'python' | 'generic';
export type SemanticProviderReadiness = 'stopped' | 'process-running' | 'initialized' | 'indexing' | 'ready' | 'degraded';
export type SemanticLanguageServerTransport =
  | { kind: 'stdio-owned' }
  | { kind: 'tcp-external'; host: string; port: number; connectTimeoutMs?: number; retryDelayMs?: number };

export interface SemanticProviderVersionProbe {
  command: string;
  args?: string[];
  pattern?: string;
  minVersion?: string;
  maxVersionExclusive?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface SemanticWorkspaceFolder {
  name: string;
  root: string;
}

export interface ProviderCapabilityRequirement {
  capability: string;
  method?: string;
}

export interface SemanticLanguageServerDefinition {
  id: string;
  extensions: string[];
  languageIds: Record<string, string>;
  command?: string;
  args?: string[];
  transport?: SemanticLanguageServerTransport;
  env?: Record<string, string>;
  versionProbe?: SemanticProviderVersionProbe;
  initializationOptions?: Record<string, unknown>;
  adapter?: SemanticProviderAdapterKind;
  priority?: number;
  readinessTimeoutMs?: number;
  requiredCapabilities?: ProviderCapabilityRequirement[];
  optionalCapabilities?: ProviderCapabilityRequirement[];
  ignoredDirectories?: string[];
  encoding?: SemanticSourceEncoding;
}

export interface SemanticIdeConfig {
  enabled: boolean;
  projectRoot: string;
  runtimeDir: string;
  startupTimeoutMs: number;
  callTimeoutMs: number;
  typescriptServerPath: string;
  typescriptTsserverPath?: string;
  serversFile?: string;
  servers?: SemanticLanguageServerDefinition[];
}

export interface SemanticIdeIssue {
  code: string;
  message: string;
  server?: string;
  workspace?: string;
}

export interface SemanticActiveServerHealth {
  id: string;
  root: string;
  pid?: number;
  state: string;
  readiness: SemanticProviderReadiness;
  readinessMessage?: string;
  capabilities?: Record<string, unknown>;
  capabilityIssues?: string[];
  freshness?: WorkspaceFreshnessResult;
}

export interface SemanticIdeHealth {
  status: SemanticIdeStatus;
  enabled: boolean;
  backend: 'lsp';
  workspace: string;
  activeServers: SemanticActiveServerHealth[];
  configuredServers?: Array<{
    id: string;
    adapter: SemanticProviderAdapterKind;
    priority: number;
    extensions: string[];
    command?: string;
    transport: 'stdio-owned' | 'tcp-external';
    observedVersion?: string;
    compatibility?: 'compatible' | 'out-of-range' | 'unknown';
  }>;
  issueCount: number;
  issues?: SemanticIdeIssue[];
}

export interface SemanticWorkspaceInput {
  workspace?: string;
  ref?: string;
  worktreePath?: string;
}

export interface SemanticWorkspaceContext {
  workspace: string;
  root: string;
  folders: SemanticWorkspaceFolder[];
  ref?: string;
  worktreePath?: string;
}

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface SemanticSymbol {
  name: string;
  namePath: string;
  overloadIndex?: number;
  kind: number | string;
  relativePath: string;
  range: LspRange;
  selectionRange?: LspRange;
  detail?: string;
  info?: string;
  members?: SemanticSymbol[];
  language: string;
  provider: string;
  body?: string;
}

export interface TextEdit {
  range: LspRange;
  newText: string;
}

export interface RenameFileOperation {
  kind: 'rename';
  oldUri: string;
  newUri: string;
  options?: {
    overwrite?: boolean;
    ignoreIfExists?: boolean;
  };
}

export interface TextDocumentEditOperation {
  textDocument: { uri: string; version?: number | null };
  edits: TextEdit[];
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: Array<TextDocumentEditOperation | RenameFileOperation | unknown>;
}

export interface RefactorSummary {
  dryRun: boolean;
  changedFiles: number;
  changedEdits: number;
  files: Array<{ relativePath: string; editCount: number; ranges: LspRange[] }>;
  renamedFiles?: Array<{ from: string; to: string }>;
}

export interface SemanticDiagnosticsDeltaFile {
  relativePath: string;
  beforeCount: number;
  afterCount: number;
  introduced: unknown[];
  resolvedCount: number;
  freshness?: string;
}

export interface SemanticDiagnosticsDelta {
  requested: true;
  complete: boolean;
  files: SemanticDiagnosticsDeltaFile[];
  issues?: Array<{ relativePath: string; message: string }>;
}

export interface SemanticMutationResult {
  mutation: RefactorSummary;
  semanticIde: { synced: boolean };
  grafel: { markedDirty: boolean; reindexRequested: boolean; unavailable?: string };
  diagnosticsDelta?: SemanticDiagnosticsDelta;
}

export interface SemanticSymbolQuery {
  workspace?: string;
  ref?: string;
  worktreePath?: string;
  relativePath?: string;
  namePath?: string;
  query?: string;
  depth?: number;
  includeBody?: boolean;
  includeInfo?: boolean;
  maxResults?: number;
  maxAnswerChars?: number;
  language?: string;
  severity?: number;
  hierarchyDirection?: 'supertypes' | 'subtypes' | 'both';
  hierarchyDepth?: number;
  providerId?: 'python' | 'csharp' | 'powershell';
  repair?: boolean;
  confirmation?: string;
}
